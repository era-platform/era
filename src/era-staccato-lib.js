// era-staccato-lib.js
// Copyright 2015 Ross Angle. Released under the MIT License.
//
// These are utilities written in Staccato. For now, I'm porting the
// utilities from era-avl.js.
//
// See era-staccato.js for more information about what Staccato is.

var stcDefs = [];
function stcAddYesDef( var_args ) {
    stcDefs = stcDefs.concat(
        desugarDefExpr( stcYesDef.apply( {}, arguments ) ) );
}

function stcErr( msg ) {
    // We return a value whose frame name is the given error message.
    return stcFrame( msg );
}


var stcCons = stcType( "cons", "car", "cdr" );
var stcYep = stcType( "yep", "val" );
var stcNope = stcType( "nope", "val" );
var stcNil = stcType( "nil" );

stcAddYesDef( "pass-to", "arg", "func",
    jsList( "call", stcv( "func" ), stcv( "arg" ) ) );

stcAddYesDef( "foldl-short-iter", "list", "combiner", "state",
    stcCons.cond( "first", "rest", stcv( "list" ),
        stcYep.cond( "result",
            stcSave( "combiner-result",
                "foldl-short-with-combiner-result",
                stcCallFrame( "pass-to", "arg", stcv( "first" ),
                    jsList( "call", stcv( "combiner" ),
                        stcv( "state" ) ) ) ),
            stcv( "combiner-result" ),
            stcNope.cond( "result", stcv( "combiner-result" ),
                stcCallFrame( "foldl-short-iter",
                    "list", stcv( "rest" ),
                    "combiner", stcv( "combiner" ),
                    stcv( "result" ) ),
                stcErr(
                    "Expected a combiner-result of type yep or " +
                    "nope" ) ) ),
        stcNope.make( stcv( "state" ) ) ) );

// TODO: Choose just one of these implementations of `foldl-iter`.

// This implements `foldl-iter` independently.
stcAddYesDef( "foldl-iter", "list", "combiner", "state",
    stcCons.cond( "first", "rest", stcv( "list" ),
        stcCallFrame( "foldl-iter", "list", stcv( "rest" ),
            "combiner", stcv( "combiner" ),
            stcCallFrame( "pass-to", "arg", stcv( "first" ),
                jsList( "call", stcv( "combiner" ),
                    stcv( "state" ) ) ) ),
        stcv( "state" ) ) );

// This implements `foldl-iter` in terms of `foldl-short-iter`.
stcAddYesDef( "foldl-iter", "list", "combiner", "state",
    stcNope.cond( "result",
        stcSave( "short-result", "foldl-iter-inner-1",
            stcCallFrame( "foldl-short-iter", "list", stcv( "list" ),
                "combiner",
                stcFn( "foldl-iter-adapter-1", "state",
                    stcFn( "foldl-iter-adapter-2", "elem",
                        stcNope.make(
                            stcSave( "combiner-result",
                                "foldl-iter-adapter-3",
                                stcCallFrame( "pass-to",
                                    "arg", stcv( "elem" ),
                                    jsList( "call", stcv( "combiner" ),
                                        stcv( "state" ) ) ) ) ) ) ),
                stcv( "state" ) ) ),
        stcv( "result" ),
        stcErr( "Internal error" ) ) );

// TODO: Choose just one of these implementations of
// `foldl-double-short-iter`.

// This implements `foldl-double-short-iter` independently.
stcAddYesDef( "foldl-double-short-iter",
    "list-a", "list-b", "combiner", "state",
    stcCons.cond( "first-a", "rest-a", stcv( "list-a" ),
        stcCons.cond( "first-b", "rest-b", stcv( "list-b" ),
            stcYep.cond( "result",
                stcSave( "combiner-result",
                    "foldl-double-short-with-combiner-result",
                    stcCallFrame( "pass-to", "arg", stcv( "first-b" ),
                        stcCallFrame( "pass-to",
                            "arg", stcv( "first-a" ),
                            jsList( "call", stcv( "combiner" ),
                                stcv( "state" ) ) ) ) ),
                stcv( "combiner-result" ),
                stcNope.cond( "result", stcv( "combiner-result" ),
                    stcCallFrame( "foldl-double-short-iter",
                        "list-a", stcv( "rest-a" ),
                        "list-b", stcv( "rest-b" ),
                        "combiner", stcv( "combiner" ),
                        stcv( "result" ) ),
                    stcErr(
                        "Expected a combiner-result of type yep or " +
                        "nope" ) ) ),
            stcNope.make( stcv( "state" ) ) ),
        stcNope.make( stcv( "state" ) ) ) );

