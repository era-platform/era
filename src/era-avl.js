// era-avl.js
// Copyright 2013, 2014 Ross Angle. Released under the MIT License.
"use strict";

// The utilities in this file aren't yet used, but they represent the
// start of a more comprehensive approach to JS limit-breaking.
//
// This file provides bigint and AVL tree implementations that use a
// trampoline, taking only a small constant amount of JavaScript stack
// space (to avoid overflows) and constant time in between each
// trampoline bounce. Most such libraries abstract away the iteration
// behind a non-trampolined interface, making it impossible to suspend
// the iteration once it's begun.
//
// The only trampoline functionality used in this file is an undefined
// function called runWaitOne(). It should work with the runWaitOne()
// defined in era-penknife.js, but this file is meant to be something
// of a clean slate.
//
// These utilities, unlike the ones in era-penknife.js and
// era-penknife-to-js.js, are made paying close attention to how the
// then() callbacks might stack up, so that JavaScript stack overflow
// errors can be avoided there too. The others were supposed to avoid
// stack overflows too, and maybe they do, but this is one case I
// (Ross Angle) didn't really think about until this file.
//
// Bigints and AVL trees will be limitless substitutes for JavaScript
// numbers and JavaScript object dictionaries (up to the limit of
// memory allocation, anyway). These won't have the efficiency
// drawbacks of unary numbers and association lists.

// TODO: The above comment is a bit scattered. Edit it.


function jsListShortFoldl( yoke, init, list, func, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( list === null )
            return then( yoke, init, !"exitedEarly" );
        return func( yoke, init, list.first,
            function ( yoke, combined, exitedEarly ) {
            
            if ( exitedEarly )
                return then( yoke, init, !!"exitedEarly" );
            return jsListShortFoldl( yoke,
                combined, list.rest, func, then );
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
function jsListDoubleShortFoldl( yoke,
    init, listA, listB, func, then ) {
    
    return jsListShortFoldl( yoke,
        { state: init, restB: restB }, listA,
        function ( yoke, state, elemA, then ) {
        
        var restB = state.restB;
        if ( restB === null )
            throw new Error();
        return func( yoke, state.state, elemA, restB.first,
            function ( yoke, state, exitedEarly ) {
            
            return then( yoke,
                { state: state, restB: restB.rest }, exitedEarly );
        } );
    }, function ( yoke, state, exitedEarly ) {
        return then( yoke, state.state, exitedEarly );
    } );
}
function jsListDoubleFoldl( yoke, init, listA, listB, func, then ) {
    return jsListDoubleShortFoldl( yoke, init, listA, listB,
        function ( yoke, state, elemA, elemB, then ) {
        
        return func( yoke, state, elemA, elemB,
            function ( yoke, state ) {
            
            return then( yoke, state, !"exitedEarly" );
        } );
    }, function ( yoke, state, exitedEarly ) {
        return then( yoke, state );
    } );
}
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
function jsListDoubleAny( yoke, init, listA, listB, func, then ) {
    return jsListShortDoubleFoldl( yoke, false, listA, listB,
        function ( yoke, state, elemA, elemB, then ) {
        
        return func( yoke, elemA, elemB, function ( yoke, result ) {
            if ( result )
                return then( yoke, result, !!"exitedEarly" );
            return then( yoke, state, !"exitedEarly" );
        } );
    }, function ( yoke, state, exitedEarly ) {
        return then( yoke, state );
    } );
}
function jsListAllSync( yoke, list, func, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( list === null )
            return then( yoke, true );
        var result = func( list.first );
        if ( !result )
            return then( yoke, result );
        return jsListAllSync( yoke, list.rest, func, then );
    } );
}
function jsListCut( yoke, list, i, then ) {
    // NOTE: The value of `i` is also a list, but its elements are
    // ignored.
    return jsListFoldl( yoke, { revBefore: null, after: list }, i,
        function ( yoke, state, ignoredIElem, then ) {
        
        var after = state.after;
        // TODO: Figure out if this should really throw an error like
        // this.
        if ( after === null )
            throw new Error();
        return then( yoke, {
            revBefore: { first: after.first, rest: state.revBefore },
            after: after.rest
        } );
    }, function ( yoke, state ) {
        return jsListRev( yoke, state.revBefore,
            function ( yoke, before ) {
            
            return then( yoke, before, state.after );
        } );
    } );
}
function jsListTails( yoke, listA, listB, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( listA === null || listB === null )
            return then( yoke, listA, listB );
        return jsListTails( yoke, listA.rest, listB.rest, then );
    } );
}

var bigIntPartsPerPart = 4;
if ( bigIntPartsPerPart < 2 )
    throw new Error();
var bigIntPartsPerPartList = null;
(function () {
    for ( var i = 0; i < bigIntPartsPerPart; i++ )
        bigIntPartsPerPartList =
            { first: null, rest: bigIntPartsPerPartList };
})();

