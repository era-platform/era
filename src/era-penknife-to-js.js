// era-penknife-to-js.js
// Copyright 2014 Ross Angle. Released under the MIT License.
"use strict";


function strToSource( str ) {
    return JSON.stringify( str ).
        replace( /\u2028/g, "\\u2028" ).
        replace( /\u2029/g, "\\u2029" );
}
function testStrToSource( str ) {
    if ( str !== Function( "return " + strToSource( str ) + ";" )() )
        throw new Error();
}
testStrToSource( "foo" );
testStrToSource( "\u2028" );
testStrToSource( "\u2029" );

function jsListFromArr( arr ) {
    var result = null;
    for ( var i = arr.length - 1; 0 <= i; i-- )
        result = { first: arr[ i ], rest: result };
    return result;
}
function jsList( var_args ) {
    return jsListFromArr( arguments );
}

function jsListGetNat( yoke, list, nat, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( list === null )
            return then( yoke, null );
        if ( nat.tag !== "succ" )
            return then( yoke, { val: list.first } );
        return jsListGetNat( yoke, list.rest, nat.ind( 0 ), then );
    } );
}
function jsListRevAppend( yoke, backwardFirst, forwardSecond, then ) {
    if ( backwardFirst === null )
        return then( yoke, forwardSecond );
    return runWaitOne( yoke, function ( yoke ) {
        return jsListRevAppend( yoke, backwardFirst.rest,
            { first: backwardFirst.first, rest: forwardSecond },
            then );
    } );
}
function jsListRev( yoke, list, then ) {
    return jsListRevAppend( yoke, list, null,
        function ( yoke, result ) {
        
        return then( yoke, result );
    } );
}
function jsListAppend( yoke, a, b, then ) {
    return jsListRev( yoke, a, function ( yoke, revA ) {
        return jsListRevAppend( yoke, revA, b,
            function ( yoke, result ) {
            
            return then( yoke, result );
        } );
    } );
}
function jsListFoldl( yoke, init, list, func, then ) {
    return go( yoke, init, list );
    function go( yoke, init, list ) {
        if ( list === null )
            return then( yoke, init );
        return runWaitOne( yoke, function ( yoke ) {
            return func( yoke, init, list.first,
                function ( yoke, combined ) {
                
                return go( yoke, combined, list.rest );
            } );
        } );
    }
}
function jsListFlattenOnce( yoke, list, then ) {
    return go( yoke, list, null );
    function go( yoke, list, revResult ) {
        if ( list === null )
            return jsListRev( yoke, revResult,
                function ( yoke, result ) {
                
                return then( yoke, result );
            } );
        return jsListRevAppend( yoke, list.first, revResult,
            function ( yoke, revResult ) {
            
            return runWaitOne( yoke, function ( yoke ) {
                return go( yoke, list.rest, revResult );
            } );
        } );
    }
}
function jsListCount( yoke, list, func, then ) {
    return jsListFoldl( yoke, pkNil, list,
        function ( yoke, count, elem, then ) {
        
        if ( func( elem ) )
            return then( yoke, pk( "succ", count ) );
        return then( yoke, count );
    }, function ( yoke, count ) {
        return then( yoke, count );
    } );
}
function jsListLen( yoke, list, then ) {
    return jsListCount( yoke, list, function ( elem ) {
        return true;
    }, function ( yoke, count ) {
        return then( yoke, count );
    } );
}
function jsListMap( yoke, list, func, then ) {
    return jsListFoldl( yoke, null, list,
        function ( yoke, revPast, elem, then ) {
        
        return func( yoke, elem, function ( yoke, elem ) {
            return then( yoke, { first: elem, rest: revPast } );
        } );
    }, function ( yoke, revResult ) {
        return jsListRev( yoke, revResult, function ( yoke, result ) {
            return then( yoke, result );
        } );
    } );
}
function jsListMappend( yoke, list, func, then ) {
    return jsListMap( yoke, list, function ( yoke, elem, then ) {
        return func( yoke, elem, then );
    }, function ( yoke, resultLists ) {
        return jsListFlattenOnce( yoke, resultLists,
            function ( yoke, result ) {
            
            return then( yoke, result );
        } );
    } );
}
function jsListMapMultiWithLen( yoke, nat, lists, func, then ) {
    return go( yoke, nat, lists, null );
    function go( yoke, nat, lists, revResults ) {
        if ( nat.tag !== "succ" )
            return jsListRev( yoke, revResults,
                function ( yoke, results ) {
                
                return then( yoke, results );
            } );
        return jsListMap( yoke, lists, function ( yoke, list, then ) {
            return then( yoke, list.first );
        }, function ( yoke, firsts ) {
            return jsListMap( yoke, lists,
                function ( yoke, list, then ) {
                
                return then( yoke, list.rest );
            }, function ( yoke, rests ) {
                return func( yoke, firsts,
                    function ( yoke, resultElem ) {
                    
                    return go( yoke, nat.ind( 0 ), rests,
                        { first: resultElem, rest: revResults } );
                } );
            } );
        } );
    }
}
function jsListMapMulti( yoke, lists, func, then ) {
    if ( lists === null )
        throw new Error();
    return jsListLen( yoke, lists.first, function ( yoke, len ) {
        return jsListMapMultiWithLen( yoke, len, lists,
            function ( yoke, elems, then ) {
            
            return func( yoke, elems, function ( yoke, resultElem ) {
                return then( yoke, resultElem );
            } );
        }, function ( yoke, result ) {
            return then( yoke, result );
        } );
    } );
}
function jsListMapTwo( yoke, a, b, func, then ) {
    return jsListMapMulti( yoke, jsList( a, b ),
        function ( yoke, elems, then ) {
        
        return func( yoke, elems.first, elems.rest.first,
            function ( yoke, resultElem ) {
            
            return then( yoke, resultElem );
        } );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}
function pkListToJsList( yoke, pkList, then ) {
    return listFoldlJsAsync( yoke, null, pkList,
        function ( yoke, revPast, elem, then ) {
        
        return then( yoke, { first: elem, rest: revPast } );
    }, function ( yoke, revResult ) {
        return jsListRev( yoke, revResult, function ( yoke, result ) {
            return then( yoke, result );
        } );
    } );
}
function natToJsList( yoke, nat, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( nat.tag !== "succ" )
            return then( yoke, null );
        return natToJsList( yoke, nat.ind( 0 ),
            function ( yoke, rest ) {
            
            return then( yoke, { first: null, rest: rest } );
        } );
    } );
}

