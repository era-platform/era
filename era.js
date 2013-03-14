// era.js
// Copyright 2013 Ross Angle. Released under the MIT License.


// ===== Miscellaneous ===============================================

// TODO: Decide whether to introduce a dependency on Lathe.js just for
// these utilities.
function defer( body ) {
    setTimeout( function () {
        body();
    }, 0 );
}
// NOTE: This body takes its args as ( v, k ).
function arrMap( arr, func ) {
    var result = [];
    for ( var i = 0, n = arr.length; i < n; i++ )
        result.push( func( arr[ i ], i ) );
    return result;
}
function hasOwn( obj, k ) {
    return {}.hasOwnProperty.call( obj, k );
}
// NOTE: This body takes its args as ( v, k ).
function objOwnAny( obj, body ) {
    for ( var k in obj )
        if ( hasOwn( obj, k ) ) {
            var result = body( obj[ k ], k );
            if ( result )
                return result;
        }
    return false;
}
// NOTE: This body takes its args as ( k, v ).
function objOwnEach( obj, body ) {
    objOwnAny( obj, function ( v, k ) {
        body( k, v );
        return false;
    } );
}
function objPlus( var_args ) {
    var result = {};
    for ( var i = 0, n = arguments.length; i < n; i++ )
        objOwnEach( arguments[ i ], function ( k, v ) {
            result[ k ] = v;
        } );
    return result;
}
function isArray( x ) {
    return {}.toString.call( x ) === "[object Array]";
}
function isPrimString( x ) {
    return typeof x === "string";
}
if ( Object.getPrototypeOf )
    var likeObjectLiteral = function ( x ) {
        if ( x === null ||
            {}.toString.call( x ) !== "[object Object]" )
            return false;
        var p = Object.getPrototypeOf( x );
        return p !== null && typeof p === "object" &&
            Object.getPrototypeOf( p ) === null;
    };
else if ( {}.__proto__ !== void 0 )
    var likeObjectLiteral = function ( x ) {
        if ( x === null ||
            {}.toString.call( x ) !== "[object Object]" )
            return false;
        var p = x.__proto__;
        return p !== null && typeof p === "object" &&
            p.__proto__ === null;
    };
else
    var likeObjectLiteral = function ( x ) {
        return x !== null &&
            {}.toString.call( x ) === "[object Object]" &&
            x.constructor === {}.constructor;
    };
function sameTwo( a, b ) {
    return (a === 0 && b === 0) ? 1 / a === 1 / b :  // 0 and -0
        a !== a ? b !== b :  // NaN
        a === b;
}

// TODO: Come up with something better than this.
var naiveIsoCases = [];
function naiveIso( a, b ) {
    for ( var i = 0, n = naiveIsoCases.length; i < n; i++ ) {
        var result = naiveIsoCases[ i ]( naiveIso, a, b );
        if ( result !== null )
            return result;
    }
    return null;
}
naiveIsoCases.push( function ( recur, a, b ) {
    return sameTwo( a, b ) ? true : null;
} );
naiveIsoCases.push( function ( recur, a, b ) {
    return (isPrimString( a ) || isPrimString( b )) ? a === b : null;
} );
naiveIsoCases.push( function ( recur, a, b ) {
    if ( !(isArray( a ) && isArray( b )) )
        return (isArray( a ) || isArray( b )) ? false : null;
    var n = a.length;
    if ( n !== b.length )
        return false;
    for ( var i = 0; i < n; i++ ) {
        var subresult = recur( a[ i ], b[ i ] );
        if ( subresult !== true )
            return subresult;
    }
    return true;
} );
naiveIsoCases.push( function ( recur, a, b ) {
    if ( !(likeObjectLiteral( a ) && likeObjectLiteral( b )) )
        return (likeObjectLiteral( a ) || likeObjectLiteral( b )) ?
            false : null;
    if ( objOwnAny( a, function ( v, k ) {
        return !hasOwn( b, k );
    } ) || objOwnAny( b, function ( v, k ) {
        return !hasOwn( a, k );
    } ) )
        return false;
    var result = objOwnAny( a, function ( v, k ) {
        var subresult = recur( v, b[ k ] );
        if ( subresult !== true )
            return { val: subresult };
    } );
    return result ? result.val : true;
} );

function StrMap() {}
StrMap.prototype.init_ = function () {
    this.contents_ = {};
    return this;
};
function strMap() {
    return new StrMap().init_();
}
StrMap.prototype.mangle_ = function ( k ) {
    return "|" + k;
};
StrMap.prototype.unmangle_ = function ( k ) {
    return k.substring( 1 );
};
StrMap.prototype.has = function ( k ) {
    return {}.hasOwnProperty.call(
        this.contents_, this.mangle_( k ) );
};
StrMap.prototype.get = function ( k ) {
    return this.contents_[ this.mangle_( k ) ];
};
StrMap.prototype.del = function ( k ) {
    delete this.contents_[ this.mangle_( k ) ];
    return this;
};
StrMap.prototype.set = function ( k, v ) {
    this.contents_[ this.mangle_( k ) ] = v;
    return this;
};
StrMap.prototype.setObj = function ( obj ) {
    var self = this;
    objOwnEach( obj, function ( k, v ) {
        self.set( k, v );
    } );
    return this;
};
StrMap.prototype.setAll = function ( other ) {
    if ( !(other instanceof StrMap) )
        throw new Error();
    var self = this;
    other.each( function ( k, v ) {
        self.set( k, v );
    } );
    return this;
};
StrMap.prototype.copy = function () {
    return strMap().setAll( this );
};
StrMap.prototype.add = function ( k ) {
    return this.set( k, true );
};
StrMap.prototype.plusEntry = function ( k, v ) {
    return this.copy().set( k, v );
};
StrMap.prototype.plus = function ( other ) {
    return this.copy().setAll( other );
};
// TODO: Find a better name for this.
StrMap.prototype.plusTruth = function ( k ) {
    return this.copy().add( k );
};
// TODO: Find a better name for this.
StrMap.prototype.plusArrTruth = function ( arr ) {
    var result = this.copy();
    for ( var i = 0, n = arr.length; i < n; i++ )
        result.add( arr[ i ] );
    return result;
};
StrMap.prototype.minusEntry = function ( k ) {
    return this.copy().del( k );
};
// NOTE: This body takes its args as ( v, k ).
StrMap.prototype.any = function ( body ) {
    var self = this;
    return objOwnAny( this.contents_, function ( v, k ) {
        return body( v, self.unmangle_( k ) );
    } );
};
// NOTE: This body takes its args as ( k, v ).
StrMap.prototype.each = function ( body ) {
    this.any( function ( v, k ) {
        body( k, v );
        return false;
    } );
};
// NOTE: This body takes its args as ( v, k ).
StrMap.prototype.map = function ( func ) {
    var result = strMap();
    this.each( function ( k, v ) {
        result.set( k, func( v, k ) );
    } );
    return result;
};

naiveIsoCases.push( function ( recur, a, b ) {
    if ( !((a instanceof StrMap) && (b instanceof StrMap)) )
        return ((a instanceof StrMap) || (b instanceof StrMap)) ?
            false : null;
    if ( a.any( function ( v, k ) {
        return !b.has( k );
    } ) || b.any( function ( v, k ) {
        return !a.has( k );
    } ) )
        return false;
    var result = a.any( function ( v, k ) {
        var subresult = recur( v, b.get( k ) );
        if ( subresult !== true )
            return { val: subresult };
    } );
    return result ? result.val : true;
} );

function logJson( x ) {
    console.log( JSON.stringify( x ) );
    return x;
}

var unitTests = [];
function addNaiveIsoUnitTest( body ) {
    // TODO: Stop using JSON.stringify() here. It might be good to
    // have a naiveStringify() function or something for custom
    // stringification.
    unitTests.push( function ( then ) {
        body( function ( calculated, expected ) {
            if ( naiveIso( calculated, expected ) )
                then( null );
            else
                then(
                    "Expected this:\n" +
                    JSON.stringify( expected ) + "\n" +
                    "But got this:\n" +
                    JSON.stringify( calculated ) );
        } );
    } );
}
function addPredicateUnitTest( body ) {
    // TODO: Stop using JSON.stringify() here. It might be good to
    // have a naiveStringify() function or something for custom
    // stringification.
    unitTests.push( function ( then ) {
        body( function ( calculated, predicate ) {
            if ( predicate( calculated ) )
                then( null );
            else
                then(
                    "This result was unexpected:\n" +
                    JSON.stringify( calculated ) );
        } );
    } );
}
function addShouldThrowUnitTest( body ) {
    // TODO: Stop using JSON.stringify() here. It might be good to
    // have a naiveStringify() function or something for custom
    // stringification.
    unitTests.push( function ( then ) {
        try { var calculated = body(), success = true; }
        catch ( e ) {}
        defer( function () {
            if ( !success )
                then( null );
            else
                then(
                    "This result was unexpected:\n" +
                    JSON.stringify( calculated ) );
        } );
    } );
}


