// era-penknife.js
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";

function Pk() {}
Pk.prototype.init_ = function ( tag, args, special ) {
    this.tag = tag;
    this.args = args;
    this.special = special;
    return this;
};
Pk.prototype.toString = function () {
    function space( arr ) {
        return arrMap( arr, function ( elem ) {
            return " " + elem;
        } ).join( "" );
    }
    if ( this.tag === "string" )
        return JSON.stringify( this.special.jsStr );
    if ( this.tag === "fn" )
        return "" + this.special.call;
    if ( this.tag === "cons" ) {
        var arr = [];
        for ( var pk = this; pk.tag === "cons"; pk = pk.args[ 1 ] )
            arr.push( pk.args[ 0 ] );
        return "#(list" + space( arr ) + ")";
    }
    return "(" + this.tag + space( this.args ) + ")";
};
function pk( tag, var_args ) {
    return new Pk().init_( tag, [].slice.call( arguments, 1 ), {} );
}
function pkStr( jsStr ) {
    return new Pk().init_( "string", [], { jsStr: jsStr } );
}
function pkfn( call ) {
    return new Pk().init_( "fn", [], { call: call } );
}
function pkErr( jsStr ) {
    return pk( "nope", pkStr( jsStr ) );
}
function pkListFromArr( arr ) {
    var result = pk( "nil" );
    for ( var i = arr.length - 1; 0 <= i; i-- )
        result = pk( "cons", arr[ i ], result );
    return result;
}
function pkList( var_args ) {
    return pkListFromArr( arguments );
}

function isList( x ) {
    return x.tag === "cons" || x.tag === "nil";
}
function bindingGetter( nameForError ) {
    return pkfn( function ( args, next ) {
        if ( args.length !== 1 )
            return pkErr(
                "Called " + nameForError + " with " +
                args.length + " args" );
        if ( args[ 0 ].tag !== "string" )
            return pkErr(
                "Called " + nameForError + " with a non-string " +
                "name" );
        return pk( "yep", pk( "main-binding", args[ 0 ] ) );
    } );
}
function runWaitTry( next, func, then ) {
    return next.runWait( function ( next ) {
        return func( next );
    }, function ( tryVal, next ) {
        if ( tryVal.tag !== "yep" )
            return tryVal;
        return then( tryVal.args[ 0 ], next );
    } );
}
function runWaitOne( next, then ) {
    return next.runWait( function ( next ) {
        return null;
    }, function ( ignored, next ) {
        return then( next );
    } );
}
var bindingGetterForMacroexpand = bindingGetter( "a get-binding" );
function funcAsMacro( pkRuntime, funcBinding ) {
    return pkfn( function ( args, next ) {
        if ( args.length !== 2 )
            return pkErr(
                "Called a non-macro's macroexpander with " +
                args.length + " args." );
        if ( !isList( args[ 1 ] ) )
            return pkErr(
                "Called a non-macro's macroexpander with a " +
                "non-list args list." );
        function parseList( list, next ) {
            if ( list.tag !== "cons" )
                return pk( "yep", pk( "nil" ) );
            return runWaitTry( next, function ( next ) {
                return pkRuntime.callMethod( "macroexpand-to-binding",
                    [ list.args[ 0 ], args[ 0 ] ], next );
            }, function ( elem, next ) {
                return runWaitTry( next, function ( next ) {
                    return parseList( list.args[ 1 ], next );
                }, function ( parsedTail, next ) {
                    return pk( "yep",
                        pk( "cons", elem, parsedTail ) );
                } );
            } );
        }
        return runWaitTry( next, function ( next ) {
            return parseList( args[ 1 ], next );
        }, function ( parsedArgs, next ) {
            return pk( "yep",
                pk( "call-binding", funcBinding, parsedArgs ) );
        } );
    } );
}

