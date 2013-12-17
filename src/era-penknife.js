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
//     // TODO: Implement the ability to install arbitrary values as
//     // yokes.
//     // TODO: Make definition side effects wait in a queue, so that
//     // definition-reading can be understood as a pure operation on
//     // an immutable snapshot of the environment. Then we don't have
//     // to say every linear value has access to definition-reading
//     // side effects.
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
//     // TODO: Implement a reason for the unwrapper to exist--namely,
//     // an unwrap function that applies to all nonlinear-as-linear
//     // values.
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
//     // TODO: When creating a Penknife string, verify that the
//     // JavaScript string has proper UTF-16 surrogate pairs.
//
// // TODO: Implement tokens. We don't have a use for them yet.
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
function pk( tag, var_args ) {
    var args = pkListFromArr( [].slice.call( arguments, 1 ) );
    return new Pk().init_( null, tag, args, args.isLinear(), {} );
}
function pkIsStruct( x ) {
    return x.tag !== "fn" &&
        x.tag !== "nonlinear-as-linear" &&
        x.tag !== "linear-as-nonlinear" &&
        x.tag !== "string";
        // TODO: Once we have tokens, add this.
//        x.tag !== "token";
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
        || tree.tag === "string" )
        // TODO: Once we have tokens, add this.
//        || tree.tag === "token" )
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
        || tree.tag === "string" )
        // TODO: Once we have tokens, add this.
