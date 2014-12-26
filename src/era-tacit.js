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



// TODO: Test the following code.
//
// NOTE: The following code is basically a complete restart with a
// more ambitious treatment of the calculus of structures (CoS) and
// multiplicative additive linear logic (MALL). As the code runs, it
// doesn't exactly compute, but it may construct other computations
// (along linear logic's atomic flows), and those computations can use
// the same language. Their code can then be used for a kind of
// deduction that *does* compute. To control the flow of information
// and make the typing information very precise, all data during
// deduction (besides the type and the code itself) is given a
// repeatable name and manipulated via Boolean algebra rather than
// encapsulated in MALL additive connectives.



// commands:
//
// id
// then <command> <command>
// reverse <command>
// first <command>
// intro <atomName>
// switch
// rotl
// assocl
// timesUnitIntro
// parUnitIntro
// absorbAndOr <value>
// absorbOrAnd <value>
// copy
// distributeTwo
// distributeZero <value>
//
//
// values:
//
// timesUnit
// times <value> <value>
// parUnit
// par <value> <value>
// positiveResourceAtom <atomName>
// negativeResourceAtom <atomName>
// andUnit
// and <value> <value>
// orUnit
// or <value> <value>
// positiveConditionAtom <atomName>
// negativeConditionAtom <atomName>
//
// NOTE: Conditions only support information-preserving deduction,
// which lets us use them to mask non-droppable resources. For now,
// some rules may do deep comparisons of conditions.
//
// TODO: Add these, along with their rules listed below.
//
// resourceWhenever <condition> <value>
// resourceUnless <condition> <value>
// withUnit
// plusUnit
// positiveLambdaCond <atomName> <value>
// negativeLambdaCond <atomName> <value>
// letUnused <atomName> <value>
// letCond <atomName> <condition> <value>
// isolated <value>
//
// NOTE: Using these operators, we can represent MALL's additive
// disjunction [A plus B] as {$negLambdaCond k (k.A k,B)}.


var setlikes = [ {
    hasAtoms: true,
    hasSwitch: true,
    positive: { join: "times", unit: "timesUnit",
        atom: "positiveResourceAtom", unitIntro: "timesUnitIntro" },
    negative: { join: "par", unit: "parUnit",
        atom: "negativeResourceAtom", unitIntro: "parUnitIntro" }
}, {
    hasAtoms: true,
    hasSwitch: false,
    positive: { join: "and", unit: "andUnit",
        atom: "positiveConditionAtom", unitIntro: "andUnitIntro" },
    negative: { join: "or", unit: "orUnit",
        atom: "negativeConditionAtom", unitIntro: "orUnitIntro" }
} ];

function matchSetlike( checkSetlikePolarity ) {
    for ( var i = 0, n = setlikes.length; i++; i < n ) {
        var setlike = setlikes[ i ];
        if ( checkSetlikePolarity( setlike.positive ) )
            return { setlike: setlike,
                forward: setlike.positive,
                backward: setlike.negative };
        if ( checkSetlikePolarity( setlike.negative ) )
            return { setlike: setlike,
                forward: setlike.negative,
                backward: setlike.positive };
    }
    return false;
}

function matchJoin( type ) {
    return matchSetlike( function ( x ) {
        return x.join === type;
    } );
}

function matchUnit( type ) {
    return matchSetlike( function ( x ) {
        return x.unit === type;
    } );
}

function matchAtom( type ) {
    return matchSetlike( function ( x ) {
        return x.atom === type;
    } );
}

function matchUnitIntro( type ) {
    return matchSetlike( function ( x ) {
        return x.unitIntro === type;
    } );
}

function isSameConditionAtom( a, b ) {
    return a.type === b.type && (false
        || a.type === "andUnit"
        || a.type === "orUnit"
        || (a.type === "positiveConditionAtom" && a.name === b.name)
        || (a.type === "negativeConditionAtom" && a.name === b.name)
    );
}

function isSameConditionTerm( a, b ) {
    return isSameConditionAtom( a, b ) || (a.type === b.type
        && (a.type === "or" || a.type === "and")
        && isSameConditionTerm( a.first, b.first )
        && isSameConditionTerm( a.second, b.second )
    );
}

function negateConditionTerm( x ) {
    if ( x.type === "andUnit" ) {
        return { type: "orUnit" };
    } else if ( x.type === "orUnit" ) {
        return { type: "andUnit" };
    } else if ( x.type === "positiveConditionAtom" ) {
        return { type: "negativeConditionAtom", name: x.name };
    } else if ( x.type === "negativeConditionAtom" ) {
        return { type: "positiveConditionAtom", name: x.name };
    } else if ( x.type === "and" ) {
        var first = negateConditionTerm( x.first );
        if ( first === null )
            return null;
        var second = negateConditionTerm( x.second );
        if ( second === null )
            return null;
        return { type: "or", first: first, second: second };
    } else if ( x.type === "or" ) {
        var first = negateConditionTerm( x.first );
        if ( first === null )
            return null;
        var second = negateConditionTerm( x.second );
        if ( second === null )
            return null;
        return { type: "and", first: first, second: second };
    } else {
        return null;
    }
}

