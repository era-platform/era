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
    return "" + message + " with " + (
        len === null ? "way too many args" :
        len === 1 ? "1 arg" :
            "" + len + " args");
}
function bindingGetter( nameForError ) {
    return pkfn( function ( args, next ) {
        if ( !listLenIs( args, 1 ) )
            return pkErrLen( args, "Called " + nameForError );
        if ( listGet( args, 0 ).tag !== "string" )
            return pkErr(
                "Called " + nameForError + " with a non-string " +
                "name" );
        return pk( "yep", pk( "main-binding", listGet( args, 0 ) ) );
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
var bindingGetterForMacroexpand = bindingGetter( "a get-binding" );
function funcAsMacro( pkRuntime, funcBinding ) {
    // TODO: Respect linearity. If funcBinding is linear, the function
    // we return here should also be linear.
    return pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( args,
                "Called a non-macro's macroexpander" );
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called a non-macro's macroexpander with a " +
                "non-list args list" );
        // TODO: Respect linearity. Perhaps listGet( args, 0 ) is
        // linear, in which case we should raise an error.
        function parseList( list, next ) {
            if ( list.tag !== "cons" )
                return pk( "yep", pkNil );
            return runWaitTry( next, function ( next ) {
                return pkRuntime.callMethod( "macroexpand-to-binding",
                    pkList( list.ind( 0 ), listGet( args, 0 ) ),
                    next );
            }, function ( elem, next ) {
                return runWaitTry( next, function ( next ) {
                    return parseList( list.ind( 1 ), next );
                }, function ( parsedTail, next ) {
                    return pk( "yep", pkCons( elem, parsedTail ) );
                } );
            } );
        }
        return runWaitTry( next, function ( next ) {
            return parseList( listGet( args, 1 ), next );
        }, function ( parsedArgs, next ) {
            return pk( "yep",
                pk( "call-binding", funcBinding, parsedArgs ) );
        } );
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
    self.defVal( "main-binding", bindingGetter( "main-binding" ) );
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
    self.defTag( "local-binding", pkList() );
    self.defTag( "nonlocal-binding", pkList( "binding" ) );
    self.defTag( "fn-binding", pkList( "body-binding" ) );
    
    self.defMethod( "binding-get-val", pkList( "self" ) );
    self.setStrictImpl( "binding-get-val", "main-binding",
        function ( args, next ) {
        
        return self.getVal(
            listGet( args, 0 ).ind( 0 ).special.jsStr );
    } );
    // TODO: See if we should implement binding-get-val for
    // call-binding, local-binding, nonlocal-binding, or fn-binding.
    
    // TODO: Respect linearity in binding-interpret. This will require
    // some major refactoring, since we copy and drop the stack a lot
    // right now.
    self.defMethod( "binding-interpret", pkList( "self", "stack" ) );
    self.setStrictImpl( "binding-interpret", "main-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called binding-interpret with a non-list stack" );
        return runWaitOne( next, function ( next ) {
            return self.callMethod( "binding-get-val",
                pkList( listGet( args, 0 ) ), next );
        } );
    } );
    self.setStrictImpl( "binding-interpret", "call-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called binding-interpret with a non-list stack" );
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
    self.setStrictImpl( "binding-interpret", "local-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called binding-interpret with a non-list stack" );
        if ( listGet( args, 1 ).tag !== "cons" )
            return pkErr(
                "Tried to interpret local-binding with an empty " +
                "stack" );
        return pk( "yep", listGet( args, 1 ).ind( 0 ) );
    } );
    self.setStrictImpl( "binding-interpret", "nonlocal-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called binding-interpret with a non-list stack" );
        if ( listGet( args, 1 ).tag !== "cons" )
            return pkErr(
                "Tried to interpret a nonlocal-binding with an " +
                "empty stack" );
        return runWaitOne( next, function ( next ) {
            return self.callMethod( "binding-interpret", pkList(
                listGet( args, 0 ).ind( 0 ),
                listGet( args, 1 ).ind( 1 )
            ), next );
        } );
    } );
    self.setStrictImpl( "binding-interpret", "fn-binding",
        function ( args, next ) {
        
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called binding-interpret with a non-list stack" );
        var bodyBinding = listGet( args, 0 ).ind( 0 );
        var stack = listGet( args, 1 );
        return pk( "yep", pkfn( function ( args, next ) {
            return self.callMethod( "binding-interpret",
                pkList( bodyBinding, pkCons( args, stack ) ), next );
        } ) );
    } );
    
    // NOTE: We respect linearity in binding-get-macro already, but it
    // has a strange contract. If it returns nil, it should not
    // consume its argument, so that funcAsMacro can consume it
    // instead.
    self.defMethod( "binding-get-macro", pkList( "self" ) );
    self.setStrictImpl( "binding-get-macro", "main-binding",
        function ( args, next ) {
        
        return self.getMacro(
            listGet( args, 0 ).ind( 0 ).special.jsStr );
    } );
    arrEach( [ "call-binding", "local-binding", "fn-binding" ],
        function ( tag ) {
        
        self.setStrictImpl( "binding-get-macro", tag,
            function ( args, next ) {
            
            return pk( "yep", pkNil );
        } );
    } );
    self.setStrictImpl( "binding-get-macro", "nonlocal-binding",
        function ( args, next ) {
        
        return runWaitOne( next, function ( next ) {
            return self.callMethod( "binding-get-macro",
                pkList( listGet( args, 0 ).ind( 0 ) ), next );
        } );
    } );
    
    self.defMethod( "macroexpand-to-binding",
        pkList( "self", "get-binding" ) );
    self.setStrictImpl( "macroexpand-to-binding", "string",
        function ( args, next ) {
        
        return runWaitOne( next, function ( next ) {
            return self.callMethod( "call", pkList(
                listGet( args, 1 ),
                pkList( listGet( args, 0 ) )
            ), next );
        } );
    } );
    self.setStrictImpl( "macroexpand-to-binding", "cons",
        function ( args, next ) {
        
        // TODO: Respect linearity. Perhaps listGet( args, 1 ) is
        // linear, in which case we should raise an error.
        return runWaitTry( next, function ( next ) {
            return self.callMethod( "macroexpand-to-binding", pkList(
                listGet( args, 0 ).ind( 0 ),
                listGet( args, 1 )
            ), next );
        }, function ( opBinding, next ) {
            return runWaitTry( next, function ( next ) {
                return self.callMethod( "binding-get-macro",
                    pkList( opBinding ), next );
            }, function ( maybeOp, next ) {
                var op = maybeOp.tag === "yep" ? maybeOp.ind( 0 ) :
                    funcAsMacro( self, opBinding );
                return self.callMethod( "call", pkList(
                    op,
                    pkList( listGet( args, 1 ),
                        listGet( args, 0 ).ind( 1 ) )
                ), next );
            } );
        } );
    } );
    
    self.defMacro( "fn", pkfn( function ( args, next ) {
        if ( !listLenIs( args, 2 ) )
            return pkErrLen( args, "Called fn's macroexpander" );
        if ( !isList( listGet( args, 1 ) ) )
            return pkErr(
                "Called fn's macroexpander with a non-list macro body"
                );
        var nonlocalGetBinding = listGet( args, 0 );
        // TODO: Respect linearity. Perhaps nonlocalGetBinding is
        // linear, in which case we should raise an error.
        var body = listGet( args, 1 );
        if ( !listLenIs( body, 2 ) )
            return pkErrLen( body, "Expanded fn" );
        if ( listGet( body, 0 ).tag !== "string" )
            return pkErr( "Expanded fn with a non-string var" );
        var jsName = listGet( body, 0 ).special.jsStr;
        return runWaitTry( next, function ( next ) {
            return self.callMethod( "macroexpand-to-binding", pkList(
                listGet( body, 1 ),
                pkfn( function ( args, next ) {
                    if ( !listLenIs( args, 1 ) )
                        return pkErrLen( args,
                            "Called a get-binding" );
                    if ( listGet( args, 0 ).tag !== "string" )
                        return pkErr(
                            "Called a get-binding with a " +
                            "non-string name" );
                    if ( jsName === listGet( args, 0 ).special.jsStr )
                        return pk( "yep", pk( "local-binding" ) );
                    return runWaitTry( next, function ( next ) {
                        return self.callMethod( "call", pkList(
                            nonlocalGetBinding,
                            pkList( listGet( args, 0 ) )
                        ), next );
                    }, function ( binding, next ) {
                        return pk( "yep",
                            pk( "nonlocal-binding", binding ) );
                    } );
                } )
            ), next );
        }, function ( bodyBinding, next ) {
            return pk( "yep", pk( "fn-binding", bodyBinding ) );
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
PkRuntime.prototype.getBinding = function ( name ) {
    return pk( "main-binding", pkStr( name ) );
};
PkRuntime.prototype.conveniences_syncNext =
    { runWait: function ( step, then ) {
        return then( step( this ), this );
    } };
PkRuntime.prototype.conveniences_macroexpand = function (
    expr, opt_next ) {
    
    if ( opt_next === void 0 )
        opt_next = this.conveniences_syncNext;
    return this.callMethod( "macroexpand-to-binding",
        pkList( expr, bindingGetter( "main-binding" ) ), opt_next );
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
