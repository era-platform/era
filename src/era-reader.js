// era-reader.js
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";

// This is a reader for Era's own dialect of s-expressions.

// To make string literals convenient, we implement an interpolated
// string syntax according to the following design sketch:
//
// reader macro \ followed by ( will read a string terminated by ),
//   and it results in the string contents, which means a list of
//   strings interspersed with other values, and then it will
//   postprocess whitespace as described further below
// reader macro \ followed by [ will read a string terminated by ],
//   and it results in the string contents, which means a list of
//   strings interspersed with other values, and then it will
//   postprocess whitespace as described further below
// any raw Unicode code point except space, tab, carriage return,
//   newline, \, (, ), [, and ] is used directly and has no other
//   meaning
// whitespace tokens:
//   \s means a single space
//   \t means a tab
//   \r means a carriage return
//   \n means a newline
//   \# means empty string
// non-whitespace tokens:
//   \- means backslash
//   ( reads a string terminated by ) and means the contents of that
//     string plus both brackets, without postprocessing whitespace
//   [ reads a string terminated by ] and means the contents of that
//     string plus both brackets, without postprocessing whitespace
//   \( reads a string terminated by ) while boosting the
//     quasiquotation depth by 1, and it means the contents of the
//     string plus both brackets, without postprocessing whitespace
//   \[ reads a string terminated by ] while boosting the
//     quasiquotation depth by 1, and it means the contents of the
//     string plus both brackets, without postprocessing whitespace
//   ) is an error unless it terminates the current string reader
//   ] is an error unless it terminates the current string reader
//   \< means left square bracket
//   \> means right square bracket
//   \{ means left parenthesis
//   \} means right parenthesis
//   \; followed by the rest of a line means empty string (for
//     comments)
//   \_ followed by a non-infix s-expression followed by . is that
//     s-expression; this is one of the "other values" interspersed
//     with actual strings in the result
//     // NOTE: The reason we choose the character . here is that it's
//     // already an infix operator, so it will be left behind by a
//     // non-infix s-expression. The reason we have a terminating
//     // character at all is so the s-expression reader can consume
//     // all the whitespace before that, leaving the whitespace
//     // after that for the string reader to process.
//   \u followed by 1-6 uppercase hexadecimal digits followed by .
//     means the appropriate Unicode code point, unless it's a code
//     point value outside the Unicode range or reserved for UTF-16
//     surrogates, in which case it's an error
//     // NOTE: The reason we choose the character . here is for
//     // consistency with the \_ escape sequence. The reason we have
//     // a terminating character at all is so the following character
//     // can be a hex digit without ambiguity.
// postprocess whitespace according to the following rules:
//   - remove all raw whitespace adjacent to the ends of the string
//   - remove all raw whitespace adjacent to whitespace escapes
//   - replace every remaining occurrence of one or more raw
//     whitespace characters with a single space
//
// The quasiquotation depth is a nonnegative integer that's usually 0.
// All \ escape sequences except \( and \[ actually vary depending on
// this depth. They really begin with \ followed by a number of ,
// equal to the depth. For instance, at a depth of 2, the \n escape
// sequence must actually be written as \,,n in the code. If any of
// these escape sequences other than \_ appears with fewer commas than
// the depth, it's still parsed the same way, but the result is the
// unprocessed text.
//
// If the escape sequence \_ appears with fewer commas than the depth,
// that's an error. Someday we may treat it the same way as the other
// escape sequences, but this would make the steep assumption that the
// code being generated shares Penknife's complete expression syntax,
// rather than just sharing its string syntax.
//
// TODO: Actually that's not such an unreasonable assumption. After
// all, the programmer uses the \[ escape sequence if they want to
// generate string code that's like Penknife string code, and they
// can potentially use \_ to generate interpolated expression code
// that's like Penknife interpolated expression code. We should
// probably support this. To do so, we'll need every Penknife reader
// behavior to sometimes return the raw string it consumed, rather
// than returning an expression or other result.


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
    eachUnicodeCodePoint( string, function ( codePointInfo ) {
        readerMacros.set( codePointInfo.charString, func );
    } );
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

