// era-staccato.js
// Copyright 2015 Ross Angle. Released under the MIT License.
//
// Staccato is (or rather, will be) a small language and intermediate
// representation for writing implementations of untyped,
// garbage-collected, imperative languages that compile to untyped,
// garbage-collected, imperative target platforms.
//
// As a Staccato program runs, it performs simple Staccato operations
// (and maybe some custom native operations) and frequently reaches an
// opportunity for a well-defined state snapshot. For target platforms
// that support saving and loading snapshots, the snapshot formats are
// easy to convert, even if the ideal encodings and usage methods may
// vary between platforms for performance reasons.
//
// Thanks to these well-defined state snapshots, if the user pays
// close attention to what they're doing when they modify their
// Staccato programs, they may upgrade a program while continuing to
// support old snapshots -- maybe even upgrade a program while it's
// running. Staccato has been designed for these use cases! Very small
// changes to a Staccato program will not break compatibility, and
// larger changes that cause missing definition errors can be patched
// by simply providing those definitions alongside the rest of the
// program.
//
// The number of Staccato operations that occur between state
// snapshots is bounded by a function of the Staccato program
// implementation. This bound does not vary dynamically unless the
// implementation itself does! This means Staccato programs are rather
// good citizens when the target platform is a cooperative
// multithreading environment; they won't cause long pauses. (To make
// this bound meaningful, most Staccato operations can be implemented
// in constant time on most target platforms. Unfortunately, an
// exception is the (frame ...) Staccato operation, which performs
// allocation.)
//
// Since the Staccato language and Staccato programs go to the trouble
// to specify an upgrade-friendly snapshot format, and new versions of
// a Staccato program can use old snapshots as they see fit,
// information hiding would be of limited use. Indeed, there would be
// a maintenance problem where function closures embedded in old
// snapshots may represent entities whose interface exposed to newer
// code should be somewhat different, even as their interface exposed
// to older code should remain the same. For this reason, Staccato
// function closures simply do not encapsulate their captured
// variables.
//
// Since Staccato function closures aren't encapsulated, they serve
// double duty as data containers, and indeed they're Staccato's only
// value type. Perhaps a Staccato value can be used like a document
// with content negotiation: If you know exactly how to interpret this
// document type, go ahead and interpret it yourself; otherwise, you
// may choose to negotiate with the document by executing it with
// access to a document describing your intentions.


// TODO: Use localStorageStack() and run() in a runtime implementation
// of Staccato.

function localStorageStack() {
    function get( k ) {
        var text = localStorage.get( JSON.stringify( k ) ) || "null";
        try { return JSON.parse( text ); }
        catch ( e ) { return null; }
    }
    function set( k, v ) {
        if ( v === null )
            return void localStorage.clear( JSON.stringify( k ) );
        localStorage.set( JSON.stringify( k ), JSON.stringify( v ) );
    }
    var result = {};
    result.setReturnValue = function ( v ) {
        set( "returnValue", v );
    };
    result.getReturnValue = function () {
        return get( "returnValue" );
    };
    result.push = function ( frame ) {
        var i = ~~get( "frames" );
        set( "frames", i + 1 );
        set( [ "frame", i ], [ frame.frameName, frame.env ] );
    };
    result.pop = function () {
        var i = get( "frames" );
        if ( i !== ~~i )
            return null;
        set( "frames", Math.max( 0, i - 1 ) );
        var result = get( [ "frame", i ] );
        set( [ "frame", i ], null );
        return { frameName: result[ 0 ], env: result[ 1 ] };
    };
    return result;
}

function run( stack, rules ) {
    while ( true ) {
        var frame = stack.pop();
        if ( !frame )
            return stack.getReturnValue();
        var rule = rules[ frame.frameName ];
        var newFrames = rule( frame.env, stack.getReturnValue() );
        while ( newFrames.type === "pendingFrame" ) {
            stack.push( newFrames.frame );
            newFrames = newFrames.next;
        }
        if ( newFrames.type !== "returnValue" )
            throw new Error();
        stack.setReturnValue( newFrames.returnValue );
    }
}


