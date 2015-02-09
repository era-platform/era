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


var stcCons = stcType( "cons", "car", "cdr" );

stcAddYesDef( "rev-onto", "target", "source",
    stcCons.cond( "car", "cdr", stcv( "source" ),
        stcCallFrame( "rev-onto", "target",
            stcCons.make( stcv( "car" ), stcv( "target" ) ),
            stcv( "cdr" ) ),
        stcv( "target" ) ) ) );

stcAddYesDef( "rev", "source",
    stcCallFrame( "rev-onto", "target", stcFrame( "nil" ),
        stcv( "source" ) ) ) );

stcAddYesDef( "append", "past", "rest",
    stcCallFrame( "rev-onto", "target", stcv( "rest" ),
        stcCallFrame( "rev", stcv( "past" ) ) ) ) );

stcAddYesDef( "pass-to", "arg", "func",
    jsList( "call", stcv( "func" ), stcv( "arg" ) ) ) );

stcAddYesDef( "foldl-iter", "list", "combiner", "init",
    stcCons.cond( "car", "cdr", stcv( "list" ),
        stcCallFrame( "foldl-iter",
            "list", stcv( "cdr" ),
            "combiner", stcv( "combiner" ),
            stcCallFrame( "pass-to", "arg", stcv( "car" ),
                jsList( "call", stcv( "combiner" ),
                    stcv( "init" ) ) ) ),
        stcv( "init" ) ) ) );


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
