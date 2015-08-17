// era-staccato-lib-gensym.js
// Copyright 2015 Ross Angle. Released under the MIT License.
//
// These are utilities written in Staccato. For now, I'm porting the
// utilities from era-avl.js.
//
// See era-staccato.js for more information about what Staccato is.

var stcNextGensymI = 0;
function stcGensym() {
    return "gs-" + stcNextGensymI++;
}


var stcDefs = [];
function stcAddDefun( var_args ) {
    var defun = stcDefun.apply( {}, arguments );
    stcDefs = stcDefs.concat( defun.defs );
    return defun.type;
}

function stcErr( msg ) {
    // We return a value whose frame name is the given error message.
    return stcFrame( msg );
}


var stcCons = stcType( "cons", "car", "cdr" );
var stcYep = stcType( "yep", "val" );
var stcNope = stcType( "nope", "val" );
var stcNil = stcType( "nil" );

var stcPassTo = stcAddDefun( "pass-to", "arg", "func",
    stcCall( "func", "arg" ) );

var stcFoldlShortIter = stcAddDefun( "foldl-short-iter",
    "list", "combiner", "state",
    stcCase( "list", "list", stcCons, "first", "rest",
        stcCase( "combiner-result",
            stcCall( "combiner", "state", "first" ),
            
            stcYep, "result", "combiner-result",
            
            stcNope, "result",
            stcCallFrame( "foldl-short-iter",
                "list", "rest", "combiner", "combiner", "result" ),
            
            stcErr(
                "Expected a combiner-result of type yep or nope" ) ),
        stcNope.of( "state" ) ) );

// TODO: Choose just one of these implementations of `foldl-iter`.

// This implements `foldl-iter` independently.
var stcFoldlIter = stcAddDefun( "foldl-iter",
    "list", "combiner", "state",
    stcCase( "list", "list", stcCons, "first", "rest",
        stcCallFrame( "foldl-iter", "list", "rest",
            "combiner", "combiner",
            stcCall( "combiner", "state", "first" ) ),
        "state" ) );

// This implements `foldl-iter` in terms of `foldl-short-iter`.
var stcFoldlIter = stcAddDefun( "foldl-iter",
    "list", "combiner", "state",
    stcCase( "short-result",
        stcFoldlShortIter.of( "list",
            stcFn( "state", "elem",
                stcNope.of(
                    stcCall( "combiner", "state", "elem" ) ) ),
            "state" ),
        
        stcNope, "result", "result",
        
        stcErr( "Internal error" ) ) );

// TODO: Choose just one of these implementations of
// `foldl-double-short-iter`.

// This implements `foldl-double-short-iter` independently.
var stcFoldlDoubleShortIter = stcAddDefun( "foldl-double-short-iter",
    "list-a", "list-b", "combiner", "state",
    stcCase( "list-a", "list-a", stcCons, "first-a", "rest-a",
        stcCase( "list-b", "list-b", stcCons, "first-b", "rest-b",
            stcCase( "combiner-result",
                stcCall( "combiner", "state", "first-a", "first-b" ),
                
                stcYep, "result", "combiner-result",
                
                stcNope, "result",
                stcCallFrame( "foldl-double-short-iter",
                    "list-a", "rest-a",
                    "list-b", "rest-b",
                    "combiner", "combiner",
                    "result" ),
                
                stcErr(
                    "Expected a combiner-result of type yep or " +
                    "nope" ) ),
            stcNope.of( "state" ) ),
        stcNope.of( "state" ) ) );

// This implements `foldl-double-short-iter` in terms of
// `foldl-short-iter`.
var stcFoldlDoubleShortIter = stcAddDefun( "foldl-double-short-iter",
    "list-a", "list-b", "combiner", "state",
    stcCase( "short-result",
        stcFoldlShortIter.of( "list-a",
            stcFn( "state", "elem-a",
                stcCase( "state", "state", stcCons, "rest-b", "state",
                    stcCase( "rest-b", "rest-b",
                        
                        stcCons, "elem-b", "rest-b",
                        stcCase( "combiner-result",
                            stcCall( "combiner",
                                "state", "elem-a", "elem-b" ),
                            
                            stcYep, "result",
                            stcYep.of( "combiner-result" ),
                            
                            stcNope, "result",
                            stcNope.of(
                                stcCons.of( "rest-b", "result" ) ),
                            
                            stcErr(
                                "Expected a combiner-result of " +
                                "type yep or nope" ) ),
                        
                        stcYep.of( stcNope.of( "state" ) ) ),
                    stcErr( "Internal error" ) ) ),
            stcCons.of( "list-b", "state" ) ),
        
        stcYep, "result", "short-result",
        
        stcNope, "result",
        stcCase( "result", "result", stcCons, "rest-b", "state",
            stcNope.of( "state" ),
            stcErr( "Internal error" ) ),
        
        stcErr( "Internal error" ) ) );

