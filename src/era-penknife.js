// era-penknife.js
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";

function Pk() {}
Pk.prototype.init_ = function ( tag, args, isLinear, special ) {
    this.tag = tag;
    this.args_ = args;
    this.isLinear_ = isLinear;
    this.special = special;
    return this;
};
Pk.prototype.ind = function ( i ) {
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
    return "(" + this.tag + spaceBefore( this.args_ ) + ")";
};
var pkNil =
    new Pk().init_( "nil", null, !"isLinear", { argsArr: [] } );
function pkCons( first, rest ) {
    return new Pk().init_(
        "cons", null, first.isLinear() || rest.isLinear(),
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
    return new Pk().init_( tag, args, args.isLinear(), {} );
}
function pkStr( jsStr ) {
    return new Pk().init_( "string", pkNil, !"isLinear",
        { jsStr: jsStr } );
}
function pkfnLinear( captures, call ) {
    return new Pk().init_( "fn", pkNil, captures.isLinear(),
        { captures: captures, call: call, string: "" + call } );
}
function pkfn( call ) {
    return new Pk().init_( "fn", pkNil, !"isLinear", {
        captures: pkNil,
        call: function ( captures, args, next ) {
            return call( args, next );
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
function runRet( next, val ) {
    return { result: val, next: next };
}
function pkRet( next, val ) {
    return runRet( next, pk( "yep", val ) );
}
function pkRawErr( jsStr ) {
    return pk( "nope", pkStr( jsStr ) );
}
function pkErr( next, jsStr ) {
    return runRet( next, pkRawErr( jsStr ) );
}
function pkErrLen( next, args, message ) {
    var len = listLenBounded( args, 100 );
    return pkErr( next, "" + message + " with " + (
        len === null ? "way too many args" :
        len === 1 ? "1 arg" :
            "" + len + " args") );
}
function runWait( next, func, then ) {
    return next.runWaitLinear( function ( next ) {
        return func( next );
    }, function ( resultAndNext ) {
        return then( resultAndNext.result, resultAndNext.next );
    } );
}
function runWaitTry( next, func, then ) {
    return runWait( next, function ( next ) {
        return func( next );
    }, function ( tryVal, next ) {
        if ( tryVal.tag !== "yep" )
            return runRet( next, tryVal );
        return then( tryVal.ind( 0 ), next );
    } );
}
function runWaitOne( next, then ) {
    return runWait( next, function ( next ) {
        return runRet( next, null );
    }, function ( ignored, next ) {
        return then( next );
    } );
}
function listLenEq( a, b, next, then ) {
    function go( a, b, next ) {
        if ( a.tag === "nil" && b.tag === "nil" )
            return runRet( next, true );
        if ( !(a.tag === "cons" && b.tag === "cons") )
            return runRet( next, false );
        return runWaitOne( next, function ( next ) {
            return go( a.ind( 1 ), b.ind( 1 ), next );
        } );
    }
    return runWait( next, function ( next ) {
        return go( a, b, next );
    }, function ( result, next ) {
        return then( result, next );
    } );
}
function listLenIsNat( list, nat, next, then ) {
    function go( list, nat, next ) {
        if ( list.tag === "nil" && nat.tag === "nil" )
            return runRet( next, true );
        if ( !(list.tag === "cons" && nat.tag === "succ") )
            return runRet( next, false );
        return runWaitOne( next, function ( next ) {
            return go( list.ind( 1 ), nat.ind( 0 ), next );
        } );
    }
    return runWait( next, function ( next ) {
        return go( list, nat, next );
    }, function ( result, next ) {
        return then( result, next );
    } );
}
function lenPlusNat( list, nat, next, then ) {
    function go( list, nat, next ) {
        if ( list.tag !== "cons" )
            return runRet( next, nat );
        return runWaitOne( next, function ( next ) {
            return go( list.ind( 1 ), pk( "succ", nat ), next );
        } );
    }
    return runWait( next, function ( next ) {
        return go( list, nat, next );
    }, function ( result, next ) {
        return then( result, next );
    } );
}
function listGetNat( list, nat, next, then ) {
    function go( list, nat, next ) {
        if ( list.tag !== "cons" )
            return runRet( next, pkNil );
        if ( nat.tag !== "succ" )
            return runRet( next, pk( "yep", list.ind( 0 ) ) );
        return runWaitOne( next, function ( next ) {
            return go( list.ind( 1 ), nat.ind( 0 ), next );
        } );
    }
    return runWait( next, function ( next ) {
        return go( list, nat, next );
    }, function ( result, next ) {
        return then( result, next );
    } );
}
function listRevAppend( backwardFirst, forwardSecond, next, then ) {
    function go( backwardFirst, forwardSecond, next ) {
        if ( backwardFirst.tag !== "cons" )
            return runRet( next, forwardSecond );
        return runWaitOne( next, function ( next ) {
            return go(
                backwardFirst.ind( 1 ),
                pkCons( backwardFirst.ind( 0 ), forwardSecond ),
                next );
        } );
    }
    return runWait( next, function ( next ) {
        return go( backwardFirst, forwardSecond, next );
    }, function ( result, next ) {
        return then( result, next );
    } );
}
function listAppend( a, b, next, then ) {
    return listRevAppend( a, pkNil, next, function ( revA, next ) {
        return listRevAppend( revA, b, next,
            function ( result, next ) {
            
            return then( result, next );
        } );
    } );
}
function listFlatten( list, next, then ) {
    // TODO: See if there's a more efficient way to do this.
    if ( list.tag !== "cons" )
        return then( pkNil, next );
    if ( list.ind( 1 ).tag !== "cons" )
        return then( list.ind( 0 ), next );
    return runWaitOne( next, function ( next ) {
        return listFlatten( list.ind( 1 ), next,
            function ( flatTail, next ) {
            
            return listAppend( list.ind( 0 ), flatTail, next,
                function ( result, next ) {
                
                return then( result, next );
            } );
        } );
    } );
}
function listRevFlatten( list, next, then ) {
    // Do flatten( reverse( list ) ).
    // TODO: See if there's a more efficient way to do this.
    
    return listRevAppend( list, pkNil, next, function ( list, next ) {
        return listFlatten( list, next, function ( result, next ) {
            return then( result, next );
        } );
    } );
}
function listMap( list, next, func, then ) {
    return go( list, pkNil, next );
    function go( list, revResults, next ) {
        if ( list.tag !== "cons" )
            return listRevAppend( revResults, pkNil, next,
                function ( results, next ) {
                
                return then( results, next );
            } );
        return runWaitTry( next, function ( next ) {
            return func( list.ind( 0 ), next );
        }, function ( resultElem, next ) {
            return go( list.ind( 1 ),
                pkCons( resultElem, revResults ), next );
        } );
    }
}
function natMap( nat, next, func, then ) {
    return go( nat, pkNil, next );
    function go( nat, revResults, next ) {
        if ( nat.tag !== "succ" )
            return listRevAppend( revResults, pkNil, next,
                function ( results, next ) {
                
                return then( results, next );
            } );
        return runWaitTry( next, function ( next ) {
            return func( nat, next );
        }, function ( resultElem, next ) {
            return go( nat.ind( 0 ),
                pkCons( resultElem, revResults ), next );
        } );
    }
}
function listCount( list, next, func, then ) {
    return go( list, pkNil, next );
    function go( list, count, next ) {
        if ( list.tag !== "cons" )
            return then( count, next );
        return runWaitOne( next, function ( next ) {
            if ( func( list.ind( 0 ) ) )
                return go( list.ind( 1 ), pk( "succ", count ), next );
            return go( list.ind( 1 ), count, next );
        } );
    }
}
function listAny( list, next, func, then ) {
    return go( list, next );
    function go( list, next ) {
        if ( list.tag !== "cons" )
            return then( false, next );
        return runWaitOne( next, function ( next ) {
            var result = func( list.ind( 0 ) );
            if ( result )
                return then( result, next );
            return go( list.ind( 1 ), next );
        } );
    }
}
function listMapMultiWithLen( nat, lists, next, func, then ) {
    return go( nat, lists, pkNil, next );
    function go( nat, lists, revResults, next ) {
        if ( nat.tag !== "succ" )
            return listRevAppend( revResults, pkNil, next,
                function ( results, next ) {
                
                return then( results, next );
            } );
        return listMap( lists, next, function ( list, next ) {
            return pkRet( next, list.ind( 0 ) );
        }, function ( firsts, next ) {
            return listMap( lists, next, function ( list, next ) {
                return pkRet( next, list.ind( 1 ) );
            }, function ( rests, next ) {
                return runWaitTry( next, function ( next ) {
                    return func( firsts, next );
                }, function ( resultElem ) {
                    return go( nat.ind( 0 ), rests,
                        pkCons( resultElem, revResults ), next );
                } );
            } );
        } );
    }
}
function appendStacks( stacks, next ) {
    // Given a list of stacks of lists, where the stacks are
    // conceptually infinite with nils at the end, return a stack that
    // concatenates the lists in the original stacks.
    return listAny( stacks, next, function ( stack ) {
        return stack.tag === "cons";
    }, function ( moreToGo, next ) {
        if ( !moreToGo )
            return pkRet( next, pkNil );
        return listMap( stacks, next, function ( stack, next ) {
            return pkRet( next,
                stack.tag === "cons" ? stack.ind( 0 ) : pkNil );
        }, function ( heads, next ) {
            return listMap( stacks, next, function ( stack, next ) {
                return pkRet( next,
                    stack.tag === "cons" ? stack.ind( 1 ) : pkNil );
            }, function ( tails, next ) {
                return listFlatten( heads, next,
                    function ( flatHead, next ) {
                    
                    return runWaitTry( next, function ( next ) {
                        return appendStacks( tails, next );
                    }, function ( flatTail, next ) {
                        return pkRet( next,
                            pkCons( flatHead, flatTail ) );
                    } );
                } );
            } );
        } );
    } );
}
function lensPlusNats( lists, nats, next ) {
    // Given a stack of lists and a stack of nats, where the stacks
    // are conceptually infinite with empty lists or zeros at the end,
    // return a stack of nats that sums the length of each list with
    // the corresponding nat.
    if ( !(lists.tag === "cons" || nats.tag === "cons") )
        return pkRet( next, pkNil );
    if ( lists.tag !== "cons" )
        lists = pkList( pkNil );
    if ( nats.tag !== "cons" )
        nats = pkList( pkNil );
    
    return lenPlusNat( lists.ind( 0 ), nats.ind( 0 ), next,
        function ( head, next ) {
        
        return runWaitTry( next, function ( next ) {
            return lensPlusNats(
                lists.ind( 1 ), nats.ind( 1 ), next );
        }, function ( tail, next ) {
            return pkRet( next, pkCons( head, tail ) );
        } );
    } );
}
// TODO: Use this. It'll come in handy when receiving a stack from
// user-supplied code.
function trimStack( lists, next ) {
    // Given a stack of lists, return the stack with all its trailing
    // nils removed.
    return listRevAppend( lists, pkNil, next,
        function ( revLists, next ) {
        
        return go( revLists, next );
        function go( revLists, next ) {
            if ( revLists.tag !== "cons" )
                return pkRet( next, pkNil );
            if ( revLists.ind( 0 ).tag === "cons" )
                return listRevAppend( revLists, pkNil, next,
                    function ( lists, next ) {
                    
                    return pkRet( next, lists );
                } );
            return runWaitOne( next, function ( next ) {
                return go( revLists.ind( 1 ), next );
            } );
        }
    } );
}
function pkDup( pkRuntime, val, count, next ) {
    
    // If we're only trying to get one duplicate, we already have our
    // answer, regardless of whether the value is linear.
    if ( count.tag === "succ" && count.ind( 0 ).tag === "nil" )
        return pkRet( next, pkList( val ) );
    
    if ( !val.isLinear() )  // (including tags "nil" and "string")
        return withDups( pkNil, function ( ignored ) {
            return val;
        } );
    if ( val.tag === "cons" )
        return withDups( pkList( val.ind( 0 ), val.ind( 1 ) ),
            function ( args ) {
            
            return pkCons( listGet( args, 0 ), listGet( args, 1 ) );
        } );
    if ( val.tag === "fn" )
        return withDups( val.special.captures, function ( captures ) {
            return new Pk().init_( "fn", pkNil, captures.isLinear(), {
                captures: captures,
                call: val.special.call,
                string: val.special.string
            } );
        } );
    if ( val.special.dup !== void 0 )
        return runWaitTry( next, function ( next ) {
            return pkRuntime.callMethod( "call",
                pkList( val.special.dup, pkList( val, count ) ),
                next );
        }, function ( result, next ) {
            return listLenIsNat( result, count, next,
                function ( correct, next ) {
                
                if ( !correct )
                    return pkErr( next,
                        "Got a list of incorrect length from a " +
                        "linear value's custom dup function." );
                return pkRet( next, result );
            } );
        } );
    return withDups( val.args, function ( args ) {
        return new Pk().init_( val.tag, args, !!"isLinear", {} );
    } );
    function withDups( args, reconstruct ) {
        return listMap( args, next, function ( arg, next ) {
            return pkDup( pkRuntime, arg, count, next );
        }, function ( argsDuplicates, next ) {
            return listMapMultiWithLen( count, argsDuplicates, next,
                function ( args ) {
                
                return pkRet( next, reconstruct( args ) );
            }, function ( result, next ) {
                return pkRet( next, result );
            } );
        } );
    }
}
function forkGetter( pkRuntime, nameForError ) {
    return pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( next, args, "Called " + nameForError );
        if ( listGet( args, 0 ).tag !== "string" )
            return pkErr( next,
                "Called " + nameForError + " with a non-string " +
                "name" );
        if ( !isNat( listGet( args, 1 ) ) )
            return pkErr( next,
                "Called " + nameForError + " with a capture count " +
                "that wasn't a nat" );
        return runWaitTry( next, function ( next ) {
            return runRet( next,
                pkRuntime.getMacro(
                    listGet( args, 0 ).special.jsStr ) );
        }, function ( maybeMacro, next ) {
            return pkRet( next, pk( "getmac-fork",
                pk( "main-binding", listGet( args, 0 ) ),
                pkNil,
                maybeMacro
            ) );
        } );
    } );
}
function runWaitTryGetmacFork(
    pkRuntime, next, nameForError, func, then ) {
    
    return runWaitTry( next, function ( next ) {
        return func( next );
    }, function ( fork, next ) {
        if ( fork.tag === "cons" )
            debugger;
        return runWaitTry( next, function ( next ) {
            return pkRuntime.callMethod( "fork-to-getmac",
                pkList( fork ), next );
        }, function ( results, next ) {
            if ( !(isList( results ) && listLenIs( results, 3 )) )
                return pkErr( next,
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
                return pkErr( next,
                    "Got non-list captures from " + nameForError );
            if ( maybeMacro.tag === "nil" ) {
                // Do nothing.
            } else if ( maybeMacro.tag !== "yep" ) {
                return pkErr( next,
                    "Got a non-maybe value for the macro result of " +
                    nameForError );
            } else if ( maybeMacro.isLinear() ) {
                return pkErr( next,
                    "Got a linear value for the macro result of " +
                    nameForError );
            }
            return then( opBinding, captures, maybeMacro, next );
        } );
    } );
}
function nonMacroMacroexpander( pkRuntime ) {
    return pkfn( function ( args, next ) {
        if ( !listLenIs( args, 4 ) )
            return pkErrLen( next, args,
                "Called a non-macro's macroexpander" );
        var fork = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var captureCounts = listGet( args, 2 );
        var argsList = listGet( args, 3 );
        if ( getFork.isLinear() )
            return pkErr( next,
                "Called a non-macro's macroexpander with a linear " +
                "get-fork" );
        // TODO: See if we should verify that `captureCounts` is a
        // stack of nats.
        if ( !isList( captureCounts ) )
            return pkErr( next,
                "Called a non-macro's macroexpander with a " +
                "non-list stack of capture counts." );
        if ( !isList( argsList ) )
            return pkErr( next,
                "Called a non-macro's macroexpander with a " +
                "non-list args list" );
        return runWaitTryGetmacFork( pkRuntime, next,
            "the fork parameter to a non-macro's macroexpander",
            function ( next ) {
            
            return pkRet( next, fork );
        }, function (
            funcBinding, funcCaptures, funcMaybeMacro, next ) {
            
            return runWaitTry( next, function ( next ) {
                return lensPlusNats(
                    funcCaptures, captureCounts, next );
            }, function ( captureCounts, next ) {
                return parseList(
                    argsList, captureCounts, pkList( funcCaptures ),
                    pkNil, next );
            } );
            function parseList(
                list, captureCounts, revCapturesSoFar,
                revBindingsSoFar, next ) {
                
                if ( list.tag !== "cons" )
                    return listRevAppend(
                        revCapturesSoFar, pkNil, next,
                        function ( captures, next ) {
                        
                        return runWaitTry( next, function ( next ) {
                            return appendStacks( captures, next );
                        }, function ( captures, next ) {
                            return listRevAppend(
                                revBindingsSoFar, pkNil, next,
                                function ( bindings, next ) {
                                
                                return pkRet( next, pk( "getmac-fork",
                                    pk( "call-binding",
                                        funcBinding, bindings ),
                                    captures,
                                    pkNil
                                ) );
                            } );
                        } );
                    } );
                return runWaitTryGetmacFork( pkRuntime, next,
                    "macroexpand-to-fork",
                    function ( next ) {
                    
                    return pkRuntime.callMethod(
                        "macroexpand-to-fork",
                        pkList(
                            list.ind( 0 ), getFork, captureCounts ),
                        next );
                }, function ( binding, captures, maybeMacro, next ) {
                    // TODO: Verify that `captures` is a stack of
                    // lists of maybes of bindings.
                    return runWaitTry( next, function ( next ) {
                        return lensPlusNats(
                            captures, captureCounts, next );
                    }, function ( captureCounts, next ) {
                        return parseList(
                            list.ind( 1 ),
                            captureCounts,
                            pkCons( captures, revCapturesSoFar ),
                            pkCons( binding, revBindingsSoFar ),
                            next );
                    } );
                } );
            }
        } );
    } );
}

function PkRuntime() {}
PkRuntime.prototype.init_ = function () {
    var self = this;
    function defTag( name, var_args ) {
        self.defTag( name, pkListFromArr(
            arrMap( [].slice.call( arguments, 1 ), function ( s ) {
                return pkStr( s );
            } ) ) );
    }
    function defMethod( name, var_args ) {
        self.defMethod( name, pkListFromArr(
            arrMap( [].slice.call( arguments, 1 ), function ( s ) {
                return pkStr( s );
            } ) ) );
    }
    
    self.meta_ = strMap();
    defTag( "cons", "first", "rest" );
    self.defVal( "cons", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( next, args, "Called cons" );
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( next,
                "Called cons with a rest that wasn't a list" );
        return pkRet( next,
            pkCons( listGet( args, 0 ), listGet( args, 1 ) ) );
    } ) );
    defTag( "succ", "pred" );
    self.defVal( "succ", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( next, args, "Called succ" );
        if ( !isNat( listGet( args, 0 ) ) )
            return pkErr( next,
                "Called succ with a predecessor that wasn't a nat" );
        return pkRet( next, pk( "succ", listGet( args, 0 ) ) );
    } ) );
    defTag( "yep", "val" );
    defTag( "nope", "val" );
    defTag( "nil" );
    defTag( "string" );
    self.defVal( "string", pkfn( function ( args, next ) {
        return pkErr( next, "The string function has no behavior" );
    } ) );
    defTag( "fn" );
    self.defVal( "fn", pkfn( function ( args, next ) {
        return pkErr( next, "The fn function has no behavior" );
    } ) );
    defMethod( "call", "self", "args" );
    self.setStrictImpl( "call", "fn", function ( args, next ) {
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( next,
                "Called call with a non-list args list" );
        // TODO: See if we should respect linearity some more by
        // double-checking that the captured values haven't already
        // been spent.
        return listGet( args, 0 ).special.call(
            listGet( args, 0 ).special.captures,
            listGet( args, 1 ),
            next
        );
    } );
    
    defTag( "getmac-fork", "binding", "captures", "macro" );
    self.defVal( "getmac-fork", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( next, args, "Called getmac-fork" );
        // TODO: Verify that `listGet( args, 2 )` is a stack of lists
        // of maybes of bindings.
        return pkRet( next,
            pk( "getmac-fork",
                listGet( args, 0 ),
                listGet( args, 1 ),
                listGet( args, 2 ) ) );
    } ) );
    defMethod( "fork-to-getmac", "fork" );
    self.setStrictImpl( "fork-to-getmac", "getmac-fork",
        function ( args, next ) {
        
        var fork = listGet( args, 0 );
        return pkRet( next,
            pkList( fork.ind( 0 ), fork.ind( 1 ), fork.ind( 2 ) ) );
    } );
    
    defTag( "literal-binding", "literal-val" );
    defTag( "main-binding", "name" );
    self.defVal( "main-binding", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( next, args, "Called main-binding" );
        if ( listGet( args, 0 ).tag !== "string" )
            return pkErr( next,
                "Called main-binding with a non-string name" );
        return pkRet( next,
            pk( "main-binding", listGet( args, 0 ) ) );
    } ) );
    defTag( "call-binding", "op", "args" );
    self.defVal( "call-binding", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( next, args, "Called call-binding" );
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( next,
                "Called call-binding with a non-list args list" );
        return pkRet( next,
            pk( "call-binding",
                listGet( args, 0 ), listGet( args, 1 ) ) );
    } ) );
    defTag( "param-binding", "index" );
    self.defVal( "param-binding", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( next, args, "Called param-binding" );
        if ( !isNat( listGet( args, 0 ) ) )
            return pkErr( next,
                "Called param-binding with a non-nat index" );
        return pkRet( next,
            pk( "param-binding", listGet( args, 0 ) ) );
    } ) );
    defTag( "fn-binding", "captures", "body-binding" );
    self.defVal( "fn-binding", pkfn( function ( args, next ) {
        // NOTE: By blocking this function, we preserve the invariant
        // that the "captures" list is a list of maybes of bindings.
        // That way we don't have to check for this explicitly in
        // binding-interpret.
        // TODO: See if we should check for it explicitly anyway. Then
        // we can remove this restriction.
        return pkErr( next,
            "The fn-binding function has no behavior" );
    } ) );
    
    // NOTE: We respect linearity in binding-interpret already, but it
    // has a strange contract. Each binding-interpret call consumes
    // only part of the list of captured values, but a top-level call
    // to binding-interpret should always consume the whole thing.
    defMethod( "binding-interpret", "self", "list-of-captured-vals" );
    self.setStrictImpl( "binding-interpret", "literal-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( next,
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        return pkRet( next, listGet( args, 0 ).ind( 0 ) );
    } );
    self.setStrictImpl( "binding-interpret", "main-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( next,
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        // TODO: If we ever have allowsGets() return false, and if we
        // ever allow calling methods (like this one) when it's false,
        // then uncomment this code. Until then, it will only be a
        // performance burden.
//        if ( !self.allowsGets( next ) )
//            return pkErr( next,
//                "Called binding-interpret on a main-binding " +
//                "without access to top-level definition-reading " +
//                "side effects" );
        return runRet( next,
            self.getVal(
                listGet( args, 0 ).ind( 0 ).special.jsStr ) );
    } );
    self.setStrictImpl( "binding-interpret", "call-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( next,
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        function interpretList( list, next ) {
            if ( list.tag !== "cons" )
                return pkRet( next, pkNil );
            return runWaitTry( next, function ( next ) {
                return self.callMethod( "binding-interpret",
                    pkList( list.ind( 0 ), listGet( args, 1 ) ),
                    next );
            }, function ( elem, next ) {
                return runWaitTry( next, function ( next ) {
                    return interpretList( list.ind( 1 ), next );
                }, function ( interpretedTail, next ) {
                    return pkRet( next,
                        pkCons( elem, interpretedTail ) );
                } );
            } );
        }
        return runWaitTry( next, function ( next ) {
            return self.callMethod( "binding-interpret",
                pkList(
                    listGet( args, 0 ).ind( 0 ), listGet( args, 1 ) ),
                next );
        }, function ( op, next ) {
            return runWaitTry( next, function ( next ) {
                return interpretList(
                    listGet( args, 0 ).ind( 1 ), next );
            }, function ( args, next ) {
                return self.callMethod(
                    "call", pkList( op, args ), next );
            } );
        } );
    } );
    self.setStrictImpl( "binding-interpret", "param-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( next,
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        return listGetNat(
            listGet( args, 1 ), listGet( args, 0 ).ind( 0 ), next,
            function ( result, next ) {
            
            if ( result.tag !== "yep" )
                return pkErr( next,
                    "Tried to interpret a param-binding that fell " +
                    "off the end of the list of captured values" );
            return pkRet( next, result.ind( 0 ) );
        } );
    } );
    self.setStrictImpl( "binding-interpret", "fn-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( next,
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        var captures = listGet( args, 0 ).ind( 0 );
        var bodyBinding = listGet( args, 0 ).ind( 1 );
        var nonlocalCaptures = listGet( args, 1 );
        return listMap( captures, next, function ( capture, next ) {
            if ( capture.tag !== "yep" )
                return pkRet( next, pkNil );
            return runWaitTry( next, function ( next ) {
                return self.callMethod( "binding-interpret",
                    pkList( capture.ind( 0 ), nonlocalCaptures ),
                    next );
            }, function ( value, next ) {
                return pkRet( next, pk( "yep", value ) );
            } );
        }, function ( captures ) {
            return pkRet( next, pkfnLinear( captures,
                function ( captures, args, next ) {
                
                return listCount( captures, next,
                    function ( maybeCapturedVal ) {
                    
                    return maybeCapturedVal.tag !== "yep";
                }, function ( argsDupCount, next ) {
                    return runWaitTry( next, function ( next ) {
                        return pkDup(
                            self, args, argsDupCount, next );
                    }, function ( argsDuplicates, next ) {
                        return go(
                            captures, argsDuplicates, pkNil, next );
                        function go(
                            nonlocalCaptures, argsDuplicates,
                            revLocalCaptures, next ) {
                            
                            if ( nonlocalCaptures.tag !== "cons" )
                                return listRevAppend(
                                    revLocalCaptures, pkNil, next,
                                    function ( localCaptures, next ) {
                                    
                                    return self.callMethod(
                                        "binding-interpret",
                                        pkList( bodyBinding,
                                            localCaptures ),
                                        next
                                    );
                                } );
                            return runWaitOne( next,
                                function ( next ) {
                                
                                var maybeNlc =
                                    nonlocalCaptures.ind( 0 );
                                if ( maybeNlc.tag === "yep" )
                                    return go(
                                        nonlocalCaptures.ind( 1 ),
                                        argsDuplicates,
                                        pkCons( maybeNlc.ind( 0 ),
                                            revLocalCaptures ),
                                        next
                                    );
                                return go(
                                    nonlocalCaptures.ind( 1 ),
                                    argsDuplicates.ind( 1 ),
                                    pkCons( argsDuplicates.ind( 0 ),
                                        revLocalCaptures ),
                                    next
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
    self.setStrictImpl( "macroexpand-to-fork", "string",
        function ( args, next ) {
        
        var expr = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var captureCounts = listGet( args, 2 );
        if ( getFork.isLinear() )
            return pkErr( next,
                "Called macroexpand-to-fork with a linear get-fork" );
        // TODO: Verify that `captureCounts` is a stack of nats.
        if ( !isList( captureCounts ) )
            return pkErr( next,
                "Called macroexpand-to-fork with a non-list stack " +
                "of capture counts" );
        return runWaitOne( next, function ( next ) {
            return self.callMethod( "call",
                pkList( getFork, pkList( expr, captureCounts ) ),
                next );
        } );
    } );
    self.setStrictImpl( "macroexpand-to-fork", "cons",
        function ( args, next ) {
        
        var expr = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var captureCounts = listGet( args, 2 );
        if ( getFork.isLinear() )
            return pkErr( next,
                "Called macroexpand-to-fork with a linear get-fork" );
        // TODO: Verify that `captureCounts` is a stack of nats.
        if ( !isList( captureCounts ) )
            return pkErr( next,
                "Called macroexpand-to-fork with a non-list stack " +
                "of capture counts" );
        return runWaitTry( next, function ( next ) {
            return self.callMethod( "macroexpand-to-fork",
                pkList( expr.ind( 0 ), getFork, captureCounts ),
                next );
        }, function ( opFork, next ) {
            return runWaitTryGetmacFork( self, next,
                "macroexpand-to-fork",
                function ( next ) {
                
                return pkRet( next, opFork );
            }, function ( binding, captures, maybeMacro, next ) {
                var macroexpander = maybeMacro.tag === "yep" ?
                    maybeMacro.ind( 0 ) :
                    nonMacroMacroexpander( self );
                return self.callMethod( "call", pkList(
                    macroexpander,
                    pkList(
                        opFork,
                        getFork,
                        captureCounts,
                        expr.ind( 1 )
                    )
                ), next );
            } );
        } );
    } );
    
    self.defMacro( "fn", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 4 ) )
            return pkErrLen( next, args,
                "Called fn's macroexpander" );
        var fork = listGet( args, 0 );
        var nonlocalGetFork = listGet( args, 1 );
        var captureCounts = listGet( args, 2 );
        var body = listGet( args, 3 );
        if ( nonlocalGetFork.isLinear() )
            return pkErr( next,
                "Called fn's macroexpander with a linear get-fork" );
        // TODO: Verify that `captureCounts` is a stack of nats.
        if ( !isList( captureCounts ) )
            return pkErr( next,
                "Called fn's macroexpander with a non-list stack " +
                "of capture counts" );
        if ( !isList( body ) )
            return pkErr( next,
                "Called fn's macroexpander with a non-list macro body"
                );
        if ( !listLenIs( body, 2 ) )
            return pkErrLen( next, body, "Expanded fn" );
        if ( listGet( body, 0 ).tag !== "string" )
            return pkErr( next, "Expanded fn with a non-string var" );
        var jsName = listGet( body, 0 ).special.jsStr;
        return runWaitTryGetmacFork( self, next,
            "macroexpand-to-fork",
            function ( next ) {
            
            return self.callMethod( "macroexpand-to-fork", pkList(
                listGet( body, 1 ),
                pkfn( function ( args, next ) {
                    if ( !listLenIs( args, 2 ) )
                        return pkErrLen( next, args,
                            "Called a get-fork" );
                    var name = listGet( args, 0 );
                    var captureCounts = listGet( args, 1 );
                    if ( name.tag !== "string" )
                        return pkErr( next,
                            "Called a get-fork with a non-string " +
                            "name" );
                    // TODO: Verify that `captureCounts` is a stack of
                    // nats.
                    if ( !isList( captureCounts ) )
                        return pkErr( next,
                            "Called a get-fork with a non-list " +
                            "stack of capture counts" );
                    if ( captureCounts.tag === "nil" )
                        captureCounts = pkList( pkNil );
                    if ( jsName === name.special.jsStr )
                        return pkRet( next, pk( "getmac-fork",
                            pk( "param-binding",
                                captureCounts.ind( 0 ) ),
                            pkList( pkList( pkNil ) ),
                            pkNil
                        ) );
                    return runWaitTryGetmacFork( self, next,
                        "a get-fork",
                        function ( next ) {
                        
                        return self.callMethod( "call", pkList(
                            nonlocalGetFork,
                            pkList( name, captureCounts.ind( 1 ) )
                        ), next );
                    }, function (
                        captureBinding, nonlocalCaptureFrames,
                        maybeMacro, next ) {
                        
                        return pkRet( next, pk( "getmac-fork",
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
            ), next );
        }, function (
            bodyBinding, localCaptureFrames, maybeMacro, next ) {
            
            if ( localCaptureFrames.tag === "nil" )
                localCaptureFrames = pkList( pkNil );
            return pkRet( next, pk( "getmac-fork",
                pk( "fn-binding",
                    localCaptureFrames.ind( 0 ), bodyBinding ),
                localCaptureFrames.ind( 1 ),
                pkNil
            ) );
       } );
    } ) );
    
    self.defMacro( "quote", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 4 ) )
            return pkErrLen( next, args,
                "Called quote's macroexpander" );
        var fork = listGet( args, 0 );
        var getFork = listGet( args, 1 );
        var captureCounts = listGet( args, 2 );
        var body = listGet( args, 3 );
        if ( getFork.isLinear() )
            return pkErr( next,
                "Called quote's macroexpander with a linear get-fork"
                );
        // TODO: Verify that `captureCounts` is a stack of nats.
        if ( !isList( captureCounts ) )
            return pkErr( next,
                "Called quote's macroexpander with a non-list " +
                "stack of capture counts" );
        if ( !isList( body ) )
            return pkErr( next,
                "Called quote's macroexpander with a non-list " +
                "macro body" );
        if ( !listLenIs( body, 1 ) )
            return pkErrLen( next, body, "Expanded quote" );
        return pkRet( next, pk( "getmac-fork",
            pk( "literal-binding", listGet( body, 0 ) ),
            pkNil,
            pkNil
        ) );
    } ) );
    
    self.defVal( "defval", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( next, args, "Called defval" );
        if ( listGet( args, 0 ).tag !== "string" )
            return pkErr( next,
                "Called defval with a non-string name" );
        if ( !self.allowsDefs( next ) )
            return pkErr( next,
                "Called defval without access to top-level " +
                "definition side effects" );
        return runRet( next,
            self.defVal( listGet( args, 0 ).special.jsStr,
                listGet( args, 1 ) ) );
    } ) );
    self.defVal( "defmacro", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( next, args, "Called defmacro" );
        if ( listGet( args, 0 ).tag !== "string" )
            return pkErr( next,
                "Called defmacro with a non-string name" );
        if ( !self.allowsDefs( next ) )
            return pkErr( next,
                "Called defmacro without access to top-level " +
                "definition side effects" );
        return runRet( next,
            self.defMacro( listGet( args, 0 ).special.jsStr,
                listGet( args, 1 ) ) );
    } ) );
    self.defVal( "deftag", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( next, args, "Called deftag" );
        if ( listGet( args, 0 ).tag !== "string" )
            return pkErr( next,
                "Called deftag with a non-string name" );
        // TODO: Verify that the keys list contains only strings.
        if ( !self.allowsDefs( next ) )
            return pkErr( next,
                "Called deftag without access to top-level " +
                "definition side effects" );
        return runRet( next,
            self.defTag( listGet( args, 0 ).special.jsStr,
                listGet( args, 1 ) ) );
    } ) );
    self.defVal( "deflineartag", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( next, args, "Called deftag" );
        if ( listGet( args, 0 ).tag !== "string" )
            return pkErr( next,
                "Called deftag with a non-string name" );
        // TODO: Verify that the keys list contains only strings.
        if ( !self.allowsDefs( next ) )
            return pkErr( next,
                "Called deflineartag without access to top-level " +
                "definition side effects" );
        return runRet( next,
            self.defLinearTag( listGet( args, 0 ).special.jsStr,
                listGet( args, 1 ), listGet( args, 2 ) ) );
    } ) );
    self.defVal( "defmethod", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( next, args, "Called defmethod" );
        if ( listGet( args, 0 ).tag !== "string" )
            return pkErr( next,
                "Called defmethod with a non-string name" );
        // TODO: Verify that the args list contains only strings.
        if ( !self.allowsDefs( next ) )
            return pkErr( next,
                "Called defmethod without access to top-level " +
                "definition side effects" );
        return runRet( next,
            self.defMethod( listGet( args, 0 ).special.jsStr,
                listGet( args, 1 ) ) );
    } ) );
    self.defVal( "set-impl", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( next, args, "Called set-impl" );
        if ( listGet( args, 0 ).tag !== "string" )
            return pkErr( next,
                "Called set-impl with a non-string method name" );
        if ( listGet( args, 1 ).tag !== "string" )
            return pkErr( next,
                "Called set-impl with a non-string tag name" );
        if ( listGet( args, 2 ).isLinear() )
            return pkErr( next,
                "Called set-impl with a linear function" );
        if ( !self.allowsDefs( next ) )
            return pkErr( next,
                "Called set-impl without access to top-level " +
                "definition side effects" );
        return runRet( next,
            self.setImpl(
                listGet( args, 0 ).special.jsStr,
                listGet( args, 1 ).special.jsStr,
                function ( args, next ) {
                    return self.callMethod( "call",
                        pkList( listGet( args, 2 ), args ), next );
                } ) );
    } ) );
    
    self.defVal( "raise", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( next, args, "Called raise" );
        return pkRet( next, pk( "nope", listGet( args, 0 ) ) );
    } ) );
    
    return self;
};
PkRuntime.prototype.prepareMeta_ = function (
    name, opt_methodOrVal ) {
    
    var meta = this.meta_.get( name );
    if ( meta === void 0 ) {
        meta = { name: name };
        this.meta_.set( name, meta );
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
PkRuntime.prototype.callMethod = function ( name, args, next ) {
    // TODO: If we ever have allowsGets() return false, uncomment this
    // code. Until then, it will only be a performance burden.
//    if ( !this.allowsGets( next ) )
//        return pkErr( next,
//            "Called method " + name + " without access to " +
//            "top-level definition-reading side effects" );
    var meta = this.meta_.get( name );
    if ( listLenIs( args, 0 ) )
        return pkErrLen( next, args, "Called method " + name );
    var impl = meta.methodImplsByTag.get( listGet( args, 0 ).tag );
    if ( impl === void 0 )
        return pkErr( next,
            "No implementation for method " + name + " tag " +
            listGet( args, 0 ).tag );
    return impl.call( args, next );
};
PkRuntime.prototype.setImpl = function ( methodName, tagName, call ) {
    var methodMeta = this.meta_.get( methodName );
    if ( methodMeta.methodOrVal !== "method" )
        return pkRawErr(
            "Can't implement non-method " + methodName + " for tag " +
            tagName );
    var tagMeta = this.meta_.get( tagName );
    if ( tagMeta.tagKeys === void 0 )
        return pkRawErr(
            "Can't implement method " + methodName + " for non-tag " +
            tagName );
    methodMeta.methodImplsByTag.set( tagName, { call: call } );
    return pk( "yep", pkNil );
};
PkRuntime.prototype.setStrictImpl = function (
    methodName, tagName, call ) {
    
    var methodMeta = this.meta_.get( methodName );
    return this.setImpl( methodName, tagName,
        function ( args, next ) {
        
        return listLenEq( args, methodMeta.methodArgs, next,
            function ( areEq, next ) {
            
            if ( !areEq )
                return pkErrLen( next, args, "Called " + methodName );
            return call( args, next );
        } );
    } );
};
PkRuntime.prototype.getVal = function ( name ) {
    var self = this;
    var meta = self.meta_.get( name );
    if ( meta === void 0 )
        return pkRawErr( "Unbound variable " + name );
    if ( meta.methodOrVal === "val" )
        return pk( "yep", meta.val );
    if ( meta.methodOrVal === "method" )
        return pk( "yep", pkfn( function ( args, next ) {
            return runWaitOne( next, function ( next ) {
                return self.callMethod( name, args, next );
            } );
        } ) );
    if ( meta.tagKeys !== void 0 )
        return pk( "yep", pkfn( function ( args, next ) {
            return listLenEq( args, meta.tagKeys, next,
                function ( areEq, next ) {
                
                if ( !areEq )
                    return pkErrLen( next, args,
                        "Can't make " + name );
                return pkRet( next,
                    new Pk().init_(
                        name,
                        args,
                        meta.dup !== null || args.isLinear(),
                        meta.dup === null ? {} : { dup: meta.dup }
                    ) );
            } );
        } ) );
    // NOTE: If (meta.macro !== void 0), we don't do anything special.
    return pkRawErr( "Unbound variable " + name );
};
PkRuntime.prototype.getMacro = function ( name ) {
    var meta = this.meta_.get( name );
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
//PkRuntime.prototype.allowsGets = function ( next ) {
//    return true;
//};
PkRuntime.prototype.allowsDefs = function ( next ) {
    return next.allowsDefs;
};
// TODO: Figure out if we should manage `allowsDefs` in a more
// encapsulated and/or generalized way.
PkRuntime.prototype.withAllowsDefs = function ( next, body ) {
    var empoweredNext = {
        allowsDefs: true,
        runWaitLinear: next.runWaitLinear
    };
    var resultAndNext = body( empoweredNext );
    var disempoweredNext = {
        allowsDefs: next.allowsDefs,
        runWaitLinear: resultAndNext.next.runWaitLinear
    };
    return runRet( disempoweredNext, resultAndNext.result );
};
PkRuntime.prototype.conveniences_syncNext =
    { allowsDefs: false, runWaitLinear: function ( step, then ) {
        return then( step( this ) );
    } };
PkRuntime.prototype.conveniences_macroexpand = function (
    expr, opt_next ) {
    
    var self = this;
    if ( opt_next === void 0 )
        opt_next = self.conveniences_syncNext;
    return runWaitTryGetmacFork( self, opt_next,
        "macroexpand-to-fork",
        function ( next ) {
        
        return self.callMethod( "macroexpand-to-fork", pkList(
            expr,
            forkGetter( self, "the top-level get-fork" ),
            pkNil
        ), next );
    }, function ( binding, captures, maybeMacro, next ) {
        
        // Verify `captures` is a stack of *empty* lists of maybes of
        // bindings.
        return listAny( captures, next, function ( bindings ) {
            return bindings.tag !== "nil";
        }, function ( incorrect, next ) {
            if ( incorrect )
                return pkErr( next,
                    "Got a top-level macroexpansion result with " +
                    "captures" );
            
            return pkRet( next, binding );
        } );
    } );
};
PkRuntime.prototype.conveniences_macroexpandArrays = function (
    arrayExpr, opt_next ) {
    
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
        arraysToConses( arrayExpr ), opt_next );
};
PkRuntime.prototype.conveniences_interpretBinding = function (
    binding, opt_next ) {
    
    var self = this;
    if ( opt_next === void 0 )
        opt_next = self.conveniences_syncNext;
    return self.withAllowsDefs( opt_next, function ( next ) {
        return self.callMethod(
            "binding-interpret", pkList( binding, pkNil ), next );
    } );
};
function makePkRuntime() {
    return new PkRuntime().init_();
}

// TODO: Define more useful utilities, including conditionals and
// assignment.
