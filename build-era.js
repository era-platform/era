#!/bin/env node
// build-era.js
// Copyright 2013-2015 Ross Angle. Released under the MIT License.
"use strict";

var fs = require( "fs" );

var argparse = require( "argparse" );
var uglify = require( "uglify-js" );

var _ = require( "./buildlib/lathe" );
var ltf = require( "./buildlib/lathe-fs" );


function readFile( filename ) {
    return fs.readFileSync( filename, "UTF-8" );
}
function readFiles( filenames ) {
    return filenames.map( function ( filename ) {
        return readFile( filename );
    } ).join( "\n\n\n" );
}

function arrEachAsyncNodeExn( arr, asyncFunc, then ) {
    loop( 0 );
    function loop( i ) {
        if ( arr.length <= i )
            return void then();
        return asyncFunc( i, arr[ i ], function ( e ) {
            if ( e ) return void then( e );
            loop( i + 1 );
        } );
    }
}



if ( require.main === module ) {


process.chdir( __dirname );

var argParser = new argparse.ArgumentParser( {
    version: "0.0.1",
    addHelp: true,
    description: "The Era programming systems."
} );
argParser.addArgument( [ "-p", "--build-penknife" ], {
    action: "storeTrue",
    help:
        "Penknife, a Lisp dialect: Compile dependencies of " +
        "demos/penknife-compiled.html."
} );
argParser.addArgument( [ "-s", "--build-staccato" ], {
    action: "storeTrue",
    help:
        "Staccato: Compile dependencies of " +
        "demos/staccato-runner.html and " +
        "demos/staccato-runner-mini.html."
} );
argParser.addArgument( [ "-m", "--minify" ], {
    action: "storeTrue",
    help:
        "When compiling the Penknife demo, minify the compiled " +
        "JavaScript code."
} );
argParser.addArgument( [ "-E", "--test-era" ], {
    action: "storeTrue",
    help: "Era reader and Era module system: Run unit tests."
} );
argParser.addArgument( [ "-R", "--test-raw-staccato" ], {
    action: "storeTrue",
    help:
        "Raw Staccato, a sugar for constant time steps: Run a demo."
} );
argParser.addArgument( [ "-S", "--test-mini-staccato" ], {
    action: "storeTrue",
    help:
        "Mini Staccato, a subset of a macro-capable Staccato: Run " +
        "a demo."
} );
var args = argParser.parseArgs();

var tasks = [];


if ( args.test_era ) tasks.push( function ( then ) {
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
    
    process.nextTick( function () {
        then();
    } );
} );

if ( args.test_raw_staccato ) tasks.push( function ( then ) {
    Function( readFiles( [
        "src/era-misc-strmap-avl.js",
        "src/era-misc.js",
        "src/era-staccato.js",
        "src/era-staccato-builders.js",
        "src/era-staccato-lib.js"
    ] ) )();
    
    process.nextTick( function () {
        then();
    } );
} );


if ( args.build_penknife ) tasks.push( function ( then ) {
    
    var $pk = Function(
        readFiles( [
            "src/era-misc-strmap-avl.js",
            "src/era-misc.js",
            "src/era-reader.js",
            "src/era-penknife.js",
            "src/era-penknife-to-js.js"
        ] ) + "\n" +
        "\n" +
        "\n" +
        "return { runSyncYoke: runSyncYoke,\n" +
        "    makePkRuntime: makePkRuntime,\n" +
        "    pk: pk,\n" +
        "    compileAndDefineFromString:\n" +
        "        compileAndDefineFromString };\n"
    )();
    
    var displays = $pk.runSyncYoke( {
        pkRuntime: $pk.makePkRuntime(),
        pkRider: $pk.pk( "pure-yoke" )
    }, function ( yoke, then ) {
        return $pk.compileAndDefineFromString( yoke,
            readFile( "demos/penknife-compiled-src.pk" ),
            then );
    } ).result;
    
    var displayStrings = [];
    var jsFuncCodeStrings = [];
    var hasError = false;
    for ( var i = 0, n = displays.length; i < n; i++ ) {
        var display = displays[ i ];
        if ( display.type === "success" ) {
            jsFuncCodeStrings.push( display.jsFuncCode );
        } else if ( display.type === "error" ) {
            displayStrings.push( display.intro + ": " + display.msg );
            hasError = true;
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
} );

if ( args.build_staccato ) tasks.push( function ( then ) {
    arrEachAsyncNodeExn( [
        { dir: "src/", name: "era-staccato-lib.stc" },
        { dir: "src/", name: "era-staccato-self-compiler.stc" },
        { dir: "test/", name: "test.stc" }
    ], function ( i, file, then ) {
        ltf.readTextFile( file.dir + file.name, "utf-8",
            function ( e, text ) {
            
            if ( e ) return void then( e );
            if ( text === null ) return void then( new Error() );
            
            ltf.writeTextFile( "fin/" + file.name + ".js", "utf-8",
                "\"use strict\";\n" +
                "var rocketnia = rocketnia || {};\n" +
                "rocketnia.eraFiles = rocketnia.eraFiles || {};\n" +
                "rocketnia.eraFiles[ " +
                    _.jsStr( file.name ) + " ] =\n" +
                _.jsStr( text ) + ";\n",
                then );
        } );
    }, function ( e ) {
        if ( e ) return void then( e );
        
        console.log(
            "Copied Staccato files to fin/ as JavaScript files." );
        then();
    } );
} );

if ( args.test_mini_staccato ) tasks.push( function ( then ) {
    
    var $stc = Function(
        readFiles( [
            "src/era-misc-strmap-avl.js",
            "src/era-misc.js",
            "src/era-reader.js",
            "src/era-staccato-lib-runner-mini.js"
        ] ) + "\n" +
        "\n" +
        "\n" +
        "return { readAll: readAll,\n" +
        "    arrAny: arrAny,\n" +
        "    processTopLevelReaderExpr:\n" +
        "        processTopLevelReaderExpr,\n" +
        "    runAllDefs: runAllDefs };\n"
    )();
    
    var startMillis = new Date().getTime();
    
    var libCode =
        $stc.readAll( readFile( "src/era-staccato-lib.stc" ) );
    var selfCompilerCode = $stc.readAll(
        readFile( "src/era-staccato-self-compiler.stc" ) );
    var testCode =
        $stc.readAll( readFile( "test/test.stc" ) );
    var readMillis = new Date().getTime();
    
    function runCode( code ) {
        return !$stc.arrAny( code, function ( tryExpr ) {
            if ( !tryExpr.ok ) {
                console.err( tryExpr.msg );
                return true;
            }
            
            $stc.processTopLevelReaderExpr( tryExpr.val );
            return false;
        } );
    }
    
    if ( runCode( libCode ) && runCode( selfCompilerCode ) ) {
        $stc.runAllDefs();
        runCode( testCode );
    }
    
    var stopMillis = new Date().getTime();
    console.log(
        "Ran for " + (stopMillis - startMillis) / 1000 + " " +
        "seconds, broken down as follows:" );
    console.log(
        "- Spent " + (readMillis - startMillis) / 1000 + " seconds " +
        "reading the code." );
    console.log(
        "- Spent " + (stopMillis - readMillis) / 1000 + " seconds " +
        "processing it." );
    
    process.nextTick( function () {
        then();
    } );
} );


if ( tasks.length === 0 ) {
    argParser.printHelp();
} else {
    arrEachAsyncNodeExn( tasks, function ( i, task, then ) {
        task( then );
    }, function ( e ) {
        if ( e ) throw e;
        
        // Do nothing.
    } );
}


}
