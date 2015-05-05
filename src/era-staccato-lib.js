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
function stcAddYesDefAny( var_args ) {
    stcDefs = stcDefs.concat(
        desugarDefExpr( stcYesDefAny.apply( {}, arguments ) ) );
}

function stcErr( msg ) {
    // We return a value whose frame name is the given error message.
    return stcFrame( msg );
}

function stcRetErr( msg ) {
    return stcRet( stcErr( msg ) );
}


var stcCons = stcType( "cons", "car", "cdr" );
var stcYep = stcType( "yep", "val" );
var stcNope = stcType( "nope", "val" );
var stcNil = stcType( "nil" );

stcAddYesDefAny( "pass-to", "arg", "func",
    stcCall( stcv( "func" ), stcv( "arg" ) ) );

stcAddYesDefAny( "foldl-short-iter", "list", "combiner", "state",
    stcCons.cond( "foldl-short-iter-case1", "first", "rest",
        stcRet( stcv( "list" ) ),
        stcCase( "foldl-short-iter-case2", "combiner-result",
            stcCallFrame( "pass-to", "arg", stcv( "first" ),
                stcCall( stcv( "combiner" ),
                    stcRet( stcv( "state" ) ) ) ),
            
            stcYep, "result", stcRet( stcv( "combiner-result" ) ),
            
            stcNope, "result",
            stcCallFrame( "foldl-short-iter",
                "list", stcv( "rest" ),
                "combiner", stcv( "combiner" ),
                stcRet( stcv( "result" ) ) ),
            
            stcRetErr(
                "Expected a combiner-result of type yep or nope" ) ),
        stcRet( stcNope.make( stcv( "state" ) ) ) ) );

// TODO: Choose just one of these implementations of `foldl-iter`.

// This implements `foldl-iter` independently.
stcAddYesDefAny( "foldl-iter", "list", "combiner", "state",
    stcCons.cond( "foldl-iter-case", "first", "rest",
        stcRet( stcv( "list" ) ),
        stcCallFrame( "foldl-iter", "list", stcv( "rest" ),
            "combiner", stcv( "combiner" ),
            stcCallFrame( "pass-to", "arg", stcv( "first" ),
                stcCall( stcv( "combiner" ),
                    stcRet( stcv( "state" ) ) ) ) ),
        stcRet( stcv( "state" ) ) ) );

// This implements `foldl-iter` in terms of `foldl-short-iter`.
stcAddYesDefAny( "foldl-iter", "list", "combiner", "state",
    stcNope.cond( "foldl-iter-case", "result",
        stcCallFrame( "foldl-short-iter", "list", stcv( "list" ),
            "combiner",
            stcFnAny( "foldl-iter-adapter-1", "state",
                stcRetFnAny( "foldl-iter-adapter-2", "elem",
                    stcSaveRoot(
                        stcRet(
                            stcNope.make(
                                stcSave( "combiner-result", "foldl-iter-adapter-3",
                                    stcCallFrame( "pass-to", "arg", stcv( "elem" ),
                                        stcCall( stcv( "combiner" ),
                                            stcRet( stcv( "state" ) ) ) ) ) ) ) ) ) ),
            stcRet( stcv( "state" ) ) ),
        stcRet( stcv( "result" ) ),
        stcRetErr( "Internal error" ) ) );

// TODO: Choose just one of these implementations of
// `foldl-double-short-iter`.

// This implements `foldl-double-short-iter` independently.
stcAddYesDefAny( "foldl-double-short-iter",
    "list-a", "list-b", "combiner", "state",
    stcCons.cond( "foldl-double-short-iter-case1",
        "first-a", "rest-a",
        stcRet( stcv( "list-a" ) ),
        stcCons.cond( "foldl-double-short-iter-case2",
            "first-b", "rest-b",
            stcRet( stcv( "list-b" ) ),
            stcCase( "foldl-double-short-iter-case3",
                "combiner-result",
                stcCallFrame( "pass-to", "arg", stcv( "first-b" ),
                    stcCallFrame( "pass-to", "arg", stcv( "first-a" ),
                        stcCall( stcv( "combiner" ),
                            stcRet( stcv( "state" ) ) ) ) ),
                
                stcYep, "result", stcRet( stcv( "combiner-result" ) ),
                
                stcNope, "result",
                stcCallFrame( "foldl-double-short-iter",
                    "list-a", stcv( "rest-a" ),
                    "list-b", stcv( "rest-b" ),
                    "combiner", stcv( "combiner" ),
                    stcRet( stcv( "result" ) ) ),
                
                stcRetErr(
                    "Expected a combiner-result of type yep or nope"
                    ) ),
            stcRet( stcNope.make( stcv( "state" ) ) ) ),
        stcRet( stcNope.make( stcv( "state" ) ) ) ) );

