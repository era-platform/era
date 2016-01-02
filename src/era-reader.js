// era-reader.js
// Copyright 2013-2015 Ross Angle. Released under the MIT License.
"use strict";

// This is a reader for Era's own dialect of s-expressions.
//
// After reading, the s-expression format is simple:
//
//   - An s-expression is either a list or an interpolated string.
//   - A list is either empty or an s-expression followed by a list.
//   - An interpolated string is an uninterpolated string, optionally
//     followed by an s-expression and an interpolated string.
//   - An uninterpolated string is a sequence of Unicode code points
//     (integers 0x0..0x10FFFF) but excluding UTF-16 surrogates
//     (0xD800..0xDFFF).
//
// Before reading, the most complicated system is the string syntax.
// The design considerations for the string syntax actually impact
// most of the other parts of the syntax design.
//
// In the design of the overall syntax, we have several use cases in
// mind:
//
//   - Story: As someone who talks to people about code, I want to use
//     code snippets as diagrams in natural-language discussions.
//
//     - Problem: Some authorship systems would require me to take
//       screenshots or do export/import in order to properly copy and
//       paste between authored snippets and discussion.
//
//     - Solution: Like many programming langage syntaxes, Era's
//       syntax is edited as plain Unicode text. These days, plain
//       Unicode text is a widely used medium for natural language
//       communication.
//
//   - Story: As a programmer, I encounter nested structures all the
//     time, ranging from lambda calculus terms to loop bodies to data
//     structures. It would be nice if editing these trees were
//     straightforward.
//
//     - Problem: Most languages' code is plain-text-based, and plain
//       text is flat.
//
//     - Solution: This syntax follows in the tradition of the Lisp
//       family of languages by defining a single (a b c ...) nested
//       list syntax that can be used for various kinds of nesting.
//       Once a programmer adopts tools or habits for this syntax,
//       it's almost like the syntax is a tree rather than a list in
//       the first place.
//
//     - Problem: Actually, some of the nesting I'm dealing with is
//       very lopsided to the right, like monadic/continuation-passing
//       style, pointful function composition, or right-associative
//       algebraic operations.
//
//     - Solution: There's a (a b /c d) syntax, and it's shorthand for
//       (a b (c d)). Besides saving a ) here and there, since / and (
//       look so different, they don't have to follow the same
//       indentation convention. Continuation-passing style code can
//       be written one call per line, making it look like imperative
//       code. Pointful function composition can be written
//       (f/g/h ...).
//
//   - Story: As a programmer who uses a text-based programming
//     language, namely this one, I have the skills and tools to edit
//     plain text, and I'd like to take advantage of them.
//
//     - Problem: If I want to specify plain text assets for my
//       program to use, I don't want to switch to another editor
//       environment just to define those assets.
//
//     - Solution: Like lots of programming language syntaxes, Era's
//       syntax supports string literals \-qq[...] and \-qq-pr[...]. A
//       string literal can contain *practically* any text, and that
//       text will be *mostly* reflected in the reader's final result.
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
//       \-qq[...] and \-qq-pr[...] that look exactly like the string
//       syntaxes themselves, and the sole purpose of this escape
//       sequence is for generating code that contains this string
//       syntax. Escape sequences occurring inside these brackets are
//       suppressed, so \.n generates "\.n" rather than a newline, and
//       so on. Thanks to this, every stage of generated code looks
//       almost entirely the same.
//
//     - Problem: The escape sequence \-qq[...] generates both "\-qq["
//       and "]" in a single string, and sometimes I want to insert a
//       value in the middle. I could write this as a concatenation
//       bookended by one string that escapes \-qq[ as \.`-qq\.< and
//       one that escapes ] as \.> but I'd rather not make such a
//       pervasive syntax replacement for such a focused insertion.
//
//     - Solution: There's an interpolation escape sequence
//       \-uq-ls[expression-goes-here] which lets s-expressions be
//       interspersed with other string parts at read time. This way
//       both \-qq[ and ] can be part of the same string, even if
//       there's an interpolation in the middle.
//
//     - Problem: Wouldn't that be suppressed like any other escape
//       sequence inside the \-qq[...] boundaries?
//
//     - Solution: All \- escape sequences can actually be
//       un-suppressed any number of levels by writing things like
//       \-uq-uq-uq-uq-ls[...] for example. The escape sequence
//       \-uq-ls[...] is actually \-ls modified by \-uq, and
//       \-qq[...] is \[...] modified by \-qq. The function of \-qq
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
//     - Solution: You can use \-wq=[foo]-qq... to locally define the
//       name "foo" to refer to the current quasiquote level before
//       you start a new one. Then you can use \-rq=[foo]... to rewind
//       back to the original level. Altogether, you can write
//       \-wq=[foo]-qq[...\-rq=[foo]-ls[...]...] instead of
//       \-qq[...\-uq-ls[...]...] for example.
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
//     - Solution: The \-qq[...] string syntax collapses all
//       whitespace. It also supports whitespace escapes for local
//       cases when that behavior is unwanted, such as blank lines
//       between natural-language paragraphs.
//
//     - Problem: Sometimes I do want to be picky about whitespace,
//       such as when I'm writing my natural-language prose in some
//       kind of markdown format.
//
//     - Solution: The \-qq-pr[...] string syntax does not collapse
//       whitespace, so it can be used instad of \-qq[...] in that
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
//   \ followed by a spaced escape sequence suffix reads it, and it
//     means whatever \ followed by that escape sequence suffix means
//     here
//   \; reads until it peeks the end of the line or the document, and
//     it ignores it all (for comments)
//   \-rm (or any other string escape sequence involving -qq -uq -wq
//     -rq -pr -rm and -re which ends up meaning \-rm with a
//     quasiquotation depth of zero) reads any spaced unsophisticated
//     string escape suffix, and it ignores it all (for comments)
//   any Basic Latin alphanumeric code point or - or * reads any
//     number of code points in this set, and it means a string
//
//   \ followed by a delimited sequence of any number of s-expressions
//     (or any other string escape sequence involving -qq -uq -wq -rq
//     -pr and -re which ends up being a delimited string with a
//     quasiquotation depth of zero) means a list of those
//     s-expressions
//     //
//     // NOTE: This is technically the most consistent way to get the
//     // benefits of the /... half-delimiter syntax in a textual
//     // multi-stage program. This is because inside a string, a
//     // usage of \/... that falls off the end of the string will get
//     // converted to \[...] or \(...) but a usage of /... that falls
//     // off the end will be left alone and will probably break. It's
//     // left alone because / has no special behavior in a string,
//     // and / has no special behavior in a string because we may
//     // want to generate code in languages that use / for other
//     // purposes, such as division, comments, and XML end tags.
//     //
//     // TODO: See if there's a way to redesign the syntax to avoid
//     // that quirk.
//
//   ( or [ reads any number of s-expressions followed by ) or ] and
//     it means a list of those s-expressions
//   / reads any number of s-expressions until it peeks ) or ] and it
//     means a list of those s-expressions
//   . consumes a previously read s-expression, and it reads a second
//     s-expression without . infix support and means a two-element
//     list
//   \-qq or \-qq-pr followed by a delimited string (or any other
//     string escape sequence involving -qq -uq -wq -rq -pr and -re
//     which ends up being a delimited string with a quasiquotation
//     depth of one) reads that string while suppressing whitespace as
//     appropriate. If whitespace normalization is not suppressed, it
//     prefixes the string contents with a lurking command to remove
//     any successive raw whitespace and ignore its lurking commands,
//     and it suffixes the string contents with a lurking command to
//     do the same thing to its preceding raw whitespace. It means the
//     string with its lurking commands processed, but it's an error
//     for any escape sequence inside to have a quasiquotation depth
//     of zero unless it's \-ls and it's an error for -pr to be used
//     at a depth of zero.
//     // NOTE: A string's contents are not only text but also any
//     // string interpolations occurring in the string.
//
// If any syntax is spaced, it means this:
//
//   space, tab, carriage return, or newline reads a spaced instance
//     of the syntax
//   -re followed by a spaced = reads a spaced unsophisticated escape
//     sequence suffix, ignores it, then reads a spaced instance of
//     the syntax
//     // NOTE: The "re" means "remark escape".
//     // NOTE: This means -re=; can be used to write a comment in
//     // the middle of a complicated escape sequence.
//   any other code point is read as the syntax
//
// If any syntax is delimited, it means a spaced instance of this:
//
//   most code points are errors
//   / reads the syntax until it peeks ) or ] and if it needs to be
//     converted to avoid peeking, it converts to ( ) or [ ]
//     respectively
//   ( or [ reads the syntax until it reads ) or ] respectively
//
// In a string, we have the following syntaxes:
//
// miscellaneous:
//   \ followed by a spaced escape sequence suffix reads it, and it
//     means whatever \ followed by that escape sequence suffix means
//     here
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
//   \; reads code points until it peeks the end of the line or the
//     document, and it means empty string (for comments)
//   \-rm (meaning "remark") reads any spaced unsophisticated string
//     escape suffix, and it means empty string (for comments)
//     // NOTE: This is especially good for commenting out a span of
//     // text or for commenting out another escape sequence. When
//     // commenting deep within a quasiquotation, remember to use
//     // \-uq-uq-uq-rm... so the comment disappears at the
//     // appropriate level.
// explicit whitespace tokens:
//   // NOTE: For most escape sequences, we avoid putting a letter at
//   // the end of the escape sequence because it would blend in with
//   // the next part of the string. The exceptions to the rule are
//   // these whitespace escapes. Their lurking commands for
//   // whitespace postprocessing mean that they can always be
//   // followed by a raw space if readability is needed.
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
//   \.` means backslash
//   \.< or \.> means left or right square bracket, respectively
//   \.{ or \.} means left or right parenthesis, respectively
//   ) or ] is an error if unmatched
//   ( or [ reads a string terminated by ) or ] respectively, and it
//     means the contents of that string plus the remaining parts of
//     this entire escape sequence
//   \ followed by a delimited string reads it, and it means the
//     contents of that string plus the remaining parts of this entire
//     escape sequence, but converting the delimiter to avoid peeking
//     past the end of the encompassing string. If whitespace
//     normalization is not suppressed, the string contents will also
//     be prefixed with a lurking command to remove any successive
//     raw whitespace and ignore its lurking commands, and they'll be
//     suffixed with a lurking command to do the same thing to its
//     preceding raw whitespace.
//   \-pr (meaning "preformatted") reads any escape sequence omitting
//     the \ while suppressing whitespace normalization
//   \-ls (meaning "lists and strings") reads a delimited s-expression
//     and means an interpolation
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
//   \-wq (meaning "with current quasiquotation level") followed by a
//     spaced = reads a delimited string while discouraging whitespace
//     and disallowing -pr -ls -qq -uq -wq -rq and peeking avoidance,
//     it processes the lurking commands in that string, and then it
//     reads any escape sequence omitting the \ and interprets that
//     sequence with the given quasiquotation label bound to a fresh
//     view of the current quasiquotation depth
//   \-rq (meaning "restore quasiquotation level") followed by a
//     spaced = reads a delimited string while discouraging whitespace
//     and disallowing -pr -ls -qq -uq -wq -rq and peeking avoidance,
//     it processes the lurking commands in that string, and then it
//     reads any escape sequence omitting the \ and interprets that
//     sequence according to the quasiquotation depth rewound to the
//     given quasiquotation label and deeming all labels passed this
//     way to be non-fresh, but there's an error if the target label
//     is unbound or if it's not fresh
//   // NOTE: We give most escape sequences two-letter names because
//   // that makes them a little more mnemonic, lets us use "l" and
//   // "o" without confusing them with digits, lets us avoid
//   // resorting to idiosyncratic capitalization, and gives us a
//   // three-letter string like "-pr" we can grep for. For escapes
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
//   \ ) or ] is an error
//     // NOTE: These would be particularly inconvenient characters no
//     // matter what purpose they were put to. Any \\ \) or \] escape
//     // sequence would need to have both its characters escaped to
//     // be represented as a string, since otherwise this syntax
//     // would interpret the \ ) or ] in other ways.
//
//   ! " # $ % & ' * + , : < > ? @ ^ _ { | } or ~ has behavior
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
//   ; reads code points until it peeks the end of the line or
//     document
//
//   space, tab, carriage return, or newline reads another
//     unsophisticated escape sequence suffix
//     // NOTE: This way whitespace can be used in the middle of
//     // particularly confusing escape sequences.
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
//
//   / reads unsophisticated string elements until it reads ) or ]


