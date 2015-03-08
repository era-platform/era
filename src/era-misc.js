// era-misc.js
// Copyright 2013-2015 Ross Angle. Released under the MIT License.
"use strict";


// TODO: Decide whether to introduce a dependency on Lathe.js just for
// these utilities.
function defer( body ) {
    setTimeout( function () {
        body();
    }, 0 );
}
// NOTE: This body takes its args as ( v, k ).
function arrEach( arr, func ) {
    for ( var i = 0, n = arr.length; i < n; i++ )
        func( arr[ i ], i );
}
// NOTE: This body takes its args as ( v, k ).
function arrAll( arr, func ) {
    for ( var i = 0, n = arr.length; i < n; i++ ) {
        var result = func( arr[ i ], i );
        if ( !result )
            return result;
        result = null;
    }
}
// NOTE: This body takes its args as ( v, k ).
function arrMap( arr, func ) {
    var result = [];
    for ( var i = 0, n = arr.length; i < n; i++ )
        result.push( func( arr[ i ], i ) );
    return result;
}
// NOTE: This body takes its args as ( v, k ).
function arrMappend( arr, func ) {
    var result = [];
    for ( var i = 0, n = arr.length; i < n; i++ ) {
        var entries = func( arr[ i ], i );
        for ( var j = 0, m = entries.length; j < m; j++ )
            result.push( entries[ j ] );
    }
    return result;
}
// NOTE: This body takes its args as ( v, k ).
function arrKeep( arr, func ) {
    return arrMappend( arr, function ( v, k ) {
        return func( v, k ) ? [ v ] : [];
    } );
}
function hasOwn( obj, k ) {
    return {}.hasOwnProperty.call( obj, k );
}
// NOTE: This body takes its args as ( v, k ).
function objOwnAny( obj, body ) {
    for ( var k in obj )
        if ( hasOwn( obj, k ) ) {
            var result = body( obj[ k ], k );
            if ( result )
                return result;
        }
    return false;
}
// NOTE: This body takes its args as ( k, v ).
function objOwnEach( obj, body ) {
    objOwnAny( obj, function ( v, k ) {
        body( k, v );
        return false;
    } );
}
// NOTE: This body takes its args as ( k, v ).
function objOwnMap( obj, body ) {
    var result = {};
    objOwnEach( obj, function ( k, v ) {
        result[ k ] = body( k, v );
    } );
    return result;
}
function objPlus( var_args ) {
    var result = {};
    for ( var i = 0, n = arguments.length; i < n; i++ )
        objOwnEach( arguments[ i ], function ( k, v ) {
            result[ k ] = v;
        } );
    return result;
}
function isArray( x ) {
    return {}.toString.call( x ) === "[object Array]";
}
function isPrimString( x ) {
    return typeof x === "string";
}
if ( Object.getPrototypeOf )
    var likeObjectLiteral = function ( x ) {
        if ( x === null ||
            {}.toString.call( x ) !== "[object Object]" )
            return false;
        var p = Object.getPrototypeOf( x );
        return p !== null && typeof p === "object" &&
            Object.getPrototypeOf( p ) === null;
    };
else if ( {}.__proto__ !== void 0 )
    var likeObjectLiteral = function ( x ) {
        if ( x === null ||
            {}.toString.call( x ) !== "[object Object]" )
            return false;
        var p = x.__proto__;
        return p !== null && typeof p === "object" &&
            p.__proto__ === null;
    };
else
    var likeObjectLiteral = function ( x ) {
        return x !== null &&
            {}.toString.call( x ) === "[object Object]" &&
            x.constructor === {}.constructor;
    };
function sameTwo( a, b ) {
    return (a === 0 && b === 0) ? 1 / a === 1 / b :  // 0 and -0
        a !== a ? b !== b :  // NaN
        a === b;
}
function jsStr( string ) {
    // NOTE: Unlike JSON.stringify(), this will limit its output to
    // ASCII characters, and it will be a valid JavaScript string
    // (whereas a JSON string can contain U+2028 LINE SEPARATOR and
    // U+2029 PARAGRAPH SEPARATOR).
    return "\"" + arrMap( string.split( /\\/ ), function ( part ) {
        return part.replace( /\"/g, "\\\"" ).replace( /\n/g, "\\n" ).
            replace( /\r/g, "\\r" ).replace( /\t/g, "\\t" ).
            replace( /\x08/g, "\\b" ).replace( /\f/g, "\\f" ).
            replace( /\0/g, "\\0" ).replace( /\v/g, "\\v" ).
            replace( /[^\u0020-\u008F]/g, function ( cha ) {
                var code =
                    cha.charCodeAt( 0 ).toString( 16 ).toUpperCase();
                return "\\u" +
                    ("0000" + code).substring( 4 - code.length );
            } );
    } ).join( "\\\\" ) + "\"";
}

