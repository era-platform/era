// era-staccato-lib-runner.js
// Copyright 2015 Ross Angle. Released under the MIT License.
//
// This is the JavaScript code to support running
// era-staccato-lib.stc. Most of it comes from
// era-staccato-lib-gensym.js.
//
// See era-staccato.js for more information about what Staccato is.

// TODO: Try this file out. We haven't run it even once yet, so there
// are bound to be syntax errors.

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


var staccatoDeclarationState = {};
staccatoDeclarationState.types = strMap();
staccatoDeclarationState.macros = strMap();

function stcCaseletForRunner( maybeVa, matchSubject, body ) {
    function processTail( body ) {
        if ( body.type !== "cons" )
            throw new Error();
        if ( body.rest.type !== "cons" )
            return jsList( "any",
                stcSaveRoot( processReaderExpr( body.first ) ) );
        var frameName = body.first;
        if ( frameName.type !== "stringNil" )
            throw new Error();
        if ( !staccatoDeclarationState.types.has( frameName.string ) )
            throw new Error();
        var type =
            staccatoDeclarationState.types.get( frameName.string );
        var remainingBody = body;
        var localVars = [];
        for ( var i = 0, n = type.frameVars.length; i < n; i++ ) {
            if ( remainingBody.type !== "cons" )
                throw new Error();
            if ( remainingBody.first.type !== "stringNil" )
                throw new Error();
            localVars.push( remainingBody.first.string );
            remainingBody = remainingBody.rest;
        }
        if ( remainingBody.type !== "cons" )
            throw new Error();
        var then = processReaderExpr( remainingBody.first );
        var els = remainingBody.rest;
        return jsList( "match", type.frameName,
            stcEntriesPairMacro(
                "env-pattern-cons", "env-pattern-nil",
                type.frameVars, localVars ),
            stcSaveRoot( then ),
            processTail( els ) );
    }
    
    var processedBody = processTail( body );
    if ( maybeVa !== null )
        processedBody =
            jsList( "let-case", maybeVa.val, processedBody );
    
    return stcCall(
        stcBasicRet(
            jsList( "fn", stcGensym(), stcNoVars(), processedBody ) ),
        stcSaveRoot( processReaderExpr( matchSubject ) ) );
}

function processFn( body ) {
    if ( body.type !== "cons" )
        return processReaderExpr( body.first );
    if ( body.first.type !== "stringNil" )
        throw new Error();
    return stcFn( body.first.string, processFn( body.rest ) );
}

function mapReaderExprToArr( readerExpr, func ) {
    var result = [];
    while ( var e = readerExpr; e.type === "cons"; e = e.rest )
        result.push( func( e.first ) );
    if ( e.type !== "nil" )
        throw new Error();
    return result;
}

staccatoDeclarationState.macros.put( "case", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    return stcCaseletForRunner( null, body.first, body.rest );
} );

staccatoDeclarationState.macros.put( "caselet", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    if ( body.rest.type !== "cons" )
        throw new Error();
    if ( body.first.type !== "stringNil" )
        throw new Error();
    
    return stcCaseletForRunner( { val: body.first.string },
        body.rest.first,
        body.rest.rest );
} );

staccatoDeclarationState.macros.put( "c", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    return stcCallArr( processReaderExpr( body.first ),
        mapReaderExprToArr( body.rest, function ( expr ) {
            return processReaderExpr( expr );
        } ) );
} );

staccatoDeclarationState.macros.put( "c-new", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    if ( body.first.type !== "stringNil" )
        throw new Error();
    return stcCallArr( stcFrame( body.first ),
        mapReaderExprToArr( body.rest, function ( expr ) {
            return processReaderExpr( expr );
        } ) );
} );

staccatoDeclarationState.macros.put( "err", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    if ( body.rest.type === "cons" )
        throw new Error();
    if ( body.first.type !== "stringNil" )
        throw new Error();
    return stcErr( body.first.string );
} );

staccatoDeclarationState.macros.put( "fn", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    return processFn( body );
} );

