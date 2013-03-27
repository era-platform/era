// test-modules.js (part of Era)
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";


(function () {
    function add( term, vars ) {
        addNaiveIsoUnitTest( function ( then ) {
            then( getFreeVarsOfTerm( term ),
                strMap().plusArrTruth( vars ) );
        } );
    }
    
    
    // Systematically verify the variable binding behavior of all
    // expression syntaxes, at least for the purposes of
    // getFreeVarsOfTerm().
    
    add( "foo", [ "foo" ] );
    
    add( [ "tfa", "a", "aType", "bType" ], [ "aType", "bType" ] );
    // NOTE: This test is farfetched since there should be no existing
    // way to make (tfa a aType a) typecheck. It would require a way
    // to make `a` a value of `aType` and a type of its own
    // simultaneously.
    add( [ "tfa", "a", "aType", "a" ], [ "aType" ] );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "tfa", "a", "a", "a" ], [ "a" ] );
    
    add( [ "tfn", "a", "aType", "b" ], [ "aType", "b" ] );
    add( [ "tfn", "a", "aType", "a" ], [ "aType" ] );
    add( [ "tfn", "a", "a", "a" ], [ "a" ] );
    
    add( [ "tcall", "a", "aType", "bType", "fn", "arg" ],
        [ "aType", "bType", "fn", "arg" ] );
    add( [ "tcall", "a", "aType", "a", "fn", "arg" ],
        [ "aType", "fn", "arg" ] );
    add( [ "tcall", "a", "a", "a", "fn", "arg" ],
        [ "a", "fn", "arg" ] );
    add( [ "tcall", "a", "aType", "a", "a", "arg" ],
        [ "aType", "a", "arg" ] );
    add( [ "tcall", "a", "aType", "a", "fn", "a" ],
        [ "aType", "fn", "a" ] );
    
    add( [ "ttfa", "a", "bType" ], [ "bType" ] );
    // NOTE: This term actually can typecheck. It's the type of a
    // type-to-term function that procures a value of the given type.
    // This corresponds pretty well to inconsistency of the type
    // system, so it's how we represent bottom.
    add( [ "ttfa", "a", "a" ], [] );
    
    add( [ "ttfn", "a", "b" ], [ "b" ] );
    add( [ "ttfn", "a", "a" ], [] );
    
    add( [ "ttcall", "a", "bType", "fn", "arg" ],
        [ "bType", "fn", "arg" ] );
    add( [ "ttcall", "a", "a", "fn", "arg" ], [ "fn", "arg" ] );
    add( [ "ttcall", "a", "a", "a", "arg" ], [ "a", "arg" ] );
    add( [ "ttcall", "a", "a", "fn", "a" ], [ "fn", "a" ] );
    
    add( [ "sfa", "a", "aType", "bType" ], [ "aType", "bType" ] );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "sfa", "a", "aType", "a" ], [ "aType" ] );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "sfa", "a", "a", "a" ], [ "a" ] );
    
    add( [ "sfn", "a", "aType", "fst", "snd" ],
        [ "aType", "fst", "snd" ] );
    add( [ "sfn", "a", "aType", "fst", "a" ], [ "aType", "fst" ] );
    add( [ "sfn", "a", "a", "fst", "a" ], [ "a", "fst" ] );
    add( [ "sfn", "a", "aType", "a", "a" ], [ "aType", "a" ] );
    
    add( [ "fst", "a", "aType", "bType", "sfn" ],
        [ "aType", "bType", "sfn" ] );
    add( [ "fst", "a", "aType", "a", "sfn" ], [ "aType", "sfn" ] );
    add( [ "fst", "a", "a", "a", "sfn" ], [ "a", "sfn" ] );
    add( [ "fst", "a", "aType", "a", "a" ], [ "aType", "a" ] );
    
    add( [ "snd", "a", "aType", "bType", "sfn" ],
        [ "aType", "bType", "sfn" ] );
    add( [ "snd", "a", "aType", "a", "sfn" ], [ "aType", "sfn" ] );
    add( [ "snd", "a", "a", "a", "sfn" ], [ "a", "sfn" ] );
    add( [ "snd", "a", "aType", "a", "a" ], [ "aType", "a" ] );
    
    add( [ "partialtype", "terminationType" ],
        [ "terminationType" ] );
    
    add( [ "zunitpartial", "terminationType", "result" ],
        [ "terminationType", "result" ] );
    
    add( [ "zbindpartial", "aType", "bType", "thunkA", "aToThunkB" ],
        [ "aType", "bType", "thunkA", "aToThunkB" ] );
    
    add( [ "zfixpartial", "terminationType", "thunkToThunk" ],
        [ "terminationType", "thunkToThunk" ] );
    
    add( [ "impartialtype", "c", "cType", "rType", "tType" ],
        [ "cType", "rType", "tType" ] );
    add( [ "impartialtype", "c", "cType", "c", "tType" ],
        [ "cType", "tType" ] );
    add( [ "impartialtype", "c", "c", "c", "tType" ],
        [ "c", "tType" ] );
    add( [ "impartialtype", "c", "cType", "c", "c" ],
        [ "cType", "c" ] );
    
    add( [ "unitimpartial", "c", "cType", "rType", "result" ],
        [ "cType", "rType", "result" ] );
    add( [ "unitimpartial", "c", "cType", "c", "result" ],
        [ "cType", "result" ] );
    add( [ "unitimpartial", "c", "c", "c", "result" ],
        [ "c", "result" ] );
    add( [ "unitimpartial", "c", "cType", "c", "c" ],
        [ "cType", "c" ] );
    
    add(
        [ "invkimpartial", "c", "cType", "rType", "tType",
            "invocation" ],
        [ "cType", "rType", "tType", "invocation" ] );
    add(
        [ "invkimpartial", "c", "cType", "c", "tType", "invocation" ],
        [ "cType", "tType", "invocation" ] );
    add( [ "invkimpartial", "c", "c", "c", "tType", "invocation" ],
        [ "c", "tType", "invocation" ] );
    add( [ "invkimpartial", "c", "cType", "c", "c", "invocation" ],
        [ "cType", "c", "invocation" ] );
    add( [ "invkimpartial", "c", "cType", "c", "tType", "c" ],
        [ "cType", "tType", "c" ] );
    
    add( [ "tokentype" ], [] );
    
    add( [ "ztokenequals", "a", "b" ], [ "a", "b" ] );
    
    add( [ "sink" ], [] );
    
    add( [ "ztokentosink", "val" ], [ "val" ] );
    
    add( [ "zsinktotoken", "sink" ], [ "sink" ] );
    
    add( [ "zpfntosink", "val" ], [ "val" ] );
    
    add( [ "zsinktopfn", "sink" ], [ "sink" ] );
    
    add( [ "zipfntosink", "val" ], [ "val" ] );
    
    add( [ "zsinktoipfn", "sink" ], [ "sink" ] );
    
    
    // Just try something wacky with nesting and shadowing.
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "sfn", "a", [ "sfn", "a", "x1", "x2", "x3" ],
        [ "sfn", "a", "x4", "x5", "x6" ],
        [ "sfn", "a", "a", "x7", "a" ] ],
        [ "x1", "x2", "x3", "x4", "x5", "x6", "x7" ] );
})();
addShouldThrowUnitTest( function () {
    return getFreeVarsOfTerm(
        [ "nonexistentSyntax", "a", "b", "c" ] );
} );
addShouldThrowUnitTest( function () {
    return getFreeVarsOfTerm(
        !"a boolean rather than a nested Array of strings" );
} );

