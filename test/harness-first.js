// harness-first.js (part of Era)
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";


function logJson( x ) {
    console.log( JSON.stringify( x ) );
    return x;
}

var unitTests = [];
function addNaiveIsoUnitTest( body ) {
    // TODO: Stop using JSON.stringify() here. It might be good to
    // have a naiveStringify() function or something for custom
    // stringification.
    unitTests.push( function ( then ) {
        body( function ( calculated, expected ) {
            if ( naiveIso( calculated, expected ) )
                then( null );
            else
                then(
                    "Expected this:\n" +
                    JSON.stringify( expected ) + "\n" +
                    "But got this:\n" +
                    JSON.stringify( calculated ) );
        } );
    } );
}
function addPredicateUnitTest( body ) {
    // TODO: Stop using JSON.stringify() here. It might be good to
    // have a naiveStringify() function or something for custom
    // stringification.
    unitTests.push( function ( then ) {
        body( function ( calculated, predicate ) {
            if ( predicate( calculated ) )
                then( null );
            else
                then(
                    "This result was unexpected:\n" +
                    JSON.stringify( calculated ) );
        } );
    } );
}
function addShouldThrowUnitTest( body ) {
    // TODO: Stop using JSON.stringify() here. It might be good to
    // have a naiveStringify() function or something for custom
    // stringification.
    unitTests.push( function ( then ) {
        try { var calculated = body(), success = true; }
        catch ( e ) {}
        defer( function () {
            if ( !success )
                then( null );
            else
                then(
                    "This result was unexpected:\n" +
                    JSON.stringify( calculated ) );
        } );
    } );
}
