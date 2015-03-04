// era-penknife.js
// Copyright 2013-2015 Ross Angle. Released under the MIT License.
"use strict";


// Penknife has only a few primitive kinds of first-class value, and
// together they tackle a very expressive range of functionality:
//
// user-definable struct:
//   public tag name
//     The name which identifies the global data format definition
//     associated with this struct. These tags are user-provided.
//   public list of args
//     The arbitrary content of this value, to be interpreted
//     according to the meaning of the tag.
// User-definable structs conveniently represent algebraic closed
// products (by having multiple elements) and open sums (thanks to
// their tag), so they're used in a style similar to ADTs. Penknife
// methods do dynamic dispatch based on the first argument's tag, so
// it's often useful to wrap values in custom-tagged structs even if
// they fit one of these other categories.
//
// fn:
//   private encapsulated value
//     The hidden information associated with this function. When a
//     function captures variables from its lexical context, those
//     values are stored here.
//   private JavaScript function
//     Something which can process a "yoke," an argument list, and the
//     encapsulated value and return a yoke and a result value. The
//     yokes are simply other input or output values that are
//     implicitly threaded through the program to achieve some local
//     imperative techniques.
//
// nonlinear-as-linear:
//   private inner value
//     A nonlinear value representing the linear value's contents. (If
//     the value needs to be linear, just wrap it in a
//     linear-as-nonlinear value.)
//   private duplicator
//     A function which takes the inner value and a nat and returns a
//     list of that many new inner values.
//   private unwrapper
//     A function which takes the inner value and returns an arbitrary
//     nonlinear output value. This way the contents aren't uselessly
//     sealed off from the rest of the program.
//
// linear-as-nonlinear:
//   public inner value
//     A value which may have a linear duplication behavior. That
//     behavior, if any, is ignored as long as the value is wrapped up
//     in this container. That is to say, duplicating this container
//     does not duplicate the inner value.
//
// string:
//   private JavaScript string
//     An efficiently implemented sequence of valid Unicode code
//     points.
//
// token:
//   private JavaScript token
//     A value which can be checked for equality and used as a lookup
//     key, but which can't be serialized or transported. This is good
//     for references to local effect-related resources that can't be
//     transported anyway. For some tokens ("comparable" ones), pure
//     code can compare them to each other; for others, only the
//     internal workings of side-effectful operations will do the
//     comparison.
//     // TODO: Add some way to actually make comparable tokens.

// NOTE: The entire implementation of Penknife uses pure JS functions
// except for these parts:
//
// - Any part of the code may throw a JavaScript exception if Penknife
//   has a bug.
// - The `call-with-mbox-env` operator uses mutation, since that's
//   exactly what it's designed to support.
// - The PkRuntime global environment uses mutation. (TODO: Make
//   modified copies instead of mutating the original.)
// - The trampoline in syncYokeCall(), conveniences_syncYoke(), and
//   runSyncYoke() uses mutation.
// - A few local loops use very simple mutation. (The trampoline
//   deserves special attention because it makes side-effectful
//   closures and passes them off to other parts of the code.)
// - In era-avl.js, makeQuickLazy() uses mutation to make call-by-need
//   constant-time thunks for use with finger trees.


function Pk() {}
Pk.prototype.init_ = function (
    tagName, tagJsStr, args, isLinear, special ) {
    
    this.tagName = tagName;
    this.tag = tagJsStr;
    this.args_ = args;
    this.isLinear_ = isLinear;
    this.special = special;
    return this;
};
Pk.prototype.getTagName = function () {
    // NOTE: The function pkStrNameUnsafeMemoized() is defined below.
    return this.tagName !== null ? this.tagName :
        pkQualifiedName( pkStrNameUnsafeMemoized( this.tag ) );
};
Pk.prototype.ind = function ( i ) {
    // NOTE: The function listGet() is defined below.
    return this.args_ === null ?
        this.special.argsArr[ i ] : listGet( this.args_, i );
};
Pk.prototype.isLinear = function () {
    return this.isLinear_;
};
Pk.prototype.toString = function () {
    function toArr( list ) {
        var arr = [];
        for ( ; list.tag === "cons"; list = list.ind( 1 ) )
            arr.push( list.ind( 0 ) );
        return arr;
    }
    function toJsNum( nat ) {
        var result = 0;
        for ( ; nat.tag === "succ"; nat = nat.ind( 0 ) )
            result++;
        return result;
    }
    function spaceBetween( list ) {
        return toArr( list ).join( " " );
    }
    function spaceBefore( list ) {
        return arrMap( toArr( list ), function ( elem ) {
            return " " + elem;
        } ).join( "" );
    }
    if ( this.tag === "string-name" ) {
        // TODO: See if this toString behavior still makes sense when
        // the name contains spaces, parentheses, quotation marks,
        // etc., or when the name is "nil".
        return "" + this.ind( 0 ).special.jsStr;
    }
    if ( this.tag === "qualified-name" ) {
        // TODO: See if this toString behavior makes sense.
        return "" + this.ind( 0 );
    }
    if ( this.tag === "string" )
        return JSON.stringify( this.special.jsStr );
    if ( this.tag === "fn" )
        return "" + this.special.string;
    if ( this.tag === "nil" )
        return "nil";
    if ( this.tag === "cons" )
        return "#(" + spaceBetween( this ) + ")";
    if ( this.tag === "succ" )
        return "" + toJsNum( this );
    if ( this.tag === "token" )
        return "#token(" + this.special.jsPayload.stringRep + ")";
    return "(" + this.getTagName() + spaceBefore( this.args_ ) + ")";
};
function pkInd( pk, i ) {
    // NOTE: This is identical to pk.ind( i ), but it's used for
    // compiled Penknife code because it lets us inform UglifyJS that
    // it's a pure function. (Okay, it's not exactly pure if there's
    // an error, but that should be pure enough.)
    // NOTE: The function listGet() is defined below.
    return pk.args_ === null ?
        pk.special.argsArr[ i ] : listGet( pk.args_, i );
}
var pkNil =
    new Pk().init_( null, "nil", null, !"isLinear", { argsArr: [] } );
function pkCons( first, rest ) {
    return new Pk().init_(
        null, "cons", null, first.isLinear() || rest.isLinear(),
        { argsArr: [ first, rest ] } );
}
function pkListFromArr( arr ) {
    var result = pkNil;
    for ( var i = arr.length - 1; 0 <= i; i-- )
        result = pkCons( arr[ i ], result );
    return result;
}
function pkNonlinearAsLinear( innerValue, duplicator, unwrapper ) {
    return new Pk().init_(
        null, "nonlinear-as-linear", null, !!"isLinear",
        { innerValue: innerValue, duplicator: duplicator,
            unwrapper: unwrapper } );
}
function pkLinearAsNonlinear( innerValue ) {
    return new Pk().init_( null, "linear-as-nonlinear",
        pkList( innerValue ), !"isLinear", {} );
}
function pkToken( jsPayload ) {
    return new Pk().init_(
        null, "token", pkNil, !"isLinear", { jsPayload: jsPayload } );
}
var dummyMutableEnvironment;
(function () {
    var dummyContents;
    dummyMutableEnvironment = pkToken( dummyContents = {
        stringRep: "dummyEnv",
        comparable: false,
        isMutableBox: false,
        mutableBoxState: pkNil,
        mutableBoxEnvironment: null,
        isValidMutableEnvironment: false,
        canDefine: false,
        canYield: false,
        coroutineNext: null
    } );
    dummyContents.mutableBoxEnvironment = dummyMutableEnvironment;
})();
function pk( tag, var_args ) {
    var args = pkListFromArr( [].slice.call( arguments, 1 ) );
    return new Pk().init_( null, tag, args, args.isLinear(), {} );
}
function pkIsStruct( x ) {
    return x.tag !== "fn" &&
        x.tag !== "nonlinear-as-linear" &&
        x.tag !== "linear-as-nonlinear" &&
        x.tag !== "string" &&
        x.tag !== "token";
}
function pkGetArgs( val ) {
    if ( !pkIsStruct( val ) )
        throw new Error();
    return val.tag === "nil" ? pkNil :
        val.tag === "cons" ? pkList( val.ind( 0 ), val.ind( 1 ) ) :
            val.args_;
}
function pkRebuild( val, args ) {
    if ( !pkIsStruct( val ) )
        throw new Error();
    return val.tag === "nil" ? pkNil :
        val.tag === "cons" ?
            pkCons( listGet( args, 0 ), listGet( args, 1 ) ) :
            new Pk().init_(
                val.tagName, val.tag, args, args.isLinear(), {} );
}
// TODO: Use pkGetLeaves() and pkMapLeaves() to define primitive
// operations for the Penknkife language. When implementing a
// multi-stage conditional, pkGetLeaves() will make it possible to
// detect all the stages occurring in the value so we can collect
// condition witnesses, and something like pkMapLeaves() will be
// necessary to create the condition-masked values to use in each
// branch. We can't just implement these in terms of pkIsStruct(),
// getArgs(), etc. because they need to reach inside functions'
// encapsulated values.
//
// TODO: Perhaps make all nonlinear-as-linear values provide a
// tree.special.getDeepDeclarations() method, and define a Penknife
// primitive "get-deep-declarations" that does pkGetLeaves() and then
// that.
//
function pkGetLeaves( yoke, tree ) {
    if ( tree.tag === "nonlinear-as-linear" )
        return pkRet( yoke, pkList( tree ) );
    if ( tree.tag === "linear-as-nonlinear"
        || tree.tag === "string"
        || tree.tag === "token" )
        return pkRet( yoke, pkNil );
    if ( pkIsStruct( tree ) )
        return listMappend( yoke, pkGetArgs( tree ),
            function ( yoke, arg ) {
            
            return pkGetLeaves( yoke, arg );
        }, function ( yoke, result ) {
            return pkRet( yoke, result );
        } );
    if ( tree.tag === "fn" )
        return listMappend( yoke, tree.special.captures,
            function ( yoke, capture ) {
            
            if ( capture.tag !== "yep" )
                return pkRet( yoke, pkNil );
            return pkGetLeaves( yoke, capture.ind( 0 ) );
        }, function ( yoke, result ) {
            return pkRet( yoke, result );
        } );
    throw new Error();
}
function pkMapLeaves( yoke, tree, func ) {
    if ( tree.tag === "nonlinear-as-linear" )
        return func( yoke, tree );
    if ( tree.tag === "linear-as-nonlinear"
        || tree.tag === "string"
        || tree.tag === "token" )
        return pkRet( yoke, tree );
    if ( pkIsStruct( tree ) )
        return listMap( yoke, pkGetArgs( tree ),
            function ( yoke, arg ) {
            
            return pkMapLeaves( yoke, arg, func );
        }, function ( yoke, newArgs ) {
            return pkRet( yoke, pkRebuild( tree, newArgs ) );
        } );
    if ( tree.tag === "fn" )
        return listMap( yoke, tree.special.captures,
            function ( yoke, capture ) {
            
            if ( capture.tag !== "yep" )
                return pkRet( yoke, pkNil );
            return pkMapLeaves( yoke, capture.ind( 0 ), func );
        }, function ( yoke, newCaptures ) {
            return pkRet( yoke,
                new Pk().init_(
                    null, "fn", pkNil, newCaptures.isLinear(),
                    { captures: newCaptures, call: tree.special.call,
                        string: tree.special.string } ) );
        } );
    throw new Error();
}
function pkStrUnsafe( jsStr ) {
    return new Pk().init_( null, "string", pkNil, !"isLinear",
        { jsStr: jsStr } );
}
function pkStr( jsStr ) {
    // NOTE: This sanity check is just here in case some code happens
    // to be buggy. We always have valid Unicode by the time we get
    // here, even if that means we do a sanity check beforehand. (See
    // macroexpandReaderExpr(), for example.) If we ever can't afford
    // to do this linear-time check of all the characters, we should
    // consider removing this.
    if ( !isValidUnicode( jsStr ) )
        throw new Error();
    return pkStrUnsafe( jsStr );
}
function pkStrNameRaw( str ) {
    return new Pk().init_(
        null, "string-name", pkList( str ), !"isLinear",
        { unqualifiedNameJson: JSON.stringify( str.special.jsStr ) }
        );
}
function pkStrNameUnsafe( jsStr ) {
    return pkStrNameRaw( pkStrUnsafe( jsStr ) );
}
function pkStrName( jsStr ) {
    return pkStrNameRaw( pkStr( jsStr ) );
}
var pkStrNameUnsafeMemoizedMap = strMap();
function pkStrNameUnsafeMemoized( jsStr ) {
    var result = pkStrNameUnsafeMemoizedMap.get( jsStr );
    if ( result === void 0 )
        pkStrNameUnsafeMemoizedMap.set( jsStr,
            result = pkStrNameUnsafe( jsStr ) );
    return result;
}
function pkPairName( first, second ) {
    return new Pk().init_(
        null, "pair-name", pkList( first, second ), !"isLinear",
        { unqualifiedNameJson:
            "[\"pair-name\"," +
                first.special.unqualifiedNameJson + "," +
                second.special.unqualifiedNameJson + "]" } );
}
function pkQualifiedName( name ) {
    return new Pk().init_(
        null, "qualified-name", pkList( name ), !"isLinear",
        { qualifiedNameJson:
            "[\"qualified-name\"," +
                name.special.unqualifiedNameJson + "]" } );
}
function pkfnLinear( captures, call ) {
    return new Pk().init_( null, "fn", pkNil, captures.isLinear(),
        { captures: captures, call: call, string: "" + call } );
}
function pkfn( call ) {
    return new Pk().init_( null, "fn", pkNil, !"isLinear", {
        captures: pkNil,
        call: function ( yoke, captures, args ) {
            return call( yoke, args );
        },
        string: "" + call
    } );
}
function pkList( var_args ) {
    return pkListFromArr( arguments );
}
function pkYep( contents ) {
    // NOTE: This is equivalent to pk( "yep", contents ), but we call
    // this so frequently it's worth specializing like this.
    return new Pk().init_( null, "yep", pkCons( contents, pkNil ),
        contents.isLinear(), {} );
}
function pkBoolean( jsBoolean ) {
    return jsBoolean ? pkYep( pkNil ) : pkNil;
}