(function () {
    function add( map, input, output ) {
        addNaiveIsoUnitTest( function ( then ) {
            then(
                renameVarsToVars(
                    map, { env: strMap(), term: input } ),
                output );
        } );
    }
    
    var xo = strMap().setObj( { "x": "o" } );
    
    // TODO: Try some tests in a nonempty environment.
    
    // Try a few base cases.
    add( strMap(), "f", "f" );
    add( xo, "o", "o" );
    add( xo, "f", "f" );
    add( strMap().setObj( { "x1": "o1", "x2": "o2" } ),
        [ "ttcall", "a", "a", "x1", "x2" ],
        [ "ttcall", "a", "a", "o1", "o2" ] );
    
    // Systematically verify the variable binding behavior of all
    // expression syntaxes, at least for the purposes of
    // renameVarsToVars().
    add( xo, "x", "o" );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( xo, [ "tfa", "x", "x", "x" ], [ "tfa", "x", "o", "x" ] );
    add( xo, [ "tfn", "x", "x", "x" ], [ "tfn", "x", "o", "x" ] );
    add( xo,
        [ "tcall", "x", "x", "x", "x", "x" ],
        [ "tcall", "x", "o", "x", "o", "o" ] );
    add( xo, [ "ttfa", "x", "x" ], [ "ttfa", "x", "x" ] );
    add( xo, [ "ttfn", "x", "x" ], [ "ttfn", "x", "x" ] );
    add( xo,
        [ "ttcall", "x", "x", "x", "x" ],
        [ "ttcall", "x", "x", "o", "o" ] );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( xo, [ "sfa", "x", "x", "x" ], [ "sfa", "x", "o", "x" ] );
    add( xo,
        [ "sfn", "x", "x", "x", "x" ],
        [ "sfn", "x", "o", "o", "x" ] );
    add( xo,
        [ "fst", "x", "x", "x", "x" ],
        [ "fst", "x", "o", "x", "o" ] );
    add( xo,
        [ "snd", "x", "x", "x", "x" ],
        [ "snd", "x", "o", "x", "o" ] );
    add( xo, [ "partialtype", "x" ], [ "partialtype", "o" ] );
    add( xo,
        [ "zunitpartial", "x", "x" ],
        [ "zunitpartial", "o", "o" ] );
    add( xo,
        [ "zbindpartial", "x", "x", "x", "x" ],
        [ "zbindpartial", "o", "o", "o", "o" ] );
    add( xo,
        [ "zfixpartial", "x", "x" ],
        [ "zfixpartial", "o", "o" ] );
    add( xo,
        [ "impartialtype", "x", "x", "x", "x" ],
        [ "impartialtype", "x", "o", "x", "o" ] );
    add( xo,
        [ "unitimpartial", "x", "x", "x", "x" ],
        [ "unitimpartial", "x", "o", "x", "o" ] );
    add( xo,
        [ "invkimpartial", "x", "x", "x", "x", "x" ],
        [ "invkimpartial", "x", "o", "x", "o", "o" ] );
    add( xo, [ "tokentype" ], [ "tokentype" ] );
    add( xo,
        [ "ztokenequals", "x", "x" ],
        [ "ztokenequals", "o", "o" ] );
    add( xo, [ "sink" ], [ "sink" ] );
    add( xo, [ "ztokentosink", "x" ], [ "ztokentosink", "o" ] );
    add( xo, [ "zsinktotoken", "x" ], [ "zsinktotoken", "o" ] );
    add( xo, [ "zpfntosink", "x" ], [ "zpfntosink", "o" ] );
    add( xo, [ "zsinktopfn", "x" ], [ "zsinktopfn", "o" ] );
    add( xo, [ "zipfntosink", "x" ], [ "zipfntosink", "o" ] );
    add( xo, [ "zsinktoipfn", "x" ], [ "zsinktoipfn", "o" ] );
    
    // Just try something wacky with nesting and shadowing.
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( xo,
        [ "sfn", "f", [ "sfn", "x", "x", "x", "x" ],
            [ "sfn", "f", "x", "x", "x" ],
            [ "sfn", "f", "f", "x", "f" ] ],
        [ "sfn", "f", [ "sfn", "x", "o", "o", "x" ],
            [ "sfn", "f", "o", "o", "o" ],
            [ "sfn", "f", "f", "o", "f" ] ] );
})();
addShouldThrowUnitTest( function () {
    return renameVarsToVars( strMap(), { env: strMap(),
        term: [ "nonexistentSyntax", "a", "b", "c" ] } );
} );
addShouldThrowUnitTest( function () {
    return renameVarsToVars( strMap(), { env: strMap(),
        term: !"a boolean rather than a nested Array of strings" } );
} );