function customStream( underlyingStream, read ) {
    var stream = {};
    stream.underlyingStream = underlyingStream;
    stream.peek = function ( yoke, then ) {
        return runWaitOne( yoke, function ( yoke ) {
        return read( yoke, underlyingStream,
            function ( yoke, underlyingStream, result ) {
        return runWaitOne( yoke, function ( yoke ) {
        
        var cachingStream = {};
        cachingStream.underlyingStream = underlyingStream;
        cachingStream.peek = function ( yoke, then ) {
            return runWaitOne( yoke, function ( yoke ) {
                return then( yoke, cachingStream, result );
            } );
        };
        cachingStream.read = function ( yoke, then ) {
            return runWaitOne( yoke, function ( yoke ) {
                return then( yoke,
                    customStream( underlyingStream, read ),
                    result );
            } );
        };
        return then( yoke, cachingStream, result );
        
        } );
        } );
        } );
    };
    stream.read = function ( yoke, then ) {
        return runWaitOne( yoke, function ( yoke ) {
        return read( yoke, underlyingStream,
            function ( yoke, underlyingStream, result ) {
        return runWaitOne( yoke, function ( yoke ) {
        
        return then( yoke,
            customStream( underlyingStream, read ),
            result );
        
        } );
        } );
        } );
    };
    return stream;
}
function streamPrepend( originalStream, element ) {
    var result = { ok: true, val: { val: element } };
    
    var stream = {};
    stream.underlyingStream = originalStream.underlyingStream;
    stream.peek = function ( yoke, then ) {
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, stream, result );
        } );
    };
    stream.read = function ( yoke, then ) {
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, originalStream, result );
        } );
    };
    return stream;
}
function listToStream( list ) {
    return customStream( list, function ( yoke, list, then ) {
        if ( list === null )
            return then( yoke, null, { ok: true, val: null } );
        else
            return then( yoke, list.rest, { ok: true, val:
                { val: list.first } } );
    } );
}
function stringToClassifiedTokenStream( string ) {
    if ( !isValidUnicode( string ) )
        throw new Error();
    
    var n = string.length;
    
    return customStream( 0, function ( yoke, i, then ) {
        if ( n <= i )
            return then( yoke, i, { ok: true, val: null } );
        // TODO NOW: Redesign the reader syntax so = , aren't an issue
        // here.
        var regex =
            /[ \t]+|[\r\n=,\.\\/()\[\]]|[^ \t\r\n=,\.\\/()\[\]]*/g;
        regex.lastIndex = i;
        var result = regex.exec( string )[ 0 ];
        return then( yoke, i + result.length, { ok: true, val:
            { val: result } } );
    } );
}
function exhaustStream( yoke, s, then ) {
    // This reads the remainder of the stream as a linked list.
    //
    // NOTE: Unlike most of the utilities in this file, if this
    // encounters an error, it returns the error message *along with*
    // the list of s-expressions already read.
    
    return loop( yoke, s, null );
    function loop( yoke, s, revList ) {
        return s.read( yoke, function ( yoke, s, result ) {
            
            if ( !result.ok )
                return jsListRev( yoke, revList,
                    function ( yoke, list ) {
                    
                    return then( yoke, s,
                        { ok: false, msg: result.msg, val: list } );
                } );
            
            if ( result.val === null )
                return jsListRev( yoke, revList,
                    function ( yoke, list ) {
                    
                    return then( yoke, s, { ok: true, val: list } );
                } );
            else
                return loop( yoke, s,
                    { first: result.val.val, rest: revList } );
        } );
    }
}

// NOTE: For this, `s` must be a classified token stream.
function readRestOfLine( yoke, s, revElements, then ) {
    return s.peek( yoke, function ( yoke, s, result ) {
        if ( !result.ok )
            return then( yoke, s, result );
        
        if ( result.val === null
            || /^[\r\n]$/.test( result.val.val ) )
            return jsListRev( yoke, revElements,
                function ( yoke, elements ) {
                
                return then( yoke, s, { ok: true, val: elements } );
            } );
        else
            return s.read( yoke, function ( yoke, s, result ) {
                if ( !result.ok )
                    return then( yoke, s, result );
                
                return readRestOfLine( yoke, s,
                    { first: { type: "scalars", val: result.val.val },
                        rest: revElements },
                    then );
            } );
    } );
}
// NOTE: For this, `s` must be a classified token stream.
function readBracketedStringElements( yoke, s,
    closeRegex, consume, revSoFar, then ) {
    
    return s.peek( yoke, function ( yoke, s, result ) {
        if ( !result.ok )
            return then( yoke, s, result );
        
        if ( result.val !== null
            && closeRegex.test( result.val.val ) ) {
            if ( consume )
                return s.read( yoke, function ( yoke, s, result ) {
                    if ( !result.ok )
                        return then( yoke, s, result );
                    return next( yoke, s, result.val.val );
                } );
            else
                return next( yoke, s, result.val.val );
        } else {
            return readStringElement( yoke, s,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                if ( result.val === null )
                    throw new Error();
                return readBracketedStringElements( yoke, s,
                    closeRegex, consume,
                    { first: result.val.val, rest: revSoFar }, then );
            } );
        }
        
        function next( yoke, s, close ) {
            return jsListRev( yoke, revSoFar,
                function ( yoke, elements ) {
                
                return then( yoke, s, { ok: true, val:
                    { close: close, elements: elements } } );
            } );
        }
    } );
}
// NOTE: For this, `s` must be a classified token stream.
function readStringElement( yoke, s, then ) {
    return s.read( yoke, function ( yoke, s, result ) {
        if ( !result.ok )
            return then( yoke, s, result );
        
        if ( result.val === null )
            return then( yoke, s, result );
        
        var c = result.val.val;
        if ( /^[)\]]$/.test( c ) )
            return then( yoke, s, { ok: false, msg:
                "Unmatched " + c + " in text" } );
        else if ( c === "\\" )
            return readEscape( yoke, s, function ( yoke, s, result ) {
                if ( !result.ok )
                    return then( yoke, s, result );
                return then( yoke, s, { ok: true, val:
                    { val:
                        { type: "escape", suffix: result.val } } } );
            } );
        else if ( c === "(" )
            return readBracketedStringElements( yoke, s,
                /^[)]$/, !!"consume", null,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                return then( yoke, s,
                    { ok: true, val:
                        { val:
                            { type: "textDelimited",
                                open: "(",
                                close: ")",
                                elements: result.val.elements } } } );
            } );
        else if ( c === "[" )
            return readBracketedStringElements( yoke, s,
                /^\]$/, !!"consume", null,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                return then( yoke, s,
                    { ok: true, val:
                        { val:
                            { type: "textDelimited",
                                open: "[",
                                close: "]",
                                elements: result.val.elements } } } );
            } );
        else
            return then( yoke, s, { ok: true, val:
                { val: { type: "scalars", val: c } } } );
    } );
}
// TODO NOW: Use this.
// NOTE: For this, `s` must be a classified token stream.
function readNaiveSexpStringElements( yoke, s, revSoFar, then ) {
    return s.peek( yoke, function ( yoke, s, result ) {
        if ( !result.ok )
            return then( yoke, s, result );
        
        if ( result.val === null )
            return then( yoke, s, result );
        
        var c = result.val.val;
        if ( /^[)\]]$/.test( c ) )
            return then( yoke, s, { ok: false, msg:
                "Unmatched " + c + " in s-expression" } );
        else if ( c === "." )
            return then( yoke, s, { ok: false, msg:
                "Expected s-expression, encountered . outside an " +
                "infix context" } );
        // TODO NOW: Redesign the reader syntax so = , aren't an issue
        // here.
        else if ( /^[=,]$/.test( c ) )
            return then( yoke, s, { ok: false, msg:
                "Expected s-expression, encountered " + c } );
        else if ( /^[ \t\r\n]*$/.test( c ) )
            return readNaiveSexpStringElements( yoke, s,
                { first: { type: "scalars", val: c },
                    rest: revSoFar },
                then );
        else if ( c === "(" )
            return s.read( yoke, function ( yoke, s, result ) {
                return readBracketedStringElements( yoke, s,
                    /^[)]$/, !!"consume", null,
                    function ( yoke, s, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, s, result );
                    return next( yoke, s,
                        { type: "textDelimited",
                            open: "(",
                            close: ")",
                            elements: result.val.elements } );
                } );
            } );
        else if ( c === "[" )
            return s.read( yoke, function ( yoke, s, result ) {
                return readBracketedStringElements( yoke, s,
                    /^\]$/, !!"consume", null,
                    function ( yoke, s, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, s, result );
                    return next( yoke, s,
                        { type: "textDelimited",
                            open: "[",
                            close: "]",
                            elements: result.val.elements } );
                } );
            } );
        else if ( c === "/" )
            return s.read( yoke, function ( yoke, s, result ) {
                return readBracketedStringElements( yoke, s,
                    /^[)\]]$/, !"consume", null,
                    function ( yoke, s, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, s, result );
                    
                    if ( result.val.close === ")" )
                        return next( yoke, s,
                            { type: "textDelimited",
                                open: "/",
                                close: ")",
                                elements: result.val.elements } );
                    else if ( result.val.close === "]" )
                        return next( yoke, s,
                            { type: "textDelimited",
                                open: "/",
                                close: "]",
                                elements: result.val.elements } );
                    else
                        throw new Error();
                } );
            } );
        else
            return readIdentifier( yoke, s, revSoFar );
        
        function next( yoke, s, last ) {
            return jsListRev( yoke, { first: last, rest: revSoFar },
                function ( yoke, elements ) {
                
                return then( yoke, s, { ok: true, val: elements } );
            } );
        }
    } );
    
    function readIdentifier( yoke, s, revSoFar ) {
        return s.peek( yoke, function ( yoke, s, result ) {
            if ( !result.ok )
                return then( yoke, s, result );
            
            if ( result.val === null )
                return next( yoke, s );
            
            var c = result.val.val;
            // TODO NOW: Redesign the reader syntax so = , aren't an
            // issue here.
            if ( /^[ \t\r\n=,\./()\[\]]*$/.test( c ) )
                return next( yoke, s );
            else if ( c === "\\" )
                return s.read( yoke, function ( yoke, s, result ) {
                    return readEscape( yoke, s,
                        function ( yoke, s, result ) {
                        
                        if ( !result.ok )
                            return then( yoke, s, result );
                        return readIdentifier( yoke, s,
                            { first:
                                { type: "escape",
                                    suffix: result.val },
                                rest: revSoFar } );
                    } );
                } );
            else
                return s.read( yoke, function ( yoke, s, result ) {
                    return readIdentifier( yoke, s,
                        { first: { type: "scalars", val: c },
                            rest: revSoFar } );
                } );
            
            function next( yoke, s ) {
                return jsListRev( yoke, revSoFar,
                    function ( yoke, elements ) {
                    
                    return then( yoke, s,
                        { ok: true, val: elements } );
                } );
            }
        } );
    }
}

