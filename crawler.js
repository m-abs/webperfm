/*jshint node: true */

( function( exports ) {
    'use strict';

    var _ = require( 'underscore' ),
        cheerio = require( 'cheerio' );

    function Crawler( urls ) {
        this.protocol = {
            'http' : require( 'http' ),
            'https' : require( 'https' )
        };

        this.reset();

        if ( urls ) {
            this.queue( urls );
        }
    }

    Crawler.prototype.concurrent = 4;

    Crawler.prototype.protocol = {};
    Crawler.prototype.cache = {
        'urls' : {},
        'etags' : {}
    };

    Crawler.prototype.queued = [];

    Crawler.prototype.queue = function( urls ) {
        if ( _.isArray( urls ) ) {
            urls.forEach( function( url ) {
                this.queued.push( url );
            } );
        } else if ( _.isString( urls ) ) {
            this.queued.push( urls );
        } else {
            throw new Exception( 'url is incorrect type' );
        }
    };

    Crawler.prototype.reset = function( ) {
        this.cache = {
            'urls' : {},
            'etags' : {}
        };

        this.queued = [];
    };

    Crawler.prototype.afterRequest = function( body, headers, statusCode ) {

    };

    Crawler.prototype.makeRequest = function( url ) {
        var uriData = url.match( /^(http[s]?):\/\/([^/]+)(\/.+)?/ ),
            that = this;
        if ( uriData ) {
            var protocol = uriData[0],
                hostname = uriData[1],
                path = uriData[2] || '/',
                port = ( function( hostname ) {
                    var hostnameData = hostname.match( /([^:]+)([:]\d+)?/ ),
                        port = 80;

                    if ( hostnameData[1] ) {
                        port = hostnameData[1];
                    } else if ( prototol === 'http' ) {
                        port = 80;
                    } else {
                        port = 443;
                    }

                    return port;
                } )( hostname ),
                urlData = that.cache[ url ],
                curTimestamp = (new Date( ))/1.0,
                req,
                headers = {};
            if ( urlData ) {
                if ( that.useCache ) {
                    if ( urlData.expires !== undefined && urlData.expires < curTimestamp ) { // Doesn't handle must-revalidate
                        urlData.hits += 1;
                        urlData.cached += 1;
                        callback.call( undefined, urlData.body, {}, 200 );
                        return;
                    }

                    if ( urlData.expires_str !== undefined ) {
                        headers[ 'If-Modified-Since' ] = urlData.expires_str;
                    }

                    if ( urlData.etag !== undefined ) {
                        headers[ 'If-None-Match' ] = urlData.etag;
                    }
                }
            } else {
                urls[ url ] = urlData = {
                    'url' : url,
                    'hits' : 0,
                    'cached' : 0,
                    'errors' : 0,
                    'body' : '',
                    'cache-control' : null,
                    'content-length' : null
                };
            }

            req = that.protocol[ protocol ].request( {
                'hostname' : hostname,
                'port' : port,
                'path' : path,
                'method' : 'GET',
                'headers' : headers
            }, function( res ) {
                var cacheControl = res.headers[ 'cache-control' ];

                urlData.hits += 1;
                if ( res.statusCode === 304 ) {
                    urlData.cached += 1;

                    that.afterRequest( urlData.body, res.headers, res.statusCode );
                    return;
                }

                var body = '';
                res.on( 'data', function( chunk ) {
                    body += chunk;
                } );

                res.on( 'end', function( ) {
                    urlData.body = body;
                    if ( cacheControl.match( /no-cache|no-store/ ) ) {
                        urlData.expire = undefined;
                        urlData.expires_str = undefined;
                        urlData.etag = undefined;
                    } else {
                        if ( res.headers.expires ) {
                            urlData.expires_str = res.headers.expires;
                            urlData.expires = Date.parse( urlData.expires_str );
                        }

                        urlData[ 'content-length' ] = body.length;
                        urlData[ 'cache-control' ] = cacheControl;
                        if ( res.headers.etag ) {
                            urlData.etag = res.headers.etag;
                            etags[ res.headers.etag ] = urlData;
                        } else {
                            urlData.etag = undefined;
                        }
                    }

                    that.afterRequest( urlData.body, res.headers, res.statusCode );
                } );
            } );

            req.on( 'error', function( e ) {
                urlData.errors += 1;
            });
            req.end();
        } else {
            this.next( );
        }
    };

    exports.Crawler = Crawler;
} )( exports );