function BigIntLeaf() {}
BigIntLeaf.prototype.init_ = function ( uint16 ) {
    this.val_ = uint16;
    return this;
};
var bigIntLeafZero_ = new BigIntLeaf().init_( 0 );
BigIntLeaf.prototype.promoteSelfWithMaybeCarry_ = function ( yoke,
    carry, then ) {
    
    var self = this;
    return jsListMap( yoke, bigIntPartsPerPartList,
        function ( yoke, digit, then ) {
        
        return then( yoke, bigIntLeafZero_ );
    }, function ( yoke, digits ) {
        return makeBigIntPart_( yoke, bigIntLeafZero_,
            { first: self,
                rest: { first: carry, rest: digits.rest.rest } },
            then );
    } );
};
BigIntLeaf.prototype.maybePromoteSelfWithCarry = function ( yoke,
    carry, then ) {
    
    var self = this;
    if ( carry.isZero() )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, self );
        } );
    return self.promoteSelfWithMaybeCarry_( yoke, carry, then );
};
BigIntLeaf.prototype.maybePromoteSelfWithBooleanCarry =
    function ( yoke, carry, then ) {
    
    var self = this;
    if ( !carry )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, self );
        } );
    return self.promoteSelfWithMaybeCarry_( yoke,
        new BigIntLeaf().init( 1 ), then );
};
BigIntLeaf.prototype.promoteSelf = function ( yoke, then ) {
    return this.promoteSelfWithMaybeCarry_( yoke,
        bigIntLeafZero_, then );
};
BigIntLeaf.prototype.getDepthPlusOne = function ( yoke, then ) {
    return bigIntZero_;
};
BigIntLeaf.prototype.complement = function ( yoke, then ) {
    return new BigIntLeaf().init_( 0xFFFF ^ this.val_ );
};
BigIntLeaf.prototype.plusOne = function ( yoke, then ) {
    var result = this.val_ + 1;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, result & 0xFFFF, (result >>> 16) !== 0 );
    } );
};
BigIntLeaf.prototype.plus = function ( yoke, other, then ) {
    var result = this.val_ + other.val_;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, result & 0xFFFF, result >>> 16 );
    } );
};
BigIntLeaf.prototype.times = function ( yoke, other, then ) {
    var result = this.val_ * other.val_;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, result & 0xFFFF, result >>> 16 );
    } );
};
BigIntLeaf.prototype.isZero = function () {
    return this.val_ === 0;
};
BigIntLeaf.prototype.compareTo = function ( yoke, other, then ) {
    var result = this.val_ < other.val_ ? -1 :
        this.val_ === other.val_ ? 0 : 1;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, result );
    } );
};
BigIntLeaf.prototype.divModSmall = function ( yoke,
    carryMod, divisor, then ) {
    
    // NOTE: We assume (0 <= carryMod < divisor <= 0x2000000000). Yes,
    // that's 37 bits of `carryMod`. We use an intermediate value of
    // 37+16=53 bits, which hits the edge of JavaScript number
    // precision.
    var beforeDiv = carryMod * 0x10000 + this.val_;
    var divResult = ~~(beforeDiv / divisor);
    var modResult = beforeDiv % divisor;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, divResult, modResult );
    } );
};
BigIntLeaf.prototype.timesPlusSmall = function ( yoke,
    carry, factor, then ) {
    
    // NOTE: We assume (0 <= carry < factor <= 0x2000000000). Yes,
    // that's 37 bits of `carryMod`. We use an intermediate value of
    // 37+16=53 bits, which hits the edge of JavaScript number
    // precision.
    var result = this.val_ * factor + carry;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, afterTimes & 0xFFFF, result >>> 16 );
    } );
};