// def ::=
//   // This defines a frame that takes an environment with the
//   // variables needed in the case-list. It proceeds by matching the
//   // incoming return value against the case-list under that scope.
//   (def frame-name opt-var-list case-list)
//
// case-list ::=
//   // This proceeds as the given case-list while binding the given
//   // variable to the value being matched.
//   //
//   (let-case var case-list)
//
//   // If the value to match is a function closure that fits the
//   // given frame name and environment pattern, this proceeds as the
//   // get-expr with the pattern's variables in scope. Otherwise, it
//   // proceeds as the case-list.
//   //
//   // The get-expr counts as a new root parent expression.
//   //
//   (match frame-name env-pattern
//     get-expr
//     case-list)
//
//   // This proceeds as the get-expr.
//   //
//   // The get-expr counts as a new root parent expression.
//   //
//   (any get-expr)
//
// env-expr ::=
//   (env-nil)
//   (env-cons var get-expr env-expr)
//
// get-expr ::=
//   // Sugar.
//   //
//   // If this expression is a root parent expression, then get-expr
//   // counts as a new root parent expression.
//   //
//   (let-def def get-expr)
//
//   // This executes the env-expr and proceeds as the get-expr with
//   // those bindings in scope.
//   //
//   // NOTE: This is not a recursive let where a binding is in scope
//   // during its own expression. It's not a sequential let where a
//   // binding is in scope during later bindings. For example, if x
//   // and y are in scope, then (let (env-cons x x (env-nil)) ...)
//   // has no effect, and
//   // (let (env-cons x y (env-cons y x (env-nil))) ...) has the
//   // effect of swapping x and y.
//   //
//   // NOTE: This is the only syntax that allows changing the lexical
//   // scope in between a Staccato operation's case-list branch being
//   // selected and the end of the operation. More concretely, this
//   // is the only syntax that can change the lexical scope in
//   // between a (save ...) and its root parent expression, which can
//   // cause a scope error if it would get in the way of (save ...)
//   // desugaring.
//   //
//   (let env-expr get-expr)
//
//   // To use this, the expression must be the last computation that
//   // happens under the root parent expression.
//   //
//   // This calls the first given get-expr's result as a function
//   // closure with the second given get-expr's result as its
//   // argument.
//   //
//   // The second get-expr counts as a new root parent expression.
//   //
//   // When implementing this operation on a target platform, it may
//   // be a good optimization to special-case
//   // (call (frame frame-name env-expr) get-expr) so that an
//   // allocation can be avoided.
//   //
//   (call get-expr get-expr)
//
//   (local var)
//
//   // This forms a function closure from any frame and any
//   // environment. Whenever the function's argument is supplied, it
//   // will be used as the frame's incoming return value.
//   (frame frame-name env-expr)
//
//   // Sugar.
//   //
//   // When this is used, it replaces the entire behavior of the root
//   // parent expression at desugaring time. If multiple uses occur
//   // in the same root parent expression, the earliest one applies
//   // first. (Once it's done, the second one will be in position to
//   // be applied, and so on.)
//   //
//   // This defines a frame that takes an environment with entries
//   // for the variables needed in the remainder of the parent
//   // expression, but without an entry for the given variable. The
//   // given variable is used for the incoming return value instead.
//   // This then calls the frame with an environment captured from
//   // the lexical scope at the *base* of the root parent expression
//   // (not at the position (save ...) occupied within the root
//   // parent expression), providing the result of the given get-expr
//   // as the incoming return value. The defined frame proceeds by
//   // doing the remainder of what the root parent expression would
//   // have done.
//   //
//   // The opt-var-list specifies the free variables of the defined
//   // frame. Reiterating, these variables refer to the lexical scope
//   // at the *base* of the root parent expression, not the position
//   // (save ...) occupies within that expression.
//   //
//   // It's an error to access any variable by the given variable
//   // name in the remainder of the root parent expression, since
//   // those accesses would be clobbered by the desugaring of this
//   // syntax.
//   //
//   // It's also an error to surround this expression with a local
//   // variable binding that would shadow the binding created during
//   // desugaring. The only way to cause this error is (let ...).
//   //
//   // The get-expr counts as a new root parent expression.
//   //
//   (save frame-name opt-var-list var get-expr)
//
//   // Sugar.
//   //
//   // This defines and forms a function closure for a frame that
//   // takes an environment with the variables needed in the
//   // case-list, which (in this call) is captured from the
//   // surrounding lexical scope. It proceeds by matching the
//   // incoming return value against the case-list under that scope.
//   //
//   (fn frame-name opt-var-list case-list)
//
//   // Sugar.
//   //
//   // To use this, the expression must be the last computation that
//   // happens under the root parent expression.
//   //
//   // This defines and calls a frame that takes an environment with
//   // the variables needed in the case-list, which (in this call) is
//   // captured from the surrounding lexical scope. It proceeds by
//   // matching the incoming return value, which (in this call) is
//   // the result of the given get-expr, against the case-list under
//   // that scope.
//   //
//   // The get-expr counts as a new root parent expression.
//   //
//   (case frame-name opt-var-list get-expr case-list)
//
// // When an opt-var-list is not omitted, it overrides the usual
// // behavior for inferring the variables required by a frame
// // definition. This way, frames can be defined that receive more
// // variables than they actually use.
// opt-var-list ::=
//   // Sugar.
//   (var-list-omitted)
//
//   (var-list var-list)
//
// var-list ::=
//   (var-list-nil)
//   (var-list-cons var var-list)
//
// env-pattern ::=
//   (env-pattern-nil)
//
//   // NOTE: The first var is the key in the environment, and the
//   // second var is the local variable to bind it to.
//   (env-pattern-cons var var env-pattern)

// NOTE: We implement these methods on every corresponding syntax:
// def/caseList/getExpr/envExpr visit( writer )
// def/caseList/getExpr/envExpr hasProperScope()
// envExpr isProperForSet( varSet )
// def/caseList/getExpr/envExpr desugarSave( isFinal )
// def/caseList/getExpr/envExpr desugarVarLists()
// def/caseList/getExpr/envExpr desugarFnAndCase()
// def desugarDefIncludingSelf()
// caseList/getExpr/envExpr desugarDef()
// def compileToNaiveJs( options )
// caseList/getExpr compileToNaiveJs( options, locals )
// envExpr keys()
// envExpr compileToNaiveJsForFrame( options, locals, keyToI )
// envExpr compileToNaiveJsForLet( options, locals )
// optVarList/varList set()
// optVarList or( varSet )
// optVarList/varList isProvidedProperlyForSet( varSet )
// optVarList/varList capture()
// envPattern valsToKeys()
// envPattern keysToVals()
// envPattern isProperForSets( keySet, varSet )

// NOTE: Certain parts of the implementation are marked "INTERESTING".
// These parts are tricky enough to be the motivators for the way the
// implementation has been built, and the other parts are more
// run-of-the-mill.

