// era-penknife.js
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";

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
function pk( tag, var_args ) {
    var args = pkListFromArr( [].slice.call( arguments, 1 ) );
    return new Pk().init_( null, tag, args, args.isLinear(), {} );
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
    function go( yoke, a, b ) {
        if ( a.tag === "nil" && b.tag === "nil" )
            return runRet( yoke, true );
        if ( !(a.tag === "cons" && b.tag === "cons") )
            return runRet( yoke, false );
        return runWaitOne( yoke, function ( yoke ) {
            return go( yoke, a.ind( 1 ), b.ind( 1 ) );
        } );
    }
    return runWait( yoke, function ( yoke ) {
        return go( yoke, a, b );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function listLenIsNat( yoke, list, nat, then ) {
    function go( yoke, list, nat ) {
        if ( list.tag === "nil" && nat.tag === "nil" )
            return runRet( yoke, true );
        if ( !(list.tag === "cons" && nat.tag === "succ") )
            return runRet( yoke, false );
        return runWaitOne( yoke, function ( yoke ) {
            return go( yoke, list.ind( 1 ), nat.ind( 0 ) );
        } );
    }
    return runWait( yoke, function ( yoke ) {
        return go( yoke, list, nat );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function lenPlusNat( yoke, list, nat, then ) {
    function go( yoke, list, nat ) {
        if ( list.tag !== "cons" )
            return runRet( yoke, nat );
        return runWaitOne( yoke, function ( yoke ) {
            return go( yoke, list.ind( 1 ), pk( "succ", nat ) );
        } );
    }
    return runWait( yoke, function ( yoke ) {
        return go( yoke, list, nat );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function listGetNat( yoke, list, nat, then ) {
    function go( yoke, list, nat ) {
        if ( list.tag !== "cons" )
            return runRet( yoke, pkNil );
        if ( nat.tag !== "succ" )
            return runRet( yoke, pk( "yep", list.ind( 0 ) ) );
        return runWaitOne( yoke, function ( yoke ) {
            return go( yoke, list.ind( 1 ), nat.ind( 0 ) );
        } );
    }
    return runWait( yoke, function ( yoke ) {
        return go( yoke, list, nat );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function listRevAppend( yoke, backwardFirst, forwardSecond, then ) {
    function go( yoke, backwardFirst, forwardSecond ) {
        if ( backwardFirst.tag !== "cons" )
            return runRet( yoke, forwardSecond );
        return runWaitOne( yoke, function ( yoke ) {
            return go( yoke,
                backwardFirst.ind( 1 ),
                pkCons( backwardFirst.ind( 0 ), forwardSecond ) );
        } );
    }
    return runWait( yoke, function ( yoke ) {
        return go( yoke, backwardFirst, forwardSecond );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function listAppend( yoke, a, b, then ) {
    return listRevAppend( yoke, a, pkNil, function ( yoke, revA ) {
        return listRevAppend( yoke, revA, b,
            function ( yoke, result ) {
            
            return then( yoke, result );
        } );
    } );
}
function listFlatten( yoke, list, then ) {
    // TODO: See if there's a more efficient way to do this.
    if ( list.tag !== "cons" )
        return then( yoke, pkNil );
    if ( list.ind( 1 ).tag !== "cons" )
        return then( yoke, list.ind( 0 ) );
    return runWaitOne( yoke, function ( yoke ) {
        return listFlatten( yoke, list.ind( 1 ),
            function ( yoke, flatTail ) {
            
            return listAppend( yoke, list.ind( 0 ), flatTail,
                function ( yoke, result ) {
                
                return then( yoke, result );
            } );
        } );
    } );
}
function listMap( yoke, list, func, then ) {
    return go( yoke, list, pkNil );
    function go( yoke, list, revResults ) {
        if ( list.tag !== "cons" )
            return listRevAppend( yoke, revResults, pkNil,
                function ( yoke, results ) {
                
                return then( yoke, results );
            } );
        return runWaitTry( yoke, function ( yoke ) {
            return func( yoke, list.ind( 0 ) );
        }, function ( yoke, resultElem ) {
            return go( yoke,
                list.ind( 1 ), pkCons( resultElem, revResults ) );
        } );
    }
}
function listCount( yoke, list, func, then ) {
    return go( yoke, list, pkNil );
    function go( yoke, list, count ) {
        if ( list.tag !== "cons" )
            return then( yoke, count );
        return runWaitOne( yoke, function ( yoke ) {
            if ( func( list.ind( 0 ) ) )
                return go( yoke, list.ind( 1 ), pk( "succ", count ) );
            return go( yoke, list.ind( 1 ), count );
        } );
    }
}
function listAny( yoke, list, func, then ) {
    return go( yoke, list );
    function go( yoke, list ) {
        if ( list.tag !== "cons" )
            return then( yoke, false );
        return runWaitOne( yoke, function ( yoke ) {
            var result = func( list.ind( 0 ) );
            if ( result )
                return then( yoke, result );
            return go( yoke, list.ind( 1 ) );
        } );
    }
}
function listMapMultiWithLen( yoke, nat, lists, func, then ) {
    return go( yoke, nat, lists, pkNil );
    function go( yoke, nat, lists, revResults ) {
        if ( nat.tag !== "succ" )
            return listRevAppend( yoke, revResults, pkNil,
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
function appendStacks( yoke, stacks ) {
    // Given a list of stacks of lists, where the stacks are
    // conceptually infinite with nils at the end, return a stack that
    // concatenates the lists in the original stacks.
    return listAny( yoke, stacks, function ( stack ) {
        return stack.tag === "cons";
    }, function ( yoke, moreToGo ) {
        if ( !moreToGo )
            return pkRet( yoke, pkNil );
        return listMap( yoke, stacks, function ( yoke, stack ) {
            return pkRet( yoke,
                stack.tag === "cons" ? stack.ind( 0 ) : pkNil );
        }, function ( yoke, heads ) {
            return listMap( yoke, stacks, function ( yoke, stack ) {
                return pkRet( yoke,
                    stack.tag === "cons" ? stack.ind( 1 ) : pkNil );
            }, function ( yoke, tails ) {
                return listFlatten( yoke, heads,
                    function ( yoke, flatHead ) {
                    
                    return runWaitTry( yoke, function ( yoke ) {
                        return appendStacks( yoke, tails );
                    }, function ( yoke, flatTail ) {
                        return pkRet( yoke,
                            pkCons( flatHead, flatTail ) );
                    } );
                } );
            } );
        } );
    } );
}
function lensPlusNats( yoke, lists, nats ) {
    // Given a stack of lists and a stack of nats, where the stacks
    // are conceptually infinite with empty lists or zeros at the end,
    // return a stack of nats that sums the length of each list with
    // the corresponding nat.
    if ( !(lists.tag === "cons" || nats.tag === "cons") )
        return pkRet( yoke, pkNil );
    if ( lists.tag !== "cons" )
        lists = pkList( pkNil );
    if ( nats.tag !== "cons" )
        nats = pkList( pkNil );
    
    return lenPlusNat( yoke, lists.ind( 0 ), nats.ind( 0 ),
        function ( yoke, head ) {
        
        return runWaitTry( yoke, function ( yoke ) {
            return lensPlusNats(
                yoke, lists.ind( 1 ), nats.ind( 1 ) );
        }, function ( yoke, tail ) {
            return pkRet( yoke, pkCons( head, tail ) );
        } );
    } );
}
// TODO: Use this. It'll come in handy when receiving a stack from
// user-supplied code.
function trimStack( yoke, lists ) {
    // Given a stack of lists, return the stack with all its trailing
    // nils removed.
    return listRevAppend( yoke, lists, pkNil,
        function ( yoke, revLists ) {
        
        return go( yoke, revLists );
        function go( yoke, revLists ) {
            if ( revLists.tag !== "cons" )
                return pkRet( yoke, pkNil );
            if ( revLists.ind( 0 ).tag === "cons" )
                return listRevAppend( yoke, revLists, pkNil,
                    function ( yoke, lists ) {
                    
                    return pkRet( yoke, lists );
                } );
            return runWaitOne( yoke, function ( yoke ) {
                return go( yoke, revLists.ind( 1 ) );
            } );
        }
    } );
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
    
    defTag( "getmac-fork", "binding", "captures", "macro" );
    defVal( "getmac-fork", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( yoke, args, "Called getmac-fork" );
        // TODO: Verify that `listGet( args, 2 )` is a stack of lists
        // of maybes of bindings.
        return pkRet( yoke,
            pk( "getmac-fork",
                listGet( args, 0 ),
                listGet( args, 1 ),
                listGet( args, 2 ) ) );
    } ) );
    defMethod( "fork-to-getmac", "fork" );
    setStrictImpl( "fork-to-getmac", "getmac-fork",
        function ( yoke, args ) {
        
        var fork = listGet( args, 0 );
        return pkRet( yoke,
            pkList( fork.ind( 0 ), fork.ind( 1 ), fork.ind( 2 ) ) );
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
        function interpretList( yoke, list ) {
            if ( list.tag !== "cons" )
                return pkRet( yoke, pkNil );
            return runWaitTry( yoke, function ( yoke ) {
                return self.callMethod( yoke, "binding-interpret",
                    pkList( list.ind( 0 ), listGet( args, 1 ) ) );
            }, function ( yoke, elem ) {
                return runWaitTry( yoke, function ( yoke ) {
                    return interpretList( yoke, list.ind( 1 ) );
                }, function ( yoke, interpretedTail ) {
                    return pkRet( yoke,
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
            return runWaitTry( yoke, function ( yoke ) {
                return interpretList(
                    yoke, listGet( args, 0 ).ind( 1 ) );
            }, function ( yoke, args ) {
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
                        return pkDup(
                            yoke, self, args, argsDupCount );
                    }, function ( yoke, argsDuplicates ) {
                        return go(
                            yoke, captures, argsDuplicates, pkNil );
                        function go(
                            yoke, nonlocalCaptures, argsDuplicates,
                            revLocalCaptures ) {
                            
                            if ( nonlocalCaptures.tag !== "cons" )
                                return listRevAppend(
                                    yoke, revLocalCaptures, pkNil,
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
    
    defMethod( "macroexpand-to-fork",
        "self", "get-fork", "capture-counts" );
    setStrictImpl( "macroexpand-to-fork", "string",
        function ( yoke, args ) {
        
        var expr = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var captureCounts = listGet( args, 2 );
        if ( getFork.isLinear() )
            return pkErr( yoke,
                "Called macroexpand-to-fork with a linear get-fork" );
        // TODO: Verify that `captureCounts` is a stack of nats.
        if ( !isList( captureCounts ) )
            return pkErr( yoke,
                "Called macroexpand-to-fork with a non-list stack " +
                "of capture counts" );
        return runWaitOne( yoke, function ( yoke ) {
            return self.callMethod( yoke, "call",
                pkList( getFork, pkList( expr, captureCounts ) ) );
        } );
    } );
    setStrictImpl( "macroexpand-to-fork", "cons",
        function ( yoke, args ) {
        
        var expr = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var captureCounts = listGet( args, 2 );
        if ( getFork.isLinear() )
            return pkErr( yoke,
                "Called macroexpand-to-fork with a linear get-fork" );
        // TODO: Verify that `captureCounts` is a stack of nats.
        if ( !isList( captureCounts ) )
            return pkErr( yoke,
                "Called macroexpand-to-fork with a non-list stack " +
                "of capture counts" );
        return runWaitTry( yoke, function ( yoke ) {
            return self.callMethod( yoke, "macroexpand-to-fork",
                pkList( expr.ind( 0 ), getFork, captureCounts ) );
        }, function ( yoke, opFork ) {
            return runWaitTryGetmacFork( self, yoke,
                "macroexpand-to-fork",
                function ( yoke ) {
                
                return pkRet( yoke, opFork );
            }, function ( yoke, binding, captures, maybeMacro ) {
                var macroexpander = maybeMacro.tag === "yep" ?
                    maybeMacro.ind( 0 ) :
                    nonMacroMacroexpander( self );
                return self.callMethod( yoke, "call", pkList(
                    macroexpander,
                    pkList(
                        opFork,
                        getFork,
                        captureCounts,
                        expr.ind( 1 )
                    )
                ) );
            } );
        } );
    } );
    
    defMacro( "fn", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 4 ) )
            return pkErrLen( yoke, args,
                "Called fn's macroexpander" );
        var fork = listGet( args, 0 );
        var nonlocalGetFork = listGet( args, 1 );
        var captureCounts = listGet( args, 2 );
        var body = listGet( args, 3 );
        if ( nonlocalGetFork.isLinear() )
            return pkErr( yoke,
                "Called fn's macroexpander with a linear get-fork" );
        // TODO: Verify that `captureCounts` is a stack of nats.
        if ( !isList( captureCounts ) )
            return pkErr( yoke,
                "Called fn's macroexpander with a non-list stack " +
                "of capture counts" );
        if ( !isList( body ) )
            return pkErr( yoke,
                "Called fn's macroexpander with a non-list macro body"
                );
        if ( !listLenIs( body, 2 ) )
            return pkErrLen( yoke, body, "Expanded fn" );
        if ( listGet( body, 0 ).tag !== "string" )
            return pkErr( yoke, "Expanded fn with a non-string var" );
        var jsName = listGet( body, 0 ).special.jsStr;
        return runWaitTryGetmacFork( self, yoke,
            "macroexpand-to-fork",
            function ( yoke ) {
            
            return self.callMethod( yoke, "macroexpand-to-fork",
                pkList(
                
                listGet( body, 1 ),
                pkfn( function ( yoke, args ) {
                    if ( !listLenIs( args, 2 ) )
                        return pkErrLen( yoke, args,
                            "Called a get-fork" );
                    var name = listGet( args, 0 );
                    var captureCounts = listGet( args, 1 );
                    if ( name.tag !== "string" )
                        return pkErr( yoke,
                            "Called a get-fork with a non-string " +
                            "name" );
                    // TODO: Verify that `captureCounts` is a stack of
                    // nats.
                    if ( !isList( captureCounts ) )
                        return pkErr( yoke,
                            "Called a get-fork with a non-list " +
                            "stack of capture counts" );
                    if ( captureCounts.tag === "nil" )
                        captureCounts = pkList( pkNil );
                    if ( jsName === name.special.jsStr )
                        return pkRet( yoke, pk( "getmac-fork",
                            pk( "param-binding",
                                captureCounts.ind( 0 ) ),
                            pkList( pkList( pkNil ) ),
                            pkNil
                        ) );
                    return runWaitTryGetmacFork( self, yoke,
                        "a get-fork",
                        function ( yoke ) {
                        
                        return self.callMethod( yoke, "call", pkList(
                            nonlocalGetFork,
                            pkList( name, captureCounts.ind( 1 ) )
                        ) );
                    }, function (
                        yoke, captureBinding,
                        nonlocalCaptureFrames, maybeMacro ) {
                        
                        return pkRet( yoke, pk( "getmac-fork",
                            pk( "param-binding",
                                captureCounts.ind( 0 ) ),
                            pkCons(
                                pkList( pk( "yep", captureBinding ) ),
                                nonlocalCaptureFrames ),
                            maybeMacro
                        ) );
                    } );
                } ),
                pkCons( pkNil, captureCounts )
            ) );
        }, function (
            yoke, bodyBinding, localCaptureFrames, maybeMacro ) {
            
            if ( localCaptureFrames.tag === "nil" )
                localCaptureFrames = pkList( pkNil );
            return pkRet( yoke, pk( "getmac-fork",
                pk( "fn-binding",
                    localCaptureFrames.ind( 0 ), bodyBinding ),
                localCaptureFrames.ind( 1 ),
                pkNil
            ) );
       } );
    } ) );
    
    defMacro( "quote", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 4 ) )
            return pkErrLen( yoke, args,
                "Called quote's macroexpander" );
        var fork = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var captureCounts = listGet( args, 2 );
        var body = listGet( args, 3 );
        if ( getFork.isLinear() )
            return pkErr( yoke,
                "Called quote's macroexpander with a linear get-fork"
                );
        // TODO: Verify that `captureCounts` is a stack of nats.
        if ( !isList( captureCounts ) )
            return pkErr( yoke,
                "Called quote's macroexpander with a non-list " +
                "stack of capture counts" );
        if ( !isList( body ) )
            return pkErr( yoke,
                "Called quote's macroexpander with a non-list " +
                "macro body" );
        if ( !listLenIs( body, 1 ) )
            return pkErrLen( yoke, body, "Expanded quote" );
        return pkRet( yoke, pk( "getmac-fork",
            pk( "literal-binding", listGet( body, 0 ) ),
            pkNil,
            pkNil
        ) );
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
    defVal( "deflineartag", pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( yoke, args, "Called deftag" );
        if ( !isName( listGet( args, 0 ) ) )
            return pkErr( yoke,
                "Called deflineartag with a non-name name" );
        // TODO: Verify that the keys list contains only strings.
        if ( !self.allowsDefs( yoke ) )
            return pkErr( yoke,
                "Called deflineartag without access to top-level " +
                "definition side effects" );
        return runRet( yoke,
            self.defLinearTag(
                listGet( args, 0 ),
                listGet( args, 1 ),
                listGet( args, 2 ) ) );
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
function pkDup( yoke, pkRuntime, val, count ) {
    
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
    if ( val.tag === "cons" )
        return withDups( pkList( val.ind( 0 ), val.ind( 1 ) ),
            function ( args ) {
            
            return pkCons( listGet( args, 0 ), listGet( args, 1 ) );
        } );
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
    if ( val.special.dup !== void 0 )
        return runWaitTry( yoke, function ( yoke ) {
            return pkRuntime.callMethod( yoke, "call",
                pkList( val.special.dup, pkList( val, count ) ) );
        }, function ( yoke, result ) {
            return listLenIsNat( yoke, result, count,
                function ( yoke, correct ) {
                
                if ( !correct )
                    return pkErr( yoke,
                        "Got a list of incorrect length from a " +
                        "linear value's custom dup function." );
                return pkRet( yoke, result );
            } );
        } );
    return withDups( val.args, function ( args ) {
        return new Pk().init_(
            val.tagName, val.tag, args, !!"isLinear", {} );
    } );
    function withDups( args, reconstruct ) {
        return listMap( yoke, args, function ( yoke, arg ) {
            return pkDup( yoke, pkRuntime, arg, count );
        }, function ( yoke, argsDuplicates ) {
            return listMapMultiWithLen( yoke, count, argsDuplicates,
                function ( yoke, args ) {
                
                return pkRet( yoke, reconstruct( args ) );
            }, function ( yoke, result ) {
                return pkRet( yoke, result );
            } );
        } );
    }
}
function forkGetter( pkRuntime, nameForError ) {
    return pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( yoke, args, "Called " + nameForError );
        var name = listGet( args, 0 );
        var captureCounts = listGet( args, 1 );
        if ( name.tag !== "string" )
            return pkErr( yoke,
                "Called " + nameForError + " with a non-string name"
                );
        // TODO: Verify that `captureCounts` is a stack of
        // nats.
        if ( !isList( captureCounts ) )
            return pkErr( yoke,
                "Called " + nameForError + " with a non-list stack " +
                "of capture counts" );
        // TODO: If we ever have allowsGets() return false, uncomment
        // this code. Until then, it will only be a performance
        // burden.
//        if ( !self.allowsGets( yoke ) )
//            return pkErr( yoke,
//                "Called " + nameForError + " without access to " +
//                "top-level definition-reading side effects" );
        return runWaitTry( yoke, function ( yoke ) {
            return runRet( yoke, pkRuntime.getName( name ) );
        }, function ( yoke, name ) {
            return runWaitTry( yoke, function ( yoke ) {
                return runRet( yoke, pkRuntime.getMacro( name ) );
            }, function ( yoke, maybeMacro ) {
                return pkRet( yoke, pk( "getmac-fork",
                    pk( "main-binding", name ),
                    pkNil,
                    maybeMacro
                ) );
            } );
        } );
    } );
}
function runWaitTryGetmacFork(
    pkRuntime, yoke, nameForError, func, then ) {
    
    return runWaitTry( yoke, function ( yoke ) {
        return func( yoke );
    }, function ( yoke, fork ) {
        return runWaitTry( yoke, function ( yoke ) {
            return pkRuntime.callMethod( yoke, "fork-to-getmac",
                pkList( fork ) );
        }, function ( yoke, results ) {
            if ( !(isList( results ) && listLenIs( results, 3 )) )
                return pkErr( yoke,
                    "Got a non-triple from " + nameForError );
            var opBinding = listGet( results, 0 );
            var captures = listGet( results, 1 );
            var maybeMacro = listGet( results, 2 );
            // TODO: See if we should verify that `captures` is a
            // stack of lists of maybes of bindings. It would be
            // inefficient, but it might be necessary sometimes.
            // Perhaps a parameter to runWaitTryGetmacFork() should
            // tell us whether or not to do this.
            if ( !isList( captures ) )
                return pkErr( yoke,
                    "Got non-list captures from " + nameForError );
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
            return then( yoke, opBinding, captures, maybeMacro );
        } );
    } );
}
function nonMacroMacroexpander( pkRuntime ) {
    return pkfn( function ( yoke, args ) {
        if ( !listLenIs( args, 4 ) )
            return pkErrLen( yoke, args,
                "Called a non-macro's macroexpander" );
        var fork = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var captureCounts = listGet( args, 2 );
        var argsList = listGet( args, 3 );
        if ( getFork.isLinear() )
            return pkErr( yoke,
                "Called a non-macro's macroexpander with a linear " +
                "get-fork" );
        // TODO: See if we should verify that `captureCounts` is a
        // stack of nats.
        if ( !isList( captureCounts ) )
            return pkErr( yoke,
                "Called a non-macro's macroexpander with a " +
                "non-list stack of capture counts." );
        if ( !isList( argsList ) )
            return pkErr( yoke,
                "Called a non-macro's macroexpander with a " +
                "non-list args list" );
        return runWaitTryGetmacFork( pkRuntime, yoke,
            "the fork parameter to a non-macro's macroexpander",
            function ( yoke ) {
            
            return pkRet( yoke, fork );
        }, function (
            yoke, funcBinding, funcCaptures, funcMaybeMacro ) {
            
            return runWaitTry( yoke, function ( yoke ) {
                return lensPlusNats(
                    yoke, funcCaptures, captureCounts );
            }, function ( yoke, captureCounts ) {
                return parseList(
                    yoke, argsList, captureCounts,
                    pkList( funcCaptures ), pkNil );
            } );
            function parseList(
                yoke, list, captureCounts,
                revCapturesSoFar, revBindingsSoFar ) {
                
                if ( list.tag !== "cons" )
                    return listRevAppend(
                        yoke, revCapturesSoFar, pkNil,
                        function ( yoke, captures ) {
                        
                        return runWaitTry( yoke, function ( yoke ) {
                            return appendStacks( yoke, captures );
                        }, function ( yoke, captures ) {
                            return listRevAppend(
                                yoke, revBindingsSoFar, pkNil,
                                function ( yoke, bindings ) {
                                
                                return pkRet( yoke, pk( "getmac-fork",
                                    pk( "call-binding",
                                        funcBinding, bindings ),
                                    captures,
                                    pkNil
                                ) );
                            } );
                        } );
                    } );
                return runWaitTryGetmacFork( pkRuntime, yoke,
                    "macroexpand-to-fork",
                    function ( yoke ) {
                    
                    return pkRuntime.callMethod( yoke,
                        "macroexpand-to-fork",
                        pkList(
                            list.ind( 0 ), getFork, captureCounts ) );
                }, function ( yoke, binding, captures, maybeMacro ) {
                    // TODO: Verify that `captures` is a stack of
                    // lists of maybes of bindings.
                    return runWaitTry( yoke, function ( yoke ) {
                        return lensPlusNats(
                            yoke, captures, captureCounts );
                    }, function ( yoke, captureCounts ) {
                        return parseList(
                            yoke,
                            list.ind( 1 ),
                            captureCounts,
                            pkCons( captures, revCapturesSoFar ),
                            pkCons( binding, revBindingsSoFar ) );
                    } );
                } );
            }
        } );
    } );
}
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
    meta.dup = null;
    return pk( "yep", pkNil );
};
PkRuntime.prototype.defLinearTag = function ( name, keys, dup ) {
    if ( keys.isLinear() )
        return pkRawErr(
            "Called deflineartag with a linear args list" );
    if ( dup.isLinear() )
        return pkRawErr(
            "Called deflineartag with a linear dup function" );
    var meta = this.prepareMeta_( name );
    if ( meta.tagKeys !== void 0 )
        return pkRawErr(
            "Called deflineartag with a name that was already " +
            "bound to a tag" );
    meta.tagKeys = keys;
    meta.dup = dup;
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
    
    var methodMeta = this.meta_.get( methodName );
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
                        meta.dup !== null || args.isLinear(),
                        meta.dup === null ? {} : { dup: meta.dup }
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
    return runWaitTryGetmacFork( self, opt_yoke,
        "macroexpand-to-fork",
        function ( yoke ) {
        
        return self.callMethod( yoke, "macroexpand-to-fork", pkList(
            expr,
            forkGetter( self, "the top-level get-fork" ),
            pkNil
        ) );
    }, function ( yoke, binding, captures, maybeMacro ) {
        
        // Verify `captures` is a stack of *empty* lists of maybes of
        // bindings.
        return listAny( yoke, captures, function ( bindings ) {
            return bindings.tag !== "nil";
        }, function ( yoke, incorrect ) {
            if ( incorrect )
                return pkErr( yoke,
                    "Got a top-level macroexpansion result with " +
                    "captures" );
            
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
