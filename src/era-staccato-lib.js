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

stcAddYesDef( "rev-onto", "target", "source",
    stcCons.cond( "first", "rest", stcv( "source" ),
        stcCallFrame( "rev-onto", "target",
            stcCons.make( stcv( "first" ), stcv( "target" ) ),
            stcv( "rest" ) ),
        stcv( "target" ) ) );

stcAddYesDef( "rev", "source",
    stcCallFrame( "rev-onto", "target", stcFrame( "nil" ),
        stcv( "source" ) ) );

stcAddYesDef( "append", "past", "rest",
    stcCallFrame( "rev-onto", "target", stcv( "rest" ),
        stcCallFrame( "rev", stcv( "past" ) ) ) );

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

stcAddYesDef( "foldl-iter", "list", "combiner", "state",
    stcCons.cond( "first", "rest", stcv( "list" ),
        stcCallFrame( "foldl-iter", "list", stcv( "rest" ),
            "combiner", stcv( "combiner" ),
            stcCallFrame( "pass-to", "arg", stcv( "first" ),
                jsList( "call", stcv( "combiner" ),
                    stcv( "state" ) ) ) ),
        stcv( "state" ) ) );

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


// TODO: Move this testing code somewhere better.
// TODO: Try more syntaxes above. Especially try something which uses
// (save ...) and (fn ...).

function staccatoPretty( expr ) {
    if ( expr === null ) {
        return "()";
    } else if ( isPrimString( expr ) ) {
        return /^[-a-z]*$/i.test( expr ) ? expr :
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