function JsnMap() {}
JsnMap.prototype.init_ = function ( contents ) {
    this.contents_ = contents;
    return this;
};
function jsnMap() {
    return new JsnMap().init_( strMap() );
}
JsnMap.prototype.has = function ( k ) {
    return this.contents_.has( JSON.stringify( k ) );
};
JsnMap.prototype.get = function ( k ) {
    return this.contents_.get( JSON.stringify( k ) ).v;
};
JsnMap.prototype.del = function ( k ) {
    this.contents_.del( JSON.stringify( k ) );
    return this;
};
JsnMap.prototype.set = function ( k, v ) {
    this.contents_.set( JSON.stringify( k ), { k: k, v: v } );
    return this;
};
JsnMap.prototype.setObj = function ( obj ) {
    var self = this;
    objOwnEach( obj, function ( k, v ) {
        self.set( k, v );
    } );
    return this;
};
JsnMap.prototype.setAll = function ( other ) {
    if ( !(other instanceof JsnMap) )
        throw new Error();
    this.contents_.setAll( other.contents_ );
    return this;
};
JsnMap.prototype.delAll = function ( other ) {
    if ( !(other instanceof JsnMap) )
        throw new Error();
    this.contents_.delAll( other.contents_ );
    return this;
};
JsnMap.prototype.copy = function () {
    return new JsnMap().init_( this.contents_.copy() );
};
JsnMap.prototype.add = function ( k ) {
    return this.set( k, true );
};
JsnMap.prototype.plusEntry = function ( k, v ) {
    return this.copy().set( k, v );
};
JsnMap.prototype.plusObj = function ( other ) {
    return this.copy().setObj( other );
};
JsnMap.prototype.plus = function ( other ) {
    return this.copy().setAll( other );
};
// TODO: Find a better name for this.
JsnMap.prototype.plusTruth = function ( k ) {
    return this.copy().add( k );
};
// TODO: Find a better name for this.
JsnMap.prototype.plusArrTruth = function ( arr ) {
    // TODO: Merge the trees more efficiently than this. We're using
    // AVL trees, which can supposedly merge in O( log (m + n) ) time,
    // but this operation is probably O( n * log (m + n) ).
    var result = this.copy();
    for ( var i = 0, n = arr.length; i < n; i++ )
        result.add( arr[ i ] );
    return result;
};
JsnMap.prototype.minusEntry = function ( k ) {
    return this.copy().del( k );
};
JsnMap.prototype.minus = function ( other ) {
    return this.copy().delAll( other );
};
// NOTE: This body takes its args as ( v, k ).
JsnMap.prototype.any = function ( body ) {
    return this.contents_.any( function ( kv, k ) {
        return body( kv.v, kv.k );
    } );
};
JsnMap.prototype.hasAny = function () {
    return this.contents_.hasAny();
};
JsnMap.prototype.subset = function ( other ) {
    return !this.minus( other ).hasAny();
};
// NOTE: This body takes its args as ( k, v ).
JsnMap.prototype.each = function ( body ) {
    this.any( function ( v, k ) {
        body( k, v );
        return false;
    } );
};
// NOTE: This body takes its args as ( v, k ).
JsnMap.prototype.map = function ( func ) {
    return new JsnMap().init_( this.contents_.map(
        function ( kv, k ) {
        
        return func( kv.k, kv.v );
    } ) );
};
// NOTE: This body takes its args as ( v, k ).
JsnMap.prototype.keep = function ( body ) {
    var result = jsnMap();
    this.each( function ( k, v ) {
        if ( body( v, k ) )
            result.set( k, v );
    } );
    return result;
};
// TODO: Add something corresponding to this to StrMap.
// NOTE: This body takes its args as ( k ).
JsnMap.prototype.mapKeys = function ( func ) {
    var result = jsnMap();
    this.each( function ( k, v ) {
        result.set( func( k ), v );
    } );
    return result;
};

function likeJsCons( x ) {
    return (true
        && likeObjectLiteral( x )
        && hasOwn( x, "first" )
        && hasOwn( x, "rest" )
    );
}
function jsListToArrBounded( x, maxLen ) {
    var result = [];
    for ( var n = 0; n <= maxLen; n++ ) {
        if ( !likeJsCons( x ) )
            return result;
        result.push( x.first );
        x = x.rest;
    }
    return null;
}

var syntaxes = strMap();
var nonterminals = strMap();
function isValidNontermName( x ) {
    return isPrimString( x )
        && /^[a-z]+$/i.test( x )
        && !(x === "self" || x in {});
}
function addStringSyntax( nontermName ) {
    if ( !isValidNontermName( nontermName ) )
        throw new Error();
    if ( !nonterminals.has( nontermName ) )
        nonterminals.set( nontermName, { type: "string" } );
    var nonterminal = nonterminals.get( nontermName );
    if ( nonterminal.type !== "string" )
        throw new Error();
}
function addSyntax( name, nontermName, argNontermNamesStr, methods ) {
    if ( !(isPrimString( name )
        && isValidNontermName( nontermName )
        && isPrimString( argNontermNamesStr )) )
        throw new Error();
    if ( syntaxes.has( name ) )
        throw new Error();
    var argNontermNames = arrKeep( argNontermNamesStr.split( /\s+/g ),
        function ( name, i ) {
            return name !== "";
        } );
    var argNontermNameIsDuplicated = strMap();
    arrEach( argNontermNames, function ( name, i ) {
        if ( !isValidNontermName( name ) )
            throw new Error();
        argNontermNameIsDuplicated.set( name,
            argNontermNameIsDuplicated.has( name ) );
    } );
    if ( !nonterminals.has( nontermName ) )
        nonterminals.set( nontermName,
            { type: "sumType", cases: strMap() } );
    var nonterminal = nonterminals.get( nontermName );
    if ( nonterminal.type !== "sumType" )
        throw new Error();
    nonterminal.cases.add( name );
    var methodsMap = strMap().plusObj( methods );
    methodsMap.each( function ( name, method ) {
        if ( name === "expr" || name in {} )
            throw new Error();
    } );
    syntaxes.set( name, {
        type: "sumTag",
        nontermName: nontermName,
        args: arrMap( argNontermNames, function ( nontermName, i ) {
            return {
                nontermName: nontermName,
                dslName:
                    argNontermNameIsDuplicated.get( nontermName ) ?
                        i : nontermName
            };
        } ),
        methods: strMap().plusObj( methods )
    } );
}
function parseSyntax( nontermName, expr ) {
    var nonterminal = nonterminals.get( nontermName );
    if ( nonterminal === void 0 )
        throw new Error();
    
    var result = {};
    result.expr = expr;
    
    if ( nonterminal.type === "string" ) {
        if ( !isPrimString( expr ) )
            throw new Error();
        return result;
    } else if ( nonterminal.type === "sumType" ) {
        if ( !(likeJsCons( expr )
            && isPrimString( expr.first )
            && nonterminal.cases.has( expr.first )) )
            throw new Error();
        var syntax = syntaxes.get( expr.first );
        var n = syntax.args.length;
        var argExprs = jsListToArrBounded( expr.rest, n );
        if ( argExprs === null || argExprs.length !== n )
            throw new Error();
        
        var args = {};
        args.self = result;
        arrEach( syntax.args, function ( argSyntax, i ) {
            var argExpr = argExprs[ i ];
            args[ argSyntax.dslName ] =
                parseSyntax( argSyntax.nontermName, argExpr );
        } );
        
        syntax.methods.each( function ( name, method ) {
            result[ name ] = function ( var_args ) {
                return method.apply( {},
                    [ args ].concat( [].slice.call( arguments ) ) );
            };
        } );
        
        // TODO: See if we should leave this in. It's a hack so that
        // it's easier to debug static scope errors, but it does
        // indeed make them a lot easier to debug.
        result.hasProperScope = function ( var_args ) {
            var methodResult =
                syntax.methods.get( "hasProperScope" ).apply( {},
                    [ args ].concat( [].slice.call( arguments ) ) );
            if ( !methodResult )
                throw new Error();
            return methodResult;
        };
        
        return result;
    } else {
        throw new Error();
    }
}

