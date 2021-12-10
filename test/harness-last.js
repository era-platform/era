// harness-last.js (part of Era)
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";


(function () {
    var testsPassedInARow = 0;
    function resetTestsPassedInARow() {
        if ( testsPassedInARow !== 0 )
            debugLog(
                "A streak of " + testsPassedInARow + " tests " +
                "passed." );
        testsPassedInARow = 0;
    }
    function run( i ) {
        if ( !(i < unitTests.length) ) {
            resetTestsPassedInARow();
            return;
        }
        var unitTest = unitTests[ i ];
        unitTest( function ( errorMessage ) {
            if ( errorMessage === null ) {
                testsPassedInARow++;
            } else {
                resetTestsPassedInARow();
                debugLog( errorMessage );
            }
            run( i + 1 );
        } )
    }
    run( 0 );
})();
