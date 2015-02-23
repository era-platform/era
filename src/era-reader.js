// era-reader.js
// Copyright 2013-2015 Ross Angle. Released under the MIT License.
"use strict";

// This is a reader for Era's own dialect of s-expressions.

// TODO: Reimplement almost all of the reader to fit the following
// description. The design has changed immensely.
//
// In the design of the string literal syntax, we have a few use cases
// in mind:
//
//   - Story: As a programmer who uses a text-based programming
//     language, namely this one, I'd like to generate code sometimes.
//     In fact, I'd like to generate code to generate code, and so on.
//
//     - Problem: Most string syntaxes frustrate me because they
//       require me to write escape sequences in my code. Different
//       stages of generated code look completely different because I
//       have to write escape sequences for my escape sequences. Since
//       they look so different, I can't easily refactor my project in
//       ways that add or remove stages.
//
//     - Solution: This string syntax uses escape sequences
//       \-qq-md[...] and \-qq-2d[...] that looks exactly like the
//       string syntaxes themselves, and the sole purpose of this
//       escape sequence is for generating code that contains this
//       string syntax. Escape sequences occurring inside these
//       brackets are suppressed, so \-lf generates "\-lf" rather than
//       a newline, and so on. Thanks to this, every stage of
//       generated code looks almost entirely the same.
//
//     - Problem: The escape sequence \-qq-md[...] generates both
//       "\-qq-md[" and "]" in a single string, and sometimes I want
//       to insert a value in the middle. I could write this as a
//       concatenation bookended by one string that escapes \-qq-md[
//       as \-.-qq-md\-< and one that escapes ] as \-> but I'd rather
//       not make such a pervasive syntax replacement for such a
//       focused insertion.
//
//     - Solution: There's an interpolation escape sequence
//       \-uq-ls[expression-goes-here] which lets s-expressions be
//       interspersed with other string parts at read time.
//
//     - Problem: Wouldn't that be suppressed like any other escape
//       sequence inside the \-qq-md[...] boundaries?
//
//     - Solution: All \- escape sequences can actually be
//       un-suppressed any number of levels by writing things like
//       \-uq-uq-uq-uq-ls[...] for example. The escape sequence
//       \-uq-ls[...] is actually \-ls modified by \-uq, and
//       \-qq-md[...] is \-md modified by \-qq. The function of \-qq
//       and \-uq is to suppress and un-suppress escape sequences
//       respectively. (Their interaction is known as quasiquotation.)
//       Since the number of iterated \-uq modifiers corresponds to
//       the number of stages *between* the code-generator stage and
//       the target stage, it will tend to remain stable even if the
//       code is refactored to add or remove early or late stages.
//
//   - As a programmer whose programs contain error messages and
//     documentation, I'd like to write long strings of
//     natural-language prose.
//
//     - Problem: In most programming languages, if I want to be picky
//       about whitespace in a long string, then I have to make sure
//       not to insert any whitespace that I don't want the string to
//       contain. This gets in my way when I want to use indentation
//       and line breaks that match the surrounding code style.
//
//     - Solution: The \-qq-md[...] string syntax collapses all
//       verbatim whitespace. It also has whitespace escapes for local
//       cases when that behavior is unwanted, such as blank lines
//       between natural-language paragraphs.
//
//     - Problem: Sometimes I do want to be picky about whitespace,
//       such as when I'm writing my natural-language prose in some
//       kind of markdown format.
//
//     - Solution: The \-qq-2d[...] string syntax does not collapse
//       whitespace, so it can be used instad of \-qq-md[...] in that
//       case.
//
// The design we've settled on at this point is the following:
//
// When reading an s-expression at a quasiquotation depth greater than
//   zero, most syntaxes are trivialized. The reader supports these
//   syntaxes:
//
//   any Unicode code point except ; \ ( ) [ and ]
//   ; reads until it peeks the end of the line or document
//   ) or ] is an error if unmatched
//   ( or [ reads a trivialized s-expression terminated by ) or ]
//     respectively
//   \ reads any \- string escape sequence omitting the \
//
// When reading an s-expression at a quasiquotation depth of zero,
//   these syntaxes are available, including *infix* syntaxes:
//
//   most characters are errors
//   space, tab, or newline ignores itself
//   ; reads until it peeks the end of the line or document, and it
//     ignores it all (for comments)
//   \-rm (or any other \- string escape sequence which ends up
//     meaning \-rm with a quasiquotation depth of zero) reads a
//     delimited string, and it ignores it all (for comments)
//   ASCII letters a-z, ASCII letters a-z, ASCII digits 1-9, 0 - or *
//     reads any number of characters in this set and means a string
//   ( or [ reads any number of s-expressions followed by ) or ] and
//     it means a list of those s-expressions
//   / reads any number of s-expressions until it peeks ) or ] and it
//     means a list of those s-expressions
//   . consumes a previously read s-expression, and it reads a second
//     s-expression without . or < infix support and means a
//     two-element list
//   < consumes a previously read s-expression, then reads a second
//     s-expression (with full infix support), then reads > followed
//     by a third s-expression with no < infix support, and it means
//     the three-element list of the second, first, and third
//     s-expressions in that rearranged order
//   \-qq-md (or any other \- string escape sequence which ends up
//     meaning \-md with a quasiquotation depth of one) reads a
//     delimited string, and it means the whitespace-post-processed
//     string, but it's an error for any escape sequence inside to
//     have a quasiquotation depth of zero unless it's an \-ls
//   \-qq-2d (or any other \- string escape sequence which ends up
//     meaning \-2d with a quasiquotation depth of one) reads a
//     delimited string, and it means the whitespace-preserved string,
//     but it's an error for any escape sequence inside to have a
//     quasiquotation depth of zero unless it's an \-ls
//   // NOTE: A string's contents are not only text but also any
//   // string interpolations occurring in the string.
//
// If any syntax is delimited, it means this:
//
//   ; reads the syntax until it peeks the end of the line or document
//   / reads the syntax until it peeks ) or ]
//   ( or [ reads the syntax until it reads ) or ] respectively
//
// In a string, we have the following syntaxes:
//
// raw whitespace tokens:
//   space, tab, or newline
// explicit whitespace tokens:
//   \-sp means a space
//   \-tb means a tab
//   \-cr means a carriage return
//   \-lf means a newline
//   \-es means empty string
// tokens with indeterminate whitespace quality:
//   \-rm reads a delimited string and means empty string (for
//     comments), and it does *not* obstruct raw whitespace on one
//     side from being adjacent to things on the other side for the
//     purpose of whitespace post-processing
// non-whitespace tokens:
//   any Unicode code point except space, tab, carriage return,
//     newline, \ ( ) [ and ]
//   \-. means backslash
//   \-< or \-> means left or right square bracket, respectively
//   \-{ or \-} means left or right parenthesis, respectively
//   ) or ] is an error if unmatched
//   ( or [ reads a string terminated by ) or ] respectively, and it
//     means the contents of this entire escape sequence, to be
//     whitespace-normalized by the current whitespace normalization
//     policy
//   \-ch reads a delimited sequence of 1-6 uppercase hexadecimal
//     digits and means the appropriate Unicode code point, but
//     there's an error if the code point is outside the Unicode range
//     or reserved for UTF-16 surrogates
//     // NOTE: The reason we use delimiters here is so the following
//     // character can be a hex digit without ambiguity.
//   \-qq reads any \- escape sequence omitting the \ and interprets
//     that sequence according to the current quasiquotation depth
//     plus one
//   \-uq reads any \- escape sequence omitting the \ and interprets
//     that sequence according to the current quasiquotation depth
//     minus one
//   \-sv reads a delimited, non-interpolated string
//     whitespace-normalized according to the current whitespace
//     normalization policy, and then it reads any \- escape sequence
//     omitting the \ and interprets that sequence with the given
//     quasiquotation label bound to a fresh view of the current
//     quasiquotation depth
//   \-to reads a delimited, non-interpolated string
//     whitespace-normalized according to the current whitespace
//     normalization policy, and then it reads any \- escape sequence
//     omitting the \ and interprets that sequence according to the
//     quasiquotation depth rewound just past the given quasiquotation
//     label and deeming all labels rewound past this way to be
//     non-fresh, but there's an error if the target label is unbound
//     or if it's not fresh
//   \-md reads a delimited string, and it means the contents of that
//     string whitespace-normalized by the current whitespace
//     normalization policy, plus the remaining parts of this entire
//     escape sequence, but converting a / delimiter to [ ] or ( )
//     if the encountered closing bracket is not already going to be
//     part of the encompassing string
//   \-2d reads a delimited string, and it means the
//     whitespace-preserved contents of that string plus the remaining
//     parts of this entire escape sequence but converting a /
//     delimiter to [ ] or ( ) if the encountered closing bracket is
//     not already going to be part of the encompassing string
//   \-ls reads a delimited s-expression and means an interpolation
//
// post-process whitespace according to the following rules, except
// during quasiquotation levels where the whitespace normalization
// policy is to preserve whitespace:
//   - remove all raw whitespace adjacent to the ends of the string
//   - remove all raw whitespace adjacent to explicit whitespace
//     escapes
//   - replace every remaining occurrence of one or more raw
//     whitespace characters with a single space