function freeVarsWriter() {
    // INTERESTING
    
    var result = jsnMap();
    
    var writer = {};
    writer.consume = function ( part, inheritedAttrs ) {
        if ( inheritedAttrs.shadow === null )
            return;
        
        var shadowed = getFreeVars( part );
        
        if ( inheritedAttrs.shadow === null ) {
            if ( shadowed.any( function ( truth, va ) {
                return va[ 0 ] !== "va:scopeError";
            } ) ) {
                // TODO: Use this error message: Encountered a use of
                // (def ...) with free variables
                shadowed = jsnMap().plusTruth( [ "va:scopeError" ] );
            }
        } else {
            shadowed = shadowed.minus( inheritedAttrs.shadow );
        }
        
        if ( shadowed.any( function ( truth, va ) {
            return va[ 0 ] === "va:savedInputVar" &&
                !shadowed.has( [ "va:va", va[ 1 ] ] );
        } ) ) {
            // TODO: Use this error message: Encountered a use of
            // (save ...) where the saved value's variable name was
            // locally bound somewhere between the parent root
            // expression's root and the saved location
            shadowed.add( [ "va:scopeError" ] );
        }
        
        if ( inheritedAttrs.finalPolicy === "root" ) {
            if ( shadowed.any( function ( truth, va ) {
                return va[ 0 ] === "va:savedInputVar" &&
                    shadowed.has( [ "va:va", va[ 1 ] ] );
            } ) ) {
                // TODO: Use this error message: Encountered a use of
                // (save ...) where the saved value's variable name
                // was used somewhere in the parent root expression
                shadowed.add( [ "va:scopeError" ] );
            }
            
            shadowed = shadowed.keep( function ( truth, va ) {
                return va[ 0 ] !== "va:savedInputVar" &&
                    va[ 0 ] !== "va:final";
            } ).mapKeys( function ( va ) {
                return va[ 0 ] === "va:savedFreeVar" ?
                    [ "va:va", va[ 1 ] ] : va;
            } );
        } else if ( inheritedAttrs.finalPolicy === "notFinal" ) {
            if ( shadowed.has( [ "va:final" ] ) ) {
                // TODO: Use this error message: Encountered a use of
                // (call ...) or (case ...) not in a final position
                shadowed.add( [ "va:scopeError" ] );
            }
            
            shadowed.del( [ "va:final" ] );
        } else if ( inheritedAttrs.finalPolicy === "inherit" ) {
            // Do nothing.
        } else if ( inheritedAttrs.finalPolicy ===
            "doesNotMatter" ) {
            
            if ( shadowed.any( function ( truth, va ) {
                return va[ 0 ] === "va:savedInputVar" ||
                    va[ 0 ] === "va:savedFreeVar" ||
                    va[ 0 ] === "va:final";
            } ) )
                throw new Error();
        } else {
            throw new Error();
        }
        
        result = result.plus( shadowed );
        return part.expr;
    };
    writer.redecorate = function ( extraVars, whole ) {
        return result.plus( extraVars );
    };
    return writer;
}
function getFreeVars( exprObj ) {
    return exprObj.visit( freeVarsWriter() );
}

function processSaveRoot( exprObj ) {
    // INTERESTING
    
    var desugared = exprObj.desugarSave( !!"isFinal" );
    if ( desugared.type === "expr" ) {
        return desugared.expr;
    } else if ( desugared.type === "save" ) {
        return processSaveRoot( parseSyntax( "getExpr",
            jsList( "call",
                jsList( "fn",
                    desugared.frameName.expr,
                    desugared.optVarList.expr,
                    jsList( "let-case", desugared.va.expr,
                        jsList( "any", desugared.frameBodyExpr ) ) ),
                desugared.arg.expr ) ) );
    } else {
        throw new Error();
    }
}

function idWriter( recur ) {
    var writer = {};
    writer.consume = function ( part, inheritedAttrs ) {
        return recur( part, inheritedAttrs );
    };
    writer.redecorate = function ( extraVars, whole ) {
        return whole;
    };
    return writer;
}

function desugarDefWriter() {
    var defs = [];
    
    var writer = {};
    writer.consume = function ( part, inheritedAttrs ) {
        var desugared = part.desugarDef();
        defs = defs.concat( desugared.defs );
        return desugared.expr;
    };
    writer.redecorate = function ( extraVars, whole ) {
        return { defs: defs, expr: whole };
    };
    return writer;
}

