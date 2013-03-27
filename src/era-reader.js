// era-reader.js
// Copyright 2013 Ross Angle. Released under the MIT License.


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
