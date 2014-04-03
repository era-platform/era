#!/bin/env node
// build-era.js
// Copyright 2013, 2014 Ross Angle. Released under the MIT License.
"use strict";

process.chdir( __dirname );
var fs = require( "fs" );
var argparse = require( "argparse" );
//var uglify = require( "uglify-js" );


if ( require.main === module ) {


var argParser = new argparse.ArgumentParser( {
    version: "0.0.1",
    addHelp: true,
    description: "Websites maintained by Ross Angle (rocketnia)."
} );
argParser.addArgument( [ "-t", "--test" ], {
    action: "storeTrue",
    help: "Run unit tests."
} );
var args = argParser.parseArgs();

var didSomething = false;

if ( args.test ) {
    didSomething = true;
    Function( [
        "src/era-misc.js",
        "test/harness-first.js",
        "test/test-bigint.js",
        "src/era-reader.js",
        "test/test-reader.js",
        "src/era-modules.js",
        "test/test-modules.js",
        "test/harness-last.js"
    ].map( function ( filename ) {
        return fs.readFileSync( filename, "UTF-8" );
    } ).join( "\n\n\n" ) )();
}

if ( !didSomething )
    argParser.printHelp();


}
