// era-modules.js
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";


// For now, we implement the deductive fragment, almost all the action
// fragment, the local collaboration fragment, and the local
// collaborative value-level definition fragment. A more complete
// version of the grammar is available at
// <https://gist.github.com/4559120>. Also, it's worth noting that
// we're using s-expressions for the grammar.
//
// Here's a map of the dependencies among the seven language fragments
// in that Gist, with "[ ]" showing which ones we haven't implemented:
//
// Local collaboration
//   Deductive
//   Action
// Local collaborative value-level definition
//   Local collaboration
//     ...
// [ ] Local collaborative phantom type
//   Local collaboration
//     ...
// [ ] Local collaborative extensible sum
//   Local collaboration
//     ...
//   [ ] Observational subtyping
//     Deductive
//
// At this point, we're not aiming to implement the other three
// fragments in the Gist yet. For now, we're going to implement
// another fragment or two for imperative state models and
// possibly-nonterminating lambdas with imperative effects. We'll use
// these features with a surface syntax layer to make a relatively
// unambitious Scheme-like programming language.


// NOTE: For this version, we're taking the original grammar design
// and filling it out with lots of extra annotations to make the
// checker easy to write. For one thing, every function call
// expression must come with a full description of the function type
// it's calling. For another, when the original inference rules would
// have allowed certain expressions on the grounds that an observed
// action ambiently enabled them, for now we instead force those
// dependencies to the top level. For instance, we use
// (withsecret ...) and (witheach ...).

// NOTE: The deductive fragment actually has no way to construct a
// type that depends on a term! It doesn't even provide a type
// signature for built-in utilities to fill this void, since no
// function can return a type. This makes the term variable in each
// type constructor a bit silly. However, the observational subtyping
// fragment does define one operator, ((a : aType) <= (b : bType)),
// that makes a dependent type, so fragments like that can justify
// this infrastructure.
//
// TODO: See if we should include the capitalized
// (If <term> Then <type> Else <type>) operator from
// "Observational Equality, Now!" This would be a second (or first)
// constructor of dependent types, but for the moment we don't have a
// particular use for it. We might approach type-level computation in
// a different way.

// Deductive fragment grammar notes:
//
// Fact ::=| UserVar "@" UserKnowledge
// UserKnowledge ::=| "##type" Term
// UserKnowledge ::=| Term ":" Term
// Term ::=| TermVar
// Term ::=| "(" Term ")"
// Term ::=| "(" TermVar ":" Term ")" "->" Term
// Term ::=| "\" TermVar ":" Term "->" Term
// Term ::=| Term Term
// Term ::=| "(" "##type" TermVar ")" "->" Term
// Term ::=| "\" "##type" TermVar "->" Term
// Term ::=| Term "#\t" Term
// Term ::=| "(=#Sigma" TermVar ":" Term ")" "*" Term
// Term ::=| "\#sigma" "(" Term ":" Term ")" "*" Term
// Term ::=| "#fst" Term
// Term ::=| "#snd" Term
//
// UserKnowledge ::=| "(" "istype" Term ")"
// UserKnowledge ::=| "(" "describes" Term Term ")"
// Term ::=| TermVar
// Term ::=| "(" "tfa" TermVar Term Term ")"
// Term ::=| "(" "tfn" TermVar Term Term ")"
// Term ::=| "(" "tcall" TermVar Term Term Term Term ")"
// Term ::=| "(" "ttfa" TermVar Term ")"
// Term ::=| "(" "ttfn" TermVar Term ")"
// Term ::=| "(" "ttcall" TermVar Term Term Term ")"
// Term ::=| "(" "sfa" TermVar Term Term ")"
// Term ::=| "(" "sfn" TermVar Term Term Term ")"
// Term ::=| "(" "fst" TermVar Term Term Term ")"
// Term ::=| "(" "snd" TermVar Term Term Term ")"
//
// istype: is type
// describes: describes
// tfa: total for-all
// tfn: total function
// tcall: total call
// ttfa: total type for-all
// ttfn: total type function (a function that takes types to values)
// ttcall: total type call
// sfa: sigma for-all
// sfn: sigma function (i.e. a dependent pair)
// fst: first (of an sfn)
// snd: second (of an sfn)

// Action fragment grammar notes:
//
// MODULE ::= UserAction*
// Fact ::=| UserVar "@!" UserAction
// UserKnowledge ::=| UserAction
//
// // TODO: Figure out how to account for the signatures and timestamp
// // information in the pre-build module grammar.
// //
// // TODO: Figure out if there needs to be a separate grammar for
// // post-build shared modules.
// //
// MODULE ::= "(" "era" "1" UserAction ")"
// UserKnowledge ::=| "(" "can" UserAction ")"

// Local collaboration fragment grammar notes:
//
// UserKnowledge ::=| "##secret" Key
// UserKnowledge ::=| "##public" Key
// Key ::=| KeyVar
// Key ::=| "$" ## CryptographicKeyName
// Key ::=| "$$everyone"
// Key ::=| Key ## "/" ## SubName
//
// UserKnowledge ::=| "(" "secret" Key ")"
// UserKnowledge ::=| "(" "public" Key ")"
// UserAction ::=| "(" "withsecret" TermVar Key UserAction ")"
// // NOTE: There is no "KeyVar" production here because there is no
// // program syntax that binds a KeyVar. It was just used for
// // specifying inference rules in the Gist.
// // NOTE: There is no "CryptographicKey" production here because it
// // was just a suggestive way to specify what other key syntaxes
// // should exist in the future.
// // TODO: Make at least one cryptographic key syntax.
// Key ::=| "(" "everyone" ")"
// Key ::=| "(" "subkey" Key ExternallyVisibleWord ")"
// ExternallyVisibleWord ::=| "(" "sym" Symbol ")"

// Local collaborative value-level definition fragment grammar notes:
//
// UserAction ::=| "!!define" Key Key Term Term
// Term ::=| "#the" Key Key Term
//
// UserAction ::=| "(" "define" Term Key Term Term ")"
// // NOTE: The original Gist didn't tackle the problem of what to do
// // if an author publishes two definitions with the same key and the
// // same type. We don't prevent that scenario from happening, but we
// // do settle on a consistent interpretation. Instead of saying
// // "the definition," we say "each definition."
// UserAction ::=| "(" "witheach" TermVar Key Term Term UserAction ")"

// TODO: For everything marked with "NEW:", write a more
// implementation-agnostic description, as with the original Gist.

// NEW: The partiality monad fragment:
//
// Term ::=| "(" "partialtype" Term ")"
// // TODO: Make sure all syntaxes that begin with "z" are hidden from
// // language users.
// Term ::=| "(" "zunitpartial" Term Term ")"
// Term ::=| "(" "zbindpartial" Term Term Term Term ")"
// Term ::=| "(" "zfixpartial" Term Term ")"
//
// Built-in module exports:
//
// unitpartial : (ttfa a (tfa _ a (partialtype a)))
//
// bindpartial :
//   (ttfa a
//     (ttfa b
//       (tfa _ (partialtype a)
//         (tfa _ (tfa _ a (partialtype b)) (partialtype b)))))
//
// fixpartial :
//   (ttfa a
//     (tfa _ (tfa _ (partialtype a) (partialtype a))
//       (partialtype a)))

// NEW: The imperative partial computation fragment:
//
// // NOTE: This takes primary inspiration from [1]. The original
// // formulation of this idea is in [2], whose authors continued
// // their analysis in [3].
// //
// // [1] "A new paradigm for component-based development,"
// //     Johan G. Granstrom, 2012.
// // [2] "Interactive Programs in Dependent Type Theory,"
// //     Peter Hancock and Anton Setzer, 2000.
// // [3] "Interactive Programs and Weakly Final Coalgebras in
// //     Dependent Type Theory (Extended Version)," Anton Setzer and
// //     Peter Hancock, 2005.
//
// // NOTE: Occurrences of "impartial" here are short for "imperative
// // partial," and they distinguish this kind of imperative
// // computation from at least two other possibilities: One where the
// // computation must terminate after a finite number of commands,
// // and one where each stage of computation must terminate in full
// // termination or a command, but where infinite regresses of
// // commands are permitted.
// // TODO: See if there's a better term than "impartial."
//
// // NOTE: This representation of imperative computation has some
// // accidental complexity, a meaningful use case we don't
// // necessarily intend to support: It's possible for the execution
// // harness to manipulate continuations and thereby perform
// // branching, reentrant, and/or early termination effects as in
// // Haskell Monads. If we had linear types, we could restrict this.
// // The approach in "A new paradigm..." might mitigate this in
// // practice since a "world map" doesn't seem like it would
// // introduce these features in the target world unless they already
// // exist in the source world.
//
// // (impartialtype cmd commandType responseType[ cmd ]
// //   terminationType)
// Term ::=| "(" "impartialtype" TermVar Term Term Term ")"
//
// // (unitimpartial cmd commandType responseType[ cmd ] result)
// Term ::=| "(" "unitimpartial" TermVar Term Term Term ")"
//
// // (invkimpartial cmd1 commandType responseType[ cmd1 ]
// //   terminationType
// //   pairOfCommandAndCallback)
// // where pairOfCommandAndCallback :
// //   (sfa cmd2 commandType
// //     (tfa _ responseType[ cmd2 ]
// //       (partialtype
// //         (impartialtype cmd3 commandType responseType[ cmd3 ]
// //           terminationType))))
// Term ::=| "(" "invkimpartial" TermVar Term Term Term Term ")"

// NEW: The statically generated dynamic token fragment:
//
// // TODO: See if there are better names for this fragment and its
// // definitions.
//
// Term ::=| "(" "tokentype" ")"
//
// // Convert a known private key into a corresponding dynamically
// // comparable value.
// UserAction ::=| "(" "withtoken" TermVar Term UserAction ")"
//
// // TODO: Make sure all syntaxes that begin with "z" are hidden from
// // language users.
// Term ::=| "(" "ztokenequals" Term Term ")"
//
// Built-in module exports:
//
// tokenequals :
//   (tfa _ (tokentype)
//     (tfa _ (tokentype)
//       // TODO: This is meant to represent a boolean value, but it
//       // may not be sufficiently expressive for type-level
//       // computation. Figure out if there's a better option.
//       (ttfa a (tfa _ a (tfa _ a a)))))

