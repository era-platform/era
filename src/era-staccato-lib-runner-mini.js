// era-staccato-lib-runner-mini.js
// Copyright 2015 Ross Angle. Released under the MIT License.
//
// This is alternative JavaScript code to support running
// era-staccato-lib.stc. Most of it comes from
// era-staccato-lib-runner.js.
//
// The distinction of this file is that it processes a "mini" version
// of Staccato, which actually does not have most of the distinctive
// run time characteristics that make Staccato a worthwhile language.
// This "mini" Staccato dialect is effectively just for generating
// JavaScript.
//
// See era-staccato.js for more information about what Staccato is.


var stcNextGensymI = 0;
function stcGensym() {
    return "gs-" + stcNextGensymI++;
}


function stcIdentifier( identifier ) {
    return "_stc_" +
        identifier.replace( /[^a-z01-9]/g, function ( c ) {
            if ( c === "-" )
                return "__";
            var hexWithExcess = "0000" +
                c.charCodeAt( 0 ).toString( 16 ).toUpperCase();
            return "_" +
                hexWithExcess.substring( hexWithExcess.length - 4 );
        } );
}

function stcCallArr( func, argsArr ) {
    var result = func;
    arrEach( argsArr, function ( arg ) {
        result = "(" + result + ".call( " + arg + " ))";
    } );
    return result;
}

function stcCall( func, var_args ) {
    return stcCallArr( func, [].slice.call( arguments, 1 ) );
}

function stcFn( var_args ) {
    var n = arguments.length;
    var vars = [].slice.call( arguments, 0, n - 1 );
    var body = arguments[ n - 1 ];
    var result = body;
    for ( var i = n - 2; 0 <= i; i-- ) {
        var va = vars[ i ];
        var vaIdentifier = stcIdentifier( va );
        result =
            "(new StcFn( function ( " + vaIdentifier + " ) { " +
                "return " + result + "; " +
            "} ))";
    }
    return result;
}

function stcTypeArr( tupleName, projNames ) {
    var n = projNames.length;
    var tupleTag =
        JSON.stringify( [ tupleName, projNames.slice().sort() ] );
    
    var result = {};
    result.type = "stcType";
    result.tupleName = tupleName;
    result.projNames = projNames;
    result.getTupleTag = function () {
        return tupleTag;
    };
    result.ofArr = function ( args ) {
        var n = projNames.length;
        var projectionVals;
        var arg;
        if ( args.length === n ) {
            projectionVals = args;
            arg = null;
        } else if ( args.length === n + 1 ) {
            projectionVals = [].slice.call( args, 0, n );
            arg = { val: args[ n ] };
        } else {
            throw new Error();
        }
        
        projectionVals = arrMap(
            arrMap( projectionVals, function ( val, i ) {
                return { name: projNames[ i ], val: val };
            } ).sort( function ( a, b ) {
                return a.name < b.name ? -1 : b.name < a.name ? 1 : 0;
            } ),
            function ( entry ) {
                return entry.val;
            } );
        
        var result =
            "(new Stc( " + JSON.stringify( tupleTag ) + ", [ " +
                projectionVals.join( ", " ) +
            " ] ))";
        if ( arg !== null )
            result = stcCall( result, processReaderExpr( arg.val ) );
        return result;
    };
    result.of = function ( var_args ) {
        return this.ofArr( arguments );
    };
    return result;
}

function stcType( tupleName, var_args ) {
    return stcTypeArr( tupleName, [].slice.call( arguments, 1 ) );
}

function stcExecute( expr ) {
    return Function( "Stc", "StcFn", "return " + expr + ";" )(
        Stc, StcFn );
}

function stcAddDefun( name, argName, body ) {
    var tupleTag = JSON.stringify( [ name, [] ] );
    var func = stcExecute(
        "function ( " + stcIdentifier( argName ) + " ) { " +
            "return " + body + "; " +
        "}" );
    defs[ tupleTag ] = function ( projectionVals, argVal ) {
        return func( argVal );
    }
}

