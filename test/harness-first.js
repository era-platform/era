// harness-first.js (part of Era)
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";


if ( debugLog === void 0 )
    var debugLog = function ( var_args ) {
        console.log.apply( console, arguments );
    };

function logJson( x ) {
    debugLog( JSON.stringify( x ) );
    return x;
}

// To set a breakpoint on a unit test, write "breakOnThisTest = true;"
// just before adding it.
var breakOnThisTest = false;

var unitTests = [];
function pushTest( body ) {
    var breakHere = breakOnThisTest;
    breakOnThisTest = false;
    unitTests.push( function ( then ) {
        if ( breakHere )
            debugger;
        body( then );
    } );
}
function addNaiveIsoUnitTest( body ) {
    // TODO: Stop using JSON.stringify() here. It might be good to
    // have a naiveStringify() function or something for custom
    // stringification.
    pushTest( function ( then ) {
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
    pushTest( function ( then ) {
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
    pushTest( function ( then ) {
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