// NEW: The kitchen sink "un"-type fragment:
//
// // TODO: Use the phantom type fragment or extensible sum fragment
// // for this. Note that we can't just handle all types at once:
// // If the type (tfa _ (sink) (sink)) can be contained in a sink,
// // then we can formulate the Y combinator and we lose the "total"
// // property of our total functions. Moreover, not all types can
// // necessarily be programmatically compared for observational
// // equality (in order to check whether the sink destruction type
// // matches the construction type), and not all types will
// // necessarily be able to survive past compile time.
// Term ::=| "(" "sink" ")"
// // TODO: Make sure all syntaxes that begin with "z" are hidden from
// // language users.
// Term ::=| "(" "ztokentosink" Term ")"
// Term ::=| "(" "zsinktotoken" Term ")"
// Term ::=| "(" "zpfntosink" Term ")"
// Term ::=| "(" "zsinktopfn" Term ")"
// Term ::=| "(" "zipfntosink" Term ")"
// Term ::=| "(" "zsinktoipfn" Term ")"
//
// Built-in module exports:
//
// // We're using (maybe <inner>) as shorthand for this:
// //   (ttfa a (tfa _ a (tfa _ (tfa <inner> a) a)))
// // TODO: This may not be sufficiently expressive for type-level
// // computation. Figure out if there's a better expansion option.
//
// tokentosink : (tfa _ (tokentype) (sink))
// sinktotoken : (tfa _ (sink) (maybe (tokentype)))
//
// // TODO: See if we need this.
// // NOTE: "pfn" = "partial function"
// pfntosink : (tfa _ (tfa _ (sink) (partialtype (sink))) (sink))
// sinktopfn :
//   (tfa _ (sink) (maybe (tfa _ (sink) (partialtype (sink)))))
//
// // NOTE: "ipfn" = "imperative partial function"
// ipfntosink :
//   (tfa _
//     (tfa _ (sink)
//       (partialtype (impartialtype _ (sink) (sink) (sink))))
//     (sink))
// sinktoipfn :
//   (tfa _ (sink)
//     (maybe
//       (tfa _ (sink)
//         (partialtype (impartialtype _ (sink) (sink) (sink))))))


function envWith( env, varName, varSpecifics ) {
    return env.plusEntry( varName, objPlus( {
        knownIsPrivateKey: null,
        knownIsType: null,
        knownType: null,
        knownTokenStringifiedKey: null,
        knownVal: null
    }, varSpecifics ) );
}

function fresh( desiredName, strMapWhoseKeysToAvoid ) {
    desiredName += "";
    var result = desiredName;
    var index = 1;
    while ( strMapWhoseKeysToAvoid.has( result ) ) {
        index++;
        result = desiredName + "_" + index;
    }
    return result;
}

var patternLang = {};
(function () {
    function Pat() {}
    Pat.prototype.init_ = function ( match ) {
        this.match_ = match;
        return this;
    };
    Pat.prototype.match = function ( data ) {
        return this.match_.call( {}, data );
    };
    
    patternLang.lit = function ( string ) {
        return new Pat().init_( function ( data ) {
            return data === string ? { val: strMap() } : null;
        } );
    };
    patternLang.str = function ( x ) {
        return new Pat().init_( function ( data ) {
            return isPrimString( data ) ?
                { val: strMap().set( x, data ) } : null;
        } );
    };
    var pat =
    patternLang.pat = function ( x ) {
        if ( x instanceof Pat ) {
            return x;
        } else if ( isPrimString( x ) ) {
            return new Pat().init_( function ( data ) {
                return { val: strMap().set( x, data ) };
            } );
        } else if ( isArray( x ) ) {
            var n = x.length;
            var pats = arrMap( x, function ( subx ) {
                return pat( subx );
            } );
            return new Pat().init_( function ( data ) {
                if ( !(isArray( data ) && data.length === n) )
                    return null;
                var result = strMap();
                for ( var i = 0; i < n; i++ ) {
                    var subresult = pats[ i ].match( data[ i ] );
                    if ( subresult === null )
                        return null;
                    // TODO: Figure out what to do when keys overlap.
                    // For now, we just avoid overlapping keys in
                    // practice.
                    result.setAll( subresult.val );
                }
                return { val: result };
            } );
        } else {
            throw new Error();
        }
    };
    patternLang.getMatch = function ( arrData, arrPat ) {
        return pat( arrPat ).match( arrData );
    };
})();


