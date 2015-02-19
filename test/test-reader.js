// test-reader.js (part of Era)
// Copyright 2013-2015 Ross Angle. Released under the MIT License.
"use strict";


function addReaderTest( code, expected ) {
    addNaiveIsoUnitTest( function ( then ) {
        reader( {
            stream: stringStream( defer, code ),
            readerMacros: readerMacros,
            heedsCommandEnds: true,
            infixLevel: 0,
            infixState: { type: "empty" },
            end: function ( $, then ) {
                if ( $.infixState.type === "ready" )
                    then( $, { ok: true, val: $.infixState.val } );
                else
                    then( $, { ok: false, msg: "Reached the end" } );
            },
            unrecognized: function ( $, then ) {
                then( $, { ok: false,
                    msg: "Encountered an unrecognized character" } );
            }
        }, function ( $, result ) {
            then( result, { ok: true, val: expected } );
        } );
    } );
}

addReaderTest( " (woo;comment\n b (c( woo( ) string) / x//)/())",
    [ "woo", "b",
        [ "c( woo( ) string)", [ "x", [ [] ] ] ],
        [ [] ] ] );

addReaderTest( "\\[abc def]",
    { type: "interpolatedString", parts: [ {
        type: "text", text: "abc def"
    } ] } );

addReaderTest( "\\[abc \\[def\\_ghi.jkl] mno]",
    { type: "interpolatedString", parts: [ {
        type: "text", text: "abc \\[def\\_ghi.jkl] mno"
    } ] } );

addReaderTest( "\\[abc \\[def\\,_ghi.jkl] mno]",
    { type: "interpolatedString", parts: [ {
        type: "text", text: "abc \\[def"
    }, {
        type: "interpolation", val: "ghi"
    }, {
        type: "text", text: "jkl] mno"
    } ] } );

addReaderTest( "\\[abc \\[def \\[ghi\\,,_jkl.mno]pqr] stu]",
    { type: "interpolatedString", parts: [ {
        type: "text", text: "abc \\[def \\[ghi"
    }, {
        type: "interpolation", val: "jkl"
    }, {
        type: "text", text: "mno]pqr] stu"
    } ] } );