function BigIntPart() {}
BigIntPart.prototype.init_ = function (
    zeroDigit, depth, isZero, isSingleDigit, digits ) {
    
    // The value of `signDigit` is a zero big-digit.
    
    // The value of `depth` is a bigint one greater than the depth of
    // the digits, or 0 if the digits aren't BigIntParts.
    
    // The value of `digits` a fixed-length linked list of nonnegative
    // big-digits in little-endian order. Most of the time the length
    // is equal to `bigIntPartsPerPart`, but during a multiplication
    // it may be twice that length.
    
    // The values of `isZero` and `isSingleDigit` are booleans.
    
    this.zeroDigit_ = zeroDigit;
    this.depth_ = depth;
    this.digits_ = digits;
    this.isZero_ = isZero;
    this.isSingleDigit_ = isSingleDigit;
    
    return this;
};
function makeBigIntPartWithDepth_( yoke,
    zeroDigit, depth, digits, then ) {
    
    if ( digits === null )
        throw new Error();
    return jsListAllSync( yoke, digits.rest, function ( digit ) {
        return digit.isZero();
    }, function ( yoke, isSingleDigit ) {
        return then( yoke, new BigIntPart().init_(
            zeroDigit,
            depth,
            isSingleDigit && digits.first.isZero(),
            isSingleDigit,
            digits
        ) );
    } );
}
function makeBigIntPart_( yoke, zeroDigit, digits, then ) {
    return zeroDigit.getDepthPlusOne( yoke, function ( yoke, depth ) {
        return makeBigIntPartWithDepth_( yoke,
            zeroDigit, depth, digits, then );
    } );
}
BigIntPart.prototype.withDigits = function ( yoke, digits, then ) {
    return makeBigIntPartWithDepth( yoke,
        this.zeroDigit_, this.depth_, digits, then );
};
BigIntPart.prototype.getZeroDigits = function ( yoke, then ) {
    var self = this;
    return jsListMap( yoke, self.digits_,
        function ( yoke, digit, then ) {
        
        return then( yoke, self.zeroDigit_ );
    }, then );
};
BigIntPart.prototype.promoteSub = function ( yoke, digit, then ) {
    var self = this;
    return self.getZeroDigits( function ( yoke, digits ) {
        return self.withDigits( yoke,
            { first: digit, rest: digits.rest }, then );
    } );
};
BigIntPart.prototype.getPromotedZero_ = function ( yoke, then ) {
    var self = this;
    return self.getZeroDigits( function ( yoke, zeroDigits ) {
        return self.withDigits( yoke, zeroDigits, then );
    } );
};
BigIntPart.prototype.promoteSelfWithMaybeCarryAndZero_ =
    function ( yoke, carry, zeroDigit, then ) {
    
    var self = this;
    return jsListMap( yoke, self.digits_,
        function ( yoke, digit, then ) {
        
        return then( yoke, zeroDigit );
    }, function ( yoke, digits ) {
        return makeBigIntPart_( yoke, zeroDigit,
            { first: self,
                rest: { first: carry, rest: digits.rest.rest } },
            then );
    } );
};
BigIntPart.prototype.maybePromoteSelfWithCarry = function ( yoke,
    carry, then ) {
    
    var self = this;
    if ( carry.isZero() )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, self );
        } );
    return self.getPromotedZero_( yoke, function ( yoke, zeroDigit ) {
        return self.promoteSelfWithMaybeCarryAndZero_( yoke,
            carry, zeroDigit, then );
    } );
};
BigIntPart.prototype.maybePromoteSelfWithBooleanCarry =
    function ( yoke, carry, then ) {
    
    var self = this;
    if ( !carry )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, self );
        } );
    return self.getPromotedZero_( yoke, function ( yoke, zeroDigit ) {
        return zeroDigit.plusOne( yoke, function ( yoke, oneDigit ) {
            return self.promoteSelfWithMaybeCarryAndZero_( yoke,
                oneDigit, zeroDigit, then );
        } );
    } );
};
BigIntPart.prototype.promoteSelf = function ( yoke, then ) {
    var self = this;
    return self.getPromotedZero_( yoke, function ( yoke, zeroDigit ) {
        return self.promoteSelfWithMaybeCarryAndZero_( yoke,
            zeroDigit, zeroDigit, then );
    } );
};
BigIntPart.prototype.getDepthPlusOne = function ( yoke, then ) {
    return this.depth_.plusOne( yoke, then );
};
BigIntPart.prototype.complement = function ( yoke, then ) {
    var self = this;
    return jsListMap( yoke, self.digits_,
        function ( yoke, digit, then ) {
        
        return digit.complement( yoke, then );
    }, function ( yoke, digits ) {
        return self.withDigits( yoke, digits, then );
    } );
};
BigIntPart.prototype.plusOne = function ( yoke, then ) {
    var self = this;
    var a = self.digits_;
    return jsListFoldl( yoke, {
        carry: true,
        revResult: null
    }, a, function ( yoke, state, aDigit, then ) {
        if ( !state.carry )
            return then( yoke, {
                carry: false,
                revResult: { first: aDigit, rest: state.revResult }
            } );
        return aDigit.plusOne( yoke, function ( yoke, total, carry ) {
            return then( yoke, {
                carry: carry,
                revResult: { first: total, rest: state.revResult }
            } );
        } );
    }, function ( yoke, state ) {
        return jsListRev( yoke, state.revResult,
            function ( yoke, resultDigits ) {
            
            return self.withDigits( yoke, resultDigits,
                function ( yoke, result ) {
                
                return then( yoke, result, state.carry );
            } );
        } );
    } );
};
BigIntPart.prototype.plus = function ( yoke, other, then ) {
    var self = this;
    var a = self.digits_;
    var b = other.digits_;
    return jsListDoubleFoldl( yoke, {
        carry: this.zeroDigit_,
        revResult: null
    }, a, b, function ( yoke, state, aDigit, bDigit, then ) {
        return state.carry.plus( yoke, aDigit,
            function ( yoke, total, carry1 ) {
        return total.plus( yoke, bDigit,
            function ( yoke, total, carry2 ) {
        return carry1.plus( yoke, carry2,
            function ( yoke, carry, ignoredCarryCarry ) {
        
        return then( yoke, {
            carry: carry,
            revResult: { first: total, rest: state.revResult }
        } );
        
        } );
        } );
        } );
    }, function ( yoke, state ) {
        return jsListRev( yoke, state.revResult,
            function ( yoke, resultDigits ) {
            
            return self.withDigits( yoke, resultDigits,
                function ( yoke, result ) {
                
                return then( yoke, result,
                    self.promoteSub( state.carry ) );
            } );
        } );
    } );
};
BigIntPart.prototype.times = function ( yoke, other, then ) {
    var self = this;
    var a = self.digits_;
    var b = other.digits_;
    return self.getZeroDigits( yoke, function ( yoke, zeroDigits ) {
    return jsListAppend( yoke, zeroDigits, zeroDigits,
        function ( yoke, doubleZeroDigits ) {
    return self.withDigits( yoke, doubleZeroDigits,
        function ( yoke, result ) {
    return jsListFoldl( yoke, {
        result: result,
        padLittle: null,
        padBig: zeroDigits
    }, a, function ( yoke, stateA, ad, then ) {
        // NOTE: When the digits are 16-bit, the maximum value of
        // `carry` is 0xFFFF, and the maximum value of `ad` times `bd`
        // plus the carry is 0xFFFF0000.
        return jsListFoldl( yoke, {
            carry: self.zeroDigit_,
            adTimesBRev: stateA.padLittle
        }, b, function ( yoke, stateB, bd, then ) {
            return ad.times( yoke, bd,
                function ( yoke, adTimesBd, carry1 ) {
            return adTimesBd.plus( yoke, stateB.carry,
                function ( yoke, adTimesBd, carry2 ) {
            return carry1.plus( yoke, carry2,
                function ( yoke, carry, ignoredCarryCarry ) {
            
            return then( yoke, { carry: carry, adTimesBRev:
                { first: adTimesBd, rest: stateB.adTimesBRev } } );
            
            } );
            } );
            } );
        }, function ( yoke, stateB ) {
            if ( stateA.padBig === null )
                throw new Error();
            
            return jsListAppend( yoke,
                stateA.padBig.rest,
                { first: stateB.carry, rest: stateB.adTimesBRev },
                function ( yoke, adTimesBRev ) {
            return jsListRev( yoke, adTimesBRev,
                function ( yoke, adTimesBDigits ) {
            return self.withDigits( yoke, adTimesBDigits,
                function ( yoke, adTimesB ) {
            return stateA.result.plus( yoke, adTimesB,
                function ( yoke, result, ignoredCarry ) {
            
            return then( yoke, {
                result: result,
                padLittle: { first: self.zeroDigit_,
                    rest: stateA.padLittle },
                padBig: stateA.padBig.rest
            } );
            
            } );
            } );
            } );
            } );
        } );
    }, function ( yoke, stateA ) {
    return jsListCut( yoke, stateA.result.digits_, a,
        function ( yoke, resultDigits, carryDigits ) {
    // TODO: Stop doing this second cut once we're sure there's never
    // any excess.
    return jsListCut( yoke, carryDigits, a,
        function ( yoke, carryDigits, excess ) {
    
    if ( excess !== null )
        throw new Error();
    
    return self.withDigits( yoke, resultDigits,
        function ( yoke, result ) {
    return self.withDigits( yoke, carryDigits,
        function ( yoke, carry ) {
    
    return then( yoke, result, carry );
    
    } );
    } );
    
    } );
    } );
    } );
    } );
    } );
    } );
};
BigIntPart.prototype.isZero = function () {
    return this.isZero_;
};
BigIntPart.prototype.compareTo = function ( yoke, other, then ) {
    var a = this.digits_;
    var b = other.digits_;
    return jsListRev( yoke, a, function ( yoke, aRev ) {
    return jsListRev( yoke, b, function ( yoke, bRev ) {
    return jsListDoubleAny( yoke, aRev, bRev,
        function ( yoke, ad, bd, then ) {
        
        return ad.compareTo( yoke, bd, function ( yoke, adVsBd ) {
            return then( yoke,
                adVsBd === 0 ? null : { val: adVsBd } );
        } );
    }, function ( yoke, result ) {
        return then( yoke, result ? result.val : 0 );
    } );
    } );
    } );
};
BigIntPart.prototype.divModSmall = function ( yoke,
    carryMod, divisor, then ) {
    
    var self = this;
    
    // Optimization: If this segment of the bigint is just full of
    // zeros and the carry is also zero, we can just skip over the
    // whole segment.
    if ( self.isZero() && carryMod === 0 )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, self, 0 );
        } );
    
    var a = self.digits_;
    return jsListRev( yoke, a, function ( yoke, aRev ) {
        return jsListFoldl( yoke, {
            carry: carryMod,
            resultDigits: null
        }, aRev, function ( yoke, state, ad, then ) {
            return ad.divModSmall( yoke, state.carry, divisor,
                function ( yoke, resultDigit, carry ) {
                
                return then( yoke, { carry: carry, resultDigits:
                    { first: resultDigit,
                        rest: state.resultDigits } } );
            } );
        }, function ( yoke, state ) {
            return self.withDigits( yoke, state.resultDigits,
                function ( yoke, result ) {
                
                return then( yoke, result, state.carry );
            } );
        } );
    } );
};
BigIntLeaf.prototype.timesPlusSmall = function ( yoke,
    carry, factor, then ) {
    
    var self = this;
    
    // Optimization: If this segment of the bigint is just full of
    // zeros and the carry is also zero, we can just skip over the
    // whole segment.
    if ( self.isZero() && carry === 0 )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, self, 0 );
        } );
    
    var a = self.digits_;
    return jsListFoldl( yoke, {
        carry: carry,
        resultDigits: null
    }, a, function ( yoke, state, ad, then ) {
        return ad.timesPlusSmall( yoke, state.carry, factor,
            function ( yoke, resultDigit, carry ) {
            
            return then( yoke, { carry: carry, resultDigits:
                { first: resultDigit, rest: state.resultDigits } } );
        } );
    }, function ( yoke, state ) {
        return self.withDigits( yoke, state.resultDigits,
            function ( yoke, result ) {
            
            return then( yoke, result, state.carry );
        } );
    } );
};

