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
    // We return a value whose tuple name is the given error message.
    return stcTuple( msg );
}


// TODO: Move this testing code somewhere better.

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

var stcNil = stcType( "nil" );

function testStcDef( expr ) {
    
    var testName = stcGensym();
    var ignoredVar = stcGensym();
    
    var stcTest = stcDefun( testName, ignoredVar, expr );
    stcDefs = stcDefs.concat( stcTest.defs );
    runDefs( stcTest.defs );
    
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
    
    var stack = [ stcTest.type.makeStc() ];
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


var staccatoDeclarationState = {};
staccatoDeclarationState.types = strMap();
staccatoDeclarationState.macros = strMap();
staccatoDeclarationState.hasRunDefs = false;

function extractPattern( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    var tupleNameExpr = body.first;
    if ( tupleNameExpr.type !== "stringNil" )
        throw new Error(
            "Encountered a case branch with a tuple name that " +
            "wasn't a string: " +
            staccatoReaderExprPretty( tupleNameExpr ) );
    var tupleName = readerStringNilToString( tupleNameExpr );
    if ( !staccatoDeclarationState.types.has( tupleName ) )
        throw new Error( "No such type: " + tupleName );
    var type = staccatoDeclarationState.types.get( tupleName );
    var remainingBody = body.rest;
    var localVars = [];
    for ( var i = 0, n = type.projNames.length; i < n; i++ ) {
        if ( remainingBody.type !== "cons" )
            throw new Error();
        if ( remainingBody.first.type !== "stringNil" )
            throw new Error();
        localVars.push(
            readerStringNilToString( remainingBody.first ) );
        remainingBody = remainingBody.rest;
    }
    
    var result = {};
    result.type = type;
    result.localVars = localVars;
    result.remainingBody = remainingBody;
    return result;
}
function stcCaseletForRunner( maybeVa, matchSubject, body ) {
    function processTail( body ) {
        if ( body.type !== "cons" )
            throw new Error();
        if ( body.rest.type !== "cons" )
            return jsList( "any",
                stcSaveRoot( processReaderExpr( body.first ) ) );
        var pattern = extractPattern( body );
        if ( pattern.remainingBody.type !== "cons" )
            throw new Error();
        var then = processReaderExpr( pattern.remainingBody.first );
        var els = pattern.remainingBody.rest;
        return jsList( "match", pattern.type.tupleName,
            stcEntriesPairMacro(
                "proj-pattern-cons", "proj-pattern-nil",
                pattern.type.projNames, pattern.localVars ),
            stcSaveRoot( then ),
            processTail( els ) );
    }
    
    var processedBody = processTail( body );
    if ( maybeVa !== null )
        processedBody =
            jsList( "let-case", maybeVa.val, processedBody );
    
    return stcCall(
        stcBasicRet(
            jsList( "fn", stcGensym(), stcNoProjs(),
                processedBody ) ),
        stcSaveRoot( processReaderExpr( matchSubject ) ) );
}
function stcCast( matchSubject, body ) {
    var pattern = extractPattern( body );
    if ( pattern.remainingBody.type !== "cons" )
        throw new Error();
    if ( pattern.remainingBody.rest.type !== "cons" )
        throw new Error();
    if ( pattern.remainingBody.rest.rest.type === "cons" )
        throw new Error();
    var onCastErr = processReaderExpr( pattern.remainingBody.first );
    var body = processReaderExpr( pattern.remainingBody.rest.first );
    var processedBody = jsList( "match", pattern.type.tupleName,
        stcEntriesPairMacro( "proj-pattern-cons", "proj-pattern-nil",
            pattern.type.projNames, pattern.localVars ),
        stcSaveRoot( body ),
        jsList( "any", stcSaveRoot( onCastErr ) ) );
    
    return stcCall(
        stcBasicRet(
            jsList( "fn", stcGensym(), stcNoProjs(),
                processedBody ) ),
        stcSaveRoot( processReaderExpr( matchSubject ) ) );
}

function processFn( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    if ( body.rest.type !== "cons" )
        return processReaderExpr( body.first );
    if ( body.first.type !== "stringNil" )
        throw new Error(
            "Called fn with a non-string variable name: " +
            staccatoReaderExprPretty( body.first ) );
    return stcFn( readerStringNilToString( body.first ),
        processFn( body.rest ) );
}

function mapReaderExprToArr( readerExpr, func ) {
    var result = [];
    for ( var e = readerExpr; e.type === "cons"; e = e.rest )
        result.push( func( e.first ) );
    if ( e.type !== "nil" )
        throw new Error();
    return result;
}

staccatoDeclarationState.macros.set( "case", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    return stcCaseletForRunner( null, body.first, body.rest );
} );

