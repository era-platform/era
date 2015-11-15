// test-reader.js (part of Era)
// Copyright 2013-2015 Ross Angle. Released under the MIT License.
"use strict";


function addReaderTest( code, expected ) {
    
    function convertExpectedString( expectedString ) {
        var codePoints = [];
        eachUnicodeCodePoint( expectedString, function ( info ) {
            codePoints.push( info.charString );
        } );
        return jsListFromArr( codePoints );
    }
    function convertEncounteredExpr( encounteredExpr ) {
        if ( isArray( encounteredExpr ) ) {
            return arrMap( encounteredExpr, convertEncounteredExpr );
            
        } else if ( likeObjectLiteral( encounteredExpr )
            && encounteredExpr.type === "stringNil" ) {
            
            return { type: "stringNil",
                string: readerStringNilToString( encounteredExpr ) };
            
        } else if ( likeObjectLiteral( encounteredExpr )
            && encounteredExpr.type === "stringCons" ) {
            
            return {
                type: "stringCons",
                string: readerStringListToString(
                    encounteredExpr.string ),
                interpolation: convertEncounteredExpr(
                    encounteredExpr.interpolation ),
                rest: convertEncounteredExpr( encounteredExpr.rest )
            };
            
        } else if ( likeObjectLiteral( encounteredExpr )
            && encounteredExpr.type === "nil" ) {
            
            return encounteredExpr;
            
        } else if ( likeObjectLiteral( encounteredExpr )
            && encounteredExpr.type === "cons" ) {
            
            return {
                type: "cons",
                first:
                    convertEncounteredExpr( encounteredExpr.first ),
                rest: convertEncounteredExpr( encounteredExpr.rest )
            };
            
        } else if ( likeObjectLiteral( encounteredExpr )
            && typeof encounteredExpr.ok === "boolean" ) {
            
            return { ok: encounteredExpr.ok,
                val: convertEncounteredExpr( encounteredExpr.val ) };
        } else {
            throw new Error();
        }
    }
    function convertExpectedExpr( expectedExpr ) {
        if ( isArray( expectedExpr ) ) {
            if ( expectedExpr.length === 0 )
                return { type: "nil" };
            else
                return {
                    type: "cons",
                    first: convertExpectedExpr( expectedExpr[ 0 ] ),
                    rest:
                        convertExpectedExpr( expectedExpr.slice( 1 ) )
                };
        } else if ( typeof expectedExpr === "string" ) {
            // TODO: Put an isString() utility somewhere.
            return { type: "stringNil", string: expectedExpr };
            
        } else if ( likeObjectLiteral( expectedExpr )
            && expectedExpr.type === "stringCons" ) {
            
            return {
                type: "stringCons",
                string: expectedExpr.string,
                interpolation:
                    convertExpectedExpr( expectedExpr.interpolation ),
                rest: convertExpectedExpr( expectedExpr.rest )
            };
        } else {
            throw new Error();
        }
    }
    
    addNaiveIsoUnitTest( function ( then ) {
        return then( convertEncounteredExpr( readAll( code ) ),
            [ { ok: true, val: convertExpectedExpr( expected ) } ] );
    } );
}

addReaderTest(
    " (woo\\ comment\n b (\\-qq[c( woo( ) string)] / x//)/())",
    [ "woo", "b",
        [ "c( woo( ) string)", [ "x", [ [] ] ] ],
        [ [] ] ] );

addReaderTest( "\\-qq[abc def]",
    "abc def" );

addReaderTest( "\\-qq[abc \\-qq[def\\-uq-ls[ghi]jkl] mno]",
    "abc \\-qq[def\\-uq-ls[ghi]jkl] mno" );

addReaderTest( "\\-qq[abc \\-qq[def\\-uq-uq-ls[ghi]jkl] mno]",
    { type: "stringCons",
        string: "abc \\-qq[def",
        interpolation: "ghi",
        rest: "jkl] mno" } );

addReaderTest(
    "\\-qq[abc \\-qq[def \\-qq[ghi\\-uq-uq-uq-ls[jkl]mno]pqr] stu]",
    { type: "stringCons",
        string: "abc \\-qq[def \\-qq[ghi",
        interpolation: "jkl",
        rest: "mno]pqr] stu" } );

addReaderTest(
    "\\-wq=[my-label]-qq[abc \\-qq[def \\-qq[ghi\\-rq=[my-label]-ls[jkl]mno]pqr] stu]",
    { type: "stringCons",
        string: "abc \\-qq[def \\-qq[ghi",
        interpolation: "jkl",
        rest: "mno]pqr] stu" } );