// TODO: Put utilities like these in lathe.js.
function getUnicodeCodePointAtCodeUnitIndex( string, codeUnitIndex ) {
    function inRange( min, pastMax ) {
        return function ( n ) {
            return min <= n && n < pastMax;
        };
    }
    var isHead = inRange( 0xD800, 0xDC00 );
    var isTrail = inRange( 0xDC00, 0xE000 );
    var replacement = {
        isReplaced: true,
        codePoint: 0xFFFD,
        charString: "\uFFFD"
    };
    function getCodeUnit( codeUnitIndex ) {
        if ( string.length < codeUnitIndex )
            return null;
        return {
            codeUnit: string.charCodeAt( codeUnitIndex ),
            charString: string.charAt( codeUnitIndex )
        };
    }
    var first = getCodeUnit( codeUnitIndex );
    if ( first === null )
        throw new Error();
    if ( isHead( first.codeUnit ) ) {
        var second = getCodeUnit( codeUnitIndex + 1 );
        if ( second === null ) {
            return replacement;
        } else if ( isHead( second.codeUnit ) ) {
            return replacement;
        } else if ( isTrail( second.codeUnit ) ) {
            return {
                isReplaced: false,
                codePoint: 0x10000 +
                    ((first.codeUnit - 0xD800) << 10) +
                    (second.codeUnit - 0xDC00),
                charString: first.charString + second.charString
            };
        } else {
            return replacement;
        }
    } else if ( isTrail( first.codeUnit ) ) {
        return replacement;
    } else {
        return {
            isReplaced: false,
            codePoint: first.codeUnit,
            charString: first.charString
        };
    }
}
function anyUnicodeCodePoint( string, func ) {
    for ( var i = 0, n = string.length; i < n; ) {
        var codePointInfo =
            getUnicodeCodePointAtCodeUnitIndex( string, i );
        var result = func( codePointInfo );
        if ( result )
            return result;
        i += codePointInfo.charString.length;
    }
    return false;
}
function eachUnicodeCodePoint( string, func ) {
    anyUnicodeCodePoint( string, function ( codePointInfo ) {
        func( codePointInfo );
        return false;
    } );
}
function isValidUnicode( string ) {
    return !anyUnicodeCodePoint( string, function ( codePointInfo ) {
        return codePointInfo.isReplaced;
    } );
}
function unicodeCodePointToString( codePoint ) {
    function inRange( min, pastMax ) {
        return function ( n ) {
            return min <= n && n < pastMax;
        };
    }
    var isHead = inRange( 0xD800, 0xDC00 );
    var isTrail = inRange( 0xDC00, 0xE000 );
    if ( !(0 <= codePoint && codePoint < 0x110000
        && !isHead( codePoint ) && !isTrail( codePoint )) )
        return null;
    if ( codePoint < 0x10000 )
        return String.fromCharCode( codePoint );
    return String.fromCharCode(
        0xD800 + ((codePoint - 0x10000) >>> 10),
        0xE000 + ((codePoint - 0x10000) & 0x3FF)
    );
}