// This implements `foldl-double-short-iter` in terms of
// `foldl-short-iter`.
stcAddYesDefAny( "foldl-double-short-iter",
    "list-a", "list-b", "combiner", "state",
    stcCase( "foldl-double-short-iter-case1", "short-result",
        stcCallFrame( "foldl-short-iter",
            "list", stcv( "list-a" ),
            "combiner",
            stcFnAny( "foldl-double-short-iter-adapter-1", "state",
                stcRetFnAny( "foldl-double-short-iter-adapter-2",
                    "elem-a",
                    stcCons.cond( "foldl-double-short-iter-case2",
                        "rest-b", "state",
                        stcRet( stcv( "state" ) ),
                        stcCons.cond(
                            "foldl-double-short-iter-case4",
                            "elem-b", "rest-b",
                            stcRet( stcv( "rest-b" ) ),
                            stcCase(
                                "foldl-double-short-iter-case5",
                                "combiner-result",
                                stcCallFrame( "pass-to",
                                    "arg", stcv( "elem-b" ),
                                    stcCallFrame( "pass-to", "arg", stcv( "elem-a" ),
                                        stcCall( stcv( "combiner" ), stcRet( stcv( "state" ) ) ) ) ),
                                
                                stcYep, "result", stcRet( stcYep.make( stcv( "combiner-result" ) ) ),
                                
                                stcNope, "result",
                                stcRet(
                                    stcNope.make(
                                        stcCons.make( stcv( "rest-b" ), stcv( "result" ) ) ) ),
                                
                                stcRetErr( "Expected a combiner-result of type yep or nope" ) ),
                            stcRet(
                                stcYep.make(
                                    stcNope.make( stcv( "state" ) ) ) ) ),
                        stcRetErr( "Internal error" ) ) ) ),
            stcRet(
                stcCons.make( stcv( "list-b" ), stcv( "state" ) ) ) ),
        
        stcYep, "result", stcRet( stcv( "result" ) ),
        
        stcNope, "result",
        stcRet(
            stcCons.cond( "foldl-double-short-iter-case6",
                "rest-b", "state",
                stcRet( stcv( "result" ) ),
                stcRet( stcNope.make( stcv( "state" ) ) ),
                stcRet( stcErr( "Internal error" ) ) ) ),
        
        stcRetErr( "Internal error" ) ) );

// TODO: Choose just one of these implementations of
// `foldl-double-iter`.

// This implements `foldl-double-iter` independently.
stcAddYesDefAny( "foldl-double-iter",
    "list-a", "list-b", "combiner", "state",
    stcCons.cond( "foldl-double-iter-case1", "first-a", "rest-a",
        stcRet( stcv( "list-a" ) ),
        stcCons.cond( "foldl-double-iter-case2", "first-b", "rest-b",
            stcRet( stcv( "list-b" ) ),
            stcCallFrame( "foldl-double-iter",
                "list-a", stcv( "rest-a" ),
                "list-b", stcv( "rest-b" ),
                "combiner", stcv( "combiner" ),
                stcCallFrame( "pass-to", "arg", stcv( "first-b" ),
                    stcCallFrame( "pass-to",
                        "arg", stcv( "first-a" ),
                        stcCall( stcv( "combiner" ),
                            stcRet( stcv( "state" ) ) ) ) ) ),
            stcRet( stcv( "state" ) ) ),
        stcRet( stcv( "state" ) ) ) );

// This implements `foldl-double-iter` in terms of
// `foldl-double-short-iter`.
stcAddYesDefAny( "foldl-double-iter",
    "list-a", "list-b", "combiner", "state",
    stcNope.cond( "foldl-double-iter-case", "result",
        stcCallFrame( "foldl-double-short-iter",
            "list-a", stcv( "list-a" ),
            "list-b", stcv( "list-b" ),
            "combiner",
            stcFnAny( "foldl-double-iter-adapter-1", "state",
                stcRetFnAny( "foldl-double-iter-adapter-2", "elem-a",
                    stcRetFnAny( "foldl-double-iter-adapter-3",
                        "elem-b",
                        stcSaveRoot(
                            stcRet(
                                stcNope.make(
                                    stcSave( "combiner-result", "foldl-double-iter-adapter-4",
                                        stcCallFrame( "pass-to", "arg", stcv( "elem-b" ),
                                            stcCallFrame( "pass-to", "arg", stcv( "elem-a" ),
                                                stcCall( stcv( "combiner" ),
                                                    stcRet( stcv( "state" ) ) ) ) ) ) ) ) ) ) ) ),
            stcRet( stcv( "state" ) ) ),
        stcRet( stcv( "result" ) ),
        stcRetErr( "Internal error" ) ) );

