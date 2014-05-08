/*!
 ***********************************************************************
webprefm - performance test tool for webservices
Copyright (C) 2014 Morten Anton Bach Sjøgren <m_abs@mabs.dk>

This file is part of webprefm.

webprefm is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 2 of the License, or
(at your option) any later version.

webprefm is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with webprefm.  If not, see <http://www.gnu.org/licenses/>.
***********************************************************************/
/*jshint node: true */

/*global console: false */
( function () {
    'use strict';

    var cluster = require( 'cluster' ),
        debugging = true;

    if ( cluster.isMaster ) {
        var nconf = require( 'nconf' ),
            mysql = require( 'mysql' ),
            sessions = {},
            lastSession,
            connection;

        // Load config
        nconf
            .argv()
            .env()
            .file( 'config.json' );

        nconf.defaults( {
            'dbhostname': '127.0.0.1',
            'dbport': 3306
        } );

        [ 'dbname', 'dbusername', 'dbpassword', 'dbhostname' ].forEach( function ( value ) {
            console.assert( nconf.get( value ), value + ' is missing from the config, either add it to config.json, the environment or the argv' );
        } );

        var workerRequestNewSession = function ( msg ) {
            if ( msg === 'next' ) {
                var currentSessionId,
                    currentSession;
                ( function () {
                    if ( !lastSession ) {
                        currentSessionId = Object.keys( sessions )[ 0 ];
                    } else {
                        var session_ids = Object.keys( sessions ),
                            idx = session_ids.indexOf( lastSession ) + 1;

                        if ( idx >= session_ids.length ) {
                            idx = 0;
                        }

                        currentSessionId = session_ids[ idx ];
                    }
                } )();

                currentSession = sessions[ currentSessionId ];

                if ( this.reruns === undefined ) {
                    this.reruns = 0;
                }

                this.reruns += 1;

                if ( this.reruns < 1100 ) {
                    console.log( 'Master: - Worker: ' + this.id + ' requested new session to work with. Session: ' + Math.floor( this.reruns ) );

                    this.send( currentSession );

                    lastSession = currentSessionId;
                } else {
                    console.log( 'Master: - Worker: ' + this.id + ' requested new session to work with. But it have had too many sessions' );

                    this.kill();
                }
            }
        };

        var workers = ( function () {
            var res = [],
                len = require( 'os' )
                    .cpus()
                    .length,
                i = 0;
            for ( ; i < len; i += 1 ) {
                var worker = cluster.fork();

                worker.on( 'message', workerRequestNewSession );

                res.push( worker );
            }
            return res;
        } )();

        connection = mysql.createConnection( {
            'host': nconf.get( 'dbhostname' ),
            'user': nconf.get( 'dbusername' ),
            'database': nconf.get( 'dbname' ),
            'password': nconf.get( 'dbpassword' ),
            'port': nconf.get( 'dbport' )
        } );

        connection.connect( function ( status ) {
            if ( status ) {
                console.log( status );
                connection.end();
                process.exit( 255 );

                return;
            }

            connection.query( 'SELECT * FROM owa_domstream JOIN owa_document ON owa_document.id = owa_domstream.document_id JOIN owa_site ON owa_site.site_id = owa_domstream.site_id JOIN owa_ua ON owa_ua.id = owa_domstream.ua_id ORDER BY owa_domstream.timestamp', function ( err, rows ) {

                if ( !err ) {
                    rows.forEach( function ( row ) {
                        var session = row.session_id;
                        if ( !sessions[ session ] ) {
                            sessions[ session ] = {
                                'session': session,
                                'user_agent': row.ua,
                                'pages': []
                            };
                        }

                        sessions[ session ].pages.push( {
                            'page_url': row.page_url,
                            'uri': row.uri,
                            'domain': row.domain,
                            'timestamp': row.timestamp,
                            'date': new Date( row.timestamp * 1000 )
                        } );
                    } );

                    workers.forEach( function ( worker ) {
                        worker.send( 'ready' );
                    } );
                } else {
                    console.log( err );
                }

                connection.end();
            } );
        } );
    } else if ( cluster.isWorker ) {
        var worker = cluster.worker,
            SessionRunner = require( './sessionrunner' )
                .SessionRunner,
            runners = ( function () {
                var numRunners = 100,
                    res = [],
                    i = 0;

                for ( ; i < numRunners; i += 1 ) {
                    res.push( new SessionRunner( i ) );
                }

                return res;
            } )(),
            runnerFilterAvailable = function ( runner ) {
                return runner.available();
            },
            runCrawler = function ( pages ) {
                var availableRunners = runners.filter( runnerFilterAvailable ),
                    runner = availableRunners[ Math.floor( Math.random() * availableRunners.length ) ];

                if ( runner ) {
                    runner.runSession( pages );
                }
            };

        process.on( 'message', function ( msg ) {
            if ( msg === 'ready' ) {
                for ( var i = 0; i < 100; i += 1 ) {
                    process.send( 'next' );
                }
            } else {
                var pages = [],
                    last_timestamp = msg.pages[ 0 ].timestamp;

                msg.pages.forEach( function ( page, idx ) {
                    var delay = page.timestamp - last_timestamp;
                    if ( !delay || delay < 0 ) {
                        delay = 0;
                    }

                    if ( delay > 3600 ) {
                        delay = 3600;
                    }

                    var data = {
                        'delay': delay,
                        'url': page.page_url
                    };

                    pages.push( data );

                    last_timestamp = page.timestamp;
                } );

                console.log( 'Worker: ' + worker.id + ' got new session to work on. Queue size: ' + pages.length );

                runCrawler( pages );
            }
        } );
    }
} )();