// TODO: Come up with something better than this.
var naiveIsoCases = [];
function naiveIso( a, b ) {
    for ( var i = 0, n = naiveIsoCases.length; i < n; i++ ) {
        var result = naiveIsoCases[ i ]( naiveIso, a, b );
        if ( result !== null )
            return result;
    }
    return null;
}
naiveIsoCases.push( function ( recur, a, b ) {
    return sameTwo( a, b ) ? true : null;
} );
naiveIsoCases.push( function ( recur, a, b ) {
    return (isPrimString( a ) || isPrimString( b )) ? a === b : null;
} );
naiveIsoCases.push( function ( recur, a, b ) {
    if ( !(isArray( a ) && isArray( b )) )
        return (isArray( a ) || isArray( b )) ? false : null;
    var n = a.length;
    if ( n !== b.length )
        return false;
    for ( var i = 0; i < n; i++ ) {
        var subresult = recur( a[ i ], b[ i ] );
        if ( subresult !== true )
            return subresult;
    }
    return true;
} );
naiveIsoCases.push( function ( recur, a, b ) {
    if ( !(likeObjectLiteral( a ) && likeObjectLiteral( b )) )
        return (likeObjectLiteral( a ) || likeObjectLiteral( b )) ?
            false : null;
    if ( objOwnAny( a, function ( v, k ) {
        return !hasOwn( b, k );
    } ) || objOwnAny( b, function ( v, k ) {
        return !hasOwn( a, k );
    } ) )
        return false;
    var result = objOwnAny( a, function ( v, k ) {
        var subresult = recur( v, b[ k ] );
        if ( subresult !== true )
            return { val: subresult };
    } );
    return result ? result.val : true;
} );
naiveIsoCases.push( function ( recur, a, b ) {
    if ( !((a instanceof StrMap) && (b instanceof StrMap)) )
        return ((a instanceof StrMap) || (b instanceof StrMap)) ?
            false : null;
    if ( a.any( function ( v, k ) {
        return !b.has( k );
    } ) || b.any( function ( v, k ) {
        return !a.has( k );
    } ) )
        return false;
    var result = a.any( function ( v, k ) {
        var subresult = recur( v, b.get( k ) );
        if ( subresult !== true )
            return { val: subresult };
    } );
    return result ? result.val : true;
} );


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