function PkRuntime() {}
PkRuntime.prototype.init_ = function () {
    var runToArray_syncLimit = 100;
    function runToArray( next, x ) {
        var array = [];
        return runAppend( next, x );
        function runAppend( next, x ) {
            for ( var i = 0; i < runToArray_syncLimit; i++ ) {
                if ( x.tag !== "cons" )
                    return array;
                array.push( x.args[ 0 ] );
                x = x.args[ 1 ];
            }
            return runWaitOne( next, function ( next ) {
                return runAppend( next, x );
            } );
        }
    }
    
    var self = this;
    self.meta_ = strMap();
    self.defTag( "cons", [ "car", "cdr" ] );
    self.defVal( "cons", pkfn( function ( args, next ) {
        if ( args.length !== 2 )
            return pkErr(
                "Called cons with " + args.length + " args" );
        if ( !isList( args[ 1 ] ) )
            return pkErr(
                "Called cons with a cdr that wasn't a list" );
        return pk( "yep", pk( "cons", args[ 0 ], args[ 1 ] ) );
    } ) );
    self.defTag( "yep", [ "val" ] );
    self.defTag( "nope", [ "val" ] );
    self.defTag( "nil", [] );
    self.defTag( "string", [] );
    self.defVal( "string", pkfn( function ( args, next ) {
        return pkErr( "The string function has no behavior" );
    } ) );
    self.defTag( "fn", [] );
    self.defVal( "fn", pkfn( function ( args, next ) {
        return pkErr( "The fn function has no behavior" );
    } ) );
    self.defMethod( "call", [ "self", "args" ] );
    self.setStrictImpl( "call", "fn", function ( args, next ) {
        if ( !isList( args[ 1 ] ) )
            return pkErr( "Called call with a non-list args list" );
        return next.runWait( function ( next ) {
            return runToArray( next, args[ 1 ] );
        }, function ( argsArray, next ) {
            return args[ 0 ].special.call( argsArray, next );
        } );
    } );
    self.defTag( "main-binding", [ "name" ] );
    self.defVal( "main-binding", bindingGetter( "main-binding" ) );
    self.defTag( "call-binding", [ "op", "args" ] );
    self.defVal( "call-binding", pkfn( function ( args, next ) {
        if ( args.length !== 2 )
            return pkErr(
                "Called call-binding with " + args.length + " args" );
        if ( !isList( args[ 1 ] ) )
            return pkErr(
                "Called call-binding with a non-list args list" );
        return pk( "yep",
            pk( "call-binding", args[ 0 ], args[ 1 ] ) );
    } ) );
    
    self.defMethod( "binding-get-val", [ "self" ] );
    self.setStrictImpl( "binding-get-val", "main-binding",
        function ( args, next ) {
        
        return self.getVal( args[ 0 ].args[ 0 ].special.jsStr );
    } );
    // TODO: See if we should implement binding-get-val for
    // call-binding.
    
    self.defMethod( "binding-interpret", [ "self" ] );
    self.setStrictImpl( "binding-interpret", "main-binding",
        function ( args, next ) {
        
        return runWaitOne( next, function ( next ) {
            return self.callMethod(
                "binding-get-val", [ args[ 0 ] ], next );
        } );
    } );
    self.setStrictImpl( "binding-interpret", "call-binding",
        function ( args, next ) {
        
        function interpretList( list, next ) {
            if ( list.tag !== "cons" )
                return pk( "yep", pk( "nil" ) );
            return runWaitTry( next, function ( next ) {
                return self.callMethod(
                    "binding-interpret", [ list.args[ 0 ] ], next );
            }, function ( elem, next ) {
                return runWaitTry( next, function ( next ) {
                    return interpretList( list.args[ 1 ], next );
                }, function ( interpretedTail, next ) {
                    return pk( "yep",
                        pk( "cons", elem, interpretedTail ) );
                } );
            } );
        }
        return runWaitTry( next, function ( next ) {
            return self.callMethod(
                "binding-interpret", [ args[ 0 ].args[ 0 ] ], next );
        }, function ( op, next ) {
            return runWaitTry( next, function ( next ) {
                return interpretList( args[ 0 ].args[ 1 ], next );
            }, function ( args, next ) {
                return self.callMethod( "call", [ op, args ], next );
            } );
        } );
    } );
    
    self.defMethod( "binding-get-macro", [ "self" ] );
    self.setStrictImpl( "binding-get-macro", "main-binding",
        function ( args, next ) {
        
        return self.getMacro( args[ 0 ].args[ 0 ].special.jsStr );
    } );
    // TODO: See if we should implement binding-get-macro for
    // call-binding.
    
    self.defMethod( "macroexpand-to-binding",
        [ "self", "get-binding" ] );
    self.setStrictImpl( "macroexpand-to-binding", "string",
        function ( args, next ) {
        
        return runWaitOne( next, function ( next ) {
            return self.callMethod(
                "call", [ args[ 1 ], pkList( args[ 0 ] ) ], next );
        } );
    } );
    self.setStrictImpl( "macroexpand-to-binding", "cons",
        function ( args, next ) {
        
        return runWaitTry( next, function ( next ) {
            return self.callMethod( "macroexpand-to-binding",
                [ args[ 0 ].args[ 0 ], args[ 1 ] ], next );
        }, function ( opBinding, next ) {
            return runWaitTry( next, function ( next ) {
                return self.callMethod( "binding-get-macro",
                    [ opBinding ], next );
            }, function ( op, next ) {
                return self.callMethod( "call",
                    [ op, pkList( args[ 1 ], args[ 0 ].args[ 1 ] ) ],
                    next );
            } );
        } );
    } );
    
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
    var meta = this.prepareMeta_( name, "val" );
    if ( meta === null )
        return false;
    meta.val = val;
    return true;
};
PkRuntime.prototype.defMacro = function ( name, macro ) {
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
    if ( args.length === 0 )
        return pkErr( "Called method " + name + " with 0 args" );
    var impl = meta.methodImplsByTag.get( args[ 0 ].tag );
    if ( impl === void 0 )
        return pkErr(
            "No implementation for method " + name + " tag " +
            args[ 0 ].tag );
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
    return pk( "yep", pk( "nil" ) );
};
PkRuntime.prototype.setStrictImpl = function (
    methodName, tagName, call ) {
    
    var methodMeta = this.meta_.get( methodName );
    return this.setImpl( methodName, tagName,
        function ( args, next ) {
        
        if ( args.length !== methodMeta.methodArgs.length )
            return pkErr(
                "Called " + methodName + " with " +
                args.length + " args" );
        return call( args, next );
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
            return self.callMethod( name, args, next );
        } ) );
    if ( meta.tagKeys !== void 0 )
        return pk( "yep", pkfn( function ( args, next ) {
            if ( meta.tagKeys.length !== args.length )
                return pkErr(
                    "Can't make " + name + " with " +
                    args.length + " args" );
            return pk( "yep", new Pk().init_( name, args, {} ) );
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
        return pk( "yep", meta.macro );
    
    if ( meta.methodOrVal === "val"
        || meta.methodOrVal === "method"
        || meta.tagKeys !== void 0 )
        return pk( "yep",
            funcAsMacro(
                this, pk( "main-binding", pkStr( name ) ) ) );
    
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
        [ expr, bindingGetter( "main-binding" ) ], opt_next );
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
    return this.callMethod( "binding-interpret",
        [ binding ], opt_next );
};
function makePkRuntime() {
    return new PkRuntime().init_();
}

// TODO: Define more useful utilities, including function syntaxes,
// conditionals, assignment, tag definitions, method definitions, and
// exceptions.
