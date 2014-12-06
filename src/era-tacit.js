// era-tacit.js
// Copyright 2014 Ross Angle. Released under the MIT License.
"use strict";

// TODO: Incorporate this into the Era or Penknife languages.
// TODO: Convert this to constant-time-stepped CPS like Penknife and
// era-avl.js.

// TODO: Track individual histories for each stage.

var bytecodeWords = {};

// TODO: Make this file depend on era-misc.
function arrEach( arr, func ) {
    for ( var i = 0, n = arr.length; i < n; i++ )
        func( arr[ i ], i );
}

function runBytecode( bytecode, inputVal ) {
    var result = {
        path: null,
        historyStack: { first: null, rest: null },
        val: inputVal
    };
    arrEach( bytecode, function ( bytecodeWord ) {
        var outcome =
            bytecodeWords[ bytecodeWord ].call( {}, result );
        if ( outcome.type === "result" ) {
            result = outcome.result;
        } else if ( outcome.type === "error" ) {
            throw new Error(
                "Assertion error: " +
                JSON.stringify( outcome.stack ) );
        } else {
            throw new Error();
        }
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
        val: stack.val === null ? null :
            stack.val.type === "times" ?
                { type: "right", right: stack.val } :
                { type: "left", left: stack.val }
    };
}

function assertDisperseTimes( stack ) {
    if ( !(stack.val === null || stack.val.type === "times") )
        throw new Error();
    return {
        first: {
            path: { first: "timesFirst", rest: stack.path },
            historyStack: { first: null, rest: stack.historyStack },
            val: stack.val === null ? null : stack.val.first
        },
        second: {
            path: { first: "timesSecond", rest: stack.path },
            historyStack: { first: null, rest: stack.historyStack },
            val: stack.val === null ? null : stack.val.second
        }
    };
}

function assertCollectTimes( first, second ) {
    if ( !(first.path.first === "timesFirst"
        && second.path.first === "timesSecond"
        && (first.val === null) === (second.val === null)
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
        val: first.val === null ? null :
            { type: "times", first: first.val, second: second.val }
    };
}

function productAssocLeft( stack ) {
    if ( !(stack.val === null
        || (stack.val.type === "times"
            && stack.val.second.type === "times")) )
        throw new Error();
    return {
        path: stack.path,
        historyStack: historyStackPlus(
            "productAssocLeft", stack.historyStack ),
        val: stack.val === null ? null :
            { type: "times",
                first: { type: "times",
                    first: stack.val.first,
                    second: stack.val.second.first },
                second: stack.val.second.second }
    };
}

function productAssocRight( stack ) {
    if ( !(stack.val === null
        || (stack.val.type === "times"
            && stack.val.first.type === "times")) )
        throw new Error();
    return {
        path: stack.path,
        historyStack: historyStackPlus(
            "productAssocRight", stack.historyStack ),
        val: stack.val === null ? null :
            { type: "times",
                first: stack.val.first.first,
                second: { type: "times",
                    first: stack.val.first.second,
                    second: stack.val.second } }
    };
}

function isPlusType( val ) {
    return val.type === "left" || val.type === "right";
}

function coercePlus( stack ) {
    return {
        path: stack.path,
        historyStack:
            historyStackPlus( "coercePlus", stack.historyStack ),
        val: stack.val === null ? null :
            isPlusType( stack.val ) ?
                { type: "right", right: stack.val } :
                { type: "left", left: stack.val }
    };
}

function assertDispersePlus( stack ) {
    if ( !(stack.val === null || isPlusType( stack.val )) )
        throw new Error();
    return {
        left: {
            path: { first: "plusLeft", rest: stack.path },
            historyStack: { first: null, rest: stack.historyStack },
            val: stack.val === null ? null :
                stack.val.type === "left" ? stack.val.left : null
        },
        right: {
            path: { first: "plusRight", rest: stack.path },
            historyStack: { first: null, rest: stack.historyStack },
            val: stack.val === null ? null :
                stack.val.type === "left" ? null : stack.val.right
        }
    };
}

function assertCollectPlus( left, right ) {
    if ( !(left.path.first === "plusLeft"
        && right.path.first === "plusRight"
        && (left.val === null || right.val === null)
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
        val: left.val !== null ?
                { type: "left", left: left.val } :
            right.val !== null ?
                { type: "right", right: right.val } :
                null
    };
}

function sumAssocLeft( stack ) {
    if ( !(stack.val === null
        || (isPlusType( stack.val )
            && (stack.val.type === "left"
                || isPlusType( stack.val.right )))) )
        throw new Error();
    return {
        path: stack.path,
        historyStack: historyStackPlus(
            "sumAssocLeft", stack.historyStack ),
        val: stack.val === null ? null :
            stack.val.type === "left" ?
                { type: "left", left: stack.val } :
            stack.val.right.type === "left" ?
                { type: "left", left:
                    { type: "right", right: stack.val.right.left } } :
                stack.val.right
    };
}

function sumAssocRight( stack ) {
    if ( !(stack.val === null
        || (isPlusType( stack.val )
            && (stack.val.type === "right"
                || isPlusType( stack.val.left )))) )
        throw new Error();
    return {
        path: stack.path,
        historyStack: historyStackPlus(
            "sumAssocLeft", stack.historyStack ),
        val: stack.val === null ? null :
            stack.val.type === "left" ?
                (stack.val.left.type === "left" ?
                    stack.val.left :
                    { type: "right", right:
                        { type: "left", left:
                            stack.val.left.right } }) :
                { type: "right", right: stack.val }
    };
}

function distribute( stack ) {
    if ( !(stack.val === null
        || (stack.val.type === "times"
            && isPlusType( stack.val.second ))) )
        throw new Error();
    return {
        path: stack.path,
        historyStack:
            historyStackPlus( "distribute", stack.historyStack ),
        val: stack.val === null ? null :
            stack.val.second.type === "left" ?
                { type: "left", left:
                    { type: "times",
                        first: stack.val.first,
                        second: stack.val.second.left } } :
                { type: "right", right:
                    { type: "times",
                        first: stack.val.first,
                        second: stack.val.second.right } }
    };
}

function merge( stack ) {
    if ( !(stack.val === null || isPlusType( stack.val )) )
        throw new Error();
    return {
        path: stack.path,
        historyStack: historyStackPlus( "merge", stack.historyStack ),
        val: stack.val === null ? null :
            stack.val.type === "left" ?
                stack.val.left :
                stack.val.right
    };
}

function commuteTimes( stack ) {
    if ( !(stack.val === null || stack.val.type === "times") )
        throw new Error();
    return {
        path: stack.path,
        historyStack:
            historyStackPlus( "commuteTimes", stack.historyStack ),
        val: stack.val === null ? null :
            { type: "times",
                first: stack.val.second, second: stack.val.first }
    };
}

function assertRight( stack ) {
    if ( !(stack.val === null || stack.val.type === "right") )
        throw new Error();
    return {
        path: stack.path,
        historyStack:
            historyStackPlus( "assertRight", stack.historyStack ),
        val: stack.val === null ? null : stack.val.right
    };
}

bytecodeWords[ "l" ] = function ( stack ) {
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
    return { type: "result", result:
        assertCollectPlus(
            merge( sum.left ), productAssocLeft( sum.right ) ) };
};

bytecodeWords[ "r" ] = function ( stack ) {
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
    return { type: "result", result:
        assertCollectPlus(
            merge( sum.left ), productAssocRight( sum.right ) ) };
};

bytecodeWords[ "assert" ] = function ( stack ) {
    if ( stack.val !== null && stack.val.type !== "right" )
        return { type: "error", stack: stack };
    return { type: "result", result: assertRight( stack ) };
};

// Expressions for testing
//
// NOTE: The types "a", "b", and "c" aren't actually going to be
// supported types, but so far they work for testing.
//
/*
JSON.stringify(
    runBytecode( [ "l" ],
        { type: "times",
            first: { type: "a" },
            second: { type: "times",
                first: { type: "b" },
                second: { type: "c" } } } ) )

JSON.stringify(
    runBytecode( [ "r" ],
        { type: "times",
            first: { type: "times",
                first: { type: "a" },
                second: { type: "b" } },
            second: { type: "c" } } ) )

JSON.stringify(
    runBytecode( "l assert r assert".split( " " ),
        { type: "times",
            first: { type: "a" },
            second: { type: "times",
                first: { type: "b" },
                second: { type: "c" } } } ) )

// This one fails.
runBytecode( "r assert".split( " " ),
    { type: "times",
        first: { type: "a" },
        second: { type: "times",
            first: { type: "b" },
            second: { type: "c" } } } )

*/
