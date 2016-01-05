// era-reader.js
// Copyright 2013-2016 Ross Angle. Released under the MIT License.
"use strict";

// This is a reader for Era's own dialect of s-expressions.
//
// After reading, the s-expression format is simple:
//
//   - An s-expression is either a list or an interpolated string.
//   - A list is either empty or an s-expression followed by a list.
//   - An interpolated string is an uninterpolated string, optionally
//     followed by an s-expression and an interpolated string.
//   - An uninterpolated string is a sequence of Unicode scalars
//     (integers 0x0..0x10FFFF but excluding UTF-16 surrogates
//     0xD800..0xDFFF).
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
//       syntax supports string literals \;qq[...]. A string literal
//       can contain *practically* any text, and that text will be
//       *mostly* reflected in the reader's final result.
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
//     - Solution: This string syntax uses an escape sequences
//       \;qq[...] that looks exactly like the string syntax itself,
//       and the sole purpose of this escape sequence is for
//       generating code that contains this string syntax. Escape
//       sequences occurring inside these brackets are suppressed, so
//       \n generates "\n" rather than a newline, and so on. Thanks to
//       this, every stage of generated code looks almost entirely the
//       same.
//
//     - Problem: The escape sequence \;qq[...] generates both "\;qq["
//       and "]" in a single string, and sometimes I want to insert a
//       value in the middle. I could write this as a concatenation
//       bookended by one string that escapes \;qq[ as \^;qq\<` and
//       one that escapes ] as \>` but I'd rather not make such a
//       pervasive syntax replacement for such a focused insertion.
//
//     - Solution: There's an interpolation escape sequence \;uq;ls...
//       which lets s-expressions be interspersed with other string
//       parts at read time. This way both \;qq[ and ] can be part of
//       the same string literal, even if there's an interpolation in
//       the middle.
//
//     - Problem: Wouldn't that be suppressed like any other escape
//       sequence inside the \;qq[...] boundaries?
//
//     - Solution: All escape sequences can actually be un-suppressed
//       any number of levels by writing things like
//       \;uq;uq;uq;uq;ls... for example. The escape sequence
//       \;uq;ls... is actually \;ls... modified by \;uq and \;qq[...]
//       is \[...] modified by \;qq. The function of \;qq and \;uq is
//       to suppress and un-suppress escape sequences respectively.
//
//     - Problem: Different stages of code still look different
//       because some of them use \;uq;ls... while others have to use
//       \;uq;uq;uq;uq;ls... in its place. If I refactor my code to
//       add or remove a stage before or after all other stages, I'm
//       fine, but if I refactor it to add or remove a stage somewhere
//       in the middle, I have to go all over my code to add or remove
//       ";uq".
//
//     - Solution: You can use \;(wq foo);qq... to locally define the
//       name "foo" to refer to the current quasiquotation level
//       before you start a new one. Then you can use \;(rq foo)... to
//       rewind back to the original level. Altogether, you can write
//       \;(wq foo);qq[...\;(rq foo);ls(...)...] instead of
//       \;qq[...\;uq;ls(...)...] for example.
//
//     - Problem: I'm generating an \;uq;ls... interpolation sequence,
//       and I want to build the inserted s-expression by string
//       concatenation. However, that means it won't really be an
//       s-expression; it will have string interpolations interspersed
//       in its code. This means I can't necessarily count on the
//       reader to know where a suppressed \;uq;ls... begins and ends.
//
//     - Solution: That's definitely an issue if some of the strings
//       you're inserting have unmatched delimiters. Other cases
//       should be fine, because the syntax first parses the
//       s-expression using a "naive" mode which mostly matches the
//       syntax of strings.
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
//     - Solution: The \;qq[...] string syntax collapses all
//       whitespace. It also supports whitespace escapes for local
//       cases when that behavior is unwanted, such as blank lines
//       between natural-language paragraphs.
//
//     - Problem: Sometimes I do want to be picky about whitespace,
//       such as when I'm writing my natural-language prose in some
//       kind of markdown format.
//
//     - Solution: The \;yp;in[...] escape sequence lets you write a
//       span of preformatted text, where whitespace is not collapsed.
//       You can write \;qq;yp[...] if you want this setting to apply
//       to the whole string, and you can write \;np;in[...] around
//       any span of text that should not be considered preformatted.
//       (TODO: Actually implement \;in[...] so this can work.)
//
// The design we've settled on at this point is the following:

// <other safe> ::= ("=" | ";" | "'" | "," | "." | "/")
// <other> ::= (<other safe> | "\" | "(" | ")" | "[" | "]")
// <other delim> ::= (<other> | "`")
// <tx> ::= ...any printable character except <other delim>
// <nl> ::= ...any line break character or CRLF
// <ws> ::= ...any whitespace character except <nl>
// <end> ::= ...the end of the document
// <wsnl> ::= (<ws> | <nl>)
// <string element> ::= (<tx> | <other safe>)*
//   // Ambiguity resolution: Doesn't matter. (Actually, the entire
//   // reader syntax should have no ambiguity that makes a
//   // difference, unless there's a bug. That's what all the
//   // lookaheads are here to ensure.)
//
// <string element> ::= <wsnl>*
//   // Ambiguity resolution: Doesn't matter.
//   //
//   // If preformatting is off, this is a span of raw whitespace
//   // surrounded by lurking commands to normalize it along with all
//   // preceding and following raw whitespace. Otherwise, it's just a
//   // span of raw whitespace. Normalizing whitespace means turning
//   // one or more raw whitespace characters into a single space.
//
// <string element> ::= "[" <string element>* "]"
// <string element> ::= "(" <string element>* ")"
//   // This represents the contents surrounded by brackets.
//   //
//   // NOTE: This gives us delimiters we can use without any need to
//   // escape the same delimiters when they're used inside. This is
//   // useful for expression languages. We reserve two delimiters for
//   // use this way: The delimiter ( ) is very common for expression
//   // languages, and it's sometimes easier to type thanks to its use
//   // in English. The delimiter [ ] is unshifted on an American
//   // keyboard, and it's more visually distinct from ( ) than { }
//   // is. By not reserving the delimiter { } in the same way, we
//   // leave open the possibility of syntaxes where some delimiters
//   // don't need to be balanced, with one example being our own \{
//   // and \} escape sequences.
//
// <string element> ::= <string escape>
//
// <string escape> ::= "\" <escape>
//   // What this represents varies by the escape sequence.
//   //
//   // When processing an escape sequence, occurrences of whitespace
//   // and comments are ignored, delimiters are normalized, and
//   // occurrences of reader depth modifiers are collected.
//   // Occurrences of \;__ unflatten their first s-expressions, but
//   // these s-expressions may still be treated as string data as
//   // well.
//   //
//   // At any quasiquotation depth greater than the depths listed
//   // here, the escape sequences are suppressed, treated as
//   // uninterpreted string data.
//   //
//   // Occurrences of \_ at a depth of 0 or 1, where _ is an
//   // s-expression, unflatten their s-expressions.
//   //
//   // \^ \< \> \{ \} at a depth of 1 represent \ [ ] ( )
//   // \s \t \r \n at a depth of 1 represent space, tab, carriage
//   //   return, newline as non-raw whitespace, surrounded by lurking
//   //   commands to eliminate all preceding and following raw
//   //   whitespace.
//   // \c (meaning "concatenate") at a depth of 1 represents a
//   //   lurking command to eliminate all preceding and following raw
//   //   whitespace.
//   // \;in(_) (meaning "inline") represents its body's contents
//   //   without the brackets, unpeeked, surrounded with lurking
//   //   commands that inhibit other lurking commands from passing
//   //   through.
//   //   // TODO: Implement this.
//   // \=_ \;rm_ at a depth of 1 represent empty strings. This is
//   //   useful for comments.
//   // \(ch _) at a depth of 1 represents the Unicode scalar value
//   //   obtained by parsing the given string as a hexadecimal
//   //   number.
//   // \;ls_ (meaning "lists and strings") at a depth of 0, where _
//   //   is an s-expression, represents an interpolation of the given
//   //   s-expression into the string.
//
// <rm> ::= <ws>
//
// <rm> ::= "\" <escape>
//   // What this represents does not actually vary by the escape
//   // sequence, but the accepted escape sequences are listed below.
//   //
//   // When processing an escape sequence, occurrences of whitespace
//   // and comments are ignored, delimiters are normalized, and
//   // occurrences of reader depth modifiers are collected.
//   // Occurrences of \;__ unflatten their first s-expressions, but
//   // these s-expressions may still be treated as string data as
//   // well.
//   //
//   // \=_ \;rm_ at a depth of 0 represent comments.
//
// <rmnl> ::= (<rm> | <nl>)
//
// <escape> ::= <rmnl>* <escape>
//   // Ambiguity resolution: Doesn't matter.
// <escape> ::= ";" <escape> <escape>
//   // NOTE: The character ; suggests two-ness in its shape.
// <escape> ::=
//   lookahead("[" | "(" | "/" | "`" | <tx>)
//   <naive non-infix s-expression>
// <escape> ::=
//   "=" (<tx> | <ws> | <other delim>)* lookahead(<nl> | <end>)
// // NOTE: We don't have escape sequences \) or \] because any such
// // sequence would need to have both its characters escaped to be
// // represented as a string, since otherwise this syntax would
// // interpret the ) or ] in other ways.
// //
// // NOTE: We're specifically avoiding special-casing certain
// // characters in the syntax altogether:
// //
// //  ~ ! @ # $ % ^ & * _ + { } | : " < > ? are shifted on an
// //    American keyboard, so they're a last resort, and we've made
// //    them valid identifier characters. Identifier characters
// //    include Basic Latin letters and digits and the - character as
// //    well. Some identifiers are special-cased in escape sequences,
// //    in the spirit of reserved words.
// //
// //  ' , just haven't been used yet. However, they're specifically
// //    invalid as identifier characters just in case.
//
// <naive non-infix s-expression> ::= "[" <string element>* "]"
// <naive non-infix s-expression> ::= "(" <string element>* ")"
// <naive non-infix s-expression> ::=
//   "/" <string element>* lookahead("]" | ")")
// <naive non-infix s-expression> ::=
//   "`"? (<tx> | <string escape>)+
//   ("`" | lookahead(<wsnl> | <other> | <end>))
//
// <s-expression> ::=
//   <s-expression> <rmnl>* "." <non-infix s-expression>
//   // This represents a two-element list.
// <s-expression> ::= <non-infix s-expression>
// <non-infix s-expression> ::= <rmnl>* <non-infix s-expression>
//   // Ambiguity resolution: Doesn't matter.
// <non-infix s-expression> ::= "[" <s-expression>* <rmnl>* "]"
// <non-infix s-expression> ::= "(" <s-expression>* <rmnl>* ")"
// <non-infix s-expression> ::=
//   "/" <s-expression>* <rmnl>* lookahead("]" | ")")
// <non-infix s-expression> ::=
//   "`"? <tx>+ ("`" | lookahead(<wsnl> | <other> | <end>))
//   // This represents a string s-expression. It can only express
//   // certain strings.
//
// <non-infix s-expression> ::=
//   "`"? "\" <escape> ("`" | lookahead(<wsnl> | <other> | <end>))
//   // What this represents varies by the escape sequence.
//   //
//   // When processing an escape sequence, occurrences of whitespace
//   // and comments are ignored, delimiters are normalized, and
//   // occurrences of reader depth modifiers are collected.
//   // Occurrences of \;__ unflatten their first s-expressions, but
//   // these s-expressions may still be treated as string data as
//   // well.
//   //
//   // \_ at a depth of 0, where _ is an s-expression, unflattens its
//   //   s-expression, and it represents its s-expression value. This
//   //   is useful because it means the code (... \;qq/\/a b ...)
//   //   generates an s-expression equivalent to that generated by
//   //   (... \;qq/(a b ...)), but without requiring an extra ending
//   //   bracket.
//   //   //
//   //   // NOTE: It wouldn't be the same to write
//   //   // (... \;qq//a b ...) because / intentionally has no
//   //   // special meaning in a string. Existing textual syntaxes
//   //   // tend to use / for things like division, comments, and
//   //   // markup end tags, and if we had a special meaning for / it
//   //   // would be more cumbersome to generate these syntaxes.
//   //
//   // \(_) at a depth of 1 represents an interpolated string
//   //   s-expression. The contents are unpeeked. If preformatting is
//   //   off, the string is surrounded by lurking commands to
//   //   eliminate its leading and trailing whitespace. Whether
//   //   preformatting is on or not, the lurking commands in the
//   //   string are processed.
//
// <top-level s-expression> ::=
//   <top-level s-expression> <rm>* "." <non-infix s-expression>
//   // This represents a two-element list.
// <top-level s-expression> ::= <non-infix s-expression>
//
// <top level> ::= <top-level s-expression>* <rmnl>*
//   // This unflattens each s-expression, and it represents the
//   // sequence of their s-expression values. This sequence can be
//   // parsed incrementally from first to last.