// TODO: Right now this abuses Pk#toString(), which doesn't support
// bigints. Even if that method did support bigints, this operation's
// steps between yoke waits would take non-constant time. Fix this.
// TODO: Whoops, when the nat is zero, this converts to "nil". Make it
// convert to "0", not that it matters very much.
function natToJsStringAsync( yoke, nat, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, "" + nat );
    } );
}

function natToGs( yoke, nat, then ) {
    return natToJsStringAsync( yoke, nat, function ( yoke, numStr ) {
        return then( yoke, "gs" + numStr );
    } );
}

function getGs( yoke, gsi, then ) {
    return natToGs( yoke, gsi, function ( yoke, varName ) {
        return then( yoke, pk( "succ", gsi ), varName );
    } );
}

function startGensymIndex() {
    return pkNil;
}

function getGsAndFinishWithExpr( yoke,
    gensymIndex, expr, revStatements, then ) {
    
    var gsi = gensymIndex;
    return getGs( yoke, gsi, function ( yoke, gsi, resultVar ) {
        return then( yoke, gsi, { ok: true, val: {
            revStatements: {
                first: {
                    type: "sync",
                    code: expr,
                    resultVar: resultVar
                },
                rest: revStatements
            },
            resultVar: resultVar
        } } );
    } );
}

function compileCallOnLiteral( yoke,
    gensymIndex, funcCode, literalArg, then ) {
    
    var gsi = gensymIndex;
    
    return compileLiteral( yoke, gsi, literalArg,
        function ( yoke, gsi, compiledArg ) {
        
        if ( !compiledArg.ok )
            return then( yoke, null, compiledArg );
    
    return getGsAndFinishWithExpr( yoke, gsi,
        "" + funcCode + "( " + compiledArg.val.resultVar + " )",
        compiledArg.val.revStatements,
        function ( yoke, gsi, compiledResult ) {
        
        return then( yoke, gsi, compiledResult );
    } );
    
    } );
}
function compileCallOnLiteral2( yoke,
    gensymIndex, funcCode, literalArg1, literalArg2, then ) {
    
    var gsi = gensymIndex;
    
    return compileLiteral( yoke, gsi, literalArg1,
        function ( yoke, gsi, compiledArg1 ) {
        
        if ( !compiledArg1.ok )
            return then( yoke, null, compiledArg1 );
    
    return compileLiteral( yoke, gsi, literalArg2,
        function ( yoke, gsi, compiledArg2 ) {
        
        if ( !compiledArg1.ok )
            return then( yoke, null, compiledArg2 );
    
    return jsListAppend( yoke,
        compiledArg2.val.revStatements,
        compiledArg1.val.revStatements,
        function ( yoke, revStatements ) {
    
    return getGsAndFinishWithExpr( yoke, gsi,
        "" + funcCode + "( " +
            compiledArg1.val.resultVar + ", " +
            compiledArg2.val.resultVar + " )",
        revStatements,
        function ( yoke, gsi, compiledResult ) {
        
        return then( yoke, gsi, compiledResult );
    } );
    
    } );
    
    } );
    
    } );
}

function compileListOfVars( yoke, gensymIndex, elemVars, then ) {
    var gsi = gensymIndex;
    return jsListRev( yoke, elemVars, function ( yoke, revElemVars ) {
    return jsListFoldl( yoke,
        {
            gsi: gsi,
            resultSoFar: { revStatements: null, resultVar: "pkNil" }
        },
        revElemVars,
        function ( yoke, state, elemVar, then ) {
        
        return getGs( yoke, state.gsi,
            function ( yoke, gsi, resultVar ) {
            
            return then( yoke, { gsi: gsi, resultSoFar: {
                revStatements: {
                    first: {
                        type: "sync",
                        code: "pkCons( " + elemVar + ", " +
                            state.resultSoFar.resultVar + " )",
                        resultVar: resultVar
                    },
                    rest: state.resultSoFar.revStatements
                },
                resultVar: resultVar
            } } );
        } );
    }, function ( yoke, state ) {
    
    return then( yoke, state.gsi, state.resultSoFar );
    
    } );
    } );
}

// NOTE: The word "zoke" is just a play on words since it's basically
// a second "yoke." We could have named this variable "state," but
// we have a local variable named that.
function jsListRevMapWithStateAndErrors( yoke, zoke,
    elems, processElem, then ) {
    
    return jsListFoldl( yoke,
        { ok: true, val: { zoke: zoke, revProcessed: null } },
        elems,
        function ( yoke, state, elem, then ) {
        
        if ( !state.ok )
            return then( yoke, state );
        
        return processElem( yoke, state.val.zoke, elem,
            function ( yoke, zoke, compiledElem ) {
            
            if ( !compiledElem.ok )
                return then( yoke, compiledElem );
            
            return then( yoke, { ok: true, val: {
                zoke: zoke,
                revProcessed: { first: compiledElem.val,
                    rest: state.val.revProcessed }
            } } );
        } );
    }, function ( yoke, state ) {
        if ( !state.ok )
            return then( yoke, null, state );
        return then( yoke, state.val.zoke,
            { ok: true, val: state.val.revProcessed } );
    } );
}

function compileMapToVars( yoke,
    gensymIndex, elems, compileElem, then ) {
    
    var gsi = gensymIndex;
    return jsListRevMapWithStateAndErrors( yoke, gsi, elems,
        function ( yoke, gsi, elem, then ) {
        
        return compileElem( yoke, gsi, elem,
            function ( yoke, gsi, compiledElem ) {
            
            return then( yoke, gsi, compiledElem );
        } );
    }, function ( yoke, gsi, revCompiledElems ) {
        if ( !revCompiledElems.ok )
            return then( yoke, null, null, null, revCompiledElems );
    
    return jsListMappend( yoke, revCompiledElems.val,
        function ( yoke, compiledElem, then ) {
        
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, compiledElem.revStatements );
        } );
    }, function ( yoke, revStatements ) {
    return jsListMap( yoke, revCompiledElems.val,
        function ( yoke, compiledElem, then ) {
        
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, compiledElem.resultVar );
        } );
    }, function ( yoke, revElemVars ) {
    return jsListRev( yoke, revElemVars,
        function ( yoke, elemVars ) {
    
    return then( yoke, gsi, revStatements, elemVars,
        { ok: true, val: null } );
    
    } );
    } );
    } );
    
    } );
}