function isList( x ) {
    return x.tag === "cons" || x.tag === "nil";
}
function isNat( x ) {
    return x.tag === "succ" || x.tag === "nil";
}
function isIstring( x ) {
    return x.tag === "istring-cons" || x.tag === "string";
}
// NOTE: For now, isUnqualifiedName( x ) and isQualifiedName( x )
// imply !x.isLinear(). If we ever extend them to include linear
// values, we should take a look at any code that calls them to see if
// it needs to change to respect linearity.
function isUnqualifiedName( x ) {
    return x.tag === "string-name" || x.tag === "pair-name";
}
function isQualifiedName( x ) {
    return x.tag === "qualified-name";
}
function tokenEq( a, b ) {
    return a.special.jsPayload === b.special.jsPayload;
}
function listGet( x, i ) {
    for ( ; 0 < i; i-- ) {
        if ( x.tag !== "cons" )
            throw new Error();
        x = x.ind( 1 );
    }
    if ( x.tag !== "cons" )
        throw new Error();
    return x.ind( 0 );
}
function listLenBounded( x, max ) {
    for ( var n = 0; n <= max; n++ ) {
        if ( x.tag !== "cons" )
            return n;
        x = x.ind( 1 );
    }
    return null;
}
function natToJsBounded( x, max ) {
    for ( var n = 0; n <= max; n++ ) {
        if ( x.tag !== "succ" )
            return n;
        x = x.ind( 0 );
    }
    return null;
}
function listToArrBounded( x, maxLen ) {
    var result = [];
    for ( var n = 0; n <= maxLen; n++ ) {
        if ( x.tag !== "cons" )
            return result;
        result.push( x.ind( 0 ) );
        x = x.ind( 1 );
    }
    return null;
}
function listLenIs( x, n ) {
    return listLenBounded( x, n ) === n;
}
function runRet( yoke, val ) {
    return { type: "done", yoke: yoke, result: val };
}
function runYield( yoke, out, then ) {
    return { type: "yield", yoke: yoke, out: out, then: then };
}
function pkRet( yoke, val ) {
    return runRet( yoke, pkYep( val ) );
}
function pkRawErr( jsStr ) {
    // TODO: See if this can use pkStrUnsafe().
    return pk( "nope", pkStr( jsStr ) );
}
function pkErr( yoke, jsStr ) {
    return runRet( yoke, pkRawErr( jsStr ) );
}
function pkErrLen( yoke, args, message ) {
    var len = listLenBounded( args, 100 );
    return pkErr( yoke, "" + message + " with " + (
        len === null ? "way too many args" :
        len === 1 ? "1 arg" :
            "" + len + " args") );
}
function yokeWithRider( yoke, rider ) {
    return {
        pkRuntime: yoke.pkRuntime,
        yokeRider: rider,
        internal: yoke.internal,
        runWaitLinear: yoke.runWaitLinear
    };
}
function runWait( yoke, func, then ) {
    return yoke.runWaitLinear( function ( yoke ) {
        return func( yoke );
    }, function ( yokeAndResult ) {
        return then( yokeAndResult.yoke, yokeAndResult.result );
    } );
}
function runWaitTry( yoke, func, then ) {
    return runWait( yoke, function ( yoke ) {
        return func( yoke );
    }, function ( yoke, tryVal ) {
        if ( tryVal.tag !== "yep" )
            return runRet( yoke, tryVal );
        return then( yoke, tryVal.ind( 0 ) );
    } );
}
function runWaitOne( yoke, then ) {
    return runWait( yoke, function ( yoke ) {
        return runRet( yoke, null );
    }, function ( yoke, ignored ) {
        return then( yoke );
    } );
}
function syncYokeCall( maybeYokeAndResult, defer, then ) {
    defer( function () {
        if ( maybeYokeAndResult.type === "deferrer" )
            maybeYokeAndResult.go( defer, then );
        else
            then( maybeYokeAndResult );
    } );
}
function listLenEq( yoke, a, b, then ) {
    if ( a.tag === "nil" && b.tag === "nil" )
        return then( yoke, true );
    if ( !(a.tag === "cons" && b.tag === "cons") )
        return then( yoke, false );
    return runWaitOne( yoke, function ( yoke ) {
        return listLenEq( yoke, a.ind( 1 ), b.ind( 1 ), then );
    } );
}
function listLenIsNat( yoke, list, nat, then ) {
    if ( list.tag === "nil" && nat.tag === "nil" )
        return then( yoke, true );
    if ( !(list.tag === "cons" && nat.tag === "succ") )
        return then( yoke, false );
    return runWaitOne( yoke, function ( yoke ) {
        return listLenIsNat(
            yoke, list.ind( 1 ), nat.ind( 0 ), then );
    } );
}
function listGetNat( yoke, list, nat, then ) {
    if ( list.tag !== "cons" )
        return then( yoke, pkNil );
    if ( nat.tag !== "succ" )
        return then( yoke, pkYep( list.ind( 0 ) ) );
    return runWaitOne( yoke, function ( yoke ) {
        return listGetNat( yoke, list.ind( 1 ), nat.ind( 0 ), then );
    } );
}
function listRevAppend( yoke, backwardFirst, forwardSecond, then ) {
    if ( backwardFirst.tag !== "cons" )
        return then( yoke, forwardSecond );
    return runWaitOne( yoke, function ( yoke ) {
        return listRevAppend( yoke, backwardFirst.ind( 1 ),
            pkCons( backwardFirst.ind( 0 ), forwardSecond ), then );
    } );
}
function listRev( yoke, list, then ) {
    return listRevAppend( yoke, list, pkNil,
        function ( yoke, result ) {
        
        return then( yoke, result );
    } );
}
function listAppend( yoke, a, b, then ) {
    return listRev( yoke, a, function ( yoke, revA ) {
        return listRevAppend( yoke, revA, b,
            function ( yoke, result ) {
            
            return then( yoke, result );
        } );
    } );
}
function listFlattenOnce( yoke, list, then ) {
    return go( yoke, list, pkNil );
    function go( yoke, list, revResult ) {
        if ( list.tag !== "cons" )
            return listRev( yoke, revResult,
                function ( yoke, result ) {
                
                return then( yoke, result );
            } );
        return listRevAppend( yoke, list.ind( 0 ), revResult,
            function ( yoke, revResult ) {
            
            return runWaitOne( yoke, function ( yoke ) {
                return go( yoke, list.ind( 1 ), revResult );
            } );
        } );
    }
}
function listFoldl( yoke, init, list, func, then ) {
    return go( yoke, init, list );
    function go( yoke, init, list ) {
        if ( list.tag !== "cons" )
            return then( yoke, init );
        return runWaitTry( yoke, function ( yoke ) {
            return func( yoke, init, list.ind( 0 ) );
        }, function ( yoke, newInit ) {
            return go( yoke, newInit, list.ind( 1 ) );
        } );
    }
}
function listFoldlJsAsync( yoke, init, list, func, then ) {
    return go( yoke, init, list );
    function go( yoke, init, list ) {
        if ( list.tag !== "cons" )
            return then( yoke, init );
        return runWaitOne( yoke, function ( yoke ) {
            return func( yoke, init, list.ind( 0 ),
                function ( yoke, combined ) {
                
                return go( yoke, combined, list.ind( 1 ) );
            } );
        } );
    }
}
function listFoldNatJsAsync( yoke, init, nat, func, then ) {
    return go( yoke, init, nat );
    function go( yoke, init, nat ) {
        if ( nat.tag !== "succ" )
            return then( yoke, init );
        return runWaitOne( yoke, function ( yoke ) {
            return func( yoke, init, function ( yoke, combined ) {
                return go( yoke, combined, nat.ind( 0 ) );
            } );
        } );
    }
}
function listFoldlJs( yoke, init, list, func, then ) {
    return listFoldlJsAsync( yoke, init, list,
        function ( yoke, init, elem, then ) {
        
        return then( yoke, func( init, elem ) );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function listMap( yoke, list, func, then ) {
    return listFoldl( yoke, pkNil, list, function (
        yoke, revResults, origElem ) {
        
        return runWaitTry( yoke, function ( yoke ) {
            return func( yoke, origElem );
        }, function ( yoke, resultElem ) {
            return pkRet( yoke, pkCons( resultElem, revResults ) );
        } );
    }, function ( yoke, revResults ) {
        return listRev( yoke, revResults, function ( yoke, results ) {
            return then( yoke, results );
        } );
    } );
}
function listMappend( yoke, list, func, then ) {
    return listMap( yoke, list, function ( yoke, elem ) {
        return func( yoke, elem );
    }, function ( yoke, resultLists ) {
        return listFlattenOnce( yoke, resultLists,
            function ( yoke, result ) {
            
            return then( yoke, result );
        } );
    } );
}
function listKeepAsync( yoke, list, func, then ) {
    return listMappend( yoke, list, function ( yoke, elem ) {
        return func( yoke, elem, function ( yoke, keep ) {
            return pkRet( yoke, keep ? pkList( elem ) : pkNil );
        } );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function listKeep( yoke, list, func, then ) {
    return listKeepAsync( yoke, list, function ( yoke, elem, then ) {
        return then( yoke, func( elem ) );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function listCount( yoke, list, func, then ) {
    return listFoldl( yoke, pkNil, list, function (
        yoke, count, elem ) {
        
        if ( func( elem ) )
            return pkRet( yoke, pk( "succ", count ) );
        return pkRet( yoke, count );
    }, function ( yoke, count ) {
        return then( yoke, count );
    } );
}
function listLen( yoke, list, then ) {
    return listCount( yoke, list, function ( elem ) {
        return true;
    }, function ( yoke, count ) {
        return then( yoke, count );
    } );
}
function listAnyAsync( yoke, list, func, then ) {
    if ( list.tag !== "cons" )
        return then( yoke, false );
    return func( yoke, list.ind( 0 ), function ( yoke, result ) {
        if ( result )
            return then( yoke, result );
        return runWaitOne( yoke, function ( yoke ) {
            return listAnyAsync( yoke, list.ind( 1 ), func, then );
        } );
    } );
}
function listAny( yoke, list, func, then ) {
    return listAnyAsync( yoke, list, function ( yoke, elem, then ) {
        return then( yoke, func( elem ) );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function listAll( yoke, list, func, then ) {
    return listAny( yoke, list, function ( elem ) {
        return !func( elem );
    }, function ( yoke, failed ) {
        return then( yoke, !failed );
    } );
}
function listEach( yoke, list, func, then ) {
    return listAny( yoke, list, function ( elem ) {
        func( elem );
        return false;
    }, function ( yoke, ignored ) {
        return then( yoke );
    } );
}
function listMapMultiWithLen( yoke, nat, lists, func, then ) {
    return go( yoke, nat, lists, pkNil );
    function go( yoke, nat, lists, revResults ) {
        if ( nat.tag !== "succ" )
            return listRev( yoke, revResults,
                function ( yoke, results ) {
                
                return then( yoke, results );
            } );
        return listMap( yoke, lists, function ( yoke, list ) {
            return pkRet( yoke, list.ind( 0 ) );
        }, function ( yoke, firsts ) {
            return listMap( yoke, lists, function ( yoke, list ) {
                return pkRet( yoke, list.ind( 1 ) );
            }, function ( yoke, rests ) {
                return runWaitTry( yoke, function ( yoke ) {
                    return func( yoke, firsts );
                }, function ( yoke, resultElem ) {
                    return go( yoke, nat.ind( 0 ), rests,
                        pkCons( resultElem, revResults ) );
                } );
            } );
        } );
    }
}
function listMapMulti( yoke, lists, func, then ) {
    if ( lists.tag !== "cons" )
        throw new Error();
    return listLen( yoke, lists.ind( 0 ), function ( yoke, len ) {
        return listMapMultiWithLen( yoke, len, lists,
            function ( yoke, elems ) {
            
            return func( yoke, elems );
        }, function ( yoke, result ) {
            return then( yoke, result );
        } );
    } );
}
function listMapTwo( yoke, a, b, func, then ) {
    return listMapMulti( yoke, pkList( a, b ),
        function ( yoke, elems ) {
        
        return func( yoke, listGet( elems, 0 ), listGet( elems, 1 ) );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}

function pkAssertLetList( yoke, list, nat, then ) {
    return listLenIsNat( yoke, list, nat, function ( yoke, valid ) {
        if ( !valid )
            return pkErr( yoke,
                "Got the wrong number of elements when " +
                "destructuring a list" );
        return then( yoke, pkNil );
    } );
}

function toUnqualifiedName( yoke, x, then ) {
    return runWaitTry( yoke, function ( yoke ) {
        return callMethod( yoke, "to-unqualified-name", pkList( x ) );
    }, function ( yoke, name ) {
        if ( !isUnqualifiedName( name ) )
            return pkErr( yoke,
                "Returned from to-unqualified-name with a value " +
                "that wasn't an unqualified name" );
        return then( yoke, name );
    } );
}

function isEnoughGetTineShallow( x ) {
    return isList( x ) && listLenIs( x, 2 ) &&
        isList( listGet( x, 0 ) );
}
function isEnoughGetTineDeep( yoke, x, then ) {
    if ( !isEnoughGetTineShallow( x ) )
        return then( yoke, false );
    return listAll( yoke, listGet( x, 0 ), function ( name ) {
        return isUnqualifiedName( name );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function pkGetTineLinear( names, captures, func ) {
    return pkList( names, pkfnLinear( captures,
        function ( yoke, captures, args ) {
        
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args,
                "Called a get-tine function" );
        var essences = listGet( args, 0 );
        if ( !isList( essences ) )
            return pkErr( yoke,
                "Called a get-tine function with a non-list list " +
                "of essences" );
        return listLenEq( yoke, names, essences,
            function ( yoke, areEq ) {
            
            if ( !areEq )
                return pkErr( yoke,
                    "Called a get-tine function with a list of " +
                    "essences that wasn't the right length" );
            
            return func( yoke, captures, essences );
        } );
    } ) );
}
function pkGetTine( names, func ) {
    return pkGetTineLinear( names, pkNil,
        function ( yoke, captures, essences ) {
        
        return func( yoke, essences );
    } );
}

function pkDup( yoke, val, count, then ) {
    
    // If we're only trying to get one duplicate, we already have our
    // answer, regardless of whether the value is linear.
    if ( count.tag === "succ" && count.ind( 0 ).tag === "nil" )
        return then( yoke, pkList( val ) );
    
    if ( !val.isLinear() ) {
        // NOTE: This includes tags "nil", "string", "string-name",
        // "pair-name", and "qualified-name".
        return withDups( pkNil, function ( ignored ) {
            return val;
        } );
    }
    if ( val.tag === "fn" )
        return withDups( val.special.captures, function ( captures ) {
            return new Pk().init_(
                null, "fn", pkNil, captures.isLinear(),
                {
                    captures: captures,
                    call: val.special.call,
                    string: val.special.string
                } );
        } );
    if ( val.tag === "nonlinear-as-linear" )
        return runWaitTry( yoke, function ( yoke ) {
            return callMethod( yoke, "call", pkList(
                val.special.duplicator,
                pkList( val.special.innerValue, count )
            ) );
        }, function ( yoke, innerValues ) {
            if ( !isList( innerValues ) )
                return pkErr( yoke,
                    "Got a non-list from a linear value's custom " +
                    "duplicator function." );
            return listLenIsNat( yoke, innerValues, count,
                function ( yoke, correct ) {
                
                if ( !correct )
                    return pkErr( yoke,
                        "Got a list of incorrect length from a " +
                        "linear value's custom duplicator function."
                        );
                return listMap( yoke, innerValues,
                    function ( yoke, innerValue ) {
                    
                    return pkRet( yoke, pkNonlinearAsLinear(
                        innerValue,
                        val.special.duplicator,
                        val.special.unwrapper
                    ) );
                }, function ( yoke, outerValues ) {
                    return then( yoke, outerValues );
                } );
            } );
        } );
    return withDups( pkGetArgs( val ), function ( args ) {
        return pkRebuild( val, args );
    } );
    function withDups( args, rebuild ) {
        return listMap( yoke, args, function ( yoke, arg ) {
            return pkDup( yoke, arg, count,
                function ( yoke, argDups ) {
                
                return pkRet( yoke, argDups );
            } );
        }, function ( yoke, argsDuplicates ) {
            return listMapMultiWithLen( yoke, count, argsDuplicates,
                function ( yoke, args ) {
                
                return pkRet( yoke, rebuild( args ) );
            }, function ( yoke, result ) {
                return then( yoke, result );
            } );
        } );
    }
}
function pkDrop( yoke, val, then ) {
    return pkDup( yoke, val, pkNil, function ( yoke, nothing ) {
        return then( yoke );
    } );
}
function pkUnwrap( yoke, val, then ) {
    if ( val.tag !== "nonlinear-as-linear" )
        return pkErr( yoke,
            "Tried to unwrap a value that wasn't a " +
            "nonlinear-as-linear" );
    return runWaitTry( yoke, function ( yoke ) {
        return callMethod( yoke, "call", pkList(
            val.special.unwrapper,
            pkList( val.special.innerValue )
        ) );
    }, function ( yoke, unwrapped ) {
        if ( unwrapped.isLinear() )
            return pkErr( yoke,
                "Unwrapped a value and got a linear value" );
        return then( yoke, unwrapped );
    } );
}
function fulfillGetTine( yoke, getTine, essences, then ) {
    return listFoldl( yoke,
        pkList( pkNil, essences ), listGet( getTine, 0 ),
        function ( yoke, takenRevAndNot, name ) {
            var notTaken = listGet( takenRevAndNot, 1 );
            if ( notTaken.tag !== "cons" )
                return pkErr( yoke,
                    "An internal fulfillGetTine operation " +
                    "encountered fewer input essences than " +
                    "required by the get-tines." );
            return pkRet( yoke, pkList(
                pkCons( notTaken.ind( 0 ),
                    listGet( takenRevAndNot, 0 ) ),
                notTaken.ind( 1 )
            ) );
        }, function ( yoke, takenRevAndNot ) {
        
        return listRev( yoke, listGet( takenRevAndNot, 0 ),
            function ( yoke, taken ) {
            
            return runWaitTry( yoke, function ( yoke ) {
                return callMethod( yoke, "call",
                    pkList(
                        listGet( getTine, 1 ), pkList( taken ) ) );
            }, function ( yoke, resultEssence ) {
                return then( yoke,
                    resultEssence, listGet( takenRevAndNot, 1 ) );
            } );
        } );
    } );
}
function fulfillGetTines( yoke, getTines, essences, then ) {
    if ( getTines.tag !== "cons" )
        return then( yoke, pkNil, essences );
    return fulfillGetTine( yoke, getTines.ind( 0 ), essences,
        function ( yoke, outEssence, inEssencesRemaining ) {
        
        return fulfillGetTines( yoke,
            getTines.ind( 1 ), inEssencesRemaining,
            function ( yoke, outEssences, inEssencesRemaining ) {
            
            return runWaitOne( yoke, function ( yoke ) {
                return then( yoke,
                    pkCons( outEssence, outEssences ),
                    inEssencesRemaining );
            } );
        } );
    } );
}
function makeSubEssenceUnderMappendedArgs( yoke,
    expr, nonlocalGetForkOrNull, gensymBase, argList, then ) {
    
    function getEntry( argMap, pkName ) {
        var jsName = pkName.special.unqualifiedNameJson;
        return argMap.get( jsName );
    }
    
    // Build a deduplicated version of `argList`, where a duplicated
    // name only appears in its last occurrence. For instance, abac
    // becomes bac. The result is `latestOccurrenceArgList`. While
    // building this result, also initialize `argMap` so we can easily
    // detect whether a name in `captures` is local or nonlocal later
    // on.
    return listRev( yoke, argList, function ( yoke, revArgList ) {
    return listFoldlJsAsync( yoke,
        { argMap: strMap(), maybeArgList: pkNil },
        revArgList,
        function ( yoke, state, pkName, then ) {
        
        var jsName = pkName.special.unqualifiedNameJson;
        if ( state.argMap.has( jsName ) )
            return then( yoke, {
                argMap: state.argMap,
                maybeArgList: pkCons( pkNil, state.maybeArgList )
            } );
        else
            return then( yoke, {
                argMap: state.argMap.plusEntry(
                    jsName, { dups: pkNil, indices: pkNil } ),
                maybeArgList:
                    pkCons( pkYep( pkName ), state.maybeArgList )
            } );
    }, function ( yoke, maybeArgState ) {
    return listMappend( yoke, maybeArgState.maybeArgList,
        function ( yoke, maybePkName ) {
        
        if ( maybePkName.tag === "yep" )
            return pkRet( yoke, pkList( maybePkName.ind( 0 ) ) );
        else
            return pkRet( yoke, pkNil );
    }, function ( yoke, latestOccurrenceArgList ) {
    
    if ( nonlocalGetForkOrNull === null )
        return next( yoke, expr );
    return runWaitTryGetmacFork( yoke, "macroexpand-to-fork",
        function ( yoke ) {
        
        return callMethod( yoke, "macroexpand-to-fork", pkList(
            expr,
            deriveGetFork( nonlocalGetForkOrNull,
                function ( yoke, name, then ) {
                    return then( yoke,
                        getEntry( maybeArgState.argMap, name ) !==
                            void 0 );
                } ),
            gensymBase
        ) );
    }, function ( yoke, innerGetTine, maybeMacro ) {
        return next( yoke, innerGetTine );
    } );
    function next( yoke, innerGetTine ) {
    
    var captures = listGet( innerGetTine, 0 );
    var cont = listGet( innerGetTine, 1 );
    
    return listKeep( yoke, captures, function ( pkName ) {
        return getEntry( maybeArgState.argMap, pkName ) === void 0;
    }, function ( yoke, nonlocalNames ) {
    return listLen( yoke, nonlocalNames,
        function ( yoke, lenNonlocalNames ) {
    
    return listFoldlJsAsync( yoke, maybeArgState.argMap, captures,
        function ( yoke, argMap, pkName, then ) {
        
        var jsName = pkName.special.unqualifiedNameJson;
        var entry = argMap.get( jsName );
        if ( entry === void 0 )  // nonlocal
            return then( yoke, argMap );
        // local
        return then( yoke, argMap.plusEntry( jsName, {
            dups: pk( "succ", entry.dups ),
            indices: entry.indices
        } ) );
    }, function ( yoke, argMap ) {
    return listFoldlJsAsync( yoke,
        { argMap: argMap, i: lenNonlocalNames },
        latestOccurrenceArgList,
        function ( yoke, state, pkName, then ) {
        
        var jsName = pkName.special.unqualifiedNameJson;
        var entry = state.argMap.get( jsName );
        return listFoldNatJsAsync( yoke,
            { i: state.i, revIndices: pkNil },
            entry.dups,
            function ( yoke, state2, then ) {
            
            return then( yoke, {
                i: pk( "succ", state2.i ),
                revIndices: pkCons( state2.i, state2.revIndices )
            } );
        }, function ( yoke, state2 ) {
            return listRev( yoke, state2.revIndices,
                function ( yoke, indices ) {
                
                return then( yoke, {
                    argMap: state.argMap.plusEntry( jsName,
                        { dups: entry.dups, indices: indices } ),
                    i: state2.i
                } );
            } );
        } );
    }, function ( yoke, argMapState ) {
    return listFoldlJsAsync( yoke,
        { argMap: argMapState.argMap,
            nonlocalI: pkNil, revInEssences: pkNil },
        captures,
        function ( yoke, state, pkName, then ) {
        
        var jsName = pkName.special.unqualifiedNameJson;
        var entry = state.argMap.get( jsName );
        if ( entry === void 0 ) {
            // nonlocal
            return then( yoke, {
                argMap: state.argMap,
                nonlocalI: pk( "succ", state.nonlocalI ),
                revInEssences:
                    pkCons( pk( "param-essence", state.nonlocalI ),
                        state.revInEssences )
            } );
        } else {
            // local
            if ( entry.indices.tag !== "cons" )
                throw new Error();
            var localI = entry.indices.ind( 0 );
            return then( yoke, {
                argMap: state.argMap.plusEntry( jsName, {
                    dups: entry.dups,
                    indices: entry.indices.ind( 1 )
                } ),
                nonlocalI: state.nonlocalI,
                revInEssences:
                    pkCons( pk( "param-essence", localI ),
                        state.revInEssences )
            } );
        }
    }, function ( yoke, revInEssencesState ) {
    return listRev( yoke, revInEssencesState.revInEssences,
        function ( yoke, inEssences ) {
    return runWaitTry( yoke, function ( yoke ) {
        return callMethod( yoke, "call",
            pkList( cont, pkList( inEssences ) ) );
    }, function ( yoke, outEssence ) {
    return listMap( yoke, maybeArgState.maybeArgList,
        function ( yoke, maybePkName ) {
        
        if ( maybePkName.tag === "yep" )
            return pkRet( yoke,
                getEntry( revInEssencesState.argMap,
                    maybePkName.ind( 0 ) ).dups );
        else
            return pkRet( yoke, pkNil );
    }, function ( yoke, dupsList ) {
    
    return then( yoke, nonlocalNames, dupsList, outEssence );
    
    } );
    } );
    } );
    } );
    } );
    } );
    
    } );
    } );
    
    }
    
    } );
    } );
    } );
}
function forkGetter( nameForError ) {
    return pkfn( function ( yoke, args ) {
        // NOTE: This reads definitions. We maintain the metaphor that
        // we work with an immutable snapshot of the definitions, so
        // we may want to refactor this to be closer to that metaphor
        // someday.
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called " + nameForError );
        var name = listGet( args, 0 );
        
        if ( isQualifiedName( name ) )
            return handleQualifiedName( yoke, name );
        else
            return toUnqualifiedName( yoke, name,
                function ( yoke, name ) {
                
                return runWaitTry( yoke, function ( yoke ) {
                    return runRet( yoke,
                        yoke.pkRuntime.qualifyName( name ) );
                }, function ( yoke, name ) {
                    return handleQualifiedName( yoke, name );
                } );
            } );
        
        function handleQualifiedName( yoke, name ) {
            return runWaitTry( yoke, function ( yoke ) {
                return runRet( yoke,
                    yoke.pkRuntime.getMacro( name ) );
            }, function ( yoke, maybeMacro ) {
                return pkRet( yoke, pk( "getmac-fork",
                    pkGetTine( pkNil, function ( yoke, essences ) {
                        return pkRet( yoke,
                            pk( "main-essence", name ) );
                    } ),
                    maybeMacro
                ) );
            } );
        }
    } );
}
function deriveGetFork( nonlocalGetFork, isLocalName ) {
    return pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called a get-fork" );
        var name = listGet( args, 0 );
        
        if ( isQualifiedName( name ) )
            return handleNonlocal( yoke );
        else
            return toUnqualifiedName( yoke, name,
                function ( yoke, name ) {
                
                return isLocalName( yoke, name,
                    function ( yoke, isLocal ) {
                    
                    if ( !isLocal )
                        return handleNonlocal( yoke );
                    return pkRet( yoke, pk( "getmac-fork",
                        pkGetTine( pkList( name ),
                            function ( yoke, essences ) {
                            
                            return pkRet( yoke,
                                listGet( essences, 0 ) );
                        } ),
                        pkNil
                    ) );
                } );
            } );
        
        function handleNonlocal( yoke ) {
            // NOTE: We don't verify the output of nonlocalGetFork.
            // Forks are anything that works with the fork-to-getmac
            // method and possibly other methods, and if we sanitize
            // this output using fork-to-getmac followed by
            // getmac-fork, we inhibit support for those other
            // methods. (By "other methods," I don't necessarily mean
            // methods that are part of this language implementation;
            // the user can define methods too, and the user's own
            // macros can pass forks to them.)
            return runWaitOne( yoke, function ( yoke ) {
                return callMethod( yoke, "call",
                    pkList( nonlocalGetFork, pkList( name ) ) );
            } );
        }
    } );
}
function runWaitTryGetmacFork( yoke, nameForError, func, then ) {
    return runWaitTry( yoke, function ( yoke ) {
        return func( yoke );
    }, function ( yoke, fork ) {
        return runWaitTry( yoke, function ( yoke ) {
            return callMethod( yoke, "fork-to-getmac",
                pkList( fork ) );
        }, function ( yoke, results ) {
            if ( !(isList( results ) && listLenIs( results, 2 )) )
                return pkErr( yoke,
                    "Got a non-pair from " + nameForError );
            var getTine = listGet( results, 0 );
            var maybeMacro = listGet( results, 1 );
            
            // TODO: Using isEnoughGetTineDeep() like this might be
            // inefficient, but in every place we call
            // runWaitTryGetmacFork(), the getTine might be provided
            // by user-defined code, so it might be invalid. See if we
            // would be better off making a "get-tine" type which
            // validates the list upon construction.
            return isEnoughGetTineDeep( yoke, getTine,
                function ( yoke, valid ) {
                
                if ( !valid )
                    return pkErr( yoke,
                        "Got an invalid get-tine from " + nameForError
                        );
                if ( maybeMacro.tag === "nil" ) {
                    // Do nothing.
                } else if ( maybeMacro.tag !== "yep" ) {
                    return pkErr( yoke,
                        "Got a non-maybe value for the macro " +
                        "result of " + nameForError );
                } else if ( maybeMacro.isLinear() ) {
                    return pkErr( yoke,
                        "Got a linear value for the macro result " +
                        "of " + nameForError );
                }
                return then( yoke, getTine, maybeMacro );
            } );
        } );
    } );
}
var nonMacroMacroexpander = pkfn( function ( yoke, args ) {
    if ( !listLenIs( args, 4 ) )
        return pkErrLen( yoke, args,
            "Called a non-macro's macroexpander" );
    var fork = listGet( args, 0 );
    var argsList = listGet( args, 1 );
    var getFork = listGet( args, 2 );
    var gensymBase = listGet( args, 3 );
    if ( !isList( argsList ) )
        return pkErr( yoke,
            "Called a non-macro's macroexpander with a non-list " +
            "args list" );
    if ( getFork.isLinear() )
        return pkErr( yoke,
            "Called a non-macro's macroexpander with a linear " +
            "get-fork" );
    if ( !isUnqualifiedName( gensymBase ) )
        return pkErr( yoke,
            "Called a non-macro's macroexpander with a gensym base " +
            "that wasn't an unqualified name" );
    return runWaitTryGetmacFork( yoke,
        "the fork parameter to a non-macro's macroexpander",
        function ( yoke ) {
        
        return pkRet( yoke, fork );
    }, function ( yoke, funcGetTine, funcMaybeMacro ) {
        return parseList( yoke, argsList, pkNil );
        function parseList( yoke, list, revGetTinesSoFar ) {
            if ( list.tag !== "cons" )
                return listRev( yoke, revGetTinesSoFar,
                    function ( yoke, getTines ) {
                    
                    var allGetTines = pkCons( funcGetTine, getTines );
                    return listMappend( yoke, allGetTines,
                        function ( yoke, getTine ) {
                        
                        return pkRet( yoke, listGet( getTine, 0 ) );
                    }, function ( yoke, allNames ) {
                        // <indentation-reset>
return pkRet( yoke, pk( "getmac-fork",
    pkGetTineLinear( allNames, pkList( pkYep( allGetTines ) ),
        function ( yoke, captures, allInEssences ) {
        
        var allGetTines = listGet( captures, 0 ).ind( 0 );
        return fulfillGetTines( yoke, allGetTines, allInEssences,
            function ( yoke, allOutEssences, inEssencesRemaining ) {
            
            if ( !listLenIs( inEssencesRemaining, 0 ) )
                throw new Error();
            return pkRet( yoke,
                pk( "call-essence",
                    allOutEssences.ind( 0 ),
                    allOutEssences.ind( 1 ) ) );
        } );
    } ),
    pkNil
) );
                        // </indentation-reset>
                    } );
                } );
            return runWaitTryGetmacFork( yoke,
                "macroexpand-to-fork",
                function ( yoke ) {
                
                return callMethod( yoke, "macroexpand-to-fork",
                    pkList( list.ind( 0 ), getFork, gensymBase ) );
            }, function ( yoke, getTine, maybeMacro ) {
                return parseList( yoke, list.ind( 1 ),
                    pkCons( getTine, revGetTinesSoFar ) );
            } );
        }
    } );
} );
function callMethod( yoke, jsMethodName, args ) {
    return yoke.pkRuntime.callMethodRaw( yoke,
        pkQualifiedName( pkStrNameUnsafeMemoized( jsMethodName ) ),
        args );
}
function hasDefinerToken( yoke, then ) {
    var yokeRider = yoke.yokeRider;
    var pureYoke = yokeWithRider( yoke, pk( "pure-yoke" ) );
    return runWaitTry( pureYoke, function ( pureYoke ) {
        return callMethod( pureYoke, "yoke-get-definer-token",
            pkList( yokeRider ) );
    }, function ( pureYoke, maybeDefinerToken ) {
        if ( pureYoke.yokeRider.tag !== "pure-yoke" )
            return pkErr( yoke,
                "Returned from yoke-get-definer-token with a yoke " +
                "other than the given one" );
        
        if ( maybeDefinerToken.tag === "yep" ) {
            var definerToken = maybeDefinerToken.ind( 0 );
            if ( definerToken.tag !== "token" )
                return pkErr( yoke,
                    "Returned from yoke-get-definer-token with a " +
                    "non-token" );
            if ( !definerToken.special.jsPayload.canDefine )
                return pkErr( yoke,
                    "Returned from yoke-get-definer-token with a " +
                    "token other than the current definer token" );
            return then( yoke, true );
        } else if ( maybeDefinerToken.tag === "nil" ) {
            return then( yoke, false );
        } else {
            return pkErr( yoke,
                "Returned from yoke-get-definer-token with a " +
                "non-maybe" );
        }
    } );
}
function runSyncYoke( maybeYokeAndResult ) {
    var deferred = [];
    var finalYokeAndResult = null;
    syncYokeCall( maybeYokeAndResult, function ( actionToDefer ) {
        deferred.push( actionToDefer );
    }, function ( yokeAndResult ) {
        if ( deferred.length !== 0 || finalYokeAndResult !== null )
            throw new Error();
        finalYokeAndResult = yokeAndResult;
    } );
    while ( deferred.length !== 0 )
        deferred.shift()();
    if ( deferred.length !== 0 || finalYokeAndResult === null )
        throw new Error();
    return finalYokeAndResult;
}
function macroexpand( yoke, expr ) {
    return runWaitTryGetmacFork( yoke, "macroexpand-to-fork",
        function ( yoke ) {
        
        return callMethod( yoke, "macroexpand-to-fork", pkList(
            expr,
            forkGetter( "the top-level get-fork" ),
            pkStrNameUnsafeMemoized( "root-gensym-base" )
        ) );
    }, function ( yoke, getTine, maybeMacro ) {
        if ( !listLenIs( listGet( getTine, 0 ), 0 ) )
            return pkErr( yoke,
                "Got a top-level macroexpansion result with captures"
                );
        return runWaitTry( yoke, function ( yoke ) {
            return callMethod( yoke, "call",
                pkList( listGet( getTine, 1 ), pkList( pkNil ) ) );
        }, function ( yoke, essence ) {
            return pkRet( yoke, essence );
        } );
    } );
}
function macroexpandReaderExpr( yoke, readerExpr ) {
    return convertExpr( yoke, readerExpr, function ( yoke, conses ) {
        return macroexpand( yoke, conses );
    } );
    function convertString( yoke, elements, stringSoFar, then ) {
        return runWaitOne( yoke, function ( yoke ) {
            if ( elements === null ) {
                return then( yoke, stringSoFar );
            } else {
                // TODO: Put an isString() utility somewhere.
                if ( !(typeof elements.first === "string"
                    && isValidUnicode( elements.first )) )
                    throw new Error();
                return convertString( yoke,
                    elements.rest,
                    "" + stringSoFar + elements.first,
                    then );
            }
        } );
    }
    function convertExpr( yoke, readerExpr, then ) {
        return runWaitOne( yoke, function ( yoke ) {
            if ( readerExpr.type === "nil" ) {
                return then( yoke, pkNil );
            } else if ( readerExpr.type === "cons" ) {
                return convertExpr( yoke, readerExpr.first,
                    function ( yoke, first ) {
                return convertExpr( yoke, readerExpr.rest,
                    function ( yoke, rest ) {
                return runWaitOne( yoke, function ( yoke ) {
                
                return then( yoke, pkCons( first, rest ) );
                
                } );
                } );
                } );
            } else if ( readerExpr.type === "stringNil" ) {
                return convertString( yoke, readerExpr.string, "",
                    function ( yoke, string ) {
                
                return then( yoke, pkStrUnsafe( string ) );
                
                } );
            } else if ( readerExpr.type === "stringCons" ) {
                return convertString( yoke, readerExpr.string, "",
                    function ( yoke, string ) {
                return convertExpr( yoke, readerExpr.interpolation,
                    function ( yoke, interpolation ) {
                return convertExpr( yoke, readerExpr.rest,
                    function ( yoke, rest ) {
                return runWaitOne( yoke, function ( yoke ) {
                
                return then( yoke,
                    pk( "istring-cons",
                        pkStrUnsafe( string ), interpolation, rest )
                    );
                
                } );
                } );
                } );
                } );
            }
        } );
    }
}
// TODO: Figure out if we should manage `withTopLevelEffects` in a
// more generalized way.
// TODO: See if we should be temporarily augmenting the `yokeRider`,
// rather than temporarily replacing it.
function withTopLevelEffects( yoke, body ) {
    var empoweredYoke =
        yokeWithRider( yoke, pk( "definer-yoke", pkToken( {
            stringRep: "definer",
            comparable: false,
            isMutableBox: false,
            mutableBoxState: pkNil,
            mutableBoxEnvironment: dummyMutableEnvironment,
            isValidMutableEnvironment: false,
            canDefine: true,
            canYield: false,
            coroutineNext: null
        } ) ) );
    return runWaitTry( empoweredYoke, function ( empoweredYoke ) {
        return body( empoweredYoke );
    }, function ( empoweredYoke, result ) {
        var disempoweredYoke =
            yokeWithRider( empoweredYoke, yoke.yokeRider );
        if ( empoweredYoke.yokeRider.tag !== "definer-yoke" )
            return pkErr( disempoweredYoke,
                "Returned from a top-level command with a yoke " +
                "that wasn't a definer-yoke" );
        var definerToken = empoweredYoke.yokeRider.ind( 0 );
        if ( !definerToken.special.jsPayload.canDefine )
            return pkErr( disempoweredYoke,
                "Returned from a top-level command with a " +
                "non-current definer token" );
        definerToken.special.jsPayload.canDefine = false;
        return pkRet( disempoweredYoke, result );
    } );
}
function interpretEssence( yoke, essence ) {
    return withTopLevelEffects( yoke, function ( yoke ) {
        return callMethod( yoke, "essence-interpret",
            pkList( essence, pkNil ) );
    } );
}

var cachedNats = [];
// TODO: Put this constant somewhere more configurable.
// NOTE: There seems to be a plateau once this is as high as 3. We're
// setting it to 10 anyway just in case.
var maxCachedNat = 10;
(function () {
    var nat = pkNil;
    for ( var i = 0; i <= maxCachedNat; i++ ) {
        cachedNats.push( nat );
        nat = pk( "succ", nat );
    }
})();


function makePkRuntime() {
    // NOTE: The function PkRuntime() is defined further below.
    var self = new PkRuntime().init_( strMap(), null );
    
    function globalName( name ) {
        return pkQualifiedName( pkStrNameUnsafeMemoized( name ) );
    }
    function defTag( name, var_args ) {
        self.defTag( globalName( name ),
            pkListFromArr( arrMap( [].slice.call( arguments, 1 ),
                function ( s ) {
                    return pkStrNameUnsafeMemoized( s );
                } ) ) );
    }
    function defMethod( name, var_args ) {
        self.defMethod( globalName( name ),
            pkListFromArr( arrMap( [].slice.call( arguments, 1 ),
                function ( s ) {
                    return pkStrNameUnsafeMemoized( s );
                } ) ) );
    }
    function defVal( name, val ) {
        self.defVal( globalName( name ), val );
    }
    function defFunc( name, arity, jsFunc ) {
        defVal( name, pkfn( function ( yoke, args ) {
            if ( !listLenIs( args, arity ) )
                return pkErrLen( yoke, args, "Called " + name );
            return jsFunc.apply( {},
                [ yoke ].concat( listToArrBounded( args, arity ) ) );
        } ) );
    }
    function defMacro( name, body ) {
        self.defMacro( globalName( name ),
            pkfn( function ( yoke, args ) {
            
            if ( !listLenIs( args, 4 ) )
                return pkErrLen( yoke, args,
                    "Called " + name + "'s macroexpander" );
            var fork = listGet( args, 0 );
            var macroBody = listGet( args, 1 );
            var getFork = listGet( args, 2 );
            var gensymBase = listGet( args, 3 );
            if ( !isList( macroBody ) )
                return pkErr( yoke,
                    "Called " + name + "'s macroexpander with a " +
                    "non-list macro body" );
            if ( getFork.isLinear() )
                return pkErr( yoke,
                    "Called " + name + "'s macroexpander with a " +
                    "linear get-fork" );
            if ( !isUnqualifiedName( gensymBase ) )
                return pkErr( yoke,
                    "Called " + name + "'s macroexpander with a " +
                    "gensym base that wasn't an unqualified name" );
            return body( yoke, fork, macroBody, getFork, gensymBase );
        } ) );
    }
    function setStrictImpl( methodName, tagName, call ) {
        self.setStrictImpl(
            globalName( methodName ), globalName( tagName ), call );
    }
    
    defTag( "cons", "first", "rest" );
    defFunc( "cons", 2, function ( yoke, first, rest ) {
        if ( !isList( rest ) )
            return pkErr( yoke,
                "Called cons with a rest that wasn't a list" );
        return pkRet( yoke, pkCons( first, rest ) );
    } );
    defTag( "succ", "pred" );
    defFunc( "succ", 1, function ( yoke, pred ) {
        if ( !isNat( pred ) )
            return pkErr( yoke,
                "Called succ with a predecessor that wasn't a nat" );
        return pkRet( yoke, pk( "succ", pred ) );
    } );
    defTag( "yep", "val" );
    defTag( "nope", "val" );
    defTag( "nil" );
    defTag( "string" );
    defVal( "string", pkfn( function ( yoke, args ) {
        return pkErr( yoke, "The string function has no behavior" );
    } ) );
    defTag( "istring-cons", "prefix", "interpolation", "rest" );
    defFunc( "istring-cons", 3,
        function ( yoke, prefix, interpolation, rest ) {
        
        if ( prefix.tag !== "string" )
            return pkErr( yoke,
                "Called istring-cons with a prefix that wasn't a " +
                "string" );
        if ( !isIstring( rest ) )
            return pkErr( yoke,
                "Called istring-cons with a rest that wasn't an " +
                "istring" );
        return pkRet( yoke,
            pk( "istring-cons", prefix, interpolation, rest ) );
    } );
    defTag( "string-name", "string" );
    defFunc( "string-name", 1, function ( yoke, string ) {
        if ( string.tag !== "string" )
            return pkErr( yoke,
                "Called string-name with a non-string" );
        return pkRet( yoke, pkStrNameRaw( string ) );
    } );
    defTag( "pair-name", "first", "second" );
    defFunc( "pair-name", 2, function ( yoke, first, second ) {
        if ( !(true
            && isUnqualifiedName( first )
            && isUnqualifiedName( second )
        ) )
            return pkErr( yoke,
                "Called pair-name with an element that wasn't an " +
                "unqualified name" );
        return pkRet( yoke, pkPairName( first, second ) );
    } );
    defTag( "qualified-name", "name" );
    defFunc( "qualified-name", 1, function ( yoke, name ) {
        if ( !isUnqualifiedName( name ) )
            return pkErr( yoke,
                "Called qualified-name with a value that wasn't an " +
                "unqualified name" );
        return pkRet( yoke, pkQualifiedName( name ) );
    } );
    defTag( "nonlinear-as-linear",
        "inner-value", "duplicator", "unwrapper" );
    defFunc( "nonlinear-as-linear", 3,
        function ( yoke, innerValue, duplicator, unwrapper ) {
        
        if ( innerValue.isLinear() )
            return pkErr( yoke,
                "Called nonlinear-as-linear with an inner value  " +
                "that was itself linear" );
        if ( duplicator.isLinear() )
            return pkErr( yoke,
                "Called nonlinear-as-linear with a duplicator " +
                "function that was itself linear" );
        if ( unwrapper.isLinear() )
            return pkErr( yoke,
                "Called nonlinear-as-linear with an unwrapper " +
                "function that was itself linear" );
        return pkRet( yoke,
            pkNonlinearAsLinear(
                innerValue, duplicator, unwrapper ) );
    } );
    defTag( "linear-as-nonlinear", "inner-value" );
    defFunc( "linear-as-nonlinear", 1, function ( yoke, innerValue ) {
        return pkRet( yoke, pkLinearAsNonlinear( innerValue ) );
    } );
    defTag( "fn" );
    defVal( "fn", pkfn( function ( yoke, args ) {
        return pkErr( yoke, "The fn function has no behavior" );
    } ) );
    defMethod( "call", "self", "args" );
    setStrictImpl( "call", "fn", function ( yoke, args ) {
        var fn = listGet( args, 0 );
        var fnArgs = listGet( args, 1 );
        if ( !isList( fnArgs ) )
            return pkErr( yoke,
                "Called call with a non-list args list" );
        // TODO: See if we should respect linearity some more by
        // double-checking that the captured values haven't already
        // been spent.
        return fn.special.call( yoke, fn.special.captures, fnArgs );
    } );
    
    defTag( "pure-yoke" );
    defTag( "definer-yoke", "definer-token" );
    defMethod( "yoke-get-definer-token", "yoke" );
    setStrictImpl( "yoke-get-definer-token", "pure-yoke",
        function ( yoke, args ) {
        
        return pkRet( yoke, pkNil );
    } );
    setStrictImpl( "yoke-get-definer-token", "definer-yoke",
        function ( yoke, args ) {
        
        return pkRet( yoke, pkYep( listGet( args, 0 ).ind( 0 ) ) );
    } );
    
    defTag( "getmac-fork", "get-tine", "maybe-macro" );
    defFunc( "getmac-fork", 2,
        function ( yoke, getTine, maybeMacro ) {
        
        return isEnoughGetTineDeep( yoke, getTine,
            function ( yoke, valid ) {
            
            if ( !valid )
                return pkErr( yoke,
                    "Called getmac-fork with an invalid get-tine" );
            return pkRet( yoke,
                pk( "getmac-fork", getTine, maybeMacro ) );
        } );
    } );
    defMethod( "fork-to-getmac", "fork" );
    setStrictImpl( "fork-to-getmac", "getmac-fork",
        function ( yoke, args ) {
        
        var fork = listGet( args, 0 );
        return pkRet( yoke, pkList( fork.ind( 0 ), fork.ind( 1 ) ) );
    } );
    
    defTag( "literal-essence", "literal-val" );
    defTag( "main-essence", "name" );
    defFunc( "main-essence", 1, function ( yoke, name ) {
        if ( !isQualifiedName( name ) )
            return pkErr( yoke,
                "Called main-essence with a value that wasn't a " +
                "qualified name" );
        return pkRet( yoke, pk( "main-essence", name ) );
    } );
    defTag( "call-essence", "op", "args" );
    defFunc( "call-essence", 2, function ( yoke, op, args ) {
        if ( !isList( args ) )
            return pkErr( yoke,
                "Called call-essence with a non-list args list" );
        return pkRet( yoke, pk( "call-essence", op, args ) );
    } );
    defTag( "param-essence", "index" );
    defFunc( "param-essence", 1, function ( yoke, index ) {
        if ( !isNat( index ) )
            return pkErr( yoke,
                "Called param-essence with a non-nat index" );
        return pkRet( yoke, pk( "param-essence", index ) );
    } );
    defTag( "fn-essence",
        "captures", "args-dup-count", "body-essence" );
    defFunc( "fn-essence", 3,
        function ( yoke, captures, argsDupCount, bodyEssence ) {
        
        if ( !isList( captures ) )
            return pkErr( yoke,
                "Called fn-essence with a non-list capture list" );
        if ( !isNat( argsDupCount ) )
            return pkErr( yoke,
                "Called fn-essence with a non-nat number of " +
                "parameter duplicates" );
        return pkRet( yoke,
            pk( "fn-essence", captures, argsDupCount, bodyEssence ) );
    } );
    defTag( "essence-for-if", "cond-essence",
        "essences-and-counts", "then-essence", "else-essence" );
    defFunc( "essence-for-if", 4,
        function ( yoke, condEssence,
            essencesAndCounts, thenEssence, elseEssence ) {
        
        // NOTE: The overall structure of a `essence-for-if` is like
        // this:
        //
        // (essence-for-if <condEssence>
        //   <list of (<captureEssence> <thenCount> <elseCount>)>
        //   <thenEssence>
        //   <elseEssence>)
        //
        return listAll( yoke, essencesAndCounts,
            function ( essenceAndCounts ) {
            
            return isList( essenceAndCounts ) &&
                listLenIs( essenceAndCounts, 3 ) &&
                isNat( listGet( essenceAndCounts, 1 ) ) &&
                isNat( listGet( essenceAndCounts, 2 ) );
        }, function ( yoke, valid ) {
            if ( !valid )
                return pkErr( yoke,
                    "Called essence-for-if with an invalid " +
                    "essences-and-counts" );
            if ( thenEssence.isLinear() )
                return pkErr( yoke,
                    "Called essence-for-if with a linear " +
                    "then-essence" );
            if ( elseEssence.isLinear() )
                return pkErr( yoke,
                    "Called essence-for-if with a linear " +
                    "else-essence" );
            return pkRet( yoke,
                pk( "essence-for-if", condEssence,
                    essencesAndCounts, thenEssence, elseEssence ) );
        } );
    } );
    defTag( "let-list-essence",
        "source-essence",
        "captures",
        "numbers-of-dups",
        "body-essence" );
    defFunc( "let-list-essence", 4,
        function ( yoke,
            sourceEssence, captures, numbersOfDups, bodyEssence ) {
        
        if ( !isList( captures ) )
            return pkErr( yoke,
                "Called len-list-essence with a non-list list of " +
                "captures" );
        if ( !isList( numbersOfDups ) )
            return pkErr( yoke,
                "Called len-list-essence with a non-list list of " +
                "numbers of duplicates" );
        return listAll( yoke, numbersOfDups,
            function ( numberOfDups ) {
            
            return isNat( numberOfDups );
        }, function ( yoke, valid ) {
            if ( !valid )
                return pkErr( yoke,
                    "Called len-list-essence with a non-nat number " +
                    "of duplicates" );
            return pkRet( yoke,
                pk( "let-list-essence",
                    sourceEssence,
                    captures,
                    numbersOfDups,
                    bodyEssence ) );
        } );
    } );
    
    // NOTE: We respect linearity in essence-interpret already, but it
    // follows an unusual contract. Usually a function will consume or
    // return all of its linear parameters, but each essence-interpret
    // call consumes only part of the list of captured values. To be
    // consistent in this "consume or return" policy, we take each
    // captured value in the form of a linear-as-nonlinear wrapped
    // value, so it's technically nonlinear and we have the option to
    // ignore it.
    //
    // NOTE: We don't sanity-check for the linear-as-nonlinear
    // wrappers, but we do raise an error if we're about to unwrap and
    // the wrapper isn't there.
    //
    defMethod( "essence-interpret", "self", "list-of-captured-vals" );
    function defEssenceInterpret( tag, body ) {
        setStrictImpl( "essence-interpret", tag,
            function ( yoke, args ) {
            
            var essence = listGet( args, 0 );
            var captures = listGet( args, 1 );
            if ( !isList( listGet( args, 1 ) ) )
                return pkErr( yoke,
                    "Called essence-interpret with a non-list list " +
                    "of captured values" );
            if ( listGet( args, 1 ).isLinear() )
                return pkErr( yoke,
                    "Called essence-interpret with a linear list " +
                    "of captured values" );
            return body( yoke, essence, captures );
        } );
    }
    defEssenceInterpret( "literal-essence",
        function ( yoke, essence, captures ) {
        
        return pkRet( yoke, essence.ind( 0 ) );
    } );
    defEssenceInterpret( "main-essence",
        function ( yoke, essence, captures ) {
        
        // NOTE: This reads definitions. We maintain the metaphor that
        // we work with an immutable snapshot of the definitions, so
        // we may want to refactor this to be closer to that metaphor
        // someday.
        return runRet( yoke,
            yoke.pkRuntime.getVal( essence.ind( 0 ) ) );
    } );
    defEssenceInterpret( "call-essence",
        function ( yoke, essence, captures ) {
        
        return runWaitTry( yoke, function ( yoke ) {
            return callMethod( yoke, "essence-interpret",
                pkList( essence.ind( 0 ), captures ) );
        }, function ( yoke, op ) {
            return listMap( yoke, essence.ind( 1 ),
                function ( yoke, essence ) {
                
                return callMethod( yoke, "essence-interpret",
                    pkList( essence, captures ) );
            }, function ( yoke, args ) {
                return callMethod( yoke, "call", pkList( op, args ) );
            } );
        } );
    } );
    defEssenceInterpret( "param-essence",
        function ( yoke, essence, captures ) {
        
        return listGetNat( yoke, captures, essence.ind( 0 ),
            function ( yoke, maybeNonlinearValue ) {
            
            if ( maybeNonlinearValue.tag !== "yep" )
                return pkErr( yoke,
                    "Tried to interpret a param-essence that fell " +
                    "off the end of the list of captured values" );
            var nonlinearValue = maybeNonlinearValue.ind( 0 );
            if ( nonlinearValue.tag !== "linear-as-nonlinear" )
                return pkErr( yoke,
                    "Tried to interpret a param-essence, but the " +
                    "captured value turned out not to be wrapped " +
                    "up as a linear-as-nonlinear value" );
            var value = nonlinearValue.ind( 0 );
            return pkRet( yoke, value );
        } );
    } );
    defEssenceInterpret( "fn-essence",
        function ( yoke, essence, nonlocalCaptures ) {
        
        return listMap( yoke, nonlocalCaptures,
            function ( yoke, nonlocalCapture ) {
            
            if ( nonlocalCapture.tag !== "linear-as-nonlinear" )
                return pkErr( yoke,
                    "Tried to interpret a fn-essence, but one of " +
                    "the captured values turned out not to be " +
                    "wrapped up as a linear-as-nonlinear value" );
            return pkRet( yoke, nonlocalCapture.ind( 0 ) );
        }, function ( yoke, nonlocalCaptures ) {
        return listLen( yoke, nonlocalCaptures,
            function ( yoke, numNlcs ) {
        return getGs( yoke, startGensymIndex(),
            function ( yoke, gsi, nlcsVar ) {
        return compileListToVars( yoke, gsi,
            { revStatements: null, resultVar: nlcsVar },
            numNlcs,
            function ( yoke, gsi, nlcRevStatements, nlcVars, valid ) {
            
            if ( !valid.ok )
                return then( yoke, null, valid );
        
        return compileEssence( yoke, gsi, nlcVars, essence,
            function ( yoke, gsi, compiled ) {
            
            if ( !compiled.ok )
                return then( yoke, null, compiled );
        
        return jsListAppend( yoke,
            compiled.val.revStatements,
            nlcRevStatements,
            function ( yoke, revStatements ) {
        return compiledLinkedListToString( yoke, {
            revStatements: revStatements,
            resultVar: compiled.val.resultVar
        }, function ( yoke, code ) {
        
        return Function( "yoke", nlcsVar, "cch", "then",
            // TODO: This first commented-out line may help when
            // debugging compiled code, but it uses the hackish
            // Pk#toString(). See if we should make it a debug option
            // or something.
//            "// " + essence + "\n" +
//            "// @sourceURL=" + Math.random() + "\n" +
//            "debugger;\n" +
            compiledCodeHelperInit + "\n" +
            "\n" +
            code
        )( yoke, nonlocalCaptures, compiledCodeHelper,
            function ( yoke, result ) {
                return pkRet( yoke, result );
            }
        );
        
        } );
        } );
        
        } );
        
        } );
        } );
        } );
        } );
        
        
        // TODO: Test Penknife with various AOT compilers:
        //
        // - No compiler at all. (This is what we're using now in
        //   demos/penknife.html.)
        //
        // - A compiled file that bypasses the read phase.
        //
        // - A compiled file that bypasses the macroexpansion phase.
        //   (This doesn't seem to help at all. The file size gets
        //   larger and execution slower than with the full compiler.
        //   The attempt is currently available in the form of
        //   commented-out code labeled "INTERPRET NOTE".)
        //
        // - A compiled file that uses no interpreter, just compiled
        //   code. (This is what we're using now in
        //   demos/penknife-compiled.html.)
        
        // NOTE: The above code makes every function expression invoke
        // the compiler. The below code would make functions interpret
        // their bodies each time they're called. Penknife was using
        // this interpretation style until recently, when the compiled
        // output finally reached a speed competitive with the
        // interpreter. (Both options have about the same overall
        // speed for the demo. The compiler's at least useful for
        // ahead-of-time compilation, whether or not we continue to
        // use it for this.)
        //
        // TODO: Right now this is dead code. Either comment it out
        // entirely, or put it under some kind of debug option.
        
        var captures = essence.ind( 0 );
        var argsDupCount = essence.ind( 1 );
        var bodyEssence = essence.ind( 2 );
        return listMap( yoke, captures, function ( yoke, capture ) {
            return callMethod( yoke, "essence-interpret",
                pkList( capture, nonlocalCaptures ) );
        }, function ( yoke, captures ) {
            return pkRet( yoke, pkfnLinear(
                pkCons( bodyEssence, captures ),
                function ( yoke, bodyEssenceAndCaptures, args ) {
                
                var bodyEssence = bodyEssenceAndCaptures.ind( 0 );
                var captures = bodyEssenceAndCaptures.ind( 1 );
                
                return pkDup( yoke, args, argsDupCount,
                    function ( yoke, argsDuplicates ) {
                    
                    return listAppend( yoke, captures, argsDuplicates,
                        function ( yoke, captures ) {
                        
                        return listMap( yoke, captures,
                            function ( yoke, capture ) {
                            
                            return pkRet( yoke,
                                pkLinearAsNonlinear( capture ) );
                        }, function ( yoke, captures ) {
                            
                            return callMethod( yoke,
                                "essence-interpret",
                                pkList( bodyEssence, captures ) );
                        } );
                    } );
                } );
            } ) );
        } );
    } );
    defEssenceInterpret( "essence-for-if",
        function ( yoke, essence, outerCaptures ) {
        
        var condEssence = essence.ind( 0 );
        var essencesAndCounts = essence.ind( 1 );
        var thenEssence = essence.ind( 2 );
        var elseEssence = essence.ind( 3 );
        return runWaitTry( yoke, function ( yoke ) {
            return callMethod( yoke, "essence-interpret",
                pkList( condEssence, outerCaptures ) );
        }, function ( yoke, condValue ) {
            // TODO: See if there's a better way for us to respect
            // linearity here. Maybe we should explicitly drop
            // condValue. One graceful option would be to bind a
            // variable to the condition value so there's still
            // exactly one reference to it, but that would complicate
            // this code (not to mention breaking its symmetry).
            if ( condValue.isLinear() )
                return pkErr( yoke,
                    "Used essence-for-if to branch on a condition " +
                    "that was linear" );
            if ( condValue.tag !== "nil" ) {
                var branchEssence = thenEssence;
                var getCount = function ( essenceAndCounts ) {
                    return listGet( essenceAndCounts, 1 );
                };
            } else {
                var branchEssence = elseEssence;
                var getCount = function ( essenceAndCounts ) {
                    return listGet( essenceAndCounts, 2 );
                };
            }
            return listMap( yoke, essencesAndCounts,
                function ( yoke, essenceAndCounts ) {
                
                var essence = listGet( essenceAndCounts, 0 );
                var count = getCount( essenceAndCounts );
                return runWaitTry( yoke, function ( yoke ) {
                    return callMethod( yoke, "essence-interpret",
                        pkList( essence, outerCaptures ) );
                }, function ( yoke, value ) {
                    return pkRet( yoke, pkList( value, count ) );
                } );
            }, function ( yoke, valuesAndCounts ) {
                return listMappend( yoke, valuesAndCounts,
                    function ( yoke, valueAndCount ) {
                    
                    var value = listGet( valueAndCount, 0 );
                    var count = listGet( valueAndCount, 1 );
                    return pkDup( yoke, value, count,
                        function ( yoke, values ) {
                        
                        return pkRet( yoke, values );
                    } );
                }, function ( yoke, innerCaptures ) {
                    return listMap( yoke, innerCaptures,
                        function ( yoke, innerCapture ) {
                        
                        return pkRet( yoke,
                            pkLinearAsNonlinear( innerCapture ) );
                    }, function ( yoke, wrappedInnerCaptures ) {
                        return callMethod( yoke, "essence-interpret",
                            pkList(
                                branchEssence,
                                wrappedInnerCaptures ) );
                    } );
                } );
            } );
        } );
    } );
    defEssenceInterpret( "let-list-essence",
        function ( yoke, essence, outerCaptures ) {
        
        var sourceEssence = essence.ind( 0 );
        var captureEssences = essence.ind( 1 );
        var numbersOfDups = essence.ind( 2 );
        var bodyEssence = essence.ind( 3 );
        return runWaitTry( yoke, function ( yoke ) {
            return callMethod( yoke, "essence-interpret",
                pkList( sourceEssence, outerCaptures ) );
        }, function ( yoke, sourceValue ) {
        return pkAssertLetList( yoke, sourceValue, numbersOfDups,
            function ( yoke, ignored ) {
        return listMap( yoke, captureEssences,
            function ( yoke, essence ) {
            
            return callMethod( yoke, "essence-interpret",
                pkList( essence, outerCaptures ) );
        }, function ( yoke, evaluatedOuterCaptures ) {
        return listMapTwo( yoke, sourceValue, numbersOfDups,
            function ( yoke, sourceElem, numberOfDups ) {
            
            return pkDup( yoke, sourceElem, numberOfDups,
                function ( yoke, elemDups ) {
                
                return pkRet( yoke, elemDups );
            } );
        }, function ( yoke, dupsPerElem ) {
        return listFlattenOnce( yoke, dupsPerElem,
            function ( yoke, dups ) {
        
        return listAppend( yoke, evaluatedOuterCaptures, dups,
            function ( yoke, innerCaptures ) {
        return listMap( yoke, innerCaptures,
            function ( yoke, capture ) {
            
            return pkRet( yoke, pkLinearAsNonlinear( capture ) );
        }, function ( yoke, innerCaptures ) {
            
            return callMethod( yoke, "essence-interpret",
                pkList( bodyEssence, innerCaptures ) );
        } );
        } );
        
        } );
        } );
        } );
        } );
        } );
    } );
    
    defMethod( "macroexpand-to-fork",
        "self", "get-fork", "gensym-base" );
    function defMacroexpandToFork( tag, body ) {
        setStrictImpl( "macroexpand-to-fork", tag,
            function ( yoke, args ) {
            
            var expr = listGet( args, 0 );
            var getFork = listGet( args, 1 );
            var gensymBase = listGet( args, 2 );
            if ( getFork.isLinear() )
                return pkErr( yoke,
                    "Called macroexpand-to-fork with a linear " +
                    "get-fork" );
            if ( !isUnqualifiedName( gensymBase ) )
                return pkErr( yoke,
                    "Called macroexpand-to-fork with a gensym base " +
                    "that wasn't an unqualified name" );
            return body( yoke, expr, getFork, gensymBase );
        } );
    }
    arrEach( [
        // TODO: Manage this list of names elsewhere.
        
        // Almost a name
        "string",
        
        // Actually names
        "string-name",
        "pair-name",
        "qualified-name"
    ], function ( nameTag ) {
        defMacroexpandToFork( nameTag,
            function ( yoke, expr, getFork, gensymBase ) {
            
            return runWaitOne( yoke, function ( yoke ) {
                return callMethod( yoke, "call",
                    pkList( getFork, pkList( expr ) ) );
            } );
        } );
    } );
    defMacroexpandToFork( "cons",
        function ( yoke, expr, getFork, gensymBase ) {
        
        return runWaitTry( yoke, function ( yoke ) {
            return callMethod( yoke, "macroexpand-to-fork",
                pkList( expr.ind( 0 ), getFork, gensymBase ) );
        }, function ( yoke, opFork ) {
            if ( opFork.isLinear() )
                return pkErr( yoke,
                    "Got a linear fork for the operator when doing " +
                    "macroexpand-to-fork for a cons" );
            return runWaitTryGetmacFork( yoke, "macroexpand-to-fork",
                function ( yoke ) {
                
                return pkRet( yoke, opFork );
            }, function ( yoke, getTine, maybeMacro ) {
                var macroexpander = maybeMacro.tag === "yep" ?
                    maybeMacro.ind( 0 ) : nonMacroMacroexpander;
                return callMethod( yoke, "call", pkList(
                    macroexpander,
                    pkList(
                        opFork, expr.ind( 1 ), getFork, gensymBase )
                ) );
            } );
        } );
    } );
    
    defMacro( "fn",
        function ( yoke, fork, body, nonlocalGetFork, gensymBase ) {
        
        if ( !listLenIs( body, 2 ) )
            return pkErrLen( yoke, body, "Expanded fn" );
        
        return toUnqualifiedName( yoke, listGet( body, 0 ),
            function ( yoke, paramName ) {
        
        function isParamName( name ) {
            return paramName.special.unqualifiedNameJson ===
                name.special.unqualifiedNameJson;
        }
        
        return pkDrop( yoke, fork, function ( yoke ) {
        
        return runWaitTryGetmacFork( yoke, "macroexpand-to-fork",
            function ( yoke ) {
            
            return callMethod( yoke, "macroexpand-to-fork", pkList(
                listGet( body, 1 ),
                deriveGetFork( nonlocalGetFork,
                    function ( yoke, name, then ) {
                    
                    return then( yoke, isParamName( name ) );
                } ),
                gensymBase
            ) );
        }, function ( yoke, bodyGetTine, maybeMacro ) {
        
        var bodyNames = listGet( bodyGetTine, 0 );
        return listKeep( yoke, bodyNames, function ( name ) {
            return !isParamName( name );
        }, function ( yoke, fnNames ) {
        return listLen( yoke, fnNames, function ( yoke, numFnNames ) {
        return listCount( yoke, bodyNames, function ( name ) {
            return isParamName( name );
        }, function ( yoke, numArgDups ) {
        
        return pkRet( yoke, pk( "getmac-fork",
            pkGetTine( fnNames, function ( yoke, fnInEssences ) {
                return listFoldl( yoke,
                    pkList( pkNil, pkNil, numFnNames ),
                    bodyNames,
                    function ( yoke, frame, outerName ) {
                    
                    var revBodyInEssences = listGet( frame, 0 );
                    var captureI = listGet( frame, 1 );
                    var paramI = listGet( frame, 2 );
                    
                    if ( isParamName( outerName ) )
                        return pkRet( yoke, pkList(
                            pkCons( pk( "param-essence", paramI ),
                                revBodyInEssences ),
                            captureI,
                            pk( "succ", paramI )
                        ) );
                    else
                        return pkRet( yoke, pkList(
                            pkCons( pk( "param-essence", captureI ),
                                revBodyInEssences ),
                            pk( "succ", captureI ),
                            paramI
                        ) );
                }, function ( yoke, frame ) {
                
                return listRev( yoke, listGet( frame, 0 ),
                    function ( yoke, bodyInEssences ) {
                
                return runWaitTry( yoke, function ( yoke ) {
                    return callMethod( yoke, "call", pkList(
                        listGet( bodyGetTine, 1 ),
                        pkList( bodyInEssences )
                    ) );
                }, function ( yoke, bodyEssence ) {
                    return pkRet( yoke,
                        pk( "fn-essence",
                            fnInEssences, numArgDups, bodyEssence ) );
                } );
                
                } );
                
                } );
            } ),
            pkNil
        ) );
        
        } );
        } );
        } );
        
        } );
        
        } );
        
        } );
    } );
    
    defMacro( "quote",
        function ( yoke, fork, body, getFork, gensymBase ) {
        
        if ( !listLenIs( body, 1 ) )
            return pkErrLen( yoke, body, "Expanded quote" );
        return pkDrop( yoke, fork, function ( yoke ) {
            return pkRet( yoke, pk( "getmac-fork",
                pkGetTineLinear( pkNil,
                    pkList( pkYep( listGet( body, 0 ) ) ),
                    function ( yoke, captures, essences ) {
                    
                    return pkRet( yoke,
                        pk( "literal-essence",
                            listGet( captures, 0 ).ind( 0 ) ) );
                } ),
                pkNil
            ) );
        } );
    } );
    defMacro( "qname",
        function ( yoke, fork, body, getFork, gensymBase ) {
        
        if ( !listLenIs( body, 1 ) )
            return pkErrLen( yoke, body, "Expanded qname" );
        
        return toUnqualifiedName( yoke, listGet( body, 0 ),
            function ( yoke, name ) {
        return runWaitTry( yoke, function ( yoke ) {
            return runRet( yoke, yoke.pkRuntime.qualifyName( name ) );
        }, function ( yoke, name ) {
        return pkDrop( yoke, fork, function ( yoke ) {
        
        return pkRet( yoke, pk( "getmac-fork",
            pkGetTine( pkNil, function ( yoke, essences ) {
                return pkRet( yoke,
                    pk( "literal-essence", name ) );
            } ),
            pkNil
        ) );
        
        } );
        } );
        } );
    } );
    defMacro( "uqname",
        function ( yoke, fork, body, getFork, gensymBase ) {
        
        if ( !listLenIs( body, 1 ) )
            return pkErrLen( yoke, body, "Expanded uqname" );
        
        return toUnqualifiedName( yoke, listGet( body, 0 ),
            function ( yoke, name ) {
        return pkDrop( yoke, fork, function ( yoke ) {
        
        return pkRet( yoke, pk( "getmac-fork",
            pkGetTine( pkNil, function ( yoke, essences ) {
                return pkRet( yoke,
                    pk( "literal-essence", name ) );
            } ),
            pkNil
        ) );
        
        } );
        } );
    } );
    
    defMacro( "if",
        function ( yoke, fork, body, getFork, gensymBase ) {
        
        if ( !listLenIs( body, 3 ) )
            return pkErrLen( yoke, body, "Expanded if" );
        var condExpr = listGet( body, 0 );
        var thenExpr = listGet( body, 1 );
        var elseExpr = listGet( body, 2 );
        
        return pkDrop( yoke, fork, function ( yoke ) {
        
        function tryGetFork( yoke, expr, then ) {
            return runWaitTryGetmacFork( yoke, "macroexpand-to-fork",
                function ( yoke ) {
                
                return callMethod( yoke, "macroexpand-to-fork",
                    pkList( expr, getFork, gensymBase ) );
            }, function ( yoke, getTine, maybeMacro ) {
                return then( yoke, getTine, listGet( getTine, 0 ) );
            } );
        }
        return tryGetFork( yoke, condExpr,
            function ( yoke, condGetTine, condCaptures ) {
        return tryGetFork( yoke, thenExpr,
            function ( yoke, thenGetTine, thenCaptures ) {
        return tryGetFork( yoke, elseExpr,
            function ( yoke, elseGetTine, elseCaptures ) {
        
        // Detect the variables captured in both branches, deduplicate
        // them, and use that deduplicated list as a capture list for
        // the conditional expression itself. This is important for
        // handling linear values; we already duplicate a value
        // whenever it's passed in as a function parameter, and now
        // we'll also duplicate a value whenever a conditional branch
        // is taken.
        //
        // NOTE: When a Penknife programmer makes their own
        // conditional syntaxes based on higher-order techniques, they
        // should *not* pass in multiple functions, one for each
        // branch. This technique would cause the lexically captured
        // values to be duplicated for all the branches and then
        // dropped for each branch that's unused. If the programmer
        // instead passes in a single function of the form
        // (fn ... (if ...)), this unnecessary duplication and
        // dropping will be avoided, thus accommodating linear values
        // which prohibit these operations.
        
        return listAppend( yoke, thenCaptures, elseCaptures,
            function ( yoke, branchCaptures ) {
        
        return listFoldlJsAsync( yoke,
            { bcDedupMap: strMap(), revBcDedup: pkNil },
            branchCaptures,
            function ( yoke, state, pkName, then ) {
            
            var jsName = pkName.special.unqualifiedNameJson;
            var entry = state.bcDedupMap.get( jsName );
            if ( entry !== void 0 )
                return then( yoke, state );
            return then( yoke, {
                bcDedupMap:
                    state.bcDedupMap.plusEntry( jsName, true ),
                revBcDedup: pkCons( pkName, state.revBcDedup )
            } );
        }, function ( yoke, bcDedupState ) {
        return listRev( yoke, bcDedupState.revBcDedup,
            function ( yoke, bcDedup ) {
        
        function fulfill( getTine, then ) {
            return makeSubEssenceUnderMappendedArgs( yoke,
                getTine, null, gensymBase, bcDedup,
                function ( yoke, captures, dupsList, outEssence ) {
                
                if ( !listLenIs( captures, 0 ) )
                    throw new Error();
                return then( yoke, dupsList, outEssence );
            } );
        }
        
        return fulfill( thenGetTine,
            function ( yoke, thenDupsList, thenOutEssence ) {
        
        if ( thenOutEssence.isLinear() )
            return pkErr( yoke,
                "Got a linear then-essence for essence-for-if " +
                "during if's macroexpander" );
        
        return fulfill( elseGetTine,
            function ( yoke, elseDupsList, elseOutEssence ) {
        
        if ( thenOutEssence.isLinear() )
            return pkErr( yoke,
                "Got a linear else-essence for essence-for-if " +
                "during if's macroexpander" );
        
        return listAppend( yoke, condCaptures, bcDedup,
            function ( yoke, outerCaptures ) {
        return pkRet( yoke, pk( "getmac-fork",
            pkGetTine( outerCaptures,
                function ( yoke, outerEssences ) {
                
                return fulfillGetTine( yoke,
                    condGetTine, outerEssences,
                    function ( yoke, condEssence, outerEssences ) {
                    
                    return listMapMulti( yoke, pkList(
                        outerEssences,
                        thenDupsList,
                        elseDupsList
                    ), function ( yoke, elems ) {
                        return pkRet( yoke, elems );
                    }, function ( yoke, outerEssencesAndCounts ) {
                        return pkRet( yoke, pk( "essence-for-if",
                            condEssence,
                            outerEssencesAndCounts,
                            thenOutEssence,
                            elseOutEssence
                        ) );
                    } );
                } );
            } ),
            pkNil
        ) );
        } );
        
        } );
        
        } );
        
        } );
        } );
        
        } );
        
        } );
        } );
        } );
        
        } );
    } );
    
    // NOTE: The `let-list` macro is a destructuring let that raises
    // an error if it doesn't match. By doing this, it doesn't need to
    // use condition-guarded aliasing like the `if` macro does.
    defMacro( "let-list",
        function ( yoke, fork, body, nonlocalGetFork, gensymBase ) {
        
        if ( !listLenIs( body, 3 ) )
            return pkErrLen( yoke, body, "Expanded let-list" );
        var varNames = listGet( body, 0 );
        var sourceExpr = listGet( body, 1 );
        var bodyExpr = listGet( body, 2 );
        
        if ( !isList( varNames ) )
            return pkErr( yoke,
                "Expanded let-list with a non-list list of element " +
                "variables" );
        
        return listMap( yoke, varNames, function ( yoke, varName ) {
            return toUnqualifiedName( yoke, varName,
                function ( yoke, name ) {
                
                return pkRet( yoke, name );
            } );
        }, function ( yoke, varNames ) {
        return pkDrop( yoke, fork, function ( yoke ) {
        return runWaitTryGetmacFork( yoke, "macroexpand-to-fork",
            function ( yoke ) {
            
            return callMethod( yoke, "macroexpand-to-fork",
                pkList( sourceExpr, nonlocalGetFork, gensymBase ) );
        }, function ( yoke, sourceGetTine, maybeMacro ) {
        
        var sourceCaptures = listGet( sourceGetTine, 0 );
        
        return makeSubEssenceUnderMappendedArgs( yoke,
            bodyExpr, nonlocalGetFork, gensymBase, varNames,
            function ( yoke,
                bodyCaptures, bodyDupsList, bodyEssence ) {
        
        return listAppend( yoke, sourceCaptures, bodyCaptures,
            function ( yoke, outerCaptures ) {
        return pkRet( yoke, pk( "getmac-fork",
            pkGetTineLinear( outerCaptures, pkList(
                pkYep( sourceGetTine )
            ), function ( yoke, captures, outerEssences ) {
                var sourceGetTine = listGet( captures, 0 ).ind( 0 );
                
                return fulfillGetTine( yoke,
                    sourceGetTine, outerEssences,
                    function ( yoke, sourceEssence, outerEssences ) {
                    
                    var bodyCaptureEssences = outerEssences;
                    
                    return pkRet( yoke,
                        pk( "let-list-essence",
                            sourceEssence,
                            bodyCaptureEssences,
                            bodyDupsList,
                            bodyEssence ) );
                } );
            } ),
            pkNil
        ) );
        } );
        
        } );
        
        } );
        } );
        } );
    } );
    
    // This takes an explicit input and installs it as the implicit
    // yoke. It also takes the old implicit yoke and returns it as the
    // explicit output.
    defFunc( "yoke-trade", 1, function ( yoke, newYokeRider ) {
        var newYoke = yokeWithRider( yoke, newYokeRider );
        return pkRet( newYoke, yoke.yokeRider );
    } );
    
    defFunc( "defval", 2, function ( yoke, name, val ) {
        if ( !isQualifiedName( name ) )
            return pkErr( yoke,
                "Called defval with a value that wasn't a " +
                "qualified name" );
        if ( val.isLinear() )
            return pkErr( yoke, "Called defval with a linear value" );
        return hasDefinerToken( yoke, function ( yoke, canDefine ) {
            if ( !canDefine )
                return pkErr( yoke,
                    "Called defval without access to top-level " +
                    "definition side effects" );
            return yoke.pkRuntime.enqueueDef_( yoke, function () {
                return yoke.pkRuntime.defVal( name, val );
            } );
        } );
    } );
    defFunc( "defmacro", 2, function ( yoke, name, macro ) {
        if ( !isQualifiedName( name ) )
            return pkErr( yoke,
                "Called defmacro with a value that wasn't a " +
                "qualified name" );
        if ( macro.isLinear() )
            return pkErr( yoke,
                "Called defmacro with a linear macro" );
        return hasDefinerToken( yoke, function ( yoke, canDefine ) {
            if ( !canDefine )
                return pkErr( yoke,
                    "Called defmacro without access to top-level " +
                    "definition side effects" );
            return yoke.pkRuntime.enqueueDef_( yoke, function () {
                return yoke.pkRuntime.defMacro( name, macro );
            } );
        } );
    } );
    defFunc( "deftag", 2, function ( yoke, name, argNames ) {
        if ( !isQualifiedName( name ) )
            return pkErr( yoke,
                "Called deftag with a value that wasn't a " +
                "qualified name" );
        if ( !isList( argNames ) )
            return pkErr( yoke,
                "Called deftag with a non-list list of argument " +
                "names" );
        return listAll( yoke, argNames, function ( argName ) {
            return isUnqualifiedName( argName );
        }, function ( yoke, valid ) {
            if ( !valid )
                return pkErr( yoke,
                    "Called deftag with an argument name that " +
                    "wasn't an unqualified name" );
            if ( keys.isLinear() )
                return pkErr( yoke,
                    "Called deftag with a linear args list" );
            return hasDefinerToken( yoke,
                function ( yoke, canDefine ) {
                
                if ( !canDefine )
                    return pkErr( yoke,
                        "Called deftag without access to top-level " +
                        "definition side effects" );
                return yoke.pkRuntime.enqueueDef_( yoke, function () {
                    return yoke.pkRuntime.defTag( name, argNames );
                } );
            } );
        } );
    } );
    defFunc( "defmethod", 2, function ( yoke, name, argNames ) {
        if ( !isQualifiedName( name ) )
            return pkErr( yoke,
                "Called defmethod with a value that wasn't a " +
                "qualified name" );
        if ( !isList( argNames ) )
            return pkErr( yoke,
                "Called defmethod with a non-list list of argument " +
                "names" );
        return listAll( yoke, argNames, function ( argName ) {
            return isUnqualifiedName( argName );
        }, function ( yoke, valid ) {
            if ( !valid )
                return pkErr( yoke,
                    "Called defmethod with an argument name that " +
                    "wasn't an unqualified name" );
            if ( argNames.isLinear() )
                return pkErr( yoke,
                    "Called defmethod with a linear args list" );
            return hasDefinerToken( yoke,
                function ( yoke, canDefine ) {
                
                if ( !canDefine )
                    return pkErr( yoke,
                        "Called defmethod without access to " +
                        "top-level definition side effects" );
                return yoke.pkRuntime.enqueueDef_( yoke, function () {
                    return yoke.pkRuntime.defMethod( name, argNames );
                } );
            } );
        } );
    } );
    defFunc( "set-impl", 3,
        function ( yoke, methodName, tagName, impl ) {
        
        if ( !isQualifiedName( methodName ) )
            return pkErr( yoke,
                "Called set-impl with a method name that wasn't a " +
                "qualified name" );
        if ( !isQualifiedName( tagName ) )
            return pkErr( yoke,
                "Called set-impl with a tag name that wasn't a " +
                "qualified name" );
        if ( impl.isLinear() )
            return pkErr( yoke,
                "Called set-impl with a linear function" );
        return hasDefinerToken( yoke, function ( yoke, canDefine ) {
            if ( !canDefine )
                return pkErr( yoke,
                    "Called set-impl without access to top-level " +
                    "definition side effects" );
            return yoke.pkRuntime.enqueueDef_( yoke, function () {
                return yoke.pkRuntime.setImpl( methodName, tagName,
                    function ( yoke, args ) {
                        return callMethod( yoke, "call",
                            pkList( impl, args ) );
                    } );
            } );
        } );
    } );
    
    defFunc( "raise", 1, function ( yoke, error ) {
        return runRet( yoke, pk( "nope", error ) );
    } );
    
    defFunc( "unwrap", 1, function ( yoke, wrapped ) {
        return pkUnwrap( yoke, wrapped, function ( yoke, unwrapped ) {
            return pkRet( yoke, unwrapped );
        } );
    } );
    
    // TODO: See if this utility should be at the top level.
    function isComparableToken( x ) {
        return x.tag === "token" && x.special.jsPayload.comparable;
    }
    
    // We support mutable boxes by way of these operations:
    //
    // - Create a new environment for manipulating a world of mutable
    //   boxes, call a function, and invalidate that environment once
    //   the function has completed.
    // - Create a fresh mutable box in a valid environment.
    // - Compare two mutable boxes in a single valid environment.
    //   (This is important for graph algorithms.)
    // - Write to a mutable box in a valid environment.
    // - Read from a mutable box in a valid environment.
    // - TODO: Add coroutine operations to this list.
    //
    defFunc( "call-with-mbox-env", 1, function ( yoke, body ) {
        var mboxEnvContents;
        var mboxEnv = pkToken( mboxEnvContents = {
            stringRep: "env",
            comparable: false,
            isMutableBox: false,
            mutableBoxState: pkNil,
            mutableBoxEnvironment: dummyMutableEnvironment,
            isValidMutableEnvironment: true,
            canDefine: false,
            canYield: false,
            coroutineNext: null
        } );
        return runWait( yoke, function ( yoke ) {
            return callMethod( yoke, "call",
                pkList( body, pkList( mboxEnv ) ) );
        }, function ( yoke, result ) {
            // NOTE: We invalidate the environment even if there's an
            // error.
            // TODO: Test this to make sure we can't obtain a
            // top-level reference to a valid mutable environment by
            // using an error.
            mboxEnvContents.isValidMutableEnvironment = false;
            return runRet( yoke, result );
        } );
    } );
    defFunc( "mbox-new", 2, function ( yoke, mboxEnv, initState ) {
        if ( mboxEnv.tag !== "token" )
            return pkErr( yoke,
                "Called mbox-new with a non-token environment" );
        if ( initState.isLinear() )
            return pkErr( yoke,
                "Called mbox-new with a linear assigned value" );
        if ( !mboxEnv.special.jsPayload.isValidMutableEnvironment )
            return pkErr( yoke,
                "Called mbox-new with an invalid environment" );
        return pkRet( yoke, pkToken( {
            stringRep: "mbox",
            comparable: false,
            isMutableBox: true,
            mutableBoxState: initState,
            mutableBoxEnvironment: mboxEnv,
            isValidMutableEnvironment: false,
            canDefine: false,
            canYield: false,
            coroutineNext: null
        } ) );
    } );
    defFunc( "mbox-eq", 3, function ( yoke, mboxEnv, mboxA, mboxB ) {
        if ( mboxEnv.tag !== "token" )
            return pkErr( yoke,
                "Called mbox-eq with a non-token environment" );
        if ( !(mboxA.tag === "token" && mboxB.tag === "token") )
            return pkErr( yoke,
                "Called mbox-eq with a non-token box" );
        if ( !mboxEnv.special.jsPayload.isValidMutableEnvironment )
            return pkErr( yoke,
                "Called mbox-eq with an invalid environment" );
        if ( !(true
            && mboxA.special.jsPayload.isMutableBox
            && mboxB.special.jsPayload.isMutableBox
        ) )
            return pkErr( yoke,
                "Called mbox-eq with a non-box token" );
        if ( !(true
            && tokenEq( mboxEnv,
                mboxA.special.jsPayload.mutableBoxEnvironment )
            && tokenEq( mboxEnv,
                mboxB.special.jsPayload.mutableBoxEnvironment )
        ) )
            return pkErr( yoke,
                "Called mbox-eq with an incorrect environment" );
        return pkRet( yoke, pkBoolean( tokenEq( mboxA, mboxB ) ) );
    } );
    defFunc( "mbox-get", 2, function ( yoke, mboxEnv, mbox ) {
        if ( mboxEnv.tag !== "token" )
            return pkErr( yoke,
                "Called mbox-get with a non-token environment" );
        if ( mbox.tag !== "token" )
            return pkErr( yoke,
                "Called mbox-get with a non-token box" );
        if ( !mboxEnv.special.jsPayload.isValidMutableEnvironment )
            return pkErr( yoke,
                "Called mbox-get with an invalid environment" );
        if ( !mbox.special.jsPayload.isMutableBox )
            return pkErr( yoke,
                "Called mbox-get with a non-box token" );
        if ( !tokenEq( mboxEnv,
            mbox.special.jsPayload.mutableBoxEnvironment ) )
            return pkErr( yoke,
                "Called mbox-get with an incorrect environment" );
        return pkRet( yoke, mbox.special.jsPayload.mutableBoxState );
    } );
    defFunc( "mbox-set", 3,
        function ( yoke, mboxEnv, mbox, newState ) {
        
        if ( mboxEnv.tag !== "token" )
            return pkErr( yoke,
                "Called mbox-set with a non-token environment" );
        if ( mbox.tag !== "token" )
            return pkErr( yoke,
                "Called mbox-set with a non-token box" );
        if ( newState.isLinear() )
            return pkErr( yoke,
                "Called mbox-set with a linear assigned value" );
        if ( !mboxEnv.special.jsPayload.isValidMutableEnvironment )
            return pkErr( yoke,
                "Called mbox-set with an invalid environment" );
        if ( !mbox.special.jsPayload.isMutableBox )
            return pkErr( yoke,
                "Called mbox-get with a non-box token" );
        if ( !tokenEq( mboxEnv,
            mbox.special.jsPayload.mutableBoxEnvironment ) )
            return pkErr( yoke,
                "Called mbox-set with an incorrect environment" );
        mbox.special.jsPayload.mutableBoxState = newState;
        return pkRet( yoke, pkNil );
    } );
    // TODO: Test `coroutine-new`, `yield-into`, and `yield-out`. If
    // they work, reimplement mutable boxes operations in terms of
    // them, and see if the speed is comparable. If speed is an issue,
    // it's acceptable to have both coroutines and mutable boxes.
    defFunc( "coroutine-new", 2, function ( yoke, mboxEnv, body ) {
        if ( mboxEnv.tag !== "token" )
            return pkErr( yoke,
                "Called coroutine-new with a non-token environment" );
        if ( body.isLinear() )
            return pkErr( yoke,
                "Called coroutine-new with a linear implementation" );
        if ( !mboxEnv.special.jsPayload.isValidMutableEnvironment )
            return pkErr( yoke,
                "Called mbox-new with an invalid environment" );
        var yielderTokenContents;
        var yielderToken = pkToken( yielderTokenContents = {
            stringRep: "mbox",
            comparable: false,
            isMutableBox: false,
            mutableBoxState: pkNil,
            mutableBoxEnvironment: mboxEnv,
            isValidMutableEnvironment: false,
            canDefine: false,
            canYield: true,
            coroutineNext: null
        } );
        var coroutineContents;
        return pkRet( yoke, pkToken( coroutineContents = {
            stringRep: "mbox",
            comparable: false,
            isMutableBox: false,
            mutableBoxState: pkNil,
            mutableBoxEnvironment: mboxEnv,
            isValidMutableEnvironment: false,
            canDefine: false,
            canYield: false,
            coroutineNext: function ( yoke, input ) {
                if ( input.isLinear() )
                    return pkErr( yoke,
                        "Yielded to a coroutine with a linear value"
                        );
                var clientYokeRider = yoke.yokeRider;
                var coroutineYoke =
                    yokeWithRider( yoke, pk( "pure-yoke" ) );
                
                // Prevent resuming the coroutine while it's running.
                coroutineContents.coroutineNext = null;
                
                return coroutineYoke.runWaitLinear(
                    function ( coroutineYoke ) {
                    
                    return callMethod( coroutineYoke, "call",
                        pkList(
                            body, pkList( yielderToken, input ) ) );
                }, function ( yokeAndResult ) {
                    return go( clientYokeRider, yokeAndResult );
                } );
                function go( clientYokeRider, yokeAndResult ) {
                    // NOTE: We invalidate the yielder even if there's
                    // an error.
                    // TODO: Test this to make sure we can't obtain a
                    // top-level reference to a valid yielder token by
                    // using an error.
                    yielderToken.special.jsPayload.canYield = false;
                    var clientYoke = yokeWithRider(
                        yokeAndResult.yoke, coroutineYokeRider );
                    if ( yokeAndResult.type === "yield" ) {
                        if ( yokeAndResult.out.isLinear() )
                            return pkErr( clientYoke,
                                "Yielded from a coroutine with a " +
                                "linear value" );
                        var coroutineYokeRider =
                            yokeAndResult.yoke.yokeRider;
                        var coroutineThen = yokeAndResult.then;
                        coroutineContents.coroutineNext =
                            function ( yoke, input ) {
                            
                            var clientYokeRider = yoke.yokeRider;
                            var coroutineYoke = yokeWithRider(
                                yoke, coroutineYokeRider );
                            yielderToken.special.jsPayload.canYield =
                                true;
                            
                            // Prevent resuming the coroutine while
                            // it's running.
                            coroutineContents.coroutineNext = null;
                            
                            return coroutineYoke.runWaitLinear(
                                function ( coroutineYoke ) {
                                
                                return coroutineThen(
                                    coroutineYoke, input );
                            }, function ( yokeAndResult ) {
                                return go(
                                    clientYokeRider, yokeAndResult );
                            } );
                        };
                        return pkRet( clientYoke, yokeAndResult.out );
                    } else {  // yokeAndResult.type === "done"
                        if ( yokeAndResult.yoke.yokeRider.tag !==
                            "pure-yoke" )
                            return pkErr( clientYoke,
                                "Returned from a coroutine with a " +
                                "yoke that wasn't a pure-yoke" );
                        if ( yokeAndResult.result.isLinear() )
                            return pkErr( clientYoke,
                                "Returned from a coroutine with a " +
                                "linear return value" );
                        coroutineContents.coroutineNext = null;
                        return pkRet( clientYoke,
                            yokeAndResult.result );
                    }
                }
            }
        } ) );
    } );
    // TODO: See if we should implement actual coroutines, rather than
    // what we have now, which is asymmetric coroutines. We lose
    // organizational structure that way (essentially giving up GOSUB
    // for GOTO), but maybe we gain something else. If we decide to
    // make the change, here are some steps to get started:
    //
    //  - Merge `yield-into` and `yield-out` into a single `yield`.
    //  - Redesign what happens when a coroutine returns. Perhaps
    //    `coroutine-new` coroutines should cause an error when they
    //    return.
    //  - Make the body of `call-with-mbox-env` execute as a
    //    coroutine. When it returns, it should return from the
    //    `call-box-with-mbox-env` call.
    //  - Keep track of the current coroutine token as part of the
    //    yoke, so that `yield` can modify the current coroutine's
    //    `coroutineNext` state.
    //
    // There's a particular reason for the current (asymmetric)
    // coroutines being what they are. Perhaps mutable boxes have good
    // generality for defining local custom side effects because they
    // can hold the status (and folded history) of a single-threaded,
    // single-nondeterministic-branch imperative computation. Process
    // control and sub-interpreters would be nice features to support
    // anyway, so generalizing mutable boxes to suspendable
    // computations could reduce the overall number of things we need
    // to model.
    //
    defFunc( "yield-into", 3,
        function ( yoke, mboxEnv, coroutine, input ) {
        
        if ( mboxEnv.tag !== "token" )
            return pkErr( yoke,
                "Called yield-into with a non-token environment" );
        if ( coroutine.tag !== "token" )
            return pkErr( yoke,
                "Called yield-into with a non-token coroutine" );
        if ( input.isLinear() )
            return pkErr( yoke,
                "Called yield-into with a linear input value" );
        if ( !mboxEnv.special.jsPayload.isValidMutableEnvironment )
            return pkErr( yoke,
                "Called yield-into with an invalid environment" );
        if ( !tokenEq( mboxEnv,
            coroutine.special.jsPayload.mutableBoxEnvironment ) )
            return pkErr( yoke,
                "Called yield-into with an incorrect environment" );
        var coroutineNext = coroutine.special.jsPayload.coroutineNext;
        if ( coroutineNext === null )
            return pkErr( yoke,
                "Called yield-into with a token that didn't " +
                "represent a currently suspended coroutine" );
        return coroutineNext( yoke, input );
    } );
    defFunc( "yield-out", 2, function ( yoke, yielderToken, output ) {
        if ( yielderToken.tag !== "token" )
            return pkErr( yoke,
                "Called yield-out with a non-token yielder token" );
        if ( yielderToken.special.jsPayload.canYield )
            return pkErr( yoke,
                "Called yield-out with a token other than the " +
                "current yielder token" );
        return runYield( yoke, output, function ( yoke, input ) {
            return pkRet( yoke, input );
        } );
    } );
    
    defFunc( "nl-get-linear", 1, function ( yoke, nl ) {
        if ( nl.tag !== "linear-as-nonlinear" )
            return pkErr( yoke,
                "Called nl-get-linear with a value that wasn't a " +
                "linear-as-nonlinear" );
        return pkRet( yoke, nl.ind( 0 ) );
    } );
    
    defFunc( "nl-get-tag-name", 1, function ( yoke, nl ) {
        if ( nl.tag !== "linear-as-nonlinear" )
            return pkErr( yoke,
                "Called nl-get-tag-name with a value that wasn't a " +
                "linear-as-nonlinear" );
        var x = nl.ind( 0 );
        return pkRet( yoke, x.getTagName() );
    } );
    
    defFunc( "nl-is-a-struct", 1, function ( yoke, nl ) {
        if ( nl.tag !== "linear-as-nonlinear" )
            return pkErr( yoke,
                "Called nl-is-a-struct with a value that wasn't a " +
                "linear-as-nonlinear" );
        var x = nl.ind( 0 );
        return pkRet( yoke, pkBoolean( pkIsStruct( x ) ) );
    } );
    
    defFunc( "struct-get-args", 1, function ( yoke, struct ) {
        if ( !pkIsStruct( struct ) )
            return pkErr( yoke,
                "Called struct-get-args with a non-struct" );
        return pkRet( yoke, pkGetArgs( struct ) );
    } );
    
    defMethod( "to-unqualified-name", "x" );
    arrEach( [
        // TODO: Manage this list of names elsewhere.
        "string-name",
        "pair-name",
        "qualified-name"
    ], function ( nameTag ) {
        setStrictImpl( "to-unqualified-name", nameTag,
            function ( yoke, args ) {
            
            return pkRet( yoke, listGet( args, 0 ) );
        } );
    } );
    setStrictImpl( "to-unqualified-name", "string",
        function ( yoke, args ) {
        
        return pkRet( yoke, pkStrNameRaw( listGet( args, 0 ) ) );
    } );
    
    defFunc( "is-an-unqualified-name", 1, function ( yoke, x ) {
        return pkDrop( yoke, x, function ( yoke ) {
            return pkRet( yoke, pkBoolean( isUnqualifiedName( x ) ) );
        } );
    } );
    
    defFunc( "is-a-qualified-name", 1, function ( yoke, x ) {
        return pkDrop( yoke, x, function ( yoke ) {
            return pkRet( yoke, pkBoolean( isQualifiedName( x ) ) );
        } );
    } );
    
    defFunc( "unqualified-name-eq", 2, function ( yoke, a, b ) {
        if ( !(isUnqualifiedName( a ) && isUnqualifiedName( b )) )
            return pkErr( yoke,
                "Called unqualified-name-eq with a value that " +
                "wasn't an unqualified name" );
        return pkRet( yoke,
            pkBoolean(
                a.special.unqualifiedNameJson ===
                    b.special.unqualifiedNameJson ) );
    } );
    
    defFunc( "qualified-name-eq", 2, function ( yoke, a, b ) {
        if ( !(isQualifiedName( a ) && isQualifiedName( b )) )
            return pkErr( yoke,
                "Called qualified-name-eq with a value that wasn't " +
                "a qualified name" );
        return pkRet( yoke,
            pkBoolean(
                a.special.qualifiedNameJson ===
                    b.special.qualifiedNameJson ) );
    } );
    
    defFunc( "is-a-comparable-token", 1, function ( yoke, x ) {
        return pkDrop( yoke, x, function ( yoke ) {
            return pkRet( yoke, pkBoolean( isComparableToken( x ) ) );
        } );
    } );
    
    defFunc( "comparable-token-eq", 2, function ( yoke, a, b ) {
        if ( !(isComparableToken( a ) && isComparableToken( b )) )
            return pkErr( yoke,
                "Called comparable-token-eq with a value that " +
                "wasn't a comparable token" );
        return pkRet( yoke, pkBoolean( tokenEq( a, b ) ) );
    } );
    
    // TODO: Take a closer look at how to design these string
    // operations properly. Once we have string concatenation support,
    // what should happen if a string becomes longer than what
    // JavaScript strings support?
    // TODO: Make these count characters by the number of Unicode code
    // points, not the number of UTF-16 code units.
    // TODO: See if we should just remove `string-len` and
    // `string-cut` since we no longer actually use them.
    defFunc( "string-len", 1, function ( yoke, string ) {
        if ( string.tag !== "string" )
            return pkErr( yoke,
                "Called string-len with a non-string" );
        var result = pkNil;
        // TODO: Figure out if this long loop is acceptable.
        for ( var i = 0, n = string.special.jsStr.length; i < n; i++ )
            result = pk( "succ", result );
        return pkRet( yoke, result );
    } );
    defFunc( "string-cut", 3, function ( yoke, string, start, stop ) {
        if ( string.tag !== "string" )
            return pkErr( yoke,
                "Called string-cut with a non-string" );
        if ( !isNat( start ) )
            return pkErr( yoke,
                "Called string-cut with a non-nat start" );
        if ( !isNat( stop ) )
            return pkErr( yoke,
                "Called string-cut with a non-nat stop" );
        var jsStr = string.special.jsStr;
        var jsLen = jsStr.length;
        var jsStart = natToJsBounded( start, jsLen );
        var jsStop = natToJsBounded( stop, jsLen );
        if ( jsLen < jsStop )
            jsStop = jsLen;
        return pkRet( yoke,
            pkStr( jsStop <= jsStart ? "" :
                jsStr.substring( jsStart, jsStop ) ) );
    } );
    
    return self;
}

function PkRuntime() {}
PkRuntime.prototype.init_ = function ( meta, revDefs ) {
    this.meta_ = meta;
    // NOTE: We make definition side effects wait so that
    // definition-reading can be understood as a pure operation on an
    // immutable snapshot of the environment. Then we don't have to
    // say every yoke has access to definition-reading side effects.
    this.revDefs_ = revDefs;
    return this;
};
PkRuntime.prototype.getMeta_ = function ( name ) {
    return this.meta_.get( name.special.qualifiedNameJson );
};
PkRuntime.prototype.prepareMeta_ = function (
    name, opt_methodOrVal ) {
    
    var meta = this.getMeta_( name );
    if ( meta === void 0 ) {
        meta = { name: name };
        this.meta_.set( name.special.qualifiedNameJson, meta );
    }
    if ( opt_methodOrVal === void 0 ) {
        // Do nothing.
    } else if ( meta.methodOrVal === void 0 ) {
        meta.methodOrVal = opt_methodOrVal;
    } else if ( meta.methodOrVal !== opt_methodOrVal ) {
        return null;
    }
    return meta;
};
PkRuntime.prototype.enqueueDef_ = function ( yoke, body ) {
    this.revDefs_ = { first: body, rest: this.revDefs_ };
    return pkRet( yoke, pkNil );
};
PkRuntime.prototype.runDefinitions = function ( yoke ) {
    var revDefs = this.revDefs_;
    this.revDefs_ = null;
    
    return jsListRev( yoke, revDefs, function ( yoke, defs ) {
        return go( yoke, defs );
        function go( yoke, defs ) {
            if ( defs === null )
                return pkRet( yoke, pkNil );
            return runWaitTry( yoke, function ( yoke ) {
                return runRet( yoke, defs.first.call( {} ) );
            }, function ( yoke, ignored ) {
                return go( yoke, defs.rest );
            } );
        }
    } );
};
PkRuntime.prototype.defVal = function ( name, val ) {
    var meta = this.prepareMeta_( name, "val" );
    if ( meta === null )
        return pkRawErr(
            "Called defval with a name that was already bound to a " +
            "method" );
    meta.val = val;
    return pkYep( pkNil );
};
PkRuntime.prototype.defMacro = function ( name, macro ) {
    var meta = this.prepareMeta_( name );
    meta.macro = macro;
    return pkYep( pkNil );
};
PkRuntime.prototype.defTag = function ( name, keys ) {
    var meta = this.prepareMeta_( name );
    if ( meta.tagKeys !== void 0 )
        return pkRawErr(
            "Called deftag with a name that was already bound to a " +
            "tag" );
    meta.tagKeys = keys;
    return pkYep( pkNil );
};
PkRuntime.prototype.defMethod = function ( name, args ) {
    var meta = this.prepareMeta_( name, "method" );
    if ( meta === null )
        return pkRawErr(
            "Called defmethod with a name that was already bound " +
            "to a value" );
    if ( meta.methodArgs !== void 0 )
        return pkRawErr(
            "Called defmethod with a name that was already bound " +
            "to a method" );
    meta.methodArgs = args;
    meta.methodImplsByTag = strMap();
    return pkYep( pkNil );
};
PkRuntime.prototype.callMethodRaw = function (
    yoke, methodName, args ) {
    
    // NOTE: This doesn't use `this`, but it does access the private
    // method getMeta_(), which is why it's a method.
    
    // TODO: These error messages implicitly use Pk#toString(), which
    // is hackishly designed. Figure out what kind of externalization
    // we really want here.
    // NOTE: This reads definitions. We maintain the metaphor that we
    // work with an immutable snapshot of the definitions, so we may
    // want to refactor this to be closer to that metaphor someday.
    if ( listLenIs( args, 0 ) )
        return pkErrLen( yoke, args, "Called method " + methodName );
    var meta = yoke.pkRuntime.getMeta_( methodName );
    var tagName = listGet( args, 0 ).getTagName();
    var impl = meta && meta.methodImplsByTag.get(
        tagName.special.qualifiedNameJson );
    if ( impl === void 0 )
        return pkErr( yoke,
            "No implementation for method " + methodName + " tag " +
            tagName );
    return impl.call( yoke, args );
};
PkRuntime.prototype.setImpl = function ( methodName, tagName, impl ) {
    // TODO: These error messages implicitly use Pk#toString(), which
    // is hackishly designed. Figure out what kind of externalization
    // we really want here.
    var methodMeta = this.getMeta_( methodName );
    if ( methodMeta.methodOrVal !== "method" )
        return pkRawErr(
            "Can't implement non-method " + methodName + " for tag " +
            tagName );
    var tagMeta = this.getMeta_( tagName );
    if ( tagMeta.tagKeys === void 0 )
        return pkRawErr(
            "Can't implement method " + methodName + " for non-tag " +
            tagName );
    methodMeta.methodImplsByTag.set(
        tagName.special.qualifiedNameJson, { call: impl } );
    return pkYep( pkNil );
};
PkRuntime.prototype.setStrictImpl = function (
    methodName, tagName, call ) {
    
    var methodMeta = this.getMeta_( methodName );
    return this.setImpl( methodName, tagName,
        function ( yoke, args ) {
        
        return listLenEq( yoke, args, methodMeta.methodArgs,
            function ( yoke, areEq ) {
            
            // TODO: This error message implicitly uses Pk#toString(),
            // which is hackishly designed. Figure out what kind of
            // externalization we really want here.
            if ( !areEq )
                return pkErrLen( yoke, args, "Called " + methodName );
            return call( yoke, args );
        } );
    } );
};
PkRuntime.prototype.getVal = function ( name ) {
    var self = this;
    var meta = self.getMeta_( name );
    if ( meta === void 0 )
        return pkRawErr( "Unbound variable " + name );
    if ( meta.methodOrVal === "val" )
        return pkYep( meta.val );
    if ( meta.methodOrVal === "method" )
        return pkYep( pkfn( function ( yoke, args ) {
            return runWaitOne( yoke, function ( yoke ) {
                return yoke.pkRuntime.callMethodRaw( yoke,
                    name, args );
            } );
        } ) );
    if ( meta.tagKeys !== void 0 )
        return pkYep( pkfn( function ( yoke, args ) {
            return listLenEq( yoke, args, meta.tagKeys,
                function ( yoke, areEq ) {
                
                // TODO: This error message implicitly uses
                // Pk#toString(), which is hackishly designed. Figure
                // out what kind of externalization we really want
                // here.
                if ( !areEq )
                    return pkErrLen( yoke, args,
                        "Can't make " + name );
                return pkRet( yoke,
                    new Pk().init_(
                        name,
                        name.ind( 0 ).tag === "string-name" ?
                            name.ind( 0 ).ind( 0 ).special.jsStr :
                            null,
                        args,
                        args.isLinear(),
                        {}
                    ) );
            } );
        } ) );
    // NOTE: If (meta.macro !== void 0), we don't do anything special.
    return pkRawErr( "Unbound variable " + name );
};
PkRuntime.prototype.qualifyName = function ( name ) {
    // TODO: If we ever implement namespaces, complicate this method
    // to handle them.
    return pkYep( pkQualifiedName( name ) );
};
PkRuntime.prototype.getMacro = function ( name ) {
    var meta = this.getMeta_( name );
    if ( meta === void 0 )
        return pkRawErr( "Unbound variable " + name );
    
    // If the name is specifically bound to macro behavior, use that.
    if ( meta.macro !== void 0 )
        return pkYep( pkYep( meta.macro ) );
    
    if ( meta.methodOrVal === "val"
        || meta.methodOrVal === "method"
        || meta.tagKeys !== void 0 )
        return pkYep( pkNil );
    
    return pkRawErr( "Unbound variable " + name );
};
PkRuntime.prototype.conveniences_debuggableSyncYoke = function () {
    return {
        pkRuntime: this,
        yokeRider: pk( "pure-yoke" ),
        internal: null,
        runWaitLinear: function ( step, then ) {
            return then( step( this ) );
        }
    };
};
PkRuntime.prototype.conveniences_syncYoke = function () {
    return {
        pkRuntime: this,
        yokeRider: pk( "pure-yoke" ),
        internal: 0,
        runWaitLinear: function ( step, then ) {
            var self = this;
            
            // TODO: Test to see what value is best for all browsers.
            // TODO: Put this constant somewhere more configurable.
            // NOTE: Firefox 28 breaks in the reader demo if this
            // value exceeds 217. Chrome 34 can handle 1236 sometimes,
            // but it's inconsistent, and its sweet spot seems to be
            // around 500-1000. IE 11 can handle 367 sometimes, but
            // it's inconsistent.
            var maxStack = 100;
            
            if ( self.internal < maxStack ) {
                var maybeYokeAndResult = step( {
                    pkRuntime: self.pkRuntime,
                    yokeRider: self.yokeRider,
                    internal: self.internal + 1,
                    runWaitLinear: self.runWaitLinear
                } );
                if ( maybeYokeAndResult.type !== "deferrer" )
                    return then( maybeYokeAndResult );
                return { type: "deferrer", go:
                    function ( defer, then2 ) {
                    
                    syncYokeCall( maybeYokeAndResult, defer,
                        function ( yokeAndResult ) {
                        
                        var yoke = yokeAndResult.yoke;
                        syncYokeCall(
                            then( runRet( {
                                pkRuntime: yoke.pkRuntime,
                                yokeRider: yoke.yokeRider,
                                internal: 0,
                                runWaitLinear: yoke.runWaitLinear
                            }, yokeAndResult.result ) ),
                            defer, then2 );
                    } );
                } };
            } else {
                return { type: "deferrer", go:
                    function ( defer, then2 ) {
                    
                    syncYokeCall( step( {
                        pkRuntime: self.pkRuntime,
                        yokeRider: self.yokeRider,
                        internal: 0,
                        runWaitLinear: self.runWaitLinear
                    } ), defer, function ( yokeAndResult ) {
                        syncYokeCall(
                            then( yokeAndResult ), defer, then2 );
                    } );
                } };
            }
        }
    };
};

function pkGetVal( yoke, name, then ) {
    // NOTE: This is only used for compiled Penknife code.
    return runWaitTry( yoke, function ( yoke ) {
        return runRet( yoke, yoke.pkRuntime.getVal( name ) );
    }, then );
}

// TODO: Define a staged conditional, preferably from the Penknife
// side.

// TODO: Define other useful utilities.