// This implements `foldl-double-short-iter` in terms of
// `foldl-short-iter`.
stcAddYesDef( "foldl-double-short-iter",
    "list-a", "list-b", "combiner", "state",
    stcYep.cond( "result",
        stcSave( "short-result", "foldl-double-short-iter-inner-1",
            stcCallFrame( "foldl-short-iter",
                "list", stcv( "list-a" ),
                "combiner",
                stcFn( "foldl-double-short-iter-adapter-1", "state",
                    stcFn( "foldl-double-short-iter-adapter-2",
                        "elem-a",
                        stcCons.cond( "rest-b", "state",
                            stcv( "state" ),
                            stcCons.cond( "elem-b", "rest-b",
                                stcv( "rest-b" ),
                                stcYep.cond( "result",
                                    stcSave( "combiner-result", "foldl-double-short-iter-adapter-3",
                                        stcCallFrame( "pass-to", "arg", stcv( "elem-b" ),
                                            stcCallFrame( "pass-to", "arg", stcv( "elem-a" ),
                                                jsList( "call", stcv( "combiner" ),
                                                    stcv( "state" ) ) ) ) ),
                                    stcYep.make( stcv( "combiner-result" ) ),
                                    stcNope.cond( "result", stcv( "combiner-result" ),
                                        stcNope.make(
                                            stcCons.make( stcv( "rest-b" ), stcv( "result" ) ) ),
                                        stcErr( "Expected a combiner-result of type yep or nope" ) ) ),
                                stcYep.make(
                                    stcNope.make( stcv( "state" ) ) ) ),
                            stcErr( "Internal error" ) ) ) ),
                stcCons.make( stcv( "list-b" ), stcv( "state" ) ) ) ),
        stcv( "result" ),
        stcNope.cond( "result", stcv( "short-result" ),
            stcCons.cond( "rest-b", "state", stcv( "result" ),
                stcNope.make( stcv( "state" ) ),
                stcErr( "Internal error" ) ),
            stcErr( "Internal error" ) ) ) );

// TODO: Choose just one of these implementations of
// `foldl-double-iter`.

// This implements `foldl-double-iter` independently.
stcAddYesDef( "foldl-double-iter",
    "list-a", "list-b", "combiner", "state",
    stcCons.cond( "first-a", "rest-a", stcv( "list-a" ),
        stcCons.cond( "first-b", "rest-b", stcv( "list-b" ),
            stcCallFrame( "foldl-double-iter",
                "list-a", stcv( "rest-a" ),
                "list-b", stcv( "rest-b" ),
                "combiner", stcv( "combiner" ),
                stcCallFrame( "pass-to", "arg", stcv( "first-b" ),
                    stcCallFrame( "pass-to",
                        "arg", stcv( "first-a" ),
                        jsList( "call", stcv( "combiner" ),
                            stcv( "state" ) ) ) ) ),
            stcv( "state" ) ),
        stcv( "state" ) ) );

// This implements `foldl-double-iter` in terms of
// `foldl-double-short-iter`.
stcAddYesDef( "foldl-double-iter",
    "list-a", "list-b", "combiner", "state",
    stcNope.cond( "result",
        stcSave( "short-result", "foldl-double-iter-inner-1",
            stcCallFrame( "foldl-double-short-iter",
                "list-a", stcv( "list-a" ),
                "list-b", stcv( "list-b" ),
                "combiner",
                stcFn( "foldl-double-iter-adapter-1", "state",
                    stcFn( "foldl-double-iter-adapter-2", "elem-a",
                        stcFn( "foldl-double-iter-adapter-3", "elem-b",
                            stcNope.make(
                                stcSave( "combiner-result",
                                    "foldl-double-iter-adapter-4",
                                    stcCallFrame( "pass-to", "arg", stcv( "elem-b" ),
                                        stcCallFrame( "pass-to", "arg", stcv( "elem-a" ),
                                            jsList( "call", stcv( "combiner" ),
                                                stcv( "state" ) ) ) ) ) ) ) ) ),
                stcv( "state" ) ) ),
        stcv( "result" ),
        stcErr( "Internal error" ) ) );

// TODO: Choose just one of these implementations of `rev-onto`.

// This implements `rev-onto` independently.
stcAddYesDef( "rev-onto", "target", "source",
    stcCons.cond( "first", "rest", stcv( "source" ),
        stcCallFrame( "rev-onto", "target",
            stcCons.make( stcv( "first" ), stcv( "target" ) ),
            stcv( "rest" ) ),
        stcv( "target" ) ) );

// This implements `rev-onto` in terms of `foldl-iter`.
stcAddYesDef( "rev-onto", "target", "source",
    stcCallFrame( "foldl-iter", "list", stcv( "source" ),
        "combiner",
        stcFn( "rev-onto-adapter-1", "state",
            stcFn( "rev-onto-adapter-2", "elem",
                stcCons.make( stcv( "elem" ), stcv( "state" ) ) ) ),
        stcv( "target" ) ) );

stcAddYesDef( "rev", "source",
    stcCallFrame( "rev-onto", "target", stcNil.make(),
        stcv( "source" ) ) );

stcAddYesDef( "append", "past", "rest",
    stcCallFrame( "rev-onto", "target", stcv( "rest" ),
        stcCallFrame( "rev", stcv( "past" ) ) ) );

// TODO: Choose just one of these implementations of `map-iter`.