function compileMapToList( yoke,
    gensymIndex, elems, compileElem, then ) {
    
    var gsi = gensymIndex;
    return compileMapToVars( yoke, gsi, elems, compileElem,
        function ( yoke, gsi, revStatements, elemVars, valid ) {
        
        if ( !valid.ok )
            return then( yoke, null, valid );
    
    return compileListOfVars( yoke, gsi, elemVars,
        function ( yoke, gsi, compiledElems ) {
    return jsListAppend( yoke,
        compiledElems.revStatements,
        revStatements,
        function ( yoke, revStatements ) {
    
    return then( yoke, gsi, { ok: true, val: {
        revStatements: revStatements,
        resultVar: compiledElems.resultVar
    } } );
    
    } );
    } );
    
    } );
}

function compileListToVars( yoke,
    gensymIndex, compiledList, len, then ) {
    
    var gsi = gensymIndex;
    return natToJsList( yoke, len, function ( yoke, len ) {
    return jsListRevMapWithStateAndErrors( yoke,
        { gsi: gsi, lastListVar: compiledList.resultVar },
        len,
        function ( yoke, state, ignored, then ) {
        
        return getGs( yoke, state.gsi,
            function ( yoke, gsi, elemVar ) {
        return getGs( yoke, gsi, function ( yoke, gsi, restVar ) {
        
        return then( yoke, { gsi: gsi, lastListVar: restVar },
            { ok: true, val: {
            
            revStatements: jsList( {
                type: "sync",
                code: "pkInd( " + state.lastListVar + ", 1 )",
                resultVar: restVar
            }, {
                type: "sync",
                code: "pkInd( " + state.lastListVar + ", 0 )",
                resultVar: elemVar
            } ),
            resultVar: elemVar
        } } );
        
        } );
        } );
    }, function ( yoke, state, revCompiledElems ) {
        if ( !revCompiledElems.ok )
            return then( yoke, null, null, null, revCompiledElems );
    
    return jsListMappend( yoke, revCompiledElems.val,
        function ( yoke, compiledElem, then ) {
        
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, compiledElem.revStatements );
        } );
    }, function ( yoke, compiledElemsRevStatements ) {
    return jsListMap( yoke, revCompiledElems.val,
        function ( yoke, compiledElem, then ) {
        
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, compiledElem.resultVar );
        } );
    }, function ( yoke, revCompiledElemVars ) {
    return jsListRev( yoke, revCompiledElemVars,
        function ( yoke, compiledElemVars ) {
    return jsListAppend( yoke,
        compiledElemsRevStatements,
        compiledList.revStatements,
        function ( yoke, revStatements ) {
    
    return then( yoke, state.gsi, revStatements, compiledElemVars,
        { ok: true, val: null } );
    
    } );
    } );
    } );
    } );
    
    } );
    } );
}

function compileDupsOfOne( yoke,
    gensymIndex, sourceVar, numberOfDups, then ) {
    
    var gsi = gensymIndex;
    
    // Optimization: Only generate a pkDup call if the number of
    // duplicates isn't exactly one. (This is surprisingly effective.)
    if ( numberOfDups.tag === "succ"
        && numberOfDups.ind( 0 ).tag === "nil" )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, gsi, null, jsList( sourceVar ),
                { ok: true, val: null } );
        } );
    // End optimization.
    
    return compileLiteral( yoke, gsi, numberOfDups,
        function ( yoke, gsi, compiledNumberOfDups ) {
        
        if ( !compiledNumberOfDups.ok )
            return then( yoke,
                null, null, null, compiledNumberOfDups );
    
    return getGs( yoke, gsi, function ( yoke, gsi, callbackVar ) {
    return getGs( yoke, gsi, function ( yoke, gsi, dupsVar ) {
    return compileListToVars( yoke, gsi,
        {
            revStatements: {
                first: {
                    type: "async",
                    callbackVar: callbackVar,
                    resultVar: dupsVar,
                    code: "pkDup( yoke, " + sourceVar + ", " +
                        compiledNumberOfDups.val.resultVar + ", " +
                        callbackVar + " )"
                },
                rest: compiledNumberOfDups.val.revStatements
            },
            resultVar: dupsVar
        },
        numberOfDups,
        function ( yoke,
            gsi, revStatements, compiledDupVars, valid ) {
        
        if ( !valid.ok )
            return then( yoke, null, null, null, valid );
    
    return then( yoke, gsi, revStatements, compiledDupVars,
        { ok: true, val: null } );
    
    } );
    } );
    } );
    
    } );
}

function compileDupsOfMany( yoke,
    gensymIndex, sourceVars, numbersOfDups, then ) {
    
    var gsi = gensymIndex;
    
    return jsListMapTwo( yoke, sourceVars, numbersOfDups,
        function ( yoke, sourceVar, numberOfDups, then ) {
        
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, {
                sourceVar: sourceVar,
                numberOfDups: numberOfDups
            } );
        } );
    }, function ( yoke, elemVarsAndNumbersOfDups ) {
    return jsListRevMapWithStateAndErrors( yoke, gsi,
        elemVarsAndNumbersOfDups,
        function ( yoke, gsi, entry, then ) {
        
        return compileDupsOfOne( yoke, gsi,
            entry.sourceVar,
            entry.numberOfDups,
            function ( yoke, gsi, revStatements, dupVars, valid ) {
            
            if ( !valid.ok )
                return then( yoke, null, valid );
            
            return then( yoke, gsi, { ok: true, val: {
                revStatements: revStatements,
                dupVars: dupVars
            } } );
        } );
    }, function ( yoke, gsi, revCompiledDupsNested ) {
        if ( !revCompiledDupsNested.ok )
            return then( yoke, null, revCompiledDupsNested );
    
    return jsListMappend( yoke, revCompiledDupsNested.val,
        function ( yoke, compiledDupList, then ) {
        
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, compiledDupList.revStatements );
        } );
    }, function ( yoke, revStatements ) {
    return jsListRev( yoke, revCompiledDupsNested.val,
        function ( yoke, compiledDupsNested ) {
    return jsListMappend( yoke, compiledDupsNested,
        function ( yoke, compiledDupList, then ) {
        
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, compiledDupList.dupVars );
        } );
    }, function ( yoke, dupVars ) {
    
    return then( yoke, gsi, revStatements, dupVars,
        { ok: true, val: null } );
    
    } );
    } );
    } );
    
    } );
    } );
}