// $.stream.underlyingStream
// $.stream.getCaptured
// $.stream.readc
// $.stream.peekc
// $.heedsCommandEnds
// $.infixLevel
// $.infixState
// $.qqDepth
// $.readerMacros
// $.unrecognized
// $.end

function streamReadc( $, then ) {
    $.stream.readc( function ( stream, c ) {
        then( objPlus( $, { stream: stream } ), c );
    } );
}

function reader( $, then ) {
    $.stream.peekc( function ( c ) {
        if ( c === "" )
            return void $.end( $, then );
        var readerMacro = $.readerMacros.get( c );
        if ( readerMacro === void 0 )
            return void $.unrecognized( $, then );
        readerMacro( $, then );
    } );
}

function readerLet( $, props, then ) {
    reader( objPlus( $, props ), function ( $sub, result ) {
        then( objPlus( $sub, objOwnMap( props, function ( k, v ) {
            return $[ k ];
        } ) ), result );
    } );
}

function addReaderMacros( readerMacros, string, func ) {
    eachUnicodeCodePoint( string, function ( codePointInfo ) {
        readerMacros.set( codePointInfo.charString, func );
    } );
}
function bankInfix( $, minInfixLevel, then ) {
    var result = $.infixState.type === "ready" &&
        minInfixLevel <= $.infixLevel;
    if ( result )
        then( objPlus( $, {
            infixState: { type: "empty" }
        } ), { ok: true, val: $.infixState.val } );
    return result;
}
function bankCommand( $, then ) {
    var result = $.infixState.type === "ready" && $.heedsCommandEnds;
    if ( result )
        then( objPlus( $, {
            infixState: { type: "empty" }
        } ), { ok: true, val: $.infixState.val } );
    return result;
}
function continueInfix( $, val, then ) {
    if ( $.infixState.type === "empty" ) {
        reader( objPlus( $, {
            infixState: { type: "ready", val: val }
        } ), then );
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
function readListUntilParen( $, consumeParen, then ) {
    function loop( $, list ) {
        readerLet( $, {
            heedsCommandEnds: false,
            infixLevel: 0,
            infixState: { type: "empty" },
            readerMacros: $.readerMacros.plusEntry( ")",
                function ( $, then ) {
                
                if ( bankInfix( $, 0, then ) )
                    return;
                
                if ( consumeParen )
                    streamReadc( $, function ( $, c ) {
                        next( $ );
                    } );
                else
                    next( $ );
                
                function next( $ ) {
                    // TODO: Make this trampolined with constant time
                    // between bounces. This might be tricky because
                    // it's stateful.
                    var result = [];
                    for ( var ls = list; ls !== null; ls = ls.past )
                        result.unshift( ls.last );
                    then( $, { ok: true, val:
                        { type: "freshlyCompletedCompound",
                            val: result } } );
                }
            } ),
            end: function ( $, then ) {
                then( $, { ok: false, msg: "Incomplete list" } );
            }
        }, function ( $, result ) {
            if ( !result.ok )
                return void then( $, result );
            
            if ( likeObjectLiteral( result.val )
                && result.val.type === "freshlyCompletedCompound" )
                continueInfix( $, result.val.val, then );
            else
                loop( $, { past: list, last: result.val } );
        } );
    }
    streamReadc( $, function ( $, c ) {
        loop( $, null );
    } );
}

var symbolChars = "abcdefghijklmnopqrstuvwxyz";
symbolChars += symbolChars.toUpperCase() + "-*0123456789";
var symbolChopsChars = strMap().setObj( { "(": ")", "[": "]" } );
var commandEndChars = "\r\n";
var whiteChars = " \t";

function postProcessWhitespace( stringParts ) {
    // TODO: Make this trampolined with constant time between bounces.
    // This might be tricky because it's stateful.
    
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

function ignoreRestOfLine( $, then ) {
    $.stream.peekc( function ( c ) {
        if ( /^[\r\n]?$/.test( c ) )
            then( $ );
        else
            streamReadc( $, function ( $, c ) {
                ignoreRestOfLine( $, then );
            } );
    } );
}

var whiteReaderMacros = strMap();
whiteReaderMacros.set( ";", function ( $, then ) {
    if ( bankCommand( $, then ) )
        return;
    ignoreRestOfLine( $, function ( $ ) {
        reader( $, then );
    } );
} );
addReaderMacros( whiteReaderMacros, commandEndChars,
    function ( $, then ) {
    
    if ( bankCommand( $, then ) )
        return;
    streamReadc( $, function ( $, c ) {
        reader( $, then );
    } );
} );
addReaderMacros( whiteReaderMacros, whiteChars, function ( $, then ) {
    streamReadc( $, function ( $, c ) {
        reader( $, then );
    } );
} );

var readerMacros = whiteReaderMacros.copy();
addReaderMacros( readerMacros, symbolChars, function ( $, then ) {
    if ( bankInfix( $, 0, then ) )
        return;
    function collectChops( $, stringSoFar, open, close, nesting ) {
        if ( nesting === 0 )
            return void collect( $, stringSoFar );
        streamReadc( $, function ( $, c ) {
            var nextStringSoFar = stringSoFar + c;
            if ( c === "" )
                return void then( $,
                    { ok: false, msg: "Incomplete symbol" } );
            collectChops( $, nextStringSoFar, open, close,
                nesting + (c === open ? 1 : c === close ? -1 : 0) );
        } );
    }
    function collect( $, stringSoFar ) {
        $.stream.peekc( function ( c ) {
            if ( c === ""
                || (symbolChars.indexOf( c ) === -1
                    && !symbolChopsChars.has( c )) )
                return void continueInfix( $, stringSoFar, then );
            streamReadc( $, function ( $, open ) {
                var nextStringSoFar = stringSoFar + open;
                var close = symbolChopsChars.get( open );
                if ( close !== void 0 )
                    collectChops( $,
                        nextStringSoFar, open, close, 1 );
                else
                    collect( $, nextStringSoFar );
            } );
        } );
    }
    collect( $, "" );
} );
readerMacros.set( "(", function ( $, then ) {
    if ( bankInfix( $, 0, then ) )
        return;
    readListUntilParen( $, !!"consumeParen", then );
} );
readerMacros.set( "/", function ( $, then ) {
    if ( bankInfix( $, 0, then ) )
        return;
    readListUntilParen( $, !"consumeParen", then );
} );
readerMacros.set( "\\", function ( $, then ) {
    if ( bankInfix( $, 0, then ) )
        return;
    streamReadc( $, function ( $, c ) {
        $.stream.peekc( function ( c ) {
            if ( c === "" )
                return void then( $,
                    { ok: false, msg: "Incomplete string" } );
            if ( !symbolChopsChars.has( c ) )
                return void then( $, { ok: false,
                    msg: "Unrecognized string opening character" } );
            var closeBracket = symbolChopsChars.get( c );
            readStringUntilBracket( $, closeBracket, 0,
                function ( $, result ) {
                
                if ( !result.ok )
                    return void then( $, result );
                then( $, { ok: true, val:
                    postProcessWhitespace( result.val ) } );
            } );
        } );
    } );
} );
function defineInfixOperator(
    ch, level, noLhsErr, incompleteErr, readRemaining ) {
    
    readerMacros.set( ch, function ( $, then ) {
        if ( bankInfix( $, level, then ) )
            return;
        if ( $.infixState.type === "empty" ) {
            then( $, { ok: false, msg: noLhsErr } );
        } else if ( $.infixState.type === "ready" ) {
            var lhs = $.infixState.val;
            var origHeedsCommandEnds = $.heedsCommandEnds;
            streamReadc( objPlus( $, {
                infixState: { type: "empty" }
            } ), function ( $, c ) {
                function read( $, heedsCommandEnds, level, then ) {
                    readerLet( $, {
                        heedsCommandEnds:
                            origHeedsCommandEnds && heedsCommandEnds,
                        infixLevel: level,
                        end: function ( $, then ) {
                            if ( $.infixState.type === "ready" )
                                then( objPlus( $, {
                                    infixState: { type: "empty" }
                                } ), { ok: true,
                                    val: $.infixState.val } );
                            else
                                then( $, { ok: false,
                                    msg: incompleteErr } );
                        }
                    }, then );
                }
                function expectChar( $, heedsCommandEnds, ch, then ) {
                    readerLet( $, {
                        heedsCommandEnds:
                            origHeedsCommandEnds && heedsCommandEnds,
                        readerMacros: whiteReaderMacros.plusEntry( ch,
                            function ( $, then ) {
                            
                            streamReadc( $, function ( $, c ) {
                                then( $, { ok: true, val: null } );
                            } );
                        } ),
                        unrecognized: function ( $, then ) {
                            then( $, { ok: false, msg:
                                "Encountered an unrecognized " +
                                "character when expecting " + ch } );
                        },
                        end: function ( $, then ) {
                            then( $,
                                { ok: false, msg: incompleteErr } );
                        }
                    }, then );
                }
                readRemaining( $, lhs, read, expectChar,
                    function ( $, result ) {
                    
                    if ( !result.ok )
                        return void then( $, result );
                    continueInfix( $, result.val, then );
                } );
            } );
        } else {
            throw new Error();
        }
    } );
}
// NOTE: A previous syntax for `a<b>c` was `a :b c`. The newer syntax
// is visually symmetrical, but more importantly, it does not require
// whitespace between `b` and `c`. The lack of whitespace makes it
// easier to visually group it among list elements like (a b c<d>e f).
// Moreover, as long as we do follow this no-whitespace style,
// multi-line infix expressions will look particularly unusual. This
// saves us from multi-line infix indentation dilemmas because it
// discourages us from writing such expressions in the first place.
defineInfixOperator( "<", 1,
    "Tertiary infix expression without lhs",
    "Incomplete tertiary infix expression",
    function ( $, lhs, read, expectChar, then ) {
    
    // NOTE: We support top-level code like the following by disabling
    // heedsCommandEnds when reading the operator:
    //
    //  a <b
    //      .c> d
    //
    read( $, !"heedsCommandEnds", 0, function ( $, op ) {
        if ( !op.ok )
            return void then( $, op );
        
        expectChar( $, !"heedsCommandEnds", ">",
            function ( $, status ) {
            
            if ( !status.ok )
                return void then( $, status );
            
            read( $, !!"heedsCommandEnds", 1, function ( $, rhs ) {
                if ( !rhs.ok )
                    return void then( $, rhs );
                then( $,
                    { ok: true, val: [ op.val, lhs, rhs.val ] } );
            } );
        } );
    } );
} );
readerMacros.set( ">", function ( $, then ) {
    if ( bankInfix( $, 0, then ) )
        return;
    then( $, { ok: false,
        msg: "Tertiary infix expression without lhs or operator" } );
} );
defineInfixOperator( ".", 2,
    "Binary infix expression without lhs",
    "Incomplete binary infix expression",
    function ( $, lhs, read, expectChar, then ) {
    
    read( $, !!"heedsCommandEnds", 2, function ( $, rhs ) {
        if ( !rhs.ok )
            return void then( $, rhs );
        then( $, { ok: true, val: [ lhs, rhs.val ] } );
    } );
} );

function readStringUntilBracket( $, bracket, qqDepth, then ) {
    function loop( $, string ) {
        readerLet( $, {
            qqDepth: qqDepth,
            readerMacros: stringReaderMacros.plusEntry( bracket,
                function ( $, then ) {
                
                streamReadc( $, function ( $, c ) {
                    // TODO: Make this trampolined with constant time
                    // between bounces. This might be tricky because
                    // it's stateful.
                    var result = [];
                    for ( var s = string; s !== null; s = s.past )
                        result = s.last.concat( result );
                    then( $, { ok: true, val:
                        { type: "freshlyCompletedCompound",
                            val: result } } );
                } );
            } ),
            unrecognized: function ( $, then ) {
                streamReadc( $, function ( $, c ) {
                    then( $, { ok: true,
                        val: [ { type: "nonWhite", text: c } ] } );
                } );
            },
            end: function ( $, then ) {
                then( $, { ok: false, msg: "Incomplete string" } );
            }
        }, function ( $, result ) {
            if ( !result.ok )
                return void then( $, result );
            
            if ( likeObjectLiteral( result.val )
                && result.val.type === "freshlyCompletedCompound" )
                then( $, { ok: true, val: result.val.val } );
            else
                loop( $, { past: string, last: result.val } );
        } );
    }
    streamReadc( $, function ( $, c ) {
        loop( $, null );
    } );
}

var stringReaderMacros = strMap();
stringReaderMacros.setAll( strMap().setObj( {
    " ": " ",
    "\t": "\t",
    "\r": "\r",
    "\n": "\n"
} ).map( function ( text ) {
    return function ( $, then ) {
        streamReadc( $, function ( $, c ) {
            then( $, { ok: true,
                val: [ { type: "rawWhite", text: text } ] } );
        } );
    };
} ) );
symbolChopsChars.each( function ( openBracket, closeBracket ) {
    stringReaderMacros.set( openBracket, function ( $, then ) {
        readStringUntilBracket( $, closeBracket, $.qqDepth,
            function ( $, result ) {
            
            if ( !result.ok )
                return void then( $, result );
            then( $, { ok: true, val: [].concat(
                [ { type: "nonWhite", text: openBracket } ],
                result.val,
                [ { type: "nonWhite", text: closeBracket } ]
            ) } );
        } );
    } );
    stringReaderMacros.set( closeBracket, function ( $, then ) {
        then( $, { ok: false,
            msg: "Unmatched " + closeBracket + " in string" } );
    } );
} );
stringReaderMacros.set( "\\", function ( $, then ) {
    loop( $, "", -1 );
    function loop( $, escStart, escQqDepth ) {
        var newEscQqDepth = escQqDepth + 1;
        if ( $.qqDepth < newEscQqDepth )
            return void then( $, { ok: false,
                msg: "Unquoted past the quasiquotation depth" } );
        
        streamReadc( $, function ( $, c1 ) {
            $.stream.peekc( function ( c2 ) {
                if ( c2 === "," )
                    loop( $, escStart + c1, newEscQqDepth );
                else
                    next( $, c2, escStart + c1, newEscQqDepth );
            } );
        } );
    }
    function next( $, c, escStart, escQqDepth ) {
        function capturingStream( captured, s ) {
            var stream = {};
            stream.underlyingStream = s;
            stream.getCaptured = function () {
                return captured;
            };
            stream.peekc = function ( then ) {
                s.peekc( then );
            };
            stream.readc = function ( then ) {
                s.readc( function ( s, c ) {
                    then( capturingStream( captured + c, s ), c );
                } );
            };
            return stream;
        }
        
        var inStringWithinString =
            escQqDepth < $.qqDepth && !symbolChopsChars.has( c );
        
        readerLet( objPlus( $, {
            stream: inStringWithinString ?
                capturingStream( "", $.stream ) : $.stream
        } ), {
            readerMacros: strMap().setAll( strMap().setObj( {
                "s": " ",
                "t": "\t",
                "r": "\r",
                "n": "\n",
                "#": ""
            } ).map( function ( text, escName ) {
                return function ( $, then ) {
                    streamReadc( $, function ( $, c ) {
                        then( $, { ok: true, val:
                            [ { type: "explicitWhite", text: text } ]
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
                return function ( $, then ) {
                    streamReadc( $, function ( $, c ) {
                        then( $, { ok: true, val:
                            [ { type: "nonWhite", text: text } ]
                        } );
                    } );
                };
            } ) ).setAll( symbolChopsChars.map(
                function ( closeBracket, openBracket ) {
                
                return function ( $, then ) {
                    if ( escQqDepth !== 0 )
                        return void then( $, { ok: false, msg:
                            "Used a string-within-a-string escape " +
                            "sequence with an unquote level other " +
                            "than zero" } );
                    
                    readStringUntilBracket(
                        $, closeBracket, $.qqDepth + 1,
                        function ( $, result ) {
                        
                        if ( !result.ok )
                            return void then( $, result );
                        then( $, { ok: true, val: [].concat(
                            [ { type: "nonWhite",
                                text: escStart + openBracket } ],
                            result.val,
                            [ { type: "nonWhite",
                                text: closeBracket } ]
                        ) } );
                    } );
                };
            } ) ).setObj( {
                ";": function ( $, then ) {
                    ignoreRestOfLine( $, function ( $ ) {
                        then( $, { ok: true, val: [] } );
                    } );
                },
                "_": function ( $, then ) {
                    streamReadc( $, function ( $, c ) {
                        readerLet( $, {
                            heedsCommandEnds: false,
                            infixLevel: 3,
                            infixState: { type: "empty" },
                            readerMacros: readerMacros,
                            unrecognized: function ( $, then ) {
                                then( $, { ok: false, msg:
                                    "Encountered an unrecognized " +
                                    "character" } );
                            },
                            end: function ( $, then ) {
                                then( $, { ok: false, msg:
                                    "Incomplete interpolation in " +
                                    "string" } );
                            }
                        }, function ( $, result ) {
                            if ( !result.ok )
                                return void then( $, result );
                            streamReadc( $, function ( $, c ) {
                                if ( c === "." )
                                    then( $, { ok: true, val:
                                        [ {
                                            type: "interpolation",
                                            val: result.val
                                        } ]
                                    } );
                                else
                                    then( $, { ok: false, val:
                                        "Didn't end a string " +
                                        "interpolation with a " +
                                        "dot" } );
                            } );
                        } );
                    } );
                },
                "u": function ( $, then ) {
                    streamReadc( $, function ( $, c ) {
                        loop( "", 6 );
                        function loop( hexSoFar, digitsLeft ) {
                            streamReadc( $, function ( $, c ) {
                                if ( c === "" )
                                    then( $, { ok: false, msg:
                                        "Incomplete Unicode escape"
                                    } );
                                else if ( c === "." )
                                    next( hexSoFar );
                                else if ( digitsLeft === 0 )
                                    then( $, { ok: false, msg:
                                        "Unterminated Unicode escape"
                                    } );
                                else if ( /^[01-9A-F]$/.test( c ) )
                                    loop( hexSoFar + c,
                                        digitsLeft - 1 );
                                else
                                    then( $, { ok: false, msg:
                                        "Unrecognized character in " +
                                        "Unicode escape" } );
                            } );
                        }
                        function next( hex ) {
                            if ( hex.length === 0 )
                                return void then( $, { ok: false, msg:
                                    "Unicode escape with no " +
                                    "digits" } );
                            var text = unicodeCodePointToString(
                                parseInt( hex, 16 ) );
                            if ( text === null )
                                return void then( $, { ok: false, msg:
                                    "Unicode escape out of range" } );
                            then( $, { ok: true, val:
                                [ { type: "nonWhite", text: text } ]
                            } );
                        }
                    } );
                },
                ",": function ( $, then ) {
                    // NOTE: We shouldn't get here. We already read
                    // all the commas first.
                    then( $, { ok: false, msg:
                        "Unquoted past the quasiquotation depth, " +
                        "and also caused an internal error in the " +
                        "reader" } );
                }
            } ),
            unrecognized: function ( $, then ) {
                then( $, { ok: false,
                    msg: "Unrecognized escape sequence" } );
            },
            end: function ( $, then ) {
                then( $, { ok: false,
                    msg: "Incomplete escape sequence" } );
            }
        }, function ( $, result ) {
            
            var $sub = objPlus( $, {
                stream: inStringWithinString ?
                    $.stream.underlyingStream : $.stream
            } );
            
            if ( !result.ok || !inStringWithinString )
                return void then( $sub, result );
            then( $sub, { ok: true, val: [ {
                type: "nonWhite",
                text: escStart + $.stream.getCaptured()
            } ] } );
        } );
    }
} );


function stringStream( defer, string ) {
    if ( !isValidUnicode( string ) )
        throw new Error();
    
    var n = string.length;
    
    return streamAt( 0 );
    function streamAt( i ) {
        var stream = {};
        stream.underlying = null;
        stream.getCaptured = function () {
            throw new Error();
        };
        stream.peekc = function ( then ) {
            stream.readc( function ( stream, c ) {
                // We just ignore the new stream.
                then( c );
            } );
        };
        stream.readc = function ( then ) {
            defer( function () {
                if ( n <= i )
                    return void then( stream, "" );
                var charCodeInfo =
                    getUnicodeCodePointAtCodeUnitIndex( string, i );
                var result = charCodeInfo.charString;
                then( streamAt( i + result.length ), result );
            } );
        };
        return stream;
    }
}

function makeDeferTrampoline() {
    // TODO: Refactor this to be a trampoline with constant time
    // between bounces, like what Penknife and era-avl.js use.
    
    var deferTrampolineEvents = [];
    
    var result = {};
    result.defer = function ( func ) {
        deferTrampolineEvents.push( func );
    };
    result.runDeferTrampoline = function () {
        while ( deferTrampolineEvents.length !== 0 )
            deferTrampolineEvents.pop()();
    };
    return result;
}

function readAll( string ) {
    
    var deferTrampoline = makeDeferTrampoline();
    var stream = stringStream( deferTrampoline.defer, string );
    
    function read( stream, onEnd, onFailure, onSuccess ) {
        // TODO: Make this trampolined with constant time between
        // bounces. This might be tricky because it's stateful.
        var readResult;
        reader( {
            stream: stream,
            heedsCommandEnds: true,
            infixLevel: 0,
            infixState: { type: "empty" },
            qqDepth: null,
            readerMacros: readerMacros,
            unrecognized: function ( $, then ) {
                then( $, { ok: false,
                    msg: "Encountered an unrecognized character" } );
            },
            end: function ( $, then ) {
                if ( $.infixState.type === "ready" )
                    then( objPlus( $, {
                        infixState: { type: "empty" }
                    } ), { ok: true, val: $.infixState.val } );
                else
                    then( $, { ok: true, val: { type: "end" } } );
            }
        }, function ( $, result ) {
            if ( !result.ok )
                readResult = onFailure( result.msg );
            else if ( likeObjectLiteral( result.val )
                && result.val.type === "end" )
                readResult = onEnd();
            else
                readResult = onSuccess( $.stream, result.val );
        } );
        deferTrampoline.runDeferTrampoline();
        return readResult;
    }
    
    return readNext( stream, [] );
    function readNext( stream, resultsSoFar ) {
        return read( stream, function () {  // onEnd
            return resultsSoFar;
        }, function ( message ) {  // onFailure
            return resultsSoFar.concat(
                [ { ok: false, msg: message } ] );
        }, function ( stream, result ) {  // onSuccess
            return readNext( stream, resultsSoFar.concat(
                [ { ok: true, val: result } ] ) );
        } );
    }
}