(function () {
    function add( a, b ) {
        addPredicateUnitTest( function ( then ) {
            then( {
                a: { env: strMap(), term: a },
                b: { env: strMap(), term: b }
            }, function ( aAndB ) {
                var a = aAndB.a, b = aAndB.b;
                return ( true
                    && knownEqual( a, a )
                    && knownEqual( a, b )
                    && knownEqual( b, a )
                    && knownEqual( b, b )
                );
            } );
        } );
    }
    function addNegative( a, b ) {
        addPredicateUnitTest( function ( then ) {
            then( {
                a: { env: strMap(), term: a },
                b: { env: strMap(), term: b }
            }, function ( aAndB ) {
                var a = aAndB.a, b = aAndB.b;
                return ( true
                    && knownEqual( a, a )
                    && !knownEqual( a, b )
                    && !knownEqual( b, a )
                    && knownEqual( b, b )
                );
            } );
        } );
    }
    
    addNegative(
        [ "sfn", "x", "x", "x", "x" ],
        [ "sfn", "o", "x", "x", "x" ] );
    
    // Systematically verify the variable binding behavior of all
    // expression syntaxes, at least for the purposes of
    // renameVarsToVars().
    add( "x", "x" );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "tfa", "x", "x", "x" ], [ "tfa", "o", "x", "o" ] );
    add( [ "tfn", "x", "x", "x" ], [ "tfn", "o", "x", "o" ] );
    add(
        [ "tcall", "x", "x", "x", "x", "x" ],
        [ "tcall", "o", "x", "o", "x", "x" ] );
    add( [ "ttfa", "x", "x" ], [ "ttfa", "o", "o" ] );
    add( [ "ttfn", "x", "x" ], [ "ttfn", "o", "o" ] );
    add(
        [ "ttcall", "x", "x", "x", "x" ],
        [ "ttcall", "o", "o", "x", "x" ] );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "sfa", "x", "x", "x" ], [ "sfa", "o", "x", "o" ] );
    add(
        [ "sfn", "x", "x", "x", "x" ],
        [ "sfn", "o", "x", "x", "o" ] );
    add(
        [ "fst", "x", "x", "x", "x" ],
        [ "fst", "o", "x", "o", "x" ] );
    add(
        [ "snd", "x", "x", "x", "x" ],
        [ "snd", "o", "x", "o", "x" ] );
    add( [ "partialtype", "x" ], [ "partialtype", "x" ] );
    add( [ "zunitpartial", "x", "x" ], [ "zunitpartial", "x", "x" ] );
    add(
        [ "zbindpartial", "x", "x", "x", "x" ],
        [ "zbindpartial", "x", "x", "x", "x" ] );
    add( [ "zfixpartial", "x", "x" ], [ "zfixpartial", "x", "x" ] );
    add(
        [ "impartialtype", "x", "x", "x", "x" ],
        [ "impartialtype", "o", "x", "o", "x" ] );
    add(
        [ "unitimpartial", "x", "x", "x", "x" ],
        [ "unitimpartial", "o", "x", "o", "x" ] );
    add(
        [ "invkimpartial", "x", "x", "x", "x", "x" ],
        [ "invkimpartial", "o", "x", "o", "x", "x" ] );
    add( [ "tokentype" ], [ "tokentype" ] );
    add( [ "ztokenequals", "x", "x" ], [ "ztokenequals", "x", "x" ] );
    add( [ "sink" ], [ "sink" ] );
    add( [ "ztokentosink", "x" ], [ "ztokentosink", "x" ] );
    add( [ "zsinktotoken", "x" ], [ "zsinktotoken", "x" ] );
    add( [ "zpfntosink", "x" ], [ "zpfntosink", "x" ] );
    add( [ "zsinktopfn", "x" ], [ "zsinktopfn", "x" ] );
    add( [ "zipfntosink", "x" ], [ "zipfntosink", "x" ] );
    add( [ "zsinktoipfn", "x" ], [ "zsinktoipfn", "x" ] );
    
    // Just try something wacky with nesting and shadowing.
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add(
        [ "sfn", "f", [ "sfn", "x", "x", "x", "x" ],
            [ "sfn", "f", "x", "x", "x" ],
            [ "sfn", "f", "f", "x", "f" ] ],
        [ "sfn", "a", [ "sfn", "b", "x", "x", "b" ],
            [ "sfn", "c", "x", "x", "x" ],
            [ "sfn", "d", "a", "x", "d" ] ] );
})();
addShouldThrowUnitTest( function () {
    var expr = { env: strMap(),
        term: [ "nonexistentSyntax", "a", "b", "c" ] };
    return knownEqual( expr, expr );
} );
addShouldThrowUnitTest( function () {
    var expr = { env: strMap(),
        term: !"a boolean rather than a nested Array of strings" };
    return knownEqual( expr, expr );
} );