// ===== Reader ======================================================

// TODO: This reader is currently entangled with JavaScript's notion
// of string. It's probably good and fast for sequences of 16-bit
// values, but it doesn't go out of its way to parse UTF-16 surrogate
// pairs, and thus it's a few specificational kludges away from
// Unicode. Figure out whether to make the spec simple, or to keep the
// code and its performance simple.

// $.stream.readc
// $.stream.peekc
// $.then
// $.readerMacros
// $.list
// $.end
// $.unrecognized
function reader( $ ) {
    $.stream.peekc( function ( c ) {
        if ( c === "" )
            return void $.end( $ );
        var readerMacro = $.readerMacros.get( c );
        if ( readerMacro === void 0 )
            return void $.unrecognized( $ );
        readerMacro( $ );
    } );
}
function addReaderMacros( readerMacros, string, func ) {
    for ( var i = 0, n = string.length; i < n; i++ )
        readerMacros.set( string.charAt( i ), func );
}
// NOTE: The readListUntilParen() function is only for use by the "("
// and "/" reader macros to reduce duplication.
function readListUntilParen( $, consumeParen ) {
    function sub( $, list ) {
        return objPlus( $, {
            list: list,
            readerMacros: $.readerMacros.plusEntry( ")",
                function ( $sub ) {
                
                if ( consumeParen )
                    $sub.stream.readc( function ( c ) {
                        next();
                    } );
                else
                    next();
                
                function next() {
                    var result = [];
                    for ( var list = $sub.list;
                        list !== null; list = list.past )
                        result.unshift( list.last );
                    $.then( { ok: true, val: result } );
                }
            } ),
            then: function ( result ) {
                if ( result.ok )
                    reader(
                        sub( $, { past: list, last: result.val } ) );
                else
                    $.then( result );
            },
            end: function ( $sub ) {
                $.then( { ok: false, msg: "Incomplete list" } );
            }
        } );
    }
    $.stream.readc( function ( c ) {
        reader( sub( $, null ) );
    } );
}

var symbolChars = "abcdefghijklmnopqrstuvwxyz";
symbolChars += symbolChars.toUpperCase() + "-*0123456789";
var symbolChopsChars = strMap().setObj( { "(": ")", "[": "]" } );
var whiteChars = " \t\r\n";

var readerMacros = strMap();
readerMacros.set( ";", function ( $ ) {
    function loop() {
        $.stream.readc( function ( c ) {
            if ( c === "" )
                return void $.end();
            if ( /^[\r\n]$/.test( c ) )
                return void reader( $ );
            loop();
        } );
    }
    loop();
} );
addReaderMacros( readerMacros, whiteChars, function ( $ ) {
    $.stream.readc( function ( c ) {
        reader( $ );
    } );
} );
addReaderMacros( readerMacros, symbolChars, function ( $ ) {
    // TODO: See if this series of string concatenations is a
    // painter's algorithm. Those in the know seem to say it's faster
    // than keeping a big Array and concatenating later, but maybe
    // there's something even better than either option.
    function collectChops( stringSoFar, open, close, nesting ) {
        if ( nesting === 0 )
            return void collect( stringSoFar );
        $.stream.readc( function ( c ) {
            var nextStringSoFar = stringSoFar + c;
            if ( c === "" )
                return void $.then(
                    { ok: false, msg: "Incomplete symbol" } );
            collectChops( nextStringSoFar, open, close,
                nesting + (c === open ? 1 : c === close ? -1 : 0) );
        } );
    }
    function collect( stringSoFar ) {
        $.stream.peekc( function ( c ) {
            if ( c === ""
                || (symbolChars.indexOf( c ) === -1
                    && !symbolChopsChars.has( c )) )
                return void $.then( { ok: true, val: stringSoFar } );
            $.stream.readc( function ( open ) {
                var nextStringSoFar = stringSoFar + open;
                var close = symbolChopsChars.get( open );
                if ( close !== void 0 )
                    collectChops( nextStringSoFar, open, close, 1 );
                else
                    collect( nextStringSoFar );
            } );
        } );
    }
    collect( "" );
} );
readerMacros.set( "(", function ( $ ) {
    readListUntilParen( $, !!"consumeParen" );
} );
readerMacros.set( "/", function ( $ ) {
    readListUntilParen( $, !"consumeParen" );
} );

function stringStream( string ) {
    var i = 0, n = string.length;
    var stream = {};
    stream.peekc = function ( then ) {
        defer( function () {
            if ( i < n )
                then( string.charAt( i ) );
            else
                then( "" );
        } );
    };
    stream.readc = function ( then ) {
        defer( function () {
            if ( i < n )
                then( string.charAt( i++ ) );
            else
                then( "" );
        } );
    };
    return stream;
}

addNaiveIsoUnitTest( function ( then ) {
    reader( {
        stream: stringStream(
            " (woo;comment\n b (c( woo( ) string) / x//)/())" ),
        readerMacros: readerMacros,
        end: function ( $ ) {
            $.then( { ok: false, msg: "Reached the end" } );
        },
        unrecognized: function ( $ ) {
            $.then( { ok: false, msg: "Unrecognized char" } );
        },
        then: function ( result ) {
            then( result, { ok: true, val:
                [ "woo", "b",
                    [ "c( woo( ) string)" , [ "x", [ [] ] ] ],
                    [ [] ] ]
            } );
        }
    } );
} );


// ===== Module validity checker =====================================
//
// For now, we just implement the deductive fragment. A more complete
// version of the grammar is available at
// <https://gist.github.com/4559120>. Also, it's worth noting that
// we're using s-expressions for the grammar.
//
// Here's a map of the dependencies among the seven language fragments
// in that Gist:
//
// Local collaboration
//   Deductive
//   Action
// Local collaborative value-level definition
//   Local collaboration
//     ...
// Local collaborative phantom type
//   Local collaboration
//     ...
// Local collaborative extensible sum
//   Local collaboration
//     ...
//   Observational subtyping
//     Deductive
//
// To build an unambitious dynamic programming language within this
// system, the basis we need is the local collaborative value-level
// definition fragment, so we should build the action and local
// collaboration fragments next.


// NOTE: For this version, we're taking the original grammar design
// and filling it out with lots of extra annotations to make the
// checker easy to write. For one thing, every function call
// expression must come with a full description of the function type
// it's calling. For another, when the original inference rules would
// have allowed certain expressions on the grounds that an observed
// action ambiently enabled them, for now we instead force those
// dependencies to the top level. In particular, we use (withthe ...)
// instead of (the ...).

// Deductive fragment grammar notes:
//
// Fact ::=| UserVar "@" UserKnowledge
// UserKnowledge ::=| "##type" Term
// UserKnowledge ::=| Term ":" Term
// Term ::=| TermVar
// Term ::=| "(" Term ")"
// Term ::=| "(" TermVar ":" Term ")" "->" Term
// Term ::=| "\" TermVar ":" Term "->" Term
// Term ::=| Term Term
// Term ::=| "(" "##type" TermVar ")" "->" Term
// Term ::=| "\" "##type" TermVar "->" Term
// Term ::=| Term "#\t" Term
// Term ::=| "(=#Sigma" TermVar ":" Term ")" "*" Term
// Term ::=| "\#sigma" "(" Term ":" Term ")" "*" Term
// Term ::=| "#fst" Term
// Term ::=| "#snd" Term
//
// UserKnowledge ::=| "(" "istype" Term ")"
// UserKnowledge ::=| "(" "describes" Term Term ")"
// Term ::=| TermVar
// Term ::=| "(" "tfa" TermVar Term Term ")"
// Term ::=| "(" "tfn" TermVar Term Term ")"
// Term ::=| "(" "tcall" TermVar Term Term Term Term ")"
// Term ::=| "(" "ttfa" TermVar Term ")"
// Term ::=| "(" "ttfn" TermVar Term ")"
// Term ::=| "(" "ttcall" TermVar Term Term Term ")"
// Term ::=| "(" "sfa" TermVar Term Term ")"
// Term ::=| "(" "sfn" TermVar Term Term Term ")"
// Term ::=| "(" "fst" TermVar Term Term Term ")"
// Term ::=| "(" "snd" TermVar Term Term Term ")"
//
// istype: is type
// describes: describes
// tfa: total for-all
// tfn: total function
// tcall: total call
// ttfa: total type for-all
// ttfn: total type function (a function that takes types to values)
// ttcall: total type call
// sfa: sigma for-all
// sfn: sigma function (i.e. a dependent pair)
// fst: first (of an sfn)
// snd: second (of an sfn)

