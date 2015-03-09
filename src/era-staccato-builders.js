// era-staccato-builders.js
// Copyright 2015 Ross Angle. Released under the MIT License.
//
// These are JavaScript utilities for building Staccato expressions.
// See era-staccato.js for more information about what Staccato is.

function stcListMacro( cons, nil, args ) {
    var result = jsList( nil );
    for ( var i = args.length - 1; 0 <= i; i-- ) {
        result = jsList( cons, args[ i ], result );
    }
    return result;
}

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

function stcEnvArr( args ) {
    return stcEntriesMacro( "env-cons", "env-nil", args );
}

function stcEnv( var_args ) {
    return stcEnvArr( arguments );
}

function stcEnvPatArr( args ) {
    return stcEntriesMacro(
        "env-pattern-cons", "env-pattern-nil", args );
}

function stcEnvPat( var_args ) {
    return stcEnvPatArr( arguments );
}

function stcFrame( frameName, var_args ) {
    return jsList( "frame", frameName,
        stcEnvArr( [].slice.call( arguments, 1 ) ) );
}

function stcYesVarsArr( args ) {
    return jsList( "var-list",
        stcListMacro( "var-list-cons", "var-list-nil", args ) );
}

function stcYesVars( var_args ) {
    return stcYesVarsArr( arguments );
}

// TODO: See if we'll use this.
function stcNoVars() {
    return jsList( "var-list-omitted" );
}

function stcv( va ) {
    return jsList( "local", va );
}

// TODO: See if we'll use this.
function stcMatch( frameName, var_args ) {
    var n = arguments.length;
    if ( n < 3 )
        throw new Error();
    var entries = [].slice.call( arguments, 1, n - 2 );
    var then = arguments[ n - 2 ];
    var els = arguments[ n - 1 ];
    return jsList( "match", frameName, stcEnvPatArr( entries ),
        then,
        els );
}

function stcCallFrame( frameName, var_args ) {
    var n = arguments.length;
    if ( n < 2 )
        throw new Error();
    var entries = [].slice.call( arguments, 1, n - 1 );
    var input = arguments[ n - 1 ];
    return jsList( "call",
        jsList( "frame", frameName, stcEnvArr( entries ) ),
        input );
}

function stcYesDef( frameName, var_args ) {
    var n = arguments.length;
    if ( n < 2 )
        throw new Error();
    var frameVars = [].slice.call( arguments, 1, n - 1 );
    var body = arguments[ n - 1 ];
    return jsList( "def", frameName, stcYesVarsArr( frameVars ),
        body );
}

function stcYesDefAny( frameName, var_args ) {
    var n = arguments.length;
    if ( n < 3 )
        throw new Error();
    var frameVars = [].slice.call( arguments, 1, n - 2 );
    var input = arguments[ n - 2 ];
    var body = arguments[ n - 1 ];
    return jsList( "def", frameName, stcYesVarsArr( frameVars ),
        jsList( "let-case", input, jsList( "any", body ) ) );
}

function stcFnAny( frameName, va, body ) {
    return jsList( "fn", frameName, stcNoVars(),
        jsList( "let-case", va, jsList( "any", body ) ) );
}

function stcSave( va, frameName, expr ) {
    return jsList( "save", frameName, stcNoVars(), va, expr );
}

function stcType( frameName, var_args ) {
    var frameVars = [].slice.call( arguments, 1 );
    var n = frameVars.length;
    
    var result = {};
    result.type = "stcType";
    result.frameName = frameName;
    result.frameVars = frameVars;
    result.make = function ( var_args ) {
        if ( arguments.length !== n )
            throw new Error();
        return jsList( "frame", frameName,
            stcEntriesPairMacro(
                "env-cons", "env-nil", frameVars, arguments ) );
    };
    result.match = function ( var_args ) {
        if ( arguments.length !== n + 2 )
            throw new Error();
        var localVars = [].slice.call( arguments, 0, n );
        var then = arguments[ n ];
        var els = arguments[ n + 1 ];
        return jsList( "match", frameName,
            stcEntriesPairMacro(
                "env-pattern-cons", "env-pattern-nil",
                frameVars, localVars ),
            then,
            els );
    };
    result.cond = function ( caseFrameName, var_args ) {
        if ( arguments.length !== n + 4 )
            throw new Error();
        var localVars = [].slice.call( arguments, 1, n + 1 );
        var matchSubject = arguments[ n + 1 ];
        var then = arguments[ n + 2 ];
        var els = arguments[ n + 3 ];
        return jsList( "case", caseFrameName, stcNoVars(),
            matchSubject,
            jsList( "match", frameName,
                stcEntriesPairMacro(
                    "env-pattern-cons", "env-pattern-nil",
                    frameVars, localVars ),
                then,
                jsList( "any", els ) ) );
    };
    // TODO: See if we should leave this in. If so, optimize it.
    result.makeStc = function ( var_args ) {
        var args = arguments;
        var sortedFrameVars = frameVars.slice().sort();
        return new Stc(
            JSON.stringify( [ frameName, sortedFrameVars ] ),
            arrMap( sortedFrameVars, function ( va ) {
                for ( var i = 0, n = frameVars.length; i < n; i++ )
                    if ( frameVars[ i ] === va )
                        return args[ i ];
                throw new Error();
            } ) );
    };
    return result;
}

function stcCase( frameName, va, matchSubject, var_args ) {
    function processTail( args ) {
        if ( args.length === 0 )
            throw new Error();
        if ( args.length === 1 )
            return jsList( "any", args[ 0 ] );
        var type = args[ 0 ];
        if ( type.type !== "stcType" )
            throw new Error();
        var n = type.frameVars.length;
        if ( args.length <= n + 2 )
            throw new Error();
        var localVars = [].slice.call( args, 1, n + 1 );
        var then = args[ n + 1 ];
        var els = [].slice.call( args, n + 2 );
        return jsList( "match", type.frameName,
            stcEntriesPairMacro(
                "env-pattern-cons", "env-pattern-nil",
                type.frameVars, localVars ),
            then,
            processTail( els ) );
    }
    
    var body = [].slice.call( arguments, 3 );
    return jsList( "case", frameName, stcNoVars(), matchSubject,
        jsList( "let-case", va, processTail( body ) ) );
}
