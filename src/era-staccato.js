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
// exception is the (tuple ...) Staccato operation, which performs
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
        var rule = rules[ frame.tupleName ];
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
//   // This defines function call behavior for the tuple that has the
//   // specified tuple-name and projection names. It proceeds by
//   // binding each projection to its corresponding variable in the
//   // opt-proj-pattern and then matching the parameter value against
//   // the case-list under that scope.
//   //
//   // If the opt-proj-pattern is omitted, this infers projection
//   // names that correspond to the free variables of the case-list.
//   //
//   (def tuple-name opt-proj-pattern case-list)
//
// case-list ::=
//   // This proceeds as the given case-list while binding the given
//   // variable to the value being matched.
//   //
//   (let-case var case-list)
//
//   // If the value to match is a tuple that has the given tuple name
//   // and the projection names from the proj-pattern, this proceeds
//   // as the get-expr with the pattern's variables in scope.
//   // Otherwise, it proceeds as the case-list.
//   (match tuple-name proj-pattern
//     get-expr
//     case-list)
//
//   // This proceeds as the get-expr.
//   (any get-expr)
//
// let-bindings-expr ::=
//   (let-bindings-nil)
//   (let-bindings-cons var get-expr let-bindings-expr)
//
// proj-expr ::=
//   (proj-nil)
//   (proj-cons proj-name get-expr proj-expr)
//
// get-expr ::=
//   // Sugar.
//   (let-def def get-expr)
//
//   // This executes the let-bindings-expr and proceeds as the
//   // get-expr with those bindings in scope.
//   //
//   // NOTE: This is not a recursive let where a binding is in scope
//   // during its own expression. It's not a sequential let where a
//   // binding is in scope during later bindings. For example, if x
//   // and y are in scope, then
//   // (let (let-bindings-cons x x (let-bindings-nil)) ...) has no
//   // effect, and
//   // (let
//   //   (let-bindings-cons x y
//   //     (let-bindings-cons y x (let-bindings-nil)))
//   //   ...)
//   // has the effect of swapping x and y.
//   //
//   // NOTE: This is the only syntax that allows changing the lexical
//   // scope in between a Staccato operation's case-list branch being
//   // selected and the end of the operation. More concretely, this
//   // is the only syntax that can change the lexical scope in
//   // between a (save ...) and its surrounding (save-root ...) or
//   // (save ...), which can cause a scope error if it would get in
//   // the way of the inner (save ...) desugaring.
//   //
//   (let let-bindings-expr get-expr)
//
//   (local var)
//
//   // This creates an instance of a tuple.
//   (tuple tuple-name proj-expr)
//
//   // Sugar.
//   //
//   // For desugaring purposes, this establishes the current
//   // continuation as a save root. Occurrences of (save ...) inside
//   // will desugar by transforming all the code under this
//   // (save-root ...) up to the location of that (save ...).
//   //
//   (save-root save-root get-expr)
//
//   // Sugar.
//   //
//   // When this desugars, it slices out the subtree at the nearest
//   // (save-root ...) or (save ...) ancestor get-expr with the given
//   // save-root label, and it reinserts a get-expr that does the
//   // following:
//   //
//   // It defines a function with the second given tuple-name and
//   // the given opt-proj-pattern, which executes the extracted
//   // subtree on an argument named by the given variable name.
//   //
//   // It constructs a tuple with the first given tuple-name and the
//   // two given proj-names. The first projection contains a tuple
//   // with the defined function's tuple-name and opt-proj-pattern,
//   // and the contents of that tuple are taken from the current
//   // lexical scope. The second projection contains the result of
//   // the given get-expr.
//   //
//   // That sounds complicated, but usually this means we're building
//   // a tuple whose meaning is a request to call a certain function
//   // (the sliced-out ancestors) with a certain argument (the result
//   // of the given expression). Staccato does not directly have
//   // access to Turing-complete computation, but this syntax lets us
//   // represent requests to perform Turing-complete computation
//   // while letting us structure our code in a full-powered lambda
//   // calculus style.
//   //
//   // It's worth noting that the variables in the opt-proj-pattern
//   // will, after desugaring, refer to the lexical scope at the
//   // *base* of the sliced-out subtree. Nothing is done with them
//   // before desugaring, so they actually have nothing to do with
//   // the lexical scope this (save ...) itself appears in.
//   //
//   // It's an error to access a variable by the given variable name
//   // anywhere under the sliced-out subtree, since those accesses
//   // would be clobbered by the desugaring of this syntax.
//   //
//   // It's also an error to surround this expression with a local
//   // variable binding that would shadow the given variable name,
//   // since that would interfere with the proper desugaring of this
//   // syntax. The only way to cause this error is (let ...).
//   //
//   (save save-root tuple-name
//     proj-name tuple-name opt-proj-pattern
//     proj-name var
//     get-expr)
//
//   // Sugar.
//   //
//   // This behaves like def, defining the function call behavior for
//   // the given tuple-name and projection names.
//   //
//   // Additionally, unlike def, this creates an instance of the
//   // tuple. The contents are taken from the current lexical scope,
//   // using the variable names in the opt-proj-pattern.
//   //
//   (fn tuple-name opt-proj-pattern case-list)
//
// opt-proj-pattern ::=
//   // Sugar.
//   //
//   // When this is desugared, any proj-names needed will be obtained
//   // by looking them <ns>/<projection name string>/name where <ns>
//   // is the given namespace.
//   //
//   (proj-pattern-omitted namespace)
//
//   (proj-pattern proj-pattern)
//
// proj-pattern ::=
//   (proj-pattern-nil)
//   (proj-pattern-cons proj-name var proj-pattern)
//
//
// Here it is again, this time with the notes and sugar removed:
//
// def ::=
//   (def tuple-name opt-proj-pattern case-list)
//
// case-list ::=
//   (let-case var case-list)
//   (match tuple-name proj-pattern get-expr case-list)
//   (any get-expr)
//
// let-bindings-expr ::=
//   (let-bindings-nil)
//   (let-bindings-cons var get-expr proj-expr)
//
// proj-expr ::=
//   (proj-nil)
//   (proj-cons proj-name get-expr proj-expr)
//
// get-expr ::=
//   (let let-bindings-expr get-expr)
//   (local var)
//   (tuple tuple-name proj-expr)
//
// opt-proj-pattern ::=
//   (proj-pattern proj-pattern)
//
// proj-pattern ::=
//   (proj-pattern-nil)
//   (proj-pattern-cons proj-name var proj-pattern)
//
//
//
// ~~ Staccato Turing-complete computation ~~~
//
// The core language semantics doesn't specify a particular way to do
// Turing-complete computation, or even a particular way to call
// functions. Nevertheless, implementations of Staccato are very
// likely to provide a trampoline so those computations can be
// represented. Computations using this trampoline should return one
// of two kinds of value:
//
// // Wrap the given cheaply computed value as a computation. (This
// // meaning of "return" is monadic return, not a nonlocal exit.)
// (tuple return /proj-cons val _ /proj-nil)
//
// // Call `func` with `arg` as the argument.
// (tuple call /proj-cons func _ /proj-cons arg _ /proj-nil)