function compileLiteral( yoke, gensymIndex, pkVal, then ) {
    var gsi = gensymIndex;
    
    function waitErr( yoke, message ) {
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, null, { ok: false, val: message } );
        } );
    }
    
    // Optimization: If a literal natural number is small enough, look
    // it up from a table.
    if ( pkVal.tag === "succ" ) {
        var jsNum = natToJsBounded( pkVal, maxCachedNat );
        if ( jsNum !== null )
            return getGsAndFinishWithExpr( yoke, gsi,
                "cachedNats[ " + jsNum + " ]",
                null,
                function ( yoke, gsi, compiled ) {
                
                return then( yoke, gsi, compiled );
            } );
    }
    // End optimization. (However, this is the only part of the
    // generated code that uses cachedNats, so if you want to remove
    // this, you might also want to remove it from the list of free
    // variables passed into the code.)
    
    if ( pkVal.isLinear() ) {
        // NOTE: This case would technically be unnecessary if we
        // checked for nonlinear-as-linear instead, but we might as
        // well get it out of the way early on, since we can.
        return waitErr( yoke,
            "Tried to compile a literal value that was linear" );
    } else if ( pkVal.tag === "nil" ) {
        return then( yoke, gsi, { ok: true, val: {
            revStatements: null,
            resultVar: "pkNil"
        } } );
    } else if ( pkVal.tag === "cons" ) {
        return compileCallOnLiteral2( yoke, gsi,
            "pkCons", pkVal.ind( 0 ), pkVal.ind( 1 ),
            function ( yoke, gsi, compiled ) {
            
            return then( yoke, gsi, compiled );
        } );
    } else if ( pkVal.tag === "string" ) {
        return getGsAndFinishWithExpr( yoke, gsi,
            "pkStrUnsafe( " +
                strToSource( pkVal.special.jsStr ) + " )",
            null,
            function ( yoke, gsi, compiled ) {
            
            return then( yoke, gsi, compiled );
        } );
    } else if ( pkVal.tag === "string-name" ) {
        return compileCallOnLiteral( yoke, gsi,
            "pkStrNameRaw", pkVal.ind( 0 ),
            function ( yoke, gsi, compiled ) {
            
            return then( yoke, gsi, compiled );
        } );
    } else if ( pkVal.tag === "pair-name" ) {
        return compileCallOnLiteral2( yoke, gsi,
            "pkPairName", pkVal.ind( 0 ), pkVal.ind( 1 ),
            function ( yoke, gsi, compiled ) {
            
            return then( yoke, gsi, compiled );
        } );
    } else if ( pkVal.tag === "qualified-name" ) {
        return compileCallOnLiteral( yoke, gsi,
            "pkQualifiedName", pkVal.ind( 0 ),
            function ( yoke, gsi, compiled ) {
            
            return then( yoke, gsi, compiled );
        } );
    } else if ( pkVal.tag === "yep" ) {
        return compileCallOnLiteral( yoke, gsi,
            "pkYep", pkVal.ind( 0 ),
            function ( yoke, gsi, compiled ) {
            
            return then( yoke, gsi, compiled );
        } );
    } else if ( pkVal.tag === "linear-as-nonlinear" ) {
        return waitErr( yoke,
            "Tried to compile a literal linear-as-nonlinear" );
    } else if ( pkVal.tag === "token" ) {
        return waitErr( yoke, "Tried to compile a literal token" );
    } else if ( pkVal.tag === "fn" ) {
        return waitErr( yoke, "Tried to compile a literal fn" );
    } else {
        // NOTE: At this point, we know pkIsStruct( pkVal ) is true.
        return pkListToJsList( yoke, pkGetArgs( pkVal ),
            function ( yoke, literalArgs ) {
        return compileMapToList( yoke, gsi, literalArgs,
            function ( yoke, gsi, literalArg, then ) {
            
            return compileLiteral( yoke, gsi, literalArg,
                function ( yoke, gsi, compiledArg ) {
                
                return then( yoke, gsi, compiledArg );
            } );
        }, function ( yoke, gsi, compiledArgs ) {
            if ( !compiledArgs.ok )
                return then( yoke, null, compiledArgs );
        
        return getGsAndFinishWithExpr( yoke, gsi,
            "new Pk().init_( null, " +
                strToSource( pkVal.tag ) + ", " +
                compiledArgs.val.resultVar + ", " +
                compiledArgs.val.resultVar + ".isLinear(), {} )",
            compiledArgs.val.revStatements,
            function ( yoke, gsi, compiledResult ) {
        
        return then( yoke, gsi, compiledResult );
        
        } );
        
        } );
        } );
    }
}

