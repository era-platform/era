// era-tacit.js
// Copyright 2014 Ross Angle. Released under the MIT License.
"use strict";

// TODO: Incorporate this into the Era or Penknife languages.
// TODO: Convert this to constant-time-stepped CPS like Penknife and
// era-avl.js.

// TODO: Track individual histories for each stage.

var bytecodes = {};

// TODO: Make this file depend on era-misc.
function arrEach( arr, func ) {
    for ( var i = 0, n = arr.length; i < n; i++ )
        func( arr[ i ], i );
}

function runBytecodes( bytecodeList, inputVal ) {
    var result = {
        path: null,
        historyStack: { first: null, rest: null },
        val: inputVal
    };
    arrEach( bytecodeList, function ( bytecode ) {
        result = bytecodes[ bytecode ].call( {}, result );
    } );
    return result.val;
}

function historyStackPlus( entry, historyStack ) {
    return { first: { first: entry, rest: historyStack.first },
        rest: historyStack.rest };
}

function coerceTimes( stack ) {
    return {
        path: stack.path,
        historyStack:
            historyStackPlus( "coerceTimes", stack.historyStack ),
        val: stack.val.type === "times" ?
            { type: "plus",
                left: { type: "everything" },
                right: stack.val } :
            { type: "plus",
                left: stack.val,
                right: { type: "times",
                    first: { type: "anything" },
                    second: { type: "anything" } } }
    };
}

function assertDisperseTimes( stack ) {
    if ( stack.val.type !== "times" )
        throw new Error();
    return {
        first: {
            path: { first: "timesFirst", rest: stack.path },
            historyStack: { first: null, rest: stack.historyStack },
            val: stack.val.first
        },
        second: {
            path: { first: "timesSecond", rest: stack.path },
            historyStack: { first: null, rest: stack.historyStack },
            val: stack.val.second
        }
    };
}

function assertCollectTimes( first, second ) {
    if ( !(first.path.first === "timesFirst"
        && second.path.first === "timesSecond"
        // TODO: See if we should really check these using object
        // identity.
        && first.path.rest === second.path.rest
        && first.historyStack.rest === second.historyStack.rest) )
        throw new Error();
    return {
        path: first.path.rest,
        historyStack: historyStackPlus(
            { type: "times",
                first: first.historyStack.first,
                second: second.historyStack.first },
            first.historyStack.rest ),
        val: { type: "times", first: first.val, second: second.val }
    };
}

function productAssocLeft( stack ) {
    if ( !(stack.val.type === "times"
        && stack.val.second.type === "times") )
        throw new Error();
    return {
        path: stack.path,
        historyStack: historyStackPlus(
            "productAssocLeft", stack.historyStack ),
        val: { type: "times",
            first: { type: "times",
                first: stack.val.first,
                second: stack.val.second.first },
            second: stack.val.second.second }
    };
}

function productAssocRight( stack ) {
    if ( !(stack.val.type === "times"
        && stack.val.first.type === "times") )
        throw new Error();
    return {
        path: stack.path,
        historyStack: historyStackPlus(
            "productAssocRight", stack.historyStack ),
        val: { type: "times",
            first: stack.val.first.first,
            second: { type: "times",
                first: stack.val.first.second,
                second: stack.val.second } }
    };
}

function coercePlus( stack ) {
    return {
        path: stack.path,
        historyStack:
            historyStackPlus( "coercePlus", stack.historyStack ),
        val: stack.val.type === "plus" ?
            { type: "plus",
                left: { type: "everything" },
                right: stack.val } :
            { type: "plus",
                left: stack.val,
                right: { type: "plus",
                    left: { type: "anything" },
                    right: { type: "anything" } } }
    };
}

function assertDispersePlus( stack ) {
    if ( stack.val.type !== "plus" )
        throw new Error();
    return {
        left: {
            path: { first: "plusLeft", rest: stack.path },
            historyStack: { first: null, rest: stack.historyStack },
            val: stack.val.left
        },
        right: {
            path: { first: "plusRight", rest: stack.path },
            historyStack: { first: null, rest: stack.historyStack },
            val: stack.val.right
        }
    };
}

function assertCollectPlus( left, right ) {
    if ( !(left.path.first === "plusLeft"
        && right.path.first === "plusRight"
        // TODO: See if we should really check these using object
        // identity.
        && left.path.rest === right.path.rest
        && left.historyStack.rest === right.historyStack.rest) )
        throw new Error();
    return {
        path: left.path.rest,
        historyStack: historyStackPlus(
            { type: "plus",
                left: left.historyStack.first,
                right: right.historyStack.first },
            left.historyStack.rest ),
        val: { type: "plus", left: left.val, right: right.val }
    };
}