function desugarSaveWriter( isFinal ) {
    // INTERESTING
    
    // NOTE: The `state` variable is mutated a maximum of one time.
    var state = { type: "exprState" };
    
    var writer = {};
    writer.consume = function ( part, inheritedAttrs ) {
        // NOTE: We only desugar `part` some of the time!
        if ( state.type === "exprState" ) {
            
            if ( inheritedAttrs.finalPolicy === "root"
                || (inheritedAttrs.finalPolicy === "inherit"
                    && isFinal) )
                return processSaveRoot( part );
            
            var desugared = part.desugarSave( !"isFinal" );
            if ( desugared.type === "expr" ) {
                return desugared.expr;
            } else if ( desugared.type === "save" ) {
                state = {
                    type: "saveState",
                    frameName: desugared.frameName,
                    optVarList: desugared.optVarList,
                    va: desugared.va,
                    arg: desugared.arg
                };
                return desugared.frameBodyExpr;
            } else {
                throw new Error();
            }
        } else if ( state.type === "saveState" ) {
            return part.expr;
        } else {
            throw new Error();
        }
    };
    writer.redecorate = function ( extraVars, whole ) {
        if ( state.type === "exprState" ) {
            return { type: "expr", expr: whole };
        } else if ( state.type === "saveState" ) {
            return {
                type: "save",
                frameName: state.frameName,
                optVarList: state.optVarList,
                va: state.va,
                arg: state.arg,
                frameBodyExpr: whole
            };
        } else {
            throw new Error();
        }
    };
    return writer;
}

function makeFrameVars( varSet ) {
    var frameVars = [];
    varSet.each( function ( va, truth ) {
        if ( va[ 0 ] !== "va:va" )
            throw new Error();
        frameVars.push( va[ 1 ] );
    } );
    frameVars.sort();
    return frameVars;
}

function optVarListIsProper( inferredVars, declaredVarsExprObj ) {
    var declaredVars = declaredVarsExprObj.set();
    return declaredVars === null ||
        (declaredVarsExprObj.isProvidedProperlyForSet( strMap() ) &&
            !inferredVars.any( function ( truth, va ) {
                return va[ 0 ] === "va:va" && !declaredVars.has( va );
            } ));
}

var defaults = {
    hasProperScope: function ( args ) {
        var proper = true;
        args.self.visit( idWriter( function ( part, inheritedAttrs ) {
            proper = proper && part.hasProperScope();
            return part.expr;
        } ) );
        return proper;
    },
    desugarSave: function ( args, isFinal ) {
        return args.self.visit( desugarSaveWriter( isFinal ) );
    },
    desugarVarLists: function ( args ) {
        return args.self.visit(
            idWriter( function ( part, inheritedAttrs ) {
            
            return part.desugarVarLists();
        } ) );
    },
    desugarFnAndCase: function ( args ) {
        return args.self.visit(
            idWriter( function ( part, inheritedAttrs ) {
            
            return part.desugarFnAndCase();
        } ) );
    },
    desugarDef: function ( args ) {
        return args.self.visit( desugarDefWriter() );
    }
};

