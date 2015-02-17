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
    stcCallFrame( "foldl-short-iter", "list", stcv( "list" ),
        "combiner",
        stcFn( "any-iter-adapter-1", "state",
            stcFn( "any-iter-adapter-2", "elem",
                stcYep.cond( "result",
                    stcSave( "func-result", "any-iter-adapter-3",
                        jsList( "call", stcv( "func" ),
                            stcv( "elem" ) ) ),
                    stcv( "func-result" ),
                    stcNope.cond( "result", stcv( "func-result" ),
                        stcNope.make( stcNil.make() ),
                        stcErr(
                            "Expected a func-result of type yep or " +
                            "nope" ) ) ) ) ),
        stcNil.make() ) );

// TODO: Choose just one of these implementations of `any-double`.

// This implements `any-double` independently.
stcAddYesDef( "any-double", "list-a", "list-b", "func",
    stcCons.cond( "first-a", "rest-a", stcv( "list-a" ),
        stcCons.cond( "first-b", "rest-b", stcv( "list-b" ),
            stcYep.cond( "result",
                stcSave( "func-result", "any-double-inner-1",
                    stcCallFrame( "pass-to", "arg", stcv( "first-b" ),
                        jsList( "call", stcv( "func" ),
                            stcv( "first-a" ) ) ) ),
                stcv( "func-result" ),
                stcNope.cond( "result", stcv( "func-result" ),
                    stcCallFrame( "any-double",
                        "list-a", stcv( "rest-a" ),
                        "list-b", stcv( "rest-b" ),
                        stcv( "func" ) ),
                    stcErr(
                        "Expected a func-result of type yep or " +
                        "nope" ) ) ),
            stcNope.make( stcNil.make() ) ),
        stcNope.make( stcNil.make() ) ) );

// This implements `any-double` in terms of `foldl-double-short-iter`.
stcAddYesDef( "any-double", "list-a", "list-b", "func",
    stcCallFrame( "foldl-double-short-iter",
        "list-a", stcv( "list-a" ),
        "list-b", stcv( "list-b" ),
        "combiner",
        stcFn( "any-double-adapter-1", "state",
            stcFn( "any-double-adapter-2", "elem-a",
                stcFn( "any-double-adapter-3", "elem-b",
                    stcYep.cond( "result",
                        stcSave( "func-result",
                            "any-double-adapter-4",
                            stcCallFrame( "pass-to",
                                "arg", stcv( "elem-b" ),
                                jsList( "call", stcv( "func" ),
                                    stcv( "elem-a" ) ) ) ),
                        stcv( "func-result" ),
                        stcNope.cond( "result",
                            stcv( "func-result" ),
                            stcNope.make( stcNil.make() ),
                            stcErr(
                                "Expected a func-result of type " +
                                "yep or nope" ) ) ) ) ) ),
        stcNil.make() ) );

stcAddYesDef( "not-yep-nope", "yep-nope",
    stcYep.cond( "val", stcv( "yep-nope" ),
        stcNope.make( stcv( "val" ) ),
        stcNope.cond( "val", stcv( "yep-nope" ),
            stcYep.make( stcv( "val" ) ),
            stcErr( "Expected a yep-nope of type yep or nope" ) ) ) );

stcAddYesDef( "all-iter", "func", "list",
    stcCallFrame( "not-yep-nope",
        stcCallFrame( "any-iter",
            "func",
            stcFn( "all-iter-adapter-1", "elem",
                stcCallFrame( "not-yep-nope",
                    jsList( "call", stcv( "func" ),
                        stcv( "elem" ) ) ) ),
            stcv( "list" ) ) ) );

stcAddYesDef( "cut", "list-to-measure-by", "list-to-cut",
    stcCallFrame( "foldl-iter", "list", stcv( "list-to-measure-by" ),
        "combiner",
        stcFn( "cut-adapter-1", "state",
            stcFn( "cut-adapter-2", "ignored-elem",
                stcCons.cond( "rev-before", "after", stcv( "state" ),
                    stcCons.cond( "first", "after", stcv( "after" ),
                        stcCons.make(
                            stcCons.make( stcv( "first" ),
                                stcv( "rev-before" ) ),
                            stcv( "after" ) ),
                        stcErr(
                            "Expected a list-to-measure-by no " +
                            "longer than the list-to-cut" ) ),
                    stcErr( "Internal error" ) ) ) ),
        stcCons.make( stcNil.make(), stcv( "list-to-cut" ) ) ) );

stcAddYesDef( "tails", "lists",
    stcCons.cond( "list-a", "list-b", stcv( "lists" ),
        stcCons.cond( "elem-a", "list-a", stcv( "list-a" ),
            stcCons.cond( "elem-b", "list-b", stcv( "list-b" ),
                stcCallFrame( "tails",
                    stcCons.make(
                        stcv( "list-a" ), stcv( "list-b" ) ) ),
                stcv( "lists" ) ),
            stcv( "lists" ) ),
        stcErr( "Expected a lists value of type cons" ) ) );


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

var defs = {};
function Stc( frameTag, opt_frameVars ) {
    this.frameTag = frameTag;
    this.frameVars = opt_frameVars || [];
}
Stc.prototype.call = function ( arg ) {
    var func = defs[ this.frameTag ];
    return func( this.frameVars, arg );
};
Stc.prototype.pretty = function () {
    return "(" + this.frameTag +
        arrMap( this.frameVars, function ( elem, i ) {
            return " " + elem.pretty();
        } ).join( "" ) + ")";
};
function StcPendingFrame( frame, next ) {
    this.frame = frame;
    this.next = next;
}

var testWithSavable = true;
arrEach( stcDefs, function ( def ) {
    Function( "defs", "Stc", "StcPendingFrame",
        parseSyntax( "def", def ).compileToNaiveJs( {
            savable: testWithSavable
        } )
    )( defs, Stc, StcPendingFrame );
} );

function testStcDef( frameTag, frameVars, arg ) {
    
    if ( testWithSavable ) {
        var maxStackDepth = 0;
        var calls = 0;
        
        var stack = [ new Stc( frameTag, frameVars ) ];
        var result = arg;
        while ( true ) {
            while ( result instanceof StcPendingFrame ) {
                stack.push( result.frame );
                result = result.next;
            }
            if ( !(result instanceof Stc) )
                throw new Error();
            var n = stack.length;
            if ( n === 0 )
                break;
            result = stack.pop().call( result );
            
            if ( maxStackDepth < n )
                maxStackDepth = n;
            calls++;
        }
    } else {
        var result = new Stc( frameTag, frameVars ).call( arg );
    }
    
    console.log( result.pretty() );
    
    if ( testWithSavable )
        console.log(
            "in " + calls + " " + (calls === 1 ? "call" : "calls") +
            " with a maximum stack depth of " + maxStackDepth );
}

testStcDef( JSON.stringify( [ "rev", [] ] ), [],
    stcCons.makeStc( stcYep.makeStc( stcNil.makeStc() ),
        stcCons.makeStc( stcNope.makeStc( stcNil.makeStc() ),
            stcNil.makeStc() ) ) );

testStcDef( JSON.stringify( [ "rev", [] ] ), [], stcNil.makeStc() );

testStcDef( JSON.stringify( [ "not-yep-nope", [] ] ), [],
    stcYep.makeStc( stcNil.makeStc() ) );
