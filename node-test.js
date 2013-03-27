#!/bin/env node
// node-test.js (part of Era)
// Copyright 2013 Ross Angle. Released under the MIT License.

process.chdir( __dirname );
var fs = require( "fs" );

function file( filename ) {
    return fs.readFileSync( filename, "UTF-8" );
}
eval( file( "src/era-misc.js" ) );
eval( file( "test/harness-first.js" ) );
eval( file( "src/era-reader.js" ) );
eval( file( "test/test-reader.js" ) );
eval( file( "src/era-modules.js" ) );
eval( file( "test/test-modules.js" ) );
eval( file( "test/harness-last.js" ) );