function bigDigitCommensurate_( yoke, a, b, then ) {
    
    function collectPromoters( yoke, bigDigit, promoters, then ) {
        return runWaitOne( yoke, function ( yoke ) {
            if ( bigDigit instanceof BigIntLeaf )
                return then( yoke, promoters );
            return collectPromoters( yoke, bigDigit.zeroDigit_,
                { first: bigDigit, rest: promoters }, then );
        } );
    }
    
    function usePromoters( yoke, bigDigit, promoters, then ) {
        return runWaitOne( yoke, function ( yoke ) {
            if ( promoters === null )
                return then( yoke, bigDigit );
            return promoters.first.promoteSub( yoke, bigDigit,
                function ( yoke, bigDigit ) {
                
                return usePromoters( yoke,
                    bigDigit, promoters.rest, then );
            } );
        } );
    }
    
    return collectPromoters( yoke, a, null,
        function ( yoke, promotersForB ) {
    return collectPromoters( yoke, b, null,
        function ( yoke, promotersForA ) {
    return jsListTails( yoke, promotersForA, promotersForB,
        function ( promotersForA, promotersForB ) {
    // NOTE: Either `promotersForA` or `promotersForB` (or both) is
    // empty.
    return usePromoters( yoke, a, promotersForA,
        function ( yoke, a ) {
    return usePromoters( yoke, b, promotersForB,
        function ( yoke, b ) {
    
    return then( yoke, a, b );
    
    } );
    } );
    } );
    } );
    } );
}