function compileEssence(
    yoke, gensymIndex, paramVars, essence, then ) {
    
    var gsi = gensymIndex;
    
    if ( essence.tag === "literal-essence" ) {
        return compileLiteral( yoke, gsi, essence.ind( 0 ),
            function ( yoke, gsi, compiled ) {
            
            return then( yoke, gsi, compiled );
        } );
    } else if ( essence.tag === "main-essence" ) {
        return compileLiteral( yoke, gsi, essence.ind( 0 ),
            function ( yoke, gsi, compiledName ) {
            
            if ( !compiledName.ok )
                return then( yoke, null, compiledName );
        
        return getGs( yoke, gsi, function ( yoke, gsi, callbackVar ) {
        return getGs( yoke, gsi, function ( yoke, gsi, resultVar ) {
        return jsListFlattenOnce( yoke, jsList(
            jsList( {
                type: "async",
                callbackVar: callbackVar,
                resultVar: resultVar,
                code: "pkGetVal( yoke, " +
                    compiledName.val.resultVar + ", " +
                    callbackVar + " )"
            } ),
            compiledName.val.revStatements
        ), function ( yoke, revStatements ) {
        
        return then( yoke, gsi, { ok: true, val: {
            revStatements: revStatements,
            resultVar: resultVar
        } } );
        
        } );
        } );
        } );
        
        } );
    } else if ( essence.tag === "call-essence" ) {
        return compileEssence( yoke, gsi, paramVars, essence.ind( 0 ),
            function ( yoke, gsi, compiledOp ) {
            
            if ( !compiledOp.ok )
                return then( yoke, null, compiledOp );
        
        return pkListToJsList( yoke, essence.ind( 1 ),
            function ( yoke, argEssences ) {
        return compileMapToList( yoke, gsi, argEssences,
            function ( yoke, gsi, argEssence, then ) {
            
            return compileEssence( yoke, gsi, paramVars, argEssence,
                function ( yoke, gsi, compiledArg ) {
                
                return then( yoke, gsi, compiledArg );
            } );
        }, function ( yoke, gsi, compiledArgs ) {
            if ( !compiledArgs.ok )
                return then( yoke, null, compiledArgs );
        
        return getGs( yoke, gsi, function ( yoke, gsi, callbackVar ) {
        return getGs( yoke, gsi, function ( yoke, gsi, resultVar ) {
        var fn = compiledOp.val.resultVar;
        var fnArgs = compiledArgs.val.resultVar;
        return jsListFlattenOnce( yoke, jsList(
            jsList( {
                type: "async",
                callbackVar: callbackVar,
                resultVar: resultVar,
                code:
                    "runWaitTry( yoke, function ( yoke ) {\n" +
                    // NOTE: This optimization doesn't actually seem
                    // to help any, and it bloats the file size, so
                    // we're not using it.
//                    "    if ( " + fn + ".tag === \"fn\" )\n" +
//                    "        return " + fn + ".special.call( yoke, " +
//                                fn + ".special.captures, " + fnArgs +
//                            " );\n" +
                    "    return callMethod( yoke, \"call\", " +
                            "pkList( " + fn + ", " + fnArgs + " ) " +
                        ");\n" +
                    "}, " + callbackVar + " )"
            } ),
            compiledArgs.val.revStatements,
            compiledOp.val.revStatements
        ), function ( yoke, revStatements ) {
        
        return then( yoke, gsi, { ok: true, val: {
            revStatements: revStatements,
            resultVar: resultVar
        } } );
        
        } );
        } );
        } );
        
        } );
        } );
        
        } );
    } else if ( essence.tag === "param-essence" ) {
        var i = essence.ind( 0 );
        return jsListGetNat( yoke, paramVars, i,
            function ( yoke, maybeParamVar ) {
            
            if ( maybeParamVar === null )
                return then( yoke, null, { ok: false, val:
                    "Tried to compile a param-essence which had an " +
                    "index that was out of range" } );
            
            return then( yoke, gsi, { ok: true, val: {
                revStatements: null,
                resultVar: maybeParamVar.val
            } } );
        } );
    } else if ( essence.tag === "fn-essence" ) {
        var captures = essence.ind( 0 );
        var argsDupCount = essence.ind( 1 );
        var bodyEssence = essence.ind( 2 );
        
        return listLen( yoke, captures,
            function ( yoke, numCaptures ) {
        return pkListToJsList( yoke, captures,
            function ( yoke, captures ) {
        return compileMapToList( yoke, gsi, captures,
            function ( yoke, gsi, capture, then ) {
            
            return compileEssence( yoke, gsi, paramVars, capture,
                function ( yoke, gsi, compiledCapture ) {
                
                return then( yoke, gsi, compiledCapture );
            } );
        }, function ( yoke, gsi, compiledCaptures ) {
            if ( !compiledCaptures.ok )
                return then( yoke, null, compiledCaptures );
        
        return getGs( yoke, gsi, function ( yoke, gsi, capturesVar ) {
        return getGs( yoke, gsi, function ( yoke, gsi, argsVar ) {
        return getGs( yoke, gsi, function ( yoke, gsi, fnVar ) {
        return compileListToVars( yoke, gsi,
            { revStatements: null, resultVar: capturesVar },
            numCaptures,
            function ( yoke,
                gsi, capturesRevStatements, captureVars, valid ) {
            
            if ( !valid.ok )
                return then( yoke, null, valid );
        
        return compileDupsOfOne( yoke, gsi, argsVar, argsDupCount,
            function ( yoke,
                gsi, argsRevStatements, argsDupVars, valid ) {
            
            if ( !valid.ok )
                return then( yoke, null, valid );
        
        return jsListAppend( yoke, captureVars, argsDupVars,
            function ( yoke, innerParamVars ) {
        return compileEssence( yoke, gsi, innerParamVars, bodyEssence,
            function ( yoke, gsi, compiledBody ) {
            
            if ( !compiledBody.ok )
                return then( yoke, null, compiledBody );
        
        return jsListFlattenOnce( yoke, jsList(
            compiledBody.val.revStatements,
            argsRevStatements,
            capturesRevStatements
        ), function ( yoke, bodyRevStatements ) {
        
        return then( yoke, gsi, { ok: true, val: {
            revStatements: {
                first: {
                    type: "fn",
                    capturesCode: compiledCaptures.val.resultVar,
                    capturesVar: capturesVar,
                    argsVar: argsVar,
                    compiledBody: {
                        revStatements: bodyRevStatements,
                        resultVar: compiledBody.val.resultVar
                    },
                    resultVar: fnVar
                },
                rest: compiledCaptures.val.revStatements
            },
            resultVar: fnVar
        } } );
        
        } );
        
        } );
        } );
        
        } );
        
        } );
        } );
        } );
        } );
        
        } );
        } );
        } );
    } else if ( essence.tag === "essence-for-if" ) {
        var condEssence = essence.ind( 0 );
        var essencesAndCounts = essence.ind( 1 );
        var thenEssence = essence.ind( 2 );
        var elseEssence = essence.ind( 3 );
        
        return compileEssence( yoke, gsi, paramVars, condEssence,
            function ( yoke, gsi, compiledCond ) {
            
            if ( !compiledCond.ok )
                return then( yoke, null, compiledCond );
        
        return pkListToJsList( yoke, essencesAndCounts,
            function ( yoke, essencesAndCounts ) {
        return compileMapToVars( yoke, gsi, essencesAndCounts,
            function ( yoke, gsi, essenceAndCounts, then ) {
            
            var captureEssence = listGet( essenceAndCounts, 0 );
            
            return compileEssence( yoke, gsi,
                paramVars,
                captureEssence,
                function ( yoke, gsi, compiledCapture ) {
                
                return then( yoke, gsi, compiledCapture );
            } );
        }, function ( yoke,
            gsi, capturesRevStatements, captureVars, valid ) {
        
        function doBranch( yoke,
            gsi, essence, essencesAndCountsIndex, then ) {
            
            return jsListMap( yoke, essencesAndCounts,
                function ( yoke, essenceAndCounts, then ) {
                
                return runWaitOne( yoke, function ( yoke ) {
                    return then( yoke,
                        listGet( essenceAndCounts,
                            essencesAndCountsIndex ) );
                } );
            }, function ( yoke, counts ) {
            return compileDupsOfMany( yoke, gsi, captureVars, counts,
                function ( yoke,
                    gsi, revStatements, innerParamVars, valid ) {
                
                if ( !valid.ok )
                    return then( yoke, null, valid );
            
            return compileEssence( yoke, gsi, innerParamVars, essence,
                function ( yoke, gsi, compiled ) {
                
                if ( !compiled.ok )
                    return then( yoke, null, compiled );
            
            return jsListAppend( yoke,
                compiled.val.revStatements,
                revStatements,
                function ( yoke, revStatements ) {
            
            return then( yoke, gsi, { ok: true, val: {
                revStatements: revStatements,
                resultVar: compiled.val.resultVar
            } } );
            
            } );
            
            } );
            
            } );
            } );
        }
        
        return doBranch( yoke, gsi, thenEssence, 1,
            function ( yoke, gsi, compiledThen ) {
            
            if ( !compiledThen.ok )
                return then( yoke, null, compiledThen );
        
        return doBranch( yoke, gsi, elseEssence, 2,
            function ( yoke, gsi, compiledElse ) {
            
            if ( !compiledElse.ok )
                return then( yoke, null, compiledElse );
        
        return getGs( yoke, gsi, function ( yoke, gsi, resultVar ) {
        return jsListFlattenOnce( yoke, jsList(
            jsList( {
                type: "if",
                condCode:
                    "" + compiledCond.val.resultVar + ".tag !== " +
                        "\"nil\"",
                compiledThen: compiledThen.val,
                compiledElse: compiledElse.val,
                resultVar: resultVar
            } ),
            capturesRevStatements,
            compiledCond.val.revStatements
        ), function ( yoke, revStatements ) {
        
        return then( yoke, gsi, { ok: true, val: {
            revStatements: revStatements,
            resultVar: resultVar
        } } );
        
        } );
        } );
        
        } );
        
        } );
        
        } );
        } );
        
        } );
    } else if ( essence.tag === "let-list-essence" ) {
        var sourceEssence = essence.ind( 0 );
        var captureEssences = essence.ind( 1 );
        var numbersOfDups = essence.ind( 2 );
        var bodyEssence = essence.ind( 3 );
        return compileEssence( yoke, gsi, paramVars, sourceEssence,
            function ( yoke, gsi, compiledSource ) {
            
            if ( !compiledSource.ok )
                return then( yoke, null, compiledSource );
        
        return pkListToJsList( yoke, captureEssences,
            function ( yoke, captureEssences ) {
        return compileMapToVars( yoke, gsi, captureEssences,
            function ( yoke, gsi, argEssence, then ) {
            
            return compileEssence( yoke, gsi, paramVars, argEssence,
                function ( yoke, gsi, compiledArg ) {
                
                return then( yoke, gsi, compiledArg );
            } );
        }, function ( yoke,
            gsi, capturesRevStatements, captureVars, valid ) {
            
            if ( !valid.ok )
                return then( yoke, null, valid );
        
        return listLen( yoke, numbersOfDups,
            function ( yoke, numberOfElems ) {
        return compileLiteral( yoke, gsi, numberOfElems,
            function ( yoke, gsi, compiledNumberOfElems ) {
            
            if ( !compiledNumberOfElems.ok )
                return then( yoke, null, compiledNumberOfElems );
        
        return getGs( yoke, gsi, function ( yoke, gsi, callbackVar ) {
        return getGs( yoke, gsi, function ( yoke, gsi, ignoredVar ) {
        return compileListToVars( yoke, gsi,
            {
                revStatements: {
                    first: {
                        type: "async",
                        callbackVar: callbackVar,
                        resultVar: ignoredVar,
                        code:
"pkAssertLetList( yoke, " + compiledSource.val.resultVar + ", " +
    compiledNumberOfElems.val.resultVar + ", " + callbackVar + " )"
                    },
                    rest: compiledNumberOfElems.val.revStatements
                },
                resultVar: compiledSource.val.resultVar
            },
            numberOfElems,
            function ( yoke,
                gsi, elemsRevStatements, elemVars, valid ) {
            
            if ( !valid.ok )
                return then( yoke, null, valid );
        
        return pkListToJsList( yoke, numbersOfDups,
            function ( yoke, numbersOfDups ) {
        return compileDupsOfMany( yoke, gsi, elemVars, numbersOfDups,
            function ( yoke,
                gsi, dupsRevStatements, dupVars, valid ) {
            
            if ( !valid.ok )
                return then( yoke, null, valid );
        
        return jsListAppend( yoke, captureVars, dupVars,
            function ( yoke, innerParamVars ) {
        return compileEssence( yoke, gsi, innerParamVars, bodyEssence,
            function ( yoke, gsi, compiledBody ) {
            
            if ( !compiledBody.ok )
                return then( yoke, null, compiledBody );
        
        return jsListFlattenOnce( yoke, jsList(
            compiledBody.val.revStatements,
            dupsRevStatements,
            elemsRevStatements,
            capturesRevStatements,
            compiledSource.val.revStatements
        ), function ( yoke, revStatements ) {
        
        return then( yoke, gsi, { ok: true, val: {
            revStatements: revStatements,
            resultVar: compiledBody.val.resultVar
        } } );
        
        } );
        
        } );
        } );
        
        } );
        } );
        
        } );
        } );
        } );
        
        } );
        } );
        
        } );
        } );
        
        } );
    } else {
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, null, { ok: false, val:
                "Tried to compile a value that wasn't of a " +
                "recognized essence type" } );
        } );
    }
}

