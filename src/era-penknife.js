// era-penknife.js
// Copyright 2013 Ross Angle. Released under the MIT License.
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
//     yoke is typically a linear value, and transforming it this way
//     represents imperative side effects. If this transformation uses
//     any side effects, those effects correspond to some linear input
//     value and some linear output value (typically the yoke).
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
//     transported anyway.


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
    // NOTE: The function pkStrName() is defined below.
    return this.tagName !== null ? this.tagName :
        pkStrName( this.tag );
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
    return "(" + this.getTagName() + spaceBefore( this.args_ ) + ")";
};
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
function pkToken( jsObj ) {
    return new Pk().init_(
        null, "token", pkNil, !"isLinear", { jsObj: jsObj } );
}
function makeEffectToken() {
    // NOTE: Whenever we do side effects, we roughly understand them
    // as transformations of some linear value that represents the
    // outside world. That's why we wrap up the effect token as a
    // linear value here.
    var token = pkToken( {} );
    var result = {};
    result.unwrapped = token;
    result.wrapped = pkNonlinearAsLinear(
        token,
        pkfn( function ( yoke, args ) {
            if ( !listLenIs( args, 2 ) )
                return pkErrLen( pureYoke, args,
                    "Called a duplicator" );
            return pkErr( yoke,
                "Can't duplicate or drop a wrapped effect token" );
        } ),
        pkfn( function ( yoke, args ) {
            if ( !listLenIs( args, 1 ) )
                return pkErrLen( pureYoke, args,
                    "Called an unwrapper" );
            return pkRet( yoke, listGet( args, 0 ) );
        } )
    );
    return result;
}
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
function pkStr( jsStr ) {
    // NOTE: This sanity check is just here in case some code happens
    // to be buggy. We always have valid Unicode by the time we get
    // here, even if that means we do a sanity check beforehand. (See
    // conveniences_macroexpandArrays(), for example.) If we ever
    // can't afford to do this linear-time check of all the
    // characters, we should consider removing this.
    if ( !isValidUnicode( jsStr ) )
        throw new Error();
    return new Pk().init_( null, "string", pkNil, !"isLinear",
        { jsStr: jsStr } );
}
function pkStrNameRaw( str ) {
    return new Pk().init_(
        null, "string-name", pkList( str ), !"isLinear",
        { nameJson: JSON.stringify( str.special.jsStr ) } );
}
function pkStrName( jsStr ) {
    return pkStrNameRaw( pkStr( jsStr ) );
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

function isList( x ) {
    return x.tag === "cons" || x.tag === "nil";
}
function isNat( x ) {
    return x.tag === "succ" || x.tag === "nil";
}
function isName( x ) {
    return x.tag === "string-name";
}
function tokenEq( a, b ) {
    return a.special.jsObj === b.special.jsObj;
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
function listLenBounded( x, maxLen ) {
    for ( var n = 0; n <= maxLen; n++ ) {
        if ( x.tag !== "cons" )
            return n;
        x = x.ind( 1 );
    }
    return null;
}
function listLenIs( x, n ) {
    return listLenBounded( x, n ) === n;
}
function runRet( yoke, val ) {
    return { yoke: yoke, result: val };
}
function pkRet( yoke, val ) {
    return runRet( yoke, pk( "yep", val ) );
}
function pkRawErr( jsStr ) {
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
        yokeRider: rider,
        effectToken: yoke.effectToken,
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
        return then( yoke, pk( "yep", list.ind( 0 ) ) );
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

function isEnoughGetTineShallow( x ) {
    return isList( x ) && listLenIs( x, 2 ) &&
        isList( listGet( x, 0 ) );
}
function isEnoughGetTineDeep( yoke, x, then ) {
    if ( !isEnoughGetTineShallow( x ) )
        return then( yoke, false );
    return listAll( yoke, listGet( x, 0 ), function ( name ) {
        return isName( name );
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
        var bindings = listGet( args, 0 );
        if ( !isList( bindings ) )
            return pkErr( yoke,
                "Called a get-tine function with a non-list list " +
                "of bindings" );
        return listLenEq( yoke, names, bindings,
            function ( yoke, areEq ) {
            
            if ( !areEq )
                return pkErr( yoke,
                    "Called a get-tine function with a list of " +
                    "bindings that wasn't the right length" );
            
            return func( yoke, captures, bindings );
        } );
    } ) );
}
function pkGetTine( names, func ) {
    return pkGetTineLinear( names, pkNil,
        function ( yoke, captures, bindings ) {
        
        return func( yoke, bindings );
    } );
}

function PkRuntime() {}
PkRuntime.prototype.init_ = function () {
    var self = this;
    self.meta_ = strMap();
    // NOTE: We make definition side effects wait in a queue, so that
    // definition-reading can be understood as a pure operation on an
    // immutable snapshot of the environment. Then we don't have to
    // say every yoke has access to definition-reading side effects.
    self.defQueueTail_ = { end: true };
    self.defQueueHead_ = self.defQueueTail_;
    
    function defTag( name, var_args ) {
        self.defTag( pkStrName( name ), pkListFromArr(
            arrMap( [].slice.call( arguments, 1 ), function ( s ) {
                return pkStrName( s );
            } ) ) );
    }
    function defMethod( name, var_args ) {
        self.defMethod( pkStrName( name ), pkListFromArr(
            arrMap( [].slice.call( arguments, 1 ), function ( s ) {
                return pkStrName( s );
            } ) ) );
    }
    function defVal( name, val ) {
        self.defVal( pkStrName( name ), val );
    }
    function defMacro( name, macro ) {
        self.defMacro( pkStrName( name ), macro );
    }
    function setStrictImpl( methodName, tagName, call ) {
        self.setStrictImpl(
            pkStrName( methodName ), pkStrName( tagName ), call );
    }
    
    defTag( "cons", "first", "rest" );
    defVal( "cons", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called cons" );
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( yoke,
                "Called cons with a rest that wasn't a list" );
        return pkRet( yoke,
            pkCons( listGet( args, 0 ), listGet( args, 1 ) ) );
    } ) );
    defTag( "succ", "pred" );
    defVal( "succ", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called succ" );
        if ( !isNat( listGet( args, 0 ) ) )
            return pkErr( yoke,
                "Called succ with a predecessor that wasn't a nat" );
        return pkRet( yoke, pk( "succ", listGet( args, 0 ) ) );
    } ) );
    defTag( "yep", "val" );
    defTag( "nope", "val" );
    defTag( "nil" );
    defTag( "string" );
    defVal( "string", pkfn( function ( yoke, args ) {
        return pkErr( yoke, "The string function has no behavior" );
    } ) );
    defTag( "string-name", "string" );
    defVal( "string-name", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called string-name" );
        if ( listGet( args, 0 ).tag !== "string" )
            return pkErr( yoke,
                "Called string-name with a non-string" );
        return pkRet( yoke, pkStrNameRaw( listGet( args, 0 ) ) );
    } ) );
    defTag( "nonlinear-as-linear",
        "inner-value", "duplicator", "unwrapper" );
    defVal( "nonlinear-as-linear", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( yoke, args,
                "Called nonlinear-as-linear" );
        if ( listGet( args, 0 ).isLinear() )
            return pkErr( yoke,
                "Called nonlinear-as-linear with an inner value  " +
                "that was itself linear" );
        if ( listGet( args, 1 ).isLinear() )
            return pkErr( yoke,
                "Called nonlinear-as-linear with a duplicator " +
                "function that was itself linear" );
        if ( listGet( args, 2 ).isLinear() )
            return pkErr( yoke,
                "Called nonlinear-as-linear with an unwrapper " +
                "function that was itself linear" );
        return pkRet( yoke,
            pkNonlinearAsLinear(
                listGet( args, 0 ),
                listGet( args, 1 ),
                listGet( args, 2 ) ) );
    } ) );
    defTag( "linear-as-nonlinear", "inner-value" );
    defVal( "linear-as-nonlinear", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args,
                "Called linear-as-nonlinear" );
        return pkRet( yoke,
            pkLinearAsNonlinear( listGet( args, 0 ) ) );
    } ) );
    defTag( "fn" );
    defVal( "fn", pkfn( function ( yoke, args ) {
        return pkErr( yoke, "The fn function has no behavior" );
    } ) );
    defMethod( "call", "self", "args" );
    setStrictImpl( "call", "fn", function ( yoke, args ) {
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( yoke,
                "Called call with a non-list args list" );
        // TODO: See if we should respect linearity some more by
        // double-checking that the captured values haven't already
        // been spent.
        return listGet( args, 0 ).special.call(
            yoke,
            listGet( args, 0 ).special.captures,
            listGet( args, 1 )
        );
    } );
    
    defTag( "pure-yoke" );
    defTag( "top-level-definer-yoke", "wrapped-effect-token" );
    defMethod( "yoke-map-wrapped-effect-token", "yoke", "func" );
    setStrictImpl( "yoke-map-wrapped-effect-token", "pure-yoke",
        function ( yoke, args ) {
        
        var firstClassYoke = listGet( args, 0 );
        var func = listGet( args, 1 );
        return runWaitTry( yoke, function ( yoke ) {
            return self.callMethod( yoke, "call",
                pkList( func, pkList( pkNil ) ) );
        }, function ( yoke, replacementYoke ) {
            if ( replacementYoke.tag !== "nil" )
                return pkErr( yoke,
                    "During a yoke-map-wrapped-effect-token of a " +
                    "pure-yoke, received a non-nil replacement " +
                    "token" );
            return pkRet( yoke, firstClassYoke );
        } );
    } );
    setStrictImpl( "yoke-map-wrapped-effect-token",
        "top-level-definer-yoke",
        function ( yoke, args ) {
        
        var firstClassYoke = listGet( args, 0 );
        var func = listGet( args, 1 );
        var wrappedEffectToken = firstClassYoke.ind( 0 );
        return runWaitTry( yoke, function ( yoke ) {
            return self.callMethod( yoke, "call", pkList(
                func,
                pkList( pk( "yep", wrappedEffectToken ) )
            ) );
        }, function ( yoke, maybeNewWrappedEffectToken ) {
            if ( maybeNewWrappedEffectToken.tag !== "yep" )
                return pkErr( yoke,
                    "During a yoke-map-wrapped-effect-token of a " +
                    "top-level-definer-yoke, received a non-yep " +
                    "replacement token" );
            return pkRet( yoke,
                pk( "top-level-definer-yoke",
                    maybeNewWrappedEffectToken.ind( 0 ) ) );
        } );
    } );
    
    defTag( "getmac-fork", "get-tine", "maybe-macro" );
    defVal( "getmac-fork", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called getmac-fork" );
        return isEnoughGetTineDeep( yoke, listGet( args, 0 ),
            function ( yoke, valid ) {
            
            if ( !valid )
                return pkErr( yoke,
                    "Called getmac-fork with an invalid get-tine" );
            return pkRet( yoke,
                pk( "getmac-fork",
                    listGet( args, 0 ), listGet( args, 1 ) ) );
        } );
    } ) );
    defMethod( "fork-to-getmac", "fork" );
    setStrictImpl( "fork-to-getmac", "getmac-fork",
        function ( yoke, args ) {
        
        var fork = listGet( args, 0 );
        return pkRet( yoke, pkList( fork.ind( 0 ), fork.ind( 1 ) ) );
    } );
    
    defTag( "literal-binding", "literal-val" );
    defTag( "main-binding", "name" );
    defVal( "main-binding", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called main-binding" );
        if ( !isName( listGet( args, 0 ) ) )
            return pkErr( yoke,
                "Called main-binding with a non-name" );
        return pkRet( yoke,
            pk( "main-binding", listGet( args, 0 ) ) );
    } ) );
    defTag( "call-binding", "op", "args" );
    defVal( "call-binding", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called call-binding" );
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( yoke,
                "Called call-binding with a non-list args list" );
        return pkRet( yoke,
            pk( "call-binding",
                listGet( args, 0 ), listGet( args, 1 ) ) );
    } ) );
    defTag( "param-binding", "index" );
    defVal( "param-binding", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called param-binding" );
        if ( !isNat( listGet( args, 0 ) ) )
            return pkErr( yoke,
                "Called param-binding with a non-nat index" );
        return pkRet( yoke,
            pk( "param-binding", listGet( args, 0 ) ) );
    } ) );
    defTag( "fn-binding", "captures", "body-binding" );
    defVal( "fn-binding", pkfn( function ( yoke, args ) {
        // NOTE: By blocking this function, we preserve the invariant
        // that the "captures" list is a list of maybes of bindings.
        // That way we don't have to check for this explicitly in
        // binding-interpret.
        // TODO: See if we should check for it explicitly anyway. Then
        // we can remove this restriction.
        return pkErr( yoke,
            "The fn-binding function has no behavior" );
    } ) );
    defTag( "binding-for-if", "cond-binding",
        "bindings-and-counts", "then-binding", "else-binding" );
    defVal( "binding-for-if", pkfn( function ( yoke, args ) {
        // NOTE: The overall structure of a `binding-for-if` is like
        // this:
        //
        // (binding-for-if <condBinding>
        //   <list of (<captureBinding> <thenCount> <elseCount>)>
        //   <thenBinding>
        //   <elseBinding>)
        //
        if ( !listLenIs( args, 4 ) )
            return pkErrLen( yoke, args, "Called binding-for-if" );
        return listAll( yoke, listGet( args, 1 ),
            function ( bindingAndCounts ) {
            
            return isList( bindingAndCounts ) &&
                listLenIs( bindingAndCounts, 3 ) &&
                isNat( listGet( bindingAndCounts, 1 ) ) &&
                isNat( listGet( bindingAndCounts, 2 ) );
        }, function ( yoke, valid ) {
            if ( !valid )
                return pkErr( yoke,
                    "Called binding-for-if with an invalid " +
                    "bindings-and-counts" );
            if ( listGet( args, 2 ).isLinear() )
                return pkErr( yoke,
                    "Called binding-for-if with a linear " +
                    "then-binding" );
            if ( listGet( args, 3 ).isLinear() )
                return pkErr( yoke,
                    "Called binding-for-if with a linear " +
                    "else-binding" );
            return pkRet( yoke,
                pk( "binding-for-if",
                    listGet( args, 0 ),
                    listGet( args, 1 ),
                    listGet( args, 2 ),
                    listGet( args, 3 ) ) );
        } );
    } ) );
    defTag( "let-list-binding",
        "numbers-of-dups", "source-binding", "body-binding" );
    defVal( "let-list-binding", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( yoke, args, "Called len-list-binding" );
        var numbersOfDups = listGet( args, 0 );
        var sourceBinding = listGet( args, 1 );
        var bodyBinding = listGet( args, 2 );
        if ( !isList( numbersOfDups ) )
            return pkErr( yoke,
                "Called len-list-binding with a non-list list of " +
                "numbers of duplicates" );
        return listAll( yoke, numbersOfDups,
            function ( numberOfDups ) {
            
            return isNat( numberOfDups );
        }, function ( yoke, valid ) {
            if ( !valid )
                return pkErr( yoke,
                    "Called len-list-binding with a non-nat number " +
                    "of duplicates" );
            return pkRet( yoke,
                pk( "let-list-binding",
                    numbersOfDups, sourceBinding, bodyBinding ) );
        } );
    } ) );
    
    // NOTE: We respect linearity in binding-interpret already, but it
    // follows an unusual contract. Usually a function will consume or
    // return all of its linear parameters, but each binding-interpret
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
    defMethod( "binding-interpret", "self", "list-of-captured-vals" );
    function defBindingInterpret( tag, body ) {
        setStrictImpl( "binding-interpret", tag,
            function ( yoke, args ) {
            
            var binding = listGet( args, 0 );
            var captures = listGet( args, 1 );
            if ( !isList( listGet( args, 1 ) ) )
                return pkErr( yoke,
                    "Called binding-interpret with a non-list list " +
                    "of captured values" );
            if ( listGet( args, 1 ).isLinear() )
                return pkErr( yoke,
                    "Called binding-interpret with a linear list " +
                    "of captured values" );
            return body( yoke, binding, captures );
        } );
    }
    defBindingInterpret( "literal-binding",
        function ( yoke, binding, captures ) {
        
        return pkRet( yoke, binding.ind( 0 ) );
    } );
    defBindingInterpret( "main-binding",
        function ( yoke, binding, captures ) {
        
        // NOTE: This reads definitions. We maintain the metaphor that
        // we work with an immutable snapshot of the definitions, so
        // we may want to refactor this to be closer to that metaphor
        // someday.
        return runRet( yoke, self.getVal( binding.ind( 0 ) ) );
    } );
    defBindingInterpret( "call-binding",
        function ( yoke, binding, captures ) {
        
        function interpretList( yoke, list, then ) {
            if ( list.tag !== "cons" )
                return then( yoke, pkNil );
            return runWaitTry( yoke, function ( yoke ) {
                return self.callMethod( yoke, "binding-interpret",
                    pkList( list.ind( 0 ), captures ) );
            }, function ( yoke, elem ) {
                return interpretList( yoke, list.ind( 1 ),
                    function ( yoke, interpretedTail ) {
                    
                    return runWaitOne( yoke, function ( yoke ) {
                        return then( yoke,
                            pkCons( elem, interpretedTail ) );
                    } );
                } );
            } );
        }
        return runWaitTry( yoke, function ( yoke ) {
            return self.callMethod( yoke, "binding-interpret",
                pkList( binding.ind( 0 ), captures ) );
        }, function ( yoke, op ) {
            return interpretList( yoke, binding.ind( 1 ),
                function ( yoke, args ) {
                
                return self.callMethod( yoke, "call",
                    pkList( op, args ) );
            } );
        } );
    } );
    defBindingInterpret( "param-binding",
        function ( yoke, binding, captures ) {
        
        return listGetNat( yoke, captures, binding.ind( 0 ),
            function ( yoke, maybeNonlinearValue ) {
            
            if ( maybeNonlinearValue.tag !== "yep" )
                return pkErr( yoke,
                    "Tried to interpret a param-binding that fell " +
                    "off the end of the list of captured values" );
            var nonlinearValue = maybeNonlinearValue.ind( 0 );
            if ( nonlinearValue.tag !== "linear-as-nonlinear" )
                return pkErr( yoke,
                    "Tried to interpret a param-binding, but the " +
                    "captured value turned out not to be wrapped " +
                    "up as a linear-as-nonlinear value" );
            var value = nonlinearValue.ind( 0 );
            return pkRet( yoke, value );
        } );
    } );
    defBindingInterpret( "fn-binding",
        function ( yoke, binding, nonlocalCaptures ) {
        
        var captures = binding.ind( 0 );
        var bodyBinding = binding.ind( 1 );
        return listMap( yoke, captures, function ( yoke, capture ) {
            if ( capture.tag !== "yep" )
                return pkRet( yoke, pkNil );
            return runWaitTry( yoke, function ( yoke ) {
                return self.callMethod( yoke, "binding-interpret",
                    pkList( capture.ind( 0 ), nonlocalCaptures ) );
            }, function ( yoke, value ) {
                return pkRet( yoke, pk( "yep", value ) );
            } );
        }, function ( yoke, captures ) {
            return pkRet( yoke, pkfnLinear(
                pkCons( pk( "yep", bodyBinding ), captures ),
                function ( yoke, bodyBindingAndCaptures, args ) {
                
                var bodyBinding =
                    bodyBindingAndCaptures.ind( 0 ).ind( 0 );
                var captures = bodyBindingAndCaptures.ind( 1 );
                
                return listCount( yoke, captures,
                    function ( maybeCapturedVal ) {
                    
                    return maybeCapturedVal.tag !== "yep";
                }, function ( yoke, argsDupCount ) {
                    return runWaitTry( yoke, function ( yoke ) {
                        return self.pkDup(
                            yoke, args, argsDupCount );
                    }, function ( yoke, argsDuplicates ) {
                        return go(
                            yoke, captures, argsDuplicates, pkNil );
                        function go(
                            yoke, nonlocalCaptures, argsDuplicates,
                            revLocalCaptures ) {
                            
                            if ( nonlocalCaptures.tag !== "cons" )
                                return listRev(
                                    yoke, revLocalCaptures,
                                    function ( yoke, localCaptures ) {
                                    
                                    return self.callMethod( yoke,
                                        "binding-interpret",
                                        pkList( bodyBinding,
                                            localCaptures ) );
                                } );
                            return runWaitOne( yoke,
                                function ( yoke ) {
                                
                                var maybeNlc =
                                    nonlocalCaptures.ind( 0 );
                                if ( maybeNlc.tag === "yep" )
                                    return next( argsDuplicates,
                                        maybeNlc.ind( 0 ) );
                                return next( argsDuplicates.ind( 1 ),
                                    argsDuplicates.ind( 0 ) );
                                function next( argsDuplicates,
                                    localCapture ) {
                                    
                                    return go(
                                        yoke,
                                        nonlocalCaptures.ind( 1 ),
                                        argsDuplicates,
                                        pkCons(
                                            pkLinearAsNonlinear(
                                                localCapture ),
                                            revLocalCaptures )
                                    );
                                }
                            } );
                        }
                    } );
                } );
            } ) );
        } );
    } );
    defBindingInterpret( "binding-for-if",
        function ( yoke, binding, outerCaptures ) {
        
        var condBinding = binding.ind( 0 );
        var bindingsAndCounts = binding.ind( 1 );
        var thenBinding = binding.ind( 2 );
        var elseBinding = binding.ind( 3 );
        return runWaitTry( yoke, function ( yoke ) {
            return self.callMethod( yoke, "binding-interpret",
                pkList( condBinding, outerCaptures ) );
        }, function ( yoke, condValue ) {
            // TODO: See if there's a better way for us to respect
            // linearity here. Maybe we should explicitly drop
            // condValue. One graceful option would be to bind a
            // variable to the condition value so there's still
            // exactly one reference to it, but that would complicate
            // this code (not to mention breaking its symmetry).
            if ( condValue.isLinear() )
                return pkErr( yoke,
                    "Used binding-for-if to branch on a condition " +
                    "that was linear" );
            if ( condValue.tag !== "nil" ) {
                var branchBinding = thenBinding;
                var getCount = function ( bindingAndCounts ) {
                    return listGet( bindingAndCounts, 1 );
                };
            } else {
                var branchBinding = elseBinding;
                var getCount = function ( bindingAndCounts ) {
                    return listGet( bindingAndCounts, 2 );
                };
            }
            return listMappend( yoke, bindingsAndCounts,
                function ( yoke, bindingAndCounts ) {
                
                var binding = listGet( bindingAndCounts, 0 );
                var count = getCount( bindingAndCounts );
                return runWaitTry( yoke, function ( yoke ) {
                    return self.callMethod( yoke, "binding-interpret",
                        pkList( binding, outerCaptures ) );
                }, function ( yoke, value ) {
                    return self.pkDup( yoke, value, count );
                } );
            }, function ( yoke, innerCaptures ) {
                return listMap( yoke, innerCaptures,
                    function ( yoke, innerCapture ) {
                    
                    return pkRet( yoke,
                        pkLinearAsNonlinear( innerCapture ) );
                }, function ( yoke, wrappedInnerCaptures ) {
                    return self.callMethod( yoke, "binding-interpret",
                        pkList(
                            branchBinding, wrappedInnerCaptures ) );
                } );
            } );
        } );
    } );
    defBindingInterpret( "let-list-binding",
        function ( yoke, binding, outerCaptures ) {
        
        var numbersOfDups = binding.ind( 0 );
        var sourceBinding = binding.ind( 1 );
        var bodyBinding = binding.ind( 2 );
        return runWaitTry( yoke, function ( yoke ) {
            return self.callMethod( yoke, "binding-interpret",
                pkList( sourceBinding, outerCaptures ) );
        }, function ( yoke, sourceValue ) {
            return listLenEq( yoke, sourceValue, numbersOfDups,
                function ( yoke, valid ) {
                
                if ( !valid )
                    return pkErr( yoke,
                        "Got the wrong number of elements when " +
                        "destructuring a list" );
                
                return listMapTwo( yoke, sourceValue, numbersOfDups,
                    function ( yoke, sourceElem, numberOfDups ) {
                    
                    return self.pkDup( yoke,
                        sourceElem, numberOfDups );
                }, function ( yoke, dupsPerElem ) {
                    return listFlattenOnce( yoke, dupsPerElem,
                        function ( yoke, dups ) {
                        
                        return listMap( yoke, dups,
                            function ( yoke, dup ) {
                            
                            return pkRet( yoke,
                                pkLinearAsNonlinear( dup ) );
                        }, function ( yoke, sourceCaptures ) {
                            return listAppend( yoke,
                                outerCaptures, sourceCaptures,
                                function ( yoke, innerCaptures ) {
                                
                                return self.callMethod( yoke,
                                    "binding-interpret",
                                    pkList( bodyBinding,
                                        innerCaptures ) );
                            } );
                        } );
                    } );
                } );
            } );
        } );
    } );
    
    defMethod( "macroexpand-to-fork", "self", "get-fork" );
    setStrictImpl( "macroexpand-to-fork", "string-name",
        function ( yoke, args ) {
        
        var expr = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        if ( getFork.isLinear() )
            return pkErr( yoke,
                "Called macroexpand-to-fork with a linear get-fork" );
        return runWaitOne( yoke, function ( yoke ) {
            return self.callMethod( yoke, "call",
                pkList( getFork, pkList( expr ) ) );
        } );
    } );
    setStrictImpl( "macroexpand-to-fork", "cons",
        function ( yoke, args ) {
        
        var expr = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        if ( getFork.isLinear() )
            return pkErr( yoke,
                "Called macroexpand-to-fork with a linear get-fork" );
        return runWaitTry( yoke, function ( yoke ) {
            return self.callMethod( yoke, "macroexpand-to-fork",
                pkList( expr.ind( 0 ), getFork ) );
        }, function ( yoke, opFork ) {
            if ( opFork.isLinear() )
                return pkErr( yoke,
                    "Got a linear fork for the operator when doing " +
                    "macroexpand-to-fork for a cons" );
            return self.runWaitTryGetmacFork( yoke,
                "macroexpand-to-fork",
                function ( yoke ) {
                
                return pkRet( yoke, opFork );
            }, function ( yoke, getTine, maybeMacro ) {
                var macroexpander = maybeMacro.tag === "yep" ?
                    maybeMacro.ind( 0 ) :
                    self.nonMacroMacroexpander();
                return self.callMethod( yoke, "call", pkList(
                    macroexpander,
                    pkList( opFork, getFork, expr.ind( 1 ) )
                ) );
            } );
        } );
    } );
    
    defMacro( "fn", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( yoke, args,
                "Called fn's macroexpander" );
        var fork = listGet( args, 0 );
        var nonlocalGetFork = listGet( args, 1 );
        var body = listGet( args, 2 );
        if ( nonlocalGetFork.isLinear() )
            return pkErr( yoke,
                "Called fn's macroexpander with a linear get-fork" );
        if ( !isList( body ) )
            return pkErr( yoke,
                "Called fn's macroexpander with a non-list macro body"
                );
        if ( !listLenIs( body, 2 ) )
            return pkErrLen( yoke, body, "Expanded fn" );
        var paramName = listGet( body, 0 );
        if ( !isName( paramName ) )
            return pkErr( yoke, "Expanded fn with a non-name var" );
        function isParamName( name ) {
            return paramName.special.nameJson ===
                name.special.nameJson;
        }
        
        return self.pkDrop( yoke, fork, function ( yoke ) {
        
        return self.runWaitTryGetmacFork( yoke, "macroexpand-to-fork",
            function ( yoke ) {
            
            return self.callMethod( yoke, "macroexpand-to-fork",
                pkList(
                
                listGet( body, 1 ),
                self.deriveGetFork_( nonlocalGetFork,
                    function ( yoke, name, then ) {
                    
                    return then( yoke, isParamName( name ) );
                } )
            ) );
        }, function ( yoke, getTine, maybeMacro ) {
        
        var outerNames = listGet( getTine, 0 );
        return listKeep( yoke, outerNames, function ( name ) {
            return !isParamName( name );
        }, function ( yoke, innerNames ) {
        
        return pkRet( yoke, pk( "getmac-fork",
            pkGetTine( innerNames,
                function ( yoke, innerInBindings ) {
                
                return listFoldl( yoke,
                    pkList( pkNil, pkNil, pkNil, innerInBindings ),
                    outerNames,
                    function ( yoke, frame, outerName ) {
                    
                    var revCaptures = listGet( frame, 0 );
                    var revInnerOutBindings = listGet( frame, 1 );
                    var i = listGet( frame, 2 );
                    var innerInBindingsLeft = listGet( frame, 3 );
                    
                    var newRevInnerOutBindings =
                        pkCons( pk( "param-binding", i ),
                            revInnerOutBindings );
                    var newI = pk( "succ", i );
                    if ( isParamName( outerName ) )
                        return pkRet( yoke, pkList(
                            pkCons( pkNil, revCaptures ),
                            newRevInnerOutBindings,
                            newI,
                            innerInBindingsLeft
                        ) );
                    return pkRet( yoke, pkList(
                        pkCons(
                            pk( "yep", innerInBindingsLeft.ind( 0 ) ),
                            revCaptures ),
                        newRevInnerOutBindings,
                        newI,
                        innerInBindingsLeft.ind( 1 )
                    ) );
                }, function ( yoke, frame ) {
                
                return listRev( yoke, listGet( frame, 0 ),
                    function ( yoke, captures ) {
                return listRev( yoke, listGet( frame, 1 ),
                    function ( yoke, innerOutBindings ) {
                
                return runWaitTry( yoke, function ( yoke ) {
                    return self.callMethod( yoke, "call", pkList(
                        listGet( getTine, 1 ),
                        pkList( innerOutBindings )
                    ) );
                }, function ( yoke, bodyBinding ) {
                    return pkRet( yoke,
                        pk( "fn-binding", captures, bodyBinding ) );
                } );
                
                } );
                } );
                
                } );
            } ),
            pkNil
        ) );
        
        } );
        
        } );
        
        } );
    } ) );
    
    defMacro( "quote", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( yoke, args,
                "Called quote's macroexpander" );
        var fork = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var body = listGet( args, 2 );
        if ( getFork.isLinear() )
            return pkErr( yoke,
                "Called quote's macroexpander with a linear get-fork"
                );
        if ( !isList( body ) )
            return pkErr( yoke,
                "Called quote's macroexpander with a non-list " +
                "macro body" );
        if ( !listLenIs( body, 1 ) )
            return pkErrLen( yoke, body, "Expanded quote" );
        return self.pkDrop( yoke, fork, function ( yoke ) {
            return pkRet( yoke, pk( "getmac-fork",
                pkGetTineLinear( pkNil,
                    pkList( pk( "yep", listGet( body, 0 ) ) ),
                    function ( yoke, captures, bindings ) {
                    
                    return pkRet( yoke,
                        pk( "literal-binding",
                            listGet( captures, 0 ).ind( 0 ) ) );
                } ),
                pkNil
            ) );
        } );
    } ) );
    
    defMacro( "if", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( yoke, args,
                "Called if's macroexpander" );
        var fork = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var body = listGet( args, 2 );
        if ( getFork.isLinear() )
            return pkErr( yoke,
                "Called if's macroexpander with a linear get-fork" );
        if ( !isList( body ) )
            return pkErr( yoke,
                "Called if's macroexpander with a non-list macro " +
                "body" );
        if ( !listLenIs( body, 3 ) )
            return pkErrLen( yoke, body, "Expanded if" );
        var condExpr = listGet( body, 0 );
        var thenExpr = listGet( body, 1 );
        var elseExpr = listGet( body, 2 );
        
        return self.pkDrop( yoke, fork, function ( yoke ) {
        
        function tryGetFork( yoke, expr, then ) {
            return self.runWaitTryGetmacFork( yoke,
                "macroexpand-to-fork",
                function ( yoke ) {
                
                return self.callMethod( yoke, "macroexpand-to-fork",
                    pkList( expr, getFork ) );
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
        
        // TODO: See if there's a way to do this without mutation
        // without our time performance becoming a quadratic (or
        // worse) function of the number of `branchCaptures`.
        var bcDedupMap = strMap();
        return listKeep( yoke, branchCaptures, function ( pkName ) {
            var jsName = pkName.special.nameJson;
            var entry = bcDedupMap.get( jsName );
            if ( entry !== void 0 )
                return false;
            bcDedupMap.set( jsName, true );
            return true;
        }, function ( yoke, bcDedup ) {
        
        function fulfill( getTine, then ) {
            return self.makeGetTineUnderMappendedArgs_(
                yoke, null, getTine, bcDedup,
                function ( yoke, thenDupsList, getTine ) {
                
                if ( !listLenIs( listGet( getTine, 0 ), 0 ) )
                    throw new Error();
                return self.fulfillGetTine( yoke, getTine, pkNil,
                    function (
                        yoke, outBinding, inBindingsRemaining ) {
                    
                    return then( yoke, thenDupsList, outBinding );
                } );
            } );
        }
        
        return fulfill( thenGetTine,
            function ( yoke, thenDupsList, thenOutBinding ) {
        
        if ( thenOutBinding.isLinear() )
            return pkErr( yoke,
                "Got a linear then-binding for binding-for-if " +
                "during if's macroexpander" );
        
        return fulfill( elseGetTine,
            function ( yoke, elseDupsList, elseOutBinding ) {
        
        if ( thenOutBinding.isLinear() )
            return pkErr( yoke,
                "Got a linear else-binding for binding-for-if " +
                "during if's macroexpander" );
        
        return listAppend( yoke, condCaptures, bcDedup,
            function ( yoke, outerCaptures ) {
        return pkRet( yoke, pk( "getmac-fork",
            pkGetTine( outerCaptures,
                function ( yoke, outerBindings ) {
                
                return self.fulfillGetTine( yoke,
                    condGetTine, outerBindings,
                    function ( yoke, condBinding, outerBindings ) {
                    
                    return listMapMulti( yoke, pkList(
                        outerBindings,
                        thenDupsList,
                        elseDupsList
                    ), function ( yoke, elems ) {
                        return pkRet( yoke, elems );
                    }, function ( yoke, outerBindingsAndCounts ) {
                        return pkRet( yoke, pk( "binding-for-if",
                            condBinding,
                            outerBindingsAndCounts,
                            thenOutBinding,
                            elseOutBinding
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
    } ) );
    
    // NOTE: The `let-list` macro is a destructuring let that raises
    // an error if it doesn't match. By doing this, it doesn't need to
    // use condition-guarded aliasing like the `if` macro does.
    defMacro( "let-list", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( yoke, args,
                "Called let-list's macroexpander" );
        var fork = listGet( args, 0 );
        var nonlocalGetFork = listGet( args, 1 );
        var body = listGet( args, 2 );
        if ( nonlocalGetFork.isLinear() )
            return pkErr( yoke,
                "Called let-list's macroexpander with a linear " +
                "get-fork" );
        if ( !isList( body ) )
            return pkErr( yoke,
                "Called let-list's macroexpander with a non-list " +
                "macro body" );
        if ( !listLenIs( body, 3 ) )
            return pkErrLen( yoke, body, "Expanded let-list" );
        var varNames = listGet( body, 0 );
        var sourceExpr = listGet( body, 1 );
        var bodyExpr = listGet( body, 2 );
        
        if ( !isList( varNames ) )
            return pkErr( yoke,
                "Expanded let-list with a non-list list of element " +
                "variables" );
        
        return listAll( yoke, varNames, function ( varName ) {
            return isName( varName );
        }, function ( yoke, valid ) {
        
        if ( !valid )
            return pkErr( yoke,
                "Expanded let-list with a non-name element variable"
                );
        
        return self.pkDrop( yoke, fork, function ( yoke ) {
        
        return self.runWaitTryGetmacFork( yoke, "macroexpand-to-fork",
            function ( yoke ) {
            
            return self.callMethod( yoke, "macroexpand-to-fork",
                pkList( sourceExpr, nonlocalGetFork ) );
        }, function ( yoke, sourceGetTine, maybeMacro ) {
        
        var sourceCaptures = listGet( sourceGetTine, 0 );
        
        return self.makeGetTineUnderMappendedArgs_( yoke,
            nonlocalGetFork, bodyExpr, varNames,
            function ( yoke, bodyDupsList, bodyGetTine ) {
        
        var bodyCaptures = listGet( bodyGetTine, 0 );
        
        return listAppend( yoke, sourceCaptures, bodyCaptures,
            function ( yoke, outerCaptures ) {
        return pkRet( yoke, pk( "getmac-fork",
            pkGetTineLinear( outerCaptures, pkList(
                pk( "yep", sourceGetTine ),
                pk( "yep", bodyGetTine )
            ), function ( yoke, captures, outerBindings ) {
                var sourceGetTine = listGet( captures, 0 ).ind( 0 );
                var bodyGetTine = listGet( captures, 1 ).ind( 0 );
                
                return self.fulfillGetTine( yoke,
                    sourceGetTine, outerBindings,
                    function ( yoke, sourceBinding, outerBindings ) {
                return self.fulfillGetTine( yoke,
                    bodyGetTine, outerBindings,
                    function ( yoke, bodyBinding, outerBindings ) {
                
                if ( !listLenIs( outerBindings, 0 ) )
                    throw new Error();
                
                return pkRet( yoke,
                    pk( "let-list-binding",
                        bodyDupsList, sourceBinding, bodyBinding ) );
                
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
    } ) );
    
    // This takes an explicit input and installs it as the implicit
    // yoke. It also takes the old implicit yoke and returns it as the
    // explict output.
    defVal( "yoke-trade", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called yoke-trade" );
        var newYoke = yokeWithRider( yoke, listGet( args, 0 ) );
        return pkRet( newYoke, yoke.yokeRider );
    } ) );
    
    defVal( "defval", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called defval" );
        var name = listGet( args, 0 );
        var val = listGet( args, 1 );
        if ( !isName( name ) )
            return pkErr( yoke,
                "Called defval with a non-name name" );
        if ( val.isLinear() )
            return pkErr( yoke, "Called defval with a linear value" );
        return self.mapDefiner_( yoke, function ( yoke, hasDefiner ) {
            if ( !hasDefiner )
                return pkErr( yoke,
                    "Called defval without access to top-level " +
                    "definition side effects" );
            return self.enqueueDef_( yoke, function () {
                return self.defVal( name, val );
            } );
        } );
    } ) );
    defVal( "defmacro", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called defmacro" );
        var name = listGet( args, 0 );
        var macro = listGet( args, 1 );
        if ( !isName( name ) )
            return pkErr( yoke,
                "Called defmacro with a non-name name" );
        if ( macro.isLinear() )
            return pkErr( yoke,
                "Called defmacro with a linear macro" );
        return self.mapDefiner_( yoke, function ( yoke, hasDefiner ) {
            if ( !hasDefiner )
                return pkErr( yoke,
                    "Called defval without access to top-level " +
                    "definition side effects" );
            return self.enqueueDef_( yoke, function () {
                return self.defMacro( name, macro );
            } );
        } );
    } ) );
    defVal( "deftag", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called deftag" );
        var name = listGet( args, 0 );
        var argNames = listGet( args, 1 );
        if ( !isName( name ) )
            return pkErr( yoke,
                "Called deftag with a non-name name" );
        if ( !isList( argNames ) )
            return pkErr( yoke,
                "Called deftag with a non-list list of argument " +
                "names" );
        return listAll( yoke, argNames, function ( argName ) {
            return !isName( argName );
        }, function ( yoke, valid ) {
            if ( !valid )
                return pkErr( yoke,
                    "Called deftag with a non-name argument name" );
            if ( keys.isLinear() )
                return pkErr( yoke,
                    "Called deftag with a linear args list" );
            return self.mapDefiner_( yoke,
                function ( yoke, hasDefiner ) {
                
                if ( !hasDefiner )
                    return pkErr( yoke,
                        "Called deftag without access to top-level " +
                        "definition side effects" );
                return self.enqueueDef_( yoke, function () {
                    return self.defTag( name, argNames );
                } );
            } );
        } );
    } ) );
    defVal( "defmethod", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called defmethod" );
        var name = listGet( args, 0 );
        var argNames = listGet( args, 1 );
        if ( !isName( name ) )
            return pkErr( yoke,
                "Called defmethod with a non-name name" );
        if ( !isList( argNames ) )
            return pkErr( yoke,
                "Called defmethod with a non-list list of argument " +
                "names" );
        return listAll( yoke, argNames, function ( argName ) {
            return !isName( argName );
        }, function ( yoke, valid ) {
            if ( !valid )
                return pkErr( yoke,
                    "Called defmethod with a non-name argument name"
                    );
            if ( argNames.isLinear() )
                return pkErr( yoke,
                    "Called defmethod with a linear args list" );
            return self.mapDefiner_( yoke,
                function ( yoke, hasDefiner ) {
                
                if ( !hasDefiner )
                    return pkErr( yoke,
                        "Called defmethod without access to " +
                        "top-level definition side effects" );
                return self.enqueueDef_( yoke, function () {
                    return self.defMethod( name, argNames );
                } );
            } );
        } );
    } ) );
    defVal( "set-impl", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( yoke, args, "Called set-impl" );
        if ( !isName( listGet( args, 0 ) ) )
            return pkErr( yoke,
                "Called set-impl with a non-name method name" );
        if ( !isName( listGet( args, 1 ) ) )
            return pkErr( yoke,
                "Called set-impl with a non-name tag name" );
        if ( listGet( args, 2 ).isLinear() )
            return pkErr( yoke,
                "Called set-impl with a linear function" );
        return self.mapDefiner_( yoke, function ( yoke, hasDefiner ) {
            if ( !hasDefiner )
                return pkErr( yoke,
                    "Called set-impl without access to top-level " +
                    "definition side effects" );
            return self.enqueueDef_( yoke, function () {
                return self.setImpl(
                    listGet( args, 0 ),
                    listGet( args, 1 ),
                    function ( yoke, args ) {
                        return self.callMethod( yoke, "call",
                            pkList( listGet( args, 2 ), args ) );
                    } );
            } );
        } );
    } ) );
    
    defVal( "raise", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called raise" );
        return pkRet( yoke, pk( "nope", listGet( args, 0 ) ) );
    } ) );
    
    defVal( "unwrap", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called unwrap" );
        return self.pkUnwrap( yoke, listGet( args, 0 ),
            function ( yoke, unwrapped ) {
            
            return pkRet( yoke, unwrapped );
        } );
    } ) );
    
    return self;
};
PkRuntime.prototype.getMeta_ = function ( name ) {
    return this.meta_.get( name.special.nameJson );
};
PkRuntime.prototype.prepareMeta_ = function (
    name, opt_methodOrVal ) {
    
    var meta = this.getMeta_( name );
    if ( meta === void 0 ) {
        meta = { name: name };
        this.meta_.set( name.special.nameJson, meta );
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
PkRuntime.prototype.pkDup = function ( yoke, val, count ) {
    var self = this;
    
    // If we're only trying to get one duplicate, we already have our
    // answer, regardless of whether the value is linear.
    if ( count.tag === "succ" && count.ind( 0 ).tag === "nil" )
        return pkRet( yoke, pkList( val ) );
    
    if ( !val.isLinear() ) {
        // NOTE: This includes tags "nil", "string", and
        // "string-name".
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
            return self.callMethod( yoke, "call", pkList(
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
                    return pkRet( yoke, outerValues );
                } );
            } );
        } );
    return withDups( pkGetArgs( val ), function ( args ) {
        return pkRebuild( val, args );
    } );
    function withDups( args, rebuild ) {
        return listMap( yoke, args, function ( yoke, arg ) {
            return self.pkDup( yoke, arg, count );
        }, function ( yoke, argsDuplicates ) {
            return listMapMultiWithLen( yoke, count, argsDuplicates,
                function ( yoke, args ) {
                
                return pkRet( yoke, rebuild( args ) );
            }, function ( yoke, result ) {
                return pkRet( yoke, result );
            } );
        } );
    }
};
PkRuntime.prototype.pkDrop = function ( yoke, val, then ) {
    var self = this;
    return runWaitTry( yoke, function ( yoke ) {
        return self.pkDup( yoke, val, pkNil );
    }, function ( yoke, nothing ) {
        return then( yoke );
    } );
};
PkRuntime.prototype.pkUnwrap = function ( yoke, val, then ) {
    var self = this;
    
    if ( val.tag !== "nonlinear-as-linear" )
        return pkErr( yoke,
            "Tried to unwrap a value that wasn't a " +
            "nonlinear-as-linear" );
    return runWaitTry( yoke, function ( yoke ) {
        return self.callMethod( yoke, "call", pkList(
            val.special.unwrapper,
            pkList( val.special.innerValue )
        ) );
    }, function ( yoke, unwrapped ) {
        if ( unwrapped.isLinear() )
            return pkErr( yoke,
                "Unwrapped a value and got a linear value" );
        return then( yoke, unwrapped );
    } );
};
PkRuntime.prototype.fulfillGetTine = function (
    yoke, getTine, bindings, then ) {
    
    var self = this;
    return listFoldl( yoke,
        pkList( pkNil, bindings ), listGet( getTine, 0 ),
        function ( yoke, takenRevAndNot, name ) {
            var notTaken = listGet( takenRevAndNot, 1 );
            if ( notTaken.tag !== "cons" )
                return pkErr( yoke,
                    "An internal fulfillGetTine operation " +
                    "encountered fewer input bindings than " +
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
                return self.callMethod( yoke, "call", pkList(
                    listGet( getTine, 1 ),
                    pkList( taken )
                ) );
            }, function ( yoke, resultBinding ) {
                return then( yoke,
                    resultBinding, listGet( takenRevAndNot, 1 ) );
            } );
        } );
    } );
};
PkRuntime.prototype.fulfillGetTines = function (
    yoke, getTines, bindings, then ) {
    
    var self = this;
    if ( getTines.tag !== "cons" )
        return then( yoke, pkNil, bindings );
    return self.fulfillGetTine( yoke, getTines.ind( 0 ), bindings,
        function ( yoke, outBinding, inBindingsRemaining ) {
        
        return self.fulfillGetTines( yoke,
            getTines.ind( 1 ), inBindingsRemaining,
            function ( yoke, outBindings, inBindingsRemaining ) {
            
            return runWaitOne( yoke, function ( yoke ) {
                return then( yoke,
                    pkCons( outBinding, outBindings ),
                    inBindingsRemaining );
            } );
        } );
    } );
};
PkRuntime.prototype.makeGetTineUnderMappendedArgs_ = function (
    yoke, nonlocalGetForkOrNull, expr, argList, then ) {
    
    var self = this;
    
    // TODO: See if there's a way to do this without mutation without
    // our time performance becoming a quadratic (or worse) function
    // of the length of `argList`.
    var map = strMap();
    function getEntry( pkName ) {
        var jsName = pkName.special.nameJson;
        return map.get( jsName );
    }
    
    // Build an deduplicated version of `argList`, where a duplicated
    // name only appears in its last occurrence. For instance, abac
    // becomes bac. The result is `latestOccurrenceArgList`. While
    // building this result, also initialize `map` so we can easily
    // detect whether a name in `captures` is local or nonlocal later
    // on.
    return listRev( yoke, argList, function ( yoke, revArgList ) {
    return listMap( yoke, revArgList, function ( yoke, pkName ) {
        
        var jsName = pkName.special.nameJson;
        var entry = map.get( jsName );
        if ( entry === void 0 ) {
            map.set( jsName, { dups: pkNil, indices: pkNil } );
            return pkRet( yoke, pk( "yep", pkName ) );
        } else {
            return pkRet( yoke, pkNil );
        }
    }, function ( yoke, revMaybeArgList ) {
    return listRev( yoke, revMaybeArgList,
        function ( yoke, maybeArgList ) {
    return listMappend( yoke, maybeArgList,
        function ( yoke, maybePkName ) {
        
        if ( maybePkName.tag === "yep" )
            return pkRet( yoke, pkList( maybePkName.ind( 0 ) ) );
        else
            return pkRet( yoke, pkNil );
    }, function ( yoke, latestOccurrenceArgList ) {
    
    if ( nonlocalGetForkOrNull === null )
        return next( yoke, expr );
    return self.runWaitTryGetmacFork( yoke, "macroexpand-to-fork",
        function ( yoke ) {
        
        return self.callMethod( yoke, "macroexpand-to-fork", pkList(
            expr,
            self.deriveGetFork_( nonlocalGetForkOrNull,
                function ( yoke, name, then ) {
                    return then( yoke, getEntry( name ) !== void 0 );
                } )
        ) );
    }, function ( yoke, innerGetTine, maybeMacro ) {
        return next( yoke, innerGetTine );
    } );
    function next( yoke, innerGetTine ) {
    
    var captures = listGet( innerGetTine, 0 );
    var cont = listGet( innerGetTine, 1 );
    
    return listKeep( yoke, captures, function ( pkName ) {
        return getEntry( pkName ) === void 0;
    }, function ( yoke, nonlocalNames ) {
    return listLen( yoke, nonlocalNames,
        function ( yoke, lenNonlocalNames ) {
    
    return listEach( yoke, captures, function ( pkName ) {
        var entry = getEntry( pkName );
        if ( entry !== void 0 ) {
            entry.indices = pkCons( entry.dups, entry.indices );
            entry.dups = pk( "succ", entry.dups );
        }
    }, function ( yoke ) {
    return listFoldlJsAsync( yoke,
        lenNonlocalNames,
        latestOccurrenceArgList,
        function ( yoke, i, pkName, then ) {
        
        var entry = getEntry( pkName );
        return listFoldNatJsAsync( yoke,
            { i: i, revIndices: pkNil },
            entry.dups,
            function ( yoke, frame, then ) {
            
            return then( yoke, {
                i: pk( "succ", frame.i ),
                revIndices: pkCons( frame.i, frame.revIndices )
            } );
        }, function ( yoke, frame ) {
            return listRev( yoke, frame.revIndices,
                function ( yoke, indices ) {
                
                entry.indices = indices;
                return then( yoke, frame.i );
            } );
        } );
    }, function ( yoke, stopIndex ) {
    return listMappend( yoke, captures, function ( yoke, pkName ) {
        
        var entry = getEntry( pkName );
        if ( entry === void 0 )  // nonlocal
            return pkRet( yoke, pkNil );
        if ( entry.indices.tag !== "cons" )
            throw new Error();
        var i = entry.indices.ind( 0 );
        entry.indices = entry.indices.ind( 1 );
        return pkRet( yoke, pkList( pk( "param-binding", i ) ) );
    }, function ( yoke, localInBindings ) {
    return listMap( yoke, maybeArgList,
        function ( yoke, maybePkName ) {
        
        if ( maybePkName.tag === "yep" )
            return pkRet( yoke,
                getEntry( maybePkName.ind( 0 ) ).dups );
        else
            return pkRet( yoke, pkNil );
    }, function ( yoke, dupsList ) {
    
    return then( yoke, dupsList, pkGetTineLinear( nonlocalNames,
        pkList( pk( "yep", cont ) ),
        function ( yoke, captures, nonlocalInBindings ) {
        
        var cont = listGet( captures, 0 ).ind( 0 );
        return listAppend( yoke, nonlocalInBindings, localInBindings,
            function ( yoke, inBindings ) {
            
            return self.callMethod( yoke, "call",
                pkList( cont, pkList( inBindings ) ) );
        } );
    } ) );
    
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
    } );
};
PkRuntime.prototype.forkGetter = function ( nameForError ) {
    var self = this;
    return pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called " + nameForError );
        var name = listGet( args, 0 );
        if ( !isName( name ) )
            return pkErr( yoke,
                "Called " + nameForError + " with a non-name" );
        // NOTE: This reads definitions. We maintain the metaphor that
        // we work with an immutable snapshot of the definitions, so
        // we may want to refactor this to be closer to that metaphor
        // someday.
        return runWaitTry( yoke, function ( yoke ) {
            return runRet( yoke, self.qualifyName( name ) );
        }, function ( yoke, name ) {
            return runWaitTry( yoke, function ( yoke ) {
                return runRet( yoke, self.getMacro( name ) );
            }, function ( yoke, maybeMacro ) {
                return pkRet( yoke, pk( "getmac-fork",
                    pkGetTine( pkNil, function ( yoke, bindings ) {
                        return pkRet( yoke,
                            pk( "main-binding", name ) );
                    } ),
                    maybeMacro
                ) );
            } );
        } );
    } );
};
PkRuntime.prototype.deriveGetFork_ = function (
    nonlocalGetFork, isLocalName ) {
    
    var self = this;
    return pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called a get-fork" );
        var name = listGet( args, 0 );
        if ( !isName( name ) )
            return pkErr( yoke, "Called a get-fork with a non-name" );
        return isLocalName( yoke, name, function ( yoke, isLocal ) {
            if ( isLocal )
                return pkRet( yoke, pk( "getmac-fork",
                    pkGetTine( pkList( name ),
                        function ( yoke, bindings ) {
                        
                        return pkRet( yoke, listGet( bindings, 0 ) );
                    } ),
                    pkNil
                ) );
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
                return self.callMethod( yoke, "call",
                    pkList( nonlocalGetFork, pkList( name ) ) );
            } );
        } );
    } );
};
PkRuntime.prototype.runWaitTryGetmacFork = function (
    yoke, nameForError, func, then ) {
    
    var self = this;
    return runWaitTry( yoke, function ( yoke ) {
        return func( yoke );
    }, function ( yoke, fork ) {
        return runWaitTry( yoke, function ( yoke ) {
            return self.callMethod( yoke, "fork-to-getmac",
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
};
PkRuntime.prototype.nonMacroMacroexpander = function () {
    var self = this;
    return pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( yoke, args,
                "Called a non-macro's macroexpander" );
        var fork = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var argsList = listGet( args, 2 );
        if ( getFork.isLinear() )
            return pkErr( yoke,
                "Called a non-macro's macroexpander with a linear " +
                "get-fork" );
        if ( !isList( argsList ) )
            return pkErr( yoke,
                "Called a non-macro's macroexpander with a " +
                "non-list args list" );
        return self.runWaitTryGetmacFork( yoke,
            "the fork parameter to a non-macro's macroexpander",
            function ( yoke ) {
            
            return pkRet( yoke, fork );
        }, function ( yoke, funcGetTine, funcMaybeMacro ) {
            return parseList( yoke, argsList, pkNil );
            function parseList( yoke, list, revGetTinesSoFar ) {
                if ( list.tag !== "cons" )
                    return listRev( yoke, revGetTinesSoFar,
                        function ( yoke, getTines ) {
                        
                        var allGetTines =
                            pkCons( funcGetTine, getTines );
                        return listMappend( yoke, allGetTines,
                            function ( yoke, getTine ) {
                            
                            return pkRet( yoke,
                                listGet( getTine, 0 ) );
                        }, function ( yoke, allNames ) {
                            // <indentation-reset>
return pkRet( yoke, pk( "getmac-fork",
    pkGetTineLinear( allNames, pkList( pk( "yep", allGetTines ) ),
        function ( yoke, captures, allInBindings ) {
        
        var allGetTines = listGet( captures, 0 ).ind( 0 );
        return self.fulfillGetTines( yoke, allGetTines, allInBindings,
            function ( yoke, allOutBindings, inBindingsRemaining ) {
            
            if ( !listLenIs( inBindingsRemaining, 0 ) )
                throw new Error();
            return pkRet( yoke,
                pk( "call-binding",
                    allOutBindings.ind( 0 ),
                    allOutBindings.ind( 1 ) ) );
        } );
    } ),
    pkNil
) );
                            // </indentation-reset>
                        } );
                    } );
                return self.runWaitTryGetmacFork( yoke,
                    "macroexpand-to-fork",
                    function ( yoke ) {
                    
                    return self.callMethod( yoke,
                        "macroexpand-to-fork",
                        pkList( list.ind( 0 ), getFork ) );
                }, function ( yoke, getTine, maybeMacro ) {
                    return parseList(
                        yoke,
                        list.ind( 1 ),
                        pkCons( getTine, revGetTinesSoFar ) );
                } );
            }
        } );
    } );
};
PkRuntime.prototype.enqueueDef_ = function ( yoke, body ) {
    this.defQueueTail_.end = false;
    this.defQueueTail_.def = body;
    this.defQueueTail_.next = { end: true };
    this.defQueueTail_ = this.defQueueTail_.next;
    return pkRet( yoke, pkNil );
};
PkRuntime.prototype.runDefinitions = function ( yoke ) {
    var queue = this.defQueueHead_;
    this.defQueueHead_ =
    this.defQueueTail_ = { end: true };
    
    return go( yoke, queue );
    function go( yoke, queue ) {
        if ( queue.end )
            return pkRet( yoke, pkNil );
        return runWaitTry( yoke, function ( yoke ) {
            return runRet( yoke, queue.def.call( {} ) );
        }, function ( yoke, ignored ) {
            return go( yoke, queue.next );
        } );
    }
};
PkRuntime.prototype.defVal = function ( name, val ) {
    var meta = this.prepareMeta_( name, "val" );
    if ( meta === null )
        return pkRawErr(
            "Called defval with a name that was already bound to a " +
            "method" );
    meta.val = val;
    return pk( "yep", pkNil );
};
PkRuntime.prototype.defMacro = function ( name, macro ) {
    var meta = this.prepareMeta_( name );
    meta.macro = macro;
    return pk( "yep", pkNil );
};
PkRuntime.prototype.defTag = function ( name, keys ) {
    var meta = this.prepareMeta_( name );
    if ( meta.tagKeys !== void 0 )
        return pkRawErr(
            "Called deftag with a name that was already bound to a " +
            "tag" );
    meta.tagKeys = keys;
    return pk( "yep", pkNil );
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
    return pk( "yep", pkNil );
};
PkRuntime.prototype.callMethodRaw = function (
    yoke, methodName, args ) {
    
    // TODO: These error messages implicitly use Pk#toString(), which
    // is hackishly designed. Figure out what kind of externalization
    // we really want here.
    // NOTE: This reads definitions. We maintain the metaphor that we
    // work with an immutable snapshot of the definitions, so we may
    // want to refactor this to be closer to that metaphor someday.
    if ( listLenIs( args, 0 ) )
        return pkErrLen( yoke, args, "Called method " + methodName );
    var meta = this.getMeta_( methodName );
    var tagName = listGet( args, 0 ).getTagName();
    var impl =
        meta && meta.methodImplsByTag.get( tagName.special.nameJson );
    if ( impl === void 0 )
        return pkErr( yoke,
            "No implementation for method " + methodName + " tag " +
            tagName );
    return impl.call( yoke, args );
};
PkRuntime.prototype.callMethod = function (
    yoke, jsMethodName, args ) {
    
    return this.callMethodRaw(
        yoke, pkStrName( jsMethodName ), args );
};
PkRuntime.prototype.setImpl = function ( methodName, tagName, call ) {
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
    methodMeta.methodImplsByTag.set( tagName.special.nameJson,
        { call: call } );
    return pk( "yep", pkNil );
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
        return pk( "yep", meta.val );
    if ( meta.methodOrVal === "method" )
        return pk( "yep", pkfn( function ( yoke, args ) {
            return runWaitOne( yoke, function ( yoke ) {
                return self.callMethodRaw( yoke, name, args );
            } );
        } ) );
    if ( meta.tagKeys !== void 0 )
        return pk( "yep", pkfn( function ( yoke, args ) {
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
                        name.tag === "string-name" ?
                            name.ind( 0 ).special.jsStr : null,
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
    return pk( "yep", name );
};
PkRuntime.prototype.getMacro = function ( name ) {
    var meta = this.getMeta_( name );
    if ( meta === void 0 )
        return pkRawErr( "Unbound variable " + name );
    
    // If the name is specifically bound to macro behavior, use that.
    if ( meta.macro !== void 0 )
        return pk( "yep", pk( "yep", meta.macro ) );
    
    if ( meta.methodOrVal === "val"
        || meta.methodOrVal === "method"
        || meta.tagKeys !== void 0 )
        return pk( "yep", pkNil );
    
    return pkRawErr( "Unbound variable " + name );
};
PkRuntime.prototype.mapDefiner_ = function ( yoke, func ) {
    var self = this;
    var yokeRider = yoke.yokeRider;
    var pureYoke = yokeWithRider( yoke, pk( "pure-yoke" ) );
    return runWaitTry( pureYoke, function ( pureYoke ) {
        return self.callMethod( pureYoke,
            "yoke-map-wrapped-effect-token",
            pkList(
                yokeRider,
                pkfn( function ( pureYoke, args ) {
                    var us =
                        "a yoke-map-wrapped-effect-token callback";
                    if ( !listLenIs( args, 1 ) )
                        return pkErrLen( pureYoke, args,
                            "Called " + us );
                    var maybeWrappedEffectToken = listGet( args, 0 );
                    if ( maybeWrappedEffectToken.tag === "yep" ) {
                        var wrappedEffectToken =
                            maybeWrappedEffectToken.ind( 0 );
                        if ( wrappedEffectToken.tag
                            !== "nonlinear-as-linear" )
                            return pkErr( pureYoke,
                                "Called " + us + " with a value " +
                                "that wasn't a nonlinear-as-linear" );
                        return self.pkUnwrap( pureYoke,
                            wrappedEffectToken,
                            function ( pureYoke, effectToken ) {
                            
                            if ( effectToken.tag !== "token" )
                                return pkErr( pureYoke,
                                    "Called " + us + " with a " +
                                    "value that wasn't a wrapped " +
                                    "token" );
                            if ( yoke.effectToken === null
                                || !tokenEq( yoke.effectToken,
                                    effectToken ) )
                                return pkErr( pureYoke,
                                    "Called " + us + " with a " +
                                    "token that wasn't the current " +
                                    "effect token" );
                            return runWaitTry( pureYoke,
                                function ( pureYoke ) {
                                
                                return func( pureYoke,
                                    !!"hasDefiner" );
                            }, function ( pureYoke, ignoredNil ) {
                                if ( ignoredNil.tag !== "nil" )
                                    return pkErr( pureYoke,
                                        "Internally used " +
                                        "mapDefiner_ with a " +
                                        "function that returned a " +
                                        "non-nil value" );
                                var newEffectToken =
                                    makeEffectToken();
                                var updatedYoke = {
                                    yokeRider: pureYoke.yokeRider,
                                    effectToken:
                                        newEffectToken.unwrapped,
                                    runWaitLinear:
                                        pureYoke.runWaitLinear
                                };
                                return pkRet( yoke,
                                    pk( "yep",
                                        newEffectToken.wrapped ) );
                            } );
                        } );
                        
                    } else if (
                        maybeWrappedEffectToken.tag === "nil" ) {
                        
                        return runWaitTry( pureYoke,
                            function ( pureYoke ) {
                            
                            return func( pureYoke, !"hasDefiner" );
                        }, function ( pureYoke, ignoredNil ) {
                            if ( ignoredNil.tag !== "nil" )
                                return pkErr( pureYoke,
                                    "Internally used mapDefiner_ " +
                                    "with a function that returned " +
                                    "a non-nil value" );
                            return pkRet( yoke, pkNil );
                        } );
                    } else {
                        return pkErr( pureYoke,
                            "Called " + us + " with a non-maybe" );
                    }
                } )
            )
        );
    }, function ( pureYoke, newYokeRider ) {
        var yoke = yokeWithRider( pureYoke, newYokeRider );
        return pkRet( yoke, pkNil );
    } );
};
// TODO: Figure out if we should manage `withDefiner` in a more
// encapsulated and/or generalized way.
// TODO: See if we should be temporarily augmenting the available side
// effects, rather than temporarily replacing them.
PkRuntime.prototype.withDefiner = function ( yoke, body ) {
    var effectToken = makeEffectToken();
    var empoweredYoke = {
        yokeRider:
            pk( "top-level-definer-yoke", effectToken.wrapped ),
        effectToken: effectToken.unwrapped,
        runWaitLinear: yoke.runWaitLinear
    };
    return runWait( empoweredYoke, function ( empoweredYoke ) {
        return body( empoweredYoke );
    }, function ( empoweredYoke, result ) {
        var disempoweredYoke = {
            yokeRider: yoke.yokeRider,
            effectToken: yoke.effectToken,
            runWaitLinear: empoweredYoke.runWaitLinear
        };
        return runRet( disempoweredYoke, result );
    } );
};
PkRuntime.prototype.conveniences_syncYoke = {
    yokeRider: pk( "pure-yoke" ),
    effectToken: null,
    runWaitLinear: function ( step, then ) {
        return then( step( this ) );
    }
};
PkRuntime.prototype.conveniences_macroexpand = function (
    expr, opt_yoke ) {
    
    var self = this;
    if ( opt_yoke === void 0 )
        opt_yoke = self.conveniences_syncYoke;
    return self.runWaitTryGetmacFork( opt_yoke, "macroexpand-to-fork",
        function ( yoke ) {
        
        return self.callMethod( yoke, "macroexpand-to-fork", pkList(
            expr,
            self.forkGetter( "the top-level get-fork" )
        ) );
    }, function ( yoke, getTine, maybeMacro ) {
        if ( !listLenIs( listGet( getTine, 0 ), 0 ) )
            return pkErr( yoke,
                "Got a top-level macroexpansion result with captures"
                );
        return runWaitTry( yoke, function ( yoke ) {
            return self.callMethod( yoke, "call",
                pkList( listGet( getTine, 1 ), pkList( pkNil ) ) );
        }, function ( yoke, binding ) {
            return pkRet( yoke, binding );
        } );
    } );
};
PkRuntime.prototype.conveniences_macroexpandArrays = function (
    arrayExpr, opt_yoke ) {
    
    function arraysToConses( arrayExpr ) {
        // TODO: Use something like Lathe.js's _.likeArray() here.
        if ( typeof arrayExpr === "string"
            && isValidUnicode( arrayExpr ) )
            return pkStrName( arrayExpr );
        else if ( arrayExpr instanceof Array )
            return pkListFromArr(
                arrMap( arrayExpr, arraysToConses ) );
        else
            throw new Error();
    }
    
    return this.conveniences_macroexpand(
        arraysToConses( arrayExpr ), opt_yoke );
};
PkRuntime.prototype.conveniences_pkDrop = function ( val, opt_yoke ) {
    if ( opt_yoke === void 0 )
        opt_yoke = this.conveniences_syncYoke;
    return this.pkDrop( opt_yoke, val, function ( yoke ) {
        return pkRet( yoke, pkNil );
    } );
};
PkRuntime.prototype.conveniences_interpretBinding = function (
    binding, opt_yoke ) {
    
    var self = this;
    if ( opt_yoke === void 0 )
        opt_yoke = self.conveniences_syncYoke;
    return self.withDefiner( opt_yoke, function ( yoke ) {
        return self.callMethod( yoke, "binding-interpret",
            pkList( binding, pkNil ) );
    } );
};
PkRuntime.prototype.conveniences_runDefinitions = function (
    opt_yoke ) {
    
    var self = this;
    if ( opt_yoke === void 0 )
        opt_yoke = self.conveniences_syncYoke;
    return self.runDefinitions( opt_yoke );
};
function makePkRuntime() {
    return new PkRuntime().init_();
}

// TODO: Define gensyms.
// TODO: Define assignment.
// TODO: Define a staged conditional, preferably from the Penknife
// side.
// TODO: Define other useful utilities.
