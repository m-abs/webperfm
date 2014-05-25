/*jshint node: true */

( function( exports ) {
    'use strict';

    var _ = require( 'underscore' ),
        cheerio = require( 'cheerio' );

    function Crawler( _settings ) {
        var settings = _.extend( {
            'urls' : []
        }, _settings );

        this.protocol = {
            'http' : require( 'http' ),
            'https' : require( 'https' )
        };

        this.reset();

        if ( settings.urls ) {
            this.queue( settings.urls );
        }

        if ( typeof settings.callback === 'function' ) {
            this.callback = settings.callback;
        }
    }

    Crawler.prototype.concurrent = 4;

    Crawler.prototype.protocol = {};
    Crawler.prototype.cache = {
        'urls' : {},
        'etags' : {}
    };

    Crawler.prototype.callback = function( ) {
        // Override this
    };

    Crawler.prototype.queued = [];

    Crawler.prototype.queue = function( urls ) {
        var that = this;
        if ( _.isArray( urls ) ) {
            urls.forEach( function( url ) {
                that.queued.push( url );
            } );
        } else if ( _.isString( urls ) ) {
            that.queued.push( urls );
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

    Crawler.prototype.afterRequest = function( error, result, body ) {
        var $body;

        result.body = '' + ( body || '' );

        if ( result.headers[ 'content-type' ].match( /text\/html|application\/xhtml\+xml/ ) ) {
            $body = cheerio.load( body || '' );
        }

        this.callback( error, result, $body );

        this.next();
    };

    Crawler.prototype.next = function( ) {
        var url = this.queued.pop( );
        if ( url ) {
            this.makeRequest( url );
        }
    };

    Crawler.prototype.makeRequest = function( url ) {
        var uriData = url.match( /^(http[s]?):\/\/([^/]+)(\/.+)?/ ),
            that = this;
        if ( uriData ) {
            var protocol = uriData[1],
                hostname = uriData[2],
                path = uriData[3] || '/',
                port = ( function( hostname ) {
                    var hostnameData = hostname.match( /([^:]+)([:]\d+)?/ ),
                        port = 80;

                    if ( hostnameData[2] ) {
                        port = hostnameData[2];
                    } else if ( protocol === 'http' ) {
                        port = 80;
                    } else {
                        port = 443;
                    }

                    return port;
                } )( hostname ),
                urlData = that.cache.urls[ url ],
                curTimestamp = (new Date( ))/1.0,
                req,
                start = Date.now( ),
                result = {
                    'start' : start,
                    'uri': url,
                    'request': {
                        'uri' : {
                            'protocol': protocol,
                            'host': hostname,
                            'port': port,
                            'path': path,
                            'url': url
                        }
                    },
                    'header': {}
                },
                reqHeaders = {};
            if ( urlData ) {
                if ( that.useCache ) {
                    if ( urlData.expires !== undefined && urlData.expires < curTimestamp ) { // Doesn't handle must-revalidate
                        urlData.hits += 1;
                        urlData.cached += 1;
                        result.headers.statusCode = 304;
                        result.end = Date.now( );
                        result.duration = result.end - start;
                        this.afterRequest( false, result, urlData.body );
                        return;
                    }

                    if ( urlData.expires_str !== undefined ) {
                       reqHeaders[ 'If-Modified-Since' ] = urlData.expires_str;
                    }

                    if ( urlData.etag !== undefined ) {
                        reqHeaders[ 'If-None-Match' ] = urlData.etag;
                    }
                }
            } else {
                urlData = {
                    'url' : url,
                    'hits' : 0,
                    'cached' : 0,
                    'errors' : 0,
                    'body' : '',
                    'cache-control' : null,
                    'content-length' : null
                };
                that.cache.urls[ url ] = urlData;
            }

            var reqOptions = {
                'hostname' : hostname,
                'port' : port,
                'path' : path,
                'method' : 'GET',
                'headers' : reqHeaders
            };

            req = that.protocol[ protocol ].request( reqOptions , function( res ) {
                result.headers = _.extend( {}, res.headers );
                result.end = Date.now( );
                result.duration = result.end - start;

                var cacheControl = res.headers[ 'cache-control' ] || '';

                urlData.hits += 1;
                if ( res.statusCode === 304 ) {
                    urlData.cached += 1;

                    that.afterRequest( false, result, urlData.body );
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
                            that.cache.etags[ res.headers.etag ] = urlData;
                        } else {
                            urlData.etag = undefined;
                        }
                    }

                    that.afterRequest( false, result, urlData.body );
                } );
            } );

            req.on( 'error', function( e ) {
                urlData.errors += 1;
            } );
            req.end( );
        } else {
            this.next( );
        }
    };

    exports.Crawler = Crawler;
} )( exports );
