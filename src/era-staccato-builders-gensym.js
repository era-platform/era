// era-staccato-builders-gensym.js
// Copyright 2015 Ross Angle. Released under the MIT License.
//
// These are JavaScript utilities for building Staccato expressions.
// See era-staccato.js for more information about what Staccato is.

function stcBasicEntriesMacro( entry, nil, args ) {
    var n = args.length;
    if ( n % 2 !== 0 )
        throw new Error();
    var result = jsList( nil );
    for ( var i = n - 2; 0 <= i; i -= 2 ) {
        result = jsList( entry, args[ i ], args[ i + 1 ], result );
    }
    return result;
}

function stcEntriesPairMacro( entry, nil, first, second ) {
    var n = first.length;
    if ( n !== second.length )
        throw new Error();
    var result = jsList( nil );
    for ( var i = n - 1; 0 <= i; i-- ) {
        result = jsList( entry, first[ i ], second[ i ], result );
    }
    return result;
}

function stcBasicLetBindingsArr( args ) {
    return stcBasicEntriesMacro(
        "let-bindings-cons", "let-bindings-nil", args );
}

function stcBasicProjsArr( args ) {
    return stcBasicEntriesMacro( "proj-cons", "proj-nil", args );
}

function stcBasicProjs( var_args ) {
    return stcBasicProjsArr( arguments );
}

function stcBasicProjPatArr( args ) {
    return stcBasicEntriesMacro(
        "proj-pattern-cons", "proj-pattern-nil", args );
}

function stcBasicProjPat( var_args ) {
    return stcBasicProjPatArr( arguments );
}

function stcYesProjsArr( args ) {
    return jsList( "proj-pattern",
        stcEntriesPairMacro( "proj-pattern-cons", "proj-pattern-nil",
            args, args ) );
}

function stcYesProjs( var_args ) {
    return stcYesProjsArr( arguments );
}

function stcNoProjs() {
    return jsList( "proj-pattern-omitted", "dummy-namespace" );
}

function stcBasicLocal( expr ) {
    return isPrimString( expr ) ? jsList( "local", expr ) : expr;
}

function stcBasicRet( val ) {
    return jsList( "tuple", "return",
        stcBasicProjs( "val", stcBasicLocal( val ) ) );
}

function stcBasicRetLocal( expr ) {
    return isPrimString( expr ) ?
        stcBasicRet( jsList( "local", expr ) ) : expr;
}

function stcSaveRoot( expr ) {
    return jsList( "save-root", "sr", stcBasicRetLocal( expr ) );
}

function stcBasicSave( expr ) {
    return isPrimString( expr ) ? jsList( "local", expr ) :
        jsList( "save", "sr", "call",
            "func", stcGensym(), stcNoProjs(),
            "arg", stcGensym(),
            expr );
}

function stcTupleArr( tupleName, entries ) {
    return stcSaveRoot(
        stcBasicRet(
            jsList( "tuple", tupleName,
                stcBasicProjsArr(
                    arrMap( entries, function ( arg, i ) {
                        return i % 2 === 0 ?
                            arg : stcBasicSave( arg );
                    } ) ) ) ) );
}

function stcTuple( tupleName, var_args ) {
    return stcTupleArr( tupleName, [].slice.call( arguments, 1 ) );
}

function stcCallArr( func, argsArr ) {
    var result = func;
    arrEach( argsArr, function ( arg ) {
        result = jsList( "tuple", "call",
            jsList( "proj-cons", "func", stcBasicSave( result ),
                jsList( "proj-cons", "arg", stcBasicRetLocal( arg ),
                    jsList( "proj-nil" ) ) ) );
    } );
    return result;
}

function stcCall( func, var_args ) {
    return stcCallArr( func, [].slice.call( arguments, 1 ) );
}

function stcCallTuple( tupleName, var_args ) {
    var n = arguments.length;
    if ( n < 2 )
        throw new Error();
    var entries = [].slice.call( arguments, 1, n - 1 );
    var input = arguments[ n - 1 ];
    return stcCall( stcTupleArr( tupleName, entries ), input );
}

