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
//     language, namely this one, I'd like to generate text-based code
//     sometimes. In fact, I'd like to generate code to generate code,
//     and so on.
//
//     - Problem: Most string syntaxes frustrate me because they
//       require me to write escape sequences in my code. Different
//       stages of generated code look completely different because I
//       have to write escape sequences for my escape sequences. Since
//       they look so different, I can't easily refactor my project in
//       ways that add or remove stages.
//
//     - Solution: This string syntax uses escape sequences
//       \-qq-mk[...] and \-qq-pf[...] that looks exactly like the
//       string syntaxes themselves, and the sole purpose of this
//       escape sequence is for generating code that contains this
//       string syntax. Escape sequences occurring inside these
//       brackets are suppressed, so \-lf generates "\-lf" rather than
//       a newline, and so on. Thanks to this, every stage of
//       generated code looks almost entirely the same.
//
//     - Problem: The escape sequence \-qq-mk[...] generates both
//       "\-qq-mk[" and "]" in a single string, and sometimes I want
//       to insert a value in the middle. I could write this as a
//       concatenation bookended by one string that escapes \-qq-mk[
//       as \`-qq-mk\-< and one that escapes ] as \-> but I'd rather
//       not make such a pervasive syntax replacement for such a
//       focused insertion.
//
//     - Solution: There's an interpolation escape sequence
//       \-uq-ls[expression-goes-here] which lets s-expressions be
//       interspersed with other string parts at read time.
//
//     - Problem: Wouldn't that be suppressed like any other escape
//       sequence inside the \-qq-mk[...] boundaries?
//
//     - Solution: All \- escape sequences can actually be
//       un-suppressed any number of levels by writing things like
//       \-uq-uq-uq-uq-ls[...] for example. The escape sequence
//       \-uq-ls[...] is actually \-ls modified by \-uq, and
//       \-qq-mk[...] is \-mk modified by \-qq. The function of \-qq
//       and \-uq is to suppress and un-suppress escape sequences
//       respectively.
//
//     - Problem: Different stages of code still look different
//       because some of them use \-uq-ls[...] while others have to
//       use \-uq-uq-uq-uq-ls[...] in its place. If I refactor my code
//       to add or remove a stage before or after all other stages I'm
//       fine, but if I refactor it to add or remove a stage somewhere
//       in the middle, I have to go all over my code to add or remove
//       "-uq".
//
//     - Solution: You can use \-wq[foo]-qq-... to locally define the
//       name "foo" to refer to the current quasiquote level before
//       you start a new one. Then you can use \-rq[foo]-... to rewind
//       back to the original level. Altogether, you can write
//       \-wq[foo]-qq-mk[...\-rq[foo]-ls[...]...] instead of
//       \-qq-mk[...\-uq-ls[...]...] for example.
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
//     - Solution: The \-qq-mk[...] string syntax collapses all
//       verbatim whitespace. It also has whitespace escapes for local
//       cases when that behavior is unwanted, such as blank lines
//       between natural-language paragraphs.
//
//     - Problem: Sometimes I do want to be picky about whitespace,
//       such as when I'm writing my natural-language prose in some
//       kind of markdown format.
//
//     - Solution: The \-qq-pf[...] string syntax does not collapse
//       whitespace, so it can be used instad of \-qq-mk[...] in that
//       case.
//
// The design we've settled on at this point is the following:
//
// When reading an s-expression at a quasiquotation depth greater than
//   zero, most syntaxes are trivialized. The reader supports these
//   syntaxes:
//
//   any Unicode code point except \ ( ) [ and ]
//   ) or ] is an error if unmatched
//   ( or [ reads a trivialized s-expression terminated by ) or ]
//     respectively
//   \ reads any string escape sequence omitting the \
//
// When reading an s-expression at a quasiquotation depth of zero,
//   these syntaxes are available, including an *infix* syntax:
//
//   most code points are errors
//   space or tab ignores itself
//   carriage return, newline, or a sequence of carriage return and
//     newline ignores itself, but in a command stream it prevents any
//     . that may follow from consuming this command
//   ; reads until it peeks the end of the line or document, and it
//     ignores it all (for comments)
//   \-rm (or any other string escape sequence which ends up meaning
//     \-rm with a quasiquotation depth of zero) reads a delimited
//     string, and it ignores it all (for comments)
//   any Basic Latin alphanumeric code point or - or * reads any
//     number of code points in this set, and it means a string
//   ( or [ reads any number of s-expressions followed by ) or ] and
//     it means a list of those s-expressions
//   / reads any number of s-expressions until it peeks ) or ] and it
//     means a list of those s-expressions
//   . consumes a previously read s-expression, and it reads a second
//     s-expression without . infix support and means a two-element
//     list
//   \-qq-mk (or any other string escape sequence which ends up
//     meaning \-mk with a quasiquotation depth of one) reads a
//     delimited string, and it means the string with its lurking
//     commands processed, but it's an error for any escape sequence
//     inside to have a quasiquotation depth of zero unless it's an
//     \-ls
//   \-qq-pf (or any other string escape sequence which ends up
//     meaning \-pf with a quasiquotation depth of one) reads a
//     delimited string while suppressing whitespace normalization,
//     and it means the string with its lurking commands processed,
//     but it's an error for any escape sequence inside to have a
//     quasiquotation depth of zero unless it's an \-ls
//   // NOTE: A string's contents are not only text but also any
//   // string interpolations occurring in the string.
//
// If any syntax is delimited, it means this:
//
//   most code points are errors
//   / reads the syntax until it peeks ) or ] and if it needs to be
//     converted to avoid peeking, it converts to ( ) or [ ]
//     respectively
//   ( or [ reads the syntax until it reads ) or ] respectively
//
// In a string, we have the following syntaxes:
//
// raw whitespace tokens:
//   // NOTE: When we normalize a span of raw whitespace, we replace
//   // it with an empty string if it's at the ends of the string or
//   // with a single space otherwise.
//   space or tab means itself, but if whitespace is being
//     discouraged, it leaves a lurking command to verify that the
//     surrounding raw whitespace needs no normalization, and
//     otherwise if whitespace normalization is not suppressed, it
//     leaves a lurking command to normalize the surrounding
//     whitespace
//   carriage return, newline, or a sequence of carriage return and
//     newline means newline, but if whitespace is being discouraged,
//     it leaves a lurking command to verify that the surrounding raw
//     whitespace needs no normalization, and otherwise if whitespace
//     normalization is not being suppressed, it leaves a lurking
//     command to normalize the surrounding whitespace
//   \ followed by space or tab reads until it peeks the end of the
//     line or the document, and it means empty string (for comments)
//   \-rm (meaning "remark") reads any unsophisticated string escape
//     and means empty string (for comments)
//     // NOTE: This is especially good for commenting out a span of
//     // text or for commenting out another escape sequence. When
//     // commenting deep within a quasiquotation, remember to use
//     // \-uq-uq-uq-rm... so the comment disappears at the
//     // appropriate level.
// explicit whitespace tokens:
//   // NOTE: For most escape sequences, we avoid putting a letter at
//   // the end of the escape sequence because it blend in with the
//   // next part of the string. The exception to the rule are these
//   // whitespace escapes. Their lurking commands for whitespace
//   // postprocessing mean that they can always be followed by a raw
//   // space if readability is needed.
//   \.s (meaning "space") means a space, and it leaves a lurking
//     command to remove the surrounding raw whitespace and ignore its
//     lurking commands
//   \.t (meaning "tab") means a tab, and it leaves a lurking command
//     to remove the surrounding raw whitespace and ignore its lurking
//     commands
//   \.r (meaning "carriage return") means a carriage return, and it
//     leaves a lurking command to remove the surrounding raw
//     whitespace and ignore its lurking commands
//   \.n (meaning "newline") means a newline, and it leaves a lurking
//     command to remove the surrounding raw whitespace and ignore its
//     lurking commands
//   \.c (meaning "concatenate") means empty string, but it leaves a
//     lurking command to remove the surrounding raw whitespace and
//     ignore its lurking commands
// non-whitespace tokens:
//   any Unicode code point except space, tab, carriage return,
//     newline, \ ( ) [ and ]
//   \` means backslash
//   \.< or \.> means left or right square bracket, respectively
//   \.{ or \.} means left or right parenthesis, respectively
//   ) or ] is an error if unmatched
//   ( or [ reads a string terminated by ) or ] respectively, and it
//     means the contents of this entire escape sequence
//   \-ch (meaning "code point in hexadecimal") reads a delimited
//     sequence of 1-6 uppercase hexadecimal digits and means the
//     appropriate Unicode code point, but there's an error if the
//     code point is outside the Unicode range or reserved for UTF-16
//     surrogates
//     // NOTE: The reason we use delimiters here is so the following
//     // code point can be a hex digit without ambiguity.
//   \-qq (meaning "quasiquote") reads any escape sequence omitting
//     the \ and interprets that sequence according to the current
//     quasiquotation depth plus one
//   \-uq (meaning "unquote") reads any escape sequence omitting the \
//     and interprets that sequence according to the current
//     quasiquotation depth minus one, and there's an error if the
//     quasiquotation depth is zero to begin with
//   \-wq= (meaning "with current quasiquotation level") reads a
//     delimited, non-interpolated string while discouraging
//     whitespace, and then it reads any escape sequence omitting the
//     \ and interprets that sequence with the given quasiquotation
//     label bound to a fresh view of the current quasiquotation depth
//   \-rq= (meaning "restore quasiquotation level") reads a delimited,
//     non-interpolated string while discouraging whitespace, and
//     then it reads any escape sequence omitting the \ and interprets
//     that sequence according to the quasiquotation depth rewound to
//     the given quasiquotation label and deeming all labels passed
//     this way to be non-fresh, but there's an error if the target
//     label is unbound or if it's not fresh
//   \-mk (meaning "markup") reads a delimited string, and it means
//     the contents of that string plus the remaining parts of this
//     entire escape sequence, but converting the delimiter to avoid
//     peeking past the end of the encompassing string. If whitespace
//     normalization is not suppressed, the string contents will also
//     be prefixed with a lurking command to remove any successive
//     raw whitespace and ignore its lurking commands, and they'll be
//     suffixed with a lurking command to do the same thing to its
//     preceding raw whitespace.
//   \-pf (meaning "preformatted") reads a delimited string while
//     suppressing whitespace normalization, and it means the contents
//     of that string plus the remaining parts of this entire escape
//     sequence but converting the delimiter to avoid peeking past the
//     end of the encompassing string
//   \-ls (meaning "lists and strings") reads a delimited s-expression
//     and means an interpolation
//   // NOTE: We give most escape sequences two-letter names because
//   // that makes them a little more mnemonic, lets us use "l" and
//   // "o" without confusing them with digits, lets us avoid
//   // resorting to idiosyncratic capitalization, and gives us a
//   // three-letter string like "-mk" we can grep for. For escapes
//   // dedicated to single code points, we use short escape sequences
//   // with punctuation like "\.<" or letters like "\.t" depending
//   // on whether the original code point was already punctuation.
//   // The substitute punctuation helps it continue to stand out.
//
// The overall syntax is regular enough to be parsed in a less
// sophisticated way if necessary.
//
// unsophisticated string elements:
//   any Unicode code point except \ ( ) [ ] reads nothing
//   ) or ] is an error if unmatched
//   ( or [ reads unsophisticated string elements until it reads
//     ) or ] respectively
//   \ reads an unsophisticated escape sequence suffix
//
// unsophisticated escape sequence suffixes:
//
//   most code points are errors
//
//   ) ] or \ is an error
//     // NOTE: These would be particularly inconvenient characters no
//     // matter what purpose they were put to. Any \\ \) or \] escape
//     // sequence would need to have both its characters escaped to
//     // be represented as a string, since otherwise this syntax
//     // would interpret the \ ) or ] in other ways.
//
//   ! " # $ % & ' * + / : < > ? @ \ ^ _ { | } or ~ has behavior
//     reserved for future use
//     //
//     // NOTE: These are the Basic Latin punctuation characters we're
//     // not already using. We're unlikely to use " or ' anytime soon
//     // because syntax highlighters like to think they know what a
//     // string looks like. We don't reserve Basic Latin letters or
//     // digits for future use because they would be confusing nested
//     // under - escape sequences: Imagine writing \-uqx to unquote
//     // the \x escape sequence and then trying to look up what
//     // "-uqx" means.
//     //
//     // TODO: An escape sequence \\ would have the same trouble as
//     // \) and \] so maybe it should be an error. On the other hand,
//     // \ could be good for writing comments *inside* complicated
//     // escape sequences, especially if we also choose to change the
//     // behavior of space and tab so our comments can have
//     // whitespace around them. See if we should do that.
//
//   , reads two Basic Latin lowercase letters and then its behavior
//     is reserved for future use
//     // NOTE: We can't predict how convenient this future use will
//     // *need* to be, except that it can afford a two-letter name,
//     // so it will tend to be a syntax that's exhausting to type
//     // anyway. We choose the convenient-to-type , to avoid
//     // compounding upon that inconvenience. Since these long \,
//     // escape syntaxes will be in such a different world than the
//     // short \. escape sequences, it's likely the similar
//     // individual appearance of \. and \, will be easy to
//     // distinguish from context. Moreover, this use of , is not at
//     // the end of a syntax, so it can be discussed without
//     // confusing it with natural language punctuation.
//
//   ` reads nothing
//     // NOTE: A short, sharply readable escape for \ is valuable
//     // because when \ has to be escaped, chances are there are
//     // going to be lots of such escapes all over the code, and some
//     // may even be escaped to several levels. Since ` is an
//     // unshifted code point with the same general shape as \ and
//     // since \````... raises above the normal text like a warning
//     // beacon, it has several distinct advantages in this role.
//
//   . reads one more code point
//     // NOTE: While the code point . is very convenient to type, in
//     // most roles it would be confusing. In this role it avoids the
//     // end of the syntax (where it would be confused with natural
//     // language punctuation) and it avoids being next to too many
//     // identifier characters (where it would be confused with the
//     // foo.bar s-expression infix syntax).
//
//   - reads two Basic Latin lowercase letters followed by another
//     unsophisticated escape sequence suffix
//     //
//     // NOTE: This character has the advantage of being unintrusive
//     // when several unsophisticated escape sequence suffixes need
//     // to be nested, like \-uq-uq-uq.< for example.
//     //
//     // TODO: See if another character would have any more
//     // advantages than that. It is hard to grep for this character,
//     // even with the letters bolted on, since - is going to be a
//     // common character for identifiers in s-expressions.
//
//   = reads two more unsophisticated escape sequence suffixes
//     // NOTE: This code point not only suggests two-ness in its
//     // shape but also calls up the imagery of a (let x = 2 ...)
//     // syntax, which is similar to the way we're actually using it.
//     // Although : has the same qualifications, = is unshifted.
//
//   space or tab reads until it peeks the end of the line or document
//     // NOTE: Commenting is a major use case for convenient syntax.
//     // What could be more convenient than the kind of character
//     // that would most likely be placed between \ heiroglyphics and
//     // the natural language documentation anyway?
//     //
//     // TODO: Actually, figure out if it would be better to reserve
//     // this so that we can give better error messages or so that
//     // whitespace can be used in the middle of particularly
//     // confusing escape sequences.
//
//   ( or [ reads unsophisticated string elements until it reads
//     ) or ] respectively
//     // NOTE: This behavior gives us delimiters we can use without
//     // any need to escape the same delimiters when they're used
//     // inside. This is useful for expression languages. We reserve
//     // two delimiters for use this way: The delimiter ( ) is very
//     // common for expression languages, and it's sometimes easier
//     // to type thanks to its use in English. The delimiter [ ] is
//     // unshifted on an American keyboard, and it's more visually
//     // distinct from ( ) than { } is anyway. By not treating { }
//     // the same way, we leave open the possibility of syntaxes
//     // where some delimiters don't need to be balanced, with one
//     // example being our own \.{ and \.} escape sequences.


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