staccatoDeclarationState.macros.put( "let", function ( body ) {
    var remainingBody = body;
    var envArrThunks = [];
    while ( true ) {
        if ( remainingBody.type !== "cons" )
            throw new Error();
        if ( remainingBody.rest.type !== "cons" )
            break;
        if ( remainingBody.first.type !== "stringNil" )
            throw new Error();
        (function () {
            var thisRemainingBody = remainingBody;
            envArrThunks.push( function () {
                return thisRemainingBody.first.string;
            }, function () {
                return stcBasicSave(
                    processReaderExpr( thisRemainingBody.rest.first ) );
            } );
        })();
        remainingBody = remainingBody.rest.rest;
    }
    return stcSaveRoot(
        jsList( "let",
            stcBasicEnvArr( arrMap( envArrThunks, function ( thunk ) {
                return thunk();
            } ) ),
            stcSaveRoot(
                processReaderExpr( remainingBody.first ) ) ) );
} );

function processReaderExpr( readerExpr ) {
    if ( readerExpr.type !== "cons" )
        throw new Error();
    if ( readerExpr.first.type !== "stringNil" )
        throw new Error();
    if ( !staccatoDeclarationState.macros.has(
        readerExpr.first.string ) )
        throw new Error();
    
    return staccatoDeclarationState.macros.get(
        readerExpr.first.string
    )( readerExpr.rest );
}

function processDefType( frameName, frameVars ) {
    var n = frameVars.length;
    staccatoDeclarationState.types.put( frameName,
        stcTypeArr( frameName, frameVars ) );
    staccatoDeclarationState.macros.put( frameName,
        function ( body ) {
        
        var frameVals = [];
        var remainingBody = body;
        for ( var i = 0; i < n; i++ ) {
            if ( remainingBody.type !== "cons" )
                throw new Error();
            frameVals.push(
                stcBasicSave(
                    processReaderExpr( remainingBody.first ) ) );
            remainingBody = remainingBody.rest;
        }
        return stcCallArr(
            stcSaveRoot(
                stcBasicRet(
                    jsList( "frame", frameName,
                        stcEntriesPairMacro( "env-cons", "env-nil",
                            frameVars, frameVals ) ) ) ),
            mapReaderExprToArr( remainingBody, function ( expr ) {
                return processReaderExpr( expr );
            } ) );
    } );
}

function processTopLevelReaderExpr( readerExpr ) {
    if ( readerExpr.type !== "cons" )
        throw new Error();
    if ( readerExpr.first.type !== "stringNil" )
        throw new Error();
    
    if ( readerExpr.first.string === "def-type" ) {
        if ( readerExpr.rest.type !== "cons" )
            throw new Error();
        if ( readerExpr.rest.first.type !== "stringNil" )
            throw new Error();
        
        var frameName = readerExpr.rest.first.string;
        if ( staccatoDeclarationState.macros.has( frameName ) )
            throw new Error();
        
        var frameVars = mapReaderExprToArr( readerExpr.rest.rest,
            function ( frameVar ) {
                if ( frameVar.type !== "stringNil" )
                    throw new Error();
                return frameVar.string;
            } );
        processDefType( frameName, frameVars );
    } else if ( readerExpr.first.string === "defn" ) {
        if ( readerExpr.rest.type !== "cons" )
            throw new Error();
        if ( readerExpr.rest.first.type !== "stringNil" )
            throw new Error();
        if ( readerExpr.rest.rest.type !== "cons" )
            throw new Error();
        if ( readerExpr.rest.rest.first.type !== "stringNil" )
            throw new Error();
        
        var name = readerExpr.rest.first.string;
        var firstArg = readerExpr.rest.rest.first.string;
        stcAddDefun( name, firstArg,
            stcCall( processFn( readerExpr.rest.rest.rest ),
                firstArg ) );
        processDefType( name, [] );
    } else if ( readerExpr.first.string === "test" ) {
        if ( readerExpr.rest.type !== "cons" )
            throw new Error();
        if ( readerExpr.rest.rest.type === "cons" )
            throw new Error();
        
        testStcDef( processReaderExpr( readerExpr.rest.first ) );
    } else {
        throw new Error();
    }
}
