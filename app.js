/*jshint node: true */

/*global console: false */
( function( ) {
	'use strict';

	var fs = require( 'fs' ),
		nconf = require( 'nconf' ),
		mysql = require( 'mysql' ),
		util = require( 'util' ),
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

	connection = mysql.createConnection( {
		'host'     : nconf.get( 'dbhostname' ),
		'user'     : nconf.get( 'dbusername' ),
		'database' : nconf.get( 'dbname'     ),
		'password' : nconf.get( 'dbpassword' ),
		'port'     : nconf.get( 'dbport'     )
	} );

	connection.connect( function( ) {
		connection.query( 'SELECT * FROM owa_domstream JOIN owa_document ON owa_document.id = owa_domstream.document_id JOIN owa_site ON owa_site.site_id = owa_domstream.site_id JOIN owa_ua ON owa_ua.id = owa_domstream.ua_id ORDER BY owa_domstream.timestamp', function( err, rows ) {
			var sessions = {};

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

				console.log( util.inspect( sessions, {
					'depth': null
				} ) );
			} else {
				console.log( err );
			}

			connection.end( );
		} );
	} );
} )();
