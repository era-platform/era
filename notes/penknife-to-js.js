// penknife-to-js.js
// Copyright 2014 Ross Angle. Released under the MIT License.
"use strict";

// TODO: When this file is feature-complete, move its contents into
// era-penknife.js and try it out.


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

function natCompare( yoke, a, b, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( a.tag === "nil" && b.tag === "nil" )
            return then( yoke, 0 );
        if ( a.tag === "nil" )
            return then( yoke, -1 );
        if ( b.tag === "nil" )
            return then( yoke, 1 );
        return natCompare( yoke, a.ind( 0 ), b.ind( 0 ), then );
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
function jsListFoldlAsync( yoke, init, list, func, then ) {
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
    return go( yoke, list, pkNil );
    function go( yoke, list, revResult ) {
        if ( list === null )
            return listRev( yoke, revResult,
                function ( yoke, result ) {
                
                return then( yoke, result );
            } );
        return listRevAppend( yoke, list.first, revResult,
            function ( yoke, revResult ) {
            
            return runWaitOne( yoke, function ( yoke ) {
                return go( yoke, list.rest, revResult );
            } );
        } );
    }
}
function jsListMap( yoke, list, func, then ) {
    return jsListFoldlAsync( yoke, null, list,
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

// TODO: Right now this abuses Pk#toString(), which doesn't support
// bigints. Even if that method did support bigints, this operation's
// steps between yoke waits would take unbounded time. Fix this.
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
function natToParam( yoke, nat, then ) {
    return natToJsStringAsync( yoke, nat, function ( yoke, numStr ) {
        return then( yoke, "param" + numStr );
    } );
}

function getGs( yoke, gsi, then ) {
    return natToGs( yoke, gsi, function ( yoke, varName ) {
        return then( yoke, pk( "succ", gsi ), varName );
    } );
}

// NOTE: So far, the generated code snippets depend on the following
// free variables:
//
// pkNil
// pkCons
// pkRuntime.getVal
// pkRuntime.callMethod
// pkStrNameRaw
// pkQualifiedName
// pkYep
// pkPairName
// pkStrUnsafe

function getGsAndFinishWithExpr( yoke,
    gensymIndex, expr, revStatements, then ) {
    
    var gsi = gensymIndex;
    return getGs( yoke, gsi, function ( yoke, gsi, resultVar ) {
        return then( yoke, gsi, { ok: true, val: {
            revStatements: {
                first: { type: "sync",
                    code: "var " + resultVar + " = " + expr + ";" },
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
            return then( yoke, gsi, compiledArg );
    
    return getGsAndFinishWithExpr( yoke, gsi,
        "" + funcCode + "( " + compiledArg.resultVar + " )",
        compiledArg.revStatements,
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
            return then( yoke, gsi, compiledArg1 );
    
    return compileLiteral( yoke, gsi, literalArg2,
        function ( yoke, gsi, compiledArg2 ) {
        
        if ( !compiledArg1.ok )
            return then( yoke, gsi, compiledArg2 );
    
    return jsListAppend( yoke,
        compiledArg2.revStatements,
        compiledArg1.revStatements,
        function ( yoke, revStatements ) {
    
    return getGsAndFinishWithExpr( yoke, gsi,
        "" + funcCode + "( " +
            compiledArg1.resultVar + ", " +
            compiledArg2.resultVar " );"
        compiledArg.revStatements,
        function ( yoke, gsi, compiledResult ) {
        
        return then( yoke, gsi, compiledResult );
    } );
    
    } );
    
    } );
}

function compileLiteral( yoke, gensymIndex, pkVal, then ) {
    var gsi = gensymIndex;
    
    function waitErr( yoke, gsi, message ) {
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, gsi, { ok: false, val: message } );
        } );
    }
    
    if ( pkVal.isLinear() ) {
        // NOTE: This case would technically be unnecessary if we
        // checked for nonlinear-as-linear instead, but we might as
        // well get it out of the way early on, since we can.
        return waitErr( yoke, gsi,
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
                strToSource( pkVal.special.jsStr ) + ")",
            null,
            function ( yoke, gsi, compiledResult ) {
            
            return then( yoke, gsi, compiledResult );
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
        return waitErr( yoke, gsi,
            "Tried to compile a literal linear-as-nonlinear" );
    } else if ( pkVal.tag === "token" ) {
        return waitErr( yoke, gsi,
            "Tried to compile a literal token" );
    } else if ( pkVal.tag === "fn" ) {
        return waitErr( yoke, gsi, "Tried to compile a literal fn" );
    } else {
        // NOTE: At this point, we know pkIsStruct( pkVal ) is true.
        // TODO: Implement this.
    }
}

function compileEssence(
    yoke, gensymIndex, numParams, essence, then ) {
    
    var gsi = gensymIndex;
    
    if ( essence.tag === "literal-essence" ) {
        return compileLiteral( yoke, gsi, essence.ind( 0 ),
            function ( yoke, gsi, compiled ) {
            
            return then( yoke, gsi, compiled );
        } );
    } else if ( essence.tag === "main-essence" ) {
        return compileCallOnLiteral( yoke, gsi,
            "pkRuntime.getVal", essence.ind( 0 ),
            function ( yoke, gsi, compiled ) {
            
            return then( yoke, gsi, compiled );
        } );
    } else if ( essence.tag === "call-essence" ) {
        return compileEssence( yoke, gsi, numParams, essence.ind( 0 ),
            function ( yoke, gsi, compiledOp ) {
            
            if ( !compiledOp.ok )
                return then( yoke, gsi, compiledOp );
        
        return pkListToJsList( yoke, essence.ind( 1 ),
            function ( yoke, argEssences ) {
        return getGs( yoke, gsi, function ( yoke, gsi, listEndVar ) {
        return pkListFoldlAsync( yoke,
            { ok: true, val: { gsi: gsi, lastListPartVar: listEndVar,
                revCompiledArgs: null } },
            argEssences,
            function ( yoke, state, argEssence, then ) {
            
            if ( !state.ok )
                return runWaitOne( yoke, function ( yoke ) {
                    return then( yoke, state );
                } );
            
            return compileEssence( yoke,
                state.val.gsi, numParams, argEssence,
                function ( yoke, gsi, compiledArg ) {
                
                if ( !compiledArg.ok )
                    return runWaitOne( yoke, function ( yoke ) {
                        return then( yoke, compiledArg );
                    } );
                
                return getGs( yoke, gsi,
                    function ( yoke, gsi, listPartVar ) {
                    
                    return then( yoke, { ok: true, val: {
                        gsi: gsi,
                        lastListPartVar: listPartVar,
                        revCompiledArgs: {
                            first: {
                                compiledArg: compiledArg.val,
                                prevListPartVar:
                                    state.val.lastListPartVar,
                                thisListPartVar: listPartVar
                            },
                            rest: state.val.revCompiledArgs
                        }
                    } } );
                } );
            } );
        }, function ( yoke, state ) {
            
            if ( !state.ok )
                return then( yoke, gsi, state );
        
        return pkListMappend( yoke, state.revCompiledArgs,
            function ( yoke, compiledArg, then ) {
            
            return runWaitOne( yoke, function ( yoke ) {
                return then( yoke, { first: { type: "sync", code:
                    "var " + compiledArg.thisListPartVar + " = " +
                        "pkCons( " +
                            compiledArg.compiledArg.resultVar + ", " +
                            compiledArg.prevListPartVar + " );"
                }, rest: compiledArg.compiledArg.revStatements } );
            } );
        }, function ( yoke, revStatements ) {
        return pkListAppend( yoke,
            revStatements,
            {
                first: { type: "sync", code:
                    "var " + listEndVar + " = pkNil;"
                },
                rest: compiledOp.val.revStatements
            },
            function ( yoke, revStatements ) {
        return getGs( yoke, state.gsi,
            function ( yoke, gsi, resultVar ) {
        
        return then( yoke, gsi, { ok: true, val: {
            revStatements: {
                first: { type: "async", resultVar: resultVar, code:
                    "pkRuntime.callMethod( yoke, \"call\", " +
                        "pkList( " + compiledOp.val.resultVar + ", " +
                            state.val.lastListPartVar + " ) )"
                },
                rest: revStatements
            },
            resultVar: resultVar
        } } );
        
        } );
        } );
        } );
        
        } );
        } );
        } );
        
        } );
    } else if ( essence.tag === "param-essence" ) {
        var i = essence.ind( 0 );
        return natCompare( yoke, i, numParams,
            function ( yoke, compared ) {
            
            if ( !(compared < 0) )
                return then( yoke, gsi, { ok: false, val:
                    "Tried to compile a param-essence which had an " +
                    "index that was out of range" } );
        
            return natToParam( yoke, i, function ( yoke, resultVar ) {
                return then( yoke, gsi, { ok: true, val: {
                    revStatements: null,
                    resultVar: resultVar
                } } );
            } );
        } );
    } else if ( essence.tag === "fn-essence" ) {
        // TODO: Implement this.
    } else if ( essence.tag === "essence-for-if" ) {
        // TODO: Implement this.
    } else if ( essence.tag === "let-list-essence" ) {
        // TODO: Implement this.
    } else {
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, gsi, { ok: false, val:
                "Tried to compile a value that wasn't of a " +
                "recognized essence type" } );
        } );
    }
}