function compiledLinkedListToString( yoke, compiled, then ) {
    
    // TODO: Put this constant somewhere more configurable.
    var maxSyncPerBlock = 1000;
    
    return jsListFoldl( yoke,
        { syncInBlock: 0, code:
            "return then( yoke, " + compiled.resultVar + " );" },
        compiled.revStatements,
        function ( yoke, state, statement, then ) {
        
        function finishSync( yoke, statementCode ) {
            return runWaitOne( yoke, function ( yoke ) {
                if ( state.syncInBlock < maxSyncPerBlock )
                    return then( yoke, {
                        syncInBlock: state.syncInBlock + 1,
                        code:
                            statementCode + "\n" +
                            state.code
                    } );
                else
                    return then( yoke, { syncInBlock: 0, code:
                        statementCode + "\n" +
                        "return runWaitOne( yoke, " +
                            "function ( yoke ) {\n" +
                        "\n" +
                        state.code + "\n" +
                        "\n" +
                        "} );"
                    } );
            } );
        }
        
        if ( statement.type === "sync" ) {
            return finishSync( yoke,
                "var " + statement.resultVar + " = " +
                    statement.code + ";" );
        } else if ( statement.type === "async" ) {
            return runWaitOne( yoke, function ( yoke ) {
                return then( yoke, { syncInBlock: 0, code:
                    "return " + statement.code + ";\n" +
                    "function " + statement.callbackVar + "( yoke, " +
                        statement.resultVar + " ) {\n" +
                    "\n" +
                    state.code + "\n" +
                    "\n" +
                    "}"
                } );
            } );
        } else if ( statement.type === "if" ) {
            return compiledLinkedListToString( yoke,
                statement.compiledThen,
                function ( yoke, thenCode ) {
            return compiledLinkedListToString( yoke,
                statement.compiledElse,
                function ( yoke, elseCode ) {
            
            return then( yoke, { syncInBlock: 0, code:
                "if ( " + statement.condCode + " )\n" +
                "    return runWaitOne( yoke, function ( yoke ) {\n" +
                "\n" +
                "var then = next;\n" +
                "\n" +
                thenCode + "\n" +
                "\n" +
                "    } );\n" +
                "else\n" +
                "    return runWaitOne( yoke, function ( yoke ) {\n" +
                "\n" +
                "var then = next;\n" +
                "\n" +
                elseCode + "\n" +
                "\n" +
                "    } );\n" +
                "\n" +
                "function next( yoke, " +
                    statement.resultVar + " ) {\n" +
                "\n" +
                state.code + "\n" +
                "\n" +
                "}"
            } );
            
            } );
            } );
        } else if ( statement.type === "fn" ) {
            return compiledLinkedListToString( yoke,
                statement.compiledBody,
                function ( yoke, bodyCode ) {
            
            return finishSync( yoke,
                "var " + statement.resultVar + " = pkfnLinear( " +
                    "(" + statement.capturesCode + "),\n" +
                "    function ( yoke, " +
                    statement.capturesVar + ", " +
                    statement.argsVar + " ) {\n" +
                "\n" +
                "var then = pkRet;\n" +
                "\n" +
                bodyCode + "\n" +
                "\n" +
                "} );" );
            
            } );
        } else {
            throw new Error();
        }
    }, function ( yoke, state ) {
        return then( yoke, state.code );
    } );
}