// TODO: Choose just one of these implementations of `rev-onto`.

// This implements `rev-onto` independently.
stcAddYesDef( "rev-onto", "target",
    stcCons.match( "first", "rest",
        stcCallFrame( "rev-onto", "target",
            stcCons.make( stcv( "first" ), stcv( "target" ) ),
            stcRet( stcv( "rest" ) ) ),
        jsList( "any", stcRet( stcv( "target" ) ) ) ) );

// This implements `rev-onto` in terms of `foldl-iter`.
stcAddYesDefAny( "rev-onto", "target", "source",
    stcCallFrame( "foldl-iter", "list", stcv( "source" ),
        "combiner",
        stcFnAny( "rev-onto-adapter-1", "state",
            stcRetFnAny( "rev-onto-adapter-2", "elem",
                stcRet(
                    stcCons.make(
                        stcv( "elem" ), stcv( "state" ) ) ) ) ),
        stcRet( stcv( "target" ) ) ) );

stcAddYesDefAny( "rev", "source",
    stcCallFrame( "rev-onto", "target", stcNil.make(),
        stcRet( stcv( "source" ) ) ) );

stcAddYesDefAny( "append", "past", "rest",
    stcCallFrame( "rev-onto", "target", stcv( "rest" ),
        stcCallFrame( "rev", stcRet( stcv( "past" ) ) ) ) );

// TODO: Choose just one of these implementations of `map-iter`.

// This implements `map-iter` independently assuming unbounded stack
// size. (If we had a `foldr` of some sort, this could use that.)
stcAddYesDef( "map-iter", "func",
    stcCons.match( "elem", "rest",
        stcSaveRoot(
            stcRet(
                stcCons.make(
                    stcSave( "func-result", "map-iter-inner-1",
                        stcCall( stcv( "func" ),
                            stcRet( stcv( "elem" ) ) ) ),
                    stcSave( "rest-result", "map-iter-inner-2",
                        stcCallFrame( "map-iter",
                            "func", stcv( "func" ),
                            stcRet( stcv( "rest" ) ) ) ) ) ) ),
        jsList( "any", stcRet( stcNil.make() ) ) ) );

// TODO: Add calls to stcRet( _ ) wherever appropriate from here down.

// This implements `map-iter` independently and with bounded stack
// size.
stcAddYesDefAny( "map-iter", "func", "list",
    jsList( "let-def",
        stcYesDef( "rev-onto-map-iter", "func", "target",
            stcCons.match( "elem", "rest",
                stcSaveRoot(
                    stcCallFrame( "rev-onto-map-iter",
                        "func", stcv( "func" ),
                        "target",
                        stcCons.make(
                            stcSave( "func-result",
                                "rev-onto-map-iter-inner-1",
                                stcCall( stcv( "func" ),
                                    stcv( "elem" ) ) ),
                            stcv( "target" ) ),
                        stcv( "rest" ) ) ),
                jsList( "any", stcv( "target" ) ) ) ),
        stcCallFrame( "rev",
            stcCallFrame( "rev-onto-map-iter", "func", stcv( "func" ),
                "target", stcNil.make(),
                stcv( "list" ) ) ) ) );

// This implements `map-iter` in terms of `foldl-iter` and with
// bounded stack size.
stcAddYesDefAny( "map-iter", "func", "list",
    stcCallFrame( "rev",
        stcCallFrame( "foldl-iter", "list", stcv( "list" ),
            "combiner",
            stcFnAny( "map-iter-adapter-1", "state",
                stcFnAny( "map-iter-adapter-2", "elem",
                    stcSaveRoot(
                        stcCons.make(
                            stcSave( "func-result",
                                "map-iter-adapter-3",
                                stcCall( stcv( "func" ),
                                    stcv( "elem" ) ) ),
                            stcv( "state" ) ) ) ) ),
            stcNil.make() ) ) );

