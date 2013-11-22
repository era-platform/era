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
// $.heedsCommandEnds
// $.infixLevel
// $.infixState
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
function bankInfix( $, minInfixLevel ) {
    var result = $.infixState.type === "ready" &&
        minInfixLevel <= $.infixLevel;
    if ( result )
        $.then( { ok: true, val: $.infixState.val } );
    return result;
}
function bankCommand( $ ) {
    var result = $.infixState.type === "ready" && $.heedsCommandEnds;
    if ( result )
        $.then( { ok: true, val: $.infixState.val } );
    return result;
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
    } else {
        throw new Error();
    }
}
// NOTE: The readListUntilParen() function is only for use by the "("
// and "/" reader macros to reduce duplication.
function readListUntilParen( $, consumeParen ) {
    function sub( $, list ) {
        return objPlus( $, {
            heedsCommandEnds: false,
            list: list,
            readerMacros: $.readerMacros.plusEntry( ")",
                function ( $sub ) {
                
                if ( bankInfix( $sub, 0 ) )
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
            infixLevel: 0,
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
    if ( bankCommand( $ ) )
        return;
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
    if ( bankCommand( $ ) )
        return;
    $.stream.readc( function ( c ) {
        reader( $ );
    } );
} );
addReaderMacros( readerMacros, whiteChars, function ( $ ) {
    $.stream.readc( function ( c ) {
        reader( $ );
    } );
} );
addReaderMacros( readerMacros, symbolChars, function ( $ ) {
    if ( bankInfix( $, 0 ) )
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
    if ( bankInfix( $, 0 ) )
        return;
    readListUntilParen( $, !!"consumeParen" );
} );
readerMacros.set( "/", function ( $ ) {
    if ( bankInfix( $, 0 ) )
        return;
    readListUntilParen( $, !"consumeParen" );
} );
function defineInfixOperator(
    ch, level, noLhsErr, incompleteErr, readRemaining ) {
    
    readerMacros.set( ch, function ( $ ) {
        if ( bankInfix( $, level ) )
            return;
        if ( $.infixState.type === "empty" ) {
            $.then( { ok: false, msg: noLhsErr } );
        } else if ( $.infixState.type === "ready" ) {
            var lhs = $.infixState.val;
            var origHeedsCommandEnds = $.heedsCommandEnds;
            var $sub1 = objPlus( $, {
                infixState: { type: "empty" }
            } );
            $sub1.stream.readc( function ( c ) {
                function read( heedsCommandEnds, then ) {
                    reader( objPlus( $sub1, {
                        heedsCommandEnds:
                            origHeedsCommandEnds && heedsCommandEnds,
                        infixLevel: level,
                        infixState: { type: "empty" },
                        then: function ( result ) {
                            if ( !result.ok )
                                return void $sub1.then( result );
                            then( result.val );
                        },
                        end: function ( $sub2 ) {
                            if ( $sub2.infixState.type === "ready" )
                                $sub2.then( { ok: true,
                                    val: $sub2.infixState.val } );
                            else
                                $sub2.then( { ok: false,
                                    msg: incompleteErr } );
                        }
                    } ) );
                }
                readRemaining( lhs, read, function ( result ) {
                    continueInfix( $sub1, result );
                } );
            } );
        } else {
            throw new Error();
        }
    } );
}
defineInfixOperator( ":", 1,
    "Tertiary infix expression without lhs",
    "Incomplete tertiary infix expression",
    function ( lhs, read, then ) {
    
    // NOTE: We support top-level code like the following by disabling
    // heedsCommandEnds when reading the operator:
    //
    //  a :b
    //      .c d
    //
    // This is a weird thing to support, but heedsCommandEnds should
    // always be disabled in contexts where it's obvious the command
    // is incomplete and could be completed.
    //
    read( !"heedsCommandEnds", function ( op ) {
        read( !!"heedsCommandEnds", function ( rhs ) {
            then( [ op, lhs, rhs ] );
        } );
    } );
} );
defineInfixOperator( ".", 2,
    "Binary infix expression without lhs",
    "Incomplete binary infix expression",
    function ( lhs, read, then ) {
    
    read( !!"heedsCommandEnds", function ( rhs ) {
        then( [ lhs, rhs ] );
    } );
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