// Turns out the reader is very slow right now because it makes
// frequent use of setTimeout() for control flow. This redefinition of
// `defer` is hackish, but it definitely fixes the speed issue.
// TODO: Fix this in a better way.
var deferTrampolineEvents = [];
defer = function ( func ) {
    deferTrampolineEvents.push( func );
};
function runDeferTrampoline() {
    while ( deferTrampolineEvents.length !== 0 )
        deferTrampolineEvents.pop()();
};

function pkReadAll( yoke, string, then ) {
    function read( stream, onEnd, onFailure, onSuccess ) {
        // TODO: Integrate yoke-passing into the reader so we don't
        // have to run for a non-constant amount of time like this.
        var readResult;
        reader( {
            stream: stream,
            readerMacros: readerMacros,
            heedsCommandEnds: true,
            infixLevel: 0,
            infixState: { type: "empty" },
            end: function ( $ ) {
                if ( $.infixState.type === "ready" )
                    $.then( { ok: true, val: $.infixState.val } );
                else
                    readResult = onEnd();
                runDeferTrampoline();
            },
            unrecognized: function ( $ ) {
                $.then( { ok: false,
                    msg: "Encountered an unrecognized character" } );
                runDeferTrampoline();
            },
            then: function ( result ) {
                if ( result.ok )
                    readResult = onSuccess( result.val );
                else
                    readResult = onFailure( result.msg );
            }
        } );
        runDeferTrampoline();
        return readResult;
    }
    var stream = stringStream( string );
    return readNext( [] );
    function readNext( resultsSoFar ) {
        return read( stream, function () {  // onEnd
            return then( yoke, resultsSoFar );
        }, function ( message ) {  // onFailure
            return then( yoke,
                resultsSoFar.concat(
                    [ { ok: false, msg: message } ] ) );
        }, function ( result ) {  // onSuccess
            return readNext( resultsSoFar.concat(
                [ { ok: true, val: result } ] ) );
        } );
    }
}

function processCommands( yoke, commands, processCommand, then ) {
    return go( yoke, commands, null );
    function go( yoke, commands, revDisplays ) {
        function addDisplay( revDisplays, display ) {
            return { first: display, rest: revDisplays };
        }
        function finish( yoke, revDisplays ) {
            return jsListRev( yoke, revDisplays,
                function ( yoke, displays ) {
                
                return then( yoke, displays );
            } );
        }
        function reportError( yoke,
            revDisplays, expr, errorIntro, ifOk ) {
            
            if ( expr.tag === "nope" ) {
                return finish( yoke, addDisplay( revDisplays, {
                    type: "error",
                    intro: "" + errorIntro + " error",
                    msg: expr.ind( 0 )
                } ) );
            } else if ( expr.tag !== "yep" ) {
                return finish( yoke, addDisplay( revDisplays, {
                    type: "error",
                    intro:
                        "" + errorIntro + " error " +
                        "(poorly wrapped)",
                    msg: expr
                } ) );
            } else {
                // This is a triumph.
                return runWaitOne( yoke, function ( yoke ) {
                    return ifOk( yoke );
                } );
            }
        }
        
        if ( commands === null )
            return finish( yoke, revDisplays );
        
        return processCommand( yoke, commands.first,
            function ( yoke, expr, errorIntro, ifOk ) {
            
            return reportError( yoke, revDisplays, expr, errorIntro,
                function ( yoke ) {
                
                return ifOk( yoke );
            } );
        }, function ( yoke, commandResult, jsFuncCode ) {
        return reportError( yoke, revDisplays, commandResult,
            "Command execution",
            function ( yoke ) {
        
        var revDisplays2 = addDisplay( revDisplays, {
            type: "success",
            jsFuncCode: jsFuncCode,
            val: commandResult.ind( 0 )
        } );
        
        return runWait( yoke, function ( yoke ) {
            return pkDrop( yoke, commandResult, function ( yoke ) {
                return pkRet( yoke, pkNil );
            } );
        }, function ( yoke, commandResultDrop ) {
        return reportError( yoke, revDisplays2, commandResultDrop,
            "Command result drop",
            function ( yoke ) {
        return runWait( yoke, function ( yoke ) {
            return yoke.pkRuntime.runDefinitions( yoke );
        }, function ( yoke, defined ) {
        return reportError( yoke, revDisplays2, defined,
            "Definition",
            function ( yoke ) {
        return runWait( yoke, function ( yoke ) {
            return pkDrop( yoke, defined, function ( yoke ) {
                return pkRet( yoke, pkNil );
            } );
        }, function ( yoke, definedDrop ) {
        return reportError( yoke, revDisplays2, definedDrop,
            "Definition result drop",
            function ( yoke ) {
        
        return go( yoke, commands.rest, revDisplays2 );
        
        } );
        } );
        } );
        } );
        } );
        } );
        
        } );
        } );
    }
}