// TODO: Choose just one of these implementations of `any-iter`.

// This implements `any-iter` independently.
stcAddYesDef( "any-iter", "func",
    stcCons.match( "first", "rest",
        stcCase( "any-iter-case", "func-result",
            stcCall( stcv( "func" ), stcv( "first" ) ),
            
            stcYep, "result", stcv( "func-result" ),
            
            stcNope, "result",
            stcCallFrame( "any-iter", "func", stcv( "func" ),
                stcv( "rest" ) ),
            
            stcErr( "Expected a func-result of type yep or nope" ) ),
        jsList( "any", stcNope.make( stcNil.make() ) ) ) );

// This implements `any-iter` in terms of `foldl-short-iter`.
stcAddYesDefAny( "any-iter", "func", "list",
    stcCallFrame( "foldl-short-iter", "list", stcv( "list" ),
        "combiner",
        stcFnAny( "any-iter-adapter-1", "state",
            stcFnAny( "any-iter-adapter-2", "elem",
                stcCase( "any-iter-case", "func-result",
                    stcCall( stcv( "func" ), stcv( "elem" ) ),
                    
                    stcYep, "result", stcv( "func-result" ),
                    
                    stcNope, "result", stcNope.make( stcNil.make() ),
                    
                    stcErr(
                        "Expected a func-result of type yep or nope"
                        ) ) ) ),
        stcNil.make() ) );

// TODO: Choose just one of these implementations of `any-double`.

// This implements `any-double` independently.
stcAddYesDefAny( "any-double", "list-a", "list-b", "func",
    stcCons.cond( "any-double-case1", "first-a", "rest-a",
        stcv( "list-a" ),
        stcCons.cond( "any-double-case2", "first-b", "rest-b",
            stcv( "list-b" ),
            stcCase( "any-double-case3", "func-result",
                stcCallFrame( "pass-to", "arg", stcv( "first-b" ),
                    stcCall( stcv( "func" ), stcv( "first-a" ) ) ),
                
                stcYep, "result", stcv( "func-result" ),
                
                stcNope, "result",
                stcCallFrame( "any-double",
                    "list-a", stcv( "rest-a" ),
                    "list-b", stcv( "rest-b" ),
                    stcv( "func" ) ),
                
                stcErr(
                    "Expected a func-result of type yep or nope" ) ),
            stcNope.make( stcNil.make() ) ),
        stcNope.make( stcNil.make() ) ) );

// This implements `any-double` in terms of `foldl-double-short-iter`.
stcAddYesDefAny( "any-double", "list-a", "list-b", "func",
    stcCallFrame( "foldl-double-short-iter",
        "list-a", stcv( "list-a" ),
        "list-b", stcv( "list-b" ),
        "combiner",
        stcFnAny( "any-double-adapter-1", "state",
            stcFnAny( "any-double-adapter-2", "elem-a",
                stcFnAny( "any-double-adapter-3", "elem-b",
                    stcCase( "any-double-case", "func-result",
                        stcCallFrame( "pass-to",
                            "arg", stcv( "elem-b" ),
                            stcCall( stcv( "func" ),
                                stcv( "elem-a" ) ) ),
                        
                        stcYep, "result", stcv( "func-result" ),
                        
                        stcNope, "result",
                        stcNope.make( stcNil.make() ),
                        
                        stcErr(
                            "Expected a func-result of type yep or " +
                            "nope" ) ) ) ) ),
        stcNil.make() ) );

stcAddYesDef( "not-yep-nope",
    stcYep.match( "val", stcNope.make( stcv( "val" ) ),
        stcNope.match( "val", stcYep.make( stcv( "val" ) ),
            jsList( "any",
                stcErr(
                    "Expected a yep-nope of type yep or nope"
                    ) ) ) ) );

stcAddYesDefAny( "all-iter", "func", "list",
    stcCallFrame( "not-yep-nope",
        stcCallFrame( "any-iter",
            "func",
            stcFnAny( "all-iter-adapter-1", "elem",
                stcCallFrame( "not-yep-nope",
                    stcCall( stcv( "func" ), stcv( "elem" ) ) ) ),
            stcv( "list" ) ) ) );

