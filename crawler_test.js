/*jshint node: true */

/*global console: false */
( function( ) {
	'use strict';

	var Crawler = require( 'crawler' ).Crawler,
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
				console.log( url, 'already loaded' );
				return;
			}

			// console.log( url );
			c.queue( url );

			doneUrls[ url ] = true;
		},
		start = new Date( );

	c = new Crawler( {
		'skipDuplicates' : true,
		'cache': true,
		'maxConnections' : 100,
		'callback' : function( error, result, $ ) {
			var cur_time = new Date( );
			console.log( result.uri, cur_time - start );
			if ( $ ) {
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
				console.log( result.uri, 'is a js-file' );
			} else if ( result.headers && /image\/[a-z]+/.test( result.headers[ 'content-type' ] || "" ) ) {
				console.log( result.uri, 'is a image-file' );
			} else {
				console.log( result.uri );
			}
		}
	} );

	queue( 'http://mabs.dk', true );

	setTimeout( function( ) {
		queue( 'http://mabs.dk/cv', true );

		setTimeout( function( ) {
			queue( 'http://mabs.dk/2013/09/21/sushi-ris-med-blomkal', true );

			setTimeout( function( ) {
				queue( 'http://mabs.dk/category/artikler-pa-dansk', true );

				setTimeout( function( ) {
					queue( 'http://mabs.dk/2013/09/21/sushi-ris-med-blomkal', true );
				}, 1000 );
			}, 1000 );
		}, 1000 );
	}, 2000 );
} )( );
