#!/bin/env node
// build-era.js
// Copyright 2013, 2014 Ross Angle. Released under the MIT License.
"use strict";

process.chdir( __dirname );
var fs = require( "fs" );

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
