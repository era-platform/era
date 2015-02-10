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
function stcIfFrame( expr, frameName, var_args ) {
    var n = arguments.length;
    if ( n < 4 )
        throw new Error();
    var entries = [].slice.call( arguments, 2, n - 2 );
    var then = arguments[ n - 2 ];
    var els = arguments[ n - 1 ];
    return jsList( "if-frame", frameName, stcEnvPatArr( entries ),
        expr,
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
    if ( n < 3 )
        throw new Error();
    var frameVars = [].slice.call( arguments, 1, n - 2 );
    var input = arguments[ n - 2 ];
    var body = arguments[ n - 1 ];
    return jsList( "def", frameName,
        stcYesVarsArr( frameVars ),
        input,
        body );
}

function stcType( frameName, var_args ) {
    var frameVars = [].slice.call( arguments, 1 );
    var n = frameVars.length;
    
    var result = {};
    result.make = function ( var_args ) {
        if ( arguments.length !== n )
            throw new Error();
        return jsList( "frame", frameName,
            stcEntriesPairMacro(
                "env-cons", "env-nil", frameVars, arguments ) );
    };
    result.cond = function ( var_args ) {
        if ( arguments.length !== n + 3 )
            throw new Error();
        var localVars = [].slice.call( arguments, 0, n );
        var expr = arguments[ n ];
        var then = arguments[ n + 1 ];
        var els = arguments[ n + 2 ];
        return jsList( "if-frame", frameName,
            stcEntriesPairMacro(
                "env-pattern-cons", "env-pattern-nil",
                frameVars, localVars ),
            expr,
            then,
            els );
    };
    return result;
}