// Action fragment grammar notes:
//
// MODULE ::= UserAction*
// Fact ::=| UserVar "@!" UserAction
// UserKnowledge ::=| UserAction
//
// // TODO: Figure out how to account for the signatures and timestamp
// // information in the pre-build module grammar.
// //
// // TODO: Figure out if there needs to be a separate grammar for
// // post-build shared modules.
// //
// MODULE ::= "(" "era" "1" UserAction ")"
// UserKnowledge ::=| "(" "can" UserAction ")"

// Local collaboration fragment grammar notes:
//
// UserKnowledge ::=| "##secret" Key
// UserKnowledge ::=| "##public" Key
// Key ::=| KeyVar
// Key ::=| "$" ## CryptographicKeyName
// Key ::=| "$$everyone"
// Key ::=| Key ## "/" ## SubName
//
// UserKnowledge ::=| "(" "secret" Key ")"
// UserKnowledge ::=| "(" "public" Key ")"
// UserAction ::=| "(" "withsecret" Key UserAction ")"

// Local collaborative value-level definition fragment grammar notes:
//
// UserAction ::=| "!!define" Key Key Term Term
// Term ::=| "#the" Key Key Term
//
// UserAction ::=| "(" "define" Key Key Term Term ")"
// UserAction ::=| "(" "withthe" TermVar Key Key Term UserAction ")"



var patternLang = {};
(function () {
    function Pat() {}
    Pat.prototype.init_ = function ( match ) {
        this.match_ = match;
        return this;
    };
    Pat.prototype.match = function ( data ) {
        return this.match_.call( {}, data );
    };
    
    patternLang.lit = function ( string ) {
        return new Pat().init_( function ( data ) {
            return data === string ? { val: strMap() } : null;
        } );
    };
    patternLang.str = function ( x ) {
        return new Pat().init_( function ( data ) {
            return isPrimString( data ) ?
                { val: strMap().set( x, data ) } : null;
        } );
    };
    var pat =
    patternLang.pat = function ( x ) {
        if ( x instanceof Pat ) {
            return x;
        } else if ( isPrimString( x ) ) {
            return new Pat().init_( function ( data ) {
                return { val: strMap().set( x, data ) };
            } );
        } else if ( isArray( x ) ) {
            var n = x.length;
            var pats = arrMap( x, function ( subx ) {
                return pat( subx );
            } );
            return new Pat().init_( function ( data ) {
                if ( !(isArray( data ) && data.length === n) )
                    return null;
                var result = strMap();
                for ( var i = 0; i < n; i++ ) {
                    var subresult = pats[ i ].match( data[ i ] );
                    if ( subresult === null )
                        return null;
                    // TODO: Figure out what to do when keys overlap.
                    // For now, we just avoid overlapping keys in
                    // practice.
                    result.setAll( subresult.val );
                }
                return { val: result };
            } );
        } else {
            throw new Error();
        }
    };
    patternLang.getMatch = function ( arrData, arrPat ) {
        return pat( arrPat ).match( arrData );
    };
})();