// TODO: Choose just one of these implementations of
// `foldl-double-iter`.

// This implements `foldl-double-iter` independently.
var stcFoldlDoubleIter = stcAddDefun( "foldl-double-iter",
    "list-a", "list-b", "combiner", "state",
    stcCase( "list-a", "list-a", stcCons, "first-a", "rest-a",
        stcCase( "list-b", "list-b", stcCons, "first-b", "rest-b",
            stcCallFrame( "foldl-double-iter",
                "list-a", "rest-a",
                "list-b", "rest-b",
                "combiner", "combiner",
                stcCall( "combiner",
                    "state", "first-a", "first-b" ) ),
            "state" ),
        "state" ) );

// This implements `foldl-double-iter` in terms of
// `foldl-double-short-iter`.
var stcFoldlDoubleIter = stcAddDefun( "foldl-double-iter",
    "list-a", "list-b", "combiner", "state",
    stcCase( "short-result",
        stcFoldlDoubleShortIter.of( "list-a", "list-b",
            stcFn( "state", "elem-a", "elem-b",
                stcNope.of(
                    stcCall( "combiner",
                        "state", "elem-a", "elem-b" ) ) ),
            "state" ),
        
        stcNope, "result", "result",
        
        stcErr( "Internal error" ) ) );

// TODO: Choose just one of these implementations of `rev-onto`.

// This implements `rev-onto` independently.
var stcRevOnto = stcAddDefun( "rev-onto", "target", "source",
    stcCase( "source", "source", stcCons, "first", "rest",
        stcCallFrame( "rev-onto",
            "target", stcCons.of( "first", "target" ), "rest" ),
        "target" ) );

// This implements `rev-onto` in terms of `foldl-iter`.
var stcRevOnto = stcAddDefun( "rev-onto", "target", "source",
    stcFoldlIter.of( "source",
        stcFn( "state", "elem", stcCons.of( "elem", "state" ) ),
        "target" ) );

var stcRev = stcAddDefun( "rev", "source",
    stcRevOnto.of( stcNil.of(), "source" ) );

var stcAppend = stcAddDefun( "append", "past", "rest",
    stcRevOnto.of( "rest", stcRev.of( "past" ) ) );

// TODO: Choose just one of these implementations of `map-iter`.

// This implements `map-iter` independently assuming unbounded stack
// size. (If we had a `foldr` of some sort, this could use that.)
var stcMapIter = stcAddDefun( "map-iter", "func", "list",
    stcCase( "list", "list", stcCons, "elem", "rest",
        stcCons.of( stcCall( "func", "elem" ),
            stcCallFrame( "map-iter", "func", "func", "rest" ) ),
        stcNil.of() ) );

// This implements `map-iter` independently and with bounded stack
// size.
var stcRevOntoMapIter = stcAddDefun( "rev-onto-map-iter",
    "func", "target", "source",
    stcCase( "source", "source", stcCons, "elem", "rest",
        stcCallFrame( "rev-onto-map-iter", "func", "func",
            "target",
            stcCons.of( stcCall( "func", "elem" ), "target" ),
            "rest" ),
        "target" ) );
var stcMapIter = stcAddDefun( "map-iter", "func", "list",
    stcRev.of(
        stcRevOntoMapIter.of( "func", stcNil.of(), "list" ) ) );

// This implements `map-iter` in terms of `foldl-iter` and with
// bounded stack size.
var stcMapIter = stcAddDefun( "map-iter", "func", "list",
    stcRev.of(
        stcFoldlIter.of( "list",
            stcFn( "state", "elem",
                stcCons.of( stcCall( "func", "elem" ), "state" ) ),
            stcNil.of() ) ) );

// TODO: Choose just one of these implementations of `any-iter`.

// This implements `any-iter` independently.
var stcAnyIter = stcAddDefun( "any-iter", "func", "list",
    stcCase( "list", "list", stcCons, "first", "rest",
        stcCase( "func-result", stcCall( "func", "first" ),
            
            stcYep, "result", "func-result",
            
            stcNope, "result",
            stcCallFrame( "any-iter", "func", "func", "rest" ),
            
            stcErr( "Expected a func-result of type yep or nope" ) ),
        stcNope.of( stcNil.of() ) ) );

// This implements `any-iter` in terms of `foldl-short-iter`.
var stcAnyIter = stcAddDefun( "any-iter", "func", "list",
    stcFoldlShortIter.of( "list",
        stcFn( "state", "elem",
            stcCase( "func-result", stcCall( "func", "elem" ),
                
                stcYep, "result", "func-result",
                
                stcNope, "result", stcNope.of( stcNil.of() ),
                
                stcErr(
                    "Expected a func-result of type yep or nope"
                    ) ) ),
        stcNil.of() ) );

// TODO: Choose just one of these implementations of `any-double`.

