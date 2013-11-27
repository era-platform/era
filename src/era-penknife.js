// era-penknife.js
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";

function Pk() {}
Pk.prototype.init_ = function ( tag, args, special ) {
    this.tag = tag;
    this.args_ = args;
    this.special = special;
    return this;
};
Pk.prototype.ind = function ( i ) {
    return this.args_ === null ?
        this.special.argsArr[ i ] : listGet( this.args_, i );
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
var pkNil = new Pk().init_( "nil", null, { argsArr: [] } );
function pkCons( first, rest ) {
    return new Pk().init_(
        "cons", null, { argsArr: [ first, rest ] } );
}
function pkListFromArr( arr ) {
    var result = pkNil;
    for ( var i = arr.length - 1; 0 <= i; i-- )
        result = pkCons( arr[ i ], result );
    return result;
}
function pk( tag, var_args ) {
    return new Pk().init_(
        tag, pkListFromArr( [].slice.call( arguments, 1 ) ), {} );
}
function pkStr( jsStr ) {
    return new Pk().init_( "string", pkNil, { jsStr: jsStr } );
}
function pkfn( call ) {
    return new Pk().init_( "fn", pkNil,
        { call: call, string: "" + call } );
}
function pkErr( jsStr ) {
    return pk( "nope", pkStr( jsStr ) );
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
function listLenIs( x, n ) {
    for ( ; 0 < i; i-- ) {
        if ( x.tag !== "cons" )
            return false;
        x = x.ind( 1 );
    }
    return x.tag === "nil";
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
function pkErrLen( args, message ) {
    var len = listLenBounded( args, 100 );
    return pkErr( "" + message + " with " + (
        len === null ? "way too many args" :
        len === 1 ? "1 arg" :
            "" + len + " args") );
}
function bindingGetter( pkRuntime, nameForError ) {
    return pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( args, "Called " + nameForError );
        if ( listGet( args, 0 ).tag !== "string" )
            return pkErr(
                "Called " + nameForError + " with a non-string " +
                "name" );
        if ( !isNat( listGet( args, 1 ) ) )
            return pkErr(
                "Called " + nameForError + " with a capture count " +
                "that wasn't a nat" );
        return runWaitTry( next, function ( next ) {
            return pkRuntime.getMacro(
                listGet( args, 0 ).special.jsStr );
        }, function ( maybeMacro, next ) {
            return pk( "yep", pkList(
                pk( "main-binding", listGet( args, 0 ) ),
                pkNil,
                maybeMacro
            ) );
        } );
    } );
}
function runWaitTry( next, func, then ) {
    return next.runWait( function ( next ) {
        return func( next );
    }, function ( tryVal, next ) {
        if ( tryVal.tag !== "yep" )
            return tryVal;
        return then( tryVal.ind( 0 ), next );
    } );
}
function runWaitOne( next, then ) {
    return next.runWait( function ( next ) {
        return null;
    }, function ( ignored, next ) {
        return then( next );
    } );
}
function listLenEq( a, b, next, then ) {
    function go( a, b, next ) {
        if ( a.tag === "nil" && b.tag === "nil" )
            return true;
        if ( !(a.tag === "cons" && b.tag === "cons") )
            return false;
        return runWaitOne( next, function ( next ) {
            return go( a.ind( 1 ), b.ind( 1 ), next );
        } );
    }
    return next.runWait( function ( next ) {
        return go( a, b, next );
    }, function ( result, next ) {
        return then( result, next );
    } );
}
function lenPlusNat( list, nat, next, then ) {
    function go( list, nat, next ) {
        if ( list.tag !== "cons" )
            return nat;
        return runWaitOne( next, function ( next ) {
            return go( list.ind( 1 ), pk( "succ", nat ), next );
        } );
    }
    return next.runWait( function ( next ) {
        return go( list, nat, next );
    }, function ( result, next ) {
        return then( result, next );
    } );
}
function listGetNat( list, nat, next, then ) {
    function go( list, nat, next ) {
        if ( list.tag !== "cons" )
            return then( pkNil, next );
        if ( nat.tag !== "succ" )
            return then( pk( "yep", list.ind( 0 ) ), next );
        return runWaitOne( next, function ( next ) {
            return go( list.ind( 1 ), nat.ind( 0 ), next );
        } );
    }
    return next.runWait( function ( next ) {
        return go( list, nat, next );
    }, function ( result, next ) {
        return then( result, next );
    } );
}
function listRevAppend( backwardFirst, forwardSecond, next, then ) {
    function go( backwardFirst, forwardSecond, next ) {
        if ( backwardFirst.tag !== "cons" )
            return forwardSecond;
        return runWaitOne( next, function ( next ) {
            return go(
                backwardFirst.ind( 1 ),
                pkCons( backwardFirst.ind( 0 ), forwardSecond ),
                next );
        } );
    }
    return next.runWait( function ( next ) {
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
function listRevFlatten( list, next, then ) {
    // Do flatten( reverse( list ) ).
    // TODO: See if there's a more efficient way to do this.
    
    return listRevAppend( list, pkNil, next, function ( list, next ) {
        return listFlatten( list, next, function ( result, next ) {
            return then( result, next );
        } );
        function listFlatten( list, next, then ) {
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
function runWaitTryBinding( next, nameForError, func, then ) {
    return runWaitTry( next, function ( next ) {
        return func( next );
    }, function ( results, next ) {
        if ( !(isList( results ) && listLenIs( results, 3 )) )
            return pkErr( "Got a non-triple from " + nameForError );
        var opBinding = listGet( results, 0 );
        var captures = listGet( results, 1 );
        var maybeMacro = listGet( results, 2 );
        if ( !isList( captures ) )
            return pkErr(
                "Got non-list captures from " + nameForError );
        if ( maybeMacro.tag === "nil" ) {
            // Do nothing.
        } else if ( maybeMacro.tag !== "yep" ) {
            return pkErr(
                "Got a non-maybe value for the macro result of " +
                nameForError );
        }
        // TODO: Respect linearity. If the macro is linear, raise an
        // error.
        return then( opBinding, captures, maybeMacro, next );
    } );
}
function funcAsMacro( pkRuntime, funcBinding ) {
    // TODO: Respect linearity. If funcBinding is linear, the function
    // we return here should also be linear.
    return pkfn( function ( args, next ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( args,
                "Called a non-macro's macroexpander" );
        var getBinding = listGet( args, 0 );
        var captureCount = listGet( args, 1 );
        var argsList = listGet( args, 2 );
        if ( !isList( argsList ) )
            return pkErr(
                "Called a non-macro's macroexpander with a " +
                "non-list args list" );
        // TODO: Respect linearity. Perhaps getBinding is linear, in
        // which case we should raise an error.
        return parseList(
            argsList, captureCount, pkNil, pkNil, next );
        function parseList(
            list, captureCount, revCapturesSoFar, revBindingsSoFar,
            next ) {
            
            if ( list.tag !== "cons" )
                return listRevFlatten( revCapturesSoFar, next,
                    function ( captures, next ) {
                    
                    return listRevAppend(
                        revBindingsSoFar, pkNil, next,
                        function ( bindings, next ) {
                        
                        return pk( "yep", pkList(
                            pk( "call-binding",
                                funcBinding, bindings ),
                            captures,
                            pkNil
                        ) );
                    } );
                } );
            return runWaitTryBinding( next, "macroexpand-to-binding",
                function ( next ) {
                
                return pkRuntime.callMethod( "macroexpand-to-binding",
                    pkList(
                        list.ind( 0 ),
                        listGet( args, 0 ),
                        captureCount
                    ),
                    next );
            }, function ( binding, captures, maybeMacro, next ) {
                return lenPlusNat( captures, captureCount, next,
                    function ( captureCount, next ) {
                    
                    return parseList(
                        list.ind( 1 ),
                        captureCount,
                        pkCons( captures, revCapturesSoFar ),
                        pkCons( binding, revBindingsSoFar ),
                        next );
                } );
            } );
        }
    } );
}

function PkRuntime() {}
PkRuntime.prototype.init_ = function () {
    var self = this;
    self.meta_ = strMap();
    self.defTag( "cons", pkList( "first", "rest" ) );
    self.defVal( "cons", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( args, "Called cons" );
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called cons with a rest that wasn't a list" );
        return pk( "yep",
            pkCons( listGet( args, 0 ), listGet( args, 1 ) ) );
    } ) );
    self.defTag( "succ", pkList( "pred" ) );
    self.defVal( "succ", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( args, "Called succ" );
        if ( !isNat( listGet( args, 0 ) ) )
            return pkErr(
                "Called succ with a predecessor that wasn't a nat" );
        return pk( "yep", pk( "succ", listGet( args, 0 ) ) );
    } ) );
    self.defTag( "yep", pkList( "val" ) );
    self.defTag( "nope", pkList( "val" ) );
    self.defTag( "nil", pkList() );
    self.defTag( "string", pkList() );
    self.defVal( "string", pkfn( function ( args, next ) {
        return pkErr( "The string function has no behavior" );
    } ) );
    self.defTag( "fn", pkList() );
    self.defVal( "fn", pkfn( function ( args, next ) {
        return pkErr( "The fn function has no behavior" );
    } ) );
    self.defMethod( "call", pkList( "self", "args" ) );
    self.setStrictImpl( "call", "fn", function ( args, next ) {
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr( "Called call with a non-list args list" );
        // TODO: Respect linearity. Perhaps listGet( args, 0 ) is
        // linear here.
        return listGet( args, 0 ).special.call(
            listGet( args, 1 ), next );
    } );
    self.defTag( "main-binding", pkList( "name" ) );
    self.defVal( "main-binding",
        bindingGetter( self, "main-binding" ) );
    self.defTag( "call-binding", pkList( "op", "args" ) );
    self.defVal( "call-binding", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( args, "Called call-binding" );
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called call-binding with a non-list args list" );
        return pk( "yep",
            pk( "call-binding",
                listGet( args, 0 ), listGet( args, 1 ) ) );
    } ) );
    self.defTag( "param-binding", pkList( "index" ) );
    self.defVal( "param-binding", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( args, "Called param-binding" );
        if ( !isNat( listGet( args, 0 ) ) )
            return pkErr(
                "Called param-binding with a non-nat index" );
        return pk( "yep", pk( "param-binding", listGet( args, 0 ) ) );
    } ) );
    self.defTag( "fn-binding", pkList( "captures", "body-binding" ) );
    self.defVal( "fn-binding", pkfn( function ( args, next ) {
        // NOTE: By blocking this function, we preserve the invariant
        // that the "captures" list is a list of maybes of bindings.
        // That way we don't have to check for this explicitly in
        // binding-interpret.
        // TODO: See if we should check for it explicitly anyway. Then
        // we can remove this restriction.
        return pkErr( "The fn-binding function has no behavior" );
    } ) );
    
    self.defMethod( "binding-get-val", pkList( "self" ) );
    self.setStrictImpl( "binding-get-val", "main-binding",
        function ( args, next ) {
        
        return self.getVal(
            listGet( args, 0 ).ind( 0 ).special.jsStr );
    } );
    // TODO: See if we should implement binding-get-val for
    // call-binding, param-binding, or fn-binding.
    
    // NOTE: We respect linearity in binding-interpret already, but it
    // has a strange contract. Each binding-interpret call consumes
    // only part of the list of captured values, but a top-level call
    // to binding-interpret should always consume the whole thing.
    self.defMethod( "binding-interpret",
        pkList( "self", "list-of-captured-vals" ) );
    self.setStrictImpl( "binding-interpret", "main-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        return runWaitOne( next, function ( next ) {
            return self.callMethod( "binding-get-val",
                pkList( listGet( args, 0 ) ), next );
        } );
    } );
    self.setStrictImpl( "binding-interpret", "call-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        function interpretList( list, next ) {
            if ( list.tag !== "cons" )
                return pk( "yep", pkNil );
            return runWaitTry( next, function ( next ) {
                return self.callMethod( "binding-interpret",
                    pkList( list.ind( 0 ), listGet( args, 1 ) ),
                    next );
            }, function ( elem, next ) {
                return runWaitTry( next, function ( next ) {
                    return interpretList( list.ind( 1 ), next );
                }, function ( interpretedTail, next ) {
                    return pk( "yep",
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
            return pkErr(
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        return listGetNat(
            listGet( args, 1 ), listGet( args, 0 ).ind( 0 ), next,
            function ( result, next ) {
            
            if ( result.tag !== "yep" )
                return pkErr(
                    "Tried to interpret a param-binding that fell " +
                    "off the end of the list of captured values" );
            return result;
        } );
    } );
    self.setStrictImpl( "binding-interpret", "fn-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called binding-interpret with a non-list list of " +
                "captured values" );
        var captures = listGet( args, 0 ).ind( 0 );
        var bodyBinding = listGet( args, 0 ).ind( 1 );
        var nonlocalCaptures = listGet( args, 1 );
        return listMap( captures, next, function ( capture, next ) {
            if ( capture.tag !== "yep" )
                return pk( "yep", pkNil );
            return runWaitTry( next, function ( next ) {
                return self.callMethod( "binding-interpret",
                    pkList( capture.ind( 0 ), nonlocalCaptures ),
                    next );
            }, function ( value, next ) {
                return pk( "yep", pk( "yep", value ) );
            } );
        }, function ( captures ) {
            // TODO: Respect linearity. If any of the captured values
            // at this point is linear, this returned function should
            // also be linear.
            return pk( "yep", pkfn( function ( args, next ) {
                // TODO: Respect linearity. If args is linear, we
                // should try to explicitly copy and drop it.
                return listMap( captures, next,
                    function ( capture, next ) {
                    
                    if ( capture.tag !== "yep" )
                        return pk( "yep", args );
                    return pk( "yep", capture.ind( 0 ) );
                }, function ( captures ) {
                    return self.callMethod( "binding-interpret",
                        pkList( bodyBinding, captures ), next );
                } );
            } ) );
        } );
    } );
    
    self.defMethod( "macroexpand-to-binding",
        pkList( "self", "get-binding", "capture-count" ) );
    self.setStrictImpl( "macroexpand-to-binding", "string",
        function ( args, next ) {
        
        if ( !isNat( listGet( args, 2 ) ) )
            return pkErr(
                "Called macroexpand-to-binding with a capture " +
                "count that wasn't a nat" );
        return runWaitOne( next, function ( next ) {
            return self.callMethod( "call", pkList(
                listGet( args, 1 ),
                pkList( listGet( args, 0 ), listGet( args, 2 ) )
            ), next );
        } );
    } );
    self.setStrictImpl( "macroexpand-to-binding", "cons",
        function ( args, next ) {
        
        if ( !isNat( listGet( args, 2 ) ) )
            return pkErr(
                "Called macroexpand-to-binding with a capture " +
                "count that wasn't a nat" );
        // TODO: Respect linearity. Perhaps listGet( args, 1 ) is
        // linear, in which case we should raise an error.
        return runWaitTryBinding( next, "macroexpand-to-binding",
            function ( next ) {
            
            return self.callMethod( "macroexpand-to-binding", pkList(
                listGet( args, 0 ).ind( 0 ),
                listGet( args, 1 ),
                listGet( args, 2 )
            ), next );
        }, function ( opBinding, captures1, maybeOp1, next ) {
            return lenPlusNat( captures1, listGet( args, 2 ), next,
                function ( captureCount1, next ) {
                
                var op = maybeOp1.tag === "yep" ? maybeOp1.ind( 0 ) :
                    funcAsMacro( self, opBinding );
                return runWaitTryBinding( next, "a macro",
                    function ( next ) {
                    
                    return self.callMethod( "call", pkList(
                        op,
                        pkList(
                            listGet( args, 1 ),
                            captureCount1,
                            listGet( args, 0 ).ind( 1 )
                        )
                    ), next );
                }, function ( binding, captures2, maybeOp2, next ) {
                    return listAppend( captures1, captures2, next,
                        function ( captures, next ) {
                        
                        return pk( "yep",
                            pkList( binding, captures, maybeOp2 ) );
                    } );
                } );
            } );
        } );
    } );
    
    self.defMacro( "fn", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 3 ) )
            return pkErrLen( args, "Called fn's macroexpander" );
        var nonlocalGetBinding = listGet( args, 0 );
        var captureCount = listGet( args, 1 );
        var body = listGet( args, 2 );
        if ( !isList( body ) )
            return pkErr(
                "Called fn's macroexpander with a non-list macro body"
                );
        // TODO: Respect linearity. Perhaps nonlocalGetBinding is
        // linear, in which case we should raise an error.
        if ( !listLenIs( body, 2 ) )
            return pkErrLen( body, "Expanded fn" );
        if ( listGet( body, 0 ).tag !== "string" )
            return pkErr( "Expanded fn with a non-string var" );
        var jsName = listGet( body, 0 ).special.jsStr;
        return runWaitTryBinding( next, "macroexpand-to-binding",
            function ( next ) {
            
            return self.callMethod( "macroexpand-to-binding", pkList(
                listGet( body, 1 ),
                pkfn( function ( args, next ) {
                    if ( !listLenIs( args, 2 ) )
                        return pkErrLen( args,
                            "Called a get-binding" );
                    if ( listGet( args, 0 ).tag !== "string" )
                        return pkErr(
                            "Called a get-binding with a " +
                            "non-string name" );
                    if ( !isNat( listGet( args, 1 ) ) )
                        return pkErr(
                            "Called a get-binding with a capture " +
                            "count that wasn't a nat" );
                    if ( jsName === listGet( args, 0 ).special.jsStr )
                        return pk( "yep", pkList(
                            pk( "param-binding", listGet( args, 1 ) ),
                            pkList( pkList( pkNil, pkNil ) ),
                            pkNil
                        ) );
                    return runWaitTryBinding( next, "a get-binding",
                        function ( next ) {
                        
                        return self.callMethod( "call", pkList(
                            nonlocalGetBinding,
                            pkList( listGet( args, 0 ), captureCount )
                        ), next );
                    }, function (
                        captureBinding, nonlocalCaptureFrames,
                        maybeMacro, next ) {
                        
                        return lenPlusNat(
                            nonlocalCaptureFrames, captureCount, next,
                            function ( captureCount, next ) {
                            
                            return pk( "yep", pkList(
                                pk( "param-binding",
                                    listGet( args, 1 ) ),
                                pkList( pkList(
                                    pk( "yep", captureBinding ),
                                    nonlocalCaptureFrames
                                ) ),
                                maybeMacro
                            ) );
                        } );
                    } );
                } ),
                pkNil
            ), next );
        }, function (
            bodyBinding, localCaptureFrames, maybeMacro, next ) {
            
            // NOTE: This isn't quite a map operation, because we
            // thread captureCount through it (not to mention that we
            // accumulate two results per pass, and one of the result
            // lists gets flattened).
            return processCaptures(
                localCaptureFrames, pkNil, pkNil, captureCount, next
                );
            function processCaptures(
                localCaptureFrames, revCaptureBindings,
                revNonlocalCaptureFrames, captureCount, next ) {
                
                if ( localCaptureFrames.tag !== "cons" )
                    return listRevAppend(
                        revCaptureBindings, pkNil, next,
                        function ( captureBindings, next ) {
                        
                        return listRevFlatten(
                            revNonlocalCaptureFrames, next,
                            function ( nonlocalCaptureFrames, next ) {
                            
                            return pk( "yep", pkList(
                                pk( "fn-binding",
                                    captureBindings, bodyBinding ),
                                nonlocalCaptureFrames,
                                pkNil
                            ) );
                        } );
                    } );
                var errLongWindedness =
                    " from a get-binding, a " +
                    "macroexpand-to-binding, or a macro result " +
                    "somewhere along the line";
                if ( !(isList( localCaptureFrames.ind( 0 ) )
                    && listLenIs( localCaptureFrames.ind( 0 ), 2 ) ) )
                    return pkErr(
                        "Got a non-pair capture frame" +
                        errLongWindedness );
                var maybeCaptureBinding =
                    listGet( localCaptureFrames.ind( 0 ), 0 );
                var theseNonlocalCaptureFrames =
                    listGet( localCaptureFrames.ind( 0 ), 1 );
                // TODO: See if we should verify the structure of
                // maybeCaptureBinding and theseNonlocalCaptureFrames.
                return lenPlusNat(
                    theseNonlocalCaptureFrames, captureCount, next,
                    function ( captureCount, next ) {
                    
                    return processCaptures(
                        localCaptureFrames.ind( 1 ),
                        pkCons( localCaptureFrames.ind( 0 ).ind( 0 ),
                            revCaptureBindings ),
                        pkCons( theseNonlocalCaptureFrames,
                            revNonlocalCaptureFrames ),
                        captureCount,
                        next );
                } );
            }
        } );
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
    // TODO: Respect linearity. When we call this from Penknife code
    // someday, if val is linear, raise an error.
    var meta = this.prepareMeta_( name, "val" );
    if ( meta === null )
        return false;
    meta.val = val;
    return true;
};
PkRuntime.prototype.defMacro = function ( name, macro ) {
    // TODO: Respect linearity. When we call this from Penknife code
    // someday, if macro is linear, raise an error.
    var meta = this.prepareMeta_( name );
    if ( meta === null )
        return false;
    meta.macro = macro;
    return true;
};
PkRuntime.prototype.defTag = function ( name, keys ) {
    var meta = this.prepareMeta_( name );
    if ( meta === null )
        return false;
    if ( meta.tagKeys !== void 0 )
        return false;
    meta.tagKeys = keys;
    return true;
};
PkRuntime.prototype.defMethod = function ( name, args ) {
    var meta = this.prepareMeta_( name, "method" );
    if ( meta === null )
        return false;
    if ( meta.methodArgs !== void 0 )
        return false;
    meta.methodArgs = args;
    meta.methodImplsByTag = strMap();
    return true;
};
PkRuntime.prototype.callMethod = function ( name, args, next ) {
    var meta = this.meta_.get( name );
    if ( listLenIs( args, 0 ) )
        return pkErrLen( args, "Called method " + name );
    var impl = meta.methodImplsByTag.get( listGet( args, 0 ).tag );
    if ( impl === void 0 )
        return pkErr(
            "No implementation for method " + name + " tag " +
            listGet( args, 0 ).tag );
    return impl.call( args, next );
};
PkRuntime.prototype.setImpl = function ( methodName, tagName, call ) {
    var methodMeta = this.meta_.get( methodName );
    if ( methodMeta.methodOrVal !== "method" )
        return pkErr(
            "Can't implement non-method " + methodName + " for tag " +
            tagName );
    var tagMeta = this.meta_.get( tagName );
    if ( tagMeta.tagKeys === void 0 )
        return pkErr(
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
                return pkErrLen( args, "Called " + methodName );
            return call( args, next );
        } );
    } );
};
PkRuntime.prototype.getVal = function ( name ) {
    var self = this;
    var meta = self.meta_.get( name );
    if ( meta === void 0 )
        return pkErr( "Unbound variable " + name );
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
                    return pkErrLen( args, "Can't make " + name );
                return pk( "yep", new Pk().init_( name, args, {} ) );
            } );
        } ) );
    // NOTE: If (meta.macro !== void 0), we don't do anything special.
    return pkErr( "Unbound variable " + name );
};
PkRuntime.prototype.getMacro = function ( name ) {
    var meta = this.meta_.get( name );
    if ( meta === void 0 )
        return pkErr( "Unbound variable " + name );
    
    // If the name is specifically bound to macro behavior, use that.
    if ( meta.macro !== void 0 )
        return pk( "yep", pk( "yep", meta.macro ) );
    
    if ( meta.methodOrVal === "val"
        || meta.methodOrVal === "method"
        || meta.tagKeys !== void 0 )
        return pk( "yep", pkNil );
    
    return pkErr( "Unbound variable " + name );
};
PkRuntime.prototype.conveniences_syncNext =
    { runWait: function ( step, then ) {
        return then( step( this ), this );
    } };
PkRuntime.prototype.conveniences_macroexpand = function (
    expr, opt_next ) {
    
    var self = this;
    if ( opt_next === void 0 )
        opt_next = self.conveniences_syncNext;
    return runWaitTryBinding( opt_next, "macroexpand-to-binding",
        function ( next ) {
        
        return self.callMethod( "macroexpand-to-binding", pkList(
            expr,
            bindingGetter( self, "main-binding" ),
            pkNil
        ), next );
    }, function ( binding, captures, maybeMacro, next ) {
        if ( captures.tag !== "nil" )
            return pkErr(
                "Got a top-level macroexpansion result with " +
                "captures" );
        return pk( "yep", binding );
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
    
    if ( opt_next === void 0 )
        opt_next = this.conveniences_syncNext;
    return this.callMethod(
        "binding-interpret", pkList( binding, pkNil ), opt_next );
};
function makePkRuntime() {
    return new PkRuntime().init_();
}

// TODO: Define more useful utilities, including function syntaxes,
// conditionals, assignment, tag definitions, method definitions, and
// exceptions.