// TODO: Test all of this. The tests in test-bigint.js are a good
// start, but they're not very thorough. They don't even test negative
// numbers, for instance.
// TODO: Expose all of this to Penknife.
function BigInt() {}
BigInt.prototype.init_ = function ( sign, part ) {
    this.sign_ = sign;
    this.part_ = part;
    return this;
};
BigInt.prototype.normalize_ = function ( yoke, then ) {
    function normalizeDigit( yoke, digit, then ) {
        return runWaitOne( yoke, function ( yoke ) {
            if ( digit instanceof BigIntPart
                && digit.isSingleDigit_ )
                return normalizeDigit( yoke,
                    digit.digits_.first, then );
            return then( yoke, digit );
        } );
    }
    var self = this;
    return normalizeDigit( yoke, self.part_, function ( yoke, part ) {
        return then( yoke, new BigInt().init_(
            part instanceof BigIntLeaf && part.isZero() ? 0 :
                self.sign_,
            part ) );
    } );
};
BigInt.prototype.compareAbsTo = function ( yoke, other, then ) {
    var a = this.part_;
    var b = other.part_;
    var al = a instanceof BigIntLeaf;
    var bl = b instanceof BigIntLeaf;
    
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( al && !bl )
        return then( yoke, -1 );
    if ( !al && bl )
        return then( yoke, 1 );
    if ( al && bl )
        return then( yoke, 0 );
    
    return a.getDepthPlusOne( yoke, function ( yoke, adp1 ) {
    return b.getDepthPlusOne( yoke, function ( yoke, bdp1 ) {
    return adp1.compareAbsTo( yoke, bdp1, function ( yoke, adVsBd ) {
    
    if ( adVsBd !== 0 )
        return then( yoke, adVsBd );
    
    return a.compareTo( yoke, b, then );
    
    } );
    } );
    } );
    
    } );
};
BigInt.prototype.compareTo = function ( yoke, other, then ) {
    var self = this;
    var as = self.sign_;
    var bs = other.sign_;
    return runWaitOne( yoke, function ( yoke ) {
        if ( as < bs )
            return then( yoke, -1 );
        if ( bs < as )
            return then( yoke, 1 );
        var sign = as;
        return self.compareAbsTo( yoke, other,
            function ( yoke, absVsAbs ) {
            
            return then( yoke, sign * absVsAbs );
        } );
    } );
};
function bigDigitTwosComplement_( yoke, digit, then ) {
    return digit.complement( yoke, function ( yoke, cp0 ) {
        return cp0.plusOne( yoke, then );
    } );
}
BigInt.prototype.plusOne = function ( yoke, then ) {
    var self = this;
    var as = self.sign_;
    if ( 0 <= as ) {
        return self.part_.plusOne( yoke,
            function ( yoke, result, carry ) {
        return result.maybePromoteSelfWithBooleanCarry( yoke,
            carry,
            function ( yoke, result ) {
        
        return then( yoke, new BigInt().init_( 1, result ) );
        
        } );
        } );
    } else {
        return bigDigitTwosComplement_( yoke, self.part_,
            function ( yoke, negSelf, ignoredIsZero ) {
        // NOTE: If the value were zero, we would have taken the above
        // branch instead.
        // NOTE: The following complement is used as a cheap way to
        // negate and subtract one.
        return negSelf.complement( yoke, function ( yoke, result ) {
        
        // NOTE: We normalize in case there are new all-zero digits or
        // the sign is 0.
        return new BigInt().init_( -1, result ).normalize( yoke,
            then );
        
        } );
        } );
        } );
    }
};
BigInt.prototype.plus = function ( yoke, other, then ) {
    var self = this;
    if ( self.sign_ < other.sign_ ) {
        return other.plus( yoke, self, then );
    } else if ( (0 <= self.sign_) === (0 <= other.sign_) ) {
        return bigDigitCommensurate_( yoke, self.part_, other.part_,
            function ( yoke, a, b ) {
        return a.plus( b, function ( yoke, result, carry ) {
        return result.maybePromoteSelfWithCarry( yoke, carry,
            function ( yoke, result ) {
        
        // NOTE: We normalize in case the sign is 0.
        return new BigInt().init_( 1, result ).normalize( yoke,
            then );
        
        } );
        } );
        } );
    } else {
        if ( !(0 <= self.sign_ && other.sign_ === -1) )
            throw new Error();
        
        return bigDigitCommensurate_( yoke, self.part_, other.part_,
            function ( yoke, a, b ) {
        return bigDigitTwosComplement_( yoke, b,
            function ( yoke, nb, ignoredIsZero ) {
        // NOTE: If the value were zero, we would have taken the above
        // branch instead.
        return a.plus( yoke, nb, function ( yoke, result, carry ) {
        
        if ( carry.isZero() ) {
            // The two's complement representation hasn't righted
            // itself, so the negative side must have prevailed.
            
            return bigDigitTwosComplement_( yoke, result,
                function ( yoke, result, surprisingIsZero ) {
                
                // NOTE: Since there was no carry and one of the
                // values was a nonzero number in two's complement,
                // their sum can't be zero.
                //
                // TODO: ...Can it?
                //
                if ( surprisingIsZero )
                    throw new Error();
                
                // NOTE: We normalize in case there are new all-zero
                // digits.
                return new BigInt().init_(
                    -1, result ).normalize( yoke, then );
            } );
        } else {
            // The two's complement representation has righted itself,
            // so the nonnegative side must have prevailed.
            
            // NOTE: We normalize in case there are new all-zero
            // digits or the sign is 0.
            return new BigInt().init_(
                self.sign_, result ).normalize( yoke, then );
        }
        
        } );
        } );
        } );
    }
    return this.normalize_();
};
BigInt.prototype.neg = function () {
    return new BigInt().init_( -this.sign_, this.part_ );
};
BigInt.prototype.abs = function () {
    return new BigInt().init_( Math.abs( this.sign_ ), this.part_ );
};
BigInt.prototype.times = function ( yoke, other, then ) {
    var self = this;
    if ( self.sign_ === -1 )
        return self.neg().times( yoke, other,
            function ( yoke, result ) {
            
            return then( yoke, result.neg() );
        } );
    if ( other.sign_ === -1 )
        return other.times( yoke, self, then );
    return self.part_.times( yoke, other.part_,
        function ( yoke, result, carry ) {
        
        return result.maybePromoteSelfWithCarry( yoke, carry,
            function ( yoke, result ) {
            
            // NOTE: We normalize in case the sign is 0.
            return new BigInt().init_( 1, result ).normalize( yoke,
                then );
        } );
    } );
};
// TODO: Add shiftedLeft() and shiftedRightWithRemainder(), at least
// for small numbers of bits.
// TODO: Add dividedByTowardZeroWithRemainder(), or some other full
// division of bigints.
BigInt.prototype.toStringInRadix = function ( yoke, base, then ) {
    var alphabet = "0123456789ABCDEF".split( "" );
    if ( !(2 <= base && base <= alphabet.length) )
        throw new Error();
    return go( yoke, "", this.part_ );
    function go( yoke, result, digitsLeft ) {
        return runWaitOne( yoke, function ( yoke ) {
            if ( digitsLeft.isZero() ) {
                if ( result === "" )
                    return then( yoke, alphabet[ 0 ] );
                else if ( this.sign_ === -1 )
                    return then( yoke, "-" + result );
                return then( yoke, result );
            }
            return digitsLeft.divModSmall( yoke, 0, base,
                function ( yoke, div, mod ) {
                
                return go( yoke, alphabet[ mod ] + result, div );
            } );
        } );
    }
};
function bigIntFromStringInRadix( yoke, base, string, then ) {
    var alphabetByNumber = "0123456789ABCDEF".split( "" );
    var alphabet = {};
    for ( var i = 0, n = alphabetByNumber.length; i < n; i++ )
        alphabet[ "|" + alphabetByNumber[ i ] ] = i;
    if ( !(2 <= base && base <= alphabetByNumber.length) )
        throw new Error();
    var i = 0, n = string.length;
    var sign = 1;
    var result = new BigInt().init_( 1, [] );
    if ( i < n && string.charAt( i ) === "-" ) {
        sign = -1;
        i++;
    }
    
    return go( yoke, bigIntLeafZero_, i );
    function go( yoke, result, i ) {
        return runWaitOne( yoke, function ( yoke ) {
            // NOTE: We normalize in case the sign is 0.
            if ( n <= i )
                new BigInt().init_( sign, result
                    ).normalize_( yoke, then );
            var ch = string.charAt( i );
            var digitValue = alphabet[ "|" + ch ];
            if ( digitValue === void 0 )
                return then( yoke, null );
            
            return result.timesPlusSmall( yoke, digitValue, base,
                function ( yoke, result, carry ) {
            // NOTE: Since we only have radixes up to 16, the `carry`
            // can't be bigger than 4 bits, so a `BigIntLeaf` can
            // handle it.
            return bigDigitCommensurate( yoke,
                result, new BigIntLeaf().init_( carry ),
                function ( yoke, result, carry ) {
            return result.maybePromoteSelfWithCarry( yoke, carry,
                function ( yoke, result ) {
            
            return go( yoke, result, i + i );
            
            } );
            } );
            } );
        } );
    }
}
var bigIntZero_ = new BigInt().init_( 0, bigIntLeafZero_ );



