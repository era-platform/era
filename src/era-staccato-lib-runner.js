// era-staccato-lib-runner.js
// Copyright 2015, 2016 Ross Angle. Released under the MIT License.
//
// This is the JavaScript code to support running
// era-staccato-lib.stc. Most of it comes from
// era-staccato-lib-gensym.js.
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
    // We return a value whose tuple name is the given error message.
    return stcTuple( msg );
}


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

var timeSpentParsing = 0;
var timeSpentCompiling = 0;
var timeSpentInstalling = 0;
var timeSpentEvaluatingForTest = 0;
var timeSpentDesugaringDefn = 0;
function runDefs( newDefs ) {
    arrEach( newDefs, function ( def ) {
        var startMillis = new Date().getTime();
        var parsed = parseSyntax( "def", def );
        var parseMillis = new Date().getTime();
        var compiled = parsed.compileToNaiveJs( {} );
        var compileMillis = new Date().getTime();
        Function( "defs", "Stc", compiled )( defs, Stc );
        var stopMillis = new Date().getTime();
        
        timeSpentParsing += parseMillis - startMillis;
        timeSpentCompiling += compileMillis - parseMillis;
        timeSpentInstalling += stopMillis - compileMillis;
    } );
}

var stcNil = stcType( "nil" );

function evalStcForTest( expr ) {
    
    var testName = stcGensym();
    var ignoredVar = stcGensym();
    
    var stcTest = stcDefun( testName, ignoredVar, expr );
    stcDefs = stcDefs.concat( stcTest.defs );
    runDefs( stcTest.defs );
    
    var startMillis = new Date().getTime();
    
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
    
    var stopMillis = new Date().getTime();
    timeSpentEvaluatingForTest += stopMillis - startMillis;
    
    // TODO: Either do something with this information, or stop
    // tracking it.
//    console.log(
//        "Took " + calls + " " +
//        (calls === 1 ? "call" : "calls") + " and reached a maximum " +
//        "stack depth of " + maxStackDepth );
    
    return result;
}

function compareStc( a, b ) {
    var incomparableAtBest = false;
    var queue = [ { a: a, b: b } ];
    while ( queue.length !== 0 ) {
        var entry = queue.shift();
        if ( !(entry.a instanceof Stc && entry.b instanceof Stc) ) {
            incomparableAtBest = true;
            continue;
        }
        if ( entry.a.tupleTag !== entry.b.tupleTag )
            return false;
        var n = entry.a.projNames.length;
        if ( n !== entry.b.projNames.length )
            throw new Error();
        for ( var i = 0; i < n; i++ )
            queue.push( {
                a: entry.a.projNames[ i ],
                b: entry.b.projNames[ i ]
            } );
    }
    return incomparableAtBest ? null : true;
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
            "wasn't a string: " + readerExprPretty( tupleNameExpr ) );
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
            readerExprPretty( body.first ) );
    return stcFn( readerStringNilToString( body.first ),
        processFn( body.rest ) );
}

function profile( func, logTime ) {
    var inFunc = false;
    return function ( var_args ) {
        if ( inFunc )
            return func.apply( this, arguments );
        var startTime = new Date().getTime();
        inFunc = true;
        var result = func.apply( this, arguments );
        inFunc = false;
        var stopTime = new Date().getTime();
        logTime( stopTime - startTime );
        return result;
    };
}
var timeSpentParsingSyntax = 0;
parseSyntax = profile( parseSyntax, function ( millis ) {
    timeSpentParsingSyntax += millis;
} );
desugarDefExpr = profile( desugarDefExpr, function ( millis ) {
    timeSpentDesugaringDefn += millis;
} );

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
            readAll( "(val err.\\;qq[Internal error] val)" )[ 0 ].val
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
                    processReaderExpr(
                        thisRemainingBody.rest.first ) );
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
    } else if ( macroName === "test" ) {
        if ( readerExpr.rest.type !== "cons" )
            throw new Error();
        if ( readerExpr.rest.rest.type !== "cons" )
            throw new Error();
        if ( readerExpr.rest.rest.rest.type === "cons" )
            throw new Error();
        if ( !staccatoDeclarationState.hasRunDefs )
            throw new Error();
        
        var a = evalStcForTest(
            processReaderExpr( readerExpr.rest.first ) );
        var b = evalStcForTest(
            processReaderExpr( readerExpr.rest.rest.first ) );
        var match = compareStc( a, b );
        // NOTE: This can be true, false, or null.
        if ( match === true )
            console.log( "Test succeeded" );
        else
            console.log(
                "Test failed: Expected " + b.pretty() + ", got " +
                a.pretty() );
    } else {
        throw new Error();
    }
}

function runAllDefs() {
    if ( staccatoDeclarationState.hasRunDefs )
        throw new Error();
    
    runDefs( stcDefs );
    staccatoDeclarationState.hasRunDefs = true;
}