addStringSyntax( "va" );
addStringSyntax( "frameName" );
addSyntax( "def", "def", "frameName optVarList caseList", {
    // INTERESTING
    
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "def",
            args.frameName.expr,
            args.optVarList.expr,
            writer.consume( args.caseList, {
                shadow: null,
                finalPolicy: "doesNotMatter"
            } ) ) );
    },
    hasProperScope: function ( args ) {
        return optVarListIsProper( getFreeVars( args.caseList ),
                args.optVarList ) &&
            args.caseList.hasProperScope();
    },
    desugarSave: defaults.desugarSave,
    desugarVarLists: function ( args ) {
        var innerFreeVars = getFreeVars( args.caseList );
        return jsList( "def",
            args.frameName.expr,
            args.optVarList.or( innerFreeVars ),
            args.caseList.desugarVarLists() );
    },
    desugarFnAndCase: defaults.desugarFnAndCase,
    desugarDefIncludingSelf: function ( args ) {
        var desugared = args.caseList.desugarDef();
        return desugared.defs.concat( [ jsList( "def",
            args.frameName.expr,
            args.optVarList.expr,
            desugared.expr
        ) ] );
    },
    compileToNaiveJs: function ( args, options ) {
        var nextGensymI = 0;
        function gensym() {
            return "v" + nextGensymI++;
        }
        
        var frameVars = makeFrameVars( args.optVarList.set() );
        var frameTag =
            JSON.stringify( [ args.frameName.expr, frameVars ] );
        
        var locals = strMap();
        var varStatements = "";
        arrEach( frameVars, function ( va, i ) {
            var gs = gensym();
            varStatements =
                "var " + gs + " = frameVars[ " + i + " ];\n" +
                varStatements;
            locals.set( va, gs );
        } );
        
        return (
            "defs[ " + jsStr( frameTag ) + " ] = " +
                "function ( frameVars, matchSubject ) {\n" +
            "\n" +
            varStatements +
            args.caseList.compileToNaiveJs(
                objPlus( options, { gensym: gensym } ), locals ) +
            "\n" +
            "};"
        );
    }
} );
addSyntax( "let-case", "caseList", "va caseList", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "let-case",
            args.va.expr,
            writer.consume( args.caseList, {
                shadow:
                    jsnMap().plusTruth( [ "va:va", args.va.expr ] ),
                finalPolicy: "doesNotMatter"
            } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    desugarSave: defaults.desugarSave,
    desugarVarLists: defaults.desugarVarLists,
    desugarFnAndCase: defaults.desugarFnAndCase,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        var innerLocals =
            locals.plusEntry( args.va.expr, "matchSubject" );
        return (
            args.caseList.compileToNaiveJs( options, innerLocals )
        );
    }
} );
addSyntax( "match", "caseList",
    "frameName envPattern getExpr caseList", {
    // INTERESTING
    
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "match",
            args.frameName.expr,
            args.envPattern.expr,
            writer.consume( args.getExpr, {
                shadow: args.envPattern.valsToKeys(),
                finalPolicy: "root"
            } ),
            writer.consume( args.caseList, {
                shadow: jsnMap(),
                finalPolicy: "doesNotMatter"
            } ) ) );
    },
    hasProperScope: function ( args ) {
        return args.envPattern.isProperForSets(
                strMap(), strMap() ) &&
            args.getExpr.hasProperScope() &&
            args.caseList.hasProperScope();
    },
    desugarSave: defaults.desugarSave,
    desugarVarLists: defaults.desugarVarLists,
    desugarFnAndCase: defaults.desugarFnAndCase,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        var entries = args.envPattern.keysToVals();
        var frameVars = makeFrameVars( entries );
        var frameTag =
            JSON.stringify( [ args.frameName.expr, frameVars ] );
        
        var varStatements = "";
        var thenLocals = strMap().plus( locals );
        arrEach( frameVars, function ( va, i ) {
            var gs = options.gensym();
            varStatements +=
                "var " + gs + " = " +
                    "matchSubject.frameVars[ " + i + " ];\n";
            var local = entries.get( [ "va:va", va ] );
            if ( local[ 0 ] !== "va:va" )
                throw new Error();
            thenLocals.set( local[ 1 ], gs );
        } );
        
        return (
            "if ( matchSubject.frameTag === " +
                jsStr( frameTag ) + " ) {\n" +
            "\n" +
            varStatements +
            "return " +
                args.getExpr.compileToNaiveJs( options, thenLocals ) +
                ";\n" +
            "\n" +
            "} else " +
                args.caseList.compileToNaiveJs( options, locals )
        );
    }
} );
addSyntax( "any", "caseList", "getExpr", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "any",
            writer.consume( args.getExpr, {
                shadow: jsnMap(),
                finalPolicy: "root"
            } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    desugarSave: defaults.desugarSave,
    desugarVarLists: defaults.desugarVarLists,
    desugarFnAndCase: defaults.desugarFnAndCase,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        return (
            "return " +
                args.getExpr.compileToNaiveJs( options, locals ) +
                ";\n"
        );
    }
} );
addSyntax( "env-nil", "envExpr", "", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), args.self.expr );
    },
    hasProperScope: defaults.hasProperScope,
    isProperForSet: function ( args, varSet ) {
        return true;
    },
    desugarSave: defaults.desugarSave,
    desugarVarLists: defaults.desugarVarLists,
    desugarFnAndCase: defaults.desugarFnAndCase,
    desugarDef: defaults.desugarDef,
    keys: function ( args ) {
        return jsnMap();
    },
    compileToNaiveJsForFrame: function ( args,
        options, locals, keyToI ) {
        
        return "";
    },
    compileToNaiveJsForLet: function ( args,
        options, locals, pendingLocals, bodyExprObj ) {
        
        return "return " +
            bodyExprObj.compileToNaiveJs(
                options, locals.plus( pendingLocals ) ) +
            ";\n";
    }
} );
addSyntax( "env-cons", "envExpr", "va getExpr envExpr", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "env-cons",
            args.va.expr,
            writer.consume( args.getExpr, {
                shadow: jsnMap(),
                finalPolicy: "notFinal"
            } ),
            writer.consume( args.envExpr, {
                shadow: jsnMap(),
                finalPolicy: "notFinal"
            } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    isProperForSet: function ( args, varSet ) {
        return !varSet.has( args.va.expr ) &&
            args.envExpr.isProperForSet(
                varSet.plusTruth( args.va.expr ) );
    },
    desugarSave: defaults.desugarSave,
    desugarVarLists: defaults.desugarVarLists,
    desugarFnAndCase: defaults.desugarFnAndCase,
    desugarDef: defaults.desugarDef,
    keys: function ( args ) {
        return args.envExpr.keys().
            plusTruth( [ "va:va", args.va.expr ] );
    },
    compileToNaiveJsForFrame: function ( args,
        options, locals, keyToI ) {
        
        if ( !keyToI.has( args.va.expr ) )
            throw new Error();
        return (
            "x.frameVars[ " + keyToI.get( args.va.expr ) + " ] = " +
                args.getExpr.compileToNaiveJs( options, locals ) +
                ";\n" +
            args.envExpr.compileToNaiveJsForFrame(
                options, locals, keyToI )
        );
    },
    compileToNaiveJsForLet: function ( args,
        options, locals, pendingLocals, bodyExprObj ) {
        
        var gs = options.gensym();
        return (
            "var " + gs + " = " +
                args.getExpr.compileToNaiveJs( options, locals ) +
                ";\n" +
            args.envExpr.compileToNaiveJsForLet(
                options,
                locals,
                pendingLocals.plusEntry( args.va.expr, gs ),
                bodyExprObj )
        );
    }
} );
addSyntax( "let-def", "getExpr", "def getExpr", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "let-def",
            writer.consume( args.def, {
                shadow: jsnMap(),
                finalPolicy: "doesNotMatter"
            } ),
            writer.consume( args.getExpr, {
                shadow: jsnMap(),
                finalPolicy: "inherit"
            } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    desugarSave: defaults.desugarSave,
    desugarVarLists: defaults.desugarVarLists,
    desugarFnAndCase: defaults.desugarFnAndCase,
    desugarDef: function ( args ) {
        var desugaredDef = args.def.desugarDefIncludingSelf();
        var desugaredExpr = args.getExpr.desugarDef();
        return {
            defs: desugaredDef.concat( desugaredExpr.defs ),
            expr: desugaredExpr.expr
        };
    },
    compileToNaiveJs: function ( args, options, locals ) {
        throw new Error();
    }
} );
addSyntax( "let", "getExpr", "envExpr getExpr", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "let",
            writer.consume( args.envExpr, {
                shadow: jsnMap(),
                finalPolicy: "notFinal"
            } ),
            writer.consume( args.getExpr, {
                shadow: args.envExpr.keys(),
                finalPolicy: "inherit"
            } ) ) );
    },
    hasProperScope: function ( args ) {
        return args.envExpr.isProperForSet( strMap() ) &&
            args.envExpr.hasProperScope() &&
            args.getExpr.hasProperScope();
    },
    desugarSave: defaults.desugarSave,
    desugarVarLists: defaults.desugarVarLists,
    desugarFnAndCase: defaults.desugarFnAndCase,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        return (
            "(function () {\n" +
            "\n" +
            args.envExpr.compileToNaiveJsForLet(
                options, locals, strMap(), args.getExpr ) +
            "\n" +
            "})()"
        );
    }
} );
addSyntax( "call", "getExpr", "getExpr getExpr", {
    // INTERESTING
    
    visit: function ( args, writer ) {
        return writer.redecorate(
            jsnMap().plusTruth( [ "va:final" ] ),
            jsList( "call",
                writer.consume( args[ 0 ], {
                    shadow: jsnMap(),
                    finalPolicy: "notFinal"
                } ),
                writer.consume( args[ 1 ], {
                    shadow: jsnMap(),
                    finalPolicy: "root"
                } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    desugarSave: defaults.desugarSave,
    desugarVarLists: defaults.desugarVarLists,
    desugarFnAndCase: defaults.desugarFnAndCase,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        var func = args[ 0 ].compileToNaiveJs( options, locals );
        var arg = args[ 1 ].compileToNaiveJs( options, locals );
        return options.savable ?
            "new StcPendingFrame( " + func + ", " + arg + " )" :
            "" + func + ".call( " + arg + " )";
    }
} );
addSyntax( "local", "getExpr", "va", {
    visit: function ( args, writer ) {
        return writer.redecorate(
            jsnMap().plusTruth( [ "va:va", args.va.expr ] ),
            args.self.expr );
    },
    hasProperScope: defaults.hasProperScope,
    desugarSave: defaults.desugarSave,
    desugarVarLists: defaults.desugarVarLists,
    desugarFnAndCase: defaults.desugarFnAndCase,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        if ( !locals.has( args.va.expr ) )
            throw new Error();
        return locals.get( args.va.expr );
    }
} );
addSyntax( "frame", "getExpr", "frameName envExpr", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "frame",
            args.frameName.expr,
            writer.consume( args.envExpr, {
                shadow: jsnMap(),
                finalPolicy: "notFinal"
            } ) ) );
    },
    hasProperScope: function ( args ) {
        return args.envExpr.isProperForSet( strMap() ) &&
            args.envExpr.hasProperScope();
    },
    desugarSave: defaults.desugarSave,
    desugarVarLists: defaults.desugarVarLists,
    desugarFnAndCase: defaults.desugarFnAndCase,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        var frameVars = makeFrameVars( args.envExpr.keys() );
        var frameTag =
            JSON.stringify( [ args.frameName.expr, frameVars ] );
        var keyToI = strMap();
        arrEach( frameVars, function ( va, i ) {
            keyToI.set( va, i );
        } );
        return (
            "(function () {\n" +
            "\n" +
            "var x = new Stc( " + jsStr( frameTag ) + " );\n" +
            "\n" +
            args.envExpr.compileToNaiveJsForFrame(
                options, locals, keyToI ) +
            "\n" +
            "return x;\n" +
            "\n" +
            "})()"
        );
    }
} );
addSyntax( "save", "getExpr", "frameName optVarList va getExpr", {
    // INTERESTING
    
    visit: function ( args, writer ) {
        var vars = args.optVarList.set();
        if ( vars === null )
            vars = jsnMap();
        return writer.redecorate(
            vars.mapKeys( function ( va ) {
                if ( va[ 0 ] !== "va:va" )
                    throw new Error();
                return [ "savedFreeVar", va[ 1 ] ];
            } ).plusTruth( [ "savedInputVar", args.va.expr ] ),
            jsList( "save",
                args.frameName.expr,
                args.optVarList.expr,
                args.va.expr,
                writer.consume( args.getExpr, {
                    shadow: jsnMap(),
                    finalPolicy: "root"
                } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    desugarSave: function ( args, isFinal ) {
        return {
            type: "save",
            frameName: args.frameName,
            optVarList: args.optVarList,
            va: args.va,
            arg: args.getExpr,
            frameBodyExpr: jsList( "local", args.va.expr )
        };
    },
    desugarVarLists: function ( args ) {
        throw new Error();
    },
    desugarFnAndCase: function ( args ) {
        throw new Error();
    },
    desugarDef: function ( args ) {
        throw new Error();
    },
    compileToNaiveJs: function ( args, options, locals ) {
        throw new Error();
    }
} );
addSyntax( "fn", "getExpr", "frameName optVarList caseList", {
    // INTERESTING
    
    visit: function ( args, writer ) {
        var declaredInnerFreeVars = args.optVarList.set();
        
        return writer.redecorate(
            declaredInnerFreeVars === null ?
                jsnMap() : declaredInnerFreeVars,
            jsList( "fn",
                args.frameName.expr,
                args.optVarList.expr,
                writer.consume( args.caseList, {
                    shadow: jsnMap(),
                    finalPolicy: "root"
                } ) ) );
    },
    hasProperScope: function ( args ) {
        return optVarListIsProper( getFreeVars( args.caseList ),
                args.optVarList ) &&
            args.caseList.hasProperScope();
    },
    desugarSave: defaults.desugarSave,
    desugarVarLists: function ( args ) {
        var innerFreeVars = getFreeVars( args.caseList );
        return jsList( "fn",
            args.frameName.expr,
            args.optVarList.or( innerFreeVars ),
            args.caseList.desugarVarLists() );
    },
    desugarFnAndCase: function ( args ) {
        return jsList( "let-def",
            jsList( "def", args.frameName.expr, args.optVarList.expr,
                args.caseList.desugarFnAndCase() ),
            jsList( "frame", args.frameName.expr,
                args.optVarList.capture() ) );
    },
    desugarDef: function ( args ) {
        throw new Error();
    },
    compileToNaiveJs: function ( args, options, locals ) {
        throw new Error();
    }
} );
addSyntax( "case", "getExpr",
    "frameName optVarList getExpr caseList", {
    // INTERESTING
    
    visit: function ( args, writer ) {
        var declaredInnerFreeVars = args.optVarList.set();
        
        return writer.redecorate(
            declaredInnerFreeVars === null ?
                jsnMap() : declaredInnerFreeVars,
            jsList( "case",
                args.frameName.expr,
                args.optVarList.expr,
                writer.consume( args.getExpr, {
                    shadow: jsnMap(),
                    finalPolicy: "root"
                } ),
                writer.consume( args.caseList, {
                    shadow: jsnMap(),
                    finalPolicy: "doesNotMatter"
                } ) ) );
    },
    hasProperScope: function ( args ) {
        return optVarListIsProper( getFreeVars( args.caseList ),
                args.optVarList ) &&
            args.getExpr.hasProperScope() &&
            args.caseList.hasProperScope();
    },
    desugarSave: defaults.desugarSave,
    desugarVarLists: function ( args ) {
        var innerFreeVars = getFreeVars( args.caseList );
        return jsList( "case",
            args.frameName.expr,
            args.optVarList.or( innerFreeVars ),
            args.getExpr.desugarVarLists(),
            args.caseList.desugarVarLists() );
    },
    desugarFnAndCase: function ( args ) {
        return jsList( "let-def",
            jsList( "def", args.frameName.expr, args.optVarList.expr,
                args.caseList.desugarFnAndCase() ),
            jsList( "call",
                jsList( "frame", args.frameName.expr,
                    args.optVarList.capture() ),
                args.getExpr.desugarFnAndCase() ) );
    },
    desugarDef: function ( args ) {
        throw new Error();
    },
    compileToNaiveJs: function ( args, options, locals ) {
        throw new Error();
    }
} );
addSyntax( "var-list-omitted", "optVarList", "", {
    set: function ( args ) {
        return null;
    },
    or: function ( args, varSet ) {
        var varSetExpr = jsList( "var-list-nil" );
        varSet.each( function ( va, truth ) {
            if ( va[ 0 ] !== "va:va" )
                throw new Error();
            varSetExpr =
                jsList( "var-list-cons", va[ 1 ], varSetExpr );
        } );
        return jsList( "var-list", varSetExpr ) ;
    },
    isProvidedProperlyForSet: function ( args, varSet ) {
        return false;
    },
    capture: function ( args ) {
        throw new Error();
    }
} );
addSyntax( "var-list", "optVarList", "varList", {
    set: function ( args ) {
        return args.varList.set();
    },
    or: function ( args, varSet ) {
        return args.self.expr;
    },
    isProvidedProperlyForSet: function ( args, varSet ) {
        return args.varList.isProvidedProperlyForSet( varSet );
    },
    capture: function ( args ) {
        return args.varList.capture();
    }
} );
addSyntax( "var-list-nil", "varList", "", {
    set: function ( args ) {
        return jsnMap();
    },
    isProvidedProperlyForSet: function ( args, varSet ) {
        return true;
    },
    capture: function ( args ) {
        return jsList( "env-nil" );
    }
} );
addSyntax( "var-list-cons", "varList", "va varList", {
    set: function ( args ) {
        return args.varList.set().
            plusTruth( [ "va:va", args.va.expr ] );
    },
    isProvidedProperlyForSet: function ( args, varSet ) {
        return !varSet.has( args.va.expr ) &&
            args.varList.isProvidedProperlyForSet(
                varSet.plusTruth( args.va.expr ) );
    },
    capture: function ( args ) {
        return jsList( "env-cons",
            args.va.expr,
            jsList( "local", args.va.expr ),
            args.varList.capture() );
    }
} );
addSyntax( "env-pattern-nil", "envPattern", "", {
    valsToKeys: function ( args ) {
        return jsnMap();
    },
    keysToVals: function ( args ) {
        return jsnMap();
    },
    isProperForSets: function ( args, keySet, varSet ) {
        return true;
    }
} );
addSyntax( "env-pattern-cons", "envPattern", "va va envPattern", {
    valsToKeys: function ( args ) {
        return args.envPattern.valsToKeys().
            plusEntry( [ "va:va", args[ 1 ].expr ], args[ 0 ].expr );
    },
    keysToVals: function ( args ) {
        return args.envPattern.keysToVals().plusEntry(
            [ "va:va", args[ 0 ].expr ],
            [ "va:va", args[ 1 ].expr ] );
    },
    isProperForSets: function ( args, keySet, varSet ) {
        var k = args[ 0 ].expr;
        var v = args[ 1 ].expr;
        return !keySet.has( k ) && !varSet.has( v ) &&
            args.envPattern.isProperForSets(
                keySet.plusTruth( k ), varSet.plusTruth( v ) );
    }
} );

function desugarDefExpr( expr ) {
    var parsed = parseSyntax( "def", expr );
    if ( !parsed.hasProperScope()
        || getFreeVars( parsed ).has( [ "va:scopeError" ] ) )
        throw new Error();
    var noSavesResult = parsed.desugarSave( !!"isFinal" );
    if ( noSavesResult.type !== "expr" )
        throw new Error();
    var noSaves = parseSyntax( "def", noSavesResult.expr );
    var noVarLists = parseSyntax( "def", noSaves.desugarVarLists() );
    var noFns = parseSyntax( "def", noVarLists.desugarFnAndCase() );
    return noFns.desugarDefIncludingSelf();
}
