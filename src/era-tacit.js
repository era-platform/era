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
function isString( x ) {
    return typeof x === "string";
}

function revListToArr( revList ) {
    var result = [];
    for ( ; revList !== null; revList = revList.rest )
        result.unshift( revList.first );
    return result;
}

function stateWithCursor( state, cursor ) {
    return {
        cursor: cursor,
        outputs: state.outputs,
        inputConsumer: state.inputConsumer
    };
}

// NOTE: In a top-level computation, the inputVal will be
// { type: "one" }. The cursor's final value must be that as well, and
// the final inputConsumer must be empty; if either of these
// conditions isn't met, it's a fatal error. All inputs and outputs
// are done by way of the `inputConsumer` object and `outputs` Array.
function runBytecode( bytecode, initialState ) {
    var currentState = initialState;
    arrEach( bytecode, function ( bytecodeWord ) {
        if ( isString( bytecodeWord ) ) {
            var outcome = bytecodeWords[ bytecodeWord ].call( {},
                currentState );
            if ( outcome.type === "result" ) {
                currentState = outcome.state;
            } else if ( outcome.type === "error" ) {
                throw new Error(
                    "Assertion error: " +
                    JSON.stringify( outcome.cursor ) );
            } else {
                throw new Error();
            }
        } else if ( bytecodeWord.type === "onLeft" ) {
            var val = currentState.cursor.val;
            var subState = runBytecode( bytecodeWord.bytecode,
                stateWithCursor( currentState, {
                    historyStack: null,
                    val: val === null ? null :
                        val.type === "left" ? val.left : null
                } ) );
            var subVal = subState.cursor.val;
            currentState = stateWithCursor( subState, {
                historyStack: historyStackPlus( {
                    type: "onLeft",
                    bytecode:
                        revListToArr( subState.cursor.historyStack )
                }, currentState.cursor.historyStack ),
                val: subVal === null ? null :
                    { type: "left", left: subVal }
            } );
        } else if ( bytecodeWord.type === "onFirst" ) {
            var val = currentState.cursor.val;
            var isTimes = val !== null && val.type === "times";
            var subState = runBytecode( bytecodeWord.bytecode,
                stateWithCursor( currentState, {
                    historyStack: null,
                    val: isTimes ? val.first : null
                } ) );
            var subVal = subState.cursor.val;
            currentState = runBytecode( subState, {
                historyStack: historyStackPlus( {
                    type: "onFirst",
                    bytecode:
                        revListToArr( subState.cursor.historyStack )
                }, currentState.cursor.historyStack ),
                val: !isTimes || subVal === null ?
                    null :
                    { type: "times",
                        first: subVal,
                        second: val.val.second }
            } );
        } else {
            throw new Error();
        }
    } );
    return currentState;
}

function historyStackPlus( entry, historyStack ) {
    return { first: entry, rest: historyStack };
}

bytecodeWords[ "l" ] = function ( state ) {
    var val = state.cursor.val;
    return { type: "result", state: stateWithCursor( state, {
        historyStack:
            historyStackPlus( "l", state.cursor.historyStack ),
        val: val === null ? null :
            val.type === "times" && val.second.type === "times" ?
                { type: "right", right:
                    { type: "times",
                        first: { type: "times",
                            first: val.first,
                            second: val.second.first },
                        second: val.second.second } } :
                { type: "left", left: val }
    } ) };
};

bytecodeWords[ "r" ] = function ( state ) {
    var val = state.cursor.val;
    return { type: "result", state: stateWithCursor( state, {
        historyStack:
            historyStackPlus( "r", state.cursor.historyStack ),
        val: val === null ? null :
            val.type === "times" && val.first.type === "times" ?
                { type: "right", right:
                    { type: "times",
                        first: val.first.first,
                        second: { type: "times",
                            first: val.first.second,
                            second: val.second } } } :
                { type: "left", left: val }
    } ) };
};

bytecodeWords[ "assert" ] = function ( state ) {
    var val = state.cursor.val;
    if ( val !== null && val.type !== "right" )
        return { type: "error", cursor: state.cursor };
    return { type: "result", state: stateWithCursor( state, {
        historyStack:
            historyStackPlus( "assert", state.cursor.historyStack ),
        val: val === null ? null : val.right
    } ) };
};

function testBytecode( bytecode, inputVal ) {
    var inputConsumer = {};
    inputConsumer.consume = function ( key ) {
        return null;
    };
    inputConsumer.isEmpty = function () {
        return true;
    };
    
    var finalState = runBytecode( bytecode, {
        cursor: {
            historyStack: null,
            val: inputVal
        },
        outputs: [],
        inputConsumer: inputConsumer
    } );
    if ( !finalState.inputConsumer.isEmpty() )
        throw new Error();
    return JSON.stringify( finalState.cursor.val );
}

// Expressions for testing
//
// NOTE: The types "a", "b", and "c" aren't actually going to be
// supported types, but so far they work for testing.
//
/*
testBytecode( [ "l" ],
    { type: "times",
        first: { type: "a" },
        second: { type: "times",
            first: { type: "b" },
            second: { type: "c" } } } )

testBytecode( [ "r" ],
    { type: "times",
        first: { type: "times",
            first: { type: "a" },
            second: { type: "b" } },
        second: { type: "c" } } )

testBytecode( "l assert r assert".split( " " ),
    { type: "times",
        first: { type: "a" },
        second: { type: "times",
            first: { type: "b" },
            second: { type: "c" } } } )

// This one fails.
testBytecode( "r assert".split( " " ),
    { type: "times",
        first: { type: "a" },
        second: { type: "times",
            first: { type: "b" },
            second: { type: "c" } } } )

*/