staccatoDeclarationState.macros.set( "caselet", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    if ( body.rest.type !== "cons" )
        throw new Error();
    if ( body.first.type !== "stringNil" )
        throw new Error();
    
    return stcCaseletForRunner(
        { val: readerStringNilToString( body.first ) },
        body.rest.first,
        body.rest.rest );
} );

staccatoDeclarationState.macros.set( "cast", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    return stcCast( body.first, body.rest );
} );

staccatoDeclarationState.macros.set( "isa", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    if ( body.rest.type !== "cons" )
        throw new Error();
    if ( body.rest.rest.type === "cons" )
        throw new Error();
    var tupleName = readerStringNilToString( body.first );
    if ( !staccatoDeclarationState.types.has( tupleName ) )
        throw new Error( "No such type: " + tupleName );
    var type = staccatoDeclarationState.types.get( tupleName );
    var stcYep = stcType( "yep", "val" );
    var stcNope = stcType( "nope", "val" );
    var stcNil = stcType( "nil" );
    var processedBody = jsList( "match", tupleName,
        stcEntriesPairMacro( "proj-pattern-cons", "proj-pattern-nil",
            type.projNames,
            arrMap( type.projNames, function ( tupleVar ) {
                return stcGensym();
            } ) ),
        stcSaveRoot( stcYep.of( stcNil.of() ) ),
        jsList( "any", stcSaveRoot( stcNope.of( stcNil.of() ) ) ) );
    return stcCall(
        stcBasicRet(
            jsList( "fn", stcGensym(), stcNoProjs(),
                processedBody ) ),
        stcSaveRoot( processReaderExpr( body.rest.first ) ) );
} );

staccatoDeclarationState.macros.set( "proj1", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    if ( body.rest.type !== "cons" )
        throw new Error();
    if ( body.rest.rest.type === "cons" )
        throw new Error();
    return stcCast( body.rest.first,
        { type: "cons", first: body.first, rest:
            readAll( "(val err.\\-qq[Internal error] val)" )[ 0 ].val
        } );
} );

staccatoDeclarationState.macros.set( "c", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    return stcCallArr( processReaderExpr( body.first ),
        mapReaderExprToArr( body.rest, function ( expr ) {
            return processReaderExpr( expr );
        } ) );
} );

staccatoDeclarationState.macros.set( "c-new", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    if ( body.first.type !== "stringNil" )
        throw new Error();
    return stcCallArr(
        stcTuple( readerStringNilToString( body.first ) ),
        mapReaderExprToArr( body.rest, function ( expr ) {
            return processReaderExpr( expr );
        } ) );
} );

staccatoDeclarationState.macros.set( "err", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    if ( body.rest.type === "cons" )
        throw new Error();
    if ( body.first.type !== "stringNil" )
        throw new Error();
    return stcErr( readerStringNilToString( body.first ) );
} );

staccatoDeclarationState.macros.set( "fn", function ( body ) {
    if ( body.type !== "cons" )
        throw new Error();
    return processFn( body );
} );

staccatoDeclarationState.macros.set( "let", function ( body ) {
    var remainingBody = body;
    var bindingArrThunks = [];
    while ( true ) {
        if ( remainingBody.type !== "cons" )
            throw new Error();
        if ( remainingBody.rest.type !== "cons" )
            break;
        if ( remainingBody.first.type !== "stringNil" )
            throw new Error();
        (function () {
            var thisRemainingBody = remainingBody;
            bindingArrThunks.push( function () {
                return readerStringNilToString(
                    thisRemainingBody.first );
            }, function () {
                return stcBasicSave(
                    processReaderExpr( thisRemainingBody.rest.first ) );
            } );
        })();
        remainingBody = remainingBody.rest.rest;
    }
    return stcSaveRoot(
        jsList( "let",
            stcBasicLetBindingsArr(
                arrMap( bindingArrThunks, function ( thunk ) {
                    return thunk();
                } ) ),
            stcSaveRoot(
                processReaderExpr( remainingBody.first ) ) ) );
} );

