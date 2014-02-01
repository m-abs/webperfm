/*jshint node: true */
( function () {
    'use strict';

    var util = require( "util" ),
        events = require( "events" ),
        cluster = require( 'cluster' ),
        nodeCrawler = require( 'crawler' )
            .Crawler;

    function Crawler() {
        var that = this,
            worker = cluster.worker;


        that.c = new Crawler( {
            'cache': true,
            'maxConnections': 100,
            'callback': function ( error, result, $ ) {
                var cur_time = new Date();
                if ( result ) {
                    delete that.queued[ result.uri ];
                }

                if ( error ) {
                    console.log( worker.id, 'error', error, result );
                } else if ( $ ) {
                    $( 'script[src]' )
                        .each( function ( index, el ) {
                            var $el = $( el ),
                                src = $el.attr( 'src' );
                            if ( src ) {
                                that.queue( $el.attr( 'src' ) );
                            }
                        } );

                    $( 'link[href]' )
                        .each( function ( index, el ) {
                            var $el = $( el ),
                                type = $el.attr( 'type' ),
                                media = $el.attr( 'media' ),
                                rel = $el.attr( 'rel' );

                            if ( type === 'text/css' ) {
                                if ( !media || media === 'all' || media === 'screen' ) {
                                    that.queue( $el.attr( 'href' ) );
                                }
                            } else if ( [ 'icon', 'apple-touch-icon' ].indexOf( rel ) !== -1 ) {
                                that.queue( $el.attr( 'href' ) );
                            }
                        } );

                    $( 'img[src]' )
                        .each( function ( index, el ) {
                            var $el = $( el ),
                                src = $el.attr( 'src' );

                            if ( src ) {
                                this.queue( $el.attr( 'src' ) );
                            }
                        } );
                } else if ( ( ( result.headers && result.headers[ 'content-type' ] === 'text/css' ) || ( /\.css/ )
                    .test( result.uri ) ) && result.body ) {
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

                        matches.forEach( function ( url ) {
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

                            that.queue( url );
                        } );
                    }
                } else if ( result.headers && ( result.headers[ 'content-type' ] === 'application/javascript' || result.headers[ 'content-type' ] === 'application/x-javascript' ) ) {
                    // console.log( worker.id, result.uri, 'is a js-file' );
                } else if ( result.headers && /image\/[a-z]+/.test( result.headers[ 'content-type' ] || '' ) ) {
                    // console.log( worker.id, result.uri, 'is a image-file' );
                } else {
                    // console.log( worker.id, result.uri );
                }

                if ( Object.keys( that.queued )
                    .length === 0 ) {
                    that.loadNext();
                }
            }
        } );
        that.loadNext();
    }

    util.inherits( Crawler, events.EventEmitter );

    Crawler.prototype.c = false;
    Crawler.prototype.pages = [];
    Crawler.prototype.doneUrls = {};
    Crawler.prototype.queued = {};
    Crawler.prototype.start = null;

    Crawler.prototype.loadNext = function () {
        var that = this,
            page = that.pages.shift();

        if ( !page ) {
            that.emit( 'next' );
        } else {
            setTimeout( function () {
                this.queue( page.url, true );
            }, page.delay * 1000 );
        }
    };

    Crawler.prototype.queue = function ( url, allow_duplicates ) {
        var that = this;
        if ( !url ) {
            return;
        }

        if ( url.substr( 0, 2 ) === '//' ) {
            url = 'http:' + url;
        }

        if ( that.doneUrls[ url ] && !allow_duplicates ) {
            // console.log( url, 'already loaded' );
            return;
        }

        // console.log( url );
        this.c.queue( url );

        this.doneUrls[ url ] = true;
        this.queued[ url ] = true;
    };
} )();