// NOTE: We implement these methods on every corresponding syntax:
// def/caseList/getExpr/letBindingsExpr/projExpr visit( writer )
// def/caseList/getExpr/letBindingsExpr/projExpr hasProperScope()
// letBindingsExpr/projExpr isProperForSet( varSet )
// def/caseList/getExpr/letBindingsExpr/projExpr desugarSave()
// def/caseList/getExpr/letBindingsExpr/projExpr desugarOmitted()
// def/caseList/getExpr/letBindingsExpr/projExpr desugarFn()
// def desugarDefIncludingSelf()
// caseList/getExpr/letBindingsExpr/projExpr desugarDef()
// def compileToNaiveJs( options )
// caseList/getExpr compileToNaiveJs( options, locals )
// letBindingsExpr/projExpr keys()
// projExpr compileToNaiveJsForTuple( options, locals, keyToI )
// letBindingsExpr compileToNaiveJsForLet( options, locals )
// optProjPattern/projPattern getVarSet()
// optProjPattern or( varSet )
// optProjPattern/projPattern isProvidedProperlyForVarSet( varSet )
// optProjPattern/projPattern capture()
// projPattern keysToVals()
// projPattern isProperForSets( keySet, varSet )

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

function staccatoPretty( expr ) {
    if ( expr === null ) {
        return "()";
    } else if ( isPrimString( expr ) ) {
        return /^[-a-z01-9]*$/i.test( expr ) ? expr :
            JSON.stringify( expr );
    } else if ( likeJsCons( expr ) ) {
        if ( expr.rest === null ) {
            if ( expr.first === null || likeJsCons( expr.first ) ) {
                return "(/" +
                    staccatoPretty( expr.first ).substring( 1 );
            } else {
                return "(" + staccatoPretty( expr.first ) + ")";
            }
        } else if ( likeJsCons( expr.rest ) ) {
            return "(" + staccatoPretty( expr.first ) + " " +
                staccatoPretty( expr.rest ).substring( 1 );
        } else {
            return "(" + staccatoPretty( expr.first ) + " . " +
                staccatoPretty( expr.rest ) + ")";
        }
    } else {
        throw new Error();
    }
}