function getFreeVars( term, opt_boundVars ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    var boundVars =
        opt_boundVars !== void 0 ? opt_boundVars : strMap();
    
    function recurWith( k, boundVars ) {
        return getFreeVars( em.val.get( k ), boundVars );
    }
    function recur( k ) {
        return recurWith( k, boundVars );
    }
    function recurUnder( termK, argK ) {
        return recurWith( termK,
            boundVars.plusTruth( em.val.get( argK ) ) );
    }
    
    var em;
    if ( isPrimString( term ) ) {
        if ( boundVars.has( term ) )
            return strMap();
        return strMap().plusTruth( term );
        
    } else if ( em = getMatch( term,
        [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        return recur( "argType" ).
            plus( recurUnder( "resultType", "arg" ) );
        
    } else if ( em = getMatch( term,
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        return recur( "argType" ).
            plus( recurUnder( "result", "arg" ) );
        
    } else if ( em = getMatch( term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        return recur( "argType" ).
            plus( recurUnder( "resultType", "argName" ) ).
            plus( recur( "fn" ) ).plus( recur( "argVal" ) );
        
    } else if ( em = getMatch( term,
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        return recurUnder( "resultType", "arg" );
        
    } else if ( em = getMatch( term,
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        return recurUnder( "result", "arg" );
        
    } else if ( em = getMatch( term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        return recurUnder( "resultType", "argName" ).
            plus( recur( "fn" ) ).plus( recur( "argVal" ) );
        
    } else if ( em = getMatch( term,
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        return recur( "argType" ).
            plus( recurUnder( "resultType", "arg" ) );
        
    } else if ( em = getMatch( term, [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        return recur( "argType" ).plus( recur( "argVal" ) ).
            plus( recurUnder( "resultVal", "arg" ) );
        
    } else if ( em = getMatch( term, [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return recur( "argType" ).
            plus( recurUnder( "resultType", "argName" ) ).
            plus( recur( "fn" ) );
        
    } else if ( em = getMatch( term, [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return recur( "argType" ).
            plus( recurUnder( "resultType", "argName" ) ).
            plus( recur( "fn" ) );
        
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

function renameVarsToVars( renameMap, expr ) {
    
    // NOTE: This takes an env-term pair, but it returns a term.
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    function recur( k ) {
        return renameVarsToVars( renameMap,
            { env: expr.env, term: em.val.get( k ) } );
    }
    function recurUnder( termK, argK ) {
        return renameVarsToVars( renameMap, {
            env: expr.env.plusEntry( em.val.get( argK ), {
                knownIsType: null,
                knownType: null,
                knownVal: null
            } ),
            term: em.val.get( termK )
        } );
    }
    
    var em;
    if ( isPrimString( expr.term ) ) {
        if ( expr.env.has( expr.term ) )
            return expr.term;
        if ( renameMap.has( expr.term ) )
            return renameMap.get( expr.term );
        // TODO: Figure out if this is really what we should do here.
        return expr.term;
        
    } else if ( em = getMatch( expr.term,
        [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        return [ "tfa", em.val.get( "arg" ), recur( "argType" ),
            recurUnder( "resultType", "arg" ) ];
        
    } else if ( em = getMatch( expr.term,
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        return [ "tfn", em.val.get( "arg" ), recur( "argType" ),
            recurUnder( "result", "arg" ) ];
        
    } else if ( em = getMatch( expr.term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        return [ "tcall", em.val.get( "argName" ), recur( "argType" ),
            recurUnder( "resultType", "argName" ),
            recur( "fn" ), recur( "argVal" ) ];
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        return [ "ttfa", em.val.get( "arg" ),
            recurUnder( "resultType", "arg" ) ];
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        return [ "ttfn", em.val.get( "arg" ),
            recurUnder( "result", "arg" ) ];
        
    } else if ( em = getMatch( expr.term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        return [ "ttcall", em.val.get( "argName" ),
            recurUnder( "resultType", "argName" ),
            recur( "fn" ), recur( "argVal" ) ];
        
    } else if ( em = getMatch( expr.term,
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        return [ "sfa", em.val.get( "arg" ), recur( "argType" ),
            recurUnder( "resultType", "arg" ) ];
        
    } else if ( em = getMatch( expr.term, [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        return [ "sfn", em.val.get( "arg" ), recur( "argType" ),
            recur( "argVal" ), recurUnder( "resultVal", "arg" ) ];
        
    } else if ( em = getMatch( expr.term, [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return [ "fst", em.val.get( "argName" ), recur( "argType" ),
            recurUnder( "resultType", "argName" ), recur( "fn" ) ];
        
    } else if ( em = getMatch( expr.term, [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return [ "snd", em.val.get( "argName" ), recur( "argType" ),
            recurUnder( "resultType", "argName" ), recur( "fn" ) ];
        
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

function knownEqual( exprA, exprB, opt_boundVars ) {
    // Do a test of intrinsic equality, respecting alpha-equivalence.
    //
    // NOTE: When we support the observational subtyping fragment,
    // this should also respect proof-irrelevance, as described in
    // "Observational Equality, Now!"
    
    // NOTE: We assume exprA and exprB have already been beta-reduced.
    
    var boundVars = opt_boundVars !== void 0 ? opt_boundVars :
        { ab: strMap(), ba: strMap() };
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    var am, bm;
    function aget( k ) {
        return { env: exprA.env, term: am.val.get( k ) };
    }
    function bget( k ) {
        return { env: exprB.env, term: bm.val.get( k ) };
    }
    function recur( k ) {
        return knownEqual( aget( k ), bget( k ), boundVars );
    }
    function recurPlus( termK, argK ) {
        var a = am.val.get( argK );
        var b = bm.val.get( argK );
        return knownEqual( {
            env: exprA.env.plusEntry( a, {
                knownIsType: null,
                knownType: null,
                knownVal: null
            } ),
            term: am.val.get( termK )
        }, {
            env: exprB.env.plusEntry( b, {
                knownIsType: null,
                knownType: null,
                knownVal: null
            } ),
            term: bm.val.get( termK )
        }, {
            ab: boundVars.ab.plusEntry( a, b ),
            ba: boundVars.ba.plusEntry( b, a )
        } );
    }
    
    function aSucceeds( pattern ) {
        am = getMatch( exprA.term, pattern );
        if ( !am )
            return false;
        bm = getMatch( exprB.term, pattern );
        return true;
    }
    
    // If either variable is bound in its term's lexical closure,
    // then we look it up that way and continue, as though the
    // variable value had been substituted in instead of carried
    // in a closure.
    while ( isPrimString( exprA.term )
        && !boundVars.ab.has( exprA.term )
        && exprA.env.has( exprA.term )
        && exprA.env.get( exprA.term ).knownVal !== null )
        exprA = exprA.env.get( exprA.term ).knownVal.val;
    while ( isPrimString( exprB.term )
        && !boundVars.ba.has( exprB.term )
        && exprB.env.has( exprB.term )
        && exprB.env.get( exprB.term ).knownVal !== null )
        exprB = exprB.env.get( exprB.term ).knownVal.val;
    
    if ( isPrimString( exprA.term ) ) {
        if ( !isPrimString( exprB.term ) )
            return false;
        
        // If either variable is part of our tracked local variables,
        // compare them on that basis.
        if ( boundVars.ab.has( exprA.term ) )
            return boundVars.ab.get( exprA.term ) === exprB.term;
        if ( boundVars.ba.has( exprB.term ) )
            return false;
        
        // If they're both free, they're equal if they have the same
        // name.
        return exprA.term === exprB.term;
        
    } else if ( aSucceeds(
        [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) && recurPlus( "resultType", "arg" );
        
    } else if ( aSucceeds(
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) && recurPlus( "result", "arg" );
        
    } else if ( aSucceeds( [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) &&
            recurPlus( "resultType", "argName" ) &&
            recur( "fn" ) && recur( "argVal" );
        
    } else if ( aSucceeds(
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recurPlus( "resultType", "arg" );
        
    } else if ( aSucceeds(
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recurPlus( "result", "arg" );
        
    } else if ( aSucceeds( [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recurPlus( "resultType", "argName" ) &&
            recur( "fn" ) && recur( "argVal" );
        
    } else if ( aSucceeds(
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) && recurPlus( "resultType", "arg" );
        
    } else if ( aSucceeds( [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) && recur( "argVal" ) &&
            recurPlus( "resultVal", "arg" );
        
    } else if ( aSucceeds( [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) &&
            recurPlus( "resultType", "argName" ) && recur( "fn" );
        
    } else if ( aSucceeds( [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) &&
            recurPlus( "resultType", "argName" ) && recur( "fn" );
        
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

function betaReduce( expr ) {
    // NOTE: Pretty much every time we call betaReduce(), we call
    // isType() or typeCheck() first, so that we know beta reduction
    // will terminate (albeit without rigorous mathematical proof
    // yet).
    //
    // TODO: See if this practice leads to significant amounts of
    // duplicated computation.
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    function eget( k ) {
        return { env: expr.env, term: em.val.get( k ) };
    }
    function beget( k ) {
        return betaReduce( eget( k ) );
    }
    
    var env = expr.env;
    
    // NOTE: These have side effects (changing the binding of `env`),
    // even if we use them in a way that makes them look pure.
    //
    // TODO: For the moment, we don't end up renaming anything in
    // practice, and if and when we do, we might run across a bug: The
    // implementation of knownEqual() for free variables depends on
    // the exact names of those variables. See if this will come up as
    // an issue.
    //
    function renameExpr( expr ) {
        var reduced = betaReduce( expr );
        var freeVars = getFreeVars( reduced.term );
        
        function pickNameOutside( desiredName, isTaken ) {
            desiredName += "";
            var result = desiredName;
            var index = 1;
            while ( isTaken( result ) ) {
                index++;
                result = desiredName + "_" + index;
            }
            return result;
        }
        
        var renameForward = strMap();
        var renameBackward = strMap();
        freeVars.each( function ( origName, truth ) {
            var newName = pickNameOutside( origName, function ( n ) {
                return renameForward.has( n );
            } );
            renameForward.set( origName, newName );
            renameBackward.set( newName, origName );
        } );
        
        var result = renameVarsToVars( renameForward, reduced );
        env = env.plus( renameBackward.map( function ( origName ) {
            return env.get( origName );
        } ) );
        return result;
    }
    function rename( k ) {
        return renameExpr( eget( k ) );
    }
    
    
    // TODO: Figure out if it's really important to do
    // rename( "argType" ) or beget( "argType" ) when the overall
    // value isn't a type. There might be some static-versus-dynamic
    // confusion here.
    
    var em;
    if ( isPrimString( expr.term ) ) {
        if ( !expr.env.has( expr.term ) )
            throw new Error();
        var exprVal = expr.env.get( expr.term ).knownVal;
        // TODO: During typeCheck(), some of the calls to betaReduce()
        // pass null for knownVal, so we just return the expression
        // as-is if we run across that case. Figure out if those calls
        // should be passing null in the first place.
        if ( exprVal === null )
            return expr;
        
        // TODO: Figure out if it should be necessary to beta-reduce
        // env-term pairs before they're stored in environments (under
        // knownType and knownVal). We do this now, but do we have to?
        // Maybe we could beta-reduce knownVal here instead. But
        // where would we beta-reduce knownType?
        
        // TODO: See if a call to renameVarsToVars() here would
        // obviate the need to do renaming in any other case. After
        // all, this seems to be the only case whose result's
        // environment has mappings that conflict with the original
        // environment.
        
        return exprVal.val;
    } else if ( em = getMatch( expr.term,
        [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        var term = [ "tfa", em.val.get( "arg" ),
            rename( "argType" ), em.val.get( "resultType" ) ];
        return { env: env, term: term };
        
    } else if ( em = getMatch( expr.term,
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        var term = [ "tfn", em.val.get( "arg" ),
            rename( "argType" ), em.val.get( "result" ) ];
        return { env: env, term: term };
        
    } else if ( em = getMatch( expr.term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term,
            [ lit( "tfn" ), str( "arg" ), "argType", "result" ] );
        if ( !matchedFn )
            throw new Error();
        return betaReduce( {
            env: reducedFn.env.plusEntry( matchedFn.val.get( "arg" ),
            {
                knownIsType: null,
                // TODO: Figure out if we actually need this knownType
                // here. If so, figure out whether we should use
                // argType from matchedFn instead. Currently, we make
                // the opposite decision for `snd`.
                knownType: { val: beget( "argType" ) },
                knownVal: { val: beget( "argVal" ) }
            } ),
            term: matchedFn.val.get( "result" )
        } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        return expr;
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        return expr;
        
    } else if ( em = getMatch( expr.term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term,
            [ lit( "ttfn" ), str( "arg" ), "result" ] );
        if ( !matchedFn )
            throw new Error();
        return betaReduce( {
            env: reducedFn.env.plusEntry( matchedFn.val.get( "arg" ),
            {
                // TODO: Figure out if we actually need this
                // knownIsType here.
                knownIsType: { val: true },
                knownType: null,
                knownVal: { val: beget( "argVal" ) }
            } ),
            term: matchedFn.val.get( "result" )
        } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        var term = [ "sfa", em.val.get( "arg" ),
            rename( "argType" ), em.val.get( "resultType" ) ];
        return { env: env, term: term };
        
    } else if ( em = getMatch( expr.term, [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        var argTypeTerm = rename( "argType" );
        var argTypeExpr = { env: env, term: argTypeTerm };
        
        var argValTerm = rename( "argVal" );
        var argValExpr = { env: env, term: argValTerm };
        
        var term = [ "sfn", em.val.get( "arg" ), argTypeTerm,
            argValTerm,
            renameExpr( {
                env: env.plusEntry( em.val.get( "arg" ), {
                    knownIsType: null,
                    // TODO: Figure out if we actually need this
                    // knownType here.
                    knownType: { val: argTypeExpr },
                    knownVal: { val: argValExpr }
                } ),
                term: em.val.get( "resultVal" )
            } ) ];
        return { env: env, term: term };
        
    } else if ( em = getMatch( expr.term, [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term, [ lit( "sfn" ),
            str( "arg" ), "argType", "argVal", "resultVal" ] );
        if ( !matchedFn )
            throw new Error();
        return { env: env, term: matchedFn.val.get( "argVal" ) };
        
    } else if ( em = getMatch( expr.term, [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term, [ lit( "sfn" ),
            str( "arg" ), "argType", "argVal", "resultVal" ] );
        if ( !matchedFn )
            throw new Error();
        return {
            env: reducedFn.env.plusEntry( matchedFn.val.get( "arg" ),
            {
                knownIsType: null,
                // TODO: Figure out if we actually need this knownType
                // here. If so, figure out whether we should use
                // argType from `em` instead. Currently, we make the
                // opposite decision for `tcall`.
                knownType: { val: { env: reducedFn.env,
                    term: matchedFn.val.get( "argType" ) } },
                knownVal: { val: { env: reducedFn.env,
                    term: matchedFn.val.get( "argVal" ) } }
            } ),
            term: matchedFn.val.get( "resultVal" )
        };
        
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

function isWellFormed( term ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    function recur( k ) {
        return isWellFormed( em.val.get( k ) );
    }
    
    var em;
    if ( isPrimString( term ) ) {
        return true;
        
    } else if ( em = getMatch( term,
        [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        return recur( "argType" ) && recur( "resultType" );
        
    } else if ( em = getMatch( term,
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        return recur( "argType" ) && recur( "result" );
        
    } else if ( em = getMatch( term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        return recur( "argType" ) && recur( "resultType" ) &&
            recur( "fn" ) && recur( "argVal" );
        
    } else if ( em = getMatch( term,
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        return recur( "resultType" );
        
    } else if ( em = getMatch( term,
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        return recur( "result" );
        
    } else if ( em = getMatch( term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        return recur( "resultType" ) && recur( "fn" ) &&
            recur( "argVal" );
        
    } else if ( em = getMatch( term,
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        return recur( "argType" ) && recur( "resultType" );
        
    } else if ( em = getMatch( term, [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        return recur( "argType" ) && recur( "argVal" ) &&
            recur( "resultVal" );
        
    } else if ( em = getMatch( term, [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return recur( "argType" ) && recur( "resultType" ) &&
            recur( "fn" );
        
    } else if ( em = getMatch( term, [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return recur( "argType" ) && recur( "resultType" ) &&
            recur( "fn" );
    } else {
        // TODO: Handle more language fragments.
        return false;
    }
}

function isType( expr ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    function eget( k ) {
        return { env: expr.env, term: em.val.get( k ) };
    }
    function beget( k ) {
        return betaReduce( eget( k ) );
    }
    
    var em;
    if ( isPrimString( expr.term ) ) {
        if ( !expr.env.has( expr.term ) )
            return false;
        var exprIsType = expr.env.get( expr.term ).knownIsType;
        if ( exprIsType === null )
            return false;
        return exprIsType.val;
        
    } else if ( em = getMatch( expr.term,
        [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        if ( !isType( eget( "argType" ) ) )
            return false;
        return isType( {
            env: expr.env.plusEntry( em.val.get( "arg" ), {
                knownIsType: null,
                knownType: { val: beget( "argType" ) },
                knownVal: null
            } ),
            term: em.val.get( "resultType" )
        } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        return false;
        
    } else if ( em = getMatch( expr.term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        return false;
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        return isType( {
            env: expr.env.plusEntry( em.val.get( "arg" ), {
                knownIsType: { val: true },
                knownType: null,
                knownVal: null
            } ),
            term: em.val.get( "resultType" )
        } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        return false;
        
    } else if ( em = getMatch( expr.term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        return false;
        
    } else if ( em = getMatch( expr.term,
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        if ( !isType( eget( "argType" ) ) )
            return false;
        return isType( {
            env: expr.env.plusEntry( em.val.get( "arg" ), {
                knownIsType: null,
                knownType: { val: beget( "argType" ) },
                knownVal: null
            } ),
            term: em.val.get( "resultType" )
        } );
        
    } else if ( em = getMatch( expr.term, [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        return false;
        
    } else if ( em = getMatch( expr.term, [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return false;
        
    } else if ( em = getMatch( expr.term, [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return false;
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

function typeCheck( expr, type ) {
    // NOTE: The type is assumed to be beta-reduced already.
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    // NOTE: Var hoisting is so convenient!
    function eget( k ) {
        return { env: expr.env, term: em.val.get( k ) };
    }
    function beget( k ) {
        return betaReduce( eget( k ) );
    }
    function tget( k ) {
        return { env: type.env, term: tm.val.get( k ) };
    }
    
    var em;
    if ( isPrimString( expr.term ) ) {
        if ( !expr.env.has( expr.term ) )
            return false;
        var exprType = expr.env.get( expr.term ).knownType;
        if ( exprType === null )
            return false;
        return knownEqual( exprType.val, type );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        return false;
        
    } else if ( em = getMatch( expr.term,
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        var tm = getMatch( type.term,
            [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] );
        if ( tm === null )
            return false;
        var argType = tget( "argType" );
        if ( !isType( eget( "argType" ) ) )
            return false;
        if ( !knownEqual( beget( "argType" ), argType ) )
            return false;
        return typeCheck( {
            env: expr.env.plusEntry( em.val.get( "arg" ), {
                knownIsType: null,
                knownType: { val: argType },
                knownVal: null
            } ),
            term: em.val.get( "result" ),
        }, betaReduce( {
            env: type.env.plusEntry( tm.val.get( "arg" ), {
                knownIsType: null,
                knownType: { val: argType },
                knownVal: null
            } ),
            term: tm.val.get( "resultType" )
        } ) );
        
    } else if ( em = getMatch( expr.term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "tfa", em.val.get( "argName" ), em.val.get( "argType" ),
                em.val.get( "resultType" ) ] };
        if ( !isType( fnType ) )
            return false;
        if ( !typeCheck( eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        var argType = beget( "argType" );
        if ( !typeCheck( eget( "argVal" ), argType ) )
            return false;
        return knownEqual(
            betaReduce( {
                env: expr.env.plusEntry( em.val.get( "argName" ), {
                    knownIsType: null,
                    knownType: { val: argType },
                    knownVal: { val: beget( "argVal" ) }
                } ),
                term: em.val.get( "resultType" )
            } ),
            type );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        return false;
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        var tm = getMatch( type.term,
            [ lit( "ttfa" ), str( "arg" ), "resultType" ] );
        if ( tm === null )
            return false;
        
        return typeCheck( {
            env: expr.env.plusEntry( em.val.get( "arg" ), {
                knownIsType: { val: true },
                knownType: null,
                knownVal: null
            } ),
            term: em.val.get( "result" ),
        }, betaReduce( {
            env: type.env.plusEntry( tm.val.get( "arg" ), {
                knownIsType: { val: true },
                knownType: null,
                knownVal: null
            } ),
            term: tm.val.get( "resultType" )
        } ) );
        
    } else if ( em = getMatch( expr.term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "ttfa", em.val.get( "argName" ),
                em.val.get( "resultType" ) ] };
        if ( !isType( fnType ) )
            return false;
        if ( !typeCheck( eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        if ( !isType( eget( "argVal" ) ) )
            return false;
        return knownEqual(
            betaReduce( {
                env: expr.env.plusEntry( em.val.get( "argName" ), {
                    knownIsType: { val: true },
                    knownType: null,
                    knownVal: { val: beget( "argVal" ) }
                } ),
                term: em.val.get( "resultType" )
            } ),
            type );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        return false;
        
    } else if ( em = getMatch( expr.term, [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        var tm = getMatch( type.term,
            [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] );
        if ( tm === null )
            return false;
        var typeArgType = tget( "argType" );
        if ( !isType( eget( "argType" ) ) )
            return false;
        var exprArgType = beget( "argType" );
        if ( !knownEqual( exprArgType, typeArgType ) )
            return false;
        if ( !typeCheck( eget( "argVal" ), typeArgType ) )
            return false;
        var argVal = beget( "argVal" );
        
        // TODO: Figure out if we should really be passing
        // `exprArgType` and `typeArgType` like this, rather than in
        // some other combination. Anyhow, they're knownEqual at this
        // point.
        return typeCheck( {
            env: expr.env.plusEntry( tm.val.get( "arg" ), {
                knownIsType: null,
                knownType: { val: exprArgType },
                knownVal: { val: argVal }
            } ),
            term: em.val.get( "resultVal" )
        }, betaReduce( {
            env: type.env.plusEntry( tm.val.get( "arg" ), {
                knownIsType: null,
                knownType: { val: typeArgType },
                knownVal: { val: argVal }
            } ),
            term: tm.val.get( "resultType" )
        } ) );
        
    } else if ( em = getMatch( expr.term, [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "sfa", em.val.get( "argName" ), em.val.get( "argType" ),
                em.val.get( "resultType" ) ] };
        if ( !isType( fnType ) )
            return false;
        if ( !typeCheck( eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        return knownEqual( beget( "argType" ), type );
        
    } else if ( em = getMatch( expr.term, [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "sfa", em.val.get( "argName" ), em.val.get( "argType" ),
                em.val.get( "resultType" ) ] }
        if ( !isType( fnType ) )
            return false;
        if ( !typeCheck( eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term, [ lit( "sfn" ),
            str( "arg" ), "argType", "argVal", "resultVal" ] );
        if ( matchedFn === null )
            return false;
        return typeCheck( {
            env: reducedFn.env.plusEntry( matchedFn.val.get( "arg" ),
            {
                knownIsType: null,
                knownType: { val: { env: reducedFn.env,
                    term: matchedFn.val.get( "argType" ) } },
                knownVal: { val: { env: reducedFn.env,
                    term: matchedFn.val.get( "argVal" ) } }
            } ),
            term: matchedFn.val.get( "resultVal" )
        }, type );
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

function isWellFormedKnowledge( term ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    var em;
    if ( em = getMatch( term,
        [ lit( "istype" ), "purportedType" ] ) ) {
        
        return isWellFormed( em.val.get( "purportedType" ) );
        
    } else if ( em = getMatch( term,
        [ lit( "describes" ), "type", "purportedInhabitant" ] ) ) {
        
        return isWellFormed( em.val.get( "type" ) ) &&
            isWellFormed( em.val.get( "purportedInhabitant" ) );
    } else {
        // TODO: Handle more language fragments.
        return false;
    }
}

function knowledgeCheck( expr ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    function eget( k ) {
        return { env: expr.env, term: em.val.get( k ) };
    }
    
    var em;
    if ( em = getMatch( expr.term,
        [ lit( "istype" ), "purportedType" ] ) ) {
        
        return isType( eget( "purportedType" ) );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "describes" ), "type", "purportedInhabitant" ] ) ) {
        
        // TODO: See if we should really be checking isType() here, or
        // if there's another place for this kind of checking.
        return isType( eget( "type" ) ) && typeCheck(
            eget( "purportedInhabitant" ), eget( "type" ) );
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}


(function () {
    function add( term, vars ) {
        addNaiveIsoUnitTest( function ( then ) {
            then(
                getFreeVars( term ), strMap().plusArrTruth( vars ) );
        } );
    }
    
    
    // Systematically verify the variable binding behavior of all
    // expression syntaxes, at least for the purposes of
    // getFreeVars().
    
    add( "foo", [ "foo" ] );
    
    add( [ "tfa", "a", "aType", "bType" ], [ "aType", "bType" ] );
    // NOTE: This test is farfetched since there should be no existing
    // way to make (tfa a aType a) typecheck. It would require a way
    // to make `a` a value of `aType` and a type of its own
    // simultaneously.
    add( [ "tfa", "a", "aType", "a" ], [ "aType" ] );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "tfa", "a", "a", "a" ], [ "a" ] );
    
    add( [ "tfn", "a", "aType", "b" ], [ "aType", "b" ] );
    add( [ "tfn", "a", "aType", "a" ], [ "aType" ] );
    add( [ "tfn", "a", "a", "a" ], [ "a" ] );
    
    add( [ "tcall", "a", "aType", "bType", "fn", "arg" ],
        [ "aType", "bType", "fn", "arg" ] );
    add( [ "tcall", "a", "aType", "a", "fn", "arg" ],
        [ "aType", "fn", "arg" ] );
    add( [ "tcall", "a", "a", "a", "fn", "arg" ],
        [ "a", "fn", "arg" ] );
    add( [ "tcall", "a", "aType", "a", "a", "arg" ],
        [ "aType", "a", "arg" ] );
    add( [ "tcall", "a", "aType", "a", "fn", "a" ],
        [ "aType", "fn", "a" ] );
    
    add( [ "ttfa", "a", "bType" ], [ "bType" ] );
    // NOTE: This term actually can typecheck. It's the type of a
    // type-to-term function that procures a value of the given type.
    // This corresponds pretty well to inconsistency of the type
    // system, so it's how we represent bottom.
    add( [ "ttfa", "a", "a" ], [] );
    
    add( [ "ttfn", "a", "b" ], [ "b" ] );
    add( [ "ttfn", "a", "a" ], [] );
    
    add( [ "ttcall", "a", "bType", "fn", "arg" ],
        [ "bType", "fn", "arg" ] );
    add( [ "ttcall", "a", "a", "fn", "arg" ], [ "fn", "arg" ] );
    add( [ "ttcall", "a", "a", "a", "arg" ], [ "a", "arg" ] );
    add( [ "ttcall", "a", "a", "fn", "a" ], [ "fn", "a" ] );
    
    add( [ "sfa", "a", "aType", "bType" ], [ "aType", "bType" ] );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "sfa", "a", "aType", "a" ], [ "aType" ] );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "sfa", "a", "a", "a" ], [ "a" ] );
    
    add( [ "sfn", "a", "aType", "fst", "snd" ],
        [ "aType", "fst", "snd" ] );
    add( [ "sfn", "a", "aType", "fst", "a" ], [ "aType", "fst" ] );
    add( [ "sfn", "a", "a", "fst", "a" ], [ "a", "fst" ] );
    add( [ "sfn", "a", "aType", "a", "a" ], [ "aType", "a" ] );
    
    add( [ "fst", "a", "aType", "bType", "sfn" ],
        [ "aType", "bType", "sfn" ] );
    add( [ "fst", "a", "aType", "a", "sfn" ], [ "aType", "sfn" ] );
    add( [ "fst", "a", "a", "a", "sfn" ], [ "a", "sfn" ] );
    add( [ "fst", "a", "aType", "a", "a" ], [ "aType", "a" ] );
    
    add( [ "snd", "a", "aType", "bType", "sfn" ],
        [ "aType", "bType", "sfn" ] );
    add( [ "snd", "a", "aType", "a", "sfn" ], [ "aType", "sfn" ] );
    add( [ "snd", "a", "a", "a", "sfn" ], [ "a", "sfn" ] );
    add( [ "snd", "a", "aType", "a", "a" ], [ "aType", "a" ] );
    
    
    // Just try something wacky with nesting and shadowing.
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "sfn", "a", [ "sfn", "a", "x1", "x2", "x3" ],
        [ "sfn", "a", "x4", "x5", "x6" ],
        [ "sfn", "a", "a", "x7", "a" ] ],
        [ "x1", "x2", "x3", "x4", "x5", "x6", "x7" ] );
})();
addShouldThrowUnitTest( function () {
    return getFreeVars( [ "nonexistentSyntax", "a", "b", "c" ] );
} );
addShouldThrowUnitTest( function () {
    return getFreeVars(
        !"a boolean rather than a nested Array of strings" );
} );

(function () {
    function add( map, input, output ) {
        addNaiveIsoUnitTest( function ( then ) {
            then(
                renameVarsToVars(
                    map, { env: strMap(), term: input } ),
                output );
        } );
    }
    
    var xo = strMap().setObj( { "x": "o" } );
    
    // TODO: Try some tests in a nonempty environment.
    
    // Try a few base cases.
    add( strMap(), "f", "f" );
    add( xo, "o", "o" );
    add( xo, "f", "f" );
    add( strMap().setObj( { "x1": "o1", "x2": "o2" } ),
        [ "ttcall", "a", "a", "x1", "x2" ],
        [ "ttcall", "a", "a", "o1", "o2" ] );
    
    // Systematically verify the variable binding behavior of all
    // expression syntaxes, at least for the purposes of
    // renameVarsToVars().
    add( xo, "x", "o" );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( xo, [ "tfa", "x", "x", "x" ], [ "tfa", "x", "o", "x" ] );
    add( xo, [ "tfn", "x", "x", "x" ], [ "tfn", "x", "o", "x" ] );
    add( xo,
        [ "tcall", "x", "x", "x", "x", "x" ],
        [ "tcall", "x", "o", "x", "o", "o" ] );
    add( xo, [ "ttfa", "x", "x" ], [ "ttfa", "x", "x" ] );
    add( xo, [ "ttfn", "x", "x" ], [ "ttfn", "x", "x" ] );
    add( xo,
        [ "ttcall", "x", "x", "x", "x" ],
        [ "ttcall", "x", "x", "o", "o" ] );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( xo, [ "sfa", "x", "x", "x" ], [ "sfa", "x", "o", "x" ] );
    add( xo,
        [ "sfn", "x", "x", "x", "x" ],
        [ "sfn", "x", "o", "o", "x" ] );
    add( xo,
        [ "fst", "x", "x", "x", "x" ],
        [ "fst", "x", "o", "x", "o" ] );
    add( xo,
        [ "snd", "x", "x", "x", "x" ],
        [ "snd", "x", "o", "x", "o" ] );
    
    // Just try something wacky with nesting and shadowing.
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( xo,
        [ "sfn", "f", [ "sfn", "x", "x", "x", "x" ],
            [ "sfn", "f", "x", "x", "x" ],
            [ "sfn", "f", "f", "x", "f" ] ],
        [ "sfn", "f", [ "sfn", "x", "o", "o", "x" ],
            [ "sfn", "f", "o", "o", "o" ],
            [ "sfn", "f", "f", "o", "f" ] ] );
})();
addShouldThrowUnitTest( function () {
    return renameVarsToVars( strMap(), { env: strMap(),
        term: [ "nonexistentSyntax", "a", "b", "c" ] } );
} );
addShouldThrowUnitTest( function () {
    return renameVarsToVars( strMap(), { env: strMap(),
        term: !"a boolean rather than a nested Array of strings" } );
} );

(function () {
    function add( a, b ) {
        addPredicateUnitTest( function ( then ) {
            then( {
                a: { env: strMap(), term: a },
                b: { env: strMap(), term: b }
            }, function ( aAndB ) {
                var a = aAndB.a, b = aAndB.b;
                return ( true
                    && knownEqual( a, a )
                    && knownEqual( a, b )
                    && knownEqual( b, a )
                    && knownEqual( b, b )
                );
            } );
        } );
    }
    function addNegative( a, b ) {
        addPredicateUnitTest( function ( then ) {
            then( {
                a: { env: strMap(), term: a },
                b: { env: strMap(), term: b }
            }, function ( aAndB ) {
                var a = aAndB.a, b = aAndB.b;
                return ( true
                    && knownEqual( a, a )
                    && !knownEqual( a, b )
                    && !knownEqual( b, a )
                    && knownEqual( b, b )
                );
            } );
        } );
    }
    
    addNegative(
        [ "sfn", "x", "x", "x", "x" ],
        [ "sfn", "o", "x", "x", "x" ] );
    
    // Systematically verify the variable binding behavior of all
    // expression syntaxes, at least for the purposes of
    // renameVarsToVars().
    add( "x", "x" );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "tfa", "x", "x", "x" ], [ "tfa", "o", "x", "o" ] );
    add( [ "tfn", "x", "x", "x" ], [ "tfn", "o", "x", "o" ] );
    add(
        [ "tcall", "x", "x", "x", "x", "x" ],
        [ "tcall", "o", "x", "o", "x", "x" ] );
    add( [ "ttfa", "x", "x" ], [ "ttfa", "o", "o" ] );
    add( [ "ttfn", "x", "x" ], [ "ttfn", "o", "o" ] );
    add(
        [ "ttcall", "x", "x", "x", "x" ],
        [ "ttcall", "o", "o", "x", "x" ] );
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add( [ "sfa", "x", "x", "x" ], [ "sfa", "o", "x", "o" ] );
    add(
        [ "sfn", "x", "x", "x", "x" ],
        [ "sfn", "o", "x", "x", "o" ] );
    add(
        [ "fst", "x", "x", "x", "x" ],
        [ "fst", "o", "x", "o", "x" ] );
    add(
        [ "snd", "x", "x", "x", "x" ],
        [ "snd", "o", "x", "o", "x" ] );
    
    // Just try something wacky with nesting and shadowing.
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    add(
        [ "sfn", "f", [ "sfn", "x", "x", "x", "x" ],
            [ "sfn", "f", "x", "x", "x" ],
            [ "sfn", "f", "f", "x", "f" ] ],
        [ "sfn", "a", [ "sfn", "b", "x", "x", "b" ],
            [ "sfn", "c", "x", "x", "x" ],
            [ "sfn", "d", "a", "x", "d" ] ] );
})();
addShouldThrowUnitTest( function () {
    var expr = { env: strMap(),
        term: [ "nonexistentSyntax", "a", "b", "c" ] };
    return knownEqual( expr, expr );
} );
addShouldThrowUnitTest( function () {
    var expr = { env: strMap(),
        term: !"a boolean rather than a nested Array of strings" };
    return knownEqual( expr, expr );
} );

(function () {
    function add( expected, term ) {
        addPredicateUnitTest( function ( then ) {
            then( term, function ( term ) {
                return expected === isWellFormed( term );
            } );
        } );
    }
    
    var vari = "x";
    var expr = [ "ttfn", "z", "z" ];
    
    add( true, expr );
    
    
    // NOTE: Again, for many of these terms that pass isWellFormed(),
    // there should be no existing way to make them fully typecheck.
    
    
    // Systematically verify the variable binding behavior of all
    // expression syntaxes, at least for the purposes of
    // isWellFormed().
    
    add( true, vari );
    add( false, true );
    
    add( true, [ "tfa", vari, expr, expr ] );
    add( false, [ "tfa", true, expr, expr ] );
    add( false, [ "tfa", vari, true, expr ] );
    add( false, [ "tfa", vari, expr, true ] );
    add( false, [ "tfa", expr, expr, expr ] );
    
    add( true, [ "tfn", vari, expr, expr ] );
    add( false, [ "tfn", true, expr, expr ] );
    add( false, [ "tfn", vari, true, expr ] );
    add( false, [ "tfn", vari, expr, true ] );
    add( false, [ "tfn", expr, expr, expr ] );
    
    add( true, [ "tcall", vari, expr, expr, expr, expr ] );
    add( false, [ "tcall", true, expr, expr, expr, expr ] );
    add( false, [ "tcall", vari, true, expr, expr, expr ] );
    add( false, [ "tcall", vari, expr, true, expr, expr ] );
    add( false, [ "tcall", vari, expr, expr, true, expr ] );
    add( false, [ "tcall", vari, expr, expr, expr, true ] );
    add( false, [ "tcall", expr, expr, expr, expr, expr ] );
    
    add( true, [ "ttfa", vari, expr ] );
    add( false, [ "ttfa", true, expr ] );
    add( false, [ "ttfa", vari, true ] );
    add( false, [ "ttfa", expr, expr ] );
    
    add( true, [ "ttfn", vari, expr ] );
    add( false, [ "ttfn", true, expr ] );
    add( false, [ "ttfn", vari, true ] );
    add( false, [ "ttfn", expr, expr ] );
    
    add( true, [ "ttcall", vari, expr, expr, expr ] );
    add( false, [ "ttcall", true, expr, expr, expr ] );
    add( false, [ "ttcall", vari, true, expr, expr ] );
    add( false, [ "ttcall", vari, expr, true, expr ] );
    add( false, [ "ttcall", vari, expr, expr, true ] );
    add( false, [ "ttcall", expr, expr, expr, expr ] );
    
    add( true, [ "sfa", vari, expr, expr ] );
    add( false, [ "sfa", true, expr, expr ] );
    add( false, [ "sfa", vari, true, expr ] );
    add( false, [ "sfa", vari, expr, true ] );
    add( false, [ "sfa", expr, expr, expr ] );
    
    add( true, [ "sfn", vari, expr, expr, expr ] );
    add( false, [ "sfn", true, expr, expr, expr ] );
    add( false, [ "sfn", vari, true, expr, expr ] );
    add( false, [ "sfn", vari, expr, true, expr ] );
    add( false, [ "sfn", vari, expr, expr, true ] );
    add( false, [ "sfn", expr, expr, expr, expr ] );
    
    add( true, [ "fst", vari, expr, expr, expr ] );
    add( false, [ "fst", true, expr, expr, expr ] );
    add( false, [ "fst", vari, true, expr, expr ] );
    add( false, [ "fst", vari, expr, true, expr ] );
    add( false, [ "fst", vari, expr, expr, true ] );
    add( false, [ "fst", expr, expr, expr, expr ] );
    
    add( true, [ "snd", vari, expr, expr, expr ] );
    add( false, [ "snd", true, expr, expr, expr ] );
    add( false, [ "snd", vari, true, expr, expr ] );
    add( false, [ "snd", vari, expr, true, expr ] );
    add( false, [ "snd", vari, expr, expr, true ] );
    add( false, [ "snd", expr, expr, expr, expr ] );
    
    
    // Just try something wacky with nesting and shadowing.
    add( true,
        [ "sfn", "f", [ "sfn", "x", "x", "x", "x" ],
            [ "sfn", "f", "x", "x", "x" ],
            [ "sfn", "f", "f", "x", "f" ] ] );
    
    
    add( false, [ "nonexistentSyntax", "a", "b", "c" ] );
})();

(function () {
    function addTerm( expected, env, type, expr, opt_reduced ) {
        addPredicateUnitTest( function ( then ) {
            then( {
                type: { env: env, term: type },
                expr: { env: env, term: expr },
                reduced: { env: env, term:
                    opt_reduced !== void 0 ? opt_reduced : expr }
            }, function ( args ) {
                if ( !isType( args.type ) )
                    return false;
                var checksOut = typeCheck( args.expr, args.type );
                if ( checksOut !== expected )
                    return false;
                if ( checksOut
                    && !knownEqual(
                        betaReduce( args.expr ), args.reduced ) )
                    return false;
                return true;
            } );
        } );
    }
    
    
    // TODO: Add more thorough unit tests, exploring the impact of
    // non-empty environments, unsuccessful typechecks, and such.
    
    var _env = strMap();  // NOTE: The "_" stands for "empty."
    var igno = "_";
    var unitType = [ "ttfa", "t", [ "tfa", igno, "t", "t" ] ];
    var unit = [ "ttfn", "t", [ "tfn", "x", "t", "x" ] ];
    var sfn = [ "sfn", igno, unitType, unit, unit ];
    
    addTerm( true, _env, unitType, unit );
    addTerm( true, _env, [ "tfa", igno, unitType, unitType ],
        [ "tfn", igno, unitType, unit ] );
    addTerm( true, _env, unitType,
        [ "tcall", igno, unitType, unitType,
            [ "tfn", "x", unitType, "x" ], unit ],
        unit );
    addTerm( true, _env, [ "ttfa", igno, unitType ],
        [ "ttfn", igno, unit ] );
    // NOTE: This test encounters the case where one of the arguments
    // to knownEqual() is a variable reference and it's bound in its
    // environment. This happens because during type checking of the
    // beta-reduced expression, the final type we compare to is
    // actually [ "tfa", igno, unitType, "t" ] with "t" bound to
    // unitType in the lexical closure.
    addTerm( true, _env, [ "tfa", igno, unitType, unitType ],
        [ "ttcall", "t", [ "tfa", igno, "t", "t" ], unit, unitType ],
        [ "tfn", "x", unitType, "x" ] );
    // NOTE: This test of ttcall makes no use of lexical closure in
    // the result, so it hasn't run across the same trouble as the
    // previous test.
    addTerm( true, _env, unitType,
        [ "ttcall", igno, unitType,
            [ "ttfn", igno, unit ], unitType ],
        unit );
    addTerm( true, _env, [ "sfa", igno, unitType, unitType ], sfn );
    addTerm( true, _env, unitType,
        [ "fst", igno, unitType, unitType, sfn ], unit );
    addTerm( true, _env, unitType,
        [ "snd", igno, unitType, unitType, sfn ], unit );
})();
addShouldThrowUnitTest( function () {
    return betaReduce( { env: strMap(),
        term: [ "nonexistentSyntax", "a", "b", "c" ] } );
} );
addShouldThrowUnitTest( function () {
    return betaReduce( { env: strMap(),
        term: !"a boolean rather than a nested Array of strings" } );
} );
addShouldThrowUnitTest( function () {
    return isType( { env: strMap(),
        term: [ "nonexistentSyntax", "a", "b", "c" ] } );
} );
addShouldThrowUnitTest( function () {
    return isType( { env: strMap(),
        term: !"a boolean rather than a nested Array of strings" } );
} );
addShouldThrowUnitTest( function () {
    var env = strMap();
    return typeCheck(
        { env: env, term: [ "nonexistentSyntax", "a", "b", "c" ] },
        { env: env, term: [ "ttfa", "t", [ "tfa", "x", "t", "t" ] ] }
    );
} );
addShouldThrowUnitTest( function () {
    var env = strMap();
    return typeCheck(
        { env: env, term:
            !"a boolean rather than a nested Array of strings" },
        { env: env, term: [ "ttfa", "t", [ "tfa", "x", "t", "t" ] ] }
    );
} );

(function () {
    function add( expected, term ) {
        addPredicateUnitTest( function ( then ) {
            then( term, function ( term ) {
                return expected === isWellFormedKnowledge( term );
            } );
        } );
    }
    
    var vari = "x";
    
    add( false, vari );
    add( false, true );
    
    add( true, [ "istype", vari ] );
    add( false, [ "istype", true ] );
    
    add( true, [ "describes", vari, vari ] );
    add( false, [ "describes", true, vari ] );
    add( false, [ "describes", vari, true ] );
    
    add( false, [ "nonexistentSyntax", "a", "b", "c" ] );
})();

(function () {
    function add( type, expr ) {
        addPredicateUnitTest( function ( then ) {
            then( {
                typeKnowledge:
                    { env: strMap(), term: [ "istype", type ] },
                exprKnowledge: { env: strMap(), term:
                    [ "describes", type, expr ] }
            }, function ( args ) {
                if ( !isWellFormedKnowledge(
                    args.typeKnowledge.term ) )
                    return false;
                if ( !knowledgeCheck( args.typeKnowledge ) )
                    return false;
                if ( !isWellFormedKnowledge(
                    args.exprKnowledge.term ) )
                    return false;
                if ( !knowledgeCheck( args.exprKnowledge ) )
                    return false;
                return true;
            } );
        } );
    }
    
    // TODO: These test expressions and types are exactly the same as
    // those in the all-in-one tests for typeCheck(), betaReduce(),
    // and knownEqual(). See if we should put them in a shared
    // definition.
    
    // TODO: Add more thorough unit tests, exploring the impact of
    // non-empty environments, unsuccessful knowledge checks, and
    // such.
    
    var igno = "_";
    var unitType = [ "ttfa", "t", [ "tfa", igno, "t", "t" ] ];
    var unit = [ "ttfn", "t", [ "tfn", "x", "t", "x" ] ];
    var sfn = [ "sfn", igno, unitType, unit, unit ];
    
    add( unitType, unit );
    add( [ "tfa", igno, unitType, unitType ],
        [ "tfn", igno, unitType, unit ] );
    add( unitType,
        [ "tcall", igno, unitType, unitType,
            [ "tfn", "x", unitType, "x" ], unit ] );
    add( [ "ttfa", igno, unitType ], [ "ttfn", igno, unit ] );
    add( [ "tfa", igno, unitType, unitType ],
        [ "ttcall", "t", [ "tfa", igno, "t", "t" ],
            unit, unitType ] );
    add( unitType,
        [ "ttcall", igno, unitType,
            [ "ttfn", igno, unit ], unitType ] );
    add( [ "sfa", igno, unitType, unitType ], sfn );
    add( unitType, [ "fst", igno, unitType, unitType, sfn ] );
    add( unitType, [ "snd", igno, unitType, unitType, sfn ] );
})();
addShouldThrowUnitTest( function () {
    return knowledgeCheck( { env: strMap(),
        term: [ "nonexistentSyntax", "a", "b", "c" ] } );
} );
addShouldThrowUnitTest( function () {
    return knowledgeCheck( { env: strMap(),
        term: !"a boolean rather than a nested Array of strings" } );
} );


// ===== Unit test runner ============================================

(function () {
    var testsPassedInARow = 0;
    function resetTestsPassedInARow() {
        if ( testsPassedInARow !== 0 )
            console.log(
                "A streak of " + testsPassedInARow + " tests " +
                "passed." );
        testsPassedInARow = 0;
    }
    function run( i ) {
        if ( !(i < unitTests.length) ) {
            resetTestsPassedInARow();
            return;
        }
        var unitTest = unitTests[ i ];
        unitTest( function ( errorMessage ) {
            if ( errorMessage === null ) {
                testsPassedInARow++;
            } else {
                resetTestsPassedInARow();
                console.log( errorMessage );
            }
            run( i + 1 );
        } )
    }
    run( 0 );
})();
