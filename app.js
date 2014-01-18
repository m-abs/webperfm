/*jshint node: true */

/*global console: false */
( function( ) {
	'use strict';

	var cluster = require( 'cluster' );

	if ( cluster.isMaster ) {
		var
			nconf = require( 'nconf' ),
			mysql = require( 'mysql' ),
			sessions = {},
			lastSession,
			connection;
	
		// Load config
		nconf
			.argv( )
			.env( )
			.file( 'config.json' );
	
		nconf.defaults( {
			'host' : '127.0.0.1',
			'port' : 3306
		} );
	
		var required_config = [ 'dbname', 'dbusername', 'dbpassword', 'dbhostname' ];
		required_config.forEach( function( value ) {
			console.assert( nconf.get( value ), value + ' is missing from the config, either add it to config.json, the environment or the argv' );
		} );

		var workerRequestNewSession = function( msg ) {
			if ( msg === 'next' ) {
				console.log( this.id, 'requested new session to work with' );
				var currentSessionId,
						currentSession;
				if ( !lastSession ) {
					currentSessionId = Object.keys( sessions )[0];
				} else {
					var session_ids = Object.keys( sessions ),
						idx = session_ids.indexOf( lastSession ) + 1;

					if ( idx >= session_ids.length ) {
						idx = 0;
					}

					currentSessionId = session_ids[ idx ];
				}

				currentSession = sessions[ currentSessionId ];

				if ( currentSession.reruns === undefined ) {
					currentSession.reruns = 0;
				}

				currentSession.reruns += 1;

				this.send( currentSession );

				lastSession = currentSessionId;
				console.log( currentSessionId );
			}
		};

		var workers = ( function( ) {
				var res = [],
					len = require( 'os' ).cpus( ).length * 10;

				for ( var i = 0; i < len; i += 1 ) {
					var worker = cluster.fork( );

					worker.on( 'message', workerRequestNewSession );

					res.push( worker );
				}

				return res;
			} )( );
	
		connection = mysql.createConnection( {
			'host'     : nconf.get( 'dbhostname' ),
			'user'     : nconf.get( 'dbusername' ),
			'database' : nconf.get( 'dbname'     ),
			'password' : nconf.get( 'dbpassword' ),
			'port'     : nconf.get( 'dbport'     )
		} );
	
		connection.connect( function( ) {
			connection.query( 'SELECT * FROM owa_domstream JOIN owa_document ON owa_document.id = owa_domstream.document_id JOIN owa_site ON owa_site.site_id = owa_domstream.site_id JOIN owa_ua ON owa_ua.id = owa_domstream.ua_id ORDER BY owa_domstream.timestamp', function( err, rows ) {
	
				if ( !err ) {
					rows.forEach( function( row ) {
						var session = row.session_id;
						if ( !sessions[ session ] ) {
							sessions[ session ] = {
								'session' : session,
								'user_agent' : row.ua,
								'pages' : []
							};
						}
	
						sessions[ session ].pages.push( {
							'page_url' : row.page_url,
							'uri' : row.uri,
							'domain' : row.domain,
							'timestamp' : row.timestamp,
							'date' : new Date( row.timestamp * 1000 )
						} );
					} );

					workers.forEach( function( worker ) {
						console.log( arguments[1] );
						worker.send( 'ready' );
					} );
				} else {
					console.log( err );
				}
	
				connection.end( );
			} );
		} );
	} else if ( cluster.isWorker ) {
		var Crawler = require( 'crawler' ).Crawler,
			worker = cluster.worker,
			c,
			doneUrls = {},
			queue = function( url, allow_duplicates ) {
				if ( !url ) {
					return;
				}

				if ( url.substr( 0, 2 ) === '//' ) {
					url = 'http:' + url;
				}

				if ( doneUrls[ url ] && !allow_duplicates ) {
					// console.log( url, 'already loaded' );
					return;
				}

				// console.log( url );
				c.queue( url );

				doneUrls[ url ] = true;
			},
			queued = 0,
			start = new Date( );

		c = new Crawler( {
			'cache': true,
			'maxConnections' : 100,
			'callback' : function( error, result, $ ) {
				var cur_time = new Date( );
				// console.log( result.uri, cur_time - start );
				if ( error ) {
					console.log( worker.id, 'error', error, result );
				} else if ( $ ) {
					$( 'script[src]' ).each( function( index, el ) {
						var $el = $( el ),
							src = $el.attr( 'src' );
						if ( src ) {
							queue( $el.attr( 'src' ) );
						}
					} );

					$( 'link[href]' ).each( function( index, el ) {
						var $el = $( el ),
							type = $el.attr( 'type' ),
							media = $el.attr( 'media' ),
							rel = $el.attr( 'rel' );

						if ( type === 'text/css' ) {
							if ( !media || media === 'all' || media === 'screen' ) {
								queue( $el.attr( 'href' ) );
							}
						}
					} );

					$( 'img[src]' ).each( function( index, el ) {
						var $el = $( el ),
							src = $el.attr( 'src' );

						if ( src ) {
							queue( $el.attr( 'src' ) );
						}
					} );

					if ( queued === 0 ) {
						process.send( 'next' );
					}
				} else if ( ( ( result.headers && result.headers[ 'content-type' ] === 'text/css' ) ||  ( /\.css/ ).test( result.uri ) ) && result.body ) {
					var body = result.body,
						oldLength;

					while ( oldLength !== body.length ) {
						if ( !body ) {
							break;
						}
						oldLength = body.length;

						var idx = body.indexOf( '/*' );
						if ( idx !== -1 ) {
							var idx2 = body.indexOf( '*/', idx );
							if ( idx2 !== -1 ) {
								body = body.substr( 0, idx ) + body.substr( idx2 + 1 );
							} else {
								break;
							}
						} else {
							break;
						}
					}

					var matches = body.match( /url\(['"]?[^)'"]+['"]?\)/g );
					if ( matches ) {
						var relative_url = result.uri.replace( /\/[^\/]+$/, '' ) + '/',
							base_url = result.request.uri.protocol + '//' + result.request.uri.host + ( result.request.uri.port != 80 ? ':' + result.request.uri.port : '' ) + '/';

						matches.forEach( function( url ) {
							url = url.substr( 4, url.length - 1 - 4 );
							if ( /^['"]/.test( url ) ) {
								url = url.substr( 1 );
							}
							if ( /['"]$/.test( url ) ) {
								url = url.substr( 0, url.length - 1 );
							}

							if ( url.substr( 0, 2 ) === '//' ) {
								url = result.request.uri.protocol + url;
							} else if ( url.substr( 0, 1 ) === '/' ) {
								url = base_url + url;
							} else if ( url.substr( 0, 4 ) !== 'http' ) {
								url = relative_url + url;
							}

							queue( url );
						} );
					}
				} else if ( result.headers && ( result.headers[ 'content-type' ] === 'application/javascript' || result.headers[ 'content-type' ] === 'application/x-javascript' ) ) {
					// console.log( worker.id, result.uri, 'is a js-file' );
				} else if ( result.headers && /image\/[a-z]+/.test( result.headers[ 'content-type' ] || '' ) ) {
					// console.log( worker.id, result.uri, 'is a image-file' );
				} else {
					// console.log( worker.id, result.uri );
				}
			}
		} );

		process.on( 'message', function( msg ) {
			if ( msg === 'ready' ) {
				process.send( 'next' );
			} else {
				console.log( worker.id, 'got new session to work on' );
				doneUrls = {};
				var pages = msg.pages,
					last_timestamp = pages[0].timestamp;

				queued += pages.length;

				pages.forEach( function( page ) {
					var delay = page.timestamp - last_timestamp;
					if ( !delay || delay < 0 ) {
						delay = 0;
					}

					if ( delay > 3600000 ) {
						delay = 3600000;
					}

					setTimeout( function( ) {
						queued -= 1;

						console.log( worker.id, {
							'queue' : page.page_url,
							'left' : queued,
							'delay' : delay
						} );
						queue( page.page_url );
					}, delay * 1000 );
				} );

				console.log( worker.id, 'queued: ' + queued );
			}
		} );
	}
} )();