(function () {
    function add( expected, term ) {
        addPredicateUnitTest( function ( then ) {
            then( term, function ( term ) {
                return expected === isWfTerm( term );
            } );
        } );
    }
    
    var vari = "x";
    var expr = [ "ttfn", "z", "z" ];
    
    add( true, expr );
    
    
    // NOTE: Again, for many of these terms that pass isWfTerm(),
    // there should be no existing way to make them fully typecheck.
    
    
    // Systematically verify the variable binding behavior of all
    // expression syntaxes, at least for the purposes of isWfTerm().
    
    add( true, vari );
    add( false, true );
    
    add( true, [ "tfa", vari, expr, expr ] );
    add( false, [ "tfa", true, expr, expr ] );
    add( false, [ "tfa", vari, true, expr ] );
    add( false, [ "tfa", vari, expr, true ] );
    add( false, [ "tfa", expr, expr, expr ] );
    
    add( true, [ "tfn", vari, expr, expr ] );
    add( false, [ "tfn", true, expr, expr ] );
    add( false, [ "tfn", vari, true, expr ] );
    add( false, [ "tfn", vari, expr, true ] );
    add( false, [ "tfn", expr, expr, expr ] );
    
    add( true, [ "tcall", vari, expr, expr, expr, expr ] );
    add( false, [ "tcall", true, expr, expr, expr, expr ] );
    add( false, [ "tcall", vari, true, expr, expr, expr ] );
    add( false, [ "tcall", vari, expr, true, expr, expr ] );
    add( false, [ "tcall", vari, expr, expr, true, expr ] );
    add( false, [ "tcall", vari, expr, expr, expr, true ] );
    add( false, [ "tcall", expr, expr, expr, expr, expr ] );
    
    add( true, [ "ttfa", vari, expr ] );
    add( false, [ "ttfa", true, expr ] );
    add( false, [ "ttfa", vari, true ] );
    add( false, [ "ttfa", expr, expr ] );
    
    add( true, [ "ttfn", vari, expr ] );
    add( false, [ "ttfn", true, expr ] );
    add( false, [ "ttfn", vari, true ] );
    add( false, [ "ttfn", expr, expr ] );
    
    add( true, [ "ttcall", vari, expr, expr, expr ] );
    add( false, [ "ttcall", true, expr, expr, expr ] );
    add( false, [ "ttcall", vari, true, expr, expr ] );
    add( false, [ "ttcall", vari, expr, true, expr ] );
    add( false, [ "ttcall", vari, expr, expr, true ] );
    add( false, [ "ttcall", expr, expr, expr, expr ] );
    
    add( true, [ "sfa", vari, expr, expr ] );
    add( false, [ "sfa", true, expr, expr ] );
    add( false, [ "sfa", vari, true, expr ] );
    add( false, [ "sfa", vari, expr, true ] );
    add( false, [ "sfa", expr, expr, expr ] );
    
    add( true, [ "sfn", vari, expr, expr, expr ] );
    add( false, [ "sfn", true, expr, expr, expr ] );
    add( false, [ "sfn", vari, true, expr, expr ] );
    add( false, [ "sfn", vari, expr, true, expr ] );
    add( false, [ "sfn", vari, expr, expr, true ] );
    add( false, [ "sfn", expr, expr, expr, expr ] );
    
    add( true, [ "fst", vari, expr, expr, expr ] );
    add( false, [ "fst", true, expr, expr, expr ] );
    add( false, [ "fst", vari, true, expr, expr ] );
    add( false, [ "fst", vari, expr, true, expr ] );
    add( false, [ "fst", vari, expr, expr, true ] );
    add( false, [ "fst", expr, expr, expr, expr ] );
    
    add( true, [ "snd", vari, expr, expr, expr ] );
    add( false, [ "snd", true, expr, expr, expr ] );
    add( false, [ "snd", vari, true, expr, expr ] );
    add( false, [ "snd", vari, expr, true, expr ] );
    add( false, [ "snd", vari, expr, expr, true ] );
    add( false, [ "snd", expr, expr, expr, expr ] );
    
    add( true, [ "partialtype", expr ] );
    add( false, [ "partialtype", true ] );
    
    add( true, [ "zunitpartial", expr, expr ] );
    add( false, [ "zunitpartial", true, expr ] );
    add( false, [ "zunitpartial", expr, true ] );
    
    add( true, [ "zbindpartial", expr, expr, expr, expr ] );
    add( false, [ "zbindpartial", true, expr, expr, expr ] );
    add( false, [ "zbindpartial", expr, true, expr, expr ] );
    add( false, [ "zbindpartial", expr, expr, true, expr ] );
    add( false, [ "zbindpartial", expr, expr, expr, true ] );
    
    add( true, [ "zfixpartial", expr, expr ] );
    add( false, [ "zfixpartial", true, expr ] );
    add( false, [ "zfixpartial", expr, true ] );
    
    add( true, [ "impartialtype", vari, expr, expr, expr ] );
    add( false, [ "impartialtype", true, expr, expr, expr ] );
    add( false, [ "impartialtype", vari, true, expr, expr ] );
    add( false, [ "impartialtype", vari, expr, true, expr ] );
    add( false, [ "impartialtype", vari, expr, expr, true ] );
    add( false, [ "impartialtype", expr, expr, expr, expr ] );
    
    add( true, [ "unitimpartial", vari, expr, expr, expr ] );
    add( false, [ "unitimpartial", true, expr, expr, expr ] );
    add( false, [ "unitimpartial", vari, true, expr, expr ] );
    add( false, [ "unitimpartial", vari, expr, true, expr ] );
    add( false, [ "unitimpartial", vari, expr, expr, true ] );
    add( false, [ "unitimpartial", expr, expr, expr, expr ] );
    
    add( true, [ "invkimpartial", vari, expr, expr, expr, expr ] );
    add( false, [ "invkimpartial", true, expr, expr, expr, expr ] );
    add( false, [ "invkimpartial", vari, true, expr, expr, expr ] );
    add( false, [ "invkimpartial", vari, expr, true, expr, expr ] );
    add( false, [ "invkimpartial", vari, expr, expr, true, expr ] );
    add( false, [ "invkimpartial", vari, expr, expr, expr, true ] );
    add( false, [ "invkimpartial", expr, expr, expr, expr, expr ] );
    
    add( true, [ "tokentype" ] );
    
    add( true, [ "ztokenequals", expr, expr ] );
    add( false, [ "ztokenequals", true, expr ] );
    add( false, [ "ztokenequals", expr, true ] );
    
    add( true, [ "sink" ] );
    
    add( true, [ "ztokentosink", expr ] );
    add( false, [ "ztokentosink", true ] );
    
    add( true, [ "zsinktotoken", expr ] );
    add( false, [ "zsinktotoken", true ] );
    
    add( true, [ "zpfntosink", expr ] );
    add( false, [ "zpfntosink", true ] );
    
    add( true, [ "zsinktopfn", expr ] );
    add( false, [ "zsinktopfn", true ] );
    
    add( true, [ "zipfntosink", expr ] );
    add( false, [ "zipfntosink", true ] );
    
    add( true, [ "zsinktoipfn", expr ] );
    add( false, [ "zsinktoipfn", true ] );
    
    
    // Just try something wacky with nesting and shadowing.
    add( true,
        [ "sfn", "f", [ "sfn", "x", "x", "x", "x" ],
            [ "sfn", "f", "x", "x", "x" ],
            [ "sfn", "f", "f", "x", "f" ] ] );
    
    
    add( false, [ "nonexistentSyntax", "a", "b", "c" ] );
})();