function sumAssocLeft( stack ) {
    if ( !(stack.val.type === "plus"
        && stack.val.right.type === "plus") )
        throw new Error();
    return {
        path: stack.path,
        historyStack: historyStackPlus(
            "sumAssocLeft", stack.historyStack ),
        val: { type: "plus",
            left: { type: "plus",
                left: stack.val.left,
                right: stack.val.right.left },
            right: stack.val.right.right }
    };
}

function sumAssocRight( stack ) {
    if ( !(stack.val.type === "plus"
        && stack.val.left.type === "plus") )
        throw new Error();
    return {
        path: stack.path,
        historyStack: historyStackPlus(
            "sumAssocRight", stack.historyStack ),
        val: { type: "plus",
            left: stack.val.left.left,
            right: { type: "plus",
                left: stack.val.left.right,
                right: stack.val.right } }
    };
}

function distribute( stack ) {
    if ( !(stack.val.type === "times"
        && stack.val.second.type === "plus") )
        throw new Error();
    return {
        path: stack.path,
        historyStack:
            historyStackPlus( "distribute", stack.historyStack ),
        val: { type: "plus",
            left: { type: "times",
                first: stack.val.first,
                second: stack.val.second.left },
            right: { type: "times",
                first: stack.val.first,
                second: stack.val.second.right } }
    };
}

function mergeVals( a, b ) {
    if ( a.type === "everything" ) {
        return b;
    } else if ( b.type === "everything" ) {
        return a;
    } else if ( a.type === "plus" && b.type === "plus" ) {
        return { type: "plus", left: mergeVals( a.left, b.left ),
            right: mergeVals( a.right, b.right ) };
    } else if ( a.type === "times" && b.type === "times" ) {
        return { type: "times", first: mergeVals( a.first, b.first ),
            second: mergeVals( a.second, b.second ) };
    } else {
        // TODO: Handle other types.
        return { type: "anything" };
    }
}

function merge( stack ) {
    if ( !stack.val.type === "plus" )
        throw new Error();
    return {
        path: stack.path,
        historyStack: historyStackPlus( "merge", stack.historyStack ),
        val: mergeVals( stack.val.left, stack.val.right )
    };
}

function commuteTimes( stack ) {
    if ( !stack.val.type === "times" )
        throw new Error()
    return {
        path: stack.path,
        historyStack:
            historyStackPlus( "commuteTimes", stack.historyStack ),
        val: { type: "times",
            first: stack.val.second, second: stack.val.first }
    };
}

bytecodes[ "l" ] = function ( stack ) {
    var coercedOuter = assertDispersePlus( coerceTimes( stack ) );
    var coercedOuterDisperse =
        assertDisperseTimes( coercedOuter.right );
    var sum = assertDispersePlus(
        sumAssocLeft(
            assertCollectPlus(
                coercedOuter.left,
                distribute(
                    assertCollectTimes(
                        coercedOuterDisperse.first,
                        coerceTimes(
                            coercedOuterDisperse.second ) ) ) ) ) );
    return assertCollectPlus(
        merge( sum.left ), productAssocLeft( sum.right ) );
};

bytecodes[ "r" ] = function ( stack ) {
    var coercedOuter = assertDispersePlus( coerceTimes( stack ) );
    var coercedOuterDisperse =
        assertDisperseTimes( coercedOuter.right );
    var distributed = assertDispersePlus(
        distribute(
            commuteTimes(
                assertCollectTimes(
                    coerceTimes( coercedOuterDisperse.first ),
                    coercedOuterDisperse.second ) ) ) );
    var sum = assertDispersePlus(
        sumAssocLeft(
            assertCollectPlus(
                coercedOuter.left,
                assertCollectPlus(
                    commuteTimes( distributed.left ),
                    commuteTimes( distributed.right ) ) ) ) );
    return assertCollectPlus(
        merge( sum.left ), productAssocRight( sum.right ) );
};

// Expressions for testing

/*
JSON.stringify(
    runBytecodes( [ "l" ],
        { type: "times",
            first: { type: "a" },
            second: { type: "times",
                first: { type: "b" },
                second: { type: "c" } } } ) )

JSON.stringify(
    runBytecodes( [ "r" ],
        { type: "times",
            first: { type: "times",
                first: { type: "a" },
                second: { type: "b" } },
            second: { type: "c" } } ) )
*/
