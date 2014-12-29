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
// (TODO: Actually, bring this list up to date with the connectives
// used in the list below.)
//
// resourceWhenever <condition> <value>
// resourceUnless <condition> <value>
// withUnit
// plusUnit
// letUnused <atomName> <value>
// letFresh <atomName> <value>
// isolated <value>
// positiveComplementEquals <value> <value>
// negativeComplementEquals <value> <value>
//
// NOTE: Using these operators, we can almost represent MALL's
// additive disjunction, but in a strictly information-preserving way.
// The connective [A plus B] becomes (m.A m,B) for conditions m. This
// can also be written {$let k m (k.A k,B} or
// {$letFresh k (=[-k m],[+] (k.A k,B)}. (The condition =[-k m] states
// that (positive) k is equal to m. It's written using square brackets
// because it allows a sort of conversion from k to m.)
//
// TODO: Allow these {$letFresh ...} boundaries and equality
// propositions to bubble up to the top level and combine with each
// other to form a single {$let ...}, whose binding can be hidden to
// achieve module encapsulation. This will amount to defining compound
// "types"; currently all variables are conditions, and that will need
// to change. This might be an easy matter of defining additional
// algebraic equivalences for data pairs, etc., as an extension to the
// Boolean equivalences we currently use for conditions. Pairs in
// particular don't have many equivalences, but they will at least
// have enough to allow commutation of {$letUnused ...}, etc.
//
// TODO: Figure out if the positiveComplementEquals and
// negativeComplementEquals connectives, aka =[A B] and =(A B), should
// permit deep inference to reach A or B.


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
        // Shorthand: {$let a B C} means {$letFresh a (=[-a B],[+] C)}
        // // NOTE: We use this shorthand so that we can *transport*
        // // explicit equality assertions into syntactic structure
        // // and back. No {$let ...} rule ever really introduces or
        // // eliminates equality *information*, even if it introduces
        // // or eliminates equality propositions.
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
        // [k.B k,D]
        // --->
        // (k.B k,D)
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
        // {$letUnused j {$letUnused j A}}
        // <--->
        // {$letUnused j A}
        //
        // {$letUnused j {$letUnused m A}}
        // <--->
        // {$letUnused m {$letUnused j A}}
        //
        // {$letUnused j a}
        // <--->  for unnamed atom a or named atom a != j
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
        // {$letFresh j {$letFresh j A}}
        // <--->
        // {$letFresh j A}
        //
        // {$letFresh j {$letFresh m A}}
        // <--->
        // {$letFresh m {$letFresh j A}}
        //
        // {$letFresh j a}
        // <--->  for unnamed atoms a or named atoms a != j
        // a
        //
        // {$letFresh j ({$letUnused j A} B)}
        // <--->
        // ({$letUnused j A} {$letFresh j B})
        //
        // {$letFresh j {$letUnused j M}.A}
        // <--->
        // {$letUnused j M}.{$letFresh j A}
        //
        // {$letFresh j M.{$letUnused j A}}
        // <--->
        // {$letFresh j M}.{$letUnused j A}
        //
        // {$letFresh j {$letUnused j A}}
        // <--->
        // {$letUnused j A}
        //
        // {$letUnused j {$letFresh j A}}
        // <--->
        // {$letFresh j A}
        //
        // {$letUnused j {$letFresh m A}}
        // <--->  for j != m
        // {$letFresh m {$letUnused j A}}
        //
        // {$let j k m}
        // <--->  for unnamed atom m or named atom m != j
        // m
        //
        // {$let j k (A B)}
        // <--->  for condition or multiplicative join ()
        // ({$let j k A} {$let j k B})
        //
        // {$let j k M.A}
        // <--->
        // {$let j k M}.{$let j k A}
        //
        // {$let j k {$letUnused j A}}
        // <--->
        // {$letUnused j A}
        //
        // {$letUnused j {$let m N A}}
        // <--->
        // {$let m {$letUnused j N} {$letUnused j A}}
        //
        // {$let j k {$letFresh j A}}
        // <--->
        // {$letFresh j A}
        //
        // {$let j {$letUnused m K} {$letFresh m A}}
        // <--->  for j != m
        // {$letFresh m {$let j {$letUnused m K} A}}
        //
        // {$letUnused k A}
        // <--->
        // {$let k j {$let j k {$letUnused k A}}}
        //
        // {$let j {$letUnused j K} j}
        // <--->  for conditions K and condition atoms j
        // {$letUnused j K}
        //
        // {$let j K {$let j N A}}
        // <--->
        // {$let j {$let j K N} A}
        //
        // {$let j {$letUnused m k} {$let m N A}}
        // <--->  for m != j
        // {$let m {$let j {$letUnused m k} N}
        //   {$let j {$letUnused m k} A}}
        //
        // {$let j K {$let m {$letUnused m j} A}}
        // <--->
        // {$let m K {$let j {$letUnused j m} A}}
        //
        // {$isolated {$isolated A}}
        // <--->
        // {$isolated A}
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
        // {$isolated {$letUnused j A}}
        // <--->
        // {$isolated A}
        //
        // {$letUnused j {$isolated A}}
        // <--->
        // {$isolated A}
        //
        //
        // These are primitives for static definitions and queries in
        // the spirit of the Era module system. During the execution
        // of a module itself, the overall program input will be of
        // type {$posModuleEffects}, and the output must be of type
        // ().
        //
        // // TODO: Once this has settled down, add the new
        // // connectives used here to the list above.
        //
        // {$posModuleEffects}
        // --->  requires readerPublicKey auth
        // {$consistentlyDefinesPublic
        //   {$let j {$posImpl authorPublicKey readerPublicKey} a}
        // }.{$isolated (
        //   {$posModuleEffects}
        //   {$let j {$posImpl authorPublicKey readerPublicKey} a}
        // )}
        //
        // {$posModuleEffects}
        // --->  requires authorPublicKey auth
        // {$consistentlyDefinesPrivate
        //   {$let j k a}
        // }.{$isolated (
        //   {$posModuleEffects}
        //   {$let j {$posImpl authorPublicKey readerPublicKey} a}
        //   =[{$negImpl readerPublicKey readerPublicKey} k]
        // )}
        //
        // ({$posModuleEffects} {$isolated {$let j K A}})
        // --->  requires authorPublicKey auth
        // ()
        //
        // {$posModuleEffects}
        // --->
        // ()
        //
        // // TODO: Figure out whether this allows a definition to
        // // contain its own {$posModuleEffects} object, and if so,
        // // figure out how to stop that.
        // {$posModuleEffects}
        // <--->
        // ({$posModuleEffects} {$posModuleEffects})
        //
        // ()
        // --->
        // [{$posModuleEffects} {$negModuleEffects}]
        //
        // ()
        // <--->
        // [].{$posModuleEffects}
        //
        // // TODO: Figure out if it's sufficient that we don't define
        // // a rule corresponding to a = {$posModuleEffects} for rule
        // // ((k.a k,a) <---> a). The point is to keep from allowing
        // // conditionals that test
        // // k = {$consistentlyDefines___ ...}.
        //
        //
        // This is a primitive for willingly interacting with the
        // language implementation's internals. While technically
        // anything can happen, there are various levels of
        // recommended strictness depending on the needs of the
        // interaction:
        //
        // - The language implementation ignores all actions and
        //   produces no actions of its own (i.e. an empty
        //   {$posActions} output).
        // - The language implementation may observe these actions and
        //   produce actions of its own, which may vary according to
        //   its internal state.
        // - The language implementation may observe and produce
        //   actions, and it may also do special things with the
        //   internal details of `A`.
        // - The language implementation may do anything at all.
        //
        // // TODO: Once this has settled down, add the new
        // // connectives used here to the list above.
        //
        // ({$posActions} A)
        // --->
        // ({$posActions} A)
    } else {
        throw new Error();
    }
}
