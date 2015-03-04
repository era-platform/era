#!/bin/env node
// build-era.js
// Copyright 2013-2015 Ross Angle. Released under the MIT License.
"use strict";

var fs = require( "fs" );

var argparse = require( "argparse" );
var uglify = require( "uglify-js" );

var ltf = require( "./buildlib/lathe-fs" );


function readFile( filename ) {
    return fs.readFileSync( filename, "UTF-8" );
}
function readFiles( filenames ) {
    return filenames.map( function ( filename ) {
        return readFile( filename );
    } ).join( "\n\n\n" );
}



if ( require.main === module ) {


process.chdir( __dirname );

var argParser = new argparse.ArgumentParser( {
    version: "0.0.1",
    addHelp: true,
    description: "Websites maintained by Ross Angle (rocketnia)."
} );
argParser.addArgument( [ "-t", "--test" ], {
    action: "storeTrue",
    help: "Run unit tests of the module system."
} );
argParser.addArgument( [ "-b", "--build" ], {
    action: "storeTrue",
    help: "Compile dependencies of demos/penknife-compiled.html."
} );
argParser.addArgument( [ "-m", "--minify" ], {
    action: "storeTrue",
    help: "Minify any compiled files."
} );
argParser.addArgument( [ "-s", "--staccato" ], {
    action: "storeTrue",
    help: "Test Staccato, an IR lisp."
} );
var args = argParser.parseArgs();

var tasks = [];


if ( args.test ) tasks.push( function ( then ) {
    Function( readFiles( [
        "src/era-misc-strmap-avl.js",
        "src/era-misc.js",
        "test/harness-first.js",
        "test/test-bigint.js",
        "src/era-reader.js",
        "test/test-reader.js",
        "src/era-modules.js",
        "test/test-modules.js",
        "test/harness-last.js"
    ] ) )();
} );

if ( args.staccato ) tasks.push( function ( then ) {
    Function( readFiles( [
        "src/era-misc-strmap-avl.js",
        "src/era-misc.js",
        "src/era-staccato.js",
        "src/era-staccato-builders.js",
        "src/era-staccato-lib.js"
    ] ) )();
} );


if ( args.build ) tasks.push( function ( then ) {
    
    var $pk = Function(
        readFiles( [
            "src/era-misc-strmap-avl.js",
            "src/era-misc.js",
            "src/era-reader.js",
            "src/era-avl.js",
            "src/era-penknife.js",
            "src/era-penknife-to-js.js"
        ] ) + "\n" +
        "\n" +
        "\n" +
        "return { pkNil: pkNil, pkRet: pkRet,\n" +
        "    makePkRuntime: makePkRuntime,\n" +
        "    compileAndDefineFromString:\n" +
        "        compileAndDefineFromString,\n" +
        "    runSyncYoke: runSyncYoke };\n"
    )();
    
    
    var pkRuntime = $pk.makePkRuntime();
    var yoke = pkRuntime.conveniences_syncYoke();
    
    var maybeYokeAndResult = $pk.compileAndDefineFromString( yoke,
        readFile( "demos/penknife-compiled-src.pk" ),
        function ( yoke, displays ) {
    
    var displayStrings = [];
    var jsFuncCodeStrings = [];
    var hasError = false;
    for ( var i = 0, n = displays.length; i < n; i++ ) {
        var display = displays[ i ];
        if ( display.type === "error" ) {
            displayStrings.push( display.intro + ": " + display.msg );
            hasError = true;
        } else if ( display.type === "success" ) {
            jsFuncCodeStrings.push( display.jsFuncCode );
        } else {
            throw new Error();
        }
    }
    // TODO: Come up with a better top-level interface than a single
    // constant variable name.
    if ( hasError ) {
        console.log( displayStrings.join( "\n" ) );
    } else {
        var fileCode =
            "var myFile = [\n" +
            "\n" +
            "\n" +
            jsFuncCodeStrings.join( ",\n\n\n" ) + "\n" +
            "\n" +
            "\n" +
            "];";
        
        if ( args.minify )
            fileCode = uglify.minify( fileCode, {
                fromString: true,
                compress: {
                    sequences: true,
                    properties: true,
                    dead_code: true,
                    drop_debugger: false,
                    
                    unsafe: true,
                    
                    conditionals: true,
                    comparisons: true,
                    evaluate: true,
                    booleans: true,
                    loops: true,
                    unused: true,
                    hoist_funs: false,
                    hoist_vars: false,
                    if_return: true,
                    join_vars: true,
                    cascade: true,
                    warnings: false,
                    negate_iife: true,
                    pure_getters: true,
                    pure_funcs: [
                        // TODO: See if there's a more convenient way
                        // to manage all these variables.
                        "Pk",
                        "pkCons",
                        "pkList",
                        "pkInd",
                        "pkStrNameRaw",
                        "pkQualifiedName",
                        "pkYep",
                        "pkPairName",
                        "pkStrUnsafe",
                        "pkErr",
                        "pkRet",
                        "runRet",
                        "pkfnLinear"
                    ],
                    drop_console: false
                }
            } ).code;
        
        ltf.writeTextFile(
            "fin/penknife-compiled.js", "utf-8", fileCode,
            function ( e ) {
            
            if ( e ) return void then( e );
            
            console.log( "Built fin/penknife-compiled.js." );
            then();
        } );
    }
    
    return $pk.pkRet( yoke, $pk.pkNil );
    
    } );
    
    $pk.runSyncYoke( maybeYokeAndResult );
} );


if ( tasks.length === 0 ) {
    argParser.printHelp();
} else {
    var runTasksFrom = function ( i ) {
        if ( !(i < tasks.length) )
            return;
        var task = tasks[ i ];
        task( function ( e ) {
            if ( e ) throw e;
            
            runTasksFrom( i + 1 );
        } );
    };
    runTasksFrom( 0 );
}


}