function compileAndDefineFromString( yoke, pkCodeString, then ) {
    return pkReadAll( yoke, pkCodeString,
        function ( yoke, tryExprs ) {
        
        return processCommands( yoke, jsListFromArr( tryExprs ),
            function ( yoke, tryExpr, reportError, then ) {
            
            return reportError( yoke,
                tryExpr.ok ? pkYep( pkNil ) :
                    pk( "nope", pkRawErr( tryExpr.msg ) ),
                "Parse",
                function ( yoke ) {
            return runWait( yoke, function ( yoke ) {
                return macroexpandArrays( yoke, tryExpr.val );
            }, function ( yoke, macroexpanded ) {
            return reportError( yoke, macroexpanded, "Macroexpansion",
                function ( yoke ) {
            return runWait( yoke, function ( yoke ) {
                return pkDrop( yoke, macroexpanded,
                    function ( yoke ) {
                    
                    return pkRet( yoke, pkNil );
                } );
            }, function ( yoke, macroexpandedDrop ) {
            return reportError( yoke, macroexpandedDrop,
                "Macroexpansion result drop",
                function ( yoke ) {
            return compileTopLevel( yoke, macroexpanded.ind( 0 ),
                function ( yoke, jsFuncCode ) {
            return reportError( yoke,
                jsFuncCode.ok ? pkYep( pkNil ) :
                    pk( "nope", pkRawErr( jsFuncCode.val ) ),
                "Compilation",
                function ( yoke ) {
            return invokeTopLevel( yoke,
                Function( "cch",
                    "\"use strict\";\n" +
                    "\n" +
                    compiledCodeHelperInit + "\n" +
                    "\n" +
                    "return " + jsFuncCode.val + ";"
                )( compiledCodeHelper ),
                function ( yoke, commandResult ) {
            
            return then( yoke, commandResult, jsFuncCode.val );
            
            } );
            } );
            } );
            } );
            } );
            } );
            } );
            } );
        }, function ( yoke, displaysList ) {
            var displaysArr = [];
            for ( var d = displaysList; d !== null; d = d.rest )
                displaysArr.push( d.first );
            return then( yoke, displaysArr );
        } );
    } );
}

function compileTopLevel( yoke, essence, then ) {
    
    // INTERPRET NOTE: It doesn't seem to make the load time faster
    // or the file footprint slimmer, but the commented-out code
    // code marked "INTERPRET NOTE" runs essence compilation at load
    // time rather than compile time.
//    return compileLiteral( yoke, startGensymIndex(), essence,
    
    return compileEssence( yoke, startGensymIndex(), null, essence,
        function ( yoke, gsi, compiled ) {
        
        if ( !compiled.ok )
            return then( yoke, null, compiled );
    
    return compiledLinkedListToString( yoke, compiled.val,
        function ( yoke, code ) {
    
    return then( yoke, { ok: true, val:
        "function ( yoke, then ) {\n" +
        "\n" +
        // TODO: This first commented-out line may help when debugging
        // compiled code, but it uses the hackish Pk#toString(). See
        // if we should make it a debug option or something.
//        "// " + essence + "\n" +
//        "// @sourceURL=" + Math.random() + "\n" +
//        "debugger;\n" +
//        "\n" +
        code + "\n" +
        "\n" +
        "}"
    } );
    
    } );
    
    } );
}

function makeCompiledTopLevelFromStrings( jsFuncCodeStrings ) {
    return "function ( cch ) {\n" +
    "\n" +
    "\"use strict\";\n" +
    "\n" +
    compiledCodeHelperInit + "\n" +
    "\n" +
    "return [\n" +
    "\n" +
    "\n" +
    jsFuncCodeStrings.join( ",\n\n\n" ) + "\n" +
    "\n" +
    "\n" +
    "];\n" +
    "\n" +
    "}";
}

function invokeTopLevel( yoke, jsFunc, then ) {
    return runWait( yoke, function ( yoke ) {
        return withTopLevelEffects( yoke, function ( yoke ) {
            return jsFunc( yoke, function ( yoke, result ) {
                    
                    // INTERPRET NOTE: It doesn't seem to make the
                    // load time faster or the file footprint slimmer,
                    // but the commented-out code marked "INTERPRET
                    // NOTE" runs essence expansion at load time
                    // rather than compile time.
//                    return interpretEssence( yoke, result );
                    
                    return pkRet( yoke, result );
                }
            );
        } );
    }, function ( yoke, result ) {
        return then( yoke, result );
    } );
}

function invokeFileTopLevel( yoke, getJsFuncs, then ) {
    return processCommands( yoke,
        jsListFromArr( getJsFuncs( compiledCodeHelper ) ),
        function ( yoke, jsFunc, reportError, then ) {
        
        return invokeTopLevel( yoke, jsFunc,
            function ( yoke, commandResult ) {
            
            return then( yoke, commandResult,
                // TODO: Make each compiled file a quine, containing
                // most of its code in the form of string literals.
                // Once we do that, way we may actually have code to
                // put here.
                "((function () { throw new Error(); })())" );
        } );
    }, function ( yoke, displaysList ) {
        var displaysArr = [];
        for ( var d = displaysList; d !== null; d = d.rest )
            displaysArr.push( d.first );
        return then( yoke, displaysArr );
    } );
}

// NOTE: The generated code snippets depend on the following free
// variables:
//
// yoke
// then (only used in compiledLinkedListToString)
// next (only used in compiledLinkedListToString)
//
// They also depend on these free variables, but compiledCodeHelper
// and compiledCodeHelperInit manage these as fields of a single `cch`
// variable:
//
// new Pk().init_
// pkNil
// pkCons
// pkList
// pkInd
// pkStrNameRaw
// pkQualifiedName
// pkYep
// pkPairName
// pkStrUnsafe
// runWaitTry
// pkAssertLetList
// pkRet
// pkDup
// pkGetVal
// callMethod
// pkfnLinear (only used in compiledLinkedListToString)
// runWaitOne (only used in compiledLinkedListToString)
// cachedNats (only used in an optimization)

var compiledCodeHelper = {
    Pk: Pk,
    pkNil: pkNil,
    pkCons: pkCons,
    pkList: pkList,
    pkInd: pkInd,
    pkStrNameRaw: pkStrNameRaw,
    pkQualifiedName: pkQualifiedName,
    pkYep: pkYep,
    pkPairName: pkPairName,
    pkStrUnsafe: pkStrUnsafe,
    runWaitTry: runWaitTry,
    pkAssertLetList: pkAssertLetList,
    pkRet: pkRet,
    pkDup: pkDup,
    pkGetVal: pkGetVal,
    callMethod: callMethod,
    pkfnLinear: pkfnLinear,
    runWaitOne: runWaitOne,
    
    cachedNats: cachedNats
};
var compiledCodeHelperInit;
(function () {
    // TODO: Put these in a deterministic order.
    var arr = [];
    strMap().setObj( compiledCodeHelper ).each( function ( k, v ) {
        arr.push( "var " + k + " = cch." + k + ";" );
    } );
    compiledCodeHelperInit = arr.join( "\n" );
})();