// TODO: Test all of this. The tests in test-bigint.js are a good
// start, but they're not very thorough. They don't even test negative
// numbers, for instance.
// TODO: Expose all of this to Penknife.
function BigInt() {}
BigInt.prototype.init_ = function ( sign, digits16Bit ) {
    this.sign_ = sign;
    this.digits_ = digits16Bit;
    return this;
};
BigInt.prototype.copy = function () {
    return new BigInt().init_( this.sign_, this.digits_.slice() );
};
BigInt.prototype.normalize_ = function () {
    var ds = this.digits_;
    for ( var i = ds.length - 1; 0 <= i; i-- ) {
        if ( ds[ i ] !== 0 )
            break;
        ds.pop();
    }
    if ( ds.length === 0 )
        this.sign_ = 1;
    return this;
};
BigInt.prototype.compareAbsTo = function ( other ) {
    var a = this.digits_;
    var b = other.digits_;
    var an = a.length;
    var bn = b.length;
    if ( an < bn )
        return -1;
    if ( bn < an )
        return 1;
    var len = an;
    for ( var i = len - 1; 0 <= i; i-- ) {
        var aDigit = a[ i ];
        var bDigit = b[ i ];
        if ( aDigit < bDigit )
            return -1;
        if ( bDigit < aDigit )
            return 1;
    }
    return 0;
};
BigInt.prototype.compareTo = function ( other ) {
    var as = this.sign_;
    var bs = other.sign_;
    if ( as < bs )
        return -1;
    if ( bs < as )
        return 1;
    var sign = as;
    return sign * this.compareAbsTo( other );
};
BigInt.prototype.zapPlus = function ( other ) {
    var a = this.digits_;
    var b = other.digits_;
    var an = a.length;
    var bn = b.length;
    if ( this.sign_ === other.sign_ ) {
        // NOTE: The possible values of `carry` are 0 and 1.
        var carry = 0;
        var i = 0;
        for ( ; i < bn; i++ ) {
            // NOTE: Even though we change the length of `a` here, we
            // don't need to update `an`.
            if ( an <= i )
                a.push( 0 );
            var digitSum = a[ i ] + b[ i ] + carry;
            a[ i ] = digitSum & 0xFFFF;
            carry = digitSum >>> 16;
        }
        for ( ; i < an; i++ ) {
            if ( carry === 0 )
                break;
            var digitSum = a[ i ] + carry;
            a[ i ] = digitSum & 0xFFFF;
            carry = digitSum >>> 16;
        }
        if ( carry !== 0 )
            a.push( 1 );
    } else {
        // NOTE: The possible values of `carry` are -1 and 0.
        var carry = 0;
        var i = 0;
        for ( ; i < bn; i++ ) {
            // NOTE: Even though we change the length of `a` here, we
            // don't need to update `an`.
            if ( an <= i )
                a.push( 0 );
            var digitSum = a[ i ] + 0x10000 - b[ i ] + carry;
            a[ i ] = digitSum & 0xFFFF;
            carry = (digitSum >>> 16) - 1;
        }
        for ( ; i < an; i++ ) {
            if ( carry === 0 )
                break;
            var digitSum = a[ i ] + 0x10000 + carry;
            a[ i ] = digitSum & 0xFFFF;
            carry = (digitSum >>> 16) - 1;
        }
        if ( carry === -1 ) {
            this.sign_ *= -1;
            for ( var i = 0, n = a.length; i < n; i++ )
                a[ i ] = ~a[ i ] & 0xFFFF;
            this.zapPlus( new BigInt().init_( -1, [ 1 ] ) );
        }
    }
    return this.normalize_();
};
BigInt.prototype.zapShiftLeft = function ( jsNumBits ) {
    if ( this.sign_ !== 1 )
        throw new Error();
    var remainder = jsNumBits % 16;
    var quotient = (jsNumBits - remainder) / 16;
    var a = this.digits_;
    if ( remainder !== 0 ) {
        var carry = 0x0000;
        for ( var i = 0, n = a.length; i < n; i++ ) {
            var shifted = a[ i ] << remainder;
            a[ i ] = (shifted & 0xFFFF) + carry;
            carry = shifted >>> 16;
        }
        if ( carry !== 0 )
            a.push( carry );
    }
    if ( a.length !== 0 )
        for ( var i = 0; i < quotient; i++ )
            a.unshift( 0 );
    return this;
};
BigInt.prototype.zapShiftRightWithRemainder = function ( jsNumBits ) {
    if ( this.sign_ !== 1 )
        throw new Error();
    var remainder = jsNumBits % 16;
    var quotient = (jsNumBits - remainder) / 16;
    var r = [];
    for ( var i = 0; i < quotient; i++ )
        r.push( this.digits_.shift() );
    this.zapShiftLeft( 16 - remainder );
    r.push( this.digits_.shift() >> (16 - remainder) );
    return { quotient: this,
        remainder: new BigInt().init_( 1, r ).normalize_() };
};
// TODO: Remove either zapTimes() or times(), depending on which one
// is more efficient.
BigInt.prototype.zapTimes = function ( other ) {
    // TODO: See if this can be more efficient.
    var finalSign = this.sign_ * other.sign_;
    this.sign_ = 1;
    var aBig = this.copy();
    this.digits_ = [];
    var b = other.digits_;
    for ( var i = 0, n = b.length; i < n; i++ ) {
        var bDigit = b[ i ];
        for ( var j = 0; bDigit !== 0; bDigit >>= 1, j++ )
            if ( (bDigit & 1) === 1 )
                this.zapPlus( aBig.copy().zapShiftLeft( j ) );
        aBig.zapShiftLeft( 16 );
    }
    this.sign_ = finalSign;
    return this;
};
BigInt.prototype.times = function ( other ) {
    // TODO: See if this can be more efficient.
    var a = this.digits_;
    var b = other.digits_;
    var an = a.length;
    var bn = b.length;
    var anm1 = an - 1;
    var bnm1 = bn - 1;
    var resultPlacesToCalculate = an + bn - 1;
    var result = new BigInt().init_( 1, [] );
    for ( var resultPlaceLeftToRight = 0;
        resultPlaceLeftToRight < resultPlacesToCalculate;
        resultPlaceLeftToRight++ ) {
        
        result.zapShiftLeft( 16 );
        
        for (
            var aPlace = anm1 - resultPlaceLeftToRight, bPlace = bnm1;
            aPlace < an; aPlace++, bPlace-- ) {
            
            if ( aPlace < 0 || bPlace < 0 )
                continue;
            var digitProduct = a[ aPlace ] * b[ bPlace ];
            result.zapPlus( new BigInt().init_( 1, [
                digitProduct & 0xFFFF,
                digitProduct >>> 16
            ] ).normalize_() );
        }
    }
    if ( this.sign_ !== other.sign_ )
        result.zapNeg();
    return result;
};
BigInt.prototype.zapAbs = function () {
    this.sign_ = 1;
    return this;
};
BigInt.prototype.zapNeg = function () {
    if ( this.digits_.length !== 0 )
        this.sign_ = -this.sign_;
    return this;
};
BigInt.prototype.dividedByTowardZeroWithRemainder =
    function ( other ) {
    
    // TODO: See if this can be more efficient.
    if ( other.digits_.length === 0 )
        throw new Error();
    var quotient = new BigInt().init_( 1, [] );
    var remainder = this.copy().zapAbs();
    var bAbs = other.copy().zapAbs();
    var b = bAbs.digits_;
    var bn = b.length;
    var bLast = b[ bn - 1 ];
    var bLastPlusOne = bLast + 1;
    while ( bAbs.compareTo( remainder ) <= 0 ) {
        var r = remainder.digits_;
        var rn = r.length;
        var digitDisparity = rn - bn;
        var rLast = r[ rn - 1 ];
        if ( rLast < bLast ) {
            // NOTE: We're multiplying instead of shifting so that the
            // result will always be positive.
            rLast = (rLast * 0x10000) + r[ rn - 2 ];
            digitDisparity--;
        }
        var quotientAtThisDisparity = ~~(rLast / bLastPlusOne);
        if ( quotientAtThisDisparity === 0 ) {
            quotientAtThisDisparity = 1;
            for ( var i = bn - 2; 0 <= i; i-- ) {
                if ( b[ i ] !== r[ i + digitDisparity ] ) {
                    quotientAtThisDisparity = 0;
                    break;
                }
            }
        }
        if ( quotientAtThisDisparity === 0 ) {
            remainder.zapPlus(
                bAbs.copy().
                    zapShiftLeft( 16 * digitDisparity - 1 ).
                    zapNeg() );
            quotient.zapPlus(
                new BigInt().init_( 1, [ 1 ] ).
                    zapShiftLeft( 16 * digitDisparity - 1 ) );
        } else {
            // TODO: Where this uses zapTimes(), see if times() would
            // be more efficient.
            remainder.zapPlus(
                new BigInt().init_( 1, [ quotientAtThisDisparity ] ).
                    zapTimes( bAbs ).
                    zapShiftLeft( 16 * digitDisparity ).
                    zapNeg() );
            quotient.zapPlus(
                new BigInt().init_( 1, [ quotientAtThisDisparity ] ).
                    zapShiftLeft( 16 * digitDisparity ) );
        }
    }
    
    // NOTE: These examples may clarify the following negations.
    //
    // 9 / 2 = 4 R 1
    // 9 / -2 = -4 R 1
    // -9 / 2 = -4 R -1
    // -9 / -2 = 4 R -1
    //
    // Intuitively, the product of the quotient and the divisor must
    // have the same sign as the dividend (since it must approximate
    // the dividend), but it will always have equal or lesser
    // magnitude. Thus the remainder must have the same sign as the
    // dividend to add to this magnitude.
    //
    if ( this.sign_ !== other.sign_ )
        quotient.zapNeg();
    if ( this.sign_ === -1 )
        remainder.zapNeg();
    
    return { quotient: quotient, remainder: remainder };
};
BigInt.prototype.toStringInRadix = function ( base ) {
    if ( !(2 <= base && base <= 16) )
        throw new Error();
    var alphabet = "0123456789ABCDEF".split( "" ).slice( 0, base );
    var bigBase = new BigInt().init_( 1, [ base ] );
    var result = "";
    var digitsLeft = this.copy().zapAbs();
    while ( digitsLeft.digits_.length !== 0 ) {
        var digitAndRest =
            digitsLeft.dividedByTowardZeroWithRemainder( bigBase );
        var digitValue = digitAndRest.remainder.digits_[ 0 ];
        if ( digitValue === void 0 )
            digitValue = 0;
        result = alphabet[ digitValue ] + result;
        digitsLeft = digitAndRest.quotient;
    }
    if ( result === "" )
        result = alphabet[ 0 ];
    else if ( this.sign_ === -1 )
        result = "-" + result;
    return result;
};
function bigIntFromStringInRadix( base, string ) {
    if ( !(2 <= base && base <= 16) )
        throw new Error();
    var alphabet = strMap();
    for ( var i = 0; i < base; i++ )
        alphabet.set( "0123456789ABCDEF".charAt( i ),
            new BigInt().init_( 1, [ i ] ).normalize_() );
    var bigBase = new BigInt().init_( 1, [ base ] );
    var i = 0, n = string.length;
    var sign = 1;
    var result = new BigInt().init_( 1, [] );
    if ( i < n && string.charAt( i ) === "-" ) {
        sign = -1;
        i++;
    }
    for ( ; i < n; i++ ) {
        var ch = string.charAt( i );
        var digitValue = alphabet.get( ch );
        if ( digitValue === void 0 )
            throw new Error();
        // TODO: Where this uses zapTimes(), see if times() would be
        // more efficient.
        result.zapTimes( bigBase ).zapPlus( digitValue );
    }
    if ( sign === -1 )
        result.zapNeg();
    return result;
}