function readerStringListToString( stringList ) {
    var result = "";
    var rest = stringList;
    for ( ; rest !== null; rest = rest.rest )
        result += rest.first;
    return result;
}

function readerStringNilToString( stringNil ) {
    return readerStringListToString( stringNil.string );
}

function staccatoReaderExprPretty( expr ) {
    if ( expr.type === "nil" ) {
        return "()";
    } else if ( expr.type === "stringNil" ) {
        // TODO: Output this in a syntax that can be read back in.
        var string = readerStringNilToString( expr );
        return /^[-a-z01-9]*$/i.test( string ) ? string :
            JSON.stringify( string );
    } else if ( expr.type === "stringCons" ) {
        // TODO: Output this in a syntax that can be read back in.
        var string = readerStringListToString( expr.string );
        return (/^[-a-z01-9]*$/i.test( string ) ? string :
            JSON.stringify( string )) + "...";
    } else if ( expr.type === "cons" ) {
        if ( expr.rest.type === "nil" ) {
            if ( expr.first.type === "nil"
                || expr.first.type === "cons" ) {
                return "(/" +
                    staccatoReaderExprPretty( expr.first )
                        .substring( 1 );
            } else {
                return "(" + staccatoReaderExprPretty( expr.first ) +
                    ")";
            }
        } else if ( expr.rest.type === "cons" ) {
            return "(" + staccatoReaderExprPretty( expr.first ) +
                " " +
                staccatoReaderExprPretty( expr.rest ).substring( 1 );
        } else {
            throw new Error();
        }
    } else {
        throw new Error();
    }
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
function addNamespaceSyntax( nontermName ) {
    // TODO: Do something more special here.
    addStringSyntax( nontermName );
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
                throw new Error(
                    "This expression has improper scope: " +
                    staccatoPretty( args.self.expr ) );
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
        var shadowed =
            getFreeVars( part ).minus( inheritedAttrs.shadow );
        
        if ( inheritedAttrs.scopePolicy.type === "noFreeVars"
            && shadowed.any( function ( truth, va ) {
                return va[ 0 ] !== "va:scopeError";
            } ) ) {
            
            // TODO: Use this error message: Encountered a use of
            // (def ...) with free variables
            shadowed = jsnMap().plusTruth( [ "va:scopeError" ] );
        }
        
        if ( shadowed.any( function ( truth, va ) {
            return va[ 0 ] === "va:savedInputVar" &&
                inheritedAttrs.shadow.has( [ "va:va", va[ 2 ] ] );
        } ) ) {
            // TODO: Use this error message: Encountered a use of
            // (save ...) where the saved value's variable name was
            // locally bound somewhere between the save root and the
            // saved location
            shadowed.add( [ "va:scopeError" ] );
        }
        
        if ( inheritedAttrs.scopePolicy.type === "saveRoot" ) {
            var label = inheritedAttrs.scopePolicy.label;
            
            if ( shadowed.any( function ( truth, va ) {
                return va[ 0 ] === "va:savedInputVar" &&
                    va[ 1 ] === label &&
                    shadowed.has( [ "va:va", va[ 2 ] ] );
            } ) ) {
                // TODO: Use this error message: Encountered a use of
                // (save ...) where the saved value's variable name
                // was used somewhere under the save root
                shadowed.add( [ "va:scopeError" ] );
            }
            
            shadowed = shadowed.keep( function ( truth, va ) {
                return !(va[ 0 ] === "va:savedInputVar"
                    && va[ 1 ] === label);
            } ).mapKeys( function ( va ) {
                return va[ 0 ] === "va:savedFreeVar" &&
                    va[ 1 ] === label ?
                    [ "va:va", va[ 2 ] ] : va;
            } );
        } else if ( inheritedAttrs.scopePolicy.type === "notRoot" ) {
            // Do nothing.
        } else if (
            inheritedAttrs.scopePolicy.type === "doesNotMatter"
            || inheritedAttrs.scopePolicy.type === "noFreeVars" ) {
            
            if ( shadowed.any( function ( truth, va ) {
                return va[ 0 ] === "va:savedInputVar" ||
                    va[ 0 ] === "va:savedFreeVar";
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

function desugarSaveWriter() {
    // INTERESTING
    
    // NOTE: The `state` variable is mutated a maximum of one time.
    var state = { type: "exprState" };
    
    var writer = {};
    writer.consume = function ( part, inheritedAttrs ) {
        // NOTE: We only desugar `part` some of the time!
        if ( state.type === "exprState" ) {
            var desugared = part.desugarSave();
            if ( desugared.type === "expr" ) {
                return desugared.expr;
            } else if ( desugared.type === "save" ) {
                state = {
                    type: "saveState",
                    saveRoot: desugared.saveRoot,
                    callTupleName: desugared.callTupleName,
                    callFunc: desugared.callFunc,
                    tupleName: desugared.tupleName,
                    optProjPattern: desugared.optProjPattern,
                    callArg: desugared.callArg,
                    va: desugared.va,
                    arg: desugared.arg
                };
                return desugared.tupleBodyExpr;
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
                saveRoot: state.saveRoot,
                callTupleName: state.callTupleName,
                callFunc: state.callFunc,
                tupleName: state.tupleName,
                optProjPattern: state.optProjPattern,
                callArg: state.callArg,
                va: state.va,
                arg: state.arg,
                tupleBodyExpr: whole
            };
        } else {
            throw new Error();
        }
    };
    return writer;
}

function makeProjNames( varSet ) {
    var projNames = [];
    varSet.each( function ( va, truth ) {
        if ( va[ 0 ] !== "va:va" )
            throw new Error();
        projNames.push( va[ 1 ] );
    } );
    projNames.sort();
    return projNames;
}

function optProjPatternIsProper(
    inferredVars, declaredPatternExprObj ) {
    
    var declaredVars = declaredPatternExprObj.getVarSet();
    return declaredVars === null ||
        (declaredPatternExprObj.isProvidedProperlyForVarSet(
            strMap() )
            && !inferredVars.any( function ( truth, va ) {
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
    desugarSave: function ( args ) {
        return args.self.visit( desugarSaveWriter() );
    },
    desugarOmitted: function ( args ) {
        return args.self.visit(
            idWriter( function ( part, inheritedAttrs ) {
            
            return part.desugarOmitted();
        } ) );
    },
    desugarFn: function ( args ) {
        return args.self.visit(
            idWriter( function ( part, inheritedAttrs ) {
            
            return part.desugarFn();
        } ) );
    },
    desugarDef: function ( args ) {
        return args.self.visit( desugarDefWriter() );
    }
};

addStringSyntax( "va" );
addStringSyntax( "saveRoot" );
addNamespaceSyntax( "tupleName" );
addNamespaceSyntax( "projName" );
addNamespaceSyntax( "namespace" );
addSyntax( "def", "def", "tupleName optProjPattern caseList", {
    // INTERESTING
    
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "def",
            args.tupleName.expr,
            args.optProjPattern.expr,
            writer.consume( args.caseList, {
                shadow: args.optProjPattern.getVarSet() || jsnMap(),
                scopePolicy: { type: "noFreeVars" }
            } ) ) );
    },
    hasProperScope: function ( args ) {
        return optProjPatternIsProper( getFreeVars( args.caseList ),
                args.optProjPattern ) &&
            args.caseList.hasProperScope();
    },
    desugarSave: defaults.desugarSave,
    desugarOmitted: function ( args ) {
        var innerFreeVars = getFreeVars( args.caseList );
        return jsList( "def",
            args.tupleName.expr,
            args.optProjPattern.or( innerFreeVars ),
            args.caseList.desugarOmitted() );
    },
    desugarFn: defaults.desugarFn,
    desugarDefIncludingSelf: function ( args ) {
        var desugared = args.caseList.desugarDef();
        return desugared.defs.concat( [ jsList( "def",
            args.tupleName.expr,
            args.optProjPattern.expr,
            desugared.expr
        ) ] );
    },
    compileToNaiveJs: function ( args, options ) {
        var nextGensymI = 0;
        function gensym() {
            return "v" + nextGensymI++;
        }
        
        var projNames =
            makeProjNames( args.optProjPattern.getVarSet() );
        var tupleTag =
            JSON.stringify( [ args.tupleName.expr, projNames ] );
        
        var locals = strMap();
        var varStatements = "";
        arrEach( projNames, function ( va, i ) {
            var gs = gensym();
            varStatements =
                "var " + gs + " = projNames[ " + i + " ];\n" +
                varStatements;
            locals.set( va, gs );
        } );
        
        return (
            "defs[ " + jsStr( tupleTag ) + " ] = " +
                "function ( projNames, matchSubject ) {\n" +
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
                scopePolicy: { type: "doesNotMatter" }
            } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    desugarSave: defaults.desugarSave,
    desugarOmitted: defaults.desugarOmitted,
    desugarFn: defaults.desugarFn,
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
    "tupleName projPattern getExpr caseList", {
    // INTERESTING
    
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "match",
            args.tupleName.expr,
            args.projPattern.expr,
            writer.consume( args.getExpr, {
                shadow: args.projPattern.getVarSet(),
                scopePolicy: { type: "notRoot" }
            } ),
            writer.consume( args.caseList, {
                shadow: jsnMap(),
                scopePolicy: { type: "notRoot" }
            } ) ) );
    },
    hasProperScope: function ( args ) {
        return args.projPattern.isProperForSets(
                strMap(), strMap() ) &&
            args.getExpr.hasProperScope() &&
            args.caseList.hasProperScope();
    },
    desugarSave: defaults.desugarSave,
    desugarOmitted: defaults.desugarOmitted,
    desugarFn: defaults.desugarFn,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        var entries = args.projPattern.keysToVals();
        var projNames = makeProjNames( entries );
        var tupleTag =
            JSON.stringify( [ args.tupleName.expr, projNames ] );
        
        var varStatements = "";
        var thenLocals = strMap().plus( locals );
        arrEach( projNames, function ( va, i ) {
            var gs = options.gensym();
            varStatements +=
                "var " + gs + " = " +
                    "matchSubject.projNames[ " + i + " ];\n";
            var local = entries.get( [ "va:va", va ] );
            if ( local[ 0 ] !== "va:va" )
                throw new Error();
            thenLocals.set( local[ 1 ], gs );
        } );
        
        return (
            "if ( matchSubject.tupleTag === " +
                jsStr( tupleTag ) + " ) {\n" +
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
                scopePolicy: { type: "notRoot" }
            } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    desugarSave: defaults.desugarSave,
    desugarOmitted: defaults.desugarOmitted,
    desugarFn: defaults.desugarFn,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        return (
            "return " +
                args.getExpr.compileToNaiveJs( options, locals ) +
                ";\n"
        );
    }
} );
addSyntax( "let-bindings-nil", "letBindingsExpr", "", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), args.self.expr );
    },
    hasProperScope: defaults.hasProperScope,
    isProperForSet: function ( args, varSet ) {
        return true;
    },
    desugarSave: defaults.desugarSave,
    desugarOmitted: defaults.desugarOmitted,
    desugarFn: defaults.desugarFn,
    desugarDef: defaults.desugarDef,
    keys: function ( args ) {
        return jsnMap();
    },
    compileToNaiveJsForTuple: function ( args,
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
addSyntax( "let-bindings-cons", "letBindingsExpr",
    "va getExpr letBindingsExpr", {
    
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(),
            jsList( "let-bindings-cons",
                args.va.expr,
                writer.consume( args.getExpr, {
                    shadow: jsnMap(),
                    scopePolicy: { type: "notRoot" }
                } ),
                writer.consume( args.letBindingsExpr, {
                    shadow: jsnMap(),
                    scopePolicy: { type: "notRoot" }
                } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    isProperForSet: function ( args, varSet ) {
        return !varSet.has( args.va.expr ) &&
            args.letBindingsExpr.isProperForSet(
                varSet.plusTruth( args.va.expr ) );
    },
    desugarSave: defaults.desugarSave,
    desugarOmitted: defaults.desugarOmitted,
    desugarFn: defaults.desugarFn,
    desugarDef: defaults.desugarDef,
    keys: function ( args ) {
        return args.letBindingsExpr.keys().
            plusTruth( [ "va:va", args.va.expr ] );
    },
    compileToNaiveJsForLet: function ( args,
        options, locals, pendingLocals, bodyExprObj ) {
        
        var gs = options.gensym();
        return (
            "var " + gs + " = " +
                args.getExpr.compileToNaiveJs( options, locals ) +
                ";\n" +
            args.letBindingsExpr.compileToNaiveJsForLet(
                options,
                locals,
                pendingLocals.plusEntry( args.va.expr, gs ),
                bodyExprObj )
        );
    }
} );
addSyntax( "proj-nil", "projExpr", "", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), args.self.expr );
    },
    hasProperScope: defaults.hasProperScope,
    isProperForSet: function ( args, varSet ) {
        return true;
    },
    desugarSave: defaults.desugarSave,
    desugarOmitted: defaults.desugarOmitted,
    desugarFn: defaults.desugarFn,
    desugarDef: defaults.desugarDef,
    keys: function ( args ) {
        return jsnMap();
    },
    compileToNaiveJsForTuple: function ( args,
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
addSyntax( "proj-cons", "projExpr", "projName getExpr projExpr", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "proj-cons",
            args.projName.expr,
            writer.consume( args.getExpr, {
                shadow: jsnMap(),
                scopePolicy: { type: "notRoot" }
            } ),
            writer.consume( args.projExpr, {
                shadow: jsnMap(),
                scopePolicy: { type: "notRoot" }
            } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    isProperForSet: function ( args, varSet ) {
        return !varSet.has( args.projName.expr ) &&
            args.projExpr.isProperForSet(
                varSet.plusTruth( args.projName.expr ) );
    },
    desugarSave: defaults.desugarSave,
    desugarOmitted: defaults.desugarOmitted,
    desugarFn: defaults.desugarFn,
    desugarDef: defaults.desugarDef,
    keys: function ( args ) {
        return args.projExpr.keys().
            plusTruth( [ "va:va", args.projName.expr ] );
    },
    compileToNaiveJsForTuple: function ( args,
        options, locals, keyToI ) {
        
        if ( !keyToI.has( args.projName.expr ) )
            throw new Error();
        return (
            "x.projNames[ " +
                keyToI.get( args.projName.expr ) + " ] = " +
                args.getExpr.compileToNaiveJs( options, locals ) +
                ";\n" +
            args.projExpr.compileToNaiveJsForTuple(
                options, locals, keyToI )
        );
    }
} );
addSyntax( "let-def", "getExpr", "def getExpr", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "let-def",
            writer.consume( args.def, {
                shadow: jsnMap(),
                scopePolicy: { type: "doesNotMatter" }
            } ),
            writer.consume( args.getExpr, {
                shadow: jsnMap(),
                scopePolicy: { type: "notRoot" }
            } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    desugarSave: defaults.desugarSave,
    desugarOmitted: defaults.desugarOmitted,
    desugarFn: defaults.desugarFn,
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
addSyntax( "let", "getExpr", "letBindingsExpr getExpr", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "let",
            writer.consume( args.letBindingsExpr, {
                shadow: jsnMap(),
                scopePolicy: { type: "notRoot" }
            } ),
            writer.consume( args.getExpr, {
                shadow: args.letBindingsExpr.keys(),
                scopePolicy: { type: "notRoot" }
            } ) ) );
    },
    hasProperScope: function ( args ) {
        return args.letBindingsExpr.isProperForSet( strMap() ) &&
            args.letBindingsExpr.hasProperScope() &&
            args.getExpr.hasProperScope();
    },
    desugarSave: defaults.desugarSave,
    desugarOmitted: defaults.desugarOmitted,
    desugarFn: defaults.desugarFn,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        return (
            "(function () {\n" +
            "\n" +
            args.letBindingsExpr.compileToNaiveJsForLet(
                options, locals, strMap(), args.getExpr ) +
            "\n" +
            "})()"
        );
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
    desugarOmitted: defaults.desugarOmitted,
    desugarFn: defaults.desugarFn,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        if ( !locals.has( args.va.expr ) )
            throw new Error();
        return locals.get( args.va.expr );
    }
} );
addSyntax( "tuple", "getExpr", "tupleName projExpr", {
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(), jsList( "tuple",
            args.tupleName.expr,
            writer.consume( args.projExpr, {
                shadow: jsnMap(),
                scopePolicy: { type: "notRoot" }
            } ) ) );
    },
    hasProperScope: function ( args ) {
        return args.projExpr.isProperForSet( strMap() ) &&
            args.projExpr.hasProperScope();
    },
    desugarSave: defaults.desugarSave,
    desugarOmitted: defaults.desugarOmitted,
    desugarFn: defaults.desugarFn,
    desugarDef: defaults.desugarDef,
    compileToNaiveJs: function ( args, options, locals ) {
        var projNames = makeProjNames( args.projExpr.keys() );
        var tupleTag =
            JSON.stringify( [ args.tupleName.expr, projNames ] );
        var keyToI = strMap();
        arrEach( projNames, function ( va, i ) {
            keyToI.set( va, i );
        } );
        return (
            "(function () {\n" +
            "\n" +
            "var x = new Stc( " + jsStr( tupleTag ) + " );\n" +
            "\n" +
            args.projExpr.compileToNaiveJsForTuple(
                options, locals, keyToI ) +
            "\n" +
            "return x;\n" +
            "\n" +
            "})()"
        );
    }
} );
addSyntax( "save-root", "getExpr", "saveRoot getExpr", {
    // INTERESTING
    
    visit: function ( args, writer ) {
        return writer.redecorate( jsnMap(),
            jsList( "save-root",
                args.saveRoot.expr,
                writer.consume( args.getExpr, {
                    shadow: jsnMap(),
                    scopePolicy: { type: "saveRoot",
                        label: args.saveRoot.expr }
                } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    desugarSave: function ( args ) {
        var exprObj = args.getExpr;
        while ( true ) {
            var desugared = exprObj.desugarSave();
            if ( desugared.type === "expr" ) {
                return desugared;
            } else if ( desugared.type === "save" ) {
                if ( desugared.saveRoot.expr !== args.saveRoot.expr )
                    return desugared;
                exprObj = parseSyntax( "getExpr",
                    jsList( "save-root", args.saveRoot.expr,
                        jsList( "tuple", desugared.callTupleName.expr,
                            jsList( "proj-cons",
                                desugared.callFunc.expr,
                                jsList( "fn",
                                    desugared.tupleName.expr,
                                    desugared.optProjPattern.expr,
                                    jsList( "let-case", desugared.va.expr,
                                        jsList( "any", desugared.tupleBodyExpr ) ) ),
                                jsList( "proj-cons",
                                    desugared.callArg.expr,
                                    desugared.arg.expr,
                                    jsList( "proj-nil" ) ) ) ) ) );
            } else {
                throw new Error();
            }
        }
    },
    desugarOmitted: function ( args ) {
        throw new Error();
    },
    desugarFn: function ( args ) {
        throw new Error();
    },
    desugarDef: function ( args ) {
        throw new Error();
    },
    compileToNaiveJs: function ( args, options, locals ) {
        throw new Error();
    }
} );
addSyntax( "save", "getExpr",
    "saveRoot tupleName " +
    "projName tupleName optProjPattern " +
    "projName va " +
    "getExpr", {
    // INTERESTING
    
    visit: function ( args, writer ) {
        var vars = args.optProjPattern.getVarSet();
        if ( vars === null )
            vars = jsnMap();
        return writer.redecorate(
            vars.mapKeys( function ( va ) {
                if ( va[ 0 ] !== "va:va" )
                    throw new Error();
                return [ "va:savedFreeVar", args.saveRoot.expr,
                    va[ 1 ] ];
            } ).plusTruth(
                [ "va:savedInputVar", args.saveRoot.expr,
                    args.va.expr ] ),
            jsList( "save",
                args.saveRoot.expr,
                args[ 1 ].expr,
                args[ 2 ].expr,
                args[ 3 ].expr,
                args.optProjPattern.expr,
                args[ 5 ].expr,
                args.va.expr,
                writer.consume( args.getExpr, {
                    shadow: jsnMap(),
                    scopePolicy: { type: "saveRoot",
                        label: args.saveRoot.expr }
                } ) ) );
    },
    hasProperScope: defaults.hasProperScope,
    desugarSave: function ( args ) {
        return {
            type: "save",
            saveRoot: args.saveRoot,
            callTupleName: args[ 1 ],
            callFunc: args[ 2 ],
            tupleName: args[ 3 ],
            optProjPattern: args.optProjPattern,
            callArg: args[ 5 ],
            va: args.va,
            arg: args.getExpr,
            tupleBodyExpr: jsList( "local", args.va.expr )
        };
    },
    desugarOmitted: function ( args ) {
        throw new Error();
    },
    desugarFn: function ( args ) {
        throw new Error();
    },
    desugarDef: function ( args ) {
        throw new Error();
    },
    compileToNaiveJs: function ( args, options, locals ) {
        throw new Error();
    }
} );
addSyntax( "fn", "getExpr", "tupleName optProjPattern caseList", {
    // INTERESTING
    
    visit: function ( args, writer ) {
        var declaredInnerFreeVars = args.optProjPattern.getVarSet();
        
        return writer.redecorate(
            declaredInnerFreeVars === null ?
                jsnMap() : declaredInnerFreeVars,
            jsList( "fn",
                args.tupleName.expr,
                args.optProjPattern.expr,
                writer.consume( args.caseList, {
                    shadow: jsnMap(),
                    scopePolicy: { type: "notRoot" }
                } ) ) );
    },
    hasProperScope: function ( args ) {
        return optProjPatternIsProper( getFreeVars( args.caseList ),
                args.optProjPattern ) &&
            args.caseList.hasProperScope();
    },
    desugarSave: defaults.desugarSave,
    desugarOmitted: function ( args ) {
        var innerFreeVars = getFreeVars( args.caseList );
        return jsList( "fn",
            args.tupleName.expr,
            args.optProjPattern.or( innerFreeVars ),
            args.caseList.desugarOmitted() );
    },
    desugarFn: function ( args ) {
        return jsList( "let-def",
            jsList( "def", args.tupleName.expr,
                args.optProjPattern.expr,
                args.caseList.desugarFn() ),
            jsList( "tuple", args.tupleName.expr,
                args.optProjPattern.capture() ) );
    },
    desugarDef: function ( args ) {
        throw new Error();
    },
    compileToNaiveJs: function ( args, options, locals ) {
        throw new Error();
    }
} );
addSyntax( "proj-pattern-omitted", "optProjPattern", "namespace", {
    getVarSet: function ( args ) {
        return null;
    },
    or: function ( args, varSet ) {
        var varSetExpr = jsList( "proj-pattern-nil" );
        varSet.each( function ( va, truth ) {
            if ( va[ 0 ] !== "va:va" )
                throw new Error();
            // TODO: Use args.namespace to derive the projection name,
            // rather than just using va[ 1 ] directly.
            varSetExpr = jsList( "proj-pattern-cons",
                va[ 1 ], va[ 1 ], varSetExpr );
        } );
        return jsList( "proj-pattern", varSetExpr );
    },
    isProvidedProperlyForVarSet: function ( args, varSet ) {
        return false;
    },
    capture: function ( args ) {
        throw new Error();
    }
} );
addSyntax( "proj-pattern", "optProjPattern", "projPattern", {
    getVarSet: function ( args ) {
        return args.projPattern.getVarSet();
    },
    or: function ( args, varSet ) {
        return args.self.expr;
    },
    isProvidedProperlyForVarSet: function ( args, varSet ) {
        return args.projPattern.isProperForSets( strMap(), varSet );
    },
    capture: function ( args ) {
        return args.projPattern.capture();
    }
} );
addSyntax( "proj-pattern-nil", "projPattern", "", {
    getVarSet: function ( args ) {
        return jsnMap();
    },
    capture: function ( args ) {
        return jsList( "proj-nil" );
    },
    keysToVals: function ( args ) {
        return jsnMap();
    },
    isProperForSets: function ( args, keySet, varSet ) {
        return true;
    }
} );
addSyntax( "proj-pattern-cons", "projPattern",
    "projName va projPattern", {
    
    getVarSet: function ( args ) {
        return args.projPattern.getVarSet().
            plusTruth( [ "va:va", args.va.expr ] );
    },
    capture: function ( args ) {
        return jsList( "proj-cons",
            args.projName.expr,
            jsList( "local", args.va.expr ),
            args.projPattern.capture() );
    },
    keysToVals: function ( args ) {
        return args.projPattern.keysToVals().plusEntry(
            [ "va:va", args.projName.expr ],
            [ "va:va", args.va.expr ] );
    },
    isProperForSets: function ( args, keySet, varSet ) {
        var k = args.projName.expr;
        var v = args.va.expr;
        return !keySet.has( k ) && !varSet.has( v ) &&
            args.projPattern.isProperForSets(
                keySet.plusTruth( k ), varSet.plusTruth( v ) );
    }
} );

function desugarDefExpr( expr ) {
    var parsed = parseSyntax( "def", expr );
    if ( !parsed.hasProperScope()
        || getFreeVars( parsed ).has( [ "va:scopeError" ] ) )
        throw new Error();
    var noSavesResult = parsed.desugarSave();
    if ( noSavesResult.type !== "expr" )
        throw new Error();
    var noSaves = parseSyntax( "def", noSavesResult.expr );
    var noOmitted = parseSyntax( "def", noSaves.desugarOmitted() );
    var noFns = parseSyntax( "def", noOmitted.desugarFn() );
    return noFns.desugarDefIncludingSelf();
}