function isOppositeConditionAtom( a, b ) {
    function oneWay( a, b ) {
        return (false
            || (a.type === "andUnit" && b.type === "orUnit")
            || (a.type === "positiveConditionAtom"
                && b.type === "negativeConditionAtom"
                && a.name === b.name)
        );
    }
    return oneWay( a, b ) || oneWay( b, a );
}

function isOppositeConditionTerm( a, b ) {
    function oneWay( a, b ) {
        return (a.type === "and" && b.type === "or"
            && isSameConditionTerm( a.first, b.first )
            && isSameConditionTerm( a.second, b.second ));
    }
    return isOppositeConditionAtom( a, b ) ||
        oneWay( a, b ) || oneWay( b, a );
}

function runCommand( state, reversed, command ) {
    var recordableCommand =
        reversed ? { type: "reverse", command: command } : command;
    
    var m;
    if ( command.type === "id" ) {
        // A
        // ---
        // A
        
        return state;
    } else if ( command.type === "then" ) {
        // A
        // --- works as long as A --- A' and A' --- A''
        // A'
        
        var state2 = runCommand( state, reversed, command.first );
        return runCommand( state2, reversed, command.second );
    } else if ( command.type === "reverse" ) {
        // -A'
        // --- works as long as A --- A'
        // -A
        
        return runCommand( state, !reversed, command.command );
    } else if ( command.type === "first" ) {
        // (A B C ...)
        // --- works for any connective () with at least one
        //     substructure as long as A --- A'
        // (A' B C ...)
        
        if ( matchJoin( state.type ) ) {
            return { type: state.type,
                first: runCommand(
                    state.first, reversed, command.command ),
                second: state.second };
        } else {
            throw new Error();
        }
    } else if ( command.type === "intro" ) {
        // ()
        // --- works for any setlike connective family () [] a -a
        //     which supports atoms
        // [a -a]
        
        if ( !reversed ) {
            var m2;
            if ( !(m2 = matchUnit( state.type )
                && m2.setlike.hasAtoms
                && state.type === m2.setlike.positive.unit) )
                throw new Error();
//            var accum = { val: { type: "id" } };
//            var first = { type: m2.setlike.positive.atom,
//                name: command.name,
//                getAccum: function () {
//                    return accum;
//                },
//                setAccum: function ( newAccum ) {
//                    accum = newAccum;
//                },
//                record: function ( c ) {
//                    accum.val = { type: "then",
//                        first: { type: "reverse", command: c },
//                        second: accum.val };
//                } };
//            var second = { type: m2.setlike.negative.atom,
//                name: command.name,
//                dominate: function ( positiveAtom ) {
//                    accum.val = { type: "then",
//                        first: accum.val,
//                        second: positiveAtom.getAccum().val };
//                    positiveAtom.setAccum( accum );
//                },
//                record: function ( c ) {
//                    accum.val =
//                        { type: "then", first: accum.val, second: c };
//                } };
            var first = { type: m2.setlike.positive.atom,
                name: command.name };
            var second = { type: m2.setlike.negative.atom,
                name: command.name };
            return { type: m2.setlike.negative.join,
                first: first, second: second };
        } else {
            var m2;
            if ( !(true
                && m2 = matchJoin( state.type )
                && state.type === m2.setlike.positive.join
                && state.first.type === m2.setlike.positive.atom
                && state.first.name === command.name
                && state.second.type === m2.setlike.negative.atom
                && state.second.name === command.name
            ) )
                throw new Error();
//            state.second.dominate( state.first );
            return { type: m2.setlike.negative.unit };
        }
    } else if ( command.type === "switch" ) {
        // ([A B] C)
        // --- works for any setlike connective family () [] which
        //     supports switch
        // [(A C) B]
        
        var m2;
        if ( !(m2 = matchJoin( state.type )
            && m2.setlike.hasSwitch
            && state.type === m2.setlike.positive.join
            && state.first.type === m2.setlike.negative.join) )
            throw new Error();
        return { type: m2.setlike.negative.join,
            first: { type: m2.setlike.positive.join,
                first: state.first.first,
                second: state.second },
            second: state.first.second };
    } else if ( command.type === "rotl" ) {
        // (A B C ... Y Z)
        // --- works for any connective () with a rotated equivalent
        //     []
        // [B C ... Y Z A]
        
        if ( matchUnit( state.type ) ) {
            return state;
        } else if ( matchJoin( state.type ) ) {
            return { type: state.type,
                first: state.second,
                second: state.first };
        } else if ( matchAtom( state.type ) ) {
            return state;
        } else {
            throw new Error();
        }
    } else if ( command.type === "assocl" ) {
        // (A (B C))
        // --- works for any associative binary connective ()
        // ((A B) C)
        
        if ( !reversed ) {
            if ( matchJoin( state.type )
                && state.second.type === state.type ) {
                
                return { type: state.type,
                    first: { type: state.type,
                        first: state.first,
                        second: state.second.first },
                    second: state.second.second };
            } else {
                throw new Error();
            }
        } else {
            if ( matchJoin( state.type )
                && state.first.type === state.type ) {
                
                return { type: state.type,
                    first: state.first.first,
                    first: { type: state.type,
                        first: state.first.second,
                        second: state.second } };
            } else {
                throw new Error();
            }
        }
    } else if ( m = matchUnitIntro( command.type ) ) {
        // A
        // --- works for any binary connective () with a unit
        // (A ())
        
        if ( !reversed ) {
            return { type: m.forward.join,
                first: state,
                second: { type: m.forward.unit } };
        } else {
            if ( state.type !== m.backward.join
                || state.second.type !== m.backward.unit )
                throw new Error();
            return state.first;
        }
    } else if ( command.type === "absorbAndOr" ) {
        // (a [a b])
        // ---
        // a
        
        if ( !reversed ) {
            if ( !(true
                && state.type === "and"
                && state.second.type === "or"
                && isSameConditionTerm(
                    state.first, state.second.first )
                && isSameConditionTerm(
                    state.second.second, command.value )
            ) )
                throw new Error();
            return state.first;
        } else {
            if ( !isSameConditionTerm( state, state ) )
                throw new Error();
            return { type: "or",
                first: state,
                second: { type: "and",
                    first: state,
                    second: command.value } };
        }
    } else if ( command.type === "absorbOrAnd" ) {
        // [a (a b)]
        // ---
        // a
        
        if ( !reversed ) {
            if ( !(true
                && state.type === "or"
                && state.second.type === "and"
                && isSameConditionTerm(
                    state.first, state.second.first )
                && isSameConditionTerm(
                    state.second.second, command.value )
            ) )
                throw new Error();
            return state.first;
        } else {
            if ( !isSameConditionTerm( state, state ) )
                throw new Error();
            return { type: "and",
                first: state,
                second: { type: "or",
                    first: state,
                    second: command.value } };
        }
    } else if ( command.type === "copy" ) {
        // a
        // ---
        // (a a)
        
        if ( !reversed ) {
            if ( !isSameConditionTerm( state, state ) )
                throw new Error();
            return { type: "and", first: state, second: state };
        } else {
            if ( !(state.type === "or"
                && isSameConditionTerm( state.first, state.second )) )
                throw new Error();
            return state.first;
        }
    } else if ( command.type === "distributeTwo" ) {
        // (a [B C])
        // --- works for () over [] and [] over ()
        // [(a B) (a C)]
        
        var m2;
        if ( !(m2 = matchJoin( state.type )
            && m2.setlike.positive.join === "and") )
            throw new Error();
        
        if ( !reversed ) {
            if ( !(true
                && isSameConditionTerm( state.first, state.first )
                && state.second.type === m2.backward.join
            ) )
                throw new Error();
            return { type: m2.backward.join,
                first: { type: m2.forward.join,
                    first: state.first,
                    second: state.second.first },
                second: { type: m2.forward.join,
                    first: state.first,
                    second: state.second.second } };
        } else {
            if ( !(true
                && state.first.type === m2.backward.join
                && state.second.type === m2.backward.join
                && isSameConditionTerm(
                    state.first.first, state.second.first )
            ) )
                throw new Error();
            return { type: m2.backward.join,
                first: state.first.first,
                second: { type: m2.forward.join,
                    first: state.first.second,
                    second: state.second.second } };
        }
    } else if ( command.type === "distributeZero" ) {
        // (a [])
        // --- works for () over [] and [] over ()
        // []
        
        if ( !reversed ) {
            var m2;
            if ( !(true
                && m2 = matchJoin( state.type )
                && m2.setlike.positive.join === "and"
                && isSameConditionTerm( state.first, command.value )
                && state.second.type === m2.backward.unit
            ) )
                throw new Error();
            return state.second;
        } else {
            var m2;
            if ( !(true
                && m2 = matchUnit( state.type )
                && m2.setlike.positive.join === "and"
            ) )
                throw new Error();
            return { type: m2.backward.join,
                first: command.value,
                second: state };
        }
        
        // TODO: Add these rules. (The notation k.a means
        // resourceWhenever with a condition of `k` and a resource of
        // `a`. Likewise, k,a means resourceUnless. On the left side
        // of a k.a, k,a, or {$letCond ...}, every () and [] means and
        // and or respectively; otherwise they mean times and par. The
        // notations [+] and (+) represent the additive units, so
        // k,[+] can be thought of as a proof of k.)
        //
        // // TODO: This one is redundant thanks to the [+] rules
        // // below. See if it should be removed.
        // A
        // <--->  additive unit
        // ().A
        //
        // J.K.A  // binding to the right: J.(K.(A))
        // <--->  additive associativity
        // (J K).A
        //
        // ()
        // <--->
        // [].a
        //
        // (k.a k,a)
        // <--->
        // a
        //
        // K.A
        // <--->
        // -K,A
        //
        // k.(A B)
        // <--->
        // (k.A k.B)
        //
        // k.()
        // <--->
        // ()
        //
        // [k.[A B] k,[C D]]
        // --->
        // [[k.A k,C] (k.B k,D)]
        //
        // (k.[A B] k,[C D])
        // --->
        // [(k.A k,C) (k.B k,D)]
        //
        // (A B),[+]
        // <--->
        // (A,[+] B,[+])
        //
        // ()
        // <--->
        // (),[+]
        //
        // (k,[+] A)
        // <--->
        // (k,[+] k.A)
        //
        // {$posLambdaCond j A}
        // --->
        // {$letCond j k A}
        //
        // {$posLambdaCond j [A B]}
        // --->
        // [{$posLambdaCond j A} {$negLambdaCond j B}]
        //
        // {$letUnused j a}
        // <--->  for unnamed atoms a
        // a
        //
        // {$letUnused j (A B)}
        // <--->
        // ({$letUnused j A} {$letUnused j B})
        //
        // {$letUnused j M.A}
        // <--->
        // {$letUnused j M}.{$letUnused j A}
        //
        // {$letUnused j M.A}
        // <--->
        // {$letUnused j M}.{$letUnused j A}
        //
        // {$letUnused j {$posLambdaCond j A}}
        // <--->
        // {$posLambdaCond j A}
        //
        // {$letUnused j {$posLambdaCond m A}}
        // <--->  for j != m
        // {$posLambdaCond m {$letUnused j A}}
        //
        // {$letUnused j {$letUnused j A}}
        // <--->
        // {$letUnused j A}
        //
        // {$letUnused j {$letUnused m A}}
        // <--->
        // {$letUnused m {$letUnused j A}}
        //
        // A
        // <--->
        // {$letCond j j A}
        //
        // {$letCond j K j}
        // <--->
        // K
        //
        // {$letCond j k m}
        // <--->  for non-condition atom m or condition atom m != j
        // m
        //
        // {$letCond j k (A B)}
        // <--->  for condition or multiplicative join ()
        // ({$letCond j k A} {$letCond j k B})
        //
        // {$letCond j k M.A}
        // <--->
        // {$letCond j k M}.{$letCond j k A}
        //
        // {$letCond j k {$posLambdaCond j A}}
        // <--->
        // {$posLambdaCond j A}
        //
        // {$letCond j {$letUnused m K} {$posLambdaCond m A}}
        // <--->  for j != m
        // {$posLambdaCond m {$letCond j {$letUnused m K} A}}
        //
        // {$letUnused j {$letCond m N A}}
        // <--->
        // {$letCond m {$letUnused j N} {$letUnused j A}}
        //
        // {$letUnused j A}
        // <--->
        // {$letCond j k {$letUnused j A}}
        //
        // {$letCond j K {$letCond j N A}}
        // <--->
        // {$letCond j {$letCond j K N} A}
        //
        // {$letCond j {$letUnused m k} {$letCond m N A}}
        // <--->  for m != j
        // {$letCond m {$letCond j {$letUnused m k} N}
        //   {$letCond j {$letUnused m k} A}}
        //
        // {$letCond j K {$letCond m j A}}
        // <--->
        // {$letCond m K {$letCond j m A}}
        //
        // {$isolated a}
        // <--->  for unnamed atoms a
        // a
        //
        // {$isolated (A B)}
        // <--->
        // ({$isolated A} {$isolated B})
        //
        // {$isolated M.A}
        // <--->
        // {$isolated M}.{$isolated A}
        //
        // {$isolated M.A}
        // <--->
        // {$isolated M}.{$isolated A}
        //
        // {$isolated {$posLambdaCond j {$letUnused j A}}}
        // <--->
        // {$posLambdaCond j {$letUnused j {$isolated A}}}
        //
        // {$isolated {$isolated A}}
        // <--->
        // {$isolated A}
        //
        // {$isolated {$letUnused j A}}
        // <--->
        // {$isolated A}
        //
        // TODO: Add primitives for willing interaction with a
        // debugger.
        //
        // TODO: Add primitives for static definitions and queries in
        // the spirit of the Era module system.
    } else {
        throw new Error();
    }
}