//        || tree.tag === "token" )
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
    // TODO: See if there's a more efficient way to do this.
    if ( list.tag !== "cons" )
        return then( yoke, pkNil );
    if ( list.ind( 1 ).tag !== "cons" )
        return then( yoke, list.ind( 0 ) );
    return runWaitOne( yoke, function ( yoke ) {
        return listFlattenOnce( yoke, list.ind( 1 ),
            function ( yoke, flatTail ) {
            
            return listAppend( yoke, list.ind( 0 ), flatTail,
                function ( yoke, result ) {
                
                return then( yoke, result );
            } );
        } );
    } );
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
function listFoldlJs( yoke, init, list, func, then ) {
    return go( yoke, init, list );
    function go( yoke, init, list ) {
        if ( list.tag !== "cons" )
            return then( yoke, init );
        return runWaitOne( yoke, function ( yoke ) {
            return go( yoke,
                func( init, list.ind( 0 ) ), list.ind( 1 ) );
        } );
    }
}
function listFoldrJs( yoke, list, init, func, then ) {
    return listRev( yoke, list, function ( yoke, revList ) {
        return listFoldlJs( yoke, init, list, function (
            newInit, elem ) {
            
            return func( elem, newInit );
        }, function ( yoke, newInit ) {
            return then( yoke, newInit );
        } );
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
function listKeep( yoke, list, func, then ) {
    return listMappend( yoke, list, function ( yoke, elem ) {
        return pkRet( yoke, func( elem ) ? pkList( elem ) : pkNil );
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
function listAny( yoke, list, func, then ) {
    if ( list.tag !== "cons" )
        return then( yoke, false );
    var result = func( list.ind( 0 ) );
    if ( result )
        return then( yoke, result );
    return runWaitOne( yoke, function ( yoke ) {
        return listAny( yoke, list.ind( 1 ), func, then );
    } );
}
function listAll( yoke, list, func, then ) {
    return listAny( yoke, list, function ( yoke, elem ) {
        return !func( elem );
    }, function ( yoke, failed ) {
        return then( yoke, !failed );
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
// TODO: Use this. It'll come in handy when receiving a stack from
// user-supplied code.
function trimStack( yoke, lists ) {
    // Given a stack of lists, return the stack with all its trailing
    // nils removed.
    return listRev( yoke, lists, function ( yoke, revLists ) {
        return go( yoke, revLists );
        function go( yoke, revLists ) {
            if ( revLists.tag !== "cons" )
                return pkRet( yoke, pkNil );
            if ( revLists.ind( 0 ).tag === "cons" )
                return listRev( yoke, revLists,
                    function ( yoke, lists ) {
                    
                    return pkRet( yoke, lists );
                } );
            return runWaitOne( yoke, function ( yoke ) {
                return go( yoke, revLists.ind( 1 ) );
            } );
        }
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
        return name.tag === "string";
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function pkGetTine( names, func ) {
    return pkList( names, pkfn( function ( yoke, args ) {
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
            
            return func( yoke, bindings );
        } );
    } ) );
}

function PkRuntime() {}
PkRuntime.prototype.init_ = function () {
    var self = this;
    function defTag( name, var_args ) {
        self.defTag( pkStrName( name ), pkListFromArr(
            arrMap( [].slice.call( arguments, 1 ), function ( s ) {
                return pkStr( s );
            } ) ) );
    }
    function defMethod( name, var_args ) {
        self.defMethod( pkStrName( name ), pkListFromArr(
            arrMap( [].slice.call( arguments, 1 ), function ( s ) {
                return pkStr( s );
            } ) ) );
    }
    function defVal( name, val ) {
        self.defVal( pkStrName( name ), val );
    }
    function defMacro( name, macro ) {
        self.defMacro( pkStrName( name ), macro );
    }
    function setStrictImpl( methodName, tagName, macro ) {
        self.setStrictImpl(
            pkStrName( methodName ), pkStrName( tagName ), macro );
    }
    
    self.meta_ = strMap();
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
        if ( isLinear( listGet( args, 0 ) ) )
            return pkErr( yoke,
                "Called nonlinear-as-linear with an inner value  " +
                "that was itself linear" );
        if ( isLinear( listGet( args, 1 ) ) )
            return pkErr( yoke,
                "Called nonlinear-as-linear with a duplicator " +
                "function that was itself linear" );
        if ( isLinear( listGet( args, 2 ) ) )
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
    
    defTag( "getmac-fork", "get-tine", "maybe-macro" );
    defVal( "getmac-fork", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
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
                "Called main-binding with a non-name name" );
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
    
    // NOTE: We respect linearity in binding-interpret already, but it
    // has a strange contract. Each binding-interpret call consumes
    // only part of the list of captured values, but a top-level call
    // to binding-interpret should always consume the whole thing.
    defMethod( "binding-interpret", "self", "list-of-captured-vals" );
    setStrictImpl( "binding-interpret", "literal-binding",
        function ( yoke, args ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( yoke,
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        return pkRet( yoke, listGet( args, 0 ).ind( 0 ) );
    } );
    setStrictImpl( "binding-interpret", "main-binding",
        function ( yoke, args ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( yoke,
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        // TODO: If we ever have allowsGets() return false, and if we
        // ever allow calling methods (like this one) when it's false,
        // then uncomment this code. Until then, it will only be a
        // performance burden.
//        if ( !self.allowsGets( yoke ) )
//            return pkErr( yoke,
//                "Called binding-interpret on a main-binding " +
//                "without access to top-level definition-reading " +
//                "side effects" );
        return runRet( yoke,
            self.getVal( listGet( args, 0 ).ind( 0 ) ) );
    } );
    setStrictImpl( "binding-interpret", "call-binding",
        function ( yoke, args ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( yoke,
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        function interpretList( yoke, list, then ) {
            if ( list.tag !== "cons" )
                return then( yoke, pkNil );
            return runWaitTry( yoke, function ( yoke ) {
                return self.callMethod( yoke, "binding-interpret",
                    pkList( list.ind( 0 ), listGet( args, 1 ) ) );
            }, function ( yoke, elem ) {
                return interpretList( yoke, list.ind( 1 ),
                    function ( yoke, interpretedTail ) {
                    
                    return then( yoke,
                        pkCons( elem, interpretedTail ) );
                } );
            } );
        }
        return runWaitTry( yoke, function ( yoke ) {
            return self.callMethod( yoke, "binding-interpret", pkList(
                listGet( args, 0 ).ind( 0 ),
                listGet( args, 1 )
            ) );
        }, function ( yoke, op ) {
            return interpretList( yoke, listGet( args, 0 ).ind( 1 ),
                function ( yoke, args ) {
                
                return self.callMethod( yoke, "call",
                    pkList( op, args ) );
            } );
        } );
    } );
    setStrictImpl( "binding-interpret", "param-binding",
        function ( yoke, args ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( yoke,
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        return listGetNat(
            yoke, listGet( args, 1 ), listGet( args, 0 ).ind( 0 ),
            function ( yoke, result ) {
            
            if ( result.tag !== "yep" )
                return pkErr( yoke,
                    "Tried to interpret a param-binding that fell " +
                    "off the end of the list of captured values" );
            return pkRet( yoke, result.ind( 0 ) );
        } );
    } );
    setStrictImpl( "binding-interpret", "fn-binding",
        function ( yoke, args ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( yoke,
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        var captures = listGet( args, 0 ).ind( 0 );
        var bodyBinding = listGet( args, 0 ).ind( 1 );
        var nonlocalCaptures = listGet( args, 1 );
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
            return pkRet( yoke, pkfnLinear( captures,
                function ( yoke, captures, args ) {
                
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
                                    return go(
                                        yoke,
                                        nonlocalCaptures.ind( 1 ),
                                        argsDuplicates,
                                        pkCons( maybeNlc.ind( 0 ),
                                            revLocalCaptures )
                                    );
                                return go(
                                    yoke,
                                    nonlocalCaptures.ind( 1 ),
                                    argsDuplicates.ind( 1 ),
                                    pkCons( argsDuplicates.ind( 0 ),
                                        revLocalCaptures )
                                );
                            } );
                        }
                    } );
                } );
            } ) );
        } );
    } );
    
    defMethod( "macroexpand-to-fork", "self", "get-fork" );
    setStrictImpl( "macroexpand-to-fork", "string",
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
        if ( paramName.tag !== "string" )
            return pkErr( yoke, "Expanded fn with a non-string var" );
        function isParamName( name ) {
            return paramName.special.jsStr === name.special.jsStr;
        }
        return self.runWaitTryGetmacFork( yoke, "macroexpand-to-fork",
            function ( yoke ) {
            
            return self.callMethod( yoke, "macroexpand-to-fork",
                pkList(
                
                listGet( body, 1 ),
                pkfn( function ( yoke, args ) {
                    if ( !listLenIs( args, 1 ) )
                        return pkErrLen( yoke, args,
                            "Called a get-fork" );
                    var name = listGet( args, 0 );
                    if ( name.tag !== "string" )
                        return pkErr( yoke,
                            "Called a get-fork with a non-string " +
                            "name" );
                    if ( isParamName( name ) )
                        return pkRet( yoke, pk( "getmac-fork",
                            pkGetTine( pkList( name ),
                                function ( yoke, bindings ) {
                                
                                return pkRet( yoke,
                                    listGet( bindings, 0 ) );
                            } ),
                            pkNil
                        ) );
                    // TODO: See if we should verify the output of
                    // `nonlocalGetFork`.
                    return self.callMethod( yoke, "call",
                        pkList( nonlocalGetFork, pkList( name ) ) );
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
                            pkList( pkNil, pkNil, pkNil,
                                innerInBindings ),
                            outerNames,
                            function ( yoke, frame, outerName ) {
                            
                            var revCaptures = listGet( frame, 0 );
                            var revInnerOutBindings =
                                listGet( frame, 1 );
                            var i = listGet( frame, 2 );
                            var innerInBindingsLeft =
                                listGet( frame, 3 );
                            
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
                            var capture = pk( "yep",
                                innerInBindingsLeft.ind( 0 ) );
                            return pkRet( yoke, pkList(
                                pkCons( capture, revCaptures ),
                                newRevInnerOutBindings,
                                newI,
                                innerInBindingsLeft.ind( 1 )
                            ) );
                        }, function ( yoke, frame ) {
                            var revCaptures = listGet( frame, 0 );
                            var revInnerOutBindings =
                                listGet( frame, 1 );
                            return listRev( yoke, revCaptures,
                                function ( yoke, captures ) {
                                
                                return listRev( yoke,
                                    revInnerOutBindings,
                                    function (
                                        yoke, innerOutBindings ) {
                                    
                                    // TODO: Figure out the best way
                                    // to format this code.
                                    return runWaitTry( yoke, function ( yoke ) {
                                        return self.callMethod( yoke, "call", pkList(
                                            listGet( getTine, 1 ),
                                            pkList( innerOutBindings )
                                        ) );
                                    }, function ( yoke, bodyBinding ) {
                                        return pkRet( yoke,
                                            pk( "fn-binding",
                                                captures, bodyBinding ) );
                                    } );
                                } );
                            } );
                        } );
                    } ),
                    pkNil
                ) );
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
        return pkRet( yoke, pk( "getmac-fork",
            pkGetTine( pkNil, function ( yoke, bindings ) {
                return pkRet( yoke,
                    pk( "literal-binding", listGet( body, 0 ) ) );
            } ),
            pkNil
        ) );
    } ) );
    
    // TODO: When all the TODOs inside this macro definition are
    // complete, remove this "if ( false )".
    if ( false )
    defMacro( "if-struct", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( yoke, args,
                "Called if-struct's macroexpander" );
        var fork = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var body = listGet( args, 2 );
        if ( getFork.isLinear() )
            return pkErr( yoke,
                "Called if-struct's macroexpander with a linear " +
                "get-fork" );
        if ( !isList( body ) )
            return pkErr( yoke,
                "Called if-struct's macroexpander with a non-list " +
                "macro body" );
        if ( !listLenIs( body, 5 ) )
            return pkErrLen( yoke, body, "Expanded if-struct" );
        var tag = listGet( body, 0 );
        var structArgs = listGet( body, 1 );
        var origVal = listGet( body, 2 );
        var thenExpr = listGet( body, 3 );
        var elseExpr = listGet( body, 4 );
        if ( !isList( structArgs ) )
            return pkErr( yoke,
                "Expanded if-struct with a non-list variable list" );
        return listAll( yoke, structArgs, function ( v ) {
            return v.tag === "string";
        }, function ( yoke, correct ) {
            if ( !correct )
                return pkErr( yoke,
                    "Expanded if-struct with a non-string variable" );
            return listFoldrJs( yoke, structArgs,
                // NOTE: This function is the `init` parameter of the
                // listFoldrJs() call, not the combiner parameter.
                function ( yoke, getFork, then ) {
                    // TODO: Compile thenExpr here.
                    return then( yoke, TODO );
                },
                // NOTE: This is the combiner.
                function ( structArg, compileSubexpr ) {
                
                return function ( yoke, getFork, then ) {
                    
                    // TODO: Implement compileFn.
                    return compileFn( yoke, getFork, structArg,
                        function ( yoke, getFork, then ) {
                            return compileSubexpr( yoke, getFork,
                                function ( yoke, binding ) {
                                
                                return then( yoke, binding );
                            } );
                        },
                        function ( yoke, binding ) {
                        
                        return then( yoke, binding );
                    } );
                };
            }, function ( yoke, compileExpr ) {
                return compileExpr( yoke, getFork,
                    function ( yoke, binding ) {
                    
                    // TODO: Compile elseExpr and put the two branches
                    // together. Detect the variables captured in both
                    // branches, deduplicate them, and use that
                    // deduplicated list as a capture list for the
                    // conditional expression itself. This will be
                    // important for handling linear values; we
                    // already duplicate values whenever they're
                    // passed in as a function parameter, and now
                    // we'll also duplicate them whenever a
                    // conditional branch is taken.
                    //
                    // NOTE: When a Penknife programmer makes their
                    // own conditional syntaxes based on higher-order
                    // techniques, they should *not* pass in multiple
                    // functions, one for each branch. This technique
                    // would cause the lexically captured values to be
                    // duplicated for all the branches and then
                    // dropped for each branch that's unused. If the
                    // programmer instead passes in a single function
                    // of the form (fn ... (if ...)), this unnecessary
                    // duplication and dropping will be avoided, thus
                    // accommodating linear values which prohibit
                    // these operations.
                    //
                    return pkRet( yoke, TODO );
                } );
            } );
        } );
    } ) );
    
    defVal( "defval", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called defval" );
        if ( !isName( listGet( args, 0 ) ) )
            return pkErr( yoke,
                "Called defval with a non-name name" );
        if ( !self.allowsDefs( yoke ) )
            return pkErr( yoke,
                "Called defval without access to top-level " +
                "definition side effects" );
        return runRet( yoke,
            self.defVal( listGet( args, 0 ), listGet( args, 1 ) ) );
    } ) );
    defVal( "defmacro", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called defmacro" );
        if ( !isName( listGet( args, 0 ) ) )
            return pkErr( yoke,
                "Called defmacro with a non-name name" );
        if ( !self.allowsDefs( yoke ) )
            return pkErr( yoke,
                "Called defmacro without access to top-level " +
                "definition side effects" );
        return runRet( yoke,
            self.defMacro( listGet( args, 0 ), listGet( args, 1 ) ) );
    } ) );
    defVal( "deftag", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called deftag" );
        if ( !isName( listGet( args, 0 ) ) )
            return pkErr( yoke,
                "Called deftag with a non-string name" );
        // TODO: Verify that the keys list contains only strings.
        if ( !self.allowsDefs( yoke ) )
            return pkErr( yoke,
                "Called deftag without access to top-level " +
                "definition side effects" );
        return runRet( yoke,
            self.defTag( listGet( args, 0 ), listGet( args, 1 ) ) );
    } ) );
    defVal( "defmethod", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called defmethod" );
        if ( !isName( listGet( args, 0 ) ) )
            return pkErr( yoke,
                "Called defmethod with a non-name name" );
        // TODO: Verify that the args list contains only strings.
        if ( !self.allowsDefs( yoke ) )
            return pkErr( yoke,
                "Called defmethod without access to top-level " +
                "definition side effects" );
        return runRet( yoke,
            self.defMethod(
                listGet( args, 0 ), listGet( args, 1 ) ) );
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
        if ( !self.allowsDefs( yoke ) )
            return pkErr( yoke,
                "Called set-impl without access to top-level " +
                "definition side effects" );
        return runRet( yoke,
            self.setImpl(
                listGet( args, 0 ),
                listGet( args, 1 ),
                function ( yoke, args ) {
                    return self.callMethod( yoke, "call",
                        pkList( listGet( args, 2 ), args ) );
                } ) );
    } ) );
    
    defVal( "raise", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( yoke, args, "Called raise" );
        return pkRet( yoke, pk( "nope", listGet( args, 0 ) ) );
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
// TODO: Think of a better name for this than "distributeGetTines".
PkRuntime.prototype.distributeGetTines = function (
    yoke, getTines, bindings, then ) {
    
    var self = this;
    if ( getTines.tag !== "cons" )
        return then( yoke, pkNil );
    var getTine = getTines.ind( 0 );
    return listFoldl( yoke,
        pkList( pkNil, bindings ), listGet( getTine, 0 ),
        function ( yoke, takenRevAndNot, name ) {
            var notTaken = listGet( takenRevAndNot, 1 );
            if ( notTaken.tag !== "cons" )
                return pkErr( yoke,
                    "An internal distributeGetTines operation " +
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
                return self.distributeGetTines( yoke,
                    getTines.ind( 1 ), listGet( takenRevAndNot, 1 ),
                    function ( yoke, resultBindings ) {
                    
                    return runWaitOne( yoke, function ( yoke ) {
                        return then( yoke,
                            pkCons( resultBinding, resultBindings ) );
                    } );
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
        if ( name.tag !== "string" )
            return pkErr( yoke,
                "Called " + nameForError + " with a non-string name"
                );
        // TODO: If we ever have allowsGets() return false, uncomment
        // this code. Until then, it will only be a performance
        // burden.
//        if ( !self.allowsGets( yoke ) )
//            return pkErr( yoke,
//                "Called " + nameForError + " without access to " +
//                "top-level definition-reading side effects" );
        return runWaitTry( yoke, function ( yoke ) {
            return runRet( yoke, self.getName( name ) );
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
            // TODO: See if we should use isEnoughGetTineDeep()
            // instead. It would be inefficient, but it might be
            // necessary sometimes. Perhaps a parameter to
            // runWaitTryGetmacFork() should tell us whether or not to
            // do this.
            if ( !isEnoughGetTineShallow( getTine ) )
                return pkErr( yoke,
                    "Got an invalid get-tine from " + nameForError );
            if ( maybeMacro.tag === "nil" ) {
                // Do nothing.
            } else if ( maybeMacro.tag !== "yep" ) {
                return pkErr( yoke,
                    "Got a non-maybe value for the macro result of " +
                    nameForError );
            } else if ( maybeMacro.isLinear() ) {
                return pkErr( yoke,
                    "Got a linear value for the macro result of " +
                    nameForError );
            }
            return then( yoke, getTine, maybeMacro );
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
                            return pkRet( yoke, pk( "getmac-fork",
                                pkGetTine( allNames,
                                    function ( yoke, allBindings ) {
                                    
                                    return self.distributeGetTines(
                                        yoke,
                                        allGetTines, allBindings,
                                        function (
                                            yoke, allBindings ) {
                                        
                                        return pkRet( yoke,
                                            pk( "call-binding",
                                                allBindings.ind( 0 ),
                                                allBindings.ind( 1 ) )
                                            );
                                    } );
                                } ),
                                pkNil
                            ) );
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
PkRuntime.prototype.defVal = function ( name, val ) {
    if ( val.isLinear() )
        return pkRawErr( "Called defval with a linear value" );
    var meta = this.prepareMeta_( name, "val" );
    if ( meta === null )
        return pkRawErr(
            "Called defval with a name that was already bound to a " +
            "method" );
    meta.val = val;
    return pk( "yep", pkNil );
};
PkRuntime.prototype.defMacro = function ( name, macro ) {
    if ( macro.isLinear() )
        return pkRawErr( "Called defmacro with a linear macro" );
    var meta = this.prepareMeta_( name );
    meta.macro = macro;
    return pk( "yep", pkNil );
};
PkRuntime.prototype.defTag = function ( name, keys ) {
    if ( keys.isLinear() )
        return pkRawErr( "Called deftag with a linear args list" );
    var meta = this.prepareMeta_( name );
    if ( meta.tagKeys !== void 0 )
        return pkRawErr(
            "Called deftag with a name that was already bound to a " +
            "tag" );
    meta.tagKeys = keys;
    return pk( "yep", pkNil );
};
PkRuntime.prototype.defMethod = function ( name, args ) {
    if ( args.isLinear() )
        return pkRawErr(
            "Called defmethod with a linear args list" );
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
    
    // TODO: If we ever have allowsGets() return false, uncomment this
    // code. Until then, it will only be a performance burden.
//    if ( !this.allowsGets( yoke ) )
//        return pkErr( yoke,
//            "Called method " + methodName + " without access to " +
//            "top-level definition-reading side effects" );
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
PkRuntime.prototype.getName = function ( nameStr ) {
    // TODO: If we ever implement namespaces, complicate this method
    // to handle them.
    return pk( "yep", pkStrNameRaw( nameStr ) );
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
// TODO: If this will ever be false, uncomment it. Until then, nothing
// actually tries to call it.
//PkRuntime.prototype.allowsGets = function ( yoke ) {
//    return true;
//};
PkRuntime.prototype.allowsDefs = function ( yoke ) {
    return yoke.allowsDefs;
};
// TODO: Figure out if we should manage `allowsDefs` in a more
// encapsulated and/or generalized way.
PkRuntime.prototype.withAllowsDefs = function ( yoke, body ) {
    var empoweredYoke = {
        allowsDefs: true,
        runWaitLinear: yoke.runWaitLinear
    };
    var yokeAndResult = body( empoweredYoke );
    var disempoweredYoke = {
        allowsDefs: yoke.allowsDefs,
        runWaitLinear: yokeAndResult.yoke.runWaitLinear
    };
    return runRet( disempoweredYoke, yokeAndResult.result );
};
PkRuntime.prototype.conveniences_syncYoke =
    { allowsDefs: false, runWaitLinear: function ( step, then ) {
        return then( step( this ) );
    } };
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
        if ( typeof arrayExpr === "string" )
            return pkStr( arrayExpr );
        else if ( arrayExpr instanceof Array )
            return pkListFromArr(
                arrMap( arrayExpr, arraysToConses ) );
        else
            throw new Error();
    }
    
    return this.conveniences_macroexpand(
        arraysToConses( arrayExpr ), opt_yoke );
};
PkRuntime.prototype.conveniences_interpretBinding = function (
    binding, opt_yoke ) {
    
    var self = this;
    if ( opt_yoke === void 0 )
        opt_yoke = self.conveniences_syncYoke;
    return self.withAllowsDefs( opt_yoke, function ( yoke ) {
        return self.callMethod( yoke, "binding-interpret",
            pkList( binding, pkNil ) );
    } );
};
function makePkRuntime() {
    return new PkRuntime().init_();
}

// TODO: Define more useful utilities, including conditionals and
// assignment.