(function () {
    function addTerm( expected, env, type, expr, opt_reduced ) {
        addPredicateUnitTest( function ( then ) {
            then( {
                type: { env: env, term: type },
                expr: { env: env, term: expr },
                reduced: opt_reduced === null ? null :
                    { env: env, term:
                        opt_reduced !== void 0 ? opt_reduced : expr }
            }, function ( args ) {
                if ( !checkIsType( args.type ) )
                    return false;
                var checksOut =
                    checkInhabitsType( args.expr, args.type );
                if ( checksOut !== expected )
                    return false;
                if ( checksOut && args.reduced !== null
                    && !knownEqual(
                        betaReduce( args.expr ), args.reduced ) )
                    return false;
                return true;
            } );
        } );
    }
    function addType( expected, env, expr, opt_reduced ) {
        addPredicateUnitTest( function ( then ) {
            then( {
                expr: { env: env, term: expr },
                reduced: opt_reduced === null ? null :
                    { env: env, term:
                        opt_reduced !== void 0 ? opt_reduced : expr }
            }, function ( args ) {
                var checksOut = checkIsType( args.expr );
                if ( checksOut !== expected )
                    return false;
                if ( checksOut && args.reduced !== null
                    && !knownEqual(
                        betaReduce( args.expr ), args.reduced ) )
                    return false;
                return true;
            } );
        } );
    }
    
    
    // TODO: Add more thorough unit tests, exploring the impact of
    // non-empty environments, unsuccessful typechecks, and such.
    
    var _env = strMap();  // NOTE: The "_" stands for "empty."
    var igno = "_";
    var unitType = [ "ttfa", "t", [ "tfa", igno, "t", "t" ] ];
    var unit = [ "ttfn", "t", [ "tfn", "x", "t", "x" ] ];
    var sfn = [ "sfn", igno, unitType, unit, unit ];
    // NOTE: This stands for "imperative partial type."
    var impt =
        [ "impartialtype", igno, unitType, unitType, unitType ];
    // NOTE: This stands for "imperative partial unit."
    var impu = [ "unitimpartial", igno, unitType, unitType, unit ];
    var exampleSink =
        [ "zpfntosink",
            [ "tfn", "s", [ "sink" ],
                [ "zunitpartial", [ "sink" ], "s" ] ] ];
    
    function testFromSink( fromSink, innerType ) {
        addTerm( true, _env,
            [ "ttfa", "a",
                [ "tfa", igno, "a",
                    [ "tfa", igno, [ "tfa", igno, innerType, "a" ],
                        "a" ] ] ],
            [ fromSink, exampleSink ],
            null );
        addTerm( true, _env, unitType,
            [ "tcall",
                igno, [ "tfa", igno, innerType, unitType ], unitType,
                [ "tcall", igno, unitType,
                    [ "tfa", igno,
                        [ "tfa", igno, innerType, unitType ],
                        unitType ],
                    [ "ttcall", "a",
                        [ "tfa", igno, "a",
                            [ "tfa", igno,
                                [ "tfa", igno, innerType, "a" ],
                                "a" ] ],
                        [ fromSink, exampleSink ],
                        unitType ],
                    unit ],
                [ "tfn", igno, innerType, unit ] ],
            unit );
    }
    
    addTerm( true, _env, unitType, unit );
    addTerm( true, _env, [ "tfa", igno, unitType, unitType ],
        [ "tfn", igno, unitType, unit ] );
    addTerm( true, _env, unitType,
        [ "tcall", igno, unitType, unitType,
            [ "tfn", "x", unitType, "x" ], unit ],
        unit );
    addTerm( true, _env, [ "ttfa", igno, unitType ],
        [ "ttfn", igno, unit ] );
    // NOTE: This test encounters the case where one of the arguments
    // to knownEqual() is a variable reference and it's bound in its
    // environment. This happens because during type checking of the
    // beta-reduced expression, the final type we compare to is
    // actually [ "tfa", igno, unitType, "t" ] with "t" bound to
    // unitType in the lexical closure.
    addTerm( true, _env, [ "tfa", igno, unitType, unitType ],
        [ "ttcall", "t", [ "tfa", igno, "t", "t" ], unit, unitType ],
        [ "tfn", "x", unitType, "x" ] );
    // NOTE: This test of ttcall makes no use of lexical closure in
    // the result, so it hasn't run across the same trouble as the
    // previous test.
    addTerm( true, _env, unitType,
        [ "ttcall", igno, unitType,
            [ "ttfn", igno, unit ], unitType ],
        unit );
    addTerm( true, _env, [ "sfa", igno, unitType, unitType ], sfn );
    addTerm( true, _env, unitType,
        [ "fst", igno, unitType, unitType, sfn ], unit );
    addTerm( true, _env, unitType,
        [ "snd", igno, unitType, unitType, sfn ], unit );
    addType( true, _env, [ "partialtype", unitType ] );
    addTerm( true, _env, [ "partialtype", unitType ],
        [ "zunitpartial", unitType, unit ] );
    addTerm( true, _env, [ "partialtype", unitType ],
        [ "zbindpartial", unitType, unitType,
            [ "zunitpartial", unitType, unit ],
            [ "tfn", igno, unitType,
                [ "zunitpartial", unitType, unit ] ] ] );
    // NOTE: This version is an infinite loop.
    addTerm( true, _env, [ "partialtype", unitType ],
        [ "zfixpartial", unitType,
            [ "tfn", "x", [ "partialtype", unitType ], "x" ] ] );
    // NOTE: This version isn't an infinite loop.
    addTerm( true, _env, [ "partialtype", unitType ],
        [ "zfixpartial", unitType,
            [ "tfn", igno, [ "partialtype", unitType ],
                [ "zunitpartial", unitType, unit ] ] ] );
    addTerm( true, _env, impt, impu );
    addTerm( true, _env, impt,
        [ "invkimpartial", igno, unitType, unitType, unitType,
            [ "sfn", igno, unitType, unit,
                [ "tfn", igno, unitType,
                    [ "zunitpartial", impt, impu ] ] ] ] );
    addType( true, _env, [ "tokentype" ] );
    addTerm( true, _env,
        [ "tfa", igno, [ "tokentype" ],
            [ "tfa", igno, [ "tokentype" ],
                [ "ttfa", "a",
                    [ "tfa", igno, "a",
                        [ "tfa", igno, "a", "a" ] ] ] ] ],
        [ "tfn", "a", [ "tokentype" ],
            [ "tfn", "b", [ "tokentype" ],
                [ "ztokenequals", "a", "b" ] ] ] );
    addType( true, _env, [ "sink" ] );
    addTerm( true, _env, [ "tfa", igno, [ "tokentype" ], [ "sink" ] ],
        [ "tfn", "token", [ "tokentype" ],
            [ "ztokentosink", "token" ] ] );
    testFromSink( "zsinktotoken", [ "tokentype" ] );
    addTerm( true, _env, [ "sink" ], exampleSink );
    testFromSink( "zsinktopfn",
        [ "tfa", igno, [ "sink" ], [ "partialtype", [ "sink" ] ] ] );
    addTerm( true, _env, [ "sink" ],
        [ "zipfntosink",
            [ "tfn", "s", [ "sink" ],
                [ "zunitpartial",
                    [ "impartialtype", igno, [ "sink" ], [ "sink" ],
                        [ "sink" ] ],
                    [ "unitimpartial", igno, [ "sink" ], [ "sink" ],
                        "s" ] ] ] ] );
    testFromSink( "zsinktoipfn",
        [ "tfa", igno, [ "sink" ],
            [ "partialtype",
                [ "impartialtype", igno, [ "sink" ], [ "sink" ],
                    [ "sink" ] ] ] ] );
})();
addShouldThrowUnitTest( function () {
    return betaReduce( { env: strMap(),
        term: [ "nonexistentSyntax", "a", "b", "c" ] } );
} );
addShouldThrowUnitTest( function () {
    return betaReduce( { env: strMap(),
        term: !"a boolean rather than a nested Array of strings" } );
} );
addShouldThrowUnitTest( function () {
    return checkIsType( { env: strMap(),
        term: [ "nonexistentSyntax", "a", "b", "c" ] } );
} );
addShouldThrowUnitTest( function () {
    return checkIsType( { env: strMap(),
        term: !"a boolean rather than a nested Array of strings" } );
} );
addShouldThrowUnitTest( function () {
    var env = strMap();
    return checkInhabitsType(
        { env: env, term: [ "nonexistentSyntax", "a", "b", "c" ] },
        { env: env, term: [ "ttfa", "t", [ "tfa", "x", "t", "t" ] ] }
    );
} );
addShouldThrowUnitTest( function () {
    var env = strMap();
    return checkInhabitsType(
        { env: env, term:
            !"a boolean rather than a nested Array of strings" },
        { env: env, term: [ "ttfa", "t", [ "tfa", "x", "t", "t" ] ] }
    );
} );

