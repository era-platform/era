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

bytecodeWords[ "l" ] = function ( stack ) {
    return { type: "result", result: {
        path: stack.path,
        historyStack: historyStackPlus( "l", stack.historyStack ),
        val: stack.val === null ? null :
            stack.val.type === "times"
                && stack.val.second.type === "times" ?
                { type: "right", right:
                    { type: "times",
                        first: { type: "times",
                            first: stack.val.first,
                            second: stack.val.second.first },
                        second: stack.val.second.second } } :
                { type: "left", left: stack.val }
    } };
};

bytecodeWords[ "r" ] = function ( stack ) {
    return { type: "result", result: {
        path: stack.path,
        historyStack: historyStackPlus( "r", stack.historyStack ),
        val: stack.val === null ? null :
            stack.val.type === "times"
                && stack.val.first.type === "times" ?
                { type: "right", right:
                    { type: "times",
                        first: stack.val.first.first,
                        second: { type: "times",
                            first: stack.val.first.second,
                            second: stack.val.second } } } :
                { type: "left", left: stack.val }
    } };
};

bytecodeWords[ "assert" ] = function ( stack ) {
    if ( stack.val !== null && stack.val.type !== "right" )
        return { type: "error", stack: stack };
    return { type: "result", result: {
        path: stack.path,
        historyStack:
            historyStackPlus( "assert", stack.historyStack ),
        val: stack.val === null ? null : stack.val.right
    } };
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
