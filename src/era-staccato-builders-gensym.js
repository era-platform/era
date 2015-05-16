// era-staccato-builders-gensym.js
// Copyright 2015 Ross Angle. Released under the MIT License.
//
// These are JavaScript utilities for building Staccato expressions.
// See era-staccato.js for more information about what Staccato is.

function stcBasicListMacro( cons, nil, args ) {
    var result = jsList( nil );
    for ( var i = args.length - 1; 0 <= i; i-- ) {
        result = jsList( cons, args[ i ], result );
    }
    return result;
}

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

function stcBasicEnvArr( args ) {
    return stcBasicEntriesMacro( "env-cons", "env-nil", args );
}

function stcBasicEnv( var_args ) {
    return stcBasicEnvArr( arguments );
}

function stcBasicEnvPatArr( args ) {
    return stcBasicEntriesMacro(
        "env-pattern-cons", "env-pattern-nil", args );
}

function stcBasicEnvPat( var_args ) {
    return stcBasicEnvPatArr( arguments );
}

function stcYesVarsArr( args ) {
    return jsList( "var-list",
        stcBasicListMacro( "var-list-cons", "var-list-nil", args ) );
}

function stcYesVars( var_args ) {
    return stcYesVarsArr( arguments );
}

function stcNoVars() {
    return jsList( "var-list-omitted" );
}

function stcBasicLocal( expr ) {
    return isPrimString( expr ) ? jsList( "local", expr ) : expr;
}

function stcBasicRet( val ) {
    return jsList( "frame", "return",
        stcBasicEnv( "val", stcBasicLocal( val ) ) );
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
            "func", stcGensym(), stcNoVars(),
            "arg", stcGensym(),
            expr );
}

function stcFrameArr( frameName, entries ) {
    return stcSaveRoot(
        stcBasicRet(
            jsList( "frame", frameName,
                stcBasicEnvArr( arrMap( entries, function ( arg, i ) {
                    return i % 2 === 0 ? arg : stcBasicSave( arg );
                } ) ) ) ) );
}

function stcFrame( frameName, var_args ) {
    return stcFrameArr( frameName, [].slice.call( arguments, 1 ) );
}

function stcCall( func, var_args ) {
    var args = [].slice.call( arguments, 1 );
    var result = func;
    arrEach( args, function ( arg ) {
        result = jsList( "frame", "call",
            jsList( "env-cons", "func", stcBasicSave( result ),
                jsList( "env-cons", "arg", stcBasicRetLocal( arg ),
                    jsList( "env-nil" ) ) ) );
    } );
    return result;
}

function stcCallFrame( frameName, var_args ) {
    var n = arguments.length;
    if ( n < 2 )
        throw new Error();
    var entries = [].slice.call( arguments, 1, n - 1 );
    var input = arguments[ n - 1 ];
    return stcCall( stcFrameArr( frameName, entries ), input );
}

function stcLet( var_args ) {
    var n = arguments.length;
    if ( n < 1 )
        throw new Error();
    var bindings = [].slice.call( arguments, 0, n - 1 );
    var body = arguments[ n - 1 ];
    return stcSaveRoot(
        jsList( "let",
            stcBasicEnvArr( arrMap( bindings, function ( arg, i ) {
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
            jsList( "fn", stcGensym(), stcNoVars(),
                jsList( "let-case", va, jsList( "any", result ) ) ) );
    }
    return result;
}

function stcTypeArr( frameName, frameVars ) {
    var n = frameVars.length;
    
    var result = {};
    result.type = "stcType";
    result.frameName = frameName;
    result.frameVars = frameVars;
    result.of = function ( var_args ) {
        var args = arguments;
        var n = frameVars.length;
        var frameVals;
        var arg;
        if ( args.length === n ) {
            frameVals = args;
            arg = null;
        } else if ( args.length === n + 1 ) {
            frameVals = [].slice.call( args, 0, n );
            arg = { val: args[ n ] };
        } else {
            throw new Error();
        }
        var result = stcSaveRoot(
            stcBasicRet(
                jsList( "frame", frameName,
                    stcEntriesPairMacro( "env-cons", "env-nil",
                        frameVars,
                        arrMap( frameVals, function ( arg ) {
                            return stcBasicSave( arg );
                        } ) ) ) ) );
        if ( arg !== null )
            result = stcCall( result, arg.val );
        return result;
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

function stcType( frameName, var_args ) {
    return stcTypeArr( frameName, [].slice.call( arguments, 1 ) );
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
            stcSaveRoot( then ),
            processTail( els ) );
    }
    
    var body = [].slice.call( arguments, 2 );
    return stcCall(
        stcBasicRet(
            jsList( "fn", stcGensym(), stcNoVars(),
                jsList( "let-case", va, processTail( body ) ) ) ),
        stcSaveRoot( matchSubject ) );
}

function stcDefun( frameName, var_args ) {
    var n = arguments.length;
    if ( n < 3 )
        throw new Error();
    var frameVars = [].slice.call( arguments, 1, n - 2 );
    var input = arguments[ n - 2 ];
    var body = arguments[ n - 1 ];
    var result = {};
    result.def = jsList( "def", frameName, stcYesVarsArr( frameVars ),
        jsList( "let-case", input,
            jsList( "any", stcSaveRoot( body ) ) ) );
    result.type = stcTypeArr( frameName, frameVars );
    return result;
}