var rbGetFreeVarsOfTerm = [];
function getFreeVarsOfTerm( term, opt_boundVars ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    var boundVars =
        opt_boundVars !== void 0 ? opt_boundVars : strMap();
    
    function recurWith( k, boundVars ) {
        return getFreeVarsOfTerm( em.val.get( k ), boundVars );
    }
    function recur( k ) {
        return recurWith( k, boundVars );
    }
    function recurUnder( termK, argK ) {
        return recurWith( termK,
            boundVars.plusTruth( em.val.get( argK ) ) );
    }
    
    var em;
    if ( isPrimString( term ) ) {
        if ( boundVars.has( term ) )
            return strMap();
        return strMap().plusTruth( term );
        
        // TODO: Until we started using rulebooks, we had individual
        // cases for each syntax here. See if we'll ever need to do
        // that again.
    } else {
        for ( var i = 0, n = rbGetFreeVarsOfTerm.length;
            i < n; i++ ) {
            
            var result = rbGetFreeVarsOfTerm[ i ]( term, boundVars );
            if ( result !== null )
                return result.val;
        }
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

var rbRenameVarsToVars = [];
function renameVarsToVars( renameMap, expr ) {
    
    // NOTE: This takes an env-term pair, but it returns a term.
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    function recur( k ) {
        return renameVarsToVars( renameMap,
            { env: expr.env, term: em.val.get( k ) } );
    }
    function recurUnder( termK, argK ) {
        return renameVarsToVars( renameMap, {
            env: envWith( expr.env, em.val.get( argK ), {} ),
            term: em.val.get( termK )
        } );
    }
    
    var em;
    if ( isPrimString( expr.term ) ) {
        if ( expr.env.has( expr.term ) )
            return expr.term;
        if ( renameMap.has( expr.term ) )
            return renameMap.get( expr.term );
        // TODO: Figure out if this is really what we should do here.
        return expr.term;
        
        // TODO: Until we started using rulebooks, we had individual
        // cases for each syntax here. See if we'll ever need to do
        // that again.
    } else {
        for ( var i = 0, n = rbRenameVarsToVars.length; i < n; i++ ) {
            var result = rbRenameVarsToVars[ i ]( renameMap, expr );
            if ( result !== null )
                return result.val;
        }
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

var rbKnownEqual = [];
function knownEqual( exprA, exprB, opt_boundVars ) {
    // Do a test of intrinsic equality, respecting alpha-equivalence.
    //
    // NOTE: When we support the observational subtyping fragment,
    // this should also respect proof-irrelevance, as described in
    // "Observational Equality, Now!"
    
    // NOTE: We assume exprA and exprB have already been beta-reduced.
    
    var boundVars = opt_boundVars !== void 0 ? opt_boundVars :
        { ab: strMap(), ba: strMap() };
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    var am, bm;
    function aget( k ) {
        return { env: exprA.env, term: am.val.get( k ) };
    }
    function bget( k ) {
        return { env: exprB.env, term: bm.val.get( k ) };
    }
    function recur( k ) {
        return knownEqual( aget( k ), bget( k ), boundVars );
    }
    function recurUnder( termK, argK ) {
        var a = am.val.get( argK );
        var b = bm.val.get( argK );
        return knownEqual( {
            env: envWith( exprA.env, a, {} ),
            term: am.val.get( termK )
        }, {
            env: envWith( exprB.env, b, {} ),
            term: bm.val.get( termK )
        }, {
            ab: boundVars.ab.plusEntry( a, b ),
            ba: boundVars.ba.plusEntry( b, a )
        } );
    }
    
    function aSucceeds( pattern ) {
        am = getMatch( exprA.term, pattern );
        if ( !am )
            return false;
        bm = getMatch( exprB.term, pattern );
        return true;
    }
    
    // If either variable is bound in its term's lexical closure,
    // then we look it up that way and continue, as though the
    // variable value had been substituted in instead of carried
    // in a closure.
    while ( isPrimString( exprA.term )
        && !boundVars.ab.has( exprA.term )
        && exprA.env.has( exprA.term )
        && exprA.env.get( exprA.term ).knownVal !== null )
        exprA = exprA.env.get( exprA.term ).knownVal.val;
    while ( isPrimString( exprB.term )
        && !boundVars.ba.has( exprB.term )
        && exprB.env.has( exprB.term )
        && exprB.env.get( exprB.term ).knownVal !== null )
        exprB = exprB.env.get( exprB.term ).knownVal.val;
    
    if ( isPrimString( exprA.term ) ) {
        if ( !isPrimString( exprB.term ) )
            return false;
        
        // If either variable is part of our tracked local variables,
        // compare them on that basis.
        if ( boundVars.ab.has( exprA.term ) )
            return boundVars.ab.get( exprA.term ) === exprB.term;
        if ( boundVars.ba.has( exprB.term ) )
            return false;
        
        // If they're both free, they're equal if they have the same
        // name.
        return exprA.term === exprB.term;
        
        // TODO: Until we started using rulebooks, we had individual
        // cases for each syntax here. See if we'll ever need to do
        // that again. (We don't have any syntaxes with
        // proof-irrelevant equality yet, but maybe we could handle
        // that in the code we already use to populate the rulebook.)
    } else {
        for ( var i = 0, n = rbKnownEqual.length; i < n; i++ ) {
            var result = rbKnownEqual[ i ]( exprA, exprB, boundVars );
            if ( result !== null )
                return result.val;
        }
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

var rbBetaReduce = [];
function betaReduce( expr ) {
    // NOTE: Pretty much every time we call betaReduce(), we call
    // checkIsType() or checkInhabitsType() first, so that we know
    // beta reduction will terminate (albeit without rigorous
    // mathematical proof yet).
    //
    // TODO: See if this practice leads to significant amounts of
    // duplicated computation.
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    function eget( k ) {
        return { env: expr.env, term: em.val.get( k ) };
    }
    function beget( k ) {
        return betaReduce( eget( k ) );
    }
    
    var env = expr.env;
    
    // NOTE: These have side effects (changing the binding of `env`),
    // even if we use them in a way that makes them look pure.
    //
    // TODO: For the moment, we don't end up renaming anything in
    // practice, and if and when we do, we might run across a bug: The
    // implementation of knownEqual() for free variables depends on
    // the exact names of those variables. See if this will come up as
    // an issue.
    //
    function renameExpr( expr ) {
        var reduced = betaReduce( expr );
        var freeVars = getFreeVarsOfTerm( reduced.term );
        
        var renameForward = strMap();
        var renameBackward = strMap();
        freeVars.each( function ( origName, truth ) {
            var newName = fresh( origName, renameForward );
            renameForward.set( origName, newName );
            renameBackward.set( newName, origName );
        } );
        
        var result = renameVarsToVars( renameForward, reduced );
        env = env.plus( renameBackward.map( function ( origName ) {
            return env.get( origName );
        } ) );
        return result;
    }
    function rename( k ) {
        return renameExpr( eget( k ) );
    }
    
    
    // TODO: Figure out if it's really important to do
    // rename( "argType" ) or beget( "argType" ) when the overall
    // value isn't a type. There might be some static-versus-dynamic
    // confusion here.
    
    var em;
    if ( isPrimString( expr.term ) ) {
        if ( !expr.env.has( expr.term ) )
            throw new Error();
        var exprVal = expr.env.get( expr.term ).knownVal;
        // TODO: During checkInhabitsType(), some of the calls to
        // betaReduce() pass null for knownVal, so we just return the
        // expression as-is if we run across that case. Figure out if
        // those calls should be passing null in the first place.
        if ( exprVal === null )
            return expr;
        
        // TODO: Figure out if it should be necessary to beta-reduce
        // env-term pairs before they're stored in environments (under
        // knownType and knownVal). We do this now, but do we have to?
        // Maybe we could beta-reduce knownVal here instead. But where
        // would we beta-reduce knownType?
        
        // TODO: See if a call to renameVarsToVars() here would
        // obviate the need to do renaming in any other case. After
        // all, this seems to be the only case whose result's
        // environment has mappings that conflict with the original
        // environment.
        
        return exprVal.val;
        
    } else if ( em = getMatch( expr.term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term,
            [ lit( "tfn" ), str( "arg" ), "argType", "result" ] );
        if ( !matchedFn )
            throw new Error();
        return betaReduce( {
            env: envWith( reducedFn.env, matchedFn.val.get( "arg" ), {
                // TODO: Figure out if we actually need this knownType
                // here. If so, figure out whether we should use
                // argType from matchedFn instead. Currently, we make
                // the opposite decision for `snd`.
                knownType: { val: beget( "argType" ) },
                knownVal: { val: beget( "argVal" ) }
            } ),
            term: matchedFn.val.get( "result" )
        } );
        
    } else if ( em = getMatch( expr.term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term,
            [ lit( "ttfn" ), str( "arg" ), "result" ] );
        if ( !matchedFn )
            throw new Error();
        return betaReduce( {
            env: envWith( reducedFn.env, matchedFn.val.get( "arg" ), {
                // TODO: Figure out if we actually need this
                // knownIsType here.
                knownIsType: { val: true },
                knownVal: { val: beget( "argVal" ) }
            } ),
            term: matchedFn.val.get( "result" )
        } );
        
    } else if ( em = getMatch( expr.term, [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        var argTypeTerm = rename( "argType" );
        var argTypeExpr = { env: env, term: argTypeTerm };
        
        var argValTerm = rename( "argVal" );
        var argValExpr = { env: env, term: argValTerm };
        
        var term = [ "sfn", em.val.get( "arg" ), argTypeTerm,
            argValTerm,
            renameExpr( {
                env: envWith( env, em.val.get( "arg" ), {
                    // TODO: Figure out if we actually need this
                    // knownType here.
                    knownType: { val: argTypeExpr },
                    knownVal: { val: argValExpr }
                } ),
                term: em.val.get( "resultVal" )
            } ) ];
        return { env: env, term: term };
        
    } else if ( em = getMatch( expr.term, [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term, [ lit( "sfn" ),
            str( "arg" ), "argType", "argVal", "resultVal" ] );
        if ( !matchedFn )
            throw new Error();
        return { env: env, term: matchedFn.val.get( "argVal" ) };
        
    } else if ( em = getMatch( expr.term, [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term, [ lit( "sfn" ),
            str( "arg" ), "argType", "argVal", "resultVal" ] );
        if ( !matchedFn )
            throw new Error();
        return {
            env: envWith( reducedFn.env, matchedFn.val.get( "arg" ), {
                // TODO: Figure out if we actually need this knownType
                // here. If so, figure out whether we should use
                // argType from `em` instead. Currently, we make the
                // opposite decision for `tcall`.
                knownType: { val: { env: reducedFn.env,
                    term: matchedFn.val.get( "argType" ) } },
                knownVal: { val: { env: reducedFn.env,
                    term: matchedFn.val.get( "argVal" ) } }
            } ),
            term: matchedFn.val.get( "resultVal" )
        };
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ztokenequals" ), "a", "b" ] ) ) {
        
        var a = beget( "a" );
        if ( !(isPrimString( a.term )
            && a.env.has( a.term )
            && a.env.get( a.term ).knownTokenStringifiedKey !== null
        ) )
            throw new Error();
        
        var b = beget( "b" );
        if ( !(isPrimString( b.term )
            && b.env.has( b.term )
            && b.env.get( b.term ).knownTokenStringifiedKey !== null
        ) )
            throw new Error();
        
        var boolVal = a.env.get( a.term ).knownTokenStringifiedKey ===
            b.env.get( b.term ).knownTokenStringifiedKey;
        return { env: strMap(), term:
            [ "ttfn", "a",
                [ "tfn", "then", "a",
                    [ "tfn", "else", "a",
                        boolVal ? "then" : "else" ] ] ] };
    } else {
        for ( var i = 0, n = rbBetaReduce.length; i < n; i++ ) {
            var result = rbBetaReduce[ i ]( expr );
            if ( result !== null )
                return result.val;
        }
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

// NOTE: The "wf" stands for "well-formed."
var rbIsWfTerm = [];
function isWfTerm( term ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    function recur( k ) {
        return isWfTerm( em.val.get( k ) );
    }
    
    var em;
    if ( isPrimString( term ) ) {
        return true;
        
        // TODO: Until we started using rulebooks, we had individual
        // cases for each syntax here. See if we'll ever need to do
        // that again.
    } else {
        for ( var i = 0, n = rbIsWfTerm.length; i < n; i++ ) {
            var result = rbIsWfTerm[ i ]( term );
            if ( result !== null )
                return result.val;
        }
        // TODO: Handle more language fragments.
        return false;
    }
}

var rbCheckIsType = [];
function checkIsType( expr ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    function eget( k ) {
        return { env: expr.env, term: em.val.get( k ) };
    }
    function beget( k ) {
        return betaReduce( eget( k ) );
    }
    
    var em;
    if ( isPrimString( expr.term ) ) {
        if ( !expr.env.has( expr.term ) )
            return false;
        var exprIsType = expr.env.get( expr.term ).knownIsType;
        if ( exprIsType === null )
            return false;
        return exprIsType.val;
        
    } else if ( em = getMatch( expr.term,
        [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        if ( !checkIsType( eget( "argType" ) ) )
            return false;
        return checkIsType( {
            env: envWith( expr.env, em.val.get( "arg" ), {
                knownType: { val: beget( "argType" ) }
            } ),
            term: em.val.get( "resultType" )
        } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        return checkIsType( {
            env: envWith( expr.env, em.val.get( "arg" ), {
                knownIsType: { val: true }
            } ),
            term: em.val.get( "resultType" )
        } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        if ( !checkIsType( eget( "argType" ) ) )
            return false;
        return checkIsType( {
            env: envWith( expr.env, em.val.get( "arg" ), {
                knownType: { val: beget( "argType" ) }
            } ),
            term: em.val.get( "resultType" )
        } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "partialtype" ), "innerType" ] ) ) {
        
        return checkIsType( eget( "innerType" ) );
        
    } else if ( em = getMatch( expr.term, [ lit( "impartialtype" ),
        str( "cmd" ), "commandType", "responseType",
        "terminationType" ] ) ) {
        
        if ( !checkIsType( eget( "commandType" ) ) )
            return false;
        if ( !checkIsType( {
            env: envWith( expr.env, em.val.get( "cmd" ), {
                knownType: { val: beget( "commandType" ) },
            } ),
            term: em.val.get( "responseType" )
        } ) )
            return false;
        return checkIsType( eget( "terminationType" ) );
    } else if ( em = getMatch( expr.term, [ lit( "tokentype" ) ] ) ) {
        return true;
    } else if ( em = getMatch( expr.term, [ lit( "sink" ) ] ) ) {
        return true;
    } else {
        for ( var i = 0, n = rbCheckIsType.length; i < n; i++ ) {
            var result = rbCheckIsType[ i ]( expr );
            if ( result !== null )
                return result.val;
        }
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

var rbCheckInhabitsType = [];
function checkInhabitsType( expr, type ) {
    // NOTE: The type is assumed to be beta-reduced already.
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    // NOTE: Var hoisting is so convenient!
    function eget( k ) {
        return { env: expr.env, term: em.val.get( k ) };
    }
    function beget( k ) {
        return betaReduce( eget( k ) );
    }
    function tget( k ) {
        return { env: type.env, term: tm.val.get( k ) };
    }
    
    var em;
    if ( isPrimString( expr.term ) ) {
        if ( !expr.env.has( expr.term ) )
            return false;
        var exprType = expr.env.get( expr.term ).knownType;
        if ( exprType === null )
            return false;
        return knownEqual( exprType.val, type );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        var tm = getMatch( type.term,
            [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] );
        if ( tm === null )
            return false;
        var argType = tget( "argType" );
        if ( !checkIsType( eget( "argType" ) ) )
            return false;
        if ( !knownEqual( beget( "argType" ), argType ) )
            return false;
        return checkInhabitsType( {
            env: envWith( expr.env, em.val.get( "arg" ), {
                knownType: { val: argType }
            } ),
            term: em.val.get( "result" ),
        }, betaReduce( {
            env: envWith( type.env, tm.val.get( "arg" ), {
                knownType: { val: argType }
            } ),
            term: tm.val.get( "resultType" )
        } ) );
        
    } else if ( em = getMatch( expr.term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "tfa", em.val.get( "argName" ), em.val.get( "argType" ),
                em.val.get( "resultType" ) ] };
        if ( !checkIsType( fnType ) )
            return false;
        if ( !checkInhabitsType(
            eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        var argType = beget( "argType" );
        if ( !checkInhabitsType( eget( "argVal" ), argType ) )
            return false;
        return knownEqual(
            betaReduce( {
                env: envWith( expr.env, em.val.get( "argName" ), {
                    knownType: { val: argType },
                    knownVal: { val: beget( "argVal" ) }
                } ),
                term: em.val.get( "resultType" )
            } ),
            type );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        var tm = getMatch( type.term,
            [ lit( "ttfa" ), str( "arg" ), "resultType" ] );
        if ( tm === null )
            return false;
        
        return checkInhabitsType( {
            env: envWith( expr.env, em.val.get( "arg" ), {
                knownIsType: { val: true }
            } ),
            term: em.val.get( "result" ),
        }, betaReduce( {
            env: envWith( type.env, tm.val.get( "arg" ), {
                knownIsType: { val: true }
            } ),
            term: tm.val.get( "resultType" )
        } ) );
        
    } else if ( em = getMatch( expr.term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "ttfa", em.val.get( "argName" ),
                em.val.get( "resultType" ) ] };
        if ( !checkIsType( fnType ) )
            return false;
        if ( !checkInhabitsType(
            eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        if ( !checkIsType( eget( "argVal" ) ) )
            return false;
        return knownEqual(
            betaReduce( {
                env: envWith( expr.env, em.val.get( "argName" ), {
                    knownIsType: { val: true },
                    knownVal: { val: beget( "argVal" ) }
                } ),
                term: em.val.get( "resultType" )
            } ),
            type );
        
    } else if ( em = getMatch( expr.term, [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        var tm = getMatch( type.term,
            [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] );
        if ( tm === null )
            return false;
        var typeArgType = tget( "argType" );
        if ( !checkIsType( eget( "argType" ) ) )
            return false;
        var exprArgType = beget( "argType" );
        if ( !knownEqual( exprArgType, typeArgType ) )
            return false;
        if ( !checkInhabitsType( eget( "argVal" ), typeArgType ) )
            return false;
        var argVal = beget( "argVal" );
        
        // TODO: Figure out if we should really be passing
        // `exprArgType` and `typeArgType` like this, rather than in
        // some other combination. Anyhow, they're knownEqual at this
        // point.
        return checkInhabitsType( {
            env: envWith( expr.env, em.val.get( "arg" ), {
                knownType: { val: exprArgType },
                knownVal: { val: argVal }
            } ),
            term: em.val.get( "resultVal" )
        }, betaReduce( {
            env: envWith( type.env, tm.val.get( "arg" ), {
                knownType: { val: typeArgType },
                knownVal: { val: argVal }
            } ),
            term: tm.val.get( "resultType" )
        } ) );
        
    } else if ( em = getMatch( expr.term, [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "sfa", em.val.get( "argName" ), em.val.get( "argType" ),
                em.val.get( "resultType" ) ] };
        if ( !checkIsType( fnType ) )
            return false;
        if ( !checkInhabitsType(
            eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        return knownEqual( beget( "argType" ), type );
        
    } else if ( em = getMatch( expr.term, [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "sfa", em.val.get( "argName" ), em.val.get( "argType" ),
                em.val.get( "resultType" ) ] }
        if ( !checkIsType( fnType ) )
            return false;
        if ( !checkInhabitsType(
            eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term, [ lit( "sfn" ),
            str( "arg" ), "argType", "argVal", "resultVal" ] );
        if ( matchedFn === null )
            return false;
        return checkInhabitsType( {
            env: envWith( reducedFn.env, matchedFn.val.get( "arg" ), {
                knownType: { val: { env: reducedFn.env,
                    term: matchedFn.val.get( "argType" ) } },
                knownVal: { val: { env: reducedFn.env,
                    term: matchedFn.val.get( "argVal" ) } }
            } ),
            term: matchedFn.val.get( "resultVal" )
        }, type );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "zunitpartial" ), "terminationType", "result" ] ) ) {
        
        var thunkType = { env: expr.env, term:
            [ "partialtype", em.val.get( "terminationType" ) ] };
        if ( !checkIsType( thunkType ) )
            return false;
        if ( !checkInhabitsType(
            eget( "result" ), eget( "terminationType" ) ) )
            return false;
        return knownEqual( betaReduce( thunkType ), type );
        
    } else if ( em = getMatch( expr.term, [ lit( "zbindpartial" ),
        "aType", "bType", "thunkA", "aToThunkB" ] ) ) {
        
        var typeOfThunkA = { env: expr.env, term:
            [ "partialtype", em.val.get( "aType" ) ] };
        if ( !checkIsType( typeOfThunkA ) )
            return false;
        var igno = fresh( "unused", expr.env );
        var typeOfAToThunkB = { env: expr.env, term:
            [ "tfa", igno, em.val.get( "aType" ),
                [ "partialtype", em.val.get( "bType" ) ] ] };
        if ( !checkIsType( typeOfAToThunkB ) )
            return false;
        if ( !checkInhabitsType(
            eget( "thunkA" ), betaReduce( typeOfThunkA ) ) )
            return false;
        if ( !checkInhabitsType(
            eget( "aToThunkB" ), betaReduce( typeOfAToThunkB ) ) )
            return false;
        return knownEqual(
            betaReduce( { env: expr.env, term:
                [ "partialtype", em.val.get( "bType" ) ] } ),
            type );
        
    } else if ( em = getMatch( expr.term, [ lit( "zfixpartial" ),
        "terminationType", "thunkToThunk" ] ) ) {
        
        var typeOfThunk = { env: expr.env, term:
            [ "partialtype", em.val.get( "terminationType" ) ] };
        if ( !checkIsType( typeOfThunk ) )
            return false;
        var reducedTypeOfThunk = betaReduce( typeOfThunk );
        var igno = fresh( "unused", reducedTypeOfThunk.env );
        if ( !checkInhabitsType( eget( "thunkToThunk" ),
            betaReduce( { env: reducedTypeOfThunk.env, term:
                [ "tfa", igno, reducedTypeOfThunk.term,
                    reducedTypeOfThunk.term ] } ) ) )
            return false;
        return knownEqual( reducedTypeOfThunk, type );
        
    } else if ( em = getMatch( expr.term, [ lit( "unitimpartial" ),
        str( "cmd" ), "commandType", "responseType", "result" ] ) ) {
        
        var tm = getMatch( type.term, [ lit( "impartialtype" ),
            str( "cmd" ), "commandType", "responseType",
            "terminationType" ] );
        if ( tm === null )
            return false;
        var typeCommandType = tget( "commandType" );
        if ( !checkIsType( eget( "commandType" ) ) )
            return false;
        var exprCommandType = beget( "commandType" );
        if ( !knownEqual( exprCommandType, typeCommandType ) )
            return false;
        // TODO: See if we should beta-reduce the arguments here.
        // TODO: Figure out if we should really be passing
        // `exprCommandType` and `typeCommandType` like this, rather
        // than in some other combination. Anyhow, they're knownEqual
        // at this point.
        if ( !knownEqual( {
            env: envWith( expr.env, em.val.get( "cmd" ), {
                knownType: { val: exprCommandType }
            } ),
            term: em.val.get( "responseType" ),
        }, {
            env: envWith( type.env, tm.val.get( "cmd" ), {
                knownType: { val: typeCommandType }
            } ),
            term: tm.val.get( "responseType" )
        } ) )
            return false;
        return checkInhabitsType(
            eget( "result" ), tget( "responseType" ) );
        
    } else if ( em = getMatch( expr.term, [ lit( "invkimpartial" ),
        str( "cmd" ), "commandType", "responseType",
        "terminationType", "pairOfCommandAndCallback" ] ) ) {
        
        var tm = getMatch( type.term, [ lit( "impartialtype" ),
            str( "cmd" ), "commandType", "responseType",
            "terminationType" ] );
        if ( tm === null )
            return false;
        var typeCommandType = tget( "commandType" );
        if ( !checkIsType( eget( "commandType" ) ) )
            return false;
        var exprCommandType = beget( "commandType" );
        if ( !knownEqual( exprCommandType, typeCommandType ) )
            return false;
        // TODO: See if we should beta-reduce the arguments here.
        // TODO: Figure out if we should really be passing
        // `exprCommandType` and `typeCommandType` like this, rather
        // than in some other combination. Anyhow, they're knownEqual
        // at this point.
        if ( !knownEqual( {
            env: envWith( expr.env, em.val.get( "cmd" ), {
                knownType: { val: exprCommandType }
            } ),
            term: em.val.get( "responseType" ),
        }, {
            env: envWith( type.env, tm.val.get( "cmd" ), {
                knownType: { val: typeCommandType }
            } ),
            term: tm.val.get( "responseType" )
        } ) )
            return false;
        var typeTerminationType = tget( "terminationType" );
        if ( !checkIsType( eget( "terminationType" ) ) )
            return false;
        var exprTerminationType = beget( "terminationType" );
        if ( !knownEqual( exprTerminationType, typeTerminationType ) )
            return false;
        
        // Check the invoked command and callback against this type:
        //
        // (sfa cmd2 commandType
        //   (tfa _ responseType[ cmd2 ]
        //     (partialtype
        //       (impartialtype cmd3 commandType responseType[ cmd3 ]
        //         terminationType))))
        var ignoVar =
            fresh( "unused", getFreeVarsOfTerm( type.term ) );
        return checkInhabitsType( eget( "pairOfCommandAndCallback" ),
            { env: type.env, term:
                // NOTE: We could make a fresh variable name and
                // substitute it into responseType, but we reuse the
                // `cmd` variable instead.
                [ "sfa", tm.val.get( "cmd" ),
                    tm.val.get( "commandType" ),
                    [ "tfa", ignoVar, tm.val.get( "responseType" ),
                        [ "partialtype", type.term ] ] ] } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ztokenequals" ), "a", "b" ] ) ) {
        
        if ( !checkInhabitsType( eget( "a" ),
            { env: strMap(), term: [ "tokentype" ] } ) )
            return false;
        if ( !checkInhabitsType( eget( "b" ),
            { env: strMap(), term: [ "tokentype" ] } ) )
            return false;
        return knownEqual(
            { env: strMap(), term:
                [ "ttfa", "a",
                    [ "tfa", "_", "a", [ "tfa", "_", "a", "a" ] ] ] },
            type );
    } else {
        for ( var i = 0, n = rbCheckInhabitsType.length;
            i < n; i++ ) {
            
            var result = rbCheckInhabitsType[ i ]( expr, type );
            if ( result !== null )
                return result.val;
        }
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

var rbCompileTermToSyncJs = [];
function compileTermToSyncJs( expr ) {
    
    // TODO: Even though the input is an env-term pair, we only use
    // the term for now. Even once we try to compile built-in
    // functions, we'll probably take care of that in
    // compileTermToSyncJsFull(). See if we need to keep the env.
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    function eget( k ) {
        return { env: expr.env, term: em.val.get( k ) };
    }
    
    function toKey( name ) {
        return jsStr( "|" + name );
    }
    
    function instructions( var_args ) {
        var reversed = [];
        for ( var i = arguments.length - 1; 0 <= i; i-- )
            reversed.push( ""
                + "_.pushInst( function ( _ ) {\n"
                + "\n"
                + arguments[ i ]
                + "\n"
                + "} );\n"
            );
        return reversed.join( "" );
    }
    
    var em;
    if ( isPrimString( expr.term ) ) {
        return  "_.pushRes( _.env[ " + toKey( expr.term ) + " ] );\n";
        
    } else if ( em = getMatch( expr.term,
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        var arg = em.val.get( "arg" );
        var captures = [];
        getFreeVarsOfTerm( expr.term ).minusEntry( arg ).each(
            function ( v ) {
            
            v = toKey( v );
            captures.push( "    " + v + ": _.env[ " + v + " ]" );
        } );
        return (""
            + "_.pushRes( { arg: " + toKey( arg ) + ", lexEnv: {\n"
            + (captures.length === 0 ? "" :
                captures.join( ",\n" ) + "\n")
            + "}, go: function ( _ ) {\n"
            + "\n"
            + compileTermToSyncJs( eget( "result" ) )
            + "\n"
            + "} } );\n"
        );
        
    } else if ( em = getMatch( expr.term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        return instructions(
            compileTermToSyncJs( eget( "fn" ) ),
            compileTermToSyncJs( eget( "argVal" ) ),
            ""
            + "var argVal = _.popRes();\n"
            + "var fn = _.popRes();\n"
            + "_.pushTfn( fn, argVal );\n"
        );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        var arg = em.val.get( "arg" );
        var captures = [];
        getFreeVarsOfTerm( expr.term ).minusEntry( arg ).each(
            function ( v ) {
            
            v = toKey( v );
            captures.push( "    " + v + ": _.env[ " + v + " ]" );
        } );
        return (""
            + "_.pushRes( { lexEnv: {\n"
            + (captures.length === 0 ? "" :
                captures.join( ",\n" ) + "\n")
            + "}, go: function ( _ ) {\n"
            + "\n"
            + compileTermToSyncJs( eget( "result" ) )
            + "\n"
            + "} } );\n"
        );
        
    } else if ( em = getMatch( expr.term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        return instructions(
            compileTermToSyncJs( eget( "fn" ) ),
            ""
            + "var fn = _.popRes();\n"
            + "_.pushTtfn( fn );\n"
        );
        
    } else if ( em = getMatch( expr.term, [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        var arg = em.val.get( "arg" );
        var captures = "";
        getFreeVarsOfTerm( expr.term ).minusEntry( arg ).each(
            function ( v ) {
            
            v = toKey( v );
            captures += "    " + v + ": _.env[ " + v + " ],\n";
        } );
        return instructions(
            compileTermToSyncJs( eget( "argVal" ) ),
            ""
            + "var argVal = _.popRes();\n"
            + "_.pushRes( argVal );\n"
            + "_.pushRes( _.env );\n"
            + "_.env = {\n"
            + captures
            + "    " + toKey( em.val.get( "arg" ) ) + ": argVal\n"
            + "};\n",
            compileTermToSyncJs( eget( "resultVal" ) ),
            ""
            + "var resultVal = _.popRes();\n"
            + "_.env = _.popRes();\n"
            + "var argVal = _.popRes();\n"
            + "_.pushRes( [ argVal, resultVal ] );\n"
        );
        
    } else if ( em = getMatch( expr.term, [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return instructions(
            compileTermToSyncJs( eget( "fn" ) ),
            ""
            + "var fn = _.popRes();\n"
            + "_.pushRes( fn[ 0 ] );\n"
        );
        
    } else if ( em = getMatch( expr.term, [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        return instructions(
            compileTermToSyncJs( eget( "fn" ) ),
            ""
            + "var fn = _.popRes();\n"
            + "_.pushRes( fn[ 1 ] );\n"
        );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "zunitpartial" ), "terminationType", "result" ] ) ) {
        
        return instructions(
            compileTermToSyncJs( eget( "result" ) ),
            ""
            + "var result = _.popRes();\n"
            + "_.pushRes(\n"
            + "    { partialTag: \"unit\", result: result } );\n"
        );
        
    } else if ( em = getMatch( expr.term, [ lit( "zbindpartial" ),
        "aType", "bType", "thunkA", "aToThunkB" ] ) ) {
        
        return instructions(
            compileTermToSyncJs( eget( "thunkA" ) ),
            compileTermToSyncJs( eget( "aToThunkB" ) ),
            ""
            + "var aToThunkB = _.popRes();\n"
            + "var thunkA = _.popRes();\n"
            + "_.pushRes( { partialTag: \"bind\",\n"
            + "    thunkA: thunkA, aToThunkB: aToThunkB } );\n"
        );
        
    } else if ( em = getMatch( expr.term, [ lit( "zfixpartial" ),
        "terminationType", "thunkToThunk" ] ) ) {
        
        return instructions(
            compileTermToSyncJs( eget( "thunkToThunk" ) ),
            ""
            + "var thunkToThunk = _.popRes();\n"
            + "_.pushRes( { partialTag: \"fix\",\n"
            + "    thunkToThunk: thunkToThunk } );\n"
        );
        
    } else if ( em = getMatch( expr.term, [ lit( "unitimpartial" ),
        str( "cmd" ), "commandType", "responseType", "result" ] ) ) {
        
        return instructions(
            compileTermToSyncJs( eget( "result" ) ),
            ""
            + "var result = _.popRes();\n"
            + "_.pushRes(\n"
            + "    { impartialTag: \"unit\", result: result } );\n"
        );
        
    } else if ( em = getMatch( expr.term, [ lit( "invkimpartial" ),
        str( "cmd" ), "commandType", "responseType",
        "terminationType", "pairOfCommandAndCallback" ] ) ) {
        
        return instructions(
            compileTermToSyncJs( eget( "pairOfCommandAndCallback" ) ),
            ""
            + "var invocation = _.popRes();\n"
            + "_.pushRes( { impartialTag: \"invk\",\n"
            + "    command: invocation[ 0 ],\n"
            + "    callback: invocation[ 1 ] } );\n"
        );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ztokenequals" ), "a", "b" ] ) ) {
        
        // TODO: When we implement `withtoken`, make sure the
        // JavaScript values it uses to represent tokens are the
        // outputs of stringifyKey() so === will work.
        return instructions(
            compileTermToSyncJs( eget( "a" ) ),
            compileTermToSyncJs( eget( "b" ) ),
            ""
            + "var b = _.popRes();\n"
            + "var a = _.popRes();\n"
            + "var boolVal = a === b;\n"
            + "_.pushRes( { lexEnv: {}, go: function ( _ ) {\n"
            + "    _.pushRes( { arg: \"|then\", lexEnv: {\n"
            + "    }, go: function ( _ ) {\n"
            + "        _.pushRes( { arg: \"|else\", lexEnv: {\n"
            + "        }, go: function ( _ ) {\n"
            + "            _.pushRes( boolVal ?\n"
            + "                _.env[ \"|then\" ] :\n"
            + "                _.env[ \"|else\" ] );\n"
            + "        } } );\n"
            + "    } } );\n"
            + "} } );\n"
        );
    } else {
        for ( var i = 0, n = rbCompileTermToSyncJs.length;
            i < n; i++ ) {
            
            var result = rbCompileTermToSyncJs[ i ]( expr );
            if ( result !== null )
                return result.val;
        }
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

function compileTermToSyncJsFull( expr ) {
    
    // TODO: See if we're actually going to use the environment. For
    // now we just do a sanity check to make sure it's empty, and then
    // we pass it along to compileTermToSyncJs(), which doesn't use it
    // either.
    if ( expr.env.hasAny() )
        throw new Error();
    
    var igno = "_";
    var unitType = [ "ttfa", "t", [ "tfa", igno, "t", "t" ] ];
    if ( !(isWfTerm( expr.term )
        && checkInhabitsType( expr, { env: strMap(), term:
            [ "partialtype",
                [ "impartialtype", igno, unitType, unitType,
                    unitType ] ] } )) )
        throw new Error();
    
    // TODO: Deal with imports and such. Maybe we'll need to compile
    // UserActions instead of Terms, or maybe we'll need to keep track
    // of import data and built-in function code as part of envWith().
    
    return (""
        + "(function () { \"use strict\";\n"
        + "\n"
        + "var total = 0;\n"
        + "var results = [];\n"
        + "var instructions = [];\n"
        + "var _ = {};\n"
        + "_.pushRes = function ( result ) {\n"
        + "    results.push( result );\n"
        + "};\n"
        + "_.popRes = function () {\n"
        + "    return results.pop();\n"
        + "};\n"
        + "_.pushInst = function ( instruction ) {\n"
        + "    instructions.push( instruction );\n"
        + "};\n"
        + "_.env = {};\n"
        + "_.pushTfn = function ( fn, arg ) {\n"
        + "    var newEnv = fn.lexEnv;\n"
        + "    var oldEnv = _.env;\n"
        + "    _.env = newEnv;\n"
        + "    newEnv[ fn.arg ] = arg;\n"
        + "    _.pushInst( function ( _ ) {\n"
        + "        newEnv[ fn.arg ] = null;\n"
        + "        _.env = oldEnv;\n"
        + "    } );\n"
        + "    fn.go( _ );\n"
        + "};\n"
        + "_.pushTtfn = function ( fn ) {\n"
        + "    var newEnv = fn.lexEnv;\n"
        + "    var oldEnv = _.env;\n"
        + "    _.env = newEnv;\n"
        + "    _.pushInst( function ( _ ) {\n"
        + "        _.env = oldEnv;\n"
        + "    } );\n"
        + "    fn.go( _ );\n"
        + "};\n"
        + "\n"
        + compileTermToSyncJs( expr )
        + "\n"
        + "function invk( command ) {\n"
        // TODO: Support better side effects. For now, any and every
        // command increments a variable and responds with the command
        // value itself. Still, this is as much as we can do as long
        // as the commands and responses are of the unit type.
        + "    total++;\n"
        + "    return command;\n"
        + "}\n"
        + "function runInstructions() {\n"
        + "    while ( instructions.length )\n"
        + "        instructions.pop()( _ );\n"
        // TODO: Make sure this never happens. This check is here just
        // in case.
        + "    if ( results.length !== 1 )\n"
        + "        throw new Error();\n"
        + "    return results.pop();\n"
        + "}\n"
        + "function callTfn( fn, arg ) {\n"
        + "    _.pushTfn( fn, arg );\n"
        + "    return runInstructions();\n"
        + "}\n"
        + "function runPartial( partialStep ) {\n"
        + "    var bindContinuations = [];\n"
        + "    while ( true ) {\n"
        + "        if ( partialStep.partialTag === \"unit\" ) {\n"
        + "            if ( bindContinuations.length === 0 )\n"
        + "                return partialStep.result;\n"
        + "            else\n"
        + "                partialStep = callTfn(\n"
        + "                    bindContinuations.pop(),\n"
        + "                    partialStep.result );\n"
        + "            \n"
        + "        } else if (\n"
        + "            partialStep.partialTag === \"bind\" ) {\n"
        + "            \n"
        + "            bindContinuations.push(\n"
        + "                partialStep.aToThunkB );\n"
        + "            partialStep = partialStep.thunkA;\n"
        + "            \n"
        + "        } else if (\n"
        + "            partialStep.partialTag === \"fix\" ) {\n"
        + "            \n"
        + "            partialStep = callTfn(\n"
        + "                partialStep.thunkToThunk, partialStep );\n"
        + "        } else {\n"
        + "            throw new Error();\n"
        + "        }\n"
        + "    }\n"
        + "}\n"
        + "function runImpartial( impartialStep ) {\n"
        + "    while ( true ) {\n"
        + "        if ( impartialStep.impartialTag === \"unit\" ) {\n"
        + "            return impartialStep.result;\n"
        + "            \n"
        + "        } else if (\n"
        + "            impartialStep.impartialTag === \"invk\" ) {\n"
        + "            \n"
        + "            impartialStep = runPartial( callTfn(\n"
        + "                impartialStep.callback,\n"
        + "                invk( impartialStep.command ) ) );\n"
        + "        } else {\n"
        + "            throw new Error();\n"
        + "        }\n"
        + "    }\n"
        + "}\n"
        + "\n"
        + "runImpartial( runPartial( runInstructions() ) );\n"
        + "return total;\n"
        + "\n"
        + "})()"
        + "\n"
        + "//@ sourceURL=dynamic-era.js\n"
    );
}


// TODO: Actually use this. Test it, too.
var builtins = strMap();

(function () {
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    function SubStx() {}
    SubStx.prototype.init = function ( name, subName ) {
        this.name = name;
        this.subName = subName;
        return this;
    };
    function sub( name, subName ) {
        return new SubStx().init( name, subName );
    }
    
    function addBuiltinSyntax( key, nickname ) {
        builtins.set( stringifyKey( key ), {
            knownIsSyntax: { val: true },
            knownNickname:
                nickname === null ? null : { val: nickname },
            knownType: null,
            knownVal: null
        } );
    }
    function addBuiltinVal( key, type, val ) {
        if ( !(isWfKey( key )
            && isWfTerm( type.term ) && checkIsType( type )
            && isWfTerm( val.term )
            && checkInhabitsType( val, type )) )
            throw new Error();
        builtins.set( stringifyKey( key ), {
            knownIsSyntax: null,
            knownNickname: null,
            knownType: { val: type },
            knownVal: { val: val }
        } );
    }
    // TODO: Use a real identity rather than [ "everyone" ].
    function addEraSyntax( fragmentName, nickname ) {
        addBuiltinSyntax(
            [ "subkey", [ "everyone" ],
                [ "sym",
                    "era_" + fragmentName + "_stx_" + nickname ] ],
            nickname );
    }
    function addEraVal( fragmentName, nickname, typeTerm, valTerm ) {
        addBuiltinVal(
            [ "subkey", [ "everyone" ],
                [ "sym",
                    "era_" + fragmentName + "_stx_" + nickname ] ],
            { env: strMap(), term: typeTerm },
            { env: strMap(), term: valTerm } );
    }
    
    function makePat( name, args ) {
        return pat( [ lit( name ) ].concat(
            arrMap( args, function ( arg ) {
                if ( arg instanceof SubStx )
                    return arg.name;
                else
                    return arg;
            } ) ) );
    }
    function addTypeOrTerm( fragmentName, name, args ) {
        addEraSyntax( fragmentName, name );
        var pat = makePat( name, args );
        rbGetFreeVarsOfTerm.push( function ( term, boundVars ) {
            var em = getMatch( term, pat );
            if ( em === null )
                return null;
            
            function recurWith( k, boundVars ) {
                return getFreeVarsOfTerm(
                    em.val.get( k ), boundVars );
            }
            function recur( k ) {
                return recurWith( k, boundVars );
            }
            function recurUnder( termK, argK ) {
                return recurWith( termK,
                    boundVars.plusTruth( em.val.get( argK ) ) );
            }
            
            var result = strMap();
            for ( var i = 0, n = args.length; i < n; i++ ) {
                var arg = args[ i ];
                if ( arg instanceof SubStx )
                    result = result.plus(
                        recurUnder( arg.name, arg.subName ) );
                else if ( isPrimString( arg ) )
                    result = result.plus( recur( arg ) );
            }
            return { val: result };
        } );
        rbRenameVarsToVars.push( function ( renameMap, expr ) {
            var em = getMatch( expr.term, pat );
            if ( em === null )
                return null;
            
            function recur( k ) {
                return renameVarsToVars( renameMap,
                    { env: expr.env, term: em.val.get( k ) } );
            }
            function recurUnder( termK, argK ) {
                return renameVarsToVars( renameMap, {
                    env: envWith( expr.env, em.val.get( argK ), {} ),
                    term: em.val.get( termK )
                } );
            }
            
            var result = [ name ];
            for ( var i = 0, n = args.length; i < n; i++ ) {
                var arg = args[ i ];
                if ( arg instanceof SubStx )
                    result.push(
                        recurUnder( arg.name, arg.subName ) );
                else if ( isPrimString( arg ) )
                    result.push( recur( arg ) );
                else
                    result.push( expr.term[ i + 1 ] );
            }
            return { val: result };
        } );
        rbKnownEqual.push( function ( exprA, exprB, boundVars ) {
            var am = getMatch( exprA.term, pat );
            if ( am === null )
                return null;
            
            var bm = getMatch( exprB.term, pat );
            if ( bm === null )
                return { val: false };
            
            function aget( k ) {
                return { env: exprA.env, term: am.val.get( k ) };
            }
            function bget( k ) {
                return { env: exprB.env, term: bm.val.get( k ) };
            }
            function recur( k ) {
                return knownEqual( aget( k ), bget( k ), boundVars );
            }
            function recurUnder( termK, argK ) {
                var a = am.val.get( argK );
                var b = bm.val.get( argK );
                return knownEqual( {
                    env: envWith( exprA.env, a, {} ),
                    term: am.val.get( termK )
                }, {
                    env: envWith( exprB.env, b, {} ),
                    term: bm.val.get( termK )
                }, {
                    ab: boundVars.ab.plusEntry( a, b ),
                    ba: boundVars.ba.plusEntry( b, a )
                } );
            }
            
            for ( var i = 0, n = args.length; i < n; i++ ) {
                var arg = args[ i ];
                if ( arg instanceof SubStx ) {
                    if ( !recurUnder( arg.name, arg.subName ) )
                        return { val: false };
                } else if ( isPrimString( arg ) ) {
                    if ( !recur( arg ) )
                        return { val: false };
                }
            }
            return { val: true };
        } );
        rbIsWfTerm.push( function ( term ) {
            var em = getMatch( term, pat );
            if ( em === null )
                return null;
            
            function recur( k ) {
                return isWfTerm( em.val.get( k ) );
            }
            
            for ( var i = 0, n = args.length; i < n; i++ ) {
                var arg = args[ i ];
                if ( arg instanceof SubStx ) {
                    if ( !recur( arg.name ) )
                        return { val: false };
                } else if ( isPrimString( arg ) ) {
                    if ( !recur( arg ) )
                        return { val: false };
                }
            }
            return { val: true };
        } );
    }
    function addEasy( name, args ) {
        var pat = makePat( name, args );
        rbBetaReduce.push( function ( expr ) {
            var em = getMatch( expr.term, pat );
            if ( em === null )
                return null;
            
            function eget( k ) {
                return { env: expr.env, term: em.val.get( k ) };
            }
            function beget( k ) {
                return betaReduce( eget( k ) );
            }
            
            var env = expr.env;
            
            // NOTE: These have side effects (changing the binding of
            // `env`), even if we use them in a way that makes them
            // look pure.
            //
            // TODO: For the moment, we don't end up renaming anything
            // in practice, and if and when we do, we might run across
            // a bug: The implementation of knownEqual() for free
            // variables depends on the exact names of those
            // variables. See if this will come up as an issue.
            //
            function renameExpr( expr ) {
                var reduced = betaReduce( expr );
                var freeVars = getFreeVarsOfTerm( reduced.term );
                
                var renameForward = strMap();
                var renameBackward = strMap();
                freeVars.each( function ( origName, truth ) {
                    var newName = fresh( origName, renameForward );
                    renameForward.set( origName, newName );
                    renameBackward.set( newName, origName );
                } );
                
                var result =
                    renameVarsToVars( renameForward, reduced );
                env = env.plus(
                    renameBackward.map( function ( origName ) {
                        return env.get( origName );
                    } ) );
                return result;
            }
            function rename( k ) {
                return renameExpr( eget( k ) );
            }
            
            // TODO: Figure out if it's really important to do
            // rename( "argType" ) or beget( "argType" ) when the
            // overall value isn't a type. There might be some
            // static-versus-dynamic confusion here.
            
            var term = [ name ];
            for ( var i = 0, n = args.length; i < n; i++ ) {
                var arg = args[ i ];
                if ( isPrimString( arg ) )
                    term.push( rename( arg ) );
                else
                    term.push( expr.term[ i + 1 ] );
            }
            return { val: { env: env, term: term } };
        } );
    }
    function addType( fragmentName, name, args ) {
        addTypeOrTerm( fragmentName, name, args );
        var pat = makePat( name, args );
        rbCheckInhabitsType.push( function ( expr, type ) {
            if ( getMatch( expr.term, pat ) )
                return { val: false };
            return null;
        } );
        rbCompileTermToSyncJs.push( function ( expr ) {
            if ( getMatch( expr.term, pat ) )
                throw new Error();
            return null;
        } );
    }
    function addTerm( fragmentName, name, args ) {
        addTypeOrTerm( fragmentName, name, args );
        var pat = makePat( name, args );
        rbCheckIsType.push( function ( expr ) {
            if ( getMatch( expr.term, pat ) )
                return { val: false };
            return null;
        } );
    }
    function addEasyType( fragmentName, name, args ) {
        addEasy( name, args );
        addType( fragmentName, name, args );
    }
    function addEasyTerm( fragmentName, name, args ) {
        addEasy( name, args );
        addTerm( fragmentName, name, args );
    }
    function addSinkTag( tagName, innerTypeTerm ) {
        if ( !/^[a-z]+$/.test( tagName ) )
            throw new Error(
                "Sink tags can only contain lowercase letters." );
        if ( getFreeVarsOfTerm( innerTypeTerm ).hasAny() )
            throw new Error();
        var maybeInnerType = { env: strMap(), term:
            [ "ttfa", "a",
                [ "tfa", "_", "a",
                    [ "tfa", "_", [ "tfa", "_", innerTypeTerm, "a" ],
                        "a" ] ] ] };
        var innerType = { env: strMap(), term: innerTypeTerm };
        var sinkType = { env: strMap(), term: [ "sink" ] };
        
        var toSink = "z" + tagName + "tosink";
        var fromSink = "zsinkto" + tagName;
        var toSinkPat = makePat( toSink, [ "val" ] );
        var fromSinkPat = makePat( fromSink, [ "sink" ] );
        addEasyTerm( "kitchenSinkUnType", toSink, [ "val" ] );
        addTerm( "kitchenSinkUnType", fromSink, [ "sink" ] );
        rbBetaReduce.push( function ( expr ) {
            var em = getMatch( expr.term, fromSinkPat );
            if ( em === null )
                return null;
            
            function eget( k ) {
                return { env: expr.env, term: em.val.get( k ) };
            }
            function beget( k ) {
                return betaReduce( eget( k ) );
            }
            
            var reducedSink = beget( "sink" );
            var matchedSink = getMatch( reducedSink.term, toSinkPat );
            if ( !matchedSink )
                return { val: { env: strMap(), term:
                    [ "ttfn", "a",
                        [ "tfn", "else", "a",
                            [ "tfn", "then",
                                [ "tfa", "_", innerTypeTerm, "a" ],
                                "else" ] ] ] } };
            var val = matchedSink.val.get( "val" );
            var freeVars = getFreeVarsOfTerm( val );
            var thenVar = fresh( "then", freeVars );
            var elseVar = fresh( "else",
                freeVars.plusTruth( thenVar ) );
            var typeVar = fresh( "type", freeVars.plusArrTruth(
                [ thenVar, elseVar, typeVar, "_" ] ) );
            return { val: { env: reducedSink.env, term:
                [ "ttfn", typeVar,
                    [ "tfn", elseVar, typeVar,
                        [ "tfn", thenVar,
                            [ "tfa", "_", innerTypeTerm, typeVar ],
                            [ "tcall", "_", innerTypeTerm, typeVar,
                                thenVar, val ] ] ] ] } };
        } );
        rbCheckInhabitsType.push( function ( expr, type ) {
            var em;
            
            function eget( k ) {
                return { env: expr.env, term: em.val.get( k ) };
            }
            
            if ( em = getMatch( expr.term, toSinkPat ) ) {
                if ( !checkInhabitsType( eget( "val" ), innerType ) )
                    return { val: false };
                return { val: knownEqual( sinkType, type ) };
            } else if ( em = getMatch( expr.term, fromSinkPat ) ) {
                if ( !checkInhabitsType( eget( "sink" ), sinkType ) )
                    return { val: false };
                return { val: knownEqual( maybeInnerType, type ) };
            } else {
                return null;
            }
        } );
        rbCompileTermToSyncJs.push( function ( expr ) {
            var em;
            
            function eget( k ) {
                return { env: expr.env, term: em.val.get( k ) };
            }
            
            function instructions( var_args ) {
                var reversed = [];
                for ( var i = arguments.length - 1; 0 <= i; i-- )
                    reversed.push( ""
                        + "_.pushInst( function ( _ ) {\n"
                        + "\n"
                        + arguments[ i ]
                        + "\n"
                        + "} );\n"
                    );
                return reversed.join( "" );
            }
            
            if ( em = getMatch( expr.term, toSinkPat ) ) {
                return { val: instructions(
                    compileTermToSyncJs( eget( "val" ) ),
                    ""
                    + "var val = _.popRes();\n"
                    + "_.pushRes( { sinkTag: \"" + tagName + "\",\n"
                    + "    val: val } );\n"
                ) };
            } else if ( em = getMatch( expr.term, fromSinkPat ) ) {
                return { val: instructions(
                    compileTermToSyncJs( eget( "sink" ) ),
                    ""
                    + "var sink = _.popRes();\n"
                    + "_.pushRes( { lexEnv: {\n"
                    + "}, go: function ( _ ) {\n"
                    + "    _.pushRes( { arg: \"|else\", lexEnv: {\n"
                    + "    }, go: function ( _ ) {\n"
                    + "        var elseVal = _.env[ \"|else\" ];\n"
                    + "        _.pushRes( { arg: \"|then\",\n"
                    + "            lexEnv: {}, go: function ( _ ) {\n"
                    + "            \n"
                    + "            if ( sink.sinkTag !==\n"
                    + "                \"" + tagName + "\" )\n"
                    + "                _.pushRes( elseVal );\n"
                    + "            else\n"
                    + "                _.pushInst( function ( _ ) {\n"
                    + "                    _.pushTfn(\n"
                    + "                        _.env[ \"|then\" ],\n"
                    + "                        sink.val );\n"
                    + "                } );\n"
                    + "        } } );\n"
                    + "    } } );\n"
                    + "} } );\n"
                ) };
            } else {
                return null;
            }
        } );
        addEraVal( "kitchenSinkUnType", tagName + "tosink",
            [ "tfa", "_", innerTypeTerm, [ "sink" ] ],
            [ "tfn", "val", innerTypeTerm, [ toSink, "val" ] ] );
        addEraVal( "kitchenSinkUnType", "sinkto" + tagName,
            [ "tfa", "_", [ "sink" ],
                [ "ttfa", "a",
                    [ "tfa", "_", "a",
                        [ "tfa", "_",
                            [ "tfa", "_", innerTypeTerm, "a" ],
                            "a" ] ] ] ],
            [ "tfn", "sink", [ "sink" ], [ fromSink, "sink" ] ] );
    }
    
    
    // NOTE: The order matters a little here. We do a sanity typecheck
    // of every addEraVal() at the moment it appears, at which point
    // only the earlier-defined syntaxes exist.
    
    // NOTE: Every time we add a term syntax (using addType, addTerm,
    // addEasyType, or addEasyTerm), we must add special cases to the
    // following functions:
    //
    // betaReduce (unless the syntax fits addEasyType or addEasyTerm)
    // checkIsType (for types)
    // checkInhabitsType (for terms)
    // compileTermToSyncJs (for terms)
    //
    addEraSyntax( "deductive", "istype" );
    addEraSyntax( "deductive", "describes" );
    // TODO: Come up with a shorter name than "variableReference".
    addBuiltinSyntax(
        [ "subkey", [ "everyone" ],
            [ "sym", "era_deductive_stx_variableReference" ] ],
        null );
    addEasyType( "deductive", "tfa",
        [ str( "arg" ), "argType", sub( "resultType", "arg" ) ] );
    addEasyTerm( "deductive", "tfn",
        [ str( "arg" ), "argType", sub( "result", "arg" ) ] );
    addTerm( "deductive", "tcall", [
        str( "argName" ), "argType", sub( "resultType", "argName" ),
        "fn", "argVal"
    ] );
    addEasyType( "deductive", "ttfa",
        [ str( "arg" ), sub( "resultType", "arg" ) ] );
    addEasyTerm( "deductive", "ttfn",
        [ str( "arg" ), sub( "result", "arg" ) ] );
    addTerm( "deductive", "ttcall", [
        str( "argName" ), sub( "resultType", "argName" ),
        "fn", "argVal"
    ] );
    addEasyType( "deductive", "sfa",
        [ str( "arg" ), "argType", sub( "resultType", "arg" ) ] );
    addTerm( "deductive", "sfn", [
        str( "arg" ), "argType", "argVal", sub( "resultVal", "arg" )
    ] );
    addTerm( "deductive", "fst", [
        str( "argName" ), "argType", sub( "resultType", "argName" ),
        "fn"
    ] );
    addTerm( "deductive", "snd", [
        str( "argName" ), "argType", sub( "resultType", "argName" ),
        "fn"
    ] );
    addEraSyntax( "active", "can" );
    addEraSyntax( "localCollaboration", "secret" );
    addEraSyntax( "localCollaboration", "public" );
    addEraSyntax( "localCollaboration", "withsecret" );
    addEraSyntax( "localCollaboration", "everyone" );
    addEraSyntax( "localCollaboration", "subkey" );
    addEraSyntax( "localCollaboration", "sym" );
    // TODO: Come up with a shorter name than
    // "localCollaborativeValueLevelDefinition".
    addEraSyntax( "localCollaborativeValueLevelDefinition",
        "define" );
    addEraSyntax( "localCollaborativeValueLevelDefinition",
        "witheach" );
    // TODO: Come up with a better name than "partiality".
    addEasyType( "partiality", "partialtype", [ "innerType" ] );
    addEasyTerm( "partiality", "zunitpartial",
        [ "terminationType", "result" ] );
    addEasyTerm( "partiality", "zbindpartial",
        [ "aType", "bType", "thunkA", "aToThunkB" ] );
    addEasyTerm( "partiality", "zfixpartial",
        [ "terminationType", "thunkToThunk" ] );
    addEraVal( "partiality", "unitpartial",
        [ "ttfa", "a", [ "tfa", "_", "a", [ "partialtype", "a" ] ] ],
        [ "ttfn", "a",
            [ "tfn", "result", "a",
                [ "zunitpartial", "a", "result" ] ] ] );
    addEraVal( "partiality", "bindpartial",
        [ "ttfa", "a",
            [ "ttfa", "b",
                [ "tfa", "_", [ "partialtype", "a" ],
                    [ "tfa", "_",
                        [ "tfa", "_", "a", [ "partialtype", "b" ] ],
                        [ "partialtype", "b" ] ] ] ] ],
        [ "ttfn", "a",
            [ "ttfn", "b",
                [ "tfn", "thunkA", [ "partialtype", "a" ],
                    [ "tfn", "aToThunkB",
                        [ "tfa", "_", "a", [ "partialtype", "b" ] ],
                        [ "zbindpartial", "a", "b",
                            "thunkA", "aToThunkB" ] ] ] ] ] );
    addEraVal( "partiality", "fixpartial",
        [ "ttfa", "a",
            [ "tfa", "_",
                [ "tfa", "_", [ "partialtype", "a" ],
                    [ "partialtype", "a" ] ],
                [ "partialtype", "a" ] ] ],
        [ "ttfn", "a",
            [ "tfn", "thunkToThunk",
                [ "tfa", "_", [ "partialtype", "a" ],
                    [ "partialtype", "a" ] ],
                [ "zfixpartial", "a", "thunkToThunk" ] ] ] );
    // TODO: Come up with a shorter name than
    // "imperativePartialComputation".
    addEasyType( "imperativePartialComputation", "impartialtype", [
        str( "cmd" ), "commandType", sub( "responseType", "cmd" ),
        "terminationType"
    ] );
    addEasyTerm( "imperativePartialComputation", "unitimpartial", [
        str( "cmd" ), "commandType", sub( "responseType", "cmd" ),
        "result"
    ] );
    addEasyTerm( "imperativePartialComputation", "invkimpartial", [
        str( "cmd" ), "commandType", sub( "responseType", "cmd" ),
        "terminationType", "pairOfCommandAndCallback"
    ] );
    // TODO: Come up with a shorter name than
    // "staticallyGeneratedDynamicToken".
    addEasyType( "staticallyGeneratedDynamicToken", "tokentype", [] );
    addEraSyntax( "staticallyGeneratedDynamicToken", "withtoken" );
    addTerm( "staticallyGeneratedDynamicToken", "ztokenequals",
        [ "a", "b" ] );
    addEraVal( "staticallyGeneratedDynamicToken", "tokenequals",
        [ "tfa", "_", [ "tokentype" ],
            [ "tfa", "_", [ "tokentype" ],
                [ "ttfa", "a",
                    [ "tfa", "_", "a",
                        [ "tfa", "_", "a", "a" ] ] ] ] ],
        [ "tfn", "a", [ "tokentype" ],
            [ "tfn", "b", [ "tokentype" ],
                [ "ztokenequals", "a", "b" ] ] ] );
    // TODO: Come up with a better name than "kitchenSinkUnType".
    addEasyType( "kitchenSinkUnType", "sink", [] );
    addSinkTag( "token", [ "tokentype" ] );
    addSinkTag( "pfn",
        [ "tfa", "_", [ "sink" ], [ "partialtype", [ "sink" ] ] ] );
    addSinkTag( "ipfn",
        [ "tfa", "_", [ "sink" ],
            [ "partialtype",
                [ "impartialtype", "_", [ "sink" ], [ "sink" ],
                    [ "sink" ] ] ] ] );
})();


// NOTE: The "wf" stands for "well-formed."
function isWfUserKnowledge( term ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    var em;
    if ( em = getMatch( term,
        [ lit( "istype" ), "purportedType" ] ) ) {
        
        return isWfTerm( em.val.get( "purportedType" ) );
        
    } else if ( em = getMatch( term,
        [ lit( "describes" ), "type", "purportedInhabitant" ] ) ) {
        
        return isWfTerm( em.val.get( "type" ) ) &&
            isWfTerm( em.val.get( "purportedInhabitant" ) );
        
    } else if ( em = getMatch( term, [ lit( "can" ), "action" ] ) ) {
        return isWfUserAction( em.val.get( "action" ) );
    } else if ( em = getMatch( term, [ lit( "public" ), "key" ] ) ) {
        return isWfKey( em.val.get( "key" ) );
    } else if ( em = getMatch( term, [ lit( "secret" ), "key" ] ) ) {
        return isWfKey( em.val.get( "key" ) );
    } else {
        // TODO: Handle more language fragments.
        return false;
    }
}

function checkUserKnowledge( keyring, expr ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    function eget( k ) {
        return { env: expr.env, term: em.val.get( k ) };
    }
    
    var em;
    if ( em = getMatch( expr.term,
        [ lit( "istype" ), "purportedType" ] ) ) {
        
        return checkIsType( eget( "purportedType" ) );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "describes" ), "type", "purportedInhabitant" ] ) ) {
        
        // TODO: See if we should really be checking checkIsType()
        // here, or if there's another place for this kind of
        // checking.
        return checkIsType( eget( "type" ) ) && checkInhabitsType(
            eget( "purportedInhabitant" ), eget( "type" ) );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "can" ), "action" ] ) ) {
        
        return checkUserAction( keyring, eget( "action" ) );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "public" ), "key" ] ) ) {
        
        return true;
        
    } else if ( em = getMatch( expr.term,
        [ lit( "secret" ), "key" ] ) ) {
        
        return checkKey( keyring, em.val.get( "key" ) );
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

// NOTE: The "wf" stands for "well-formed."
function isWfExternallyVisibleWord( term ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    var em;
    if ( em = getMatch( term, [ lit( "sym" ), str( "word" ) ] ) ) {
        return true;
    } else {
        // TODO: Handle more language fragments.
        return false;
    }
}

// NOTE: The "wf" stands for "well-formed."
function isWfKey( term ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    var em;
    if ( em = getMatch( term, [ lit( "everyone" ) ] ) ) {
        return true;
        
    } else if ( em = getMatch( term,
        [ lit( "subkey" ), "parent", "subname" ] ) ) {
        
        return isWfKey( em.val.get( "parent" ) ) &&
            isWfExternallyVisibleWord( em.val.get( "subname" ) );
    } else {
        // TODO: Handle more language fragments.
        return false;
    }
}

// Convert a public key to a JavaScript string for comparing equality.
// TODO: Write unit tests for this.
function stringifyKey( term ) {
    return JSON.stringify( term );
}

function checkKey( keyring, term ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    var em;
    if ( em = getMatch( term, [ lit( "everyone" ) ] ) ) {
        return true;
        
    } else if ( em = getMatch( term,
        [ lit( "subkey" ), "parent", "subname" ] ) ) {
        
        return checkKey( keyring, em.val.get( "parent" ) );
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

// NOTE: The "wf" stands for "well-formed."
function isWfUserAction( term ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    var em;
    if ( em = getMatch( term,
        [ lit( "withsecret" ), str( "var" ), "key", "action" ] ) ) {
        
        return isWfKey( em.val.get( "key" ) ) &&
            isWfUserAction( em.val.get( "action" ) );
        
    } else if ( em = getMatch( term, [ lit( "define" ),
        "myPrivKey", "yourPubKey", "type", "expr" ] ) ) {
        
        // TODO: While `myPrivKey` is a term, it also can't be
        // anything but a variable reference. See if we should check
        // that here or just leave it to checkUserAction().
        return isWfTerm( em.val.get( "myPrivKey" ) ) &&
            isWfKey( em.val.get( "yourPubKey" ) ) &&
            isWfTerm( em.val.get( "type" ) ) &&
            isWfTerm( em.val.get( "expr" ) );
        
    } else if ( em = getMatch( term, [ lit( "witheach" ),
        str( "var" ), "yourPubKey", "myPrivKey", "type",
        "action" ] ) ) {
        
        // TODO: While `myPrivKey` is a term, it also can't be
        // anything but a variable reference. See if we should check
        // that here or just leave it to checkUserAction().
        return isWfKey( em.val.get( "yourPubKey" ) ) &&
            isWfTerm( em.val.get( "myPrivKey" ) ) &&
            isWfTerm( em.val.get( "type" ) ) &&
            isWfUserAction( em.val.get( "action" ) );
        
    } else if ( em = getMatch( term, [ lit( "withtoken" ),
        str( "var" ), "privKey", "action" ] ) ) {
        
        // TODO: While `privKey` is a term, it also can't be anything
        // but a variable reference. See if we should check that here
        // or just leave it to checkUserAction().
        return isWfTerm( em.val.get( "privKey" ) ) &&
            isWfUserAction( em.val.get( "action" ) );
        
    } else {
        // TODO: Handle more language fragments.
        return false;
    }
}

function checkUserAction( keyring, expr ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    function eget( k ) {
        return { env: expr.env, term: em.val.get( k ) };
    }
    
    function checkPrivKey( k ) {
        var term = em.val.get( k );
        return (true
            && isPrimString( term )
            && expr.env.has( term )
            && expr.env.get( term ).knownIsPrivateKey !== null
            && expr.env.get( term ).knownIsPrivateKey.val
        );
    }
    
    var em;
    if ( em = getMatch( expr.term,
        [ lit( "withsecret" ), str( "var" ), "key", "action" ] ) ) {
        
        return checkKey( keyring, em.val.get( "key" ) ) &&
            checkUserAction( keyring, {
                env: envWith( expr.env, em.val.get( "var" ), {
                    knownIsPrivateKey: { val: true }
                } ),
                term: em.val.get( "action" )
            } );
        
    } else if ( em = getMatch( expr.term, [ lit( "define" ),
        "myPrivKey", "yourPubKey", "type", "expr" ] ) ) {
        
        return (true
            && checkPrivKey( "myPrivKey" )
            // TODO: See if we should write a global checkPublicKey()
            // function. For the moment, it would always return true,
            // so we just call isWfKey().
            && isWfKey( em.val.get( "yourPubKey" ) )
            && checkIsType( eget( "type" ) )
            && checkInhabitsType( eget( "expr" ), eget( "type" ) )
        );
        
    } else if ( em = getMatch( expr.term, [ lit( "witheach" ),
        str( "var" ), "yourPubKey", "myPrivKey", "type",
        "action" ] ) ) {
        
        return (true
            // TODO: See if we should write a global checkPublicKey()
            // function. For the moment, it would always return true,
            // so we just call isWfKey().
            && isWfKey( em.val.get( "yourPubKey" ) )
            && checkPrivKey( "myPrivKey" )
            && checkIsType( eget( "type" ) )
            && checkUserAction( keyring, {
                env: envWith( expr.env, em.val.get( "var" ), {
                    knownType: { val: betaReduce( eget( "type" ) ) }
                } ),
                term: em.val.get( "action" )
            } )
        );
        
    } else if ( em = getMatch( expr.term, [ lit( "withtoken" ),
        str( "var" ), "privKey", "action" ] ) ) {
        
        return (true
            && checkPrivKey( "privKey" )
            && checkUserAction( keyring, {
                env: envWith( expr.env, em.val.get( "var" ), {
                    knownType: { val:
                        { env: strMap(), term: [ "tokentype" ] } }
                    // TODO: Figure out if we should put a knownVal or
                    // knownTokenStringifiedKey in here so we can
                    // beta-reduce code that compares tokens.
                } ),
                term: em.val.get( "action" )
            } )
        );
        
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}