function runWithSyncYokeAndMaxStack( rider, maxStack, body ) {
    var initialYoke = {
        rider: rider,
        internal: 0,
        bounce: function ( then ) {
            var self = this;
            if ( self.internal < maxStack ) {
                return then( {
                    rider: self.rider,
                    internal: self.internal + 1,
                    bounce: self.bounce
                } );
            } else {
                deferred.push( function () {
                    return then( {
                        rider: self.rider,
                        internal: 0,
                        bounce: self.bounce
                    } );
                } );
                return null;
            }
        }
    };
    var deferred = [ function () {
        return body( initialYoke, function ( yoke, result ) {
            return { rider: yoke.rider, result: result };
        } );
    } ];
    var riderAndResult = null;
    while ( riderAndResult === null && deferred.length !== 0 )
        riderAndResult = deferred.shift()();
    if ( riderAndResult === null || deferred.length !== 0 )
        throw new Error();
    return riderAndResult;
}
function runSyncYoke( rider, body ) {
    // TODO: Test to see what value is best for all browsers.
    // TODO: Put this constant somewhere more configurable.
    // NOTE: Firefox 28 breaks in the reader demo if this value
    // exceeds 217. Chrome 34 can handle 1236 sometimes, but it's
    // inconsistent, and its sweet spot seems to be around 500-1000.
    // IE 11 can handle 367 sometimes, but it's inconsistent.
    var maxStack = 100;
    return runWithSyncYokeAndMaxStack( rider, maxStack, body );
}
// TODO: See if we'll ever use this.
function runDebuggableSyncYoke( rider, body ) {
    return runWithSyncYokeAndMaxStack( rider, 1 / 0, body );
}
// TODO: Rename this.
function runWaitOne( yoke, then ) {
    return yoke.bounce( then );
}