function stcErr( msg ) {
    return "(function () { " +
        "throw new Error( " + JSON.stringify( msg ) + " ); " +
    "})()";
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
function StcFn( func ) {
    this.func = func;
}
StcFn.prototype.call = function ( arg ) {
    var func = this.func;
    return func( arg );
};
StcFn.prototype.pretty = function () {
    return "(fn)";
};

var stcNil = stcType( "nil" );

function testStcDef( expr ) {
    var result = stcExecute( expr );
    console.log( result.pretty() );
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
            return "return " + processReaderExpr( body.first ) + "; ";
        var pattern = extractPattern( body );
        if ( pattern.remainingBody.type !== "cons" )
            throw new Error();
        var then = processReaderExpr( pattern.remainingBody.first );
        var els = pattern.remainingBody.rest;
        return "if ( " +
            "matchSubject.tupleTag === " +
                JSON.stringify( pattern.type.getTupleTag() ) + " " +
        ") return (function () { " +
            arrMap( pattern.type.projNames, function ( projName, i ) {
                return "var " +
                    stcIdentifier( pattern.localVars[ i ] ) + " = " +
                    "matchSubject.projNames[ " + i + " ]; ";
            } ).join( "" ) +
            "return " + then + "; " +
        "})(); " + processTail( els );
    }
    
    return "(function () { " +
        "var matchSubject = " +
            processReaderExpr( matchSubject ) + "; " +
        (maybeVa === null ? "" :
            "var " + stcIdentifier( maybeVa.val ) + " = " +
                "matchSubject; ") +
        processTail( body ) +
    " }())";
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
    
    return "(function () { " +
        "var matchSubject = " +
            processReaderExpr( matchSubject ) + "; " +
        "if ( matchSubject.tupleTag === " +
            JSON.stringify( pattern.type.getTupleTag() ) + " " +
        ") return (function () { " +
            arrMap( pattern.type.projNames, function ( projName, i ) {
                return "var " +
                    stcIdentifier( pattern.localVars[ i ] ) + " = " +
                    "matchSubject.projNames[ " + i + " ]; ";
            } ).join( "" ) +
            "return " + body + "; " +
        "})(); " +
        "return " + onCastErr + "; " +
    " }())";
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
    return "(" +
        processReaderExpr( body.rest.first ) + ".tupleTag === " +
            JSON.stringify( type.getTupleTag() ) + " ? " +
            stcYep.of( stcNil.of() ) + " : " +
            stcNope.of( stcNil.of() ) + ")";
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
    var type = stcType( readerStringNilToString( body.first ) );
    return stcCallArr( type.of(),
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
    var bindingVars = [];
    var bindingVals = [];
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
            bindingVars.push(
                stcIdentifier(
                    readerStringNilToString(
                        thisRemainingBody.first ) ) );
            bindingVals.push(
                processReaderExpr( thisRemainingBody.rest.first ) );
        })();
        remainingBody = remainingBody.rest.rest;
    }
    return "(function ( " + bindingVars.join( ", " ) + " ) { " +
        "return " + processReaderExpr( remainingBody.first ) + "; " +
    "}( " + bindingVals.join( ", " ) + " ))";
} );

function processReaderExpr( readerExpr ) {
    if ( readerExpr.type === "stringNil" )
        return stcIdentifier( readerStringNilToString( readerExpr ) );
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
    var type = stcTypeArr( tupleName, projNames );
    staccatoDeclarationState.types.set( tupleName, type );
    staccatoDeclarationState.macros.set( tupleName,
        function ( body ) {
        
        var projVals = [];
        var remainingBody = body;
        for ( var i = 0; i < n; i++ ) {
            if ( remainingBody.type !== "cons" )
                throw new Error(
                    "Expected more arguments to " +
                    JSON.stringify( tupleName ) );
            projVals.push( processReaderExpr( remainingBody.first ) );
            remainingBody = remainingBody.rest;
        }
        return stcCallArr(
            type.ofArr( projVals ),
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
            stcCall( processFn( readerExpr.rest.rest ),
                stcIdentifier( firstArg ) ) );
        processDefType( name, [] );
    } else if ( macroName === "run-defs" ) {
        if ( readerExpr.rest.type === "cons" )
            throw new Error();
        if ( staccatoDeclarationState.hasRunDefs )
            throw new Error();
        
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