stcAddYesDefAny( "cut", "list-to-measure-by", "list-to-cut",
    stcCallFrame( "foldl-iter", "list", stcv( "list-to-measure-by" ),
        "combiner",
        stcFnAny( "cut-adapter-1", "state",
            stcFnAny( "cut-adapter-2", "ignored-elem",
                stcCons.cond( "cut-case1", "rev-before", "after",
                    stcv( "state" ),
                    stcCons.cond( "cut-case2", "first", "after",
                        stcv( "after" ),
                        stcCons.make(
                            stcCons.make( stcv( "first" ),
                                stcv( "rev-before" ) ),
                            stcv( "after" ) ),
                        stcErr(
                            "Expected a list-to-measure-by no " +
                            "longer than the list-to-cut" ) ),
                    stcErr( "Internal error" ) ) ) ),
        stcCons.make( stcNil.make(), stcv( "list-to-cut" ) ) ) );

stcAddYesDef( "tails",
    jsList( "let-case", "lists",
        stcCons.match( "list-a", "list-b",
            stcCons.cond( "tails-case1", "elem-a", "list-a",
                stcv( "list-a" ),
                stcCons.cond( "tails-case2", "elem-b", "list-b",
                    stcv( "list-b" ),
                    stcCallFrame( "tails",
                        stcCons.make(
                            stcv( "list-a" ),
                            stcv( "list-b" ) ) ),
                    stcv( "lists" ) ),
                stcv( "lists" ) ),
            jsList( "any",
                stcErr(
                    "Expected a lists value of type cons" ) ) ) ) );


// TODO: Move this testing code somewhere better.

stcAddYesDef( "test-let",
    jsList( "any",
        stcLet(
            "x", stcNope.make( stcNil.make() ),
            "y", stcYep.make( stcNil.make() ),
            stcLet( "x", stcv( "y" ), "y", stcv( "x" ),
                stcRet(
                    stcCons.make( stcv( "x" ),
                        stcv( "y" ) ) ) ) ) ) );

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

arrEach( stcDefs, function ( def ) {
    Function( "defs", "Stc",
        parseSyntax( "def", def ).compileToNaiveJs( {} )
    )( defs, Stc );
} );

function testStcDef( frameTag, frameVars, arg ) {

    var callFrameVars = makeFrameVars( strMap().plusArrTruth( [
        [ "va:va", "func" ],
        [ "va:va", "arg" ]
    ] ) );
    var callFrameFuncI = callFrameVars[ 0 ] === "func" ? 0 : 1;
    var callFrameArgI = callFrameVars[ 0 ] === "func" ? 1 : 0;
    var callFrameTag =
        JSON.stringify( [ "call", callFrameVars ] );
    var returnFrameValI = 0;
    var returnFrameTag =
        JSON.stringify( [ "return", [ "val" ] ] );
    
    var maxStackDepth = 0;
    var calls = 0;
    
    var stack = [ new Stc( frameTag, frameVars ) ];
    var comp = arg;
    while ( true ) {
        if ( !(comp instanceof Stc) )
            throw new Error();
        while ( comp.frameTag === callFrameTag ) {
            stack.push( comp.frameVars[ callFrameFuncI ] );
            comp = comp.frameVars[ callFrameArgI ];
            if ( !(comp instanceof Stc) )
                throw new Error();
        }
        if ( comp.frameTag !== returnFrameTag ) {
            // TODO: Once we've finished inserting stcRet() all over
            // the place, stop being so forgiving.
            comp = new Stc( returnFrameTag, [ comp ] );
//            throw new Error();
        }
        var result = comp.frameVars[ returnFrameValI ];
        var n = stack.length;
        if ( n === 0 )
            break;
        comp = stack.pop().call( result );
        
        if ( maxStackDepth < n )
            maxStackDepth = n;
        calls++;
    }
    
    console.log( result.pretty() );
    console.log(
        "in " + calls + " " + (calls === 1 ? "call" : "calls") + " " +
        "with a maximum stack depth of " + maxStackDepth );
}

testStcDef( JSON.stringify( [ "rev", [] ] ), [],
    stcCons.makeStc( stcYep.makeStc( stcNil.makeStc() ),
        stcCons.makeStc( stcNope.makeStc( stcNil.makeStc() ),
            stcNil.makeStc() ) ) );

testStcDef( JSON.stringify( [ "rev", [] ] ), [], stcNil.makeStc() );

testStcDef( JSON.stringify( [ "not-yep-nope", [] ] ), [],
    stcYep.makeStc( stcNil.makeStc() ) );

testStcDef( JSON.stringify( [ "test-let", [] ] ), [],
    stcNil.makeStc() );
