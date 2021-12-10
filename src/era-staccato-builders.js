// era-staccato-builders.js
// Copyright 2015 Ross Angle. Released under the MIT License.
//
// These are JavaScript utilities for building Staccato expressions.
// See era-staccato.js for more information about what Staccato is.

function stcEntriesMacro( entry, nil, args ) {
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

function stcLetBindingsArr( args ) {
    return stcEntriesMacro( "let-bindings-cons", "let-bindings-nil",
        args );
}

function stcProjsArr( args ) {
    return stcEntriesMacro( "proj-cons", "proj-nil", args );
}

function stcProjs( var_args ) {
    return stcProjsArr( arguments );
}

function stcProjPatArr( args ) {
    return stcEntriesMacro(
        "proj-pattern-cons", "proj-pattern-nil", args );
}

function stcProjPat( var_args ) {
    return stcProjPatArr( arguments );
}

function stcTuple( tupleName, var_args ) {
    return jsList( "tuple", tupleName,
        stcProjsArr( [].slice.call( arguments, 1 ) ) );
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

function stcv( va ) {
    return jsList( "local", va );
}

// TODO: See if we'll use this.
function stcMatch( tupleName, var_args ) {
    var n = arguments.length;
    if ( n < 3 )
        throw new Error();
    var entries = [].slice.call( arguments, 1, n - 2 );
    var then = arguments[ n - 2 ];
    var els = arguments[ n - 1 ];
    return jsList( "match", tupleName, stcProjPatArr( entries ),
        then,
        els );
}

function stcRet( val ) {
    return jsList( "tuple", "return", stcProjs( "val", val ) );
}

function stcCall( func, arg ) {
    return jsList( "tuple", "call",
        stcProjs( "func", func, "arg", arg ) );
}

function stcCallTuple( tupleName, var_args ) {
    var n = arguments.length;
    if ( n < 2 )
        throw new Error();
    var entries = [].slice.call( arguments, 1, n - 1 );
    var input = arguments[ n - 1 ];
    return stcCall(
        jsList( "tuple", tupleName, stcProjsArr( entries ) ),
        input );
}

function stcYesDef( tupleName, var_args ) {
    var n = arguments.length;
    if ( n < 2 )
        throw new Error();
    var projNames = [].slice.call( arguments, 1, n - 1 );
    var body = arguments[ n - 1 ];
    return jsList( "def", tupleName, stcYesProjsArr( projNames ),
        body );
}

function stcYesDefAny( tupleName, var_args ) {
    var n = arguments.length;
    if ( n < 3 )
        throw new Error();
    var projNames = [].slice.call( arguments, 1, n - 2 );
    var input = arguments[ n - 2 ];
    var body = arguments[ n - 1 ];
    return jsList( "def", tupleName, stcYesProjsArr( projNames ),
        jsList( "let-case", input, jsList( "any", body ) ) );
}

function stcLet( var_args ) {
    var n = arguments.length;
    if ( n < 1 )
        throw new Error();
    var bindings = [].slice.call( arguments, 0, n - 1 );
    var body = arguments[ n - 1 ];
    return jsList( "let", stcLetBindingsArr( bindings ), body );
}

function stcFnAny( tupleName, va, body ) {
    return jsList( "fn", tupleName, stcNoProjs(),
        jsList( "let-case", va, jsList( "any", body ) ) );
}

function stcRetFnAny( tupleName, va, body ) {
    return stcRet( stcFnAny( tupleName, va, body ) );
}

function stcSaveRoot( expr ) {
    return jsList( "save-root", "sr", expr );
}

function stcSave( va, tupleName, expr ) {
    return jsList( "save", "sr", "call",
        "func", tupleName, stcNoProjs(),
        "arg", va,
        expr );
}

function stcType( tupleName, var_args ) {
    var projNames = [].slice.call( arguments, 1 );
    var n = projNames.length;
    
    var result = {};
    result.type = "stcType";
    result.tupleName = tupleName;
    result.projNames = projNames;
    result.make = function ( var_args ) {
        if ( arguments.length !== n )
            throw new Error();
        return jsList( "tuple", tupleName,
            stcEntriesPairMacro(
                "proj-cons", "proj-nil", projNames, arguments ) );
    };
    result.match = function ( var_args ) {
        if ( arguments.length !== n + 2 )
            throw new Error();
        var localVars = [].slice.call( arguments, 0, n );
        var then = arguments[ n ];
        var els = arguments[ n + 1 ];
        return jsList( "match", tupleName,
            stcEntriesPairMacro(
                "proj-pattern-cons", "proj-pattern-nil",
                projNames, localVars ),
            then,
            els );
    };
    result.cond = function ( caseTupleName, var_args ) {
        if ( arguments.length !== n + 4 )
            throw new Error();
        var localVars = [].slice.call( arguments, 1, n + 1 );
        var matchSubject = arguments[ n + 1 ];
        var then = arguments[ n + 2 ];
        var els = arguments[ n + 3 ];
        return stcCall(
            jsList( "fn", caseTupleName, stcNoProjs(),
                jsList( "match", tupleName,
                    stcEntriesPairMacro(
                        "proj-pattern-cons", "proj-pattern-nil",
                        projNames, localVars ),
                    then,
                    jsList( "any", els ) ) ),
            matchSubject );
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

function stcCase( tupleName, va, matchSubject, var_args ) {
    function processTail( args ) {
        if ( args.length === 0 )
            throw new Error();
        if ( args.length === 1 )
            return jsList( "any", args[ 0 ] );
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
            then,
            processTail( els ) );
    }
    
    var body = [].slice.call( arguments, 3 );
    return stcCall(
        jsList( "fn", tupleName, stcNoProjs(),
            jsList( "let-case", va, processTail( body ) ) ),
        matchSubject );
}