(function () {
    
    var igno = "_";
    var unitType = [ "ttfa", "t", [ "tfa", igno, "t", "t" ] ];
    var unit = [ "ttfn", "t", [ "tfn", "x", "t", "x" ] ];
    var sfn = [ "sfn", igno, unitType, unit, unit ];
    // NOTE: This stands for "imperative partial type."
    var impt =
        [ "impartialtype", igno, unitType, unitType, unitType ];
    // NOTE: This stands for "imperative partial unit."
    var impu = [ "unitimpartial", igno, unitType, unitType, unit ];
    
    function run( program ) {
        return Function( ""
            + "return (\n"
            + "\n"
            + compileTermToSyncJsFull(
                { env: strMap(), term: program } )
            + "\n"
            + ");\n"
        )();
    }
    
    var program =
        [ "zunitpartial", impt,
            [ "invkimpartial", igno, unitType, unitType, unitType,
                [ "sfn", igno, unitType, unit,
                    [ "tfn", igno, unitType,
                        [ "zunitpartial", impt, impu ] ] ] ] ];
    addNaiveIsoUnitTest( function ( then ) {
        then( run( program ), 1 );
    } );
})();

(function () {
    function add( expected, term ) {
        addPredicateUnitTest( function ( then ) {
            then( term, function ( term ) {
                return expected === isWfUserKnowledge( term );
            } );
        } );
    }
    
    var vari = "x";
    
    add( false, vari );
    add( false, true );
    
    add( true, [ "istype", vari ] );
    add( false, [ "istype", true ] );
    
    add( true, [ "describes", vari, vari ] );
    add( false, [ "describes", true, vari ] );
    add( false, [ "describes", vari, true ] );
    
    add( true, [ "public", [ "everyone" ] ] );
    add( false, [ "public", true ] );
    
    add( true, [ "secret", [ "everyone" ] ] );
    add( false, [ "secret", true ] );
    
    add( false, [ "nonexistentSyntax", "a", "b", "c" ] );
})();