function AvlLeaf_( compare ) {
    this.compare_ = compare;
}
AvlLeaf_.prototype.getMaybe = function ( yoke, k, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, null );
    } );
};
AvlLeaf_.prototype.minusEntry = function ( yoke, k, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, self );
    } );
};
AvlLeaf_.prototype.minusLeast_ = function ( yoke, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, null );
    } );
};
AvlLeaf_.prototype.minusBiggest_ = function ( yoke, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, null );
    } );
};
AvlLeaf_.prototype.plusEntryAfterComparison_ = function ( yoke,
    kVsThisKey, k, v, then ) {
    
    // NOTE: This may call then() synchronously.
    
    return then( yoke, { depthIncreased: true,
        after: new AvlBranch_( this, this, k, v, "balanced" ) } );
};
AvlLeaf_.prototype.plusEntry = function ( yoke, k, v, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, { depthIncreased: true,
            after: new AvlBranch_( self, self, k, v, "balanced" ) } );
    } );
};
// NOTE: This body takes its args as ( yoke, state, k, v, then ).
AvlLeaf_.prototype.shortFoldAsc = function ( yoke,
    state, body, then ) {
    
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, state, !"exitedEarly" );
    } );
};
// NOTE: This body takes its args as ( yoke, state, k, v, then ).
AvlLeaf_.prototype.mapShortFoldAsc = function ( yoke,
    state, body, then ) {
    
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, state, { val: self } );
    } );
};
AvlLeaf_.prototype.hasAny = function () {
    return false;
};
// TODO: See if we'll use this for something. It might come in handy
// for merging.
AvlLeaf_.prototype.getHeight_ = function ( yoke, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, null );
    } );
};