// Reader depth modifiers:
//
// These modify escape sequences. For instance, \() can be modified as
// by ;qq by writing \;qq().
//
// ;yp (meaning "yes preformatting") turns preformatting on for as
//   long as the current quasiquotation depth lasts.
// ;np (meaning "no preformatting") turns preformatting on for as long
//   as the current quasiquotation depth lasts.
// ;qq (meaning "quasiquote") increases the depth by 1.
// ;uq (meaning "unquote") decreases the depth by 1.
// ;(wq _) (meaning "with current quasiquotation level") lets the
//   given string be bound to the current quasiquotation depth in the
//   quasiquotation depth environment for as long as the current
//   quasiquotation depth lasts.
// ;(lq _ _) (meaning "let quasiquotation level") looks up the
//   quasiquotation depth the second given string is bound to in the
//   quasiquotation depth environment, and it lets the first given
//   string be bound to that quasiquotation depth in the
//   quasiquotation depth environment for as long as the current
//   quasiquotation depth lasts.
//   // TODO: Implement this.
// ;(rq _) (meaning "restore quasiquotation level") looks up the
//   quasiquotation depth the given string is bound to in the
//   quasiquotation depth environment, and it decreases the
//   quasiquotation depth to that.

// NOTE: We give most escape sequences two-letter names because that
// that's a little more mnemonic than the traditional one-letter
// names. It also lets us use "l" and "o" without confusing them with
// digits, lets us avoid resorting to idiosyncratic capitalization,
// and gives us a three-character string like ";pr" we can grep for.
// For escapes dedicated to single characters, we use short escape
// sequences with punctuation like \< or letters like \t depending on
// whether the original character was already punctuation. The
// substitute punctuation helps it continue to stand out.

// Whenever an s-expression is unflattened, for the initial state of
// that unflattening, the quasiquotation depth is 0, the
// quasiquotation depth environment is empty, and preformatting is
// off. Until an s-expression is unflattened, it's just treated as
// string data, and it can contain string escape sequences that
// wouldn't be valid in an s-expression. This way, an s-expression can
// be built up by string concatenation.