function asciiToEl( ascii ) {
    var result = null;
    for ( var i = ascii.length - 1; 0 <= i; i-- )
        result =
            { first: { type: "scalars", val: ascii.charAt( i ) },
                rest: result };
    return result;
}

// NOTE: In a few cases, stringElementsToString(),
// stringElementToString(), and escapeToString() may encode a value in
// a way that can't be parsed back in:
//
//   - The element contains a "comment" escape suffix, but it is not
//     in a context where its closing end-of-line or end-of-document
//     will be in the expected place.
//   - The value contains an "escapeDelimited" escape suffix, and its
//     opening bracket is / but it is not in a context where its
//     closing bracket will be in the expected place.
//   - The element contains a "scalars" string element whose value is
//     \ ( ) [ ] or whitespace.
//
// If the value was created by parsing in the first place, these cases
// should be impossible anyway, aside from the fact that an
// "escapeDelimited" whose opening bracket is / may run up to the end
// of the string.
function stringElementsToString( yoke, elements, then ) {
    return jsListMappend( yoke, elements,
        function ( yoke, element, then ) {
        
        return stringElementToString( yoke, element, then );
    }, then );
}
// TODO NOW: From here. We've been making the whole file match up with
// notes/era-reader-2.txt, from top to bottom, except that we've been
// keeping the top documentation area accurate along the way.
function escapeToString( yoke, esc, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( esc.type === "short" ) {
            return jsListAppend( yoke,
                asciiToEl( "." ),
                jsList( { type: "scalars", val: esc.name } ),
                then );
        } else if ( esc.type === "modifier" ) {
            return escapeToString( yoke, esc.suffix,
                function ( yoke, suffix ) {
                
                return jsListAppend( yoke,
                    asciiToEl( "-" + esc.name ), suffix, then );
            } );
        } else if ( esc.type === "pair" ) {
            return escapeToString( yoke, esc.first,
                function ( yoke, first ) {
            return escapeToString( yoke, esc.second,
                function ( yoke, second ) {
            
            return jsListFlattenOnce( yoke,
                jsList( asciiToEl( "=" ), first, second ), then );
            
            } );
            } );
        } else if ( esc.type === "spaced" ) {
            return jsListAppend( yoke, esc.space, esc.suffix, then );
        } else if ( esc.type === "comment" ) {
            return jsListAppend( yoke,
                asciiToEl( ";" ), esc.elements, then );
        } else if ( esc.type === "escapeDelimited" ) {
            return stringElementsToString( yoke, esc.elements,
                function ( yoke, elements ) {
                
                return jsListFlattenOnce( yoke, jsList(
                    asciiToEl( esc.open ),
                    elements,
                    asciiToEl( esc.open === "/" ? "" : esc.close )
                ), then );
            } );
        } else {
            throw new Error();
        }
    } );
}
function stringElementToString( yoke, element, then ) {
    if ( element.type === "escape" )
        return escapeToString( yoke, element.suffix,
            function ( yoke, elements ) {
            
            return jsListAppend( yoke,
                asciiToEl( "\\" ), elements, then );
        } );
    else if ( element.type === "textDelimited" )
        return stringElementsToString( yoke, element.elements,
            function ( yoke, elements ) {
            
            return jsListFlattenOnce( yoke, jsList(
                asciiToEl( element.open ),
                elements,
                asciiToEl( element.open === "/" ? "" : element.close )
            ), then );
        } );
    else if ( element.type === "scalars" )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, jsList( element ) );
        } );
    else
        throw new Error();
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