(function () {
    function addTerm( type, expr ) {
        addPredicateUnitTest( function ( then ) {
            then( {
                typeKnowledge:
                    { env: strMap(), term: [ "istype", type ] },
                exprKnowledge: { env: strMap(), term:
                    [ "describes", type, expr ] }
            }, function ( args ) {
                if ( !isWfUserKnowledge( args.typeKnowledge.term ) )
                    return false;
                if ( !checkUserKnowledge(
                    strMap(), args.typeKnowledge ) )
                    return false;
                if ( !isWfUserKnowledge( args.exprKnowledge.term ) )
                    return false;
                if ( !checkUserKnowledge(
                    strMap(), args.exprKnowledge ) )
                    return false;
                return true;
            } );
        } );
    }
    function addType( expr ) {
        addPredicateUnitTest( function ( then ) {
            then( {
                knowledge: { env: strMap(), term: [ "istype", expr ] }
            }, function ( args ) {
                if ( !isWfUserKnowledge( args.knowledge.term ) )
                    return false;
                if ( !checkUserKnowledge( strMap(), args.knowledge ) )
                    return false;
                return true;
            } );
        } );
    }
    
    // TODO: These test expressions and types are exactly the same as
    // those in the all-in-one tests for checkInhabitsType(),
    // betaReduce(), and knownEqual(). See if we should put them in a
    // shared definition.
    
    // TODO: Add more thorough unit tests, exploring the impact of
    // non-empty environments, unsuccessful knowledge checks, and
    // such.
    
    var igno = "_";
    var unitType = [ "ttfa", "t", [ "tfa", igno, "t", "t" ] ];
    var unit = [ "ttfn", "t", [ "tfn", "x", "t", "x" ] ];
    var sfn = [ "sfn", igno, unitType, unit, unit ];
    // NOTE: This stands for "imperative partial type."
    var impt =
        [ "impartialtype", igno, unitType, unitType, unitType ];
    // NOTE: This stands for "imperative partial unit."
    var impu = [ "unitimpartial", igno, unitType, unitType, unit ];
    var exampleSink =
        [ "zpfntosink",
            [ "tfn", "s", [ "sink" ],
                [ "zunitpartial", [ "sink" ], "s" ] ] ];
    
    function testFromSink( fromSink, innerType ) {
        addTerm(
            [ "ttfa", "a",
                [ "tfa", igno, "a",
                    [ "tfa", igno, [ "tfa", igno, innerType, "a" ],
                        "a" ] ] ],
            [ fromSink, exampleSink ] );
        addTerm( unitType,
            [ "tcall",
                igno, [ "tfa", igno, innerType, unitType ], unitType,
                [ "tcall", igno, unitType,
                    [ "tfa", igno,
                        [ "tfa", igno, innerType, unitType ],
                        unitType ],
                    [ "ttcall", "a",
                        [ "tfa", igno, "a",
                            [ "tfa", igno,
                                [ "tfa", igno, innerType, "a" ],
                                "a" ] ],
                        [ fromSink, exampleSink ],
                        unitType ],
                    unit ],
                [ "tfn", igno, innerType, unit ] ] );
    }
    
    addTerm( unitType, unit );
    addTerm( [ "tfa", igno, unitType, unitType ],
        [ "tfn", igno, unitType, unit ] );
    addTerm( unitType,
        [ "tcall", igno, unitType, unitType,
            [ "tfn", "x", unitType, "x" ], unit ] );
    addTerm( [ "ttfa", igno, unitType ], [ "ttfn", igno, unit ] );
    addTerm( [ "tfa", igno, unitType, unitType ],
        [ "ttcall", "t", [ "tfa", igno, "t", "t" ],
            unit, unitType ] );
    addTerm( unitType,
        [ "ttcall", igno, unitType,
            [ "ttfn", igno, unit ], unitType ] );
    addTerm( [ "sfa", igno, unitType, unitType ], sfn );
    addTerm( unitType, [ "fst", igno, unitType, unitType, sfn ] );
    addTerm( unitType, [ "snd", igno, unitType, unitType, sfn ] );
    addType( [ "partialtype", unitType ] );
    addTerm( [ "partialtype", unitType ],
        [ "zunitpartial", unitType, unit ] );
    addTerm( [ "partialtype", unitType ],
        [ "zbindpartial", unitType, unitType,
            [ "zunitpartial", unitType, unit ],
            [ "tfn", igno, unitType,
                [ "zunitpartial", unitType, unit ] ] ] );
    addTerm( [ "partialtype", unitType ],
        [ "zfixpartial", unitType,
            [ "tfn", "x", [ "partialtype", unitType ], "x" ] ] );
    addTerm( [ "partialtype", unitType ],
        [ "zfixpartial", unitType,
            [ "tfn", igno, [ "partialtype", unitType ],
                [ "zunitpartial", unitType, unit ] ] ] );
    addTerm( impt, impu );
    addTerm( impt,
        [ "invkimpartial", igno, unitType, unitType, unitType,
            [ "sfn", igno, unitType, unit,
                [ "tfn", igno, unitType,
                    [ "zunitpartial", impt, impu ] ] ] ] );
    addType( [ "tokentype" ] );
    addTerm(
        [ "tfa", igno, [ "tokentype" ],
            [ "tfa", igno, [ "tokentype" ],
                [ "ttfa", "a",
                    [ "tfa", igno, "a",
                        [ "tfa", igno, "a", "a" ] ] ] ] ],
        [ "tfn", "a", [ "tokentype" ],
            [ "tfn", "b", [ "tokentype" ],
                [ "ztokenequals", "a", "b" ] ] ] );
    addType( [ "sink" ] );
    addTerm( [ "tfa", igno, [ "tokentype" ], [ "sink" ] ],
        [ "tfn", "token", [ "tokentype" ],
            [ "ztokentosink", "token" ] ] );
    testFromSink( "zsinktotoken", [ "tokentype" ] );
    addTerm( [ "sink" ], exampleSink );
    testFromSink( "zsinktopfn",
        [ "tfa", igno, [ "sink" ], [ "partialtype", [ "sink" ] ] ] );
    addTerm( [ "sink" ],
        [ "zipfntosink",
            [ "tfn", "s", [ "sink" ],
                [ "zunitpartial",
                    [ "impartialtype", igno, [ "sink" ], [ "sink" ],
                        [ "sink" ] ],
                    [ "unitimpartial", igno, [ "sink" ], [ "sink" ],
                        "s" ] ] ] ] );
    testFromSink( "zsinktoipfn",
        [ "tfa", igno, [ "sink" ],
            [ "partialtype",
                [ "impartialtype", igno, [ "sink" ], [ "sink" ],
                    [ "sink" ] ] ] ] );
})();
addShouldThrowUnitTest( function () {
    return checkUserKnowledge( strMap(), { env: strMap(),
        term: [ "nonexistentSyntax", "a", "b", "c" ] } );
} );
addShouldThrowUnitTest( function () {
    return checkUserKnowledge( strMap(), { env: strMap(),
        term: !"a boolean rather than a nested Array of strings" } );
} );