function processReaderExpr( readerExpr ) {
    if ( readerExpr.type === "stringNil" )
        return readerStringNilToString( readerExpr );
    if ( readerExpr.type !== "cons" )
        throw new Error();
    if ( readerExpr.first.type !== "stringNil" )
        throw new Error();
    var macroName = readerStringNilToString( readerExpr.first );
    if ( !staccatoDeclarationState.macros.has( macroName ) )
        throw new Error( "No such macro: " + macroName );
    
    return staccatoDeclarationState.macros.get( macroName )(
        readerExpr.rest );
}

function processDefType( tupleName, projNames ) {
    var n = projNames.length;
    staccatoDeclarationState.types.set( tupleName,
        stcTypeArr( tupleName, projNames ) );
    staccatoDeclarationState.macros.set( tupleName,
        function ( body ) {
        
        var projVals = [];
        var remainingBody = body;
        for ( var i = 0; i < n; i++ ) {
            if ( remainingBody.type !== "cons" )
                throw new Error(
                    "Expected more arguments to " +
                    JSON.stringify( tupleName ) );
            projVals.push(
                stcBasicSave(
                    processReaderExpr( remainingBody.first ) ) );
            remainingBody = remainingBody.rest;
        }
        return stcCallArr(
            stcSaveRoot(
                stcBasicRet(
                    jsList( "tuple", tupleName,
                        stcEntriesPairMacro( "proj-cons", "proj-nil",
                            projNames, projVals ) ) ) ),
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
    
    var macroName = readerStringNilToString( readerExpr.first );
    if ( macroName === "def-type" ) {
        if ( readerExpr.rest.type !== "cons" )
            throw new Error();
        if ( readerExpr.rest.first.type !== "stringNil" )
            throw new Error();
        
        var tupleName =
            readerStringNilToString( readerExpr.rest.first );
        if ( staccatoDeclarationState.macros.has( tupleName ) )
            throw new Error();
        
        var projNames = mapReaderExprToArr( readerExpr.rest.rest,
            function ( tupleVar ) {
                if ( tupleVar.type !== "stringNil" )
                    throw new Error();
                return readerStringNilToString( tupleVar );
            } );
        processDefType( tupleName, projNames );
    } else if ( macroName === "defn" ) {
        if ( readerExpr.rest.type !== "cons" )
            throw new Error();
        if ( readerExpr.rest.first.type !== "stringNil" )
            throw new Error();
        if ( readerExpr.rest.rest.type !== "cons" )
            throw new Error();
        if ( readerExpr.rest.rest.first.type !== "stringNil" )
            throw new Error();
        if ( staccatoDeclarationState.hasRunDefs )
            throw new Error();
        
        var name = readerStringNilToString( readerExpr.rest.first );
        var firstArg =
            readerStringNilToString( readerExpr.rest.rest.first );
        stcAddDefun( name, firstArg,
            stcCall( processFn( readerExpr.rest.rest ), firstArg ) );
        processDefType( name, [] );
    } else if ( macroName === "run-defs" ) {
        if ( readerExpr.rest.type === "cons" )
            throw new Error();
        if ( staccatoDeclarationState.hasRunDefs )
            throw new Error();
        
        console.log( arrMap( stcDefs, function ( def ) {
            return staccatoPretty( def );
        } ) );
        runDefs( stcDefs );
        staccatoDeclarationState.hasRunDefs = true;
    } else if ( macroName === "test" ) {
        if ( readerExpr.rest.type !== "cons" )
            throw new Error();
        if ( readerExpr.rest.rest.type === "cons" )
            throw new Error();
        if ( !staccatoDeclarationState.hasRunDefs )
            throw new Error();
        
        testStcDef( processReaderExpr( readerExpr.rest.first ) );
    } else {
        throw new Error();
    }
}