function readerExprPretty( expr ) {
    if ( expr.type === "nil" ) {
        return "()";
    } else if ( expr.type === "cons" ) {
        if ( expr.rest.type === "nil" ) {
            if ( expr.first.type === "nil"
                || expr.first.type === "cons" ) {
                return "(/" +
                    readerExprPretty( expr.first ).substr( 1 );
            } else {
                return "(" + readerExprPretty( expr.first ) + ")";
            }
        } else if ( expr.rest.type === "cons" ) {
            return "(" + readerExprPretty( expr.first ) + " " +
                readerExprPretty( expr.rest ).substr( 1 );
        } else {
            throw new Error();
        }
    } else if (
        expr.type === "stringNil" || expr.type === "stringCons" ) {
        
        var s = "";
        var terps = [];
        var e = expr;
        while ( e.type === "stringCons" ) {
            s += readerStringListToString( e.string ).
                replace( /\\/g, "\\.`" );
            // We temporarily represent interpolations using the
            // invalid escape sequence \#~. This lets us put all the
            // string contents into one JavaScript string, which lets
            // us discover matching brackets even if they have an
            // interpolation in between. Later on, we replace these
            // invalid escape sequences with the proper
            // interpolations.
            s += "\\#~";
            terps.push( readerExprPretty( e.interpolation ) );
            e = e.rest;
        }
        if ( e.type !== "stringNil" )
            throw new Error();
        s += readerStringNilToString( e ).replace( /\\/g, "\\.`" );
        var lastTerpAtEnd = /\\#~$/.test( s );
        
        while ( true ) {
            // If there are matching brackets, we want to display them
            // as raw brackets rather than escape sequences. To do so,
            // we temporarily convert them to the invalid escape
            // sequences \#< \#> \#{ \#}, then escape all the
            // non-matching brackets, then replace these invalid
            // escape sequences with raw brackets again.
            var s2 = s.
                replace( /\[([^\[\]\(\)]*)\]/g, "\\#<$1\\#>" ).
                replace( /\(([^\[\]\(\)]*)\)/g, "\\#{$1\\#}" );
            if ( s === s2 )
                break;
            s = s2;
        }
        s = s.
            replace( /\[/g, "\\.<" ).replace( /\]/g, "\\.>" ).
            replace( /\(/g, "\\.{" ).replace( /\)/g, "\\.}" ).
            replace( /\\#</g, "[" ).replace( /\\#>/g, "]" ).
            replace( /\\#{/g, "(" ).replace( /\\#}/g, ")" ).
            replace( /[ \t\r\n]+[a-zA-Z]?/g, function ( whitespace ) {
                if ( /^ [a-zA-Z]?$/.test( whitespace ) )
                    return whitespace;
                // NOTE: We insert an underscore as a placeholder, and
                // then we safely convert it to a raw space after the
                // spaces have been replaced with explicit whitespace
                // escape sequences.
                return whitespace.
                    replace( /[a-zA-Z]/g, "_$&" ).
                    replace( / /g, "\\.s" ).
                    replace( /\t/g, "\\.t" ).
                    replace( /\r/g, "\\.r" ).
                    replace( /\n/g, "\\.n" ).
                    replace( /_/g, " " );
            } ).
            replace( /\\#~/g, function () {
                var terp = terps.shift();
                var m;
                if ( m = /^\\-qq\[(.*)\]$/.exec( terp ) )
                    var mid = "\\-qq/" + m[ 1 ];
                else if ( m = /^\((.*)\)$/.exec( terp ) )
                    var mid = "/" + m[ 1 ];
                else
                    var mid = terp;
                return lastTerpAtEnd && terps.length === 0 ?
                    "\\-uq-ls/" + mid :
                    "\\-uq-ls[" + mid + "]";
            } );
        return /^[\-*a-zA-Z01-9]+$/.test( s ) ? s :
            "\\-qq[" + s + "]";
    } else {
        throw new Error();
    }
}

function readerJsStringPretty( jsString ) {
    return readerExprPretty(
        { type: "stringNil",
            string: { first: jsString, rest: null } } );
}

// NOTE: For this, `s` must be a classified token stream.
function readScalar( yoke, s, then ) {
    return s.read( yoke, function ( yoke, s, result ) {
        
        if ( !result.ok || result.val === null )
            return then( yoke, s, result );
        
        var scalar =
            getUnicodeCodePointAtCodeUnitIndex(
                result.val.val, 0 ).charString;
        if ( scalar.length === result.val.val.length )
            return then( yoke, s, result );
        
        return then( yoke,
            streamPrepend( s,
                result.val.val.substr( scalar.length ) ),
            { ok: true, val: { val: scalar } } );
    } );
}
// NOTE: For this, `s` must be a classified token stream.
function readLowercaseBasicLatinLetter( yoke, s, then ) {
    return readScalar( yoke, s, function ( yoke, s, result ) {
        
        if ( !result.ok )
            return then( yoke, s, result );
        
        if ( result.val === null )
            return then( yoke, s, { ok: false, msg:
                "Expected lowercase Basic Latin code point, got " +
                "end of document" } );
        else if ( !/^[a-z]$/.test( result.val.val ) )
            return then( yoke, s, { ok: false, msg:
                "Expected lowercase Basic Latin code point, got " +
                readerJsStringPretty( result.val.val ) } );
        
        return then( yoke, s, { ok: true, val: result.val.val } );
    } );
}
// NOTE: For this, `s` must be a classified token stream.
function readTwoLowercaseBasicLatinLetters( yoke, s, then ) {
    return readLowercaseBasicLatinLetter( yoke, s,
        function ( yoke, s, result ) {
        
        if ( !result.ok )
            return then( yoke, s, result );
        var c1 = result.val;
        return readLowercaseBasicLatinLetter( yoke, s,
            function ( yoke, s, result ) {
            
            if ( !result.ok )
                return then( yoke, s, result );
            var c2 = result.val;
            return then( yoke, s, { ok: true, val: c1 + c2 } );
        } );
    } );
}
// NOTE: For this, `s` must be a classified token stream.
function readEscape( yoke, s, then ) {
    return s.peek( yoke, function ( yoke, s, result ) {
        
        if ( !result.ok )
            return then( yoke, s, result );
        
        if ( result.val === null )
            return then( yoke, s, { ok: false, msg:
                "Expected escape sequence suffix, got end of " +
                "document" } );
        if ( /^[ \t\r\n]+$/.test( result.val.val ) ) {
            var space = result.val.val;
            return s.read( yoke, function ( yoke, s, result ) {
                if ( !result.ok )
                    return then( yoke, s, result );
                return readEscape( yoke, s,
                    function ( yoke, s, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, s, result );
                    return then( yoke, s,
                        { ok: true, val:
                            { type: "spaced",
                                space: asciiToEl( space ),
                                suffix: result.val } } );
                } );
            } );
        }
        
        
        return readScalar( yoke, s, function ( yoke, s, result ) {
            if ( !result.ok )
                return then( yoke, s, result );
        
        var c = result.val.val;
        if ( /^[)\]]$/.test( c ) )
            return then( yoke, s, { ok: false, msg:
                "Unmatched " + c + " in escape sequence suffix" } );
        if ( c === "\\" )
            return then( yoke, s, { ok: false, msg:
                "Encountered escape sequence suffix " + c + " " +
                "which is invalid" } );
        else if ( /^[!"#$%&'*+,:<>?@^_{|}~]$/.test( c ) )
            return then( yoke, s, { ok: false, msg:
                "Encountered escape sequence suffix " + c + " " +
                "which is reserved for future use" } );
        else if ( c === ";" )
            return readRestOfLine( yoke, s, null,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                return then( yoke, s, { ok: true, val:
                    { type: "comment", elements: result.val } } );
            } );
        else if ( c === "." )
            return readScalar( yoke, s, function ( yoke, s, result ) {
                if ( !result.ok )
                    return then( yoke, s, result );
                else if ( result.val === null )
                    return then( yoke, s, { ok: false, msg:
                        "Expected any code point, got end of document"
                        } );
                
                return then( yoke, s, { ok: true, val:
                    { type: "short", name: result.val.val } } );
            } );
        else if ( c === "-" )
            return readTwoLowercaseBasicLatinLetters( yoke, s,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                var name = result.val;
                return readEscape( yoke, s,
                    function ( yoke, s, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, s, result );
                    return then( yoke, s,
                        { ok: true, val:
                            { type: "modifier",
                                name: name,
                                suffix: result.val } } );
                } );
            } );
        else if ( c === "=" )
            return readEscape( yoke, s,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                var first = result.val;
                return readEscape( yoke, s,
                    function ( yoke, s, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, s, result );
                    return then( yoke, s,
                        { ok: true, val:
                            { type: "pair",
                                first: first,
                                second: result.val } } );
                } );
            } );
        else if ( c === "(" )
            return readBracketedStringElements( yoke, s,
                /^[)]$/, !!"consume", null,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                return then( yoke, s,
                    { ok: true, val:
                        { type: "escapeDelimited",
                            open: "(",
                            close: ")",
                            elements: result.val.elements } } );
            } );
        else if ( c === "[" )
            return readBracketedStringElements( yoke, s,
                /^\]$/, !!"consume", null,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                return then( yoke, s,
                    { ok: true, val:
                        { type: "escapeDelimited",
                            open: "[",
                            close: "]",
                            elements: result.val.elements } } );
            } );
        else if ( c === "/" )
            return readBracketedStringElements( yoke, s,
                /^[)\]]$/, !"consume", null,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                
                if ( result.val.close === ")" )
                    return then( yoke, s,
                        { ok: true, val:
                            { type: "escapeDelimited",
                                open: "/",
                                close: ")",
                                elements: result.val.elements } } );
                else if ( result.val.close === "]" )
                    return then( yoke, s,
                        { ok: true, val:
                            { type: "escapeDelimited",
                                open: "/",
                                close: "]",
                                elements: result.val.elements } } );
                else
                    throw new Error();
            } );
        else
            return then( yoke, s, { ok: false, msg:
                "Expected escape sequence suffix, got " +
                readerJsStringPretty( c ) } );
        
        } );
    } );
}

function traverseSpaced( yoke, prefix, esc, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( esc.type === "spaced" )
            return jsListAppend( yoke, prefix, esc.space,
                function ( yoke, prefix ) {
                
                return traverseSpaced( yoke,
                    prefix, esc.suffix, then );
            } );
        else if ( esc.type === "modifier" && esc.name === "re" )
            return jsListAppend( yoke, prefix, asciiToEl( "-re" ),
                function ( yoke, newPrefix ) {
            return traverseSpaced( yoke, newPrefix, esc.suffix,
                function ( yoke, newPrefix, suffix ) {
                
                if ( suffix.type !== "pair" )
                    return then( yoke, prefix, esc );
            
            return escapeToString( yoke, suffix.first,
                function ( yoke, first ) {
            return jsListAppend( yoke, newPrefix, first,
                function ( yoke, newPrefix ) {
            
            return traverseSpaced( yoke,
                newPrefix, suffix.second, then );
            
            } );
            } );
            
            } );
            } );
        else
            return then( yoke, prefix, esc );
    } );
}

function readerStrMapNormalizeKey( k ) {
    // NOTE: This only normalizes the first segment of the key. This
    // is called repeatedly as the key is iterated over.
    
    var segmentSize = 1000;
    var currentK = k;
    var first = "";
    while ( first.length < segmentSize && currentK !== null ) {
        first += currentK.first;
        currentK = currentK.rest;
    }
    if ( segmentSize < first.length ) {
        currentK =
            { first: first.substr( segmentSize ), rest: currentK };
        first = first.substr( 0, segmentSize );
    }
    if ( first.length !== 0 )
        currentK = { first: first, rest: currentK };
    return currentK;
}

function ReaderStrMap() {}
ReaderStrMap.prototype.init_ = function ( rootVal, children ) {
    this.rootVal_ = rootVal;
    this.children_ = children;
    return this;
};
function readerStrMap() {
    return new ReaderStrMap().init_( null, strMap() );
}
ReaderStrMap.prototype.plusTruth = function ( yoke, origK, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
        var k = readerStrMapNormalizeKey( origK );
        if ( k === null )
            return then( yoke,
                new ReaderStrMap().init_(
                    { val: true }, self.children_ ) );
        var newChild = self.children_.has( k.first ) ?
            self.children_.get( k.first ) : readerStrMap();
        return newChild.plusTruth( yoke, k.rest,
            function ( yoke, newChild ) {
            
            return runWaitOne( yoke, function ( yoke ) {
                return then( yoke,
                    new ReaderStrMap().init_( self.rootVal_,
                        self.children_.plusEntry( k.first,
                            newChild ) ) );
            } );
        } );
    } );
};
ReaderStrMap.prototype.has = function ( yoke, origK, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
        var k = readerStrMapNormalizeKey( origK );
        if ( k === null )
            return then( yoke, self.rootVal_ !== null );
        if ( !self.children_.has( k.first ) )
            return then( yoke, false );
        return self.children_.get( k.first ).has( yoke,
            k.rest, then );
    } );
};

