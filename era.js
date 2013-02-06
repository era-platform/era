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
function objEachOwn( obj, body ) {
    for ( var k in obj )
        if ( {}.hasOwnProperty.call( obj, k ) )
            body( k, obj[ k ] );
}
function objPlus( var_args ) {
    var result = {};
    for ( var i = 0, n = arguments.length; i < n; i++ )
        objEachOwn( arguments[ i ], function ( k, v ) {
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

function StrMap() {
    this.contents_ = {};
};
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
StrMap.prototype.rem = function ( k ) {
    delete this.contents_[ this.mangle_( k ) ];
    return this;
};
StrMap.prototype.set = function ( k, v ) {
    this.contents_[ this.mangle_( k ) ] = v;
    return this;
};
StrMap.prototype.setObj = function ( obj ) {
    var self = this;
    objEachOwn( obj, function ( k, v ) {
        self.set( k, v );
    } );
    return this;
};
StrMap.prototype.plus = function ( other ) {
    if ( !(other instanceof StrMap) )
        throw new Error();
    var result = new StrMap();
    result.contents_ = objPlus( this.contents_, other.contents_ );
    return result;
};
StrMap.prototype.plusObj = function ( other ) {
    return this.plus( new StrMap().setObj( other ) );
};

function logJson( x ) {
    console.log( JSON.stringify( x ) );
}

var unitTests = [];


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
            readerMacros: $.readerMacros.plusObj( { ")":
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
            } } ),
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
var symbolChopsChars = new StrMap().setObj( { "(": ")", "[": "]" } );
var whiteChars = " \t\r\n";

var readerMacros = new StrMap();
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
    // than keeping a big array and concatenating later, but maybe
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

unitTests.push( function ( then ) {
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
            logJson( result );
            then();
        }
    } );
} );


// ===== Macroexpander ===============================================

// TODO: This section is extremely incomplete. Develop it further.

function macroexpand( macros, expr ) {
    if ( !(isArray( expr ) && 0 < expr.length) )
        return { ok: false, msg:
            "Can only macroexpand nonempty Arrays" };
    var op = expr[ 0 ];
    if ( !isPrimString( op ) )
        return { ok: false, msg:
            "Can only macroexpand Arrays with strings at the " +
            "beginning" };
    var macro = macros.get( op );
    if ( macro === void 0 )
        return { ok: false, msg: "Unknown macro " + op };
    return macro( macroexpand, macros, expr.slice( 1 ) );
}

var macros = new StrMap();
// TODO: This is just for getting started. Remove it.
macros.set( "log", function ( expand, macros, subexprs ) {
    if ( subexprs.length !== 1 )
        return { ok: false, msg: "Incorrect number of args to log" };
    var msg = subexprs[ 0 ];
    if ( !isPrimString( msg ) )
        return { ok: false, msg: "Incorrect args to log" };
    logJson( msg );
    return { ok: true, val: [ "noop" ] };
} );

unitTests.push( function ( then ) {
    logJson( macroexpand( macros, [ "log", "hello" ] ) );
    defer( function () {
        then();
    } );
} );


// ===== Alppha-equivalent pattern matching ==========================

function makeAlphaGrammar( spec ) {
    var n = spec.length;
    
    // Validate.
    var names = new StrMap();
    for ( var i = 0; i < n; i++ ) {
        var specPart = spec[ i ];
        if ( !isPrimString( specPart ) )
            continue;
        if ( names.has( specPart ) )
            throw new Error(
                "Can't have duplicate names in a makeAlphaGrammar " +
                "spec" );
        names.set( specPart, true );
    }
    var depMaps = {};
    for ( var i = 0; i < n; i++ ) {
        var specPart = spec[ i ];
        if ( !isArray( specPart ) )
            continue;
        var depMap = depMaps[ i ] = new StrMap();
        for ( var j = 0, m = specPart.length; j < m; j++ ) {
            var dep = specPart[ j ];
            if ( !(isPrimString( dep ) && names.has( dep )) )
                throw new Error(
                    "Invalid term dependency in makeAlphaGrammar" );
            if ( depMap.has( dep ) )
                throw new Error(
                    "Duplicate term dependency in makeAlphaGrammar" );
            depMap.set( dep, true );
        }
    }
    
    return function ( matcher, alphaGrammars, freeVars, termParams ) {
        if ( termParams.length !== n )
            return { ok: false, msg: "Mismatched length" };
        var bindings = new StrMap();
        for ( var i = 0; i < n; i++ ) {
            var specPart = spec[ i ];
            var termPart = term[ i ];
            if ( !isPrimString( specPart ) )
                continue;
            if ( !isString( termPart ) )
                return { ok: false, msg: "Expected a variable" };
            bindings.set( specPart, termPart );
        }
        // TODO: Figure out what should really be part of a match.
        var fullMatch = {
            boundTrees: new StrMap(),
            boundVars: new StrMap()
        };
        for ( var i = 0; i < n; i++ ) {
            var specPart = spec[ i ];
            var termPart = term[ i ];
            if ( !isArray( specPart ) )
                continue;
            // TODO: Implement mask().
            // TODO: Decide if this is really going to be the format
            // of freeVars.
            var submatch = matcher( alphaGrammars,
                freeVars.plus( bindings.mask( depMaps[ i ] ) ),
                termPart );
            if ( !submatch.ok )
                return submatch;
            // TODO: Handle a successful match.
        }
        return { ok: true, val: fullMatch };
    };
}

var alphaGrammars = new StrMap();
// TODO: This is just for getting started. Remove it.
alphaGrammars.set( "fn", makeAlphaGrammar( [ "x", [ "x" ] ] ) );

// TODO: Write a unit test.


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