function AvlBranch_( lesser, bigger, key, val, balance ) {
    this.compare_ = lesser.compare_;
    this.lesser_ = lesser;
    this.bigger_ = bigger;
    this.key_ = key;
    this.val_ = val;
    this.balance_ = balance;
}
AvlBranch_.prototype.getMaybe = function ( yoke, k, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
    return self.compare_( yoke, k, self.key_, function ( yoke, c ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    return then( yoke,
        c === 0 ? { val: self.val_ } :
        c < 0 ? self.lesser_.getMaybe( k ) :
            self.bigger_.getMaybe( k ) );
    
    } );
    } );
    } );
};
AvlBranch_.prototype.minusLeast_ = function ( yoke, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
    return self.lesser_.minusLeast_( yoke, function ( yoke, lml ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( lml === null )
        return then( yoke, { key: self.key_, val: self.val_,
            depthDecresed: true, after: self.bigger_ } );
    if ( !lml.depthDecreased )
        return then( yoke, { key: lml.key, val: lml.val,
            depthDecreased: false,
            after: new AvlBranch_( lml.after, self.bigger_,
                self.key_, self.val_, self.balance_ ) } );
    if ( self.balance_ === "lesser" ) {
        return then( yoke, { key: lml.key, val: lml.val,
            depthDecreased: false,
            after: new AvlBranch_( lml.after, self.bigger_,
                self.key_, self.val_, "balanced" ) } );
    } else if ( self.balance_ === "balanced" ) {
        return then( yoke, { key: lml.key, val: lml.val,
            depthDecreased: false,
            after: new AvlBranch_( lml.after, self.bigger_,
                self.key_, self.val_, "bigger" ) } );
    } else if ( self.balance_ === "bigger" ) {
        return self.bigger_.minusLeast_( yoke,
            function ( yoke, bml ) {
        
        if ( bml === null )
            throw new Error();
        var thisKeyVsLesserKey = 1;
        return lml.after.plusEntryAfterComparison_( yoke,
            thisKeyVsLesserKey, self.key_, self.val_,
            function ( yoke, lmlp ) {
        // NOTE: Since the then() of this and
        // plusEntryAfterComparison_() are not corecursive, we don't
        // need to runWaitOne() here.
        
        if ( !lmlp.depthIncreased )
            throw new Error();
        return then( yoke, { key: lml.key, val: lml.val,
            depthDecreased: bml.depthDecreased,
            after: new AvlBranch_( lmlp.after, bml.after,
                bml.key, bml.val,
                bml.depthDecreased ? "balanced" : "bigger" ) } );
        
        } );
        
        } );
    } else {
        throw new Error();
    }
    
    } );
    } );
    } );
};
AvlBranch_.prototype.minusBiggest_ = function ( yoke, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
    return self.lesser_.minusBiggest_( yoke, function ( yoke, bmb ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( bmb === null )
        return then( yoke, { key: self.key_, val: self.val_,
            depthDecresed: true, after: self.lesser_ } );
    if ( !bmb.depthDecreased )
        return then( yoke, { key: bmb.key, val: bmb.val,
            depthDecreased: false,
            after: new AvlBranch_( self.lesser_, bmb.after,
                self.key_, self.val_, self.balance_ ) } );
    if ( self.balance_ === "lesser" ) {
        return self.lesser_.minusBiggest_( yoke,
            function ( yoke, lmb ) {
        
        if ( lmb === null )
            throw new Error();
        var thisKeyVsBiggerKey = -1;
        return bmb.after.plusEntryAfterComparison_( yoke,
            thisKeyVsBiggerKey, self.key_, self.val_,
            function ( yoke, bmbp ) {
        // NOTE: Since the then() of this and
        // plusEntryAfterComparison_() are not corecursive, we don't
        // need to runWaitOne() here.
        
        if ( !bmbp.depthIncreased )
            throw new Error();
        return then( yoke, { key: bmb.key, val: bmb.val,
            depthDecreased: lmb.depthDecreased,
            after: new AvlBranch_( lmb.after, bmbp.after,
                lmb.key, lmb.val,
                lmb.depthDecreased ? "balanced" : "lesser" ) } );
        
        } );
        
        } );
    } else if ( self.balance_ === "balanced" ) {
        return then( yoke, { key: bmb.key, val: bmb.val,
            depthDecreased: false,
            after: new AvlBranch_( self.lesser_, bmb.after,
                self.key_, self.val_, "lesser" ) } );
    } else if ( self.balance_ === "bigger" ) {
        return then( yoke, { key: bmb.key, val: bmb.val,
            depthDecreased: false,
            after: new AvlBranch_( self.lesser_, bmb.after,
                self.key_, self.val_, "balanced" ) } );
    } else {
        throw new Error();
    }
    
    } );
    } );
    } );
};
AvlBranch_.prototype.plusEntryAfterComparison_ = function ( yoke,
    kVsThisKey, k, v, then ) {
    
    // NOTE: This may call then() synchronously.
    
    var self = this;
    if ( kVsThisKey === 0 ) {
        return then( yoke, { depthIncreased: false,
            after: new AvlBranch_( self.lesser_, self.bigger_,
                k, v, self.balance_ ) } );
    } else if ( kVsThisKey < 0 ) {  // k < self.key_
        return self.lesser_.plusEntry( yoke, k, v,
            function ( yoke, subPlus ) {
        
        if ( !subPlus.depthIncreased )
            return then( yoke, { depthIncreased: false,
                after: new AvlBranch_( subPlus.after, self.bigger_,
                    self.key_, self.val_, self.balance_ ) } );
        if ( self.balance_ === "lesser" ) {
            return subPlus.after.minusBiggest_( yoke,
                function ( yoke, spmb ) {
            
            if ( spmb === null )
                throw new Error();
            var thisKeyVsBiggerKey = -1;
            return self.bigger_.plusEntryAfterComparison_( yoke,
                thisKeyVsBiggerKey, self.key_, self.val_,
                function ( yoke, bp ) {
            return runWaitOne( yoke, function ( yoke ) {
            
            if ( !bp.depthIncreased )
                throw new Error();
            return then( yoke, {
                depthIncreased: !spmb.depthDecreased,
                after: new AvlBranch_( spmb.after, bp.after,
                    spmb.key, spmb.val,
                    spmb.depthDecreased ? "balanced" : "lesser" )
            } );
            
            } );
            } );
            
            } );
        } else if ( self.balance_ === "balanced" ) {
            return then( yoke, { depthIncreased: false,
                after: new AvlBranch_( subPlus.after, self.bigger_,
                    self.key_, self.val_, "lesser" ) } );
        } else if ( self.balance_ === "bigger" ) {
            return then( yoke, { depthIncreased: false,
                after: new AvlBranch_( subPlus.after, self.bigger_,
                    self.key_, self.val_, "balanced" ) } );
        } else {
            throw new Error();
        }
        
        } );
    } else {  // self.key_ < k
        return self.bigger_.plusEntry( yoke, k, v,
            function ( yoke, subPlus ) {
        
        if ( !subPlus.depthIncreased )
            return then( yoke, { depthIncreased: false,
                after: new AvlBranch_( self.lesser_, subPlus.after,
                    self.key_, self.val_, self.balance_ ) } );
        if ( self.balance_ === "lesser" ) {
            return then( yoke, { depthIncreased: false,
                after: new AvlBranch_( self.lesser_, subPlus.after,
                    self.key_, self.val_, "balanced" ) } );
        } else if ( self.balance_ === "balanced" ) {
            return then( yoke, { depthIncreased: false,
                after: new AvlBranch_( self.lesser_, subPlus.after,
                    self.key_, self.val_, "bigger" ) } );
        } else if ( self.balance_ === "bigger" ) {
            return subPlus.after.minusLeast_( yoke,
                function ( yoke, spml ) {
            
            if ( spml === null )
                throw new Error();
            var thisKeyVsLesserKey = 1;
            return self.lesser_.plusEntryAfterComparison_( yoke,
                thisKeyVsLesserKey, self.key_, self.val_,
                function ( yoke, lp ) {
            return runWaitOne( yoke, function ( yoke ) {
            
            if ( !lp.depthIncreased )
                throw new Error();
            return then( yoke, {
                depthIncreased: !spml.depthDecreased,
                after: new AvlBranch_( lp.after, spml.after,
                    spml.key, spml.val,
                    spml.depthDecreased ? "balanced" : "bigger" )
            } );
            
            } );
            } );
            
            } );
        } else {
            throw new Error();
        }
        
        } );
    }
};
AvlBranch_.prototype.plusEntry = function ( yoke, k, v, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
    return self.compare_( yoke, k, self.key_,
        function ( yoke, kVsThisKey ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    return self.plusEntryAfterComparison_( yoke,
        kVsThisKey, k, v, then );
    
    } );
    } );
    } );
};
// NOTE: This body takes its args as ( yoke, state, body, then ).
AvlBranch_.prototype.shortFoldAsc = function ( yoke,
    state, body, then ) {
    
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
    return self.lesser_.shortFoldAsc( yoke, state, body,
        function ( yoke, state, exitedEarly ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( exitedEarly )
        return then( yoke, state, !!"exitedEarly" );
    
    return body( yoke, state, self.key_, self.val_,
        function ( yoke, state, exitedEarly ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( exitedEarly )
        return then( yoke, state, !!"exitedEarly" );
    
    return self.bigger_.shortFoldAsc( yoke, state, body, then );
    
    } );
    } );
    
    } );
    } );
    } );
};
// NOTE: This body takes its args as ( yoke, state, k, v, then ).
AvlBranch_.prototype.mapShortFoldAsc = function ( yoke,
    state, body, then ) {
    
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
    return self.lesser_.mapShortFoldAsc( yoke, state, body,
        function ( yoke, state, maybeLesserResult ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( maybeLesserResult === null )
        return then( yoke, state, null );
    
    return body( yoke, state, self.key_, self.val_,
        function ( yoke, state, maybeThisResult ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( maybeThisResult === null )
        return then( yoke, state, null );
    
    return self.bigger_.mapShortFoldAsc( yoke, state, body,
        function ( yoke, state, maybeBiggerResult ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( maybeBiggerResult === null )
        return then( yoke, state, null );
    
    return then( yoke, state, { val: new StrAvlBranch_(
        maybeLesserResult.val, maybeBiggerResult.val,
        self.key_, maybeThisResult.val, self.balance_ ) } );
    
    } );
    } );
    
    } );
    } );
    
    } );
    } );
    } );
};
AvlBranch_.prototype.hasAny = function () {
    return true;
};
// TODO: See if we'll use this for something. It might come in handy
// for merging.
AvlBranch_.prototype.getHeight_ = function ( yoke, then ) {
    var maxSubtree =
        this.balance_ === "lesser" ? this.lesser_ : this.bigger_;
    return runWaitOne( yoke, function ( yoke ) {
    return maxSubtree.getHeight_( yoke, function ( yoke, subHeight ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    return then( yoke, { first: null, rest: subHeight } );
    
    } );
    } );
    } );
};