function postprocessWhitespace( stringParts ) {
    // Remove all raw whitespace adjacent to the ends of the string
    // and adjacent to whitespace escapes.
    function removeAfterStartOrExplicitWhitespace( parts ) {
        var parts2 = [];
        var removing = true;
        arrEach( parts, function ( part ) {
            if ( part.type === "interpolation" ) {
                parts2.push( part );
                removing = false;
            } else if ( part.type === "rawWhite" ) {
                if ( !removing )
                    parts2.push( part );
            } else if ( part.type === "explicitWhite" ) {
                parts2.push( part );
                removing = true;
            } else if ( part.type === "nonWhite" ) {
                parts2.push( part );
                removing = false;
            } else {
                throw new Error();
            }
        } );
        return parts2;
    }
    var stringParts2 = removeAfterStartOrExplicitWhitespace(
        stringParts ).reverse();
    var stringParts3 = removeAfterStartOrExplicitWhitespace(
        stringParts2 ).reverse();
    
    // Replace every remaining occurrence of one or more raw
    // whitespace characters with a single space. Meanwhile, drop the
    // distinction between raw whitespace, explicit whitespace, and
    // non-whitespace text.
    var resultParts = [];
    var currentText = "";
    var removing = true;
    arrEach( stringParts3, function ( part ) {
        if ( part.type === "interpolation" ) {
            resultParts.push(
                { type: "text", text: currentText },
                { type: "interpolation", val: part.val } );
            currentText = "";
            removing = false;
        } else if ( part.type === "rawWhite" ) {
            if ( !removing ) {
                currentText += " ";
                removing = true;
            }
        } else if ( part.type === "explicitWhite" ) {
            currentText += part.text;
            removing = false;
        } else if ( part.type === "nonWhite" ) {
            currentText += part.text;
            removing = false;
        } else {
            throw new Error();
        }
    } );
    resultParts.push( { type: "text", text: currentText } );
    return { type: "interpolatedString", parts: resultParts };
}

function ignoreRestOfLine( $ ) {
    $.stream.peekc( function ( c ) {
        if ( c === "" )
            $.end( $ );
        else if ( /^[\r\n]$/.test( c ) )
            reader( $ );
        else
            $.stream.readc( function ( c ) {
                ignoreRestOfLine( $ );
            } );
    } );
}