function stcLet( var_args ) {
    var n = arguments.length;
    if ( n < 1 )
        throw new Error();
    var bindings = [].slice.call( arguments, 0, n - 1 );
    var body = arguments[ n - 1 ];
    return stcSaveRoot(
        jsList( "let",
            stcBasicLetBindingsArr(
                arrMap( bindings, function ( arg, i ) {
                    return i % 2 === 0 ? arg : stcBasicSave( arg );
                } ) ),
            stcSaveRoot( body ) ) );
}

function stcFn( var_args ) {
    var n = arguments.length;
    var vars = [].slice.call( arguments, 0, n - 1 );
    var body = arguments[ n - 1 ];
    var result = stcSaveRoot( body );
    for ( var i = n - 2; 0 <= i; i-- ) {
        var va = vars[ i ];
        result = stcBasicRet(
            jsList( "fn", stcGensym(), stcNoProjs(),
                jsList( "let-case", va, jsList( "any", result ) ) ) );
    }
    return result;
}

function stcTypeArr( tupleName, projNames ) {
    var n = projNames.length;
    
    var result = {};
    result.type = "stcType";
    result.tupleName = tupleName;
    result.projNames = projNames;
    result.of = function ( var_args ) {
        var args = arguments;
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
        var result = stcSaveRoot(
            stcBasicRet(
                jsList( "tuple", tupleName,
                    stcEntriesPairMacro( "proj-cons", "proj-nil",
                        projNames,
                        arrMap( projectionVals, function ( arg ) {
                            return stcBasicSave( arg );
                        } ) ) ) ) );
        if ( arg !== null )
            result = stcCall( result, arg.val );
        return result;
    };
    // TODO: See if we should leave this in. If so, optimize it.
    result.makeStc = function ( var_args ) {
        var args = arguments;
        var sortedProjNames = projNames.slice().sort();
        return new Stc(
            JSON.stringify( [ tupleName, sortedProjNames ] ),
            arrMap( sortedProjNames, function ( va ) {
                for ( var i = 0, n = projNames.length; i < n; i++ )
                    if ( projNames[ i ] === va )
                        return args[ i ];
                throw new Error();
            } ) );
    };
    return result;
}

function stcType( tupleName, var_args ) {
    return stcTypeArr( tupleName, [].slice.call( arguments, 1 ) );
}

function stcCase( va, matchSubject, var_args ) {
    function processTail( args ) {
        if ( args.length === 0 )
            throw new Error();
        if ( args.length === 1 )
            return jsList( "any", stcSaveRoot( args[ 0 ] ) );
        var type = args[ 0 ];
        if ( type.type !== "stcType" )
            throw new Error();
        var n = type.projNames.length;
        if ( args.length <= n + 2 )
            throw new Error();
        var localVars = [].slice.call( args, 1, n + 1 );
        var then = args[ n + 1 ];
        var els = [].slice.call( args, n + 2 );
        return jsList( "match", type.tupleName,
            stcEntriesPairMacro(
                "proj-pattern-cons", "proj-pattern-nil",
                type.projNames, localVars ),
            stcSaveRoot( then ),
            processTail( els ) );
    }
    
    var body = [].slice.call( arguments, 2 );
    return stcCall(
        stcBasicRet(
            jsList( "fn", stcGensym(), stcNoProjs(),
                jsList( "let-case", va, processTail( body ) ) ) ),
        stcSaveRoot( matchSubject ) );
}

function stcDefun( tupleName, var_args ) {
    var n = arguments.length;
    if ( n < 3 )
        throw new Error();
    var projNames = [].slice.call( arguments, 1, n - 2 );
    var input = arguments[ n - 2 ];
    var body = arguments[ n - 1 ];
    var overallDef = jsList( "def", tupleName,
        stcYesProjsArr( projNames ),
        jsList( "let-case", input,
            jsList( "any", stcSaveRoot( body ) ) ) );
    var result = {};
    result.defs = desugarDefExpr( overallDef );
    result.type = stcTypeArr( tupleName, projNames );
    return result;
}
