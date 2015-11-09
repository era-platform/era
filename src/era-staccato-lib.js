// era-staccato-lib.js
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
function stcAddYesDef( var_args ) {
    stcDefs = stcDefs.concat(
        desugarDefExpr( stcYesDef.apply( {}, arguments ) ) );
}
function stcAddYesDefAny( var_args ) {
    stcDefs = stcDefs.concat(
        desugarDefExpr( stcYesDefAny.apply( {}, arguments ) ) );
}

function stcErr( msg ) {
    // We return a value whose tuple name is the given error message.
    return stcTuple( msg );
}

function stcRetErr( msg ) {
    return stcRet( stcErr( msg ) );
}


var stcCons = stcType( "cons", "car", "cdr" );
var stcYep = stcType( "yep", "val" );
var stcNope = stcType( "nope", "val" );
var stcNil = stcType( "nil" );

stcAddYesDefAny( "pass-to", "arg", "func",
    stcCall( stcv( "func" ), stcRet( stcv( "arg" ) ) ) );

stcAddYesDefAny( "foldl-short-iter", "list", "combiner", "state",
    stcCons.cond( "foldl-short-iter-case1", "first", "rest",
        stcRet( stcv( "list" ) ),
        stcCase( "foldl-short-iter-case2", "combiner-result",
            stcCallTuple( "pass-to", "arg", stcv( "first" ),
                stcCall( stcv( "combiner" ),
                    stcRet( stcv( "state" ) ) ) ),
            
            stcYep, "result", stcRet( stcv( "combiner-result" ) ),
            
            stcNope, "result",
            stcCallTuple( "foldl-short-iter",
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
        stcCallTuple( "foldl-iter", "list", stcv( "rest" ),
            "combiner", stcv( "combiner" ),
            stcCallTuple( "pass-to", "arg", stcv( "first" ),
                stcCall( stcv( "combiner" ),
                    stcRet( stcv( "state" ) ) ) ) ),
        stcRet( stcv( "state" ) ) ) );

// This implements `foldl-iter` in terms of `foldl-short-iter`.
stcAddYesDefAny( "foldl-iter", "list", "combiner", "state",
    stcNope.cond( "foldl-iter-case", "result",
        stcCallTuple( "foldl-short-iter", "list", stcv( "list" ),
            "combiner",
            stcFnAny( "foldl-iter-adapter-1", "state",
                stcRetFnAny( "foldl-iter-adapter-2", "elem",
                    stcSaveRoot(
                        stcRet(
                            stcNope.make(
                                stcSave( "combiner-result", "foldl-iter-adapter-3",
                                    stcCallTuple( "pass-to", "arg", stcv( "elem" ),
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
                stcCallTuple( "pass-to", "arg", stcv( "first-b" ),
                    stcCallTuple( "pass-to", "arg", stcv( "first-a" ),
                        stcCall( stcv( "combiner" ),
                            stcRet( stcv( "state" ) ) ) ) ),
                
                stcYep, "result", stcRet( stcv( "combiner-result" ) ),
                
                stcNope, "result",
                stcCallTuple( "foldl-double-short-iter",
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
        stcCallTuple( "foldl-short-iter",
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
                                stcCallTuple( "pass-to",
                                    "arg", stcv( "elem-b" ),
                                    stcCallTuple( "pass-to", "arg", stcv( "elem-a" ),
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
            stcCallTuple( "foldl-double-iter",
                "list-a", stcv( "rest-a" ),
                "list-b", stcv( "rest-b" ),
                "combiner", stcv( "combiner" ),
                stcCallTuple( "pass-to", "arg", stcv( "first-b" ),
                    stcCallTuple( "pass-to",
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
        stcCallTuple( "foldl-double-short-iter",
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
                                        stcCallTuple( "pass-to", "arg", stcv( "elem-b" ),
                                            stcCallTuple( "pass-to", "arg", stcv( "elem-a" ),
                                                stcCall( stcv( "combiner" ),
                                                    stcRet( stcv( "state" ) ) ) ) ) ) ) ) ) ) ) ),
            stcRet( stcv( "state" ) ) ),
        stcRet( stcv( "result" ) ),
        stcRetErr( "Internal error" ) ) );

// TODO: Choose just one of these implementations of `rev-onto`.

// This implements `rev-onto` independently.
stcAddYesDef( "rev-onto", "target",
    stcCons.match( "first", "rest",
        stcCallTuple( "rev-onto", "target",
            stcCons.make( stcv( "first" ), stcv( "target" ) ),
            stcRet( stcv( "rest" ) ) ),
        jsList( "any", stcRet( stcv( "target" ) ) ) ) );

// This implements `rev-onto` in terms of `foldl-iter`.
stcAddYesDefAny( "rev-onto", "target", "source",
    stcCallTuple( "foldl-iter", "list", stcv( "source" ),
        "combiner",
        stcFnAny( "rev-onto-adapter-1", "state",
            stcRetFnAny( "rev-onto-adapter-2", "elem",
                stcRet(
                    stcCons.make(
                        stcv( "elem" ), stcv( "state" ) ) ) ) ),
        stcRet( stcv( "target" ) ) ) );

stcAddYesDefAny( "rev", "source",
    stcCallTuple( "rev-onto", "target", stcNil.make(),
        stcRet( stcv( "source" ) ) ) );

stcAddYesDefAny( "append", "past", "rest",
    stcCallTuple( "rev-onto", "target", stcv( "rest" ),
        stcCallTuple( "rev", stcRet( stcv( "past" ) ) ) ) );

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
                        stcCallTuple( "map-iter",
                            "func", stcv( "func" ),
                            stcRet( stcv( "rest" ) ) ) ) ) ) ),
        jsList( "any", stcRet( stcNil.make() ) ) ) );

// This implements `map-iter` independently and with bounded stack
// size.
stcAddYesDefAny( "map-iter", "func", "list",
    jsList( "let-def",
        stcYesDef( "rev-onto-map-iter", "func", "target",
            stcCons.match( "elem", "rest",
                stcSaveRoot(
                    stcCallTuple( "rev-onto-map-iter",
                        "func", stcv( "func" ),
                        "target",
                        stcCons.make(
                            stcSave( "func-result",
                                "rev-onto-map-iter-inner-1",
                                stcCall( stcv( "func" ),
                                    stcRet( stcv( "elem" ) ) ) ),
                            stcv( "target" ) ),
                        stcRet( stcv( "rest" ) ) ) ),
                jsList( "any", stcRet( stcv( "target" ) ) ) ) ),
        stcCallTuple( "rev",
            stcCallTuple( "rev-onto-map-iter", "func", stcv( "func" ),
                "target", stcNil.make(),
                stcRet( stcv( "list" ) ) ) ) ) );

// This implements `map-iter` in terms of `foldl-iter` and with
// bounded stack size.
stcAddYesDefAny( "map-iter", "func", "list",
    stcCallTuple( "rev",
        stcCallTuple( "foldl-iter", "list", stcv( "list" ),
            "combiner",
            stcFnAny( "map-iter-adapter-1", "state",
                stcRetFnAny( "map-iter-adapter-2", "elem",
                    stcSaveRoot(
                        stcRet(
                            stcCons.make(
                                stcSave( "func-result",
                                    "map-iter-adapter-3",
                                    stcCall( stcv( "func" ), stcRet( stcv( "elem" ) ) ) ),
                                stcv( "state" ) ) ) ) ) ),
            stcRet( stcNil.make() ) ) ) );

// TODO: Choose just one of these implementations of `any-iter`.

// This implements `any-iter` independently.
stcAddYesDef( "any-iter", "func",
    stcCons.match( "first", "rest",
        stcCase( "any-iter-case", "func-result",
            stcCall( stcv( "func" ), stcRet( stcv( "first" ) ) ),
            
            stcYep, "result", stcRet( stcv( "func-result" ) ),
            
            stcNope, "result",
            stcCallTuple( "any-iter", "func", stcv( "func" ),
                stcRet( stcv( "rest" ) ) ),
            
            stcRetErr(
                "Expected a func-result of type yep or nope" ) ),
        jsList( "any", stcRet( stcNope.make( stcNil.make() ) ) ) ) );

// This implements `any-iter` in terms of `foldl-short-iter`.
stcAddYesDefAny( "any-iter", "func", "list",
    stcCallTuple( "foldl-short-iter", "list", stcv( "list" ),
        "combiner",
        stcFnAny( "any-iter-adapter-1", "state",
            stcRetFnAny( "any-iter-adapter-2", "elem",
                stcCase( "any-iter-case", "func-result",
                    stcCall( stcv( "func" ),
                        stcRet( stcv( "elem" ) ) ),
                    
                    stcYep, "result", stcRet( stcv( "func-result" ) ),
                    
                    stcNope, "result",
                    stcRet( stcNope.make( stcNil.make() ) ),
                    
                    stcRetErr(
                        "Expected a func-result of type yep or nope"
                        ) ) ) ),
        stcRet( stcNil.make() ) ) );

// TODO: Choose just one of these implementations of `any-double`.

// This implements `any-double` independently.
stcAddYesDefAny( "any-double", "list-a", "list-b", "func",
    stcCons.cond( "any-double-case1", "first-a", "rest-a",
        stcRet( stcv( "list-a" ) ),
        stcCons.cond( "any-double-case2", "first-b", "rest-b",
            stcRet( stcv( "list-b" ) ),
            stcCase( "any-double-case3", "func-result",
                stcCallTuple( "pass-to", "arg", stcv( "first-b" ),
                    stcCall( stcv( "func" ),
                        stcRet( stcv( "first-a" ) ) ) ),
                
                stcYep, "result", stcRet( stcv( "func-result" ) ),
                
                stcNope, "result",
                stcCallTuple( "any-double",
                    "list-a", stcv( "rest-a" ),
                    "list-b", stcv( "rest-b" ),
                    stcRet( stcv( "func" ) ) ),
                
                stcRetErr(
                    "Expected a func-result of type yep or nope" ) ),
            stcRet( stcNope.make( stcNil.make() ) ) ),
        stcRet( stcNope.make( stcNil.make() ) ) ) );

// This implements `any-double` in terms of `foldl-double-short-iter`.
stcAddYesDefAny( "any-double", "list-a", "list-b", "func",
    stcCallTuple( "foldl-double-short-iter",
        "list-a", stcv( "list-a" ),
        "list-b", stcv( "list-b" ),
        "combiner",
        stcFnAny( "any-double-adapter-1", "state",
            stcRetFnAny( "any-double-adapter-2", "elem-a",
                stcRetFnAny( "any-double-adapter-3", "elem-b",
                    stcCase( "any-double-case", "func-result",
                        stcCallTuple( "pass-to",
                            "arg", stcv( "elem-b" ),
                            stcCall( stcv( "func" ),
                                stcRet( stcv( "elem-a" ) ) ) ),
                        
                        stcYep, "result",
                        stcRet( stcv( "func-result" ) ),
                        
                        stcNope, "result",
                        stcRet( stcNope.make( stcNil.make() ) ),
                        
                        stcRetErr(
                            "Expected a func-result of type yep or " +
                            "nope" ) ) ) ) ),
        stcRet( stcNil.make() ) ) );

stcAddYesDef( "not-yep-nope",
    stcYep.match( "val", stcRet( stcNope.make( stcv( "val" ) ) ),
        stcNope.match( "val", stcRet( stcYep.make( stcv( "val" ) ) ),
            jsList( "any",
                stcRetErr(
                    "Expected a yep-nope of type yep or nope"
                    ) ) ) ) );

stcAddYesDefAny( "all-iter", "func", "list",
    stcCallTuple( "not-yep-nope",
        stcCallTuple( "any-iter",
            "func",
            stcFnAny( "all-iter-adapter-1", "elem",
                stcCallTuple( "not-yep-nope",
                    stcCall( stcv( "func" ),
                        stcRet( stcv( "elem" ) ) ) ) ),
            stcRet( stcv( "list" ) ) ) ) );

stcAddYesDefAny( "cut", "list-to-measure-by", "list-to-cut",
    stcCallTuple( "foldl-iter", "list", stcv( "list-to-measure-by" ),
        "combiner",
        stcFnAny( "cut-adapter-1", "state",
            stcRetFnAny( "cut-adapter-2", "ignored-elem",
                stcCons.cond( "cut-case1", "rev-before", "after",
                    stcRet( stcv( "state" ) ),
                    stcCons.cond( "cut-case2", "first", "after",
                        stcRet( stcv( "after" ) ),
                        stcRet(
                            stcCons.make(
                                stcCons.make( stcv( "first" ),
                                    stcv( "rev-before" ) ),
                                stcv( "after" ) ) ),
                        stcRetErr(
                            "Expected a list-to-measure-by no " +
                            "longer than the list-to-cut" ) ),
                    stcRetErr( "Internal error" ) ) ) ),
        stcRet(
            stcCons.make( stcNil.make(),
                stcv( "list-to-cut" ) ) ) ) );

stcAddYesDef( "tails",
    jsList( "let-case", "lists",
        stcCons.match( "list-a", "list-b",
            stcCons.cond( "tails-case1", "elem-a", "list-a",
                stcRet( stcv( "list-a" ) ),
                stcCons.cond( "tails-case2", "elem-b", "list-b",
                    stcRet( stcv( "list-b" ) ),
                    stcCallTuple( "tails",
                        stcRet(
                            stcCons.make(
                                stcv( "list-a" ),
                                stcv( "list-b" ) ) ) ),
                    stcRet( stcv( "lists" ) ) ),
                stcRet( stcv( "lists" ) ) ),
            jsList( "any",
                stcRetErr(
                    "Expected a lists value of type cons" ) ) ) ) );


// TODO: Move this testing code somewhere better.

console.log( arrMap( stcDefs, function ( def ) {
    return staccatoPretty( def );
} ) );

var defs = {};
function Stc( tupleTag, opt_projNames ) {
    this.tupleTag = tupleTag;
    this.projNames = opt_projNames || [];
}
Stc.prototype.call = function ( arg ) {
    var func = defs[ this.tupleTag ];
    return func( this.projNames, arg );
};
Stc.prototype.pretty = function () {
    return "(" + this.tupleTag +
        arrMap( this.projNames, function ( elem, i ) {
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
    var stcTest = stcType( testName );
    
    var testDefs = desugarDefExpr(
        stcYesDef( testName, jsList( "any", expr ) ) );
    stcDefs = stcDefs.concat( testDefs );
    runDefs( testDefs );
    
    var callProjNames = makeProjNames( strMap().plusArrTruth( [
        [ "va:va", "func" ],
        [ "va:va", "arg" ]
    ] ) );
    var callTupleFuncI = callProjNames[ 0 ] === "func" ? 0 : 1;
    var callTupleArgI = callProjNames[ 0 ] === "func" ? 1 : 0;
    var callTupleTag =
        JSON.stringify( [ "call", callProjNames ] );
    var returnTupleValI = 0;
    var returnTupleTag =
        JSON.stringify( [ "return", [ "val" ] ] );
    
    var maxStackDepth = 0;
    var calls = 0;
    
    var stack = [ stcTest.makeStc() ];
    var comp = new Stc( returnTupleTag, [ stcNil.makeStc() ] );
    while ( true ) {
        if ( !(comp instanceof Stc) )
            throw new Error();
        while ( comp.tupleTag === callTupleTag ) {
            stack.push( comp.projNames[ callTupleFuncI ] );
            comp = comp.projNames[ callTupleArgI ];
            if ( !(comp instanceof Stc) )
                throw new Error();
        }
        if ( comp.tupleTag !== returnTupleTag )
            throw new Error();
        var result = comp.projNames[ returnTupleValI ];
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
    stcCallTuple( "rev",
        stcRet(
            stcCons.make( stcYep.make( stcNil.make() ),
                stcCons.make( stcNope.make( stcNil.make() ),
                    stcNil.make() ) ) ) ) );

testStcDef( stcCallTuple( "rev", stcRet( stcNil.make() ) ) );

testStcDef(
    stcCallTuple( "not-yep-nope",
        stcRet( stcYep.make( stcNil.make() ) ) ) );

testStcDef(
    stcLet(
        "x", stcNope.make( stcNil.make() ),
        "y", stcYep.make( stcNil.make() ),
        stcLet( "x", stcv( "y" ), "y", stcv( "x" ),
            stcRet( stcCons.make( stcv( "x" ), stcv( "y" ) ) ) ) ) );
