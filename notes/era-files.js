// era-files.js
// Copyright 2013 Ross Angle. Released under the MIT License.
"use strict";


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


// <signed-bundle> ::= (era-v1 signed-bundle <signed-bundle-decl>*)
// <signable-bundle> ::=
//   (era-v1 signable-bundle <signable-bundle-decl>*)
// <signable-action> ::=
//   (era-v1 signable-action <signable-action-decl>* <act-expr>)
// <signed-bundle-decl> ::= <bundle-decl>
// <signed-bundle-decl> ::= (def-signature-given <sym> <sym> <sym>)
// <signable-bundle-decl> ::= <bundle-decl>
// <signable-bundle-decl> ::= <signature-needed-decl>
// <bundle-decl> ::= <def-decl>
// <bundle-decl> ::= (sign <sym> <sym>)
// <bundle-decl> ::= (def-action <sym> <def-action-decl>* <act-expr>)
// <def-action-decl> ::= (use <sym>*)
// <def-action-decl> ::= <parse-decl>
// <signable-action-decl> ::= <def-decl>
// <signable-action-decl> ::= <signature-needed-decl>
// <signable-action-decl> ::= <parse-decl>
// <parse-decl> ::= (parse <sym> <sym> <parse-arg>*)
// <parse-arg> ::= <sym>
// <parse-arg> ::= (<sym>*)
// <signature-needed-decl> ::= (def-signature-needed <sym> <sym>)
// <def-decl> ::= (def-bytes <sym> <bytes>)
// <def-decl> ::= (def-ints-mod-110000 <sym> <ints-mod-110000>)
// <def-decl> ::= (def-pubkey-everyone <sym>)
// <def-decl> ::= (def-pubkey-derived <sym> <sym> <sym>)
// <act-expr> ::= // any symbol
// <act-expr> ::= (<sym> <act-expr>*)
// <sym> ::= // a symbol matching regex /[a-z][-a-z01-9]*/
// <bytes> ::=
//   // a symbol matching regex /hex\[(?:[01-9a-fA-F]{2}|[\r\n ])*\]/
// <bytes> ::= // a symbol of the form base64[...] with base64 inside
// <ints-mod-110000> ::=
//   // "str[" <char>* "]" where <char>* contains balanced square
//   // brackets
// <char> ::= "\("  // escape sequence for [
// <char> ::= "\)"  // escape sequence for ]
// <char> ::= "\-"  // escape sequence for \
// <char> ::= "\s"  // escape sequence for space
// <char> ::= "\t"  // escape sequence for tab
// <char> ::= "\r"  // escape sequence for carriage return
// <char> ::= "\n"  // escape sequence for newline
// <char> ::= "\x[" <hexdigit>+ "]"
//   // escape sequence for any value from 0 to 10FFFF, inclusive
// <char> ::=
//   // any printable ASCII character (0x20-0x7E) except backslash
// <hexdigit> ::= // any character matching regex [01-9a-fA-F]

function fileIsPurportedlySignedBundle( expr ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var getMatch = patternLang.getMatch;
    
    if ( getMatch( expr.slice( 0, 2 ),
        [ lit( "era-v1" ), lit( "signed-bundle" ) ] ) ) {
        
        var signedBundleDecls = expr.slice( 2 );
        
        for ( var i = 0, n = signedBundleDecls.length; i < n; i++ ) {
            var decl = signedBundleDecls[ i ];
            var dm;
            if ( dm = getMatch( decl,
                [ lit( "def-bytes" ),
                    str( "var" ), str( "bytes" ) ] ) ) {
                
                var bytes = dm.val.get( "bytes" );
                
                if ( /hex\[(?:[01-9a-fA-F]{2}|[\r\n ])*\]/.test(
                    bytes ) {
                    
                    // Do nothing.
                    
                } else if ( /base64\[[a-zA-Z01-9+\/]*=?=?\]/.test(
                    bytes ) ) {
                    
                    // Do nothing.
                } else {
                    // TODO: Handle more file format features.
                    return false;
                }
            } else {
                // TODO: Handle more file format features.
                return false;
            }
        }
    } else {
        // TODO: Handle more file format features.
        return false;
    }
}