// Whenever a delimited sequence of string elements is unpeeked, if
// any suppressed escape sequence in the string uses a / delimiter
// that ends at the same place the whole sequence ends, that
// suppressed / delimiter is converted to a suppressed [ ] or ( )
// delimiter corresponding to the whole sequence's closing delimiter.


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
        var regex =
            /[ \t]+|[\r\n`=;',\.\\/()\[\]]|[^ \t\r\n`=;',\.\\/()\[\]]*/g;
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
        else if ( /^[=;',]$/.test( c ) )
            return then( yoke, s, { ok: false, msg:
                "Expected s-expression, encountered " + c } );
        else if ( /^[ \t\r\n]*$/.test( c ) )
            return readNaiveSexpStringElements( yoke, s,
                { first: { type: "scalars", val: c },
                    rest: revSoFar },
                then );
        else if ( /^[(\[]$/.test( c ) )
            return readStringElement( yoke, s,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                if ( result.val === null )
                    throw new Error();
                return next( yoke, s, result.val.val );
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
        else if ( c === "`" )
            return s.read( yoke, function ( yoke, s, result ) {
                return readIdentifier( yoke, s, !"any",
                    { first: { type: "scalars", val: c },
                        rest: revSoFar } );
            } );
        else
            return readIdentifier( yoke, s, !"any", revSoFar );
        
        function next( yoke, s, last ) {
            return jsListRev( yoke, { first: last, rest: revSoFar },
                function ( yoke, elements ) {
                
                return then( yoke, s, { ok: true, val: elements } );
            } );
        }
    } );
    
    function readIdentifier( yoke, s, any, revSoFar ) {
        return s.peek( yoke, function ( yoke, s, result ) {
            if ( !result.ok )
                return then( yoke, s, result );
            
            if ( result.val === null )
                return next( yoke, s, revSoFar );
            
            var c = result.val.val;
            if ( /^[ \t\r\n=;',\./()\[\]]*$/.test( c ) )
                return next( yoke, s, revSoFar );
            else if ( c === "`" )
                return s.read( yoke, function ( yoke, s, result ) {
                    return next( yoke, s,
                        { first: { type: "scalars", val: c },
                            rest: revSoFar } );
                } );
            else if ( c === "\\" )
                return s.read( yoke, function ( yoke, s, result ) {
                    return readEscape( yoke, s,
                        function ( yoke, s, result ) {
                        
                        if ( !result.ok )
                            return then( yoke, s, result );
                        return readIdentifier( yoke, s, !!"any",
                            { first:
                                { type: "escape",
                                    suffix: result.val },
                                rest: revSoFar } );
                    } );
                } );
            else
                return s.read( yoke, function ( yoke, s, result ) {
                    return readIdentifier( yoke, s, !!"any",
                        { first: { type: "scalars", val: c },
                            rest: revSoFar } );
                } );
            
            function next( yoke, s, revSoFar ) {
                if ( !any )
                    return then( yoke, s, { ok: false, msg:
                        "Expected s-expression, encountered , with" +
                        "no identifier or \\ after it" } );
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
//   - The value contains an "naiveSexp" escape suffix, and its
//     opening bracket is / but it is not in a context where its
//     closing bracket will be in the expected place.
//   - The element contains a "scalars" string element whose value is
//     \ ( ) [ ] or whitespace.
//
// If the value was created by parsing in the first place, these cases
// should be impossible anyway, aside from the fact that a "naiveSexp"
// whose opening bracket is / may run up to the end of the string.
function stringElementsToString( yoke, elements, then ) {
    return jsListMappend( yoke, elements,
        function ( yoke, element, then ) {
        
        return stringElementToString( yoke, element, then );
    }, then );
}
function escapeToString( yoke, esc, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( esc.type === "pair" ) {
            return escapeToString( yoke, esc.first,
                function ( yoke, first ) {
            return escapeToString( yoke, esc.second,
                function ( yoke, second ) {
            
            return jsListFlattenOnce( yoke,
                jsList( asciiToEl( ";" ), first, second ), then );
            
            } );
            } );
        } else if ( esc.type === "spaced" ) {
            return jsListAppend( yoke, esc.space, esc.suffix, then );
        } else if ( esc.type === "commented" ) {
            return escapeToString( yoke, esc.comment,
                function ( yoke, comment ) {
            
            return jsListFlattenOnce( yoke,
                jsList( asciiToEl( "\\" ), comment, esc.suffix ),
                then );
            
            } );
        } else if ( esc.type === "comment" ) {
            return jsListAppend( yoke,
                asciiToEl( "=" ), esc.elements, then );
        } else if ( esc.type === "naiveSexp" ) {
            return stringElementsToString( yoke, esc.elements, then );
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
                // TODO: Remove the trailing ` when possible.
                replace( /\\/g, "\\^`" );
            // We temporarily represent interpolations using the
            // invalid escape sequence \'~. This lets us put all the
            // string contents into one JavaScript string, which lets
            // us discover matching brackets even if they have an
            // interpolation in between. Later on, we replace these
            // invalid escape sequences with the proper
            // interpolations.
            s += "\\'~";
            terps.push( readerExprPretty( e.interpolation ) );
            e = e.rest;
        }
        if ( e.type !== "stringNil" )
            throw new Error();
        // TODO: Remove the trailing ` when possible.
        s += readerStringNilToString( e ).replace( /\\/g, "\\^`" );
        var lastTerpAtEnd = /\\'~$/.test( s );
        
        while ( true ) {
            // If there are matching brackets, we want to display them
            // as raw brackets rather than escape sequences. To do so,
            // we temporarily convert them to the invalid escape
            // sequences \'< \'> \'{ \'}, then escape all the
            // non-matching brackets, then replace these invalid
            // escape sequences with raw brackets again.
            var s2 = s.
                replace( /\[([^()\[\]]*)\]/g, "\\'<$1\\'>" ).
                replace( /\(([^()\[\]]*)\)/g, "\\'{$1\\'}" );
            if ( s === s2 )
                break;
            s = s2;
        }
        s = s.
            // TODO: Remove the trailing ` when possible.
            replace( /\[/g, "\\<`" ).replace( /\]/g, "\\>`" ).
            replace( /\(/g, "\\{`" ).replace( /\)/g, "\\}`" ).
            replace( /\\'</g, "[" ).replace( /\\'>/g, "]" ).
            replace( /\\'{/g, "(" ).replace( /\\'}/g, ")" ).
            replace( /[ \t\r\n]+[a-zA-Z]?/g, function ( whitespace ) {
                if ( /^ [a-zA-Z]?$/.test( whitespace ) )
                    return whitespace;
                // NOTE: We insert an underscore as a placeholder, and
                // then we safely convert it to a raw space after the
                // spaces have been replaced with explicit whitespace
                // escape sequences.
                // TODO: Remove the trailing ` when possible.
                return whitespace.
                    replace( /[a-zA-Z]/g, "_$&" ).
                    replace( / /g, "\\s`" ).
                    replace( /\t/g, "\\t`" ).
                    replace( /\r/g, "\\r`" ).
                    replace( /\n/g, "\\n`" ).
                    replace( /_/g, " " );
            } ).
            replace( /\\'~/g, function () {
                var terp = terps.shift();
                var m;
                if ( lastTerpAtEnd && terps.length === 0 ) {
                    if ( m = /^\\;qq\[(.*)\]$/.exec( terp ) )
                        return "\\;uq;ls`\\;qq/" + m[ 1 ];
                    else if ( m = /^\((.*)\)$/.exec( terp ) )
                        return "\\;uq;ls/" + m[ 1 ];
                    else
                        return "\\;uq;ls`" + terp;
                } else {
                    if ( /^\\;qq\[.*\]$/.test( terp ) )
                        // TODO: Remove the trailing ` when possible.
                        return "\\;uq;ls`" + terp + "`";
                    else if ( m = /^\((.*)\)$/.exec( terp ) )
                        return "\\;uq;ls" + m[ 1 ];
                    else
                        return "\\;uq;ls`" + terp;
                }
            } );
        return /^[^ \t\r\n`=;',\./()\[\]]*$/.test( s ) ? s :
            "\\;qq[" + s + "]";
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
        
        
        var c = result.val.val;
        if ( /^[)\]]$/.test( c ) )
            return then( yoke, s, { ok: false, msg:
                "Unmatched " + c + " in escape sequence suffix" } );
        else if ( /^[',\.]$/.test( c ) )
            return then( yoke, s, { ok: false, msg:
                "Expected escape sequence suffix, got " + c } );
        else if ( c === "\\" )
            return s.read( yoke, function ( yoke, s, result ) {
            return readEscape( yoke, s, function ( yoke, result ) {
                if ( !result.ok )
                    return then( yoke, s, result );
                var comment = result.val;
                return readEscape( yoke, s,
                    function ( yoke, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, s, result );
                    return then( yoke, s,
                        { ok: true, val:
                            { type: "commented",
                                comment: comment,
                                suffix: result.val } } );
                } );
            } );
            } );
        else if ( c === "=" )
            return s.read( yoke, function ( yoke, s, result ) {
            return readRestOfLine( yoke, s, null,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                return then( yoke, s, { ok: true, val:
                    { type: "comment", elements: result.val } } );
            } );
            } );
        else if ( c === ";" )
            return s.read( yoke, function ( yoke, s, result ) {
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
            } );
        else
            return readNaiveSexpStringElements( yoke, s, null,
                function ( yoke, s, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                return then( yoke, s, { ok: true, val:
                    { type: "naiveSexp", elements: result.val } } );
            } );
    } );
}

function traverseSpaced( yoke, prefix, esc, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( esc.type === "spaced" ) {
            return jsListAppend( yoke, prefix, esc.space,
                function ( yoke, prefix ) {
                
                return traverseSpaced( yoke,
                    prefix, esc.suffix, then );
            } );
        } else if ( esc.type === "commented"
            && esc.comment.type === "pair" ) {
            
            var invalidComment = function ( yoke ) {
                return then( yoke, { ok: false, msg:
                    // TODO: Describe the invalid escape. We'll need
                    // an error string that can get larger than
                    // JavaScript's strings.
                    "Expected a comment, got a different escape " +
                    "sequence" } );
            };
            
            if ( !(esc.comment.type === "pair"
                && esc.comment.first.type === "naiveSexp") )
                return invalidComment( yoke );
            
            var encompassingClosingBracket = null;
            return readNaiveSexp( yoke, esc.comment.first.elements,
                encompassingClosingBracket,
                function ( yoke, first ) {
                
                if ( !(first.type === "stringNil"
                    && readerStringNilToString( first ) === "rm") )
                    return invalidComment( yoke );
                
                return escapeToString( yoke, esc.comment,
                    function ( yoke, comment ) {
                    
                    return jsListFlattenOnce( yoke, jsList(
                        prefix,
                        asciiToEl( "\\" ),
                        comment
                    ), function ( yoke, prefix ) {
                        return traverseSpaced( yoke,
                            prefix, esc.suffix, then );
                    } );
                } );
            } );
        } else {
            return then( yoke, { ok: true,
                prefix: prefix,
                esc: esc } );
        }
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
                    function ( yoke, result ) {
                    
                    if ( !result.ok )
                        return then( yoke, s, result );
                    var esc = result.esc;
                
                if ( esc.type === "pair" ) {
                    if ( esc.first.type !== "naiveSexp" )
                        return then( yoke, s, { ok: false, msg:
                            "Expected s-expression escape suffix, " +
                            "got = with a non-s-expression after it"
                            } );
                    
                    return readNaiveSexp( yoke, esc.first.elements,
                        encompassingClosingBracket,
                        function ( yoke, result ) {
                        
                        if ( !result.ok )
                            return then( yoke, s, result );
                        var op = result.val;
                    
                    var isNameOp = function ( name ) {
                        return op.type === "stringNil" &&
                            readerStringNilToString( op ) === name;
                    };
                    var isStringOp = function ( name ) {
                        return (
                            op.type === "cons"
                            && op.rest.type === "cons"
                            && op.rest.rest.type === "nil"
                            && op.first.type === "stringNil"
                            && readerStringNilToString( op.first ) ===
                                name
                            && op.rest.first.type === "stringNil"
                        );
                    };
                    var isDoubleStringOp = function ( name ) {
                        return (
                            op.type === "cons"
                            && op.rest.type === "cons"
                            && op.rest.rest.type === "cons"
                            && op.rest.rest.rest.type === "nil"
                            && op.first.type === "stringNil"
                            && readerStringNilToString( op.first ) ===
                                name
                            && op.rest.first.type === "stringNil"
                            && op.rest.rest.first.type === "stringNil"
                        );
                    };
                    
                    if ( isNameOp( "rm" ) ) {
                        if ( qqStack.uq !== null )
                            return then( yoke, s, { ok: false, msg:
                                "Expected s-expression escape " +
                                "suffix, got ;rm at nonzero depth"
                                } );
                        return readSexpOrInfixOp( yoke, s,
                            encompassingClosingBracket, then );
                    } else if ( isNameOp( "yp" ) ) {
                        return withQqStack( yoke, {
                            uq: qqStack.uq,
                            cache: qqStack.cache.plusObj( {
                                normalizingWhitespace: false
                            } )
                        }, esc.second );
                    } else if ( isNameOp( "np" ) ) {
                        return withQqStack( yoke, {
                            uq: qqStack.uq,
                            cache: qqStack.cache.plusObj( {
                                normalizingWhitespace: true
                            } )
                        }, esc.second );
                    } else if ( isNameOp( "in" ) ) {
                        return then( yoke, s, { ok: false, msg:
                            "Expected s-expression escape " +
                            "suffix, got ;in" } );
                    } else if ( isNameOp( "ls" ) ) {
                        return then( yoke, s, { ok: false, msg:
                            "Expected s-expression escape " +
                            "suffix, got ;ls" } );
                    } else if ( isNameOp( "qq" ) ) {
                        return withQqStack( yoke, {
                            uq: qqStack,
                            cache: qqStack.cache.plusObj( {
                                names: readerStrMap()
                            } )
                        }, esc.second );
                    } else if ( isNameOp( "uq" ) ) {
                        if ( qqStack.uq === null )
                            return then( yoke, s, { ok: false, msg:
                                "Expected s-expression escape " +
                                "suffix, got ;uq at zero depth" } );
                        return withQqStack( yoke,
                            qqStack.uq, esc.second );
                    } else if ( isStringOp( "wq" ) ) {
                        var name = op.rest.first.string;
                        return qqStack.cache.get( "names" ).
                            plusTruth( yoke, name,
                                function ( yoke, names ) {
                            
                            return withQqStack( yoke, {
                                uq: qqStack.uq,
                                cache: qqStack.cache.plusObj( {
                                    names: names
                                } )
                            }, esc.second );
                        } );
                    } else if ( isDoubleStringOp( "lq" ) ) {
                        var va = op.rest.first.string;
                        var val = op.rest.rest.first.string;
                        // TODO: Implement this. We don't actually
                        // store "values" in the `names` map, but
                        // we'll have to start doing so.
                        return then( yoke, s, { ok: false, msg:
                            "Expected s-expression escape suffix, " +
                            "got ;(lq ...) which hasn't been " +
                            "implemented yet" } );
                    } else if ( isStringOp( "rq" ) ) {
                        var name = op.rest.first.string;
                        var unwindingQqStack = function ( yoke,
                            qqStack ) {
                            
                            return qqStack.cache.get( "names" ).
                                has( yoke, name,
                                    function ( yoke, had ) {
                                
                                if ( had )
                                    return withQqStack( yoke, qqStack, esc.second );
                                else if ( qqStack.uq === null )
                                    return then( yoke, s, { ok: false, msg:
                                        "Expected s-expression escape suffix, encountered ;(rq ...) " +
                                        // TODO: Describe the unbound label. We'll need an error string
                                        // that can get larger than JavaScript's strings.
                                        "for an unbound label" } );
                                else
                                    return unwindingQqStack( yoke, qqStack.uq );
                            } );
                        };
                        return unwindingQqStack( yoke, qqStack );
                    } else {
                        return then( yoke, s, { ok: false, msg:
                            "Expected s-expression escape suffix, " +
                            // TODO: Describe the invalid escape.
                            // We'll need an error string that can get
                            // larger than JavaScript's strings.
                            "got ; for an invalid escape" } );
                    }
                    
                    } );
                } else if ( esc.type === "comment" ) {
                    return readSexpOrInfixOp( yoke, s,
                        encompassingClosingBracket, then );
                } else if ( esc.type === "naiveSexp" ) {
                    var isDelimited = esc.elements !== null &&
                        esc.elements.rest === null &&
                        esc.elements.first.type === "textDelimited";
                    if ( qqStack.uq === null ) {
                        return readNaiveSexp( yoke, esc.elements,
                            encompassingClosingBracket,
                            function ( yoke, result ) {
                            
                            if ( !result.ok )
                                return then( yoke, s, result );
                            return then( yoke, s, { ok: true, val:
                                { val: result.val } } );
                        } );
                        
                    } else if (
                        qqStack.uq.uq === null && isDelimited ) {
                        
                        return readString( yoke,
                            esc.elements.first.elements,
                        {
                            uq: qqStack.uq,
                            cache: qqStack.cache.plusObj( {
                                encompassingClosingBracket:
                                    esc.elements.first.close,
                                encompassingClosingBracketIsInString:
                                    qqStack.cache.get( "encompassingClosingBracketIsInString" ) ||
                                        esc.elements.first.open !== "/"
                            } )
                        }, function ( yoke, result ) {
                            if ( !result.ok )
                                return then( yoke, s, result );
                            return then( yoke, s, { ok: true, val:
                                { val: result.val } } );
                        } );
                    } else {
                        if ( isDelimited )
                            return then( yoke, { ok: false, msg:
                                "Expected s-expression escape " +
                                "suffix, encountered " +
                                esc.elements.first.open + " at a " +
                                "depth other than zero or one" } );
                        else
                            return then( yoke, { ok: false, msg:
                                // TODO: Describe the invalid escape.
                                // We'll need an error string that can
                                // get larger than JavaScript's
                                // strings.
                                "Expected s-expression escape " +
                                "suffix, encountered an invalid " +
                                "escape" } );
                    }
                } else {
                    throw new Error();
                }
                
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
                            
                            return traverseSpaced( yoke, prefix, esc,
                                function ( yoke, result ) {
                                
                                if ( !result.ok )
                                    return then( yoke, result );
                                var prefix = result.prefix;
                                var esc = result.esc;
                            
                            if ( esc.type === "pair" ) {
                                return readNaiveSexp( yoke, esc.first.elements,
                                    encompassingClosingBracket,
                                    function ( yoke, result ) {
                                    
                                    if ( !result.ok )
                                        return then( yoke, result );
                                    var op = result.val;
                                
                                var isNameOp = function ( name ) {
                                    return op.type === "stringNil" &&
                                        readerStringNilToString( op ) === name;
                                };
                                var isStringOp = function ( name ) {
                                    return (
                                        op.type === "cons"
                                        && op.rest.type === "cons"
                                        && op.rest.rest.type === "nil"
                                        && op.first.type === "stringNil"
                                        && readerStringNilToString( op.first ) ===
                                            name
                                        && op.rest.first.type === "stringNil"
                                    );
                                };
                                var isDoubleStringOp = function ( name ) {
                                    return (
                                        op.type === "cons"
                                        && op.rest.type === "cons"
                                        && op.rest.rest.type === "cons"
                                        && op.rest.rest.rest.type === "nil"
                                        && op.first.type === "stringNil"
                                        && readerStringNilToString( op.first ) ===
                                            name
                                        && op.rest.first.type === "stringNil"
                                        && op.rest.rest.first.type === "stringNil"
                                    );
                                };
                                
                                return jsListFlattenOnce( yoke, jsList(
                                    prefix,
                                    asciiToEl( ";" ),
                                    esc.first.elements
                                ), function ( yoke, prefix ) {
                                
                                var retWithModifier = function ( yoke, result ) {
                                    if ( !result.ok )
                                        return then( yoke, result );
                                    
                                    return jsListAppend( yoke, prefix, result.val, ret );
                                };
                                
                                if ( isNameOp( "rm" ) ) {
                                    if ( qqStack.uq === null )
                                        return unexpected( yoke, ";rm" );
                                    else if ( qqStack.uq.uq === null )
                                        return ret( yoke, jsList() );
                                    else
                                        return readEscapeLurking( yoke,
                                            prefix, esc.second, qqStack, then );
                                } else if ( isNameOp( "yp" ) ) {
                                    return readEscapeLurking( yoke, prefix, esc.second, {
                                        uq: qqStack.uq,
                                        cache: qqStack.cache.plusObj( {
                                            normalizingWhitespace: false
                                        } )
                                    }, then );
                                } else if ( isNameOp( "np" ) ) {
                                    return readEscapeLurking( yoke, prefix, esc.second, {
                                        uq: qqStack.uq,
                                        cache: qqStack.cache.plusObj( {
                                            normalizingWhitespace: true
                                        } )
                                    }, then );
                                } else if ( isNameOp( "in" ) ) {
                                    // TODO: Implement this.
                                    return unexpected( yoke, ";in which hasn't been implemented yet" );
                                } else if ( isNameOp( "ls" ) ) {
                                    if ( esc.second.type !== "naiveSexp" )
                                        return unexpected( yoke,
                                            ";ls followed by a non-s-expression" );
                                    
                                    if ( qqStack.uq === null ) {
                                        return readNaiveSexp( yoke, esc.second.elements,
                                            encompassingClosingBracket,
                                            function ( yoke, result ) {
                                            
                                            if ( !result.ok )
                                                return then( yoke, result );
                                            
                                            return ret( yoke,
                                                jsList( { type: "interpolation", val: result.val } ) );
                                        } );
                                    } else {
                                        return readStringLurking( yoke, esc.second.elements, qqStack,
                                            function ( yoke, result ) {
                                            
                                            if ( !result.ok )
                                                return then( yoke, result );
                                            
                                            return jsListAppend( yoke, prefix, result.val, ret );
                                        } );
                                    }
                                } else if ( isNameOp( "qq" ) ) {
                                    return readEscapeLurking( yoke, prefix, esc.second, {
                                        uq: qqStack,
                                        cache: qqStack.cache.plusObj( {
                                            names: readerStrMap()
                                        } )
                                    }, then );
                                } else if ( isNameOp( "uq" ) ) {
                                    if ( qqStack.uq === null )
                                        return unexpected( yoke, ";uq at zero depth" );
                                    
                                    return readEscapeLurking( yoke,
                                        prefix, esc.second, qqStack.uq, then );
                                } else if ( isStringOp( "wq" ) ) {
                                    var name = op.rest.first.string;
                                    return qqStack.cache.get( "names" ).plusTruth( yoke, name,
                                        function ( yoke, names ) {
                                        
                                        return readEscapeLurking( yoke, prefix, esc.second, {
                                            uq: qqStack.uq,
                                            cache: qqStack.cache.plusObj( {
                                                names: names
                                            } )
                                        }, then );
                                    } );
                                } else if ( isDoubleStringOp( "lq" ) ) {
                                    var va = op.rest.first.string;
                                    var val = op.rest.rest.first.string;
                                    // TODO: Implement this. We don't actually store "values" in the
                                    // `names` map, but we'll have to start doing so.
                                    return unexpected( yoke,
                                        ";(lq ...) which hasn't been implemented yet" );
                                } else if ( isStringOp( "rq" ) ) {
                                    var name = op.rest.first.string;
                                    var unwindingQqStack = function ( yoke, qqStack ) {
                                        return qqStack.cache.get( "names" ).has( yoke, name,
                                            function ( yoke, had ) {
                                            
                                            if ( had )
                                                return readEscapeLurking( yoke,
                                                    prefix, esc.second, qqStack, then );
                                            else if ( qqStack.uq === null )
                                                return unexpected( yoke,
                                                    // TODO: Describe the unbound label. We'll need an
                                                    // error string that can get larger than
                                                    // JavaScript's strings.
                                                    ";(rq ...) for an unbound label" );
                                            else
                                                return unwindingQqStack( yoke, qqStack.uq );
                                        } );
                                    };
                                    return unwindingQqStack( yoke, qqStack );
                                } else {
                                    // TODO: Describe the invalid escape. We'll need an error string
                                    // that can get larger than JavaScript's strings.
                                    return unexpected( yoke, "; for an invalid escape" );
                                }
                                
                                } );
                                
                                } );
                            } else if ( esc.type === "comment" ) {
                                if ( qqStack.uq === null )
                                    return unexpected( yoke, "comment" );
                                else if ( qqStack.uq.uq === null )
                                    return ret( yoke, jsList() );
                                else
                                    return jsListFlattenOnce( yoke,
                                        jsList( prefix, asciiToEl( "=" ), esc.elements ), ret );
                            } else if ( esc.type === "naiveSexp" ) {
                                if ( qqStack.uq === null ) {
                                    // TODO: Describe the s-expression. We'll need an error string that
                                    // can get larger than JavaScript's strings.
                                    return unexpected( yoke, "an s-expression" );
                                } else if ( qqStack.uq.uq === null ) {
                                    return readNaiveSexp( yoke, esc.elements,
                                        encompassingClosingBracket,
                                        function ( yoke, result ) {
                                        
                                        if ( !result.ok )
                                            return then( yoke, result );
                                        var op = result.val;
                                    
                                    var isNameOp = function ( name ) {
                                        return op.type === "stringNil" &&
                                            readerStringNilToString( op ) === name;
                                    };
                                    var isStringOp = function ( name ) {
                                        return (
                                            op.type === "cons"
                                            && op.rest.type === "cons"
                                            && op.rest.rest.type === "nil"
                                            && op.first.type === "stringNil"
                                            && readerStringNilToString( op.first ) === name
                                            && op.rest.first.type === "stringNil"
                                        );
                                    };
                                    
                                    var explicitWhite = function ( yoke, meaning ) {
                                        return jsListFlattenOnce( yoke, jsList(
                                            jsList( { type: "lurkObliteratePreceding" } ),
                                            asciiToEl( meaning ),
                                            jsList( { type: "lurkObliterateFollowing" } )
                                        ), ret );
                                    };
                                    var simpleEscape = function ( yoke, meaning ) {
                                        return ret( yoke, asciiToEl( meaning ) );
                                    };
                                    
                                    if ( isNameOp( "s" ) ) {
                                        return explicitWhite( yoke, " " );
                                    } else if ( isNameOp( "t" ) ) {
                                        return explicitWhite( yoke, "\t" );
                                    } else if ( isNameOp( "r" ) ) {
                                        return explicitWhite( yoke, "\r" );
                                    } else if ( isNameOp( "n" ) ) {
                                        return explicitWhite( yoke, "\n" );
                                    } else if ( isNameOp( "c" ) ) {
                                        return explicitWhite( yoke, "" );
                                    } else if ( isNameOp( "^" ) ) {
                                        return simpleEscape( yoke, "\\" );
                                    } else if ( isNameOp( "<" ) ) {
                                        return simpleEscape( yoke, "[" );
                                    } else if ( isNameOp( ">" ) ) {
                                        return simpleEscape( yoke, "]" );
                                    } else if ( isNameOp( "{" ) ) {
                                        return simpleEscape( yoke, "(" );
                                    } else if ( isNameOp( "}" ) ) {
                                        return simpleEscape( yoke, ")" );
                                    } else if ( isStringOp( "ch" ) ) {
                                        var hex = readerStringNilToString( op.rest.first );
                                        if ( !(hex.length <= 6 && /^[01-9A-F]+$/.test( hex )) )
                                            return then( yoke, { ok: false, msg:
                                                "Encountered ;(ch ...) with something other than 1-6 " +
                                                "uppercase hex digits inside" } );
                                        
                                        var scalar = unicodeCodePointToString(
                                            parseInt( elementsString, 16 ) );
                                        
                                        if ( scalar === null )
                                            return then( yoke, { ok: false, msg:
                                                "Encountered ;(ch ...) denoting a number outside the " +
                                                "Unicode scalar range, such as a UTF-16 surrogate" } );
                                        
                                        return ret( yoke, jsList( { type: "scalars", val: scalar } ) );
                                    } else {
                                        // TODO: Describe the invalid escape. We'll need an error string
                                        // that can get larger than JavaScript's strings.
                                        return unexpected( yoke, "an invalid escape s-expression" );
                                    }
                                    
                                    } );
                                } else {
                                    return readStringLurking( yoke, esc.elements, qqStack,
                                        function ( yoke, result ) {
                                        
                                        if ( !result.ok )
                                            return then( yoke, result );
                                        
                                        return jsListAppend( yoke, prefix, result.val, ret );
                                    } );
                                }
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
                            if ( qqStack.cache.
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
                    if ( state.normalizing
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
                            normalizing: true,
                            revWhite: state.revWhite,
                            revProcessed: state.revProcessed
                        }, !"exitedEarly" );
                    else if ( element.type === "rawWhiteScalars" )
                        return then( yoke, {
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
            return withQqStack( yoke, {
                uq: null,
                cache: strMap().plusObj( {
                    names: readerStrMap(),
                    encompassingClosingBracket:
                        encompassingClosingBracket,
                    encompassingClosingBracketIsInString: false,
                    normalizingWhitespace: true
                } )
            }, result.val.val.suffix );
        } else if ( result.val.val.type === "textDelimited" ) {
            return readList( yoke,
                listToStream( result.val.val.elements ),
                result.val.val.open === "/" ?
                    encompassingClosingBracket :
                    result.val.val.close,
                function ( yoke, emptyElementsStream, result ) {
                
                if ( !result.ok )
                    return then( yoke, s, result );
                return then( yoke, s, { ok: true, val:
                    { val: result.val } } );
            } );
        } else if ( result.val.val.type === "scalars" ) {
            var c = result.val.val.val;
            
            var readIdentifier = function ( yoke, s, revElements ) {
                return s.peek( yoke, function ( yoke, s, result ) {
                    if ( !result.ok )
                        return then( yoke, s, result );
                    
                    if ( result.val === null
                        || result.val.val.type !== "scalars" )
                        return next( yoke, s, revElements );
                    
                    var c = result.val.val.val;
                    if ( /^[ \t\r\n=;',\./]*$/.test( c ) )
                        return next( yoke, s, revElements );
                    else if ( c === "`" )
                        return s.read( yoke,
                            function ( yoke, s, result ) {
                            
                            if ( !result.ok )
                                return then( yoke, s, result );
                            
                            return next( yoke, s, revElements );
                        } );
                    else
                        return s.read( yoke,
                            function ( yoke, s, result ) {
                            
                            if ( !result.ok )
                                return then( yoke, s, result );
                            
                            return readIdentifier( yoke, s,
                                { first: result.val.val.val,
                                    rest: revElements } );
                        } );
                    
                    function next( yoke, s, revElements ) {
                        return jsListRev( yoke, revElements,
                            function ( yoke, elements ) {
                            
                            return then( yoke, s, { ok: true, val:
                                { val:
                                    { type: "stringNil", string: elements } } } );
                        } );
                    }
                } );
            };
            
            if ( /^[ \t]+$/.test( c ) ) {
                return readSexpOrInfixOp( yoke, s,
                    encompassingClosingBracket, then );
            } else if ( /^[\r\n]$/.test( c ) ) {
                return then( yoke, s, { ok: true, val:
                    { val: { type: "infixNewline" } } } );
            } else if ( /^[=;',]$/.test( c ) ) {
                return then( yoke, s, { ok: false, msg:
                    "Expected s-expression, got " + c } );
            } else if ( c === "/" ) {
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
            } else if ( c === "." ) {
                return then( yoke, s, { ok: true, val:
                    { val: { type: "infixDot" } } } );
            } else if ( c === "`" ) {
                return readIdentifier( yoke, s, jsList() );
            } else {
                return readIdentifier( yoke, s, jsList( c ) );
            }
        } else {
            throw new Error();
        }
    } );
}
// NOTE: For this, `s` must be a stream of readSexpOrInfixOp results.
function readList( yoke, s, encompassingClosingBracket, then ) {
    // This reads the remainder of the stream as a list. It ignores
    // the "infixNewline" values, and it processes the "infixDot"
    // values.
    
    return exhaustStream( yoke,
        customStream(
            customStream( s, function ( yoke, s, then ) {
                return readSexpOrInfixOp( yoke, s,
                    encompassingClosingBracket, then );
            } ),
            function ( yoke, s, then ) {
                return readSexp( yoke, s, !"heedCommandEnds", then );
            }
        ),
        function ( yoke, emptyStream, result ) {
        
        var s = emptyStream.underlyingStream.underlyingStream;
        
        if ( !result.ok )
            return then( yoke, s, result );
        
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
function readNaiveSexp( yoke,
    stringElements, encompassingClosingBracket, then ) {
    
    return readList( yoke, listToStream( stringElements ),
        encompassingClosingBracket,
        function ( yoke, emptyElementsStream, result ) {
        
        if ( !result.ok )
            return then( yoke, result );
        else if ( result.val.type !== "cons" )
            return then( yoke, { ok: false, msg:
                "Expected exactly one s-expression, got zero"
                } );
        else if ( result.val.rest.type !== "nil" )
            return then( yoke, { ok: false, msg:
                "Expected exactly one s-expression, got " +
                "more than one" } );
        
        return then( yoke, { ok: true, val:
            result.val.first } );
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