(function () {
    function add( term ) {
        addPredicateUnitTest( function ( then ) {
            then( term, function ( term ) {
                if ( !isWfUserKnowledge( term ) )
                    return false;
                if ( !checkUserKnowledge(
                    strMap(), { env: strMap(), term: term } ) )
                    return false;
                return true;
            } );
        } );
    }
    
    add( [ "public", [ "everyone" ] ] );
    add( [ "secret", [ "everyone" ] ] );
})();

(function () {
    function add( expected, check, term ) {
        addPredicateUnitTest( function ( then ) {
            then( term, function ( term ) {
                return expected === check( term );
            } );
        } );
    }
    
    var sym = [ "sym", "This is an arbitrary string." ];
    
    
    add( true, isWfExternallyVisibleWord, sym );
    
    add( false, isWfExternallyVisibleWord,
        [ "nonexistentSyntax", "a", "b", "c" ] );
    add( false, isWfExternallyVisibleWord,
        !"a boolean rather than a nested Array of strings" );
    
    
    add( true, isWfKey, [ "everyone" ] );
    
    add( true, isWfKey, [ "subkey", [ "everyone" ], sym ] );
    add( false, isWfKey, [ "subkey", true, sym ] );
    add( false, isWfKey, [ "subkey", [ "everyone" ], true ] );
    
    add( false, isWfKey,
        [ "nonexistentSyntax", "a", "b", "c" ] );
    add( false, isWfKey,
        !"a boolean rather than a nested Array of strings" );
})();

(function () {
    function add( term ) {
        addPredicateUnitTest( function ( then ) {
            then( term, function ( term ) {
                if ( !isWfKey( term ) )
                    return false;
                if ( !checkKey( strMap(), term ) )
                    return false;
                return true;
            } );
        } );
    }
    
    add( [ "everyone" ] );
    add( [ "subkey", [ "everyone" ], [ "sym", "a" ] ] );
    add( [ "subkey", [ "subkey", [ "everyone" ], [ "sym", "a" ] ],
        [ "sym", "b" ] ] );
})();
addShouldThrowUnitTest( function () {
    return checkKey( strMap(),
        [ "nonexistentSyntax", "a", "b", "c" ] );
} );
addShouldThrowUnitTest( function () {
    return checkKey( strMap(),
        !"a boolean rather than a nested Array of strings" );
} );

(function () {
    function add( expectedCheck, term ) {
        addPredicateUnitTest( function ( then ) {
            then( term, function ( term ) {
                if ( !isWfUserAction( term ) )
                    return false;
                if ( expectedCheck !== checkUserAction( strMap(),
                    { env: strMap(), term: term } ) )
                    return false;
                if ( !isWfUserKnowledge( [ "can", term ] ) )
                    return false;
                if ( expectedCheck !== checkUserKnowledge( strMap(),
                    { env: strMap(), term: [ "can", term ] } ) )
                    return false;
                return true;
            } );
        } );
    }
    
    var igno = "_";
    var unitType = [ "ttfa", "t", [ "tfa", igno, "t", "t" ] ];
    var unit = [ "ttfn", "t", [ "tfn", "x", "t", "x" ] ];
    
    function everyoneVar( name ) {
        return [ "subkey", [ "everyone" ], [ "sym", name ] ];
    }
    
    add( true,
        [ "withsecret", "theUnit", everyoneVar( "theOneAndOnlyUnit" ),
            [ "define", "theUnit", [ "everyone" ],
                unitType, unit ] ] );
    add( true,
        [ "withsecret", "theReturn", everyoneVar( "returnOfTheUnit" ),
            [ "withsecret", "all", [ "everyone" ],
                [ "witheach", "theUnit",
                    everyoneVar( "theOneAndOnlyUnit" ), "all",
                    unitType,
                    [ "define", "theReturn", [ "everyone" ],
                        unitType, "theUnit" ] ] ] ] );
    add( true,
        [ "withsecret", "theTokenDefined",
            everyoneVar( "theTokenDefined" ),
            [ "withsecret", "theTokenSource",
                everyoneVar( "theTokenSource" ),
                [ "withtoken", "t", "theTokenSource",
                    [ "define", "theTokenDefined", [ "everyone" ],
                        [ "tokentype" ], "t" ] ] ] ] );
    
    // Free variables aren't allowed.
    add( false,
        [ "withsecret", "all", [ "everyone" ],
            [ "witheach", "theUnit",
                everyoneVar( "theOneAndOnlyUnit" ), "all",
                unitType,
                [ "define", "theReturn", [ "everyone" ],
                    unitType, "theUnit" ] ] ] );
})();
addShouldThrowUnitTest( function () {
    return checkUserAction( strMap(),
        [ "nonexistentSyntax", "a", "b", "c" ] );
} );
addShouldThrowUnitTest( function () {
    return checkUserAction( strMap(),
        !"a boolean rather than a nested Array of strings" );
} );