function AvlMap() {}
AvlMap.prototype.init_ = function ( contents ) {
    this.contents_ = contents;
    return this;
};
function avlMap() {
    return new AvlMap().init_( new AvlLeaf_() );
}
AvlMap.prototype.has = function ( yoke, k, then ) {
    return this.getMaybe( yoke, k, function ( yoke, maybe ) {
        return then( yoke, maybe !== null );
    } );
};
AvlMap.prototype.get = function ( k ) {
    return this.getMaybe( yoke, k, function ( yoke, maybe ) {
        return then( yoke, maybe !== null ? maybe.val : void 0 );
    } );
};
AvlMap.prototype.del = function ( yoke, k, then ) {
    var self = this;
    return self.minusEntry( yoke, k, function ( yoke, newContents ) {
        self.contents_ = newContents.contents_;
        return then( yoke, self );
    } );
};
AvlMap.prototype.set = function ( yoke, k, v, then ) {
    var self = this;
    return self.contents_.plusEntry( yoke, k, v,
        function ( yoke, newContents ) {
        
        self.contents_ = newContents.after;
        return then( yoke, self );
    } );
};
AvlMap.prototype.setObj = function ( yoke, obj, then ) {
    // NOTE: This adds the entries in the reverse order they're found
    // in the object, but that's okay because the order of entries in
    // this map is entirely determined by its comparator.
    var self = this;
    var entries = null;
    objOwnEach( obj, function ( k, v ) {
        entries = { first: { k: k, v: v }, rest: entries };
    } );
    return go( entries );
    function go( entries ) {
        return runWaitOne( yoke, function ( yoke ) {
            if ( entries === null )
                return then( yoke, self );
            self.set( entries.first.k, entries.first.v );
            return go( entries.rest );
        } );
    }
};
AvlMap.prototype.setAll = function ( yoke, other, then ) {
    if ( !(other instanceof AvlMap) )
        throw new Error();
    // TODO: Merge the trees more efficiently than this. We're using
    // AVL trees, which can supposedly merge in O( log (m + n) ) time,
    // but this operation is probably O( n * log (m + n) ).
    var self = this;
    return other.each( yoke, function ( yoke, k, v, then ) {
        self.set( k, v );
        return then( yoke );
    }, function ( yoke ) {
        return then( yoke, self );
    } );
};
AvlMap.prototype.copy = function () {
    return new AvlMap().init_( this.contents_ );
};
AvlMap.prototype.add = function ( yoke, k, then ) {
    return this.set( yoke, k, true, then );
};
AvlMap.prototype.plusEntry = function ( yoke, k, v, then ) {
    return this.copy().set( yoke, k, v, then );
};
AvlMap.prototype.plus = function ( yoke, other, then ) {
    return this.copy().setAll( yoke, other then );
};
// TODO: Find a better name for this.
AvlMap.prototype.plusTruth = function ( yoke, k, then ) {
    return this.copy().add( yoke, k, then );
};
// TODO: Find a better name for this.
AvlMap.prototype.plusArrTruth = function ( yoke, arr, then ) {
    var result = this.copy();
    // NOTE: This adds the entries in reverse order, but that's okay
    // because the order of entries in this map is entirely determined
    // by its comparator.
    var entries = null;
    arrEach( arr, function ( elem ) {
        entries = { first: elem, rest: entries };
    } );
    return go( entries );
    function go( entries ) {
        return runWaitOne( yoke, function ( yoke ) {
            if ( entries === null )
                return then( yoke, result );
            result.add( entries.first );
            return go( entries.rest );
        } );
    }
};
AvlMap.prototype.minusEntry = function ( yoke, k, then ) {
    return this.copy().del( yoke, k, then );
};
// NOTE: This body takes its args as ( yoke, k, v, then ).
AvlMap.prototype.any = function ( yoke, body, then ) {
    return this.contents_.shortFoldAsc( yoke, null,
        function ( yoke, state, k, v, then ) {
        
        return body( yoke, k, v, function ( yoke, result ) {
            if ( result )
                return then( yoke, result, !!"exitedEarly" );
            return then( yoke, state, !"exitedEarly" );
        } );
    }, function ( yoke, state, exitedEarly ) {
        return then( yoke, exitedEarly ? state : false );
    } );
};
AvlMap.prototype.hasAny = function () {
    return this.contents_.hasAny();
};
// NOTE: This body takes its args as ( yoke, k, v, then ).
AvlMap.prototype.each = function ( yoke, body, then ) {
    return this.any( yoke, function ( yoke, k, v, then ) {
        return body( yoke, k, v, function ( yoke ) {
            return runWaitOne( yoke, function ( yoke ) {
                return then( yoke, false );
            } );
        } );
    }, function ( yoke, ignoredFalse ) {
        return then( yoke, body );
    } );
};
// NOTE: This body takes its args as ( yoke, k, v, then ).
AvlMap.prototype.map = function ( yoke, body, then ) {
    return this.contents_.mapShortFoldAsc( yoke, null,
        function ( yoke, state, k, v, then ) {
        
        return body( yoke, k, v, function ( yoke, resultElem ) {
            return then( yoke, state, { val: resultElem } );
        } );
    }, function ( yoke, state, maybeResult ) {
        if ( maybeResult === null )
            throw new Error();
        return then( yoke, maybeResult.val );
    } );
};