function jsListFromArr( arr ) {
    var result = null;
    for ( var i = arr.length - 1; 0 <= i; i-- )
        result = { first: arr[ i ], rest: result };
    return result;
}
function jsList( var_args ) {
    return jsListFromArr( arguments );
}

function jsListShortFoldl( yoke, init, list, func, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( list === null )
            return then( yoke, init, !"exitedEarly" );
        return func( yoke, init, list.first,
            function ( yoke, init, exitedEarly ) {
            
            if ( exitedEarly )
                return then( yoke, init, !!"exitedEarly" );
            return jsListShortFoldl( yoke,
                init, list.rest, func, then );
        } );
    } );
}
function jsListFoldl( yoke, init, list, func, then ) {
    return jsListShortFoldl( yoke, init, list,
        function ( yoke, state, elem, then ) {
        
        return func( yoke, state, elem, function ( yoke, state ) {
            return then( yoke, state, !"exitedEarly" );
        } );
    }, function ( yoke, state, exitedEarly ) {
        return then( yoke, state );
    } );
}
// NOTE: This is guaranteed to have O( n ) time complexity in the
// length of the `backwardFirst` list, JS object allocation time
// notwithstanding.
function jsListRevAppend( yoke, backwardFirst, forwardSecond, then ) {
    return jsListFoldl( yoke, forwardSecond, backwardFirst,
        function ( yoke, forwardSecond, elem, then ) {
        
        return then( yoke, { first: elem, rest: forwardSecond } );
    }, then );
}
function jsListRev( yoke, list, then ) {
    return jsListRevAppend( yoke, list, null, then );
}
function jsListAppend( yoke, a, b, then ) {
    return jsListRev( yoke, a, function ( yoke, revA ) {
        return jsListRevAppend( yoke, revA, b, then );
    } );
}
function jsListFlattenOnce( yoke, list, then ) {
    return jsListFoldl( yoke, null, list,
        function ( yoke, revResult, elem, then ) {
        
        return jsListRevAppend( yoke, elem, revResult, then );
    }, function ( yoke, revResult ) {
        return jsListRev( yoke, revResult, then );
    } );
}
function jsListMap( yoke, list, func, then ) {
    return jsListFoldl( yoke, null, list,
        function ( yoke, revPast, elem, then ) {
        
        return func( yoke, elem, function ( yoke, elem ) {
            return then( yoke, { first: elem, rest: revPast } );
        } );
    }, function ( yoke, revResult ) {
        return jsListRev( yoke, revResult, then );
    } );
}
function jsListMappend( yoke, list, func, then ) {
    return jsListMap( yoke, list, func,
        function ( yoke, resultLists ) {
        
        return jsListFlattenOnce( yoke, resultLists, then );
    } );
}
