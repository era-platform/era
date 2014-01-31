// test-bigint.js (part of Era)
// Copyright 2014 Ross Angle. Released under the MIT License.
"use strict";


(function () {

function parse( decimal ) {
    return bigIntFromStringInRadix( 10, decimal );
}
function unparse( bigInt ) {
    return bigInt.toStringInRadix( 10 );
}

function addArithmeticTest( calculated, expected ) {
    addNaiveIsoUnitTest( function ( then ) {
        then( unparse( calculated ), expected );
    } );
}


addArithmeticTest( parse( "100" ).zapPlus( parse( "100" ) ),
    "200" );

addArithmeticTest( parse( "100" ).times( parse( "100" ) ),
    "10000" );
addArithmeticTest( parse( "10000" ).times( parse( "10000" ) ),
    "100000000" );
addArithmeticTest( parse( "100000000" ).times( parse( "100000000" ) ),
    "10000000000000000" );
addArithmeticTest( parse( "100" ).zapTimes( parse( "100" ) ),
    "10000" );
addArithmeticTest( parse( "10000" ).zapTimes( parse( "10000" ) ),
    "100000000" );
addArithmeticTest(
    parse( "100000000" ).zapTimes( parse( "100000000" ) ),
    "10000000000000000" );

addArithmeticTest(
    parse( "100000000" ).dividedByTowardZeroWithRemainder(
        parse( "100000000" ) ).quotient,
    "1" );
addArithmeticTest(
    parse( "100000000" ).dividedByTowardZeroWithRemainder(
        parse( "100000000" ) ).remainder,
    "0" );

addArithmeticTest(
    parse( "100000000" ).dividedByTowardZeroWithRemainder(
        parse( "3" ) ).quotient,
    "33333333" );
addArithmeticTest(
    parse( "100000000" ).dividedByTowardZeroWithRemainder(
        parse( "3" ) ).remainder,
    "1" );

})();