var readerMacros = strMap();
readerMacros.set( ";", function ( $ ) {
    if ( bankCommand( $ ) )
        return;
    ignoreRestOfLine( $ );
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
readerMacros.set( "\\", function ( $ ) {
    if ( bankInfix( $, 0 ) )
        return;
    $.stream.readc( function ( c ) {
        reader( objPlus( $, {
            readerMacros: symbolChopsChars.map(
                function ( closeBracket, openBracket ) {
                
                return function ( $sub ) {
                    readStringUntilBracket( closeBracket, 0,
                        objPlus( $, {
                        
                        then: function ( result ) {
                            if ( result.ok )
                                $.then( { ok: true,
                                    val: postprocessWhitespace(
                                        result.val ) } );
                            else
                                $.then( result );
                        }
                    } ) );
                };
            } ),
            unrecognized: function ( $sub ) {
                $.then( { ok: false,
                    msg: "Unrecognized string opening character" } );
            },
            end: function ( $sub ) {
                $.then( { ok: false, msg: "Incomplete string" } );
            }
        } ) );
    } );
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

function readStringUntilBracket( bracket, qqDepth, $ ) {
    function sub( $, string ) {
        return objPlus( $, {
            string: string,
            qqDepth: qqDepth,
            readerMacros: stringReaderMacros.plusEntry( bracket,
                function ( $sub ) {
                
                $sub.stream.readc( function ( c ) {
                    var result = [];
                    for ( var string = $sub.string;
                        string !== null; string = string.past )
                        result = string.last.concat( result );
                    $.then( { ok: true, val: result } );
                } );
            } ),
            unrecognized: function ( $sub2 ) {
                $sub2.stream.readc( function ( c ) {
                    $sub2.then( { ok: true,
                        val: [ { type: "nonWhite", text: c } ] } );
                } );
            },
            end: function ( $sub ) {
                $.then( { ok: false, msg: "Incomplete string" } );
            },
            then: function ( result ) {
                if ( result.ok )
                    reader(
                        sub(
                            $, { past: string, last: result.val } ) );
                else
                    $.then( result );
            }
        } );
    }
    $.stream.readc( function ( c ) {
        reader( sub( $, null ) );
    } );
}

var stringReaderMacros = strMap();
stringReaderMacros.setAll( strMap().setObj( {
    " ": " ",
    "\t": "\t",
    "\r": "\r",
    "\n": "\n"
} ).map( function ( text ) {
    return function ( $ ) {
        $.stream.readc( function ( c ) {
            $.then( { ok: true,
                val: [ { type: "rawWhite", text: text } ] } );
        } );
    };
} ) );
symbolChopsChars.each( function ( openBracket, closeBracket ) {
    stringReaderMacros.set( openBracket, function ( $ ) {
        readStringUntilBracket( closeBracket, $.qqDepth, objPlus( $, {
            then: function ( result ) {
                if ( result.ok )
                    $.then( { ok: true, val: [].concat(
                        { type: "nonWhite", text: openBracket },
                        result.val,
                        { type: "nonWhite", text: closeBracket }
                    ) } );
                else
                    $.then( result );
            }
        } ) );
    } );
    stringReaderMacros.set( closeBracket, function ( $ ) {
        $.then( { ok: false,
            msg: "Unmatched " + closeBracket + " in string" } );
    } );
} );
stringReaderMacros.set( "\\", function ( $ ) {
    function readForEscQqDepth( escStart, escQqDepth ) {
        reader( objPlus( $, {
            readerMacros: strMap().setAll( strMap().setObj( {
                "s": " ",
                "t": "\t",
                "r": "\r",
                "n": "\n",
                "#": ""
            } ).map( function ( text, escName ) {
                return function ( $sub ) {
                    $.stream.readc( function ( c ) {
                        $.then( { ok: true, val:
                            escQqDepth < $.qqDepth ?
                                [ { type: "nonWhite",
                                    text: escStart + escName } ] :
                                [ { type: "explicitWhite",
                                    text: text } ]
                        } );
                    } );
                };
            } ) ).setAll( strMap().setObj( {
                "-": "\\",
                "<": "[",
                ">": "]",
                "{": "(",
                "}": ")"
            } ).map( function ( text, escName ) {
                return function ( $sub ) {
                    $.stream.readc( function ( c ) {
                        $.then( { ok: true, val:
                            escQqDepth < $.qqDepth ?
                                [ { type: "nonWhite",
                                    text: escStart + escName } ] :
                                [ { type: "nonWhite", text: text } ]
                        } );
                    } );
                };
            } ) ).setAll( symbolChopsChars.map(
                function ( closeBracket, openBracket ) {
                
                return function ( $sub ) {
                    if ( $.qqDepth !== 0 )
                        return void $.then( { ok: false, msg:
                            "Used a string-within-a-string escape " +
                            "sequence with an unquote level other " +
                            "than zero" } );
                    
                    readStringUntilBracket(
                        closeBracket,
                        $.qqDepth + 1,
                        objPlus( $, {
                        
                        then: function ( result ) {
                            if ( result.ok )
                                $.then( { ok: true, val: [].concat(
                                    { type: "nonWhite", text:
                                        escStart + openBracket },
                                    result.val,
                                    { type: "nonWhite",
                                        text: closeBracket }
                                ) } );
                            else
                                $.then( result );
                        }
                    } ) );
                };
            } ) ).setObj( {
                ";": function ( $sub ) {
                    if ( $.qqDepth <= escQqDepth )
                        return void ignoreRestOfLine( $ );
                    
                    function readRestOfLine( soFar, $ ) {
                        $.stream.peekc( function ( c ) {
                            if ( c === "" )
                                $.end( $ );
                            else if ( /^[\r\n]$/.test( c ) )
                                $.then( { ok: true, val:
                                    [ { type: "nonWhite",
                                        text: escStart + soFar } ]
                                } );
                            else
                                $.stream.readc( function ( c ) {
                                    readRestOfLine( soFar + c, $ );
                                } );
                        } );
                    }
                    readRestOfLine( "", $ );
                },
                "_": function ( $ ) {
                    if ( escQqDepth < $.qqDepth )
                        return void $.then( { ok: false, msg:
                            "Tried to interpolate in a " +
                            "string-within-a-string" } );
                    
                    $.stream.readc( function ( c ) {
                        reader( objPlus( $, {
                            heedsCommandEnds: false,
                            infixLevel: 3,
                            infixState: { type: "empty" },
                            readerMacros: readerMacros,
                            unrecognized: function ( $ ) {
                                // TODO: See if we can make this error
                                // message, the error message in
                                // penknife.html, and the error
                                // message in test-reader.js use the
                                // same code. Also, see if these
                                // should all use a bankInfix line
                                // like the following.
//                                if ( bankInfix( $, 0 ) )
//                                    return;
                                $.then( { ok: false, msg:
                                    "Encountered an unrecognized " +
                                    "character" } );
                            },
                            end: function ( $ ) {
                                if ( $.infixState.type === "ready" )
                                    $.then( { ok: true,
                                        val: $.infixState.val } );
                                else
                                    $.then( { ok: false, msg:
                                        "Incomplete interpolation " +
                                        "in string" } );
                            },
                            then: function ( result ) {
                                if ( !result.ok )
                                    return void $.then( result );
                                $.stream.readc( function ( c ) {
                                    if ( c === "." )
                                        $.then( { ok: true, val: [ {
                                            type: "interpolation",
                                            val: result.val
                                        } ] } );
                                    else
                                        $.then( { ok: false, val:
                                            "Didn't end a string " +
                                            "interpolation with a " +
                                            "dot" } );
                                } );
                            }
                        } ) );
                    } );
                },
                "u": function ( $ ) {
                    $.stream.readc( function ( c ) {
                        loop( "", 6 );
                        function loop( hexSoFar, digitsLeft ) {
                            $.stream.readc( function ( c ) {
                                if ( c === "" )
                                    $.then( { ok: false, msg:
                                        "Incomplete Unicode escape"
                                    } );
                                else if ( c === "." )
                                    next( hexSoFar );
                                else if ( digitsLeft === 0 )
                                    $.then( { ok: false, msg:
                                        "Unterminated Unicode escape"
                                    } );
                                else if ( /^[01-9A-F]$/.test( c ) )
                                    loop( hexSoFar + c,
                                        digitsLeft - 1 );
                                else
                                    $.then( { ok: false, msg:
                                        "Unrecognized character in " +
                                        "Unicode escape" } );
                            } );
                        }
                        function next( hex ) {
                            if ( hex.length === 0 )
                                return void $.then( { ok: false, msg:
                                    "Unicode escape with no digits"
                                } );
                            console.log( hex.length );
                            var text = unicodeCodePointToString(
                                parseInt( hex, 16 ) );
                            if ( text === null )
                                return void $.then( { ok: false, msg:
                                    "Unicode escape out of range" } );
                            $.then( { ok: true, val:
                                escQqDepth < $.qqDepth ?
                                    [ { type: "nonWhite", text:
                                        escStart + hex + "." } ] :
                                    [ { type: "nonWhite",
                                        text: text } ]
                            } );
                        }
                    } );
                },
                ",": function ( $sub ) {
                    if ( $.qqDepth <= escQqDepth )
                        return void $.then( { ok: false, msg:
                            "Unquoted past the quasiquotation " +
                            "depth" } );
                    
                    $.stream.readc( function ( c ) {
                        readForEscQqDepth(
                            escStart + ",", escQqDepth + 1 );
                    } );
                }
            } ),
            unrecognized: function ( $sub ) {
                $.then( { ok: false,
                    msg: "Unrecognized escape sequence" } );
            },
            end: function ( $sub ) {
                $.then( { ok: false,
                    msg: "Incomplete escape sequence" } );
            }
        } ) );
    }
    $.stream.readc( function ( c ) {
        readForEscQqDepth( "\\", 0 );
    } );
} );


function stringStream( string ) {
    if ( !isValidUnicode( string ) )
        throw new Error();
    var i = 0, n = string.length;
    function readOrPeek( isReading, then ) {
        defer( function () {
            if ( n <= i )
                return void then( "" );
            var charCodeInfo =
                getUnicodeCodePointAtCodeUnitIndex( string, i );
            var result = charCodeInfo.charString;
            if ( isReading )
                i += result.length;
            then( result );
        } );
    }
    var stream = {};
    stream.peekc = function ( then ) {
        readOrPeek( !"isReading", then );
    };
    stream.readc = function ( then ) {
        readOrPeek( !!"isReading", then );
    };
    return stream;
}
