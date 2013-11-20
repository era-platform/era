// era-reader.js
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";


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
// $.infixState
// $.list
// $.end
// $.unrecognized

// The $.infixState object changes between four types as the reader
// goes through an infix expression:
//
// a .b c .d e
//
// {empty}
// {ready a}
// {infix1 a}
// {infix2 a b}
// {ready (b a c)}
// {infix1 (b a c)}
// {infix2 (b a c) d}
// {ready (d (b a c) e)}

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
function thenIfInfix( $ ) {
    if ( $.infixState.type !== "ready" )
        return false;
    $.then( { ok: true, val: $.infixState.val } );
    return true;
}
function continueInfix( $, val ) {
    if ( $.infixState.type === "empty" ) {
        reader( objPlus( $, {
            infixState: { type: "ready", val: val }
        } ) );
    } else if ( $.infixState.type === "ready" ) {
        throw new Error(
            "Read a second complete value before realizing this " +
            "wasn't an infix expression." );
    } else if ( $.infixState.type === "infix1" ) {
        reader( objPlus( $, {
            infixState:
                { type: "infix2", lhs: $.infixState.lhs, op: val }
        } ) );
    } else if ( $.infixState.type === "infix2" ) {
        reader( objPlus( $, {
            infixState: { type: "ready",
                val: [ $.infixState.op, $.infixState.lhs, val ] }
        } ) );
    } else {
        throw new Error();
    }
}
// NOTE: The readListUntilParen() function is only for use by the "("
// and "/" reader macros to reduce duplication.
function readListUntilParen( $, consumeParen ) {
    function sub( $, list ) {
        return objPlus( $, {
            list: list,
            readerMacros: $.readerMacros.plusEntry( ")",
                function ( $sub ) {
                
                if ( thenIfInfix( $sub ) )
                    return;
                
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
                    continueInfix( $, result );
                }
            } ),
            infixState: { type: "empty" },
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
var commandEndChars = "\r\n";
var whiteChars = " \t";

var readerMacros = strMap();
readerMacros.set( ";", function ( $ ) {
    function loop() {
        $.stream.readc( function ( c ) {
            if ( c === "" )
                return void $.end( $ );
            if ( /^[\r\n]$/.test( c ) )
                return void reader( $ );
            loop();
        } );
    }
    loop();
} );
addReaderMacros( readerMacros, commandEndChars, function ( $ ) {
    $.stream.readc( function ( c ) {
        if ( thenIfInfix( $ ) )
            return;
        reader( $ );
    } );
} );
addReaderMacros( readerMacros, whiteChars, function ( $ ) {
    $.stream.readc( function ( c ) {
        reader( $ );
    } );
} );
addReaderMacros( readerMacros, symbolChars, function ( $ ) {
    if ( thenIfInfix( $ ) )
        return;
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
                return void continueInfix( $, stringSoFar );
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
    if ( thenIfInfix( $ ) )
        return;
    readListUntilParen( $, !!"consumeParen" );
} );
readerMacros.set( "/", function ( $ ) {
    if ( thenIfInfix( $ ) )
        return;
    readListUntilParen( $, !"consumeParen" );
} );
readerMacros.set( ".", function ( $ ) {
    if ( $.infixState.type === "empty" ) {
        $.then( { ok: false, msg: "Infix expression without lhs" } );
    } else if ( $.infixState.type === "ready" ) {
        $.stream.readc( function ( c ) {
            reader( objPlus( $, {
                infixState: { type: "infix1", lhs: $.infixState.val }
            } ) );
        } );
    } else if ( $.infixState.type === "infix1" ) {
        $.then( { ok: false,
            msg: "Infix expression with duplicate dot" } );
    } else if ( $.infixState.type === "infix2" ) {
        $.then( { ok: false,
            msg: "Infix expression with dot after operator" } );
    } else {
        throw new Error();
    }
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
