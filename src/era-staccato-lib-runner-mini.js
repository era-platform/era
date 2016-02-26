// era-staccato-lib-runner-mini.js
// Copyright 2015, 2016 Ross Angle. Released under the MIT License.
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
        JSON.stringify( identifier ).replace( /[^a-z01-9]/g,
            function ( c ) {
            
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
        result =
            "(" + result + ".callStc( definitionNs, " + arg + " ))";
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

function stcConstructorName( definitionNs, stringyName ) {
    if ( typeof stringyName !== "string" )
        return stringyName;
    return stcNsGet( "name",
        stcNsGet( stringyName,
            stcNsGet( "constructor-names", definitionNs ) ) ).name;
}

function stcConstructorTag( definitionNs, constructorName ) {
    return stcNsGet( "tag",
        stcNsGet( constructorName,
            stcNsGet( "constructors", definitionNs ) ) ).name;
}

function stcProjectionName(
    definitionNs, constructorName, stringyName ) {
    
    if ( typeof stringyName !== "string" )
        return stringyName;
    return stcNsGet( "name",
        stcNsGet( stringyName,
            stcNsGet( "projection-names",
                stcNsGet( constructorName,
                    stcNsGet( "constructors",
                        definitionNs ) ) ) ) ).name;
}

function stcMacroName( definitionNs, stringyName ) {
    if ( typeof stringyName !== "string" )
        return stringyName;
    return stcNsGet( "name",
        stcNsGet( stringyName,
            stcNsGet( "macro-names", definitionNs ) ) ).name;
}

function nameCompare( a, b ) {
    if ( typeof a === "string" ) {
        if ( typeof b === "string" ) {
            return a < b ? -1 : b < a ? 1 : 0;
        } else if ( b[ 0 ] === "tuple-tag" ) {
            return -1;
        } else if ( b[ 0 ] === "root" ) {
            // NOTE: We let strings come before the root name because
            // that ordering remains stable even if we implement the
            // root name as a `get` name.
            return -1;
        } else if ( b[ 0 ] === "get" ) {
            return -1;
        } else {
            throw new Error();
        }
    } else if ( a[ 0 ] === "tuple-tag" ) {
        if ( typeof b === "string" ) {
            return 1;
        } else if ( b[ 0 ] === "tuple-tag" ) {
            var compareTupleNames = nameCompare( a[ 1 ], b[ 1 ] );
            if ( compareTupleNames !== 0 )
                return compareTupleNames;
            if ( a[ 2 ].length < b[ 2 ].length )
                return -1;
            if ( b[ 2 ].length < a[ 2 ].length )
                return 1;
            return (arrAny( a[ 2 ], function ( aProj, i ) {
                var bProj = b[ i ];
                var compareProjNames = nameCompare( aProj, bProj );
                return compareProjNames === 0 ? false :
                    { val: compareProjNames };
            } ) || { val: 0 }).val;
        } else if ( b[ 0 ] === "root" ) {
            return -1;
        } else if ( b[ 0 ] === "get" ) {
            return -1;
        } else {
            throw new Error();
        }
    } else if ( a[ 0 ] === "root" ) {
        if ( typeof b === "string" ) {
            return 1;
        } else if ( b[ 0 ] === "tuple-tag" ) {
            return 1;
        } else if ( b[ 0 ] === "root" ) {
            return 0;
        } else if ( b[ 0 ] === "get" ) {
            return -1;
        } else {
            throw new Error();
        }
    } else if ( a[ 0 ] === "get" ) {
        if ( typeof b === "string" ) {
            return 1;
        } else if ( b[ 0 ] === "tuple-tag" ) {
            return 1;
        } else if ( b[ 0 ] === "root" ) {
            return 1;
        } else if ( b[ 0 ] === "get" ) {
            // NOTE: This ends up ordering the names in a breath-first
            // way. If we needed any ordering in particular, it
            // probably wouldn't be this one, but for now an arbitrary
            // order is fine.
            var compareParents = nameCompare( a[ 2 ], b[ 2 ] );
            if ( compareParents !== 0 )
                return compareParents;
            return nameCompare( a[ 1 ], b[ 1 ] );
        } else {
            throw new Error();
        }
    } else {
        throw new Error();
    }
}

function stcTypeArr(
    definitionNs, tupleStringyName, projStringyNames ) {
    
    var constructorName =
        stcConstructorName( definitionNs, tupleStringyName );
    var tupleName =
        stcConstructorTag( definitionNs, constructorName );
    var projNames = arrMap( projStringyNames, function ( stringy ) {
        return stcProjectionName(
            definitionNs, constructorName, stringy );
    } );
    var sortedProjNames = arrMap( projNames, function ( name, i ) {
        return { i: i, name: name };
    } ).sort( function ( a, b ) {
        return nameCompare( a.name, b.name );
    } );
    var projNamesToSortedIndices = jsnMap();
    arrEach( sortedProjNames, function ( entry, i ) {
        projNamesToSortedIndices.set( entry.name, i );
    } );
    var tupleTag = JSON.stringify( stcNameTupleTagAlreadySorted(
        tupleName,
        arrMap( sortedProjNames, function ( entry ) {
            return entry.name;
        } )
    ) );
    var n = projNames.length;
    
    var result = {};
    result.type = "stcType";
    result.tupleName = tupleName;
    result.projNames = projNames;
    result.getTupleTag = function () {
        return tupleTag;
    };
    result.getProj = function ( stc, projStringyName ) {
        if ( !(stc instanceof Stc) )
            throw new Error();
        if ( stc.tupleTag !== tupleTag )
            throw new Error();
        var projName = stcProjectionName(
            definitionNs, constructorName, projStringyName );
        if ( !projNamesToSortedIndices.has( projName ) )
            throw new Error();
        return stc.projNames[
            projNamesToSortedIndices.get( projName ) ];
    };
    result.ofArr = function ( args ) {
        if ( args.length !== n )
            throw new Error();
        
        var projectionVals =
            arrMap( sortedProjNames, function ( entry ) {
                return args[ entry.i ];
            } );
        
        var result =
            "(new Stc( " + JSON.stringify( tupleTag ) + ", [ " +
                projectionVals.join( ", " ) +
            " ] ))";
        return result;
    };
    result.of = function ( var_args ) {
        return this.ofArr( [].slice.call( arguments, 0 ) );
    };
    result.ofArrNow = function ( args ) {
        if ( args.length !== n )
            throw new Error();
        
        return new Stc( tupleTag,
            arrMap( sortedProjNames, function ( entry ) {
                return args[ entry.i ];
            } ) );
    };
    result.ofNow = function ( var_args ) {
        return this.ofArrNow( [].slice.call( arguments, 0 ) );
    };
    return result;
}

function stcNsRoot() {
    return {
        name: [ "root" ],
        shadows: jsnMap()
    };
}
function stcNsGet( stringOrName, ns ) {
    return ns.shadows.has( stringOrName ) ?
        ns.shadows.get( stringOrName ) : {
            name: [ "get", stringOrName, ns.name ],
            shadows: jsnMap()
        };
}
function stcNsShadow( stringOrName, subNs, ns ) {
    return {
        name: ns.name,
        shadows: ns.shadows.plusEntry( stringOrName, subNs )
    };
}
function stcNameTupleTagAlreadySorted( tupleName, projNames ) {
    return [ "tuple-tag", tupleName, projNames ];
}
// NOTE: The term "nss" is supposed to be the plural of "ns," which
// means "namespace."
function nssGet( nss, stringOrName ) {
    return {
        definitionNs: nss.definitionNs,
        uniqueNs: stcNsGet( stringOrName, nss.uniqueNs )
    };
}

function stcType( definitionNs, tupleStringyName, var_args ) {
    return stcTypeArr( definitionNs, tupleStringyName,
        [].slice.call( arguments, 2 ) );
}


var staccatoDeclarationState = {};
staccatoDeclarationState.namespaceDefs = jsnMap();
staccatoDeclarationState.functionDefs = {};
staccatoDeclarationState.hasRunDefs = false;
function Stc( tupleTag, opt_projNames ) {
    this.tupleTag = tupleTag;
    this.projNames = opt_projNames || [];
}
Stc.prototype.callStc = function ( definitionNs, arg ) {
    // TODO: Look up the function implementation from `namespaceDefs`
    // /functions/<tupleTag>/staccato, at least when there's no entry
    // in `functionDefs`.
    var func = staccatoDeclarationState.functionDefs[ this.tupleTag ];
    return func( this.projNames, arg );
};
Stc.prototype.pretty = function () {
    return "(" +
        JSON.stringify(
            JSON.parse( this.tupleTag )[ 1 ][ 2 ][ 1 ][ 2 ][ 1 ] ) +
        arrMap( this.projNames, function ( elem, i ) {
            return " " + elem.pretty();
        } ).join( "" ) + ")";
};
function StcFn( func ) {
    this.func = func;
}
StcFn.prototype.callStc = function ( definitionNs, arg ) {
    var func = this.func;
    return func( arg );
};
StcFn.prototype.pretty = function () {
    return "(fn)";
};
function StcForeign( purpose, foreignVal ) {
    this.purpose = purpose;
    this.foreignVal = foreignVal;
}
StcForeign.prototype.callStc = function ( definitionNs, arg ) {
    throw new Error();
};
StcForeign.prototype.pretty = function () {
    return "(foreign " + this.purpose + " " +
        JSON.stringify( this.foreignVal ) + ")";
};

function stcExecute( definitionNs, expr ) {
    return Function( "definitionNs", "Stc", "StcFn", "StcForeign",
        "return " + expr + ";"
    )( definitionNs, Stc, StcFn, StcForeign );
}

function stcAddDefun( nss, name, argName, body ) {
    var tupleTagName = stcNameTupleTagAlreadySorted( name, [] );
    var tupleTag = JSON.stringify( tupleTagName );
    var staccatoName =
        stcNsGet( "staccato",
            stcNsGet( tupleTagName,
                stcNsGet( "functions", nss.definitionNs ) ) );
    var innerFunc = stcExecute( nss.definitionNs,
        "function ( " + stcIdentifier( argName ) + " ) { " +
            "return " + body + "; " +
        "}" );
    // TODO: Also add an entry to `namespaceDefs`. This naive Staccato
    // implementation doesn't do a full desugaring, so we can't create
    // the correct `stc-def`, but let's at least create an appropriate
    // `stc-def-foreign`.
    staccatoDeclarationState.functionDefs[ tupleTag ] =
        function ( projectionVals, argVal ) {
        
        return innerFunc( argVal );
    };
}

function stcErr( msg ) {
    return "(function () { " +
        "throw new Error( " + JSON.stringify( msg ) + " ); " +
    "})()";
}

function evalStcForTest( definitionNs, expr ) {
    return stcExecute( definitionNs, expr );
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

function stxToMaybeName( definitionNs, stx ) {
    var stcStx =
        stcType( definitionNs, "stx", "stx-details", "s-expr" );
    var stcForeign = stcType( definitionNs, "foreign", "val" );
    var stcName = stcType( definitionNs, "name", "val" );
    var stcIstringNil =
        stcType( definitionNs, "istring-nil", "string" );
    var stcString = stcType( definitionNs, "string", "val" );
    
    if ( stx.tupleTag !== stcStx.getTupleTag() )
        return null;
    var sExpr = stcStx.getProj( stx, "s-expr" );
    if ( sExpr.tupleTag === stcForeign.getTupleTag() ) {
        var name = stcForeign.getProj( sExpr, "val" );
        if ( name.tupleTag !== stcName.getTupleTag() )
            throw new Error();
        var nameInternal = stcName.getProj( name, "val" );
        if ( !(nameInternal instanceof StcForeign) )
            throw new Error();
        if ( nameInternal.purpose !== "name" )
            throw new Error();
        return nameInternal.foreignVal;
    } else if ( sExpr.tupleTag === stcIstringNil.getTupleTag() ) {
        var string = stcIstringNil.getProj( sExpr, "string" );
        if ( string.tupleTag !== stcString.getTupleTag() )
            throw new Error();
        var stringInternal = stcString.getProj( string, "val" );
        if ( !(stringInternal instanceof StcForeign) )
            throw new Error();
        if ( stringInternal.purpose !== "string" )
            throw new Error();
        return stringInternal.foreignVal;
    } else {
        return null;
    }
}

function stcConsListToArray( definitionNs, stc ) {
    var stcCons = stcType( definitionNs, "cons", "car", "cdr" );
    var result = [];
    for ( var currentStc = stc;
        currentStc.tupleTag === stcCons.getTupleTag();
        currentStc = stcCons.getProj( currentStc, "cdr" )
    ) {
        result.unshift( stcCons.getProj( currentStc, "car" ) );
    }
    return result;
}

function stcArrayToConsList( definitionNs, arr ) {
    var stcCons = stcType( definitionNs, "cons", "car", "cdr" );
    var result = stcType( definitionNs, "nil" ).ofNow();
    for ( var i = arr.length - 1; 0 <= i; i-- )
        result = stcCons.ofNow( arr[ i ], result );
    return result;
}


function getType( macroDefNs, definitionNs, tupleName ) {
    var stcName = stcType( macroDefNs, "name", "val" );
    var constructorName =
        stcConstructorName( definitionNs, tupleName );
    var projListName =
        stcNsGet( "projection-list",
            stcNsGet( constructorName,
                stcNsGet( "constructors", definitionNs ) ) ).name;
    if ( !staccatoDeclarationState.namespaceDefs.has( projListName ) )
        throw new Error(
            "No such type: " + JSON.stringify( tupleName ) );
    var projList =
        staccatoDeclarationState.namespaceDefs.get( projListName );
    return stcTypeArr( definitionNs, tupleName,
        arrMap( stcConsListToArray( macroDefNs, projList ),
            function ( projName ) {
            
            if ( projName.tupleTag !== stcName.getTupleTag() )
                throw new Error();
            var projNameInternal = stcName.getProj( projName, "val" );
            if ( !(projNameInternal instanceof StcForeign
                && projNameInternal.purpose === "name") )
                throw new Error();
            return projNameInternal.foreignVal;
        } ) );
}
function extractPattern( macroDefNs, definitionNs, body ) {
    var stcCons = stcType( macroDefNs, "cons", "car", "cdr" );
    if ( body.tupleTag !== stcCons.getTupleTag() )
        throw new Error();
    var tupleNameExpr = stcCons.getProj( body, "car" );
    var tupleName = stxToMaybeName( macroDefNs, tupleNameExpr );
    if ( tupleName === null )
        throw new Error(
            "Encountered a case branch with a tuple name that " +
            "wasn't a syntactic name: " + tupleNameExpr.pretty() );
    var type = getType( macroDefNs, definitionNs, tupleName );
    var remainingBody = stcCons.getProj( body, "cdr" );
    var localVars = [];
    for ( var i = 0, n = type.projNames.length; i < n; i++ ) {
        if ( remainingBody.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var localVar = stxToMaybeName( macroDefNs,
            stcCons.getProj( remainingBody, "car" ) );
        if ( localVar === null )
            throw new Error();
        localVars.push( localVar );
        remainingBody = stcCons.getProj( remainingBody, "cdr" );
    }
    
    var result = {};
    result.type = type;
    result.localVars = localVars;
    result.remainingBody = remainingBody;
    return result;
}
function stcCaseletForRunner(
    macroDefNs, nss, maybeVa, matchSubject, body ) {
    
    var stcCons = stcType( macroDefNs, "cons", "car", "cdr" );
    
    function processTail( nss, body ) {
        if ( body.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var body1 = stcCons.getProj( body, "cdr" );
        if ( body1.tupleTag !== stcCons.getTupleTag() )
            return "return " +
                macroexpandInnerLevel( macroDefNs, nss,
                    stcCons.getProj( body, "car" ) ) +
                "; ";
        var pattern =
            extractPattern( macroDefNs, nss.definitionNs, body );
        if ( pattern.remainingBody.tupleTag !==
            stcCons.getTupleTag() )
            throw new Error();
        var then = macroexpandInnerLevel( macroDefNs,
            nssGet( nss, "then" ),
            stcCons.getProj( pattern.remainingBody, "car" ) );
        var els = stcCons.getProj( pattern.remainingBody, "cdr" );
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
        "})(); " + processTail( nssGet( nss, "tail" ), els );
    }
    
    return "(function () { " +
        "var matchSubject = " +
            macroexpandInnerLevel( macroDefNs,
                nssGet( nss, "subject" ), matchSubject ) + "; " +
        (maybeVa === null ? "" :
            "var " + stcIdentifier( maybeVa.val ) + " = " +
                "matchSubject; ") +
        processTail( nssGet( nss, "tail" ), body ) +
    " }())";
}
function stcCast( macroDefNs, nss, matchSubject, body ) {
    var stcCons = stcType( macroDefNs, "cons", "car", "cdr" );
    var pattern =
        extractPattern( macroDefNs, nss.definitionNs, body );
    if ( pattern.remainingBody.tupleTag !== stcCons.getTupleTag() )
        throw new Error();
    var remainingBody1 =
        stcCons.getProj( pattern.remainingBody, "cdr" );
    if ( remainingBody1.tupleTag !== stcCons.getTupleTag() )
        throw new Error();
    var remainingBody2 = stcCons.getProj( remainingBody1, "cdr" );
    if ( remainingBody2.tupleTag === stcCons.getTupleTag() )
        throw new Error();
    var onCastErr =
        macroexpandInnerLevel( macroDefNs,
            nssGet( nss, "on-cast-err" ),
            stcCons.getProj( pattern.remainingBody, "car" ) );
    var body = macroexpandInnerLevel( macroDefNs,
        nssGet( nss, "body" ),
        stcCons.getProj( remainingBody1, "car" ) );
    
    return "(function () { " +
        "var matchSubject = " +
            macroexpandInnerLevel( macroDefNs,
                nssGet( nss, "subject" ),
                matchSubject ) +
            "; " +
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

function processFn( macroDefNs, nss, body ) {
    var stcCons = stcType( macroDefNs, "cons", "car", "cdr" );
    if ( body.tupleTag !== stcCons.getTupleTag() )
        throw new Error();
    var body1 = stcCons.getProj( body, "cdr" );
    if ( body1.tupleTag !== stcCons.getTupleTag() )
        return macroexpandInnerLevel( macroDefNs, nss,
            stcCons.getProj( body, "car" ) );
    var param = stcCons.getProj( body, "car" );
    var paramName = stxToMaybeName( macroDefNs, param );
    if ( paramName === null )
        throw new Error(
            "Called fn with a variable name that wasn't a " +
            "syntactic name: " + param.pretty() );
    return stcFn( paramName, processFn( macroDefNs, nss, body1 ) );
}

function mapConsListToArr( definitionNs, list, func ) {
    var stcCons = stcType( definitionNs, "cons", "car", "cdr" );
    var result = [];
    for ( var e = list;
        e.tupleTag === stcCons.getTupleTag();
        e = stcCons.getProj( e, "cdr" )
    ) {
        result.push( func( stcCons.getProj( e, "car" ) ) );
    }
    if ( e.tupleTag !== stcType( definitionNs, "nil" ).getTupleTag() )
        throw new Error();
    return result;
}

function mapConsListToArrWithNss( macroDefNs, nss, list, func ) {
    var stcCons = stcType( macroDefNs, "cons", "car", "cdr" );
    var currentNss = nss;
    var result = [];
    for ( var e = list;
        e.tupleTag === stcCons.getTupleTag();
        e = stcCons.getProj( e, "cdr" )
    ) {
        result.push(
            func( nssGet( currentNss, "first" ),
                stcCons.getProj( e, "car" ) ) );
        currentNss = nssGet( currentNss, "rest" );
    }
    if ( e.tupleTag !== stcType( macroDefNs, "nil" ).getTupleTag() )
        throw new Error();
    return result;
}

function assertMacroDoesNotExist( definitionNs, name ) {
    var resolvedMacroName = stcMacroName( definitionNs, name );
    var macroFunctionName =
        stcNsGet( "function",
            stcNsGet( resolvedMacroName,
                stcNsGet( "macros", definitionNs ) ) ).name;
    if ( staccatoDeclarationState.namespaceDefs.has(
        macroFunctionName ) )
        throw new Error();
    return macroFunctionName;
}

function stcAddMacro( definitionNs, name, macroFunctionImpl ) {
    var macroFunctionName =
        assertMacroDoesNotExist( definitionNs, name );
    staccatoDeclarationState.namespaceDefs.set( macroFunctionName,
        new StcFn( function ( mode ) {
            return new StcFn( function ( uniqueNs ) {
                return new StcFn( function ( definitionNs ) {
                    return new StcFn( function ( myStxDetails ) {
                        return new StcFn( function ( body ) {
                            if ( !(mode instanceof StcForeign
                                && mode.purpose === "mode") )
                                throw new Error();
                            if ( !(uniqueNs instanceof StcForeign
                                && uniqueNs.purpose === "ns") )
                                throw new Error();
                            if ( !(definitionNs instanceof StcForeign
                                && definitionNs.purpose === "ns") )
                                throw new Error();
                            
                            return new StcForeign( "effects",
                                function () {
                                
                                return new StcForeign(
                                    "compiled-code",
                                    macroFunctionImpl( {
                                        definitionNs:
                                            definitionNs.foreignVal,
                                        uniqueNs: uniqueNs.foreignVal
                                    }, myStxDetails, body ) );
                            } );
                        } );
                    } );
                } );
            } );
        } ) );
}

function stcAddCoreMacros( macroDefNs, targetDefNs ) {
    var stcCons = stcType( macroDefNs, "cons", "car", "cdr" );
    var stcNil = stcType( macroDefNs, "nil" );
    var stcIstringNil =
        stcType( macroDefNs, "istring-nil", "string" );
    var stcYep = stcType( macroDefNs, "yep", "val" );
    var stcNope = stcType( macroDefNs, "nope", "val" );
    var stcStx =
        stcType( macroDefNs, "stx", "stx-details", "s-expr" );
    var stcString = stcType( macroDefNs, "string", "val" );
    var stcName = stcType( macroDefNs, "name", "val" );
    var stcForeign = stcType( macroDefNs, "foreign", "val" );
    
    function mac( name, body ) {
        stcAddMacro( targetDefNs, name, body );
    }
    function fun( name, body ) {
        var constructorTag = stcConstructorTag( targetDefNs,
            stcConstructorName( targetDefNs, name ) );
        var tupleTagName =
            stcNameTupleTagAlreadySorted( constructorTag, [] );
        var tupleTag = JSON.stringify( tupleTagName );
        // TODO: Also add an entry to `namespaceDefs`. We should
        // create an appropriate `stc-def-foreign`.
        staccatoDeclarationState.functionDefs[ tupleTag ] =
            function ( projectionVals, argVal ) {
            
            return body( argVal );
        };
        processDefType( macroDefNs, targetDefNs, name, [] );
    }
    
    mac( "case", function ( nss, myStxDetails, body ) {
        if ( body.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        return stcCaseletForRunner( macroDefNs, nss, null,
            stcCons.getProj( body, "car" ),
            stcCons.getProj( body, "cdr" ) );
    } );
    
    mac( "caselet", function ( nss, myStxDetails, body ) {
        if ( body.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var body1 = stcCons.getProj( body, "cdr" );
        if ( body1.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var va = stxToMaybeName( macroDefNs,
            stcCons.getProj( body, "car" ) );
        if ( va === null )
            throw new Error();
        
        return stcCaseletForRunner( macroDefNs, nss, { val: va },
            stcCons.getProj( body1, "car" ),
            stcCons.getProj( body1, "cdr" ) );
    } );
    
    mac( "cast", function ( nss, myStxDetails, body ) {
        if ( body.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        return stcCast( macroDefNs, nss,
            stcCons.getProj( body, "car" ),
            stcCons.getProj( body, "cdr" ) );
    } );
    
    mac( "isa", function ( nss, myStxDetails, body ) {
        if ( body.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var body1 = stcCons.getProj( body, "cdr" );
        if ( body1.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var body2 = stcCons.getProj( body1, "cdr" );
        if ( body2.tupleTag === stcCons.getTupleTag() )
            throw new Error();
        var tupleNameExpr = stcCons.getProj( body, "car" );
        var tupleName = stxToMaybeName( macroDefNs, tupleNameExpr );
        if ( tupleName === null )
            throw new Error(
                "Encountered an isa with a tuple name that wasn't " +
                "a syntactic name: " + tupleNameExpr.pretty() );
        var type = getType( macroDefNs, nss.definitionNs, tupleName );
        var expandedBody = macroexpandInnerLevel( macroDefNs, nss,
            stcCons.getProj( body1, "car" ) );
        return "(" + expandedBody + ".tupleTag === " +
                JSON.stringify( type.getTupleTag() ) + " ? " +
                stcYep.of( stcNil.of() ) + " : " +
                stcNope.of( stcNil.of() ) + ")";
    } );
    
    mac( "proj1", function ( nss, myStxDetails, body ) {
        if ( body.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var body1 = stcCons.getProj( body, "cdr" );
        if ( body1.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var body2 = stcCons.getProj( body1, "cdr" );
        if ( body2.tupleTag === stcCons.getTupleTag() )
            throw new Error();
        
        var va = stcStx.ofNow( myStxDetails,
            stcForeign.ofNow(
                stcName.ofNow(
                    new StcForeign( "name",
                        nssGet( nss, "var" ).uniqueNs.name ) ) ) );
        return stcCast( macroDefNs, nssGet( nss, "cast" ),
            stcCons.getProj( body1, "car" ),
            stcArrayToConsList( macroDefNs, [
                stcCons.getProj( body, "car" ),
                va,
                stcStx.ofNow( myStxDetails,
                    stcArrayToConsList( macroDefNs, [
                        stcStx.ofNow( myStxDetails,
                            stcForeign.ofNow(
                                stcName.ofNow(
                                    new StcForeign( "name", stcMacroName( macroDefNs, "err" ) ) ) ) ),
                        stcStx.ofNow( myStxDetails,
                            stcIstringNil.ofNow(
                                stcString.ofNow(
                                    new StcForeign( "string", "Internal error" ) ) ) )
                    ] ) ),
                va
            ] ) );
    } );
    
    mac( "c", function ( nss, myStxDetails, body ) {
        if ( body.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        return stcCallArr(
            macroexpandInnerLevel( macroDefNs, nssGet( nss, "func" ),
                stcCons.getProj( body, "car" ) ),
            mapConsListToArrWithNss( macroDefNs,
                nssGet( nss, "args" ),
                stcCons.getProj( body, "cdr" ),
                function ( nss, expr ) {
                
                return macroexpandInnerLevel( macroDefNs, nss, expr );
            } ) );
    } );
    
    mac( "c-new", function ( nss, myStxDetails, body ) {
        if ( body.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var tupleName = stxToMaybeName( macroDefNs,
            stcCons.getProj( body, "car" ) );
        if ( tupleName === null )
            throw new Error();
        var type = stcType( nss.definitionNs, tupleName );
        return stcCallArr( type.of(),
            mapConsListToArrWithNss( macroDefNs, nss,
                stcCons.getProj( body, "cdr" ),
                function ( nss, expr ) {
                
                return macroexpandInnerLevel( macroDefNs, nss, expr );
            } ) );
    } );
    
    function stxToDefiniteString( stx ) {
        if ( stx.tupleTag !== stcStx.getTupleTag() )
            throw new Error();
        var istringNil = stcStx.getProj( stx, "s-expr" );
        if ( istringNil.tupleTag !== stcIstringNil.getTupleTag() )
            throw new Error();
        var string = stcIstringNil.getProj( istringNil, "string" );
        if ( string.tupleTag !== stcString.getTupleTag() )
            throw new Error();
        var stringInternal = stcString.getProj( string, "val" );
        if ( !(stringInternal instanceof StcForeign
            && stringInternal.purpose === "string") )
            throw new Error();
        return stringInternal.foreignVal;
    }
    
    mac( "err", function ( nss, myStxDetails, body ) {
        if ( body.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        if ( stcCons.getProj( body, "cdr" ).tupleTag ===
            stcCons.getTupleTag() )
            throw new Error();
        return stcErr(
            stxToDefiniteString( stcCons.getProj( body, "car" ) ) );
    } );
    
    mac( "str", function ( nss, myStxDetails, body ) {
        if ( body.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        if ( stcCons.getProj( body, "cdr" ).tupleTag ===
            stcCons.getTupleTag() )
            throw new Error();
        return stcString.of( "(new StcForeign( \"string\", " +
            JSON.stringify(
                stxToDefiniteString(
                    stcCons.getProj( body, "car" ) ) ) +
        " ))" );
    } );
    
    mac( "fn", function ( nss, myStxDetails, body ) {
        return processFn( macroDefNs, nss, body );
    } );
    
    mac( "let", function ( nss, myStxDetails, body ) {
        var remainingBody = body;
        var bindingVars = [];
        var bindingVals = [];
        var bindingArrThunks = [];
        var bindingsNss = nssGet( nss, "bindings" );
        while ( true ) {
            if ( remainingBody.tupleTag !== stcCons.getTupleTag() )
                throw new Error();
            var remainingBody1 =
                stcCons.getProj( remainingBody, "cdr" );
            if ( remainingBody1.tupleTag !== stcCons.getTupleTag() )
                break;
            var va = stxToMaybeName( macroDefNs,
                stcCons.getProj( remainingBody, "car" ) );
            if ( va === null )
                throw new Error();
            bindingVars.push( stcIdentifier( va ) );
            bindingVals.push(
                macroexpandInnerLevel( macroDefNs,
                    nssGet( bindingsNss, "first" ),
                    stcCons.getProj( remainingBody1, "car" ) ) );
            remainingBody = stcCons.getProj( remainingBody1, "cdr" );
            bindingsNss = nssGet( bindingsNss, "rest" );
        }
        return "(function ( " + bindingVars.join( ", " ) + " ) { " +
            "return " +
                macroexpandInnerLevel( macroDefNs,
                    nssGet( nss, "body" ),
                    stcCons.getProj( remainingBody, "car" ) ) +
                "; " +
        "}( " + bindingVals.join( ", " ) + " ))";
    } );
    
    fun( "string-compare", function ( a ) {
        return new StcFn( function ( b ) {
            if ( a.tupleTag !== stcString.getTupleTag() )
                throw new Error();
            var aInternal = stcString.getProj( a, "val" );
            if ( !(aInternal instanceof StcForeign
                && aInternal.purpose === "string") )
                throw new Error();
            
            if ( b.tupleTag !== stcString.getTupleTag() )
                throw new Error();
            var bInternal = stcString.getProj( a, "val" );
            if ( !(bInternal instanceof StcForeign
                && bInternal.purpose === "string") )
                throw new Error();
            
            // TODO: Figure out what ordering we actually want to
            // have. We probably want this one, for efficiency at
            // least, but in that case we should turn this into
            // `string-metacompare` iuntil `string-compare`.
            if ( aInternal.foreignVal < bInternal.foreignVal )
                return stcYep.ofNow( stcNil.ofNow() );
            if ( bInternal.foreignVal < aInternal.foreignVal )
                return stcNope.ofNow( stcNil.ofNow() );
            return stcNil.ofNow();
        } );
    } );
    
    fun( "name-metacompare", function ( a ) {
        return new StcFn( function ( b ) {
            if ( a.tupleTag !== stcName.getTupleTag() )
                throw new Error();
            var aInternal = stcName.getProj( a, "val" );
            if ( !(aInternal instanceof StcForeign
                && aInternal.purpose === "name") )
                throw new Error();
            
            if ( b.tupleTag !== stcName.getTupleTag() )
                throw new Error();
            var bInternal = stcName.getProj( a, "val" );
            if ( !(bInternal instanceof StcForeign
                && bInternal.purpose === "name") )
                throw new Error();
            
            var result = nameCompare(
                aInternal.foreignVal, bInternal.foreignVal );
            
            if ( result < 0 )
                return new StcForeign( "lt", null );
            if ( 0 < result )
                return new StcForeign( "gt", null );
            return stcNil.ofNow();
        } );
    } );
    
    fun( "make-tuple-tag", function ( tupleName ) {
        return new StcFn( function ( projNames ) {
            var tupleStringyName =
                stxToMaybeName( macroDefNs, tupleName );
            if ( tupleStringyName === null )
                throw new Error();
            if ( typeof tupleStringyName === "string" )
                throw new Error();
            var projStringyNames = mapConsListToArr( macroDefNs,
                stcCons.getProj( sExpr1, "cdr" ),
                function ( projName ) {
                    var projStringyName =
                        stxToMaybeName( macroDefNs, projStringyName );
                    if ( projStringyName === null )
                        throw new Error();
                    if ( typeof projStringyName === "string" )
                        throw new Error();
                    return projStringyName;
                } );
            return stcName.ofNow(
                new StcForeign( "name",
                    stcNameTupleTagAlreadySorted(
                        stcConstructorTag( macroDefNs,
                            tupleStringyName ),
                        projStringyNames.sort( function ( a, b ) {
                            return nameCompare( a, b );
                        } ) ) ) );
        } );
    } );
    
    fun( "macro-stx-details", function ( mode ) {
        return new StcFn( function ( uniqueNs ) {
            return new StcFn( function ( definitionNs ) {
                return new StcFn( function ( stx ) {
                    return stcTrivialStxDetails();
                } );
            } );
        } );
    } );
    
    fun( "ns-get-name", function ( name ) {
        return new StcFn( function ( ns ) {
            if ( name.tupleTag !== stcName.getTupleTag() )
                throw new Error();
            var nameInternal = stcName.getProj( name, "val" );
            if ( !(nameInternal instanceof StcForeign
                && nameInternal.purpose === "name") )
                throw new Error();
            
            if ( !(ns instanceof StcForeign && ns.purpose === "ns") )
                throw new Error();
            
            return new StcForeign( "ns",
                stcNsGet( nameInternal.foreignVal, ns.foreignVal ) );
        } );
    } );
    
    fun( "ns-get-string", function ( string ) {
        return new StcFn( function ( ns ) {
            if ( string.tupleTag !== stcString.getTupleTag() )
                throw new Error();
            var stringInternal = stcString.getProj( string, "val" );
            if ( !(stringInternal instanceof StcForeign
                && stringInternal.purpose === "string") )
                throw new Error();
            
            if ( !(ns instanceof StcForeign && ns.purpose === "ns") )
                throw new Error();
            
            return new StcForeign( "ns",
                stcNsGet( stringInternal.foreignVal,
                    ns.foreignVal ) );
        } );
    } );
    
    fun( "ns-shadow-name", function ( name ) {
        return new StcFn( function ( subNs ) {
            return new StcFn( function ( ns ) {
                if ( name.tupleTag !== stcName.getTupleTag() )
                    throw new Error();
                var nameInternal = stcName.getProj( name, "val" );
                if ( !(nameInternal instanceof StcForeign
                    && nameInternal.purpose === "name") )
                    throw new Error();
                
                if ( !(subNs instanceof StcForeign
                    && subNs.purpose === "ns") )
                    throw new Error();
                
                if ( !(ns instanceof StcForeign
                    && ns.purpose === "ns") )
                    throw new Error();
                
                return new StcForeign( "ns",
                    stcNsShadow( nameInternal.foreignVal,
                        subNs.foreignVal, ns.foreignVal ) );
            } );
        } );
    } );
    
    fun( "ns-shadow-string", function ( string ) {
        return new StcFn( function ( subNs ) {
            return new StcFn( function ( ns ) {
                if ( string.tupleTag !== stcString.getTupleTag() )
                    throw new Error();
                var stringInternal =
                    stcString.getProj( string, "val" );
                if ( !(stringInternal instanceof StcForeign
                    && stringInternal.purpose === "string") )
                    throw new Error();
                
                if ( !(subNs instanceof StcForeign
                    && subNs.purpose === "ns") )
                    throw new Error();
                
                if ( !(ns instanceof StcForeign
                    && ns.purpose === "ns") )
                    throw new Error();
                
                return new StcForeign( "ns",
                    stcNsShadow( stringInternal.foreignVal,
                        subNs.foreignVal, ns.foreignVal ) );
            } );
        } );
    } );
    
    fun( "procure-name", function ( mode ) {
        return new StcFn( function ( ns ) {
            if ( !(mode instanceof StcForeign
                && mode.purpose === "mode") )
                throw new Error();
            
            if ( !(ns instanceof StcForeign && ns.purpose === "ns") )
                throw new Error();
            
            return stcName.ofNow(
                new StcForeign( "name", ns.foreignVal.name ) );
        } );
    } );
    
    fun( "procure-defined", function ( mode ) {
        return new StcFn( function ( ns ) {
            if ( !(mode instanceof StcForeign
                && mode.purpose === "mode") )
                throw new Error();
            
            if ( !(ns instanceof StcForeign && ns.purpose === "ns") )
                throw new Error();
            
            if ( !staccatoDeclarationState.namespaceDefs.has(
                ns.foreignVal.name ) )
                throw new Error(
                    "No such defined value: " +
                    JSON.stringify( ns.foreignVal.name ) );
            return staccatoDeclarationState.namespaceDefs.get(
                ns.foreignVal.name );
        } );
    } );
    
    fun( "procure-put-defined", function ( mode ) {
        return new StcFn( function ( ns ) {
            return new StcFn( function ( value ) {
                return new StcFn( function ( then ) {
                    if ( !(mode instanceof StcForeign
                        && mode.purpose === "mode") )
                        throw new Error();
                    
                    if ( !(ns instanceof StcForeign
                        && ns.purpose === "ns") )
                        throw new Error();
                    
                    return new StcForeign( "effects", function () {
                        if ( staccatoDeclarationState.namespaceDefs.
                            has( ns.foreignVal.name ) )
                            throw new Error();
                        staccatoDeclarationState.namespaceDefs.set(
                            ns.foreignVal.name, value );
                        return then.callStc( macroDefNs,
                            stcNil.ofNow() );
                    } );
                } );
            } );
        } );
    } );
    
    fun( "no-effects", function ( val ) {
        return new StcForeign( "effects", function () {
            return val;
        } );
    } );
    
    fun( "bind-effects", function ( monad ) {
        return new StcFn( function ( then ) {
            if ( !(monad instanceof StcForeign
                && monad.purpose === "effects") )
                throw new Error();
            var monadFunc = monad.foreignVal;
            
            return new StcForeign( "effects", function () {
                return then.callStc( macroDefNs, monadFunc() );
            } );
        } );
    } );
    
    fun( "assert-current-modality", function ( mode ) {
        if ( !(mode instanceof StcForeign
            && mode.purpose === "mode") )
            throw new Error();
        return stcNil.ofNow();
    } );
    
    fun( "compile-expression", function ( mode ) {
        return new StcFn( function ( uniqueNs ) {
            return new StcFn( function ( definitionNs ) {
                return new StcFn( function ( stx ) {
                    if ( !(mode instanceof StcForeign
                        && mode.purpose === "mode") )
                        throw new Error();
                    
                    if ( !(uniqueNs instanceof StcForeign
                        && uniqueNs.purpose === "ns") )
                        throw new Error();
                    
                    if ( !(definitionNs instanceof StcForeign
                        && definitionNs.purpose === "ns") )
                        throw new Error();
                    
                    return new StcForeign( "effects", function () {
                        return new StcForeign( "compiled-code",
                            macroexpandInnerLevel( macroDefNs, {
                                definitionNs: definitionNs.foreignVal,
                                uniqueNs: uniqueNs.foreignVal
                            }, stx ) );
                    } );
                } );
            } );
        } );
    } );
}

function stcTrivialStxDetails() {
    return new StcForeign( "macro-stx-details", null );
}

function macroexpandInnerLevel( macroDefNs, nss, locatedExpr ) {
    var identifier = stxToMaybeName( macroDefNs, locatedExpr );
    if ( identifier !== null )
        return stcIdentifier( identifier );
    var stcStx =
        stcType( macroDefNs, "stx", "stx-details", "s-expr" );
    var stcCons = stcType( macroDefNs, "cons", "car", "cdr" );
    if ( locatedExpr.tupleTag !== stcStx.getTupleTag() )
        throw new Error();
    var sExpr = stcStx.getProj( locatedExpr, "s-expr" );
    if ( sExpr.tupleTag !== stcCons.getTupleTag() )
        throw new Error();
    var macroName =
        stxToMaybeName( macroDefNs, stcCons.getProj( sExpr, "car" ) );
    if ( macroName === null )
        throw new Error();
    var resolvedMacroName =
        stcMacroName( nss.definitionNs, macroName );
    var macroFunctionName =
        stcNsGet( "function",
            stcNsGet( resolvedMacroName,
                stcNsGet( "macros", nss.definitionNs ) ) ).name;
    if ( !staccatoDeclarationState.namespaceDefs.has(
        macroFunctionName ) )
        throw new Error(
            "No such macro: " + JSON.stringify( macroName ) );
    var macroResultEffects = staccatoDeclarationState.namespaceDefs.
        get( macroFunctionName ).
        callStc( macroDefNs, new StcForeign( "mode", null ) ).
        callStc( macroDefNs, new StcForeign( "ns", nss.uniqueNs ) ).
        callStc( macroDefNs,
            new StcForeign( "ns", nss.definitionNs ) ).
        callStc( macroDefNs, stcTrivialStxDetails() ).
        callStc( macroDefNs, stcCons.getProj( sExpr, "cdr" ) );
    if ( !(macroResultEffects instanceof StcForeign
        && macroResultEffects.purpose === "effects") )
        throw new Error();
    var macroResultFunc = macroResultEffects.foreignVal;
    var macroResult = macroResultFunc();
    if ( !(macroResult instanceof StcForeign
        && macroResult.purpose === "compiled-code") )
        throw new Error();
    return macroResult.foreignVal;
}

function processDefType(
    macroDefNs, definitionNs, tupleName, projNames ) {
    
    var stcCons = stcType( macroDefNs, "cons", "car", "cdr" );
    var stcName = stcType( macroDefNs, "name", "val" );
    
    var n = projNames.length;
    var type = stcTypeArr( definitionNs, tupleName, projNames );
    var constructorName =
        stcConstructorName( definitionNs, tupleName );
    var projListName =
        stcNsGet( "projection-list",
            stcNsGet( constructorName,
                stcNsGet( "constructors", definitionNs ) ) ).name;
    if ( staccatoDeclarationState.namespaceDefs.has( projListName ) )
        throw new Error();
    staccatoDeclarationState.namespaceDefs.set( projListName,
        stcArrayToConsList( macroDefNs, arrMap( type.projNames,
            function ( name ) {
            
            return stcName.ofNow( new StcForeign( "name", name ) );
        } ) ) );
    stcAddMacro( definitionNs, tupleName,
        function ( nss, myStxDetails, body ) {
        
        var projVals = [];
        var remainingBody = body;
        var projectionsNss = nssGet( nss, "projections" );
        for ( var i = 0; i < n; i++ ) {
            if ( remainingBody.tupleTag !== stcCons.getTupleTag() )
                throw new Error(
                    "Expected more arguments to " +
                    JSON.stringify( tupleName ) );
            projVals.push(
                macroexpandInnerLevel( macroDefNs,
                    nssGet( projectionsNss, "first" ),
                    stcCons.getProj( remainingBody, "car" ) ) );
            remainingBody = stcCons.getProj( remainingBody, "cdr" );
            projectionsNss = nssGet( projectionsNss, "rest" );
        }
        return stcCallArr( type.ofArr( projVals ),
            mapConsListToArrWithNss( macroDefNs,
                nssGet( nss, "args" ),
                remainingBody,
                function ( nss, expr ) {
                
                return macroexpandInnerLevel( macroDefNs, nss, expr );
            } ) );
    } );
}

function processCoreTypes( macroDefNs, definitionNs ) {
    
    function type( tupleName, projNames ) {
        processDefType(
            macroDefNs, definitionNs, tupleName, projNames );
    }
    
    // These constructors are needed so that macros can generate raw
    // Staccato code.
    // TODO: See if we should keep the ones marked "sugar".
    type( "return", [ "val" ] );
    type( "call", [ "func", "arg" ] );
    type( "stc-def-foreign", [ "tuple-tag", "foreign" ] );
    type( "stc-def",
        [ "tuple-name", "opt-proj-pattern", "case-list" ] );
    type( "stc-let-case", [ "var", "case-list" ] );
    type( "stc-match", [
        "tuple-name", "opt-proj-pattern", "get-expr", "case-list" ] );
    type( "stc-any", [ "get-expr" ] );
    type( "stc-let-bindings-nil", [] );
    type( "stc-let-bindings-cons",
        [ "var", "get-expr", "let-bindings-expr" ] );
    type( "stc-proj-nil", [] );
    type( "stc-proj-cons", [ "proj-name", "get-expr", "proj-expr" ] );
    // sugar
    type( "stc-let-def", [ "def", "get-expr" ] );
    type( "stc-let", [ "let-bindings-expr", "get-expr" ] );
    type( "stc-local", [ "var" ] );
    type( "stc-foreign", [ "foreign" ] );
    type( "stc-do-what-you-think-is-best", [] );
    type( "stc-tuple", [ "tuple-name", "proj-expr" ] );
    // sugar
    type( "stc-save-root", [ "save-root", "get-expr" ] );
    // sugar
    type( "stc-save", [
        "save-root", "call-tuple-name",
        "call-func", "tuple-name", "opt-proj-pattern",
        "call-arg", "var", "arg" ] );
    // sugar
    type( "stc-fn",
        [ "tuple-name", "opt-proj-pattern", "case-list" ] );
    // sugar
    type( "stc-proj-pattern-omitted", [ "namespace" ] );
    type( "stc-proj-pattern", [ "proj-pattern" ] );
    type( "stc-proj-pattern-nil", [] );
    type( "stc-proj-pattern-cons",
        [ "proj-name", "var", "proj-pattern" ] );
    
    // These constructors are needed for interpreting the results of
    // certain built-in operators, namely `isa` and `string-compare`.
    type( "yep", [ "val" ] );
    type( "nope", [ "val" ] );
    
    // These s-expression constructors are needed so that macros can
    // parse their s-expression arguments. The `cons` and `nil`
    // constructors are also needed for parsing and generating
    // projection lists.
    type( "nil", [] );
    type( "cons", [ "car", "cdr" ] );
    type( "istring-nil", [ "string" ] );
    type( "istring-cons",
        [ "string-past", "interpolated", "istring-rest" ] );
    type( "foreign", [ "val" ] );
    
    // This constructor is needed so that macros can parse their
    // located syntax arguments.
    type( "stx", [ "stx-details", "s-expr" ] );
    
    // These constructors aren't strictly needed, but several built-in
    // operators use these constructors so that it's more convenient
    // for user-level code to detect what type of value it's dealing
    // with.
    type( "string", [ "val" ] );
    type( "name", [ "val" ] );
}


function macroexpandTopLevel( macroDefNs, nss, locatedExpr ) {
    var stcStx =
        stcType( macroDefNs, "stx", "stx-details", "s-expr" );
    var stcCons = stcType( macroDefNs, "cons", "car", "cdr" );
    
    if ( locatedExpr.tupleTag !== stcStx.getTupleTag() )
        throw new Error();
    var sExpr = stcStx.getProj( locatedExpr, "s-expr" );
    if ( sExpr.tupleTag !== stcCons.getTupleTag() )
        throw new Error();
    
    var macroName =
        stxToMaybeName( macroDefNs, stcCons.getProj( sExpr, "car" ) );
    
    if ( macroName === "def-type" ) {
        var sExpr1 = stcCons.getProj( sExpr, "cdr" );
        if ( sExpr1.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        
        var tupleName = stxToMaybeName( macroDefNs,
            stcCons.getProj( sExpr1, "car" ) );
        if ( tupleName === null )
            throw new Error();
        
        assertMacroDoesNotExist( nss.definitionNs, tupleName );
        
        var projNames = mapConsListToArr( macroDefNs,
            stcCons.getProj( sExpr1, "cdr" ),
            function ( projName ) {
                var projStringyName =
                    stxToMaybeName( macroDefNs, projName );
                if ( projStringyName === null )
                    throw new Error();
                return projStringyName;
            } );
        processDefType(
            macroDefNs, nss.definitionNs, tupleName, projNames );
    } else if ( macroName === "defn" ) {
        var sExpr1 = stcCons.getProj( sExpr, "cdr" );
        if ( sExpr1.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var sExpr2 = stcCons.getProj( sExpr1, "cdr" );
        if ( sExpr2.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        
        var name = stxToMaybeName( macroDefNs,
            stcCons.getProj( sExpr1, "car" ) );
        if ( name === null )
            throw new Error();
        
        var firstArg = stxToMaybeName( macroDefNs,
            stcCons.getProj( sExpr2, "car" ) );
        if ( name === null )
            throw new Error();
        
        if ( staccatoDeclarationState.hasRunDefs )
            throw new Error();
        
        assertMacroDoesNotExist( nss.definitionNs, name );
        
        stcAddDefun( nss,
            stcConstructorTag( nss.definitionNs,
                stcConstructorName( nss.definitionNs, name ) ),
            firstArg,
            stcCall( processFn( macroDefNs, nss, sExpr2 ),
                stcIdentifier( firstArg ) ) );
        processDefType( macroDefNs, nss.definitionNs, name, [] );
    } else if ( macroName === "def-macro" ) {
        var sExpr1 = stcCons.getProj( sExpr, "cdr" );
        if ( sExpr1.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var sExpr2 = stcCons.getProj( sExpr1, "cdr" );
        if ( sExpr2.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        
        var name = stxToMaybeName( macroDefNs,
            stcCons.getProj( sExpr1, "car" ) );
        if ( name === null )
            throw new Error();
        
        if ( staccatoDeclarationState.hasRunDefs )
            throw new Error();
        
        var macroFunctionName =
            assertMacroDoesNotExist( nss.definitionNs, name );
        staccatoDeclarationState.namespaceDefs.set( macroFunctionName,
            stcExecute( nss.definitionNs,
                processFn( macroDefNs, nss, sExpr2 ) ) );
    } else if ( macroName === "test" ) {
        var sExpr1 = stcCons.getProj( sExpr, "cdr" );
        if ( sExpr1.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        var sExpr2 = stcCons.getProj( sExpr1, "cdr" );
        if ( sExpr2.tupleTag !== stcCons.getTupleTag() )
            throw new Error();
        if ( stcCons.getProj( sExpr2, "cdr" ).tupleTag ===
            stcCons.getTupleTag() )
            throw new Error();
        
        if ( !staccatoDeclarationState.hasRunDefs )
            throw new Error();
        
        var a = evalStcForTest( nss.definitionNs,
            macroexpandInnerLevel( macroDefNs, nssGet( nss, "a" ),
                stcCons.getProj( sExpr1, "car" ) ) );
        var b = evalStcForTest( nss.definitionNs,
            macroexpandInnerLevel( macroDefNs, nssGet( nss, "b" ),
                stcCons.getProj( sExpr2, "car" ) ) );
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
    
    staccatoDeclarationState.hasRunDefs = true;
}

function readerExprToStc( definitionNs, myStxDetails, readerExpr ) {
    var stcNil = stcType( definitionNs, "nil" );
    var stcCons = stcType( definitionNs, "cons", "car", "cdr" );
    var stcIstringNil =
        stcType( definitionNs, "istring-nil", "string" );
    var stcIstringCons = stcType( definitionNs, "istring-cons",
        "string-past", "interpolated", "istring-rest" );
    
    var stcStx =
        stcType( definitionNs, "stx", "stx-details", "s-expr" );
    var stcString = stcType( definitionNs, "string", "val" );
    
    if ( readerExpr.type === "nil" ) {
        return stcStx.ofNow( myStxDetails, stcNil.ofNow() );
    } else if ( readerExpr.type === "cons" ) {
        return stcStx.ofNow( myStxDetails,
            stcCons.ofNow(
                readerExprToStc( definitionNs, myStxDetails,
                    readerExpr.first ),
                stcStx.getProj(
                    readerExprToStc( definitionNs, myStxDetails,
                        readerExpr.rest ),
                    "s-expr" )
            ) );
    } else if ( readerExpr.type === "stringNil" ) {
        return stcStx.ofNow( myStxDetails,
            stcIstringNil.ofNow(
                stcString.ofNow(
                    new StcForeign( "string",
                        readerStringNilToString( readerExpr ) ) ) ) );
    } else if ( readerExpr.type === "stringCons" ) {
        return stcStx.ofNow( myStxDetails,
            stcIstringCons.ofNow(
                stcString.ofNow(
                    new StcForeign( "string",
                        readerStringListToString(
                            readerExpr.string ) ) ),
                readerExprToStc( definitionNs, myStxDetails,
                    readerExpr.interpolation ),
                stcStx.getProj(
                    readerExprToStc( definitionNs, myStxDetails,
                        readerExpr.rest ),
                    "s-expr" ) ) );
    } else {
        throw new Error();
    }
}