// This implements `map-iter` independently assuming unbounded stack
// size. (If we had a `foldr` of some sort, this could use that.)
stcAddYesDef( "map-iter", "func", "list",
    stcCons.cond( "elem", "rest", stcv( "list" ),
        stcCons.make(
            stcSave( "combiner-result", "map-iter-inner-1",
                jsList( "call", stcv( "func" ), stcv( "elem" ) ) ),
            stcSave( "combiner-result", "map-iter-inner-2",
                stcCallFrame( "map-iter", "func", stcv( "func" ),
                    stcv( "rest" ) ) ) ),
        stcNil.make() ) );

// This implements `map-iter` independently and with bounded stack
// size.
stcAddYesDef( "map-iter", "func", "list",
    jsList( "let-def",
        stcYesDef( "rev-onto-map-iter", "func", "target", "source",
            stcCons.cond( "elem", "rest", stcv( "source" ),
                stcCallFrame( "rev-onto-map-iter",
                    "func", stcv( "func" ),
                    "target",
                    stcCons.make(
                        stcSave( "combiner-result",
                            "rev-onto-map-iter-inner-1",
                            jsList( "call", stcv( "func" ),
                                stcv( "elem" ) ) ),
                        stcv( "target" ) ),
                    stcv( "source" ) ),
                stcv( "target" ) ) ),
        stcCallFrame( "rev",
            stcCallFrame( "rev-onto-map-iter", "func", stcv( "func" ),
                "target", stcNil.make(),
                stcv( "list" ) ) ) ) );

// This implements `map-iter` in terms of `foldl-iter` and with
// bounded stack size.
stcAddYesDef( "map-iter", "func", "list",
    stcCallFrame( "rev",
        stcCallFrame( "foldl-iter", "list", stcv( "list" ),
            "combiner",
            stcFn( "map-iter-adapter-1", "state",
                stcFn( "map-iter-adapter-2", "elem",
                    stcCons.make(
                        stcSave( "combiner-result",
                            "map-iter-adapter-3",
                            jsList( "call", stcv( "func" ),
                                stcv( "elem" ) ) ),
                        stcv( "state" ) ) ) ),
            stcNil.make() ) ) );

// TODO: Choose just one of these implementations of `any-iter`.

// This implements `any-iter` independently.
stcAddYesDef( "any-iter", "func", "list",
    stcCons.cond( "first", "rest", stcv( "list" ),
        stcYep.cond( "result",
            stcSave( "func-result", "any-iter-inner-1",
                jsList( "call", stcv( "func" ), stcv( "first" ) ) ),
            stcv( "func-result" ),
            stcNope.cond( "result", stcv( "func-result" ),
                stcCallFrame( "any-iter", "func", stcv( "func" ),
                    stcv( "rest" ) ),
                stcErr(
                    "Expected a func-result of type yep or " +
                    "nope" ) ) ),
        stcNope.make( stcNil.make() ) ) );

// This implements `any-iter` in terms of `foldl-short-iter`.
stcAddYesDef( "any-iter", "func", "list",
    stcSave( "fold-result", "any-iter-inner-1",
        stcCallFrame( "foldl-short-iter", "list", stcv( "list" ),
            "combiner",
            stcFn( "any-iter-adapter-1", "state",
                stcFn( "any-iter-adapter-2", "elem",
                    stcYep.cond( "result",
                        stcSave( "func-result", "any-iter-adapter-3",
                            jsList( "call", stcv( "func" ),
                                stcv( "elem" ) ) ),
                        stcv( "func-result" ),
                        stcNope.cond( "result",
                            stcv( "func-result" ),
                            stcNope.make( stcNil.make() ),
                            stcErr(
                                "Expected a func-result of type " +
                                "yep or nope" ) ) ) ) ),
            stcNil.make() ) ) );

stcAddYesDef( "not-yep-nope", "yep-nope",
    stcYep.cond( "val", stcv( "yep-nope" ),
        stcNope.make( stcv( "val" ) ),
        stcNope.cond( "val", stcv( "yep-nope" ),
            stcYep.make( stcv( "val" ) ),
            stcErr( "Expected a yep-nope of type yep or nope" ) ) ) );


// TODO: Move this testing code somewhere better.

function staccatoPretty( expr ) {
    if ( expr === null ) {
        return "()";
    } else if ( isPrimString( expr ) ) {
        return /^[-a-z01-9]*$/i.test( expr ) ? expr :
            JSON.stringify( expr );
    } else if ( likeJsCons( expr ) ) {
        if ( expr.rest === null ) {
            if ( expr.first === null || likeJsCons( expr.first ) ) {
                return "(/" +
                    staccatoPretty( expr.first ).substring( 1 );
            } else {
                return "(" + staccatoPretty( expr.first ) + ")";
            }
        } else if ( likeJsCons( expr.rest ) ) {
            return "(" + staccatoPretty( expr.first ) + " " +
                staccatoPretty( expr.rest ).substring( 1 );
        } else {
            return "(" + staccatoPretty( expr.first ) + " . " +
                staccatoPretty( expr.rest ) + ")";
        }
    } else {
        throw new Error();
    }
}

console.log( arrMap( stcDefs, function ( def ) {
    return staccatoPretty( def );
} ) );
