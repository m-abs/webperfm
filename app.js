/*jshint node: true */
( function( ) {
	'use strict';

	var nconf = require( 'nconf' ),
		config = nconf.file( 'config.json' );

	console.log( config );
} )();
