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
}

var unitTests = [];
function addNaiveIsoUnitTest( body ) {
    // TODO: Stop using JSON.stringify() here. It might be good to
    // have a naiveStringify() function or something for custom
    // stringification.
    unitTests.push( function ( then ) {
        body( function ( calculated, expected ) {
            if ( naiveIso( calculated, expected ) )
                console.log( "Test passed." );
            else
                console.log(
                    "Expected this:\n" +
                    JSON.stringify( expected ) + "\n" +
                    "But got this:\n" +
                    JSON.stringify( calculated ) );
            then();
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
                console.log( "Test passed." );
            else
                console.log(
                    "This result was unexpected:\n" +
                    JSON.stringify( calculated ) );
            then();
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
// For now, we're just focusing on the deductive fragment. A more
// complete version of the grammar is available at
// <https://gist.github.com/4559120>. Also, it's worth noting that
// we're using s-expressions for the grammar.

// NOTE: For this version, we're taking the original grammar design
// and filling it out with lots of extra type annotations to make the
// type checker easy to write. Every function call expression must
// come with a full description of the function type it's calling.

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
            plus( recurUnder( "resultType", "arg" ) ).
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

function renameVarsToVars( renameMap, term ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    function recurWith( k, renameMap ) {
        return renameVarsToVars( renameMap, em.val.get( k ) );
    }
    function recur( k ) {
        return recurWith( k, renameMap );
    }
    function recurMinus( termK, argK ) {
        return recurWith( k,
            renameMap.minusEntry( em.val.get( argK ) ) );
    }
    
    var em;
    if ( isPrimString( term ) ) {
        if ( boundVars.has( term ) )
            return strMap();
        return strMap().plusTruth( term );
        
    } else if ( em = getMatch( term,
        [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        return [ "tfa", em.val.get( "arg" ), recur( "argType" ),
            recurMinus( "resultType", "arg" ) ];
        
    } else if ( em = getMatch( term,
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        return [ "tfn", em.val.get( "arg" ), recur( "argType" ),
            recurMinus( "result", "arg" ) ];
        
    } else if ( em = getMatch( term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        return [ "tcall", em.val.get( "argName" ), recur( "argType" ),
            recurMinus( "resultType", "arg" ),
            recur( "fn" ), recur( "argVal" ) ];
        
    } else if ( em = getMatch( term,
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        return [ "ttfa", em.val.get( "arg" ),
            recurMinus( "resultType", "arg" ) ];
        
    } else if ( em = getMatch( term,
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        return [ "ttfn", em.val.get( "arg" ),
            recurMinus( "result", "arg" ) ];
        
    } else if ( em = getMatch( term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        return [ "ttcall", em.val.get( "argName" ),
            recurMinus( "resultType", "argName" ),
            recur( "fn" ), recur( "argVal" ) ];
        
    } else if ( em = getMatch( term,
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        return [ "sfa", em.val.get( "arg" ), recur( "argType" ),
            recurMinus( "resultType", "argName" ) ];
        
    } else if ( em = getMatch( term, [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        return [ "sfa", em.val.get( "arg" ), recur( "argType" ),
            recur( "argVal" ), recurMinus( "resultVal", "arg" ) ];
        
    } else if ( em = getMatch( term, [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return [ "fst", em.val.get( "argName" ), recur( "argType" ),
            recurMinus( "resultType", "argName" ), recur( "fn" ) ];
        
    } else if ( em = getMatch( term, [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return [ "snd", em.val.get( "argName" ), recur( "argType" ),
            recurMinus( "resultType", "argName" ), recur( "fn" ) ];
        
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

function knownEqual( exprA, exprB, opt_boundVarsAToB ) {
    // Do a test of intrinsic equality, respecting alpha-equivalence.
    //
    // NOTE: When we support the observational subtyping fragment,
    // this should also respect proof-irrelevance, as described in
    // "Observational Equality, Now!"
    
    // NOTE: We assume exprA and exprB have already been beta-reduced.
    
    // NOTE: Even though we take exprA and exprB as env-term pairs, we
    // only use the terms.
    
    var aToB =
        opt_boundVarsAToB !== void 0 ? opt_boundVarsAToB : strMap();
    
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
    function recurWith( k, aToB ) {
        return knownEqual( aget( k ), bget( k ), aToB );
    }
    function recur( k ) {
        return recurWith( k, aToB );
    }
    function recurPlus( termK, argK ) {
        return recurWith( termK, aToB.plusEntry(
            am.val.get( argK ), bm.val.get( argK ) ) );
    }
    
    function aSucceeds( pattern ) {
        am = getMatch( exprA.term, pattern );
        if ( !am )
            return false;
        bm = getMatch( exprB.term, pattern );
        return true;
    }
    
    if ( isPrimString( exprA.term ) ) {
        if ( !isPrimString( exprB.term ) )
            return false;
        return aToB.has( exprA.term ) &&
            aToB.get( exprA.term ) === exprB.term;
        
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
        
        var result = renameVarsToVars( renameForward, reduced.term );
        env = env.plus( renameBackward.map( function ( origName ) {
            return env.get( origName );
        } ) );
        return result.term;
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
        
        var term = [ "sfn", em.val.get( "arg" ), argTypeTerm, argVal,
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
    } else {
        // TODO: Handle more language fragments.
        return false;
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
        // TODO: Figure out whether argType can have free variables at
        // this point.
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
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        var tm = getMatch( type.term,
            [ lit( "ttfa" ), str( "arg" ), "resultType" ] );
        if ( tm === null )
            return false;
        return typeCheck( eget( "result" ), tget( "resultType" ) );
        
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
        return false;
    }
}

addNaiveIsoUnitTest( function ( then ) {
    console.log(
        "Now we're testing the hand-rolled module checker." );
    
    then( getFreeVars( "foo" ), strMap().plusTruth( "foo" ) );
} );
addNaiveIsoUnitTest( function ( then ) {
    then( getFreeVars( [ "tfa", "a", "aType", "bType" ] ),
        strMap().plusArrTruth( [ "aType", "bType" ] ) );
} );
addNaiveIsoUnitTest( function ( then ) {
    // NOTE: This test is farfetched since there should be no existing
    // way to make (tfa a aType a) typecheck. It would require a way
    // to make `a` a value of `aType` and a type of its own
    // simultaneously.
    then( getFreeVars( [ "tfa", "a", "aType", "a" ] ),
        strMap().plusArrTruth( [ "aType" ] ) );
} );
addNaiveIsoUnitTest( function ( then ) {
    // NOTE: Again, there should be no existing way to make this term
    // typecheck.
    then( getFreeVars( [ "tfa", "a", "a", "a" ] ),
        strMap().plusArrTruth( [ "a" ] ) );
} );
addNaiveIsoUnitTest( function ( then ) {
    then( getFreeVars( [ "tfn", "a", "aType", "b" ] ),
        strMap().plusArrTruth( [ "aType", "b" ] ) );
} );
addNaiveIsoUnitTest( function ( then ) {
    then( getFreeVars( [ "tfn", "a", "aType", "a" ] ),
        strMap().plusArrTruth( [ "aType" ] ) );
} );
addNaiveIsoUnitTest( function ( then ) {
    then( getFreeVars( [ "tfn", "a", "a", "a" ] ),
        strMap().plusArrTruth( [ "a" ] ) );
} );


// ===== Unit test runner ============================================

(function () {
    function run( i ) {
        if ( !(i < unitTests.length) )
            return;
        var unitTest = unitTests[ i ];
        unitTest( function () {
            run( i + 1 );
        } )
    }
    run( 0 );
})();