// This implements `any-double` independently.
var stcAnyDouble = stcAddDefun( "any-double",
    "list-a", "list-b", "func",
    stcCase( "list-a", "list-a", stcCons, "first-a", "rest-a",
        stcCase( "list-b", "list-b", stcCons, "first-b", "rest-b",
            stcCase( "func-result",
                stcCall( "func", "first-a", "first-b" ),
                
                stcYep, "result", "func-result",
                
                stcNope, "result",
                stcCallFrame( "any-double",
                    "list-a", "list-a",
                    "list-b", "list-b",
                    "func" ),
                
                stcErr(
                    "Expected a func-result of type yep or nope" ) ),
            stcNope.of( stcNil.of() ) ),
        stcNope.of( stcNil.of() ) ) );

// This implements `any-double` in terms of `foldl-double-short-iter`.
var stcAnyDouble = stcAddDefun( "any-double",
    "list-a", "list-b", "func",
    stcFoldlDoubleShortIter.of( "list-a", "list-b",
        stcFn( "state", "elem-a", "elem-b",
            stcCase( "func-result",
                stcCall( "func", "elem-a", "elem-b" ),
                
                stcYep, "result", "func-result",
                
                stcNope, "result", stcNope.of( stcNil.of() ),
                
                stcErr(
                    "Expected a func-result of type yep or nope"
                    ) ) ),
        stcNil.of() ) );

var stcNotYepNope = stcAddDefun( "not-yep-nope", "yep-nope",
    stcCase( "yep-nope", "yep-nope",
        
        stcYep, "val", stcNope.of( "val" ),
        
        stcNope, "val", stcYep.of( "val" ),
        
        stcErr( "Expected a yep-nope of type yep or nope" ) ) );

var stcAllIter = stcAddDefun( "all-iter", "func", "list",
    stcNotYepNope.of(
        stcAnyIter.of(
            stcFn( "elem",
                stcNotYepNope.of( stcCall( "func", "elem" ) ) ),
            "list" ) ) );

var stcCut = stcAddDefun( "cut", "list-to-measure-by", "list-to-cut",
    stcFoldlIter.of( "list-to-measure-by",
        stcFn( "state", "ignored-elem",
            stcCase( "state", "state", stcCons, "rev-before", "after",
                stcCase( "after", "after", stcCons, "first", "after",
                    stcCons.of( stcCons.of( "first", "rev-before" ),
                        "after" ),
                    stcErr(
                        "Expected a list-to-measure-by no larger " +
                        "than the list-to-cut" ) ),
                stcErr( "Internal error" ) ) ),
        stcCons.of( stcNil.of(), "list-to-cut" ) ) );

var stcTails = stcAddDefun( "tails", "lists",
    stcCase( "lists", "lists", stcCons, "list-a", "list-b",
        stcCase( "list-a", "list-a", stcCons, "elem-a", "list-a",
            stcCase( "list-b", "list-b", stcCons, "elem-b", "list-b",
                stcCallFrame( "tails",
                    stcCons.of( "list-a", "list-b" ) ),
                "lists" ),
            "lists" ),
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

function runDefs( newDefs ) {
    arrEach( newDefs, function ( def ) {
        Function( "defs", "Stc",
            parseSyntax( "def", def ).compileToNaiveJs( {} )
        )( defs, Stc );
    } );
}

runDefs( stcDefs );

function testStcDef( expr ) {
    
    var testName = stcGensym();
    var ignoredVar = stcGensym();
    
    var stcTest = stcDefun( testName, ignoredVar, expr );
    stcDefs = stcDefs.concat( stcTest.defs );
    runDefs( stcTest.defs );
    
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
    
    var stack = [ stcTest.type.makeStc() ];
    var comp = new Stc( returnFrameTag, [ stcNil.makeStc() ] );
    while ( true ) {
        if ( !(comp instanceof Stc) )
            throw new Error();
        while ( comp.frameTag === callFrameTag ) {
            stack.push( comp.frameVars[ callFrameFuncI ] );
            comp = comp.frameVars[ callFrameArgI ];
            if ( !(comp instanceof Stc) )
                throw new Error();
        }
        if ( comp.frameTag !== returnFrameTag )
            throw new Error();
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

testStcDef(
    stcRev.of(
        stcCons.of( stcYep.of( stcNil.of() ),
            stcCons.of( stcNope.of( stcNil.of() ),
                stcNil.of() ) ) ) );

testStcDef( stcRev.of( stcNil.of() ) );

testStcDef( stcNotYepNope.of( stcYep.of( stcNil.of() ) ) );

testStcDef(
    stcLet(
        "x", stcNope.of( stcNil.of() ),
        "y", stcYep.of( stcNil.of() ),
        stcLet( "x", "y", "y", "x",
            stcCons.of( "x", "y" ) ) ) );