// NOTE: For this, `s` must be a stream of readStringElement results.
function readSexpOrInfixOp( yoke, s,
    encompassingClosingBracket, then ) {
    // NOTE: Besides resulting in s-expressions of type "cons", "nil",
    // "stringCons", and "stringNil", this may also result in a value
    // of type "infixNewline" or "infixDot".
    
    return s.read( yoke, function ( yoke, s, result ) {
        if ( !result.ok )
            return then( yoke, s, result );
        
        if ( result.val === null ) {
            return then( yoke, s, result );
        } else if ( result.val.val.type === "escape" ) {
            var withQqStack = function ( yoke, qqStack, esc ) {
                return traverseSpaced( yoke, jsList(), esc,
                    function ( yoke, ignoredPrefix, esc ) {
                
                if ( esc.type === "short" ) {
                    return then( yoke, s, { ok: false, msg:
                        "Expected s-expression escape suffix, got " +
                        "." + esc.name } );
                } else if ( esc.type === "modifier" ) {
                    if ( esc.name === "qq" ) {
                        return withQqStack( yoke, {
                            uq: qqStack,
                            cache: qqStack.cache.plusObj( {
                                names: readerStrMap()
                            } )
                        }, esc.suffix );
                    } else if ( esc.name === "uq" ) {
                        if ( qqStack.uq === null )
                            return then( yoke, s, { ok: false, msg:
                                "Expected s-expression escape " +
                                "suffix, got -uq at zero depth" } );
                        return withQqStack( yoke,
                            qqStack.uq, esc.suffix );
                    } else if ( esc.name === "wq" ) {
                        return parseQqLabelEsc( yoke, esc, qqStack,
                            function ( yoke, result ) {
                            
                            if ( !result.ok )
                                return then( yoke, s, result );
                            return qqStack.cache.get( "names" ).
                                plusTruth( yoke, result.val.name,
                                    function ( yoke, names ) {
                                
                                return withQqStack( yoke, {
                                    uq: qqStack.uq,
                                    cache: qqStack.cache.plusObj( {
                                        names: names
                                    } )
                                }, result.val.second );
                            } );
                        } );
                    } else if ( esc.name === "rq" ) {
                        return parseQqLabelEsc( yoke, esc, qqStack,
                            function ( yoke, result ) {
                            
                            if ( !result.ok )
                                return then( yoke, s, result );
                            return unwindingQqStack( yoke, qqStack );
                            function unwindingQqStack( yoke,
                                qqStack ) {
                                
                                return qqStack.cache.get( "names" ).
                                    has( yoke, result.val.name, function ( yoke, had ) {
                                    
                                    if ( had )
                                        return withQqStack( yoke, qqStack, result.val.second );
                                    else if ( qqStack.uq === null )
                                        return then( yoke, s, { ok: false, msg:
                                            "Expected s-expression escape suffix, encountered -rq= " +
                                            // TODO: Describe the unbound label. We'll need an error
                                            // string that can get larger than JavaScript's strings.
                                            "for an unbound label" } );
                                    else
                                        return unwindingQqStack( yoke, qqStack.uq );
                                } );
                            }
                        } );
                    } else if ( esc.name === "rm" ) {
                        if ( qqStack.uq !== null )
                            return then( yoke, s, { ok: false, msg:
                                "Expected s-expression escape " +
                                "suffix, got -rm at nonzero depth"
                                } );
                        return readSexpOrInfixOp( yoke, s,
                            encompassingClosingBracket, then );
                    } else if ( esc.name === "pr" ) {
                        return withQqStack( yoke, {
                            uq: qqStack.uq,
                            cache: qqStack.cache.plusObj( {
                                normalizingWhitespace: false
                            } )
                        }, esc.suffix );
                    } else {
                        return then( yoke, s, { ok: false, msg:
                            "Expected s-expression escape suffix, " +
                            "got -" + esc.name } );
                    }
                } else if ( esc.type === "pair" ) {
                    return then( yoke, s, { ok: false, msg:
                        "Expected s-expression escape suffix, got ="
                        } );
                } else if ( esc.type === "comment" ) {
                    return readSexpOrInfixOp( yoke, s,
                        encompassingClosingBracket, then );
                } else if ( esc.type === "escapeDelimited" ) {
                    if ( qqStack.uq === null ) {
                        return continueListFromElements( yoke,
                            esc.elements, esc.close );
                    } else if ( qqStack.uq.uq === null ) {
                        return readString( yoke, esc.elements, {
                            uq: qqStack.uq,
                            cache: qqStack.cache.plusObj( {
                                encompassingClosingBracket: esc.close,
                                encompassingClosingBracketIsInString:
                                    qqStack.cache.get( "encompassingClosingBracketIsInString" ) ||
                                        esc.open !== "/"
                            } )
                        }, function ( yoke, result ) {
                            if ( !result.ok )
                                return then( yoke, s, result );
                            return then( yoke, s, { ok: true, val:
                                { val: result.val } } );
                        } );
                    } else {
                        return then( yoke, { ok: false, msg:
                            "Expected s-expression escape suffix, " +
                            "encountered " + esc.open + " at a " +
                            "depth other than zero or one" } );
                    }
                } else {
                    throw new Error();
                }
                
                } );
            };
            var parseQqLabelEsc =
                function ( yoke, esc, qqStack, then ) {
                
                return traverseSpaced( yoke, jsList(), esc.suffix,
                    function ( yoke, pairPrefix, pair ) {
                    
                    if ( pair.type !== "pair" )
                        return then( yoke, { ok: false, msg:
                            "Expected s-expression escape suffix, " +
                            "encountered -" + esc.name + " but not " +
                            "-" + esc.name + "=" } );
                
                return traverseSpaced( yoke, jsList(), pair.first,
                    function ( yoke, firstPrefix, first ) {
                    
                    if ( first.type !== "escapeDelimited" )
                        return then( yoke, { ok: false, msg:
                            "Expected s-expression escape suffix, " +
                            "encountered -" + esc.name + "= but " +
                            "not -" + esc.name + "=( or " +
                            "-" + esc.name + "=[" } );
                
                return readQqLabel( yoke,
                    qqStack, first.close, first.elements,
                    function ( yoke, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, result );
                    
                    return then( yoke, { ok: true, val: {
                        pairPrefix: pairPrefix,
                        firstPrefix: firstPrefix,
                        name: result.val,
                        first: first,
                        second: pair.second
                    } } );
                } );
                
                } );
                
                } );
            };
            var readStringLurking = function ( yoke,
                elements, qqStack, then ) {
                
                return exhaustStream( yoke,
                    customStream( listToStream( elements ),
                        function ( yoke, s, then ) {
                        
                        return s.read( yoke,
                            function ( yoke, s, result ) {
                            
                            if ( !result.ok
                                || result.val === null
                                || result.val.val.type !== "scalars"
                                || result.val.val.val !== "\r" )
                                return then( yoke, s, result );
                            
                            // We convert CRLF and CR to LF.
                            return s.peek( yoke,
                                function ( yoke, s, result ) {
                                
                                if ( !result.ok )
                                    return then( yoke, s, result );
                                
                                if ( result.val === null
                                    || result.val.val.type !== "scalars"
                                    || result.val.val.val !== "\n" )
                                    return next( yoke, s );
                                else
                                    return s.read( yoke, function ( yoke, s, result ) {
                                        if ( !result.ok )
                                            return then( yoke, s, result );
                                        return next( yoke, s );
                                    } );
                                
                                function next( yoke, s ) {
                                    return then( yoke, s, { ok: true, val:
                                        { val: { type: "scalars", val: "\n" } } } );
                                }
                            } );
                        } );
                        return readSexp( yoke, s,
                            !"heedCommandEnds", then );
                    } ),
                    function ( yoke, emptyStream, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, result );
                
                return jsListShortFoldl( yoke, null, result.val,
                    function ( yoke, revResult, element, then ) {
                    
                    function ret( yoke, list ) {
                        return jsListRevAppend( yoke, list, revResult,
                            function ( yoke, revResult ) {
                            
                            return then( yoke,
                                revResult, !"exitedEarly" );
                        } );
                    }
                    
                    if ( element.type === "escape" ) {
                        var readEscapeLurking = function ( yoke,
                            prefix, esc, qqStack, then ) {
                            
                            function ret( yoke, val ) {
                                return then( yoke, { ok: true, val:
                                    val } );
                            }
                            function unexpected( yoke, got ) {
                                if ( qqStack.uq === null )
                                    return then( yoke, { ok: false, msg:
                                        "Expected interpolation escape suffix, got " + got } );
                                else if ( qqStack.uq.uq === null )
                                    return then( yoke, { ok: false, msg:
                                        "Expected string escape suffix, got " + got } );
                                else
                                    return then( yoke, { ok: false, msg:
                                        "Expected suppressed escape suffix, got " + got } );
                            }
                            
                            function simpleEscape( yoke,
                                rep, meaning ) {
                                
                                if ( qqStack.uq === null )
                                    return unexpected( yoke, rep );
                                else if ( qqStack.uq.uq === null )
                                    return ret( yoke, asciiToEl( meaning ) );
                                else
                                    return jsListAppend( yoke, prefix, asciiToEl( rep ), ret );
                            }
                            function explicitWhite( yoke,
                                rep, meaning ) {
                                
                                if ( qqStack.uq === null )
                                    return unexpected( yoke, rep );
                                else if ( qqStack.uq.uq === null )
                                    return jsListFlattenOnce( yoke, jsList(
                                        jsList( { type: "lurkObliteratePreceding" } ),
                                        asciiToEl( meaning ),
                                        jsList( { type: "lurkObliterateFollowing" } )
                                    ), ret );
                                else
                                    return jsListAppend( yoke, prefix, asciiToEl( rep ), ret );
                            }
                            
                            function readDelimitedStringLurking( yoke,
                                esc, qqStack, then ) {
                                
                                if ( esc.type !== "escapeDelimited" )
                                    return then( yoke, { ok: false, msg:
                                        "Expected delimited string, encountered something else" } );
                                
                                var alreadyInString =
                                    qqStack.cache.get( "encompassingClosingBracketIsInString" );
                                var open = esc.open;
                                if ( open === "/" ) {
                                    if ( alreadyInString === null )
                                        return then( yoke, { ok: false, msg:
                                            "Encountered escape suffix / in a quasiquotation " +
                                            "label, so couldn't convert it to avoid peeking past " +
                                            "the string's end" } );
                                    
                                    if ( alreadyInString )
                                        ;  // Do nothing.
                                    else if ( esc.close === ")" )
                                        open = "(";
                                    else if ( esc.close === "]" )
                                        open = "[";
                                    else
                                        throw new Error();
                                }
                                return readStringLurking( yoke, esc.elements, {
                                    uq: qqStack.uq,
                                    cache: qqStack.cache.plusObj( {
                                        encompassingClosingBracket: esc.close,
                                        encompassingClosingBracketIsInString: true
                                    } )
                                }, function ( yoke, result ) {
                                    
                                    if ( !result.ok )
                                        return then( yoke, result );
                                    
                                    return jsListFlattenOnce( yoke, jsList(
                                        asciiToEl( open ),
                                        result.val,
                                        asciiToEl( open === "/" ? "" : esc.close )
                                    ), function ( yoke, elements ) {
                                        return then( yoke, { ok: true, val: elements } );
                                    } );
                                } );
                            }
                            
                            return traverseSpaced( yoke,
                                jsList(), esc,
                                function ( yoke,
                                    ignoredPrefix, esc ) {
                            
                            if ( esc.type === "short" ) {
                                if ( esc.name === "s" ) {
                                    return explicitWhite( yoke, ".s", " " );
                                } else if ( esc.name === "t" ) {
                                    return explicitWhite( yoke, ".t", "\t" );
                                } else if ( esc.name === "r" ) {
                                    return explicitWhite( yoke, ".r", "\r" );
                                } else if ( esc.name === "n" ) {
                                    return explicitWhite( yoke, ".n", "\n" );
                                } else if ( esc.name === "c" ) {
                                    return explicitWhite( yoke, ".c", "" );
                                } else if ( esc.name === "`" ) {
                                    return simpleEscape( yoke, ".`", "\\" );
                                } else if ( esc.name === "<" ) {
                                    return simpleEscape( yoke, ".<", "[" );
                                } else if ( esc.name === ">" ) {
                                    return simpleEscape( yoke, ".>", "]" );
                                } else if ( esc.name === "{" ) {
                                    return simpleEscape( yoke, ".{", "(" );
                                } else if ( esc.name === "}" ) {
                                    return simpleEscape( yoke, ".}", ")" );
                                } else {
                                    return unexpected( yoke, readerJsStringPretty( "." + esc.name ) );
                                }
                            } else if ( esc.type === "modifier" ) {
                                var retWithModifier = function ( yoke, result ) {
                                    if ( !result.ok )
                                        return then( yoke, result );
                                    
                                    return jsListFlattenOnce( yoke, jsList(
                                        prefix,
                                        asciiToEl( "-" + esc.name ),
                                        result.val
                                    ), ret );
                                };
                                
                                if ( esc.name === "rm" ) {
                                    if ( qqStack.uq === null )
                                        return unexpected( yoke, "-rm" );
                                    else if ( qqStack.uq.uq === null )
                                        return ret( yoke, jsList() );
                                    else
                                        return readDelimitedStringLurking( yoke,
                                            esc.suffix, qqStack, retWithModifier );
                                } else if ( esc.name === "pr" ) {
                                    if ( qqStack.cache.get( "inQqLabel" ) )
                                        return then( yoke, { ok: false, msg:
                                            "Encountered -pr inside a quasiquotation label" } );
                                    else if ( qqStack.uq === null )
                                        return unexpected( yoke, "-pr" );
                                    
                                    return jsListAppend( yoke, prefix, asciiToEl( "-pr" ),
                                        function ( yoke, prefix ) {
                                        
                                        return readEscapeLurking( yoke, prefix, esc.suffix, {
                                            uq: qqStack.uq,
                                            cache: qqStack.cache.plusObj( {
                                                normalizingWhitespace: false
                                            } )
                                        }, then );
                                    } );
                                } else if ( esc.name === "ls" ) {
                                    if ( qqStack.cache.get( "inQqLabel" ) )
                                        return then( yoke, { ok: false, msg:
                                            "Encountered -ls inside a quasiquotation label" } );
                                    
                                    if ( qqStack.uq === null ) {
                                        if ( esc.suffix.type !== "escapeDelimited" )
                                            return unexpected( yoke,
                                                "-ls but not -ls( or -ls[ or -ls/" );
                                        
                                        return readList( yoke, listToStream( esc.suffix.elements ),
                                            esc.suffix.close,
                                            function ( yoke, emptyElementsStream, result ) {
                                            
                                            if ( !result.ok )
                                                return then( yoke, result );
                                            else if ( result.val.type !== "cons" )
                                                return then( yoke, { ok: false, msg:
                                                    "Expected an interpolation of exactly one " +
                                                    "s-expression, got zero" } );
                                            else if ( result.val.rest.type !== "nil" )
                                                return then( yoke, { ok: false, msg:
                                                    "Expected an interpolation of exactly one " +
                                                    "s-expression, got more than one" } );
                                            
                                            return ret( yoke,
                                                jsList( { type: "interpolation",
                                                    val: result.val.first } ) );
                                        } );
                                    } else {
                                        return readDelimitedStringLurking( yoke,
                                            esc.suffix, qqStack, retWithModifier );
                                    }
                                } else if ( esc.name === "ch" ) {
                                    if ( qqStack.uq === null ) {
                                        return unexpected( yoke, "-ch" );
                                    } else if ( qqStack.uq.uq === null ) {
                                        if ( esc.suffix.type !== "escapeDelimited" )
                                            return unexpected( yoke,
                                                "-ch but not -ch( or -ch[ or -ch/" );
                                        var elementsArr = jsListToArrBounded( esc.suffix.elements, 6 );
                                        
                                        var hexErr = function () {
                                            return then( yoke, { ok: false, msg:
                                                "Encountered -ch with something other than 1-6 " +
                                                "uppercase hex digits inside" } );
                                        };
                                        
                                        if ( elementsArr === null
                                            || !(1 <= elementsArr.length && elementsArr.length <= 6)
                                            || !arrAll( elementsArr, function ( element, i ) {
                                                return element.type === "scalars" &&
                                                    /^[01-9A-F]+$/.test( element.val ) &&
                                                    element.val.length <= 6;
                                            } ) )
                                            return hexErr();
                                        
                                        var elementsString = arrMap( elementsArr, function ( element, i ) {
                                            return element.val;
                                        } ).join( "" );
                                        
                                        if ( 6 < elementsString.length )
                                            return hexErr();
                                        
                                        var scalar = unicodeCodePointToString(
                                            parseInt( elementsString, 16 ) );
                                        
                                        if ( scalar === null )
                                            return then( yoke, { ok: false, msg:
                                                "Encountered -ch denoting either a UTF-16 surrogate " +
                                                "or a code point outside the Unicode range" } );
                                        
                                        return ret( yoke,
                                            jsList( { type: "scalars", val: scalar } ) );
                                    } else {
                                        return readDelimitedStringLurking( yoke,
                                            esc.suffix, qqStack, retWithModifier );
                                    }
                                } else if ( esc.name === "qq" ) {
                                    if ( qqStack.cache.get( "inQqLabel" ) )
                                        return then( yoke, { ok: false, msg:
                                            "Encountered -qq inside a quasiquotation label" } );
                                    
                                    return jsListAppend( yoke, prefix, asciiToEl( "-qq" ),
                                        function ( yoke, prefix ) {
                                        
                                        return readEscapeLurking( yoke, prefix, esc.suffix, {
                                            uq: qqStack,
                                            cache: qqStack.cache.plusObj( {
                                                names: readerStrMap()
                                            } )
                                        }, then );
                                    } );
                                } else if ( esc.name === "uq" ) {
                                    if ( qqStack.cache.get( "inQqLabel" ) )
                                        return then( yoke, { ok: false, msg:
                                            "Encountered -uq inside a quasiquotation label" } );
                                    else if ( qqStack.uq === null )
                                        return unexpected( yoke, "-uq at zero depth" );
                                    
                                    return jsListAppend( yoke, prefix, asciiToEl( "-uq" ),
                                        function ( yoke, prefix ) {
                                        
                                        return readEscapeLurking( yoke,
                                            prefix, esc.suffix, qqStack.uq, then );
                                    } );
                                } else if ( esc.name === "wq" ) {
                                    if ( qqStack.cache.get( "inQqLabel" ) )
                                        return then( yoke, { ok: false, msg:
                                            "Encountered -wq inside a quasiquotation label" } );
                                    
                                    return parseQqLabelEsc( yoke, esc, qqStack,
                                        function ( yoke, result ) {
                                        
                                        if ( !result.ok )
                                            return then( yoke, result );
                                        
                                        return escapeToString( yoke, result.val.first,
                                            function ( yoke, labelCode ) {
                                        return jsListFlattenOnce( yoke, jsList(
                                            prefix,
                                            asciiToEl( "-wq" ),
                                            result.val.pairPrefix,
                                            asciiToEl( "=" ),
                                            result.val.firstPrefix,
                                            labelCode
                                        ), function ( yoke, prefix ) {
                                        return qqStack.cache.get( "names" ).plusTruth( yoke,
                                            result.val.name,
                                            function ( yoke, names ) {
                                        
                                        return readEscapeLurking( yoke, prefix, result.val.second, {
                                            uq: qqStack.uq,
                                            cache: qqStack.cache.plusObj( {
                                                names: names
                                            } )
                                        }, then );
                                        
                                        } );
                                        } );
                                        } );
                                    } );
                                } else if ( esc.name === "rq" ) {
                                    if ( qqStack.cache.get( "inQqLabel" ) )
                                        return then( yoke, { ok: false, msg:
                                            "Encountered -rq inside a quasiquotation label" } );
                                    
                                    return parseQqLabelEsc( yoke, esc, qqStack,
                                        function ( yoke, result ) {
                                        
                                        if ( !result.ok )
                                            return then( yoke, result );
                                        
                                        return escapeToString( yoke, result.val.first,
                                            function ( yoke, labelCode ) {
                                        return jsListFlattenOnce( yoke, jsList(
                                            prefix,
                                            asciiToEl( "-rq" ),
                                            result.val.pairPrefix,
                                            asciiToEl( "=" ),
                                            result.val.firstPrefix,
                                            labelCode
                                        ), function ( yoke, prefix ) {
                                        
                                        return unwindingQqStack( yoke, qqStack );
                                        function unwindingQqStack( yoke, qqStack ) {
                                            return qqStack.cache.get( "names" ).has( yoke,
                                                result.val.name,
                                                function ( yoke, had ) {
                                                
                                                if ( had )
                                                    return readEscapeLurking( yoke,
                                                        prefix, result.val.second, qqStack, then );
                                                else if ( qqStack.uq === null )
                                                    return unexpected( yoke,
                                                        // TODO: Describe the unbound label. We'll need
                                                        // an error string that can get larger than
                                                        // JavaScript's strings.
                                                        "-rq= for an unbound label" );
                                                else
                                                    return unwindingQqStack( yoke, qqStack.uq );
                                            } );
                                        }
                                        
                                        } );
                                        } );
                                    } );
                                } else {
                                    return unexpected( yoke, "-" + esc.name );
                                }
                            } else if ( esc.type === "pair" ) {
                                return unexpected( yoke, "=" );
                            } else if ( esc.type === "comment" ) {
                                if ( qqStack.uq === null )
                                    return unexpected( yoke, "comment" );
                                else if ( qqStack.uq.uq === null )
                                    return ret( yoke, jsList() );
                                else
                                    return jsListFlattenOnce( yoke,
                                        jsList( prefix, asciiToEl( ";" ), esc.elements ), ret );
                                
                            } else if ( esc.type ===
                                "escapeDelimited" ) {
                                
                                return readDelimitedStringLurking( yoke,
                                    esc, qqStack,
                                    function ( yoke, result ) {
                                    
                                    if ( !result.ok )
                                        return then( yoke, result );
                                    
                                    return jsListAppend( yoke, prefix, result.val, ret );
                                } );
                            } else {
                                throw new Error();
                            }
                            
                            } );
                        };
                        return readEscapeLurking( yoke,
                            asciiToEl( "\\" ),
                            element.suffix,
                            qqStack,
                            function ( yoke, result ) {
                            
                            if ( !result.ok )
                                return then( yoke,
                                    result, !!"exitedEarly" );
                            return ret( yoke, result.val );
                        } );
                    } else if ( element.type === "textDelimited" ) {
                        return readStringLurking( yoke,
                            element.elements, qqStack,
                            function ( yoke, result ) {
                            
                            if ( !result.ok )
                                return then( yoke,
                                    result, !!"exitedEarly" );
                            
                            return jsListFlattenOnce( yoke, jsList(
                                asciiToEl( element.open ),
                                result.val,
                                asciiToEl(
                                    element.open === "/" ? "" : element.close )
                            ), ret );
                        } );
                    } else if ( element.type === "scalars" ) {
                        var c = element.val;
                        if ( /^[ \t\r\n]+$/.test( c ) ) {
                            if ( qqStack.cache.get( "inQqLabel" ) )
                                return ret( yoke, jsList(
                                    { type: "lurkVerify" },
                                    { type: "rawWhiteScalars", val: element.val }
                                ) );
                            else if ( qqStack.cache.
                                get( "normalizingWhitespace" ) )
                                return ret( yoke, jsList(
                                    { type: "lurkNormalize" },
                                    { type: "rawWhiteScalars", val: element.val }
                                ) );
                            else
                                return ret( yoke, jsList(
                                    { type: "rawWhiteScalars", val: element.val }
                                ) );
                        } else {
                            return ret( yoke, jsList( element ) );
                        }
                    } else {
                        throw new Error();
                    }
                }, function ( yoke, state, exitedEarly ) {
                    if ( exitedEarly )
                        return then( yoke, state );
                    return jsListRev( yoke, state,
                        function ( yoke, elements ) {
                        
                        return then( yoke, { ok: true, val:
                            elements } );
                    } );
                } );
                
                } );
            };
            var processLurkingCommands = function ( yoke,
                elements, then ) {
                
                function bankNormalization( yoke, state, then ) {
                    if ( state.verifying
                        && state.revWhite !== null
                        && (state.revWhite.rest !== null
                            || state.revWhite.first.val !== " ") )
                        return then( yoke, null );
                    else if ( state.normalizing
                        && state.revWhite !== null )
                        return next( asciiToEl( " " ) );
                    else
                        return next( state.revWhite );
                    
                    function next( revWhite ) {
                        return jsListAppend( yoke,
                            revWhite, state.revProcessed,
                            function ( yoke, revProcessed ) {
                            
                            return then( yoke,
                                { val: revProcessed } );
                        } );
                    }
                }
                
                return jsListFoldl( yoke, {
                    obliterating: false,
                    revProcessed: null
                }, elements, function ( yoke, state, element, then ) {
                    var defaultNextState = {
                        obliterating: false,
                        revProcessed:
                            { first: element,
                                rest: state.revProcessed }
                    };
                    var conditionalNextState =
                        state.obliterating ? state : defaultNextState;
                    
                    if ( element.type === "lurkObliteratePreceding" )
                        return then( yoke, conditionalNextState );
                    else if ( element.type ===
                        "lurkObliterateFollowing" )
                        return then( yoke, {
                            obliterating: true,
                            revProcessed: state.revProcessed
                        } );
                    else if ( element.type === "lurkNormalize" )
                        return then( yoke, conditionalNextState );
                    else if ( element.type === "lurkVerify" )
                        return then( yoke, conditionalNextState );
                    else if ( element.type === "rawWhiteScalars" )
                        return then( yoke, conditionalNextState );
                    else if ( element.type === "scalars" )
                        return then( yoke, defaultNextState );
                    else if ( element.type === "interpolation" )
                        return then( yoke, defaultNextState );
                    else
                        throw new Error();
                }, function ( yoke, state ) {
                
                return jsListFoldl( yoke, {
                    obliterating: false,
                    processed: null
                }, state.revProcessed,
                    function ( yoke, state, element, then ) {
                    
                    var defaultNextState = {
                        obliterating: false,
                        processed:
                            { first: element, rest: state.processed }
                    };
                    var conditionalNextState =
                        state.obliterating ? state : defaultNextState;
                    
                    if ( element.type === "lurkObliteratePreceding" )
                        return then( yoke, {
                            obliterating: true,
                            processed: state.processed
                        } );
                    else if ( element.type ===
                        "lurkObliterateFollowing" )
                        throw new Error();
                    else if ( element.type === "lurkNormalize" )
                        return then( yoke, conditionalNextState );
                    else if ( element.type === "lurkVerify" )
                        return then( yoke, conditionalNextState );
                    else if ( element.type === "rawWhiteScalars" )
                        return then( yoke, conditionalNextState );
                    else if ( element.type === "scalars" )
                        return then( yoke, defaultNextState );
                    else if ( element.type === "interpolation" )
                        return then( yoke, defaultNextState );
                    else
                        throw new Error();
                }, function ( yoke, state ) {
                
                return jsListFoldl( yoke, {
                    verifying: false,
                    normalizing: false,
                    revWhite: null,
                    revProcessed: null
                }, state.processed,
                    function ( yoke, state, element, then ) {
                    
                    if ( element.type === "lurkObliteratePreceding" )
                        throw new Error();
                    else if ( element.type ===
                        "lurkObliterateFollowing" )
                        throw new Error();
                    else if ( element.type === "lurkNormalize" )
                        return then( yoke, {
                            verifying: state.verifying,
                            normalizing: true,
                            revWhite: state.revWhite,
                            revProcessed: state.revProcessed
                        }, !"exitedEarly" );
                    else if ( element.type === "lurkVerify" )
                        return then( yoke, {
                            verifying: true,
                            normalizing: true,
                            revWhite: state.revWhite,
                            revProcessed: state.revProcessed
                        }, !"exitedEarly" );
                    else if ( element.type === "rawWhiteScalars" )
                        return then( yoke, {
                            verifying: state.verifying,
                            normalizing: state.normalizing,
                            revWhite:
                                { first:
                                    { type: "scalars", val: element.val },
                                    rest: state.revWhite },
                            revProcessed: state.revProcessed
                        }, !"exitedEarly" );
                    else if ( element.type === "scalars" )
                        return bankAndAdd();
                    else if ( element.type === "interpolation" )
                        return bankAndAdd();
                    else
                        throw new Error();
                    
                    function bankAndAdd() {
                        return bankNormalization( yoke, state,
                            function ( yoke, maybeRevProcessed ) {
                            
                            if ( maybeRevProcessed === null )
                                return then( yoke,
                                    null, !!"exitedEarly" );
                            else
                                return then( yoke, {
                                    verifying: false,
                                    normalizing: false,
                                    revWhite: null,
                                    revProcessed: { first: element,
                                        rest: maybeRevProcessed.val }
                                }, !"exitedEarly" );
                        } );
                    }
                }, function ( yoke, state, exitedEarly ) {
                    
                    function err( yoke ) {
                        return then( yoke, { ok: false, msg:
                            "Encountered a nontrivial sequence of " +
                            "raw whitespace in a quasiquotation " +
                            "label" } );
                    }
                    
                    if ( exitedEarly )
                        return err( yoke );
                    return bankNormalization( yoke, state,
                        function ( yoke, maybeRevProcessed ) {
                        
                        if ( maybeRevProcessed === null )
                            return err( yoke );
                        else
                            return jsListRev( yoke,
                                maybeRevProcessed.val,
                                function ( yoke, processed ) {
                                
                                return then( yoke, { ok: true, val:
                                    processed } );
                            } );
                    } );
                } );
                
                } );
                
                } );
            };
            var readString = function ( yoke,
                elements, qqStack, then ) {
                
                return readStringLurking( yoke, elements, qqStack,
                    function ( yoke, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, result );
                    
                    if ( qqStack.cache.
                        get( "normalizingWhitespace" ) )
                        return jsListFlattenOnce( yoke, jsList(
                            jsList(
                                { type: "lurkObliterateFollowing" } ),
                            result.val,
                            jsList(
                                { type: "lurkObliteratePreceding" } )
                        ), next );
                    else
                        return next( yoke, result.val );
                    
                    function next( yoke, elements ) {
                        return processLurkingCommands( yoke, elements,
                            function ( yoke, result ) {
                            
                            if ( !result.ok )
                                return then( yoke, result );
                        
                        return jsListRev( yoke, result.val,
                            function ( yoke, revElements ) {
                        
                        return jsListFoldl( yoke,
                            { type: "stringNil", string: null },
                            revElements,
                            function ( yoke, state, element, then ) {
                            
                            if ( element.type === "scalars" ) {
                                var string = { first: element.val, rest: state.string };
                                if ( state.type === "stringNil" )
                                    return then( yoke, { type: "stringNil", string: string } );
                                else if ( state.type === "stringCons" )
                                    return then( yoke,
                                        { type: "stringCons",
                                            string: string,
                                            interpolation: state.interpolation,
                                            rest: state.rest } );
                                else
                                    throw new Error();
                            } else if ( element.type ===
                                "interpolation" ) {
                                return then( yoke,
                                    { type: "stringCons",
                                        string: null,
                                        interpolation: element.val,
                                        rest: state } );
                            } else {
                                throw new Error();
                            }
                        }, function ( yoke, result ) {
                        
                        return then( yoke, { ok: true, val:
                            result } );
                        
                        } );
                        
                        } );
                        
                        } );
                    }
                } );
            };
            var readQqLabel = function ( yoke, qqStack,
                encompassingClosingBracket, elements, then ) {
                
                // We read the string elements as a string with
                // whitespace discouraged and no interpolations, and
                // we call then( yoke, { ok: true, val: _ } ) with the
                // result as a linked list of code points.
                return readString( yoke, elements, {
                    uq: qqStack.uq,
                    cache: qqStack.cache.plusObj( {
                        names: readerStrMap(),
                        encompassingClosingBracket:
                            encompassingClosingBracket,
                        
                        // TODO: Make sure when the value is null like
                        // this, we don't allow any peeking avoidance.
                        encompassingClosingBracketIsInString: null,
                        
                        normalizingWhitespace: false,
                        inQqLabel: true
                    } )
                }, function ( yoke, result ) {
                    if ( !result.ok )
                        return then( yoke, result );
                    if ( result.val.type !== "stringNil" )
                        throw new Error();
                    return then( yoke, { ok: true, val:
                        result.val.string } );
                } );
            };
            return withQqStack( yoke, {
                uq: null,
                cache: strMap().plusObj( {
                    names: readerStrMap(),
                    encompassingClosingBracket:
                        encompassingClosingBracket,
                    encompassingClosingBracketIsInString: false,
                    normalizingWhitespace: true,
                    inQqLabel: false
                } )
            }, result.val.val.suffix );
        } else if ( result.val.val.type === "textDelimited" ) {
            return continueListFromElements( yoke,
                result.val.val.elements,
                result.val.val.open === "/" ?
                    encompassingClosingBracket :
                    result.val.val.close );
        } else if ( result.val.val.type === "scalars" ) {
            var c = result.val.val.val;
            if ( /^[ \t]+$/.test( c ) ) {
                return readSexpOrInfixOp( yoke, s,
                    encompassingClosingBracket, then );
            } else if ( /^[\r\n]$/.test( c ) ) {
                return then( yoke, s, { ok: true, val:
                    { val: { type: "infixNewline" } } } );
            } else if ( /^[-*a-z01-9]+$/i.test( c ) ) {
                // We read any number of code points in this set to
                // build a string.
                var loop = function ( yoke, s, revElements ) {
                    return s.peek( yoke,
                        function ( yoke, s, result ) {
                        
                        if ( !result.ok )
                            return then( yoke, s, result );
                        
                        if ( result.val !== null
                            && result.val.val.type === "scalars"
                            && /^[-*a-z01-9]+$/i.test(
                                result.val.val.val ) )
                            return s.read( yoke,
                                function ( yoke, s, result ) {
                                
                                if ( !result.ok )
                                    return then( yoke, s, result );
                                
                                return loop( yoke, s,
                                    { first: result.val.val.val, rest: revElements } );
                            } );
                        else
                            return jsListRev( yoke, revElements,
                                function ( yoke, elements ) {
                                
                                return then( yoke, s, { ok: true, val:
                                    { val: { type: "stringNil", string: elements } } } );
                            } );
                    } );
                };
                return loop( yoke, s, jsList( c ) );
            } else if ( result.val.val.val === "/" ) {
                if ( encompassingClosingBracket === null )
                    return then( yoke, s, { ok: false, msg:
                        "Expected s-expression, got / with no " +
                        "encompassing closing bracket" } );
                return readList( yoke, s,
                    encompassingClosingBracket,
                    function ( yoke, s, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, s, result );
                    return then( yoke, s, { ok: true, val:
                        { val: result.val } } );
                } );
            } else if ( result.val.val.val === "." ) {
                return then( yoke, s, { ok: true, val:
                    { val: { type: "infixDot" } } } );
            } else {
                return then( yoke, s, { ok: false, msg:
                    "Expected s-expression, got unrecognized code " +
                    "point " +
                    readerJsStringPretty( result.val.val.val ) } );
            }
        } else {
            throw new Error();
        }
        
        function continueListFromElements( yoke,
            elements, encompassingClosingBracket ) {
            
            return readList( yoke, listToStream( elements ),
                encompassingClosingBracket,
                function ( yoke, emptyElementsStream, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                return then( yoke, s, { ok: true, val:
                    { val: result.val } } );
            } );
        }
        function readList( yoke, s,
            encompassingClosingBracket, then ) {
            
            // This reads the remainder of the stream as a list. It
            // ignores the "infixNewline" values, and it processes the
            // "infixDot" values.
            
            return exhaustStream( yoke,
                customStream(
                    customStream( s, function ( yoke, s, then ) {
                        return readSexpOrInfixOp( yoke, s,
                            encompassingClosingBracket, then );
                    } ),
                    function ( yoke, s, then ) {
                        return readSexp( yoke, s,
                            !"heedCommandEnds", then );
                    }
                ),
                function ( yoke, emptyStream, result ) {
                
                var s = emptyStream.underlyingStream.underlyingStream;
                
                if ( !result.ok )
                    return then( yoke, s, { ok: false, msg:
                        result.msg } );
                
                return jsListRev( yoke, result.val,
                    function ( yoke, revJsList ) {
                    
                    return loop( yoke, revJsList, { type: "nil" } );
                    function loop( yoke, revJsList, sexpList ) {
                        return runWaitOne( yoke, function ( yoke ) {
                            if ( revJsList === null )
                                return then( yoke, s, { ok: true, val:
                                    sexpList } );
                            else
                                return loop( yoke, revJsList.rest,
                                    { type: "cons",
                                        first: revJsList.first,
                                        rest: sexpList } );
                        } );
                    }
                } )
            } );
        }
    } );
}
// NOTE: For this, `s` must be a stream of readSexpOrInfixOp results.
function readSexp( yoke, s, heedCommandEnds, then ) {
    return loop( yoke, s, null );
    function loop( yoke, s, maybeLhs, recentDot ) {
        return s.peek( yoke, function ( yoke, s, result ) {
            
            if ( !result.ok )
                return then( yoke, s, result );
            
            function complain() {
                return then( yoke, s, { ok: false, msg:
                    "Expected s-expression, encountered . outside " +
                    "an infix context" } );
            }
            
            if ( result.val === null ) {
                if ( recentDot )
                    return complain();
                return then( yoke, s, { ok: true, val: maybeLhs } );
            } else if ( result.val.val.type === "infixNewline" ) {
                return s.read( yoke, function ( yoke, s, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, s, result );
                    
                    if ( maybeLhs !== null && heedCommandEnds ) {
                        if ( recentDot )
                            return complain();
                        return then( yoke, s, { ok: true, val:
                            maybeLhs } );
                    } else {
                        return loop( yoke, s, maybeLhs, recentDot );
                    }
                } );
            } else if ( result.val.val.type === "infixDot" ) {
                return s.read( yoke, function ( yoke, s, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, s, result );
                    else if ( maybeLhs === null || recentDot )
                        return complain();
                    
                    return loop( yoke, s, maybeLhs, !!"recentDot" );
                } );
            } else {
                if ( recentDot )
                    return s.read( yoke,
                        function ( yoke, s, result ) {
                        
                        if ( !result.ok )
                            return then( yoke, s, result );
                        
                        return loop( yoke, s,
                            { val:
                                { type: "cons", first: maybeLhs.val,
                                    rest: { type: "cons",
                                        first: result.val.val,
                                        rest: { type: "nil" } } } },
                            !"recentDot" );
                    } );
                else if ( maybeLhs !== null )
                    return then( yoke, s, { ok: true, val:
                        maybeLhs } );
                else
                    return s.read( yoke,
                        function ( yoke, s, result ) {
                        
                        if ( !result.ok )
                            return then( yoke, s, result );
                        
                        return loop( yoke, s,
                            { val: result.val.val },
                            !"recentDot" );
                    } );
            }
        } );
    }
}

function readAll( string ) {
    return runSyncYoke( null, function ( yoke, then ) {
        return exhaustStream( yoke, customStream(
            customStream(
                customStream(
                    stringToClassifiedTokenStream( string ),
                    function ( yoke, s, then ) {
                        return readStringElement( yoke, s, then );
                    }
                ),
                function ( yoke, s, then ) {
                    var encompassingClosingBracket = null;
                    return readSexpOrInfixOp( yoke, s,
                        encompassingClosingBracket, then );
                }
            ),
            function ( yoke, s, then ) {
                return readSexp( yoke, s,
                    !!"heedCommandEnds", then );
            }
        ), function ( yoke, emptyStream, result ) {
            return jsListRev( yoke, result.val,
                function ( yoke, revVals ) {
                
                return loop( yoke, revVals,
                    result.ok ? [] :
                        [ { ok: false, msg: result.msg } ] );
                function loop( yoke, revVals, arr ) {
                    return runWaitOne( yoke, function ( yoke ) {
                        if ( revVals === null )
                            return then( yoke, arr );
                        else
                            return loop( yoke, revVals.rest,
                                [ { ok: true, val: revVals.first }
                                    ].concat( arr ) );
                    } );
                }
            } );
        } );
    } ).result;
}
