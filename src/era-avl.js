// era-avl.js
// Copyright 2013, 2014 Ross Angle. Released under the MIT License.
"use strict";

// The utilities in this file aren't yet used, but they represent the
// start of a more comprehensive approach to JS limit-breaking.
//
// This file provides bigint, AVL tree, and finger tree
// implementations that use a trampoline, taking only a small constant
// amount of JavaScript stack space (to avoid overflows) and constant
// time in between each trampoline bounce. Most such libraries
// abstract away the iteration behind a non-trampolined interface,
// making it impossible to suspend the iteration once it's begun.
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
// Bigints, AVL trees, and finger trees will be limitless substitutes
// for JavaScript numbers, JavaScript object dictionaries, and
// JavaScript strings (up to the limit of memory allocation, anyway).
// Bigints and AVL trees won't have the efficiency drawbacks of unary
// numbers and association lists.

// TODO: The above comment is a bit scattered. Edit it.

// TODO: Actually implement a string representation in terms of
// finger trees.


function jsListDoubleShortFoldl( yoke,
    init, listA, listB, func, then ) {
    
    return jsListShortFoldl( yoke,
        { state: init, restB: listB }, listA,
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
function jsListAnySync( yoke, list, func, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        if ( list === null )
            return then( yoke, false );
        var result = func( list.first );
        if ( result )
            return then( yoke, result );
        return jsListAnySync( yoke, list.rest, func, then );
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
    return jsListAnySync( yoke, list, function ( elem ) {
        var result = func( elem );
        return result ? null : { val: result };
    }, function ( yoke, result ) {
        return then( yoke, result === null ? true : result.val );
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

function jsListFromSmallArr( arr ) {
    var result = null;
    for ( var i = arr.length - 1; 0 <= i; i-- )
        result = { first: arr[ i ], rest: result };
    return result;
}
function arrFoldlAsync( yoke, state, arr, combine, then ) {
    return jsListFoldl( yoke,
        state, jsListFromSmallArr( arr ), combine, then );
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
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, bigIntZero_ );
    } );
};
BigIntLeaf.prototype.complement = function ( yoke, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke,
            new BigIntLeaf().init_( 0xFFFF ^ this.val_ ) );
    } );
};
BigIntLeaf.prototype.plusCarry = function ( yoke,
    other, carry, then ) {
    
    var result = this.val_ + other.val_ + (carry ? 1 : 0);
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, new BigIntLeaf().init_( result & 0xFFFF ),
            (result >>> 16) !== 0 );
    } );
};
BigIntLeaf.prototype.minusCarry = function ( yoke,
    other, carry, then ) {
    
    var result = this.val_ + (0xFFFF ^ other.val_) + (carry ? 0 : 1);
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, new BigIntLeaf().init_( result & 0xFFFF ),
            (result >>> 16) === 0 );
    } );
};
BigIntLeaf.prototype.isZero = function () {
    return this.val_ === 0;
};
BigIntLeaf.prototype.asZero = function ( yoke, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, bigIntLeafZero_ );
    } );
};
BigIntLeaf.prototype.compareTo = function ( yoke, other, then ) {
    var result = this.val_ < other.val_ ? -1 :
        this.val_ === other.val_ ? 0 : 1;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, result );
    } );
};
BigIntLeaf.prototype.divModSmall = function ( yoke,
    divisor, carryMod, then ) {
    
    if ( divisor === 0 )
        throw new Error();
    
    // NOTE: We assume (0 <= carryMod < divisor <= 0x2000000000). Yes,
    // that's 37 bits of `carryMod`. We use an intermediate value of
    // 37+16=53 bits, which hits the edge of JavaScript number
    // precision.
    var beforeDiv = carryMod * 0x10000 + this.val_;
    var divResult = ~~(beforeDiv / divisor);
    var modResult = beforeDiv % divisor;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, new BigIntLeaf().init_( divResult ),
            modResult );
    } );
};
BigIntLeaf.prototype.divMod = function ( yoke,
    divisor, carryMod, then ) {
    
    return this.divModSmall( yoke, divisor.val_, carryMod.val_,
        function ( yoke, divResult, modResult ) {
        
        return then( yoke, divResult,
            new BigIntLeaf().init_( modResult ) );
    } );
};
BigIntLeaf.prototype.timesCarrySmall = function ( yoke,
    factor, carry, then ) {
    
    // NOTE: We assume (0 <= carry < factor <= 0x2000000000). Yes,
    // that's 37 bits of `carryMod`. We use an intermediate value of
    // 37+16=53 bits, which hits the edge of JavaScript number
    // precision.
    var result = this.val_ * factor + carry;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, new BigIntLeaf().init_( result & 0xFFFF ),
            ~~(result / 0x10000) );
    } );
};
BigIntLeaf.prototype.timesCarry = function ( yoke,
    other, carry, then ) {
    
    return this.timesCarrySmall( yoke, other.val_, carry.val_,
        function ( yoke, result, carry ) {
        
        return then( yoke, result, new BigIntLeaf().init_( carry ) );
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
    return makeBigIntPartWithDepth_( yoke,
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
    return self.asZero( yoke, function ( yoke, zeroDigit ) {
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
    return self.asZero( yoke, function ( yoke, zeroDigit ) {
        return zeroDigit.plusCarry( yoke, zeroDigit, true,
            function ( yoke, oneDigit, ignoredCarry ) {
            
            return self.promoteSelfWithMaybeCarryAndZero_( yoke,
                oneDigit, zeroDigit, then );
        } );
    } );
};
BigIntPart.prototype.promoteSelf = function ( yoke, then ) {
    var self = this;
    return self.asZero( yoke, function ( yoke, zeroDigit ) {
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
BigIntPart.prototype.plusCarry = function ( yoke,
    other, carry, then ) {
    
    var self = this;
    
    // Optimization: If this segment of the bigint is just full of
    // zeros and the carry is also zero, we can just skip over the
    // whole segment.
    if ( self.isZero() && !carry )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, other, false );
        } );
    // Optimization: If both things to add to this are zero, we can
    // just skip the addition.
    if ( other.isZero() && !carry )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, self, false );
        } );
    
    var a = self.digits_;
    var b = other.digits_;
    return jsListDoubleFoldl( yoke, {
        carry: carry,
        revResult: null
    }, a, b, function ( yoke, state, aDigit, bDigit, then ) {
        return aDigit.plusCarry( yoke, bDigit, state.carry,
            function ( yoke, total, carry ) {
            
            return then( yoke, { carry: carry, revResult:
                { first: total, rest: state.revResult } } );
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
BigIntPart.prototype.minusCarry = function ( yoke,
    other, carry, then ) {
    
    var self = this;
    
    // Optimization: If both things to subtract from this are zero, we
    // can just skip the subtraction.
    if ( other.isZero() && !carry )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, self, false );
        } );
    
    var a = self.digits_;
    var b = other.digits_;
    return jsListDoubleFoldl( yoke, {
        carry: carry,
        revResult: null
    }, a, b, function ( yoke, state, aDigit, bDigit, then ) {
        return aDigit.minusCarry( yoke, bDigit, state.carry,
            function ( yoke, total, carry ) {
            
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
BigIntPart.prototype.timesCarry = function ( yoke,
    other, carry, then ) {
    
    var self = this;
    
    // TODO: See if this can be more efficient.
    
    // Optimization: If either factor is zero, we can just use the
    // carry as the result value.
    if ( self.isZero() )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, carry, self );
        } );
    if ( other.isZero() )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, carry, other );
        } );
    
    var a = self.digits_;
    var b = other.digits_;
    return self.getZeroDigits( yoke, function ( yoke, zeroDigits ) {
    return jsListAppend( yoke, carry.digits_, zeroDigits,
        function ( yoke, doubleCarryDigits ) {
    return self.withDigits( yoke, doubleCarryDigits,
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
            return ad.timesCarry( yoke, bd, stateB.carry,
                function ( yoke, adTimesBd, carry ) {
                
                return then( yoke, { carry: carry, adTimesBRev: {
                    first: adTimesBd,
                    rest: stateB.adTimesBRev
                } } );
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
            return stateA.result.plusCarry( yoke, adTimesB, false,
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
BigIntPart.prototype.asZero = function ( yoke, then ) {
    var self = this;
    return self.getZeroDigits( function ( yoke, zeroDigits ) {
        return self.withDigits( yoke, zeroDigits, then );
    } );
};
BigIntPart.prototype.compareTo = function ( yoke, other, then ) {
    
    // Optimization: If either thing to compare is zero, we can avoid
    // iterating over the digits.
    var az = this.isZero();
    var bz = other.isZero();
    if ( az || bz )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, az && bz ? 0 : az ? -1 : 1 );
        } );
    
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
    divisor, carryMod, then ) {
    
    var self = this;
    if ( divisor === 0 )
        throw new Error();
    
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
            return ad.divModSmall( yoke, divisor, state.carry,
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
BigIntPart.prototype.divModSub_ = function ( yoke,
    divisor, carryMod, then ) {
    
    var self = this;
    
    // Optimization: If this segment of the bigint is just full of
    // zeros and the carry is also zero, we can just skip over the
    // whole segment.
    if ( self.isZero() && carryMod.isZero() )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, self, carryMod );
        } );
    
    var a = self.digits_;
    return jsListRev( yoke, a, function ( yoke, aRev ) {
        return jsListFoldl( yoke, {
            carry: carryMod,
            resultDigits: null
        }, aRev, function ( yoke, state, ad, then ) {
            return ad.divMod( yoke, divisor, state.carry,
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
BigIntPart.prototype.divMod = function ( yoke,
    divisor, carryMod, then ) {
    
    // TODO: See if this can be more efficient.
    
    var self = this;
    if ( divisor.isZero() )
        throw new Error();
    
    // Optimization: If this segment of the bigint is just full of
    // zeros and the carry is also zero, we can just skip over the
    // whole segment.
    if ( self.isZero() && carryMod.isZero() )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, self, carryMod );
        } );
    
    return self.getZeroDigits( yoke, function ( yoke, zeroDigits ) {
    return self.asZero( yoke, function ( yoke, zero ) {
    return zero.plusCarry( yoke, zero, true,
        function ( yoke, one, ignoredCarry ) {
    
    function digitsToNum( yoke, digits, then ) {
        return jsListAppend( yoke, digits, zeroDigits,
            function ( yoke, digits ) {
        return jsListCut( yoke, digits, zeroDigits,
            function ( yoke, digits, bigPart ) {
        return self.withDigits( yoke, digits, function ( yoke, num ) {
        
        return then( yoke, num, bigPart );
        
        } );
        } );
        } );
    }
    
    var oneDigit = one.digits_.first;
    
    return jsListAppend( yoke, self.digits_, carryMod.digits_,
        function ( yoke, remainderDigits ) {
    
    return go( yoke, remainderDigits, divisor.digits_ );
    function go( yoke, remainderDigits, divisorDigits ) {
        return digitsToNum( yoke, remainderDigits.rest,
            function ( yoke, nextRemainder, ignoredBigPart ) {
        return digitsToNum( yoke, divisorDigits.rest,
            function ( yoke, nextDivisor, ignoredBigPart ) {
        
        if ( !nextRemainder.isZero() && !nextDivisor.isZero() )
            return go( yoke,
                remainderDigits.rest, divisorDigits.rest );
        if ( !nextDivisor.isZero() )
            return then( yoke, zero, self );
        
        return divisorDigits.first.plusCarry( yoke,
            self.zeroDigit_, true,
            function ( yoke, subDivisor, carry ) {
            
            if ( carry )
                return digitsToNum( yoke, remainderDigits.rest,
                    function ( yoke, quotientTerm, ignoredBigPart ) {
                    
                    return useQuotientTerm( yoke, quotientTerm );
                } );
            
            return digitsToNum( yoke, remainderDigits,
                function ( yoke, remainder, carryDigits ) {
            return remainder.divModSub_( yoke,
                subDivisor, carryDigits.first,
                function ( yoke, quotientTerm, ignoredSubRemainder ) {
            
            if ( quotientTerm.isZero() && carryMod.isZero() )
                return self.compareTo( yoke, divisor,
                    function ( yoke, selfVsDivisor ) {
                    
                    return useQuotientTerm( yoke,
                        selfVsDivisor === 0 ? one : quotientTerm );
                } );
            return useQuotientTerm( yoke, quotientTerm );
            
            } );
            } );
            
            
            function useQuotientTerm( yoke, quotientTerm ) {
                return divisor.timesCarry( yoke, quotientTerm, zero,
                    function ( yoke, valueToSubtract, carry1 ) {
                return self.minusCarry( yoke, valueToSubtract, false,
                    function ( yoke, newSelf, carry2 ) {
                return carryMod.minusCarry( yoke, carry1, carry2,
                    function ( yoke, newCarryMod, ignoredCarry ) {
                return newSelf.divMod( yoke, divisor, newCarryMod,
                    function ( yoke, divResult, modResult ) {
                return divResult.plusCarry( yoke, quotientTerm, false,
                    function ( yoke, divResult, ignoredCarry ) {
                
                return then( yoke, divResult, modResult );
                
                } );
                } );
                } );
                } );
                } );
            }
        } );
        
        } );
        } );
    }
    
    } );
    
    } );
    } );
    } );
};
BigIntPart.prototype.timesCarrySmall = function ( yoke,
    factor, carry, then ) {
    
    var self = this;
    
    // Optimization: If this segment of the bigint is just full of
    // zeros and the carry is also zero, we can just skip over the
    // whole segment.
    if ( self.isZero() && carry === 0 )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, self, 0 );
        } );
    // Optimization: If the factor is zero and the carry is also zero,
    // we can just use a result of zero.
    if ( factor === 0 && carry === 0 )
        return self.asZero( yoke, function ( yoke, zero ) {
            return then( yoke, zero, 0 );
        } );
    
    var a = self.digits_;
    return jsListFoldl( yoke, {
        carry: carry,
        resultDigits: null
    }, a, function ( yoke, state, ad, then ) {
        return ad.timesCarrySmall( yoke, factor, state.carry,
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
    return digit.asZero( yoke, function ( yoke, zero ) {
        return digit.complement( yoke, function ( yoke, cp0 ) {
            return cp0.plusCarry( yoke, zero, true, then );
        } );
    } );
}
BigInt.prototype.plusOne = function ( yoke, then ) {
    var self = this;
    var as = self.sign_;
    if ( 0 <= as ) {
        return self.part_.asZero( yoke, function ( yoke, zero ) {
        return self.part_.plusCarry( yoke, zero, true,
            function ( yoke, result, carry ) {
        return result.maybePromoteSelfWithBooleanCarry( yoke, carry,
            function ( yoke, result ) {
        
        return then( yoke, new BigInt().init_( 1, result ) );
        
        } );
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
    }
};
BigInt.prototype.plus = function ( yoke, other, then ) {
    var self = this;
    if ( self.sign_ < other.sign_ ) {
        return other.plus( yoke, self, then );
    } else if ( (0 <= self.sign_) === (0 <= other.sign_) ) {
        return bigDigitCommensurate_( yoke, self.part_, other.part_,
            function ( yoke, a, b ) {
        return a.plusCarry( yoke, b, false,
            function ( yoke, result, carry ) {
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
        return a.plusCarry( yoke, nb, false,
            function ( yoke, result, carry ) {
        
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
    
    return bigDigitCommensurate( yoke, self.part_, other.part_,
        function ( yoke, a, b ) {
    return a.asZero( yoke, function ( yoke, zero ) {
    return a.timesCarry( yoke, b, zero,
        function ( yoke, result, carry ) {
    return result.maybePromoteSelfWithCarry( yoke, carry,
        function ( yoke, result ) {
    
    // NOTE: We normalize in case the sign is 0.
    return new BigInt().init_( 1, result ).normalize( yoke, then );
    
    } );
    } );
    } );
    } );
};
BigInt.prototype.divModTowardZero = function ( yoke, other, then ) {
    var self = this;
    
    // NOTE: These examples may clarify the following negations.
    //
    //  9  /   2  =   4  R   1  because   9  =   2  *   4  +   1
    //  9  /  -2  =  -4  R   1  because   9  =  -2  *  -4  +   1
    // -9  /   2  =  -4  R  -1  because  -9  =   2  *  -4  +  -1
    // -9  /  -2  =   4  R  -1  because  -9  =  -2  *   4  +  -1
    //
    if ( self.sign_ === -1 )
        return self.neg().divMod( yoke, other,
            function ( yoke, divResult, modResult ) {
            
            return then( yoke, divResult.neg(), modResult.neg() );
        } );
    if ( other.sign_ === -1 )
        return self.divMod( yoke, other.neg(),
            function ( yoke, divResult, modResult ) {
            
            return then( yoke, divResult.neg(), modResult );
        } );
    
    return bigDigitCommensurate( yoke, self.part_, other.part_,
        function ( yoke, a, b ) {
    return a.asZero( yoke, function ( yoke, zero ) {
    return a.divMod( yoke, b, zero,
        function ( yoke, divResult, modResult ) {
    // NOTE: We normalize in case there are new all-zero digits or the
    // sign is 0.
    return new BigInt().init_( 1, divResult ).normalize( yoke,
        function ( yoke, divResult ) {
    return new BigInt().init_( 1, modResult ).normalize( yoke,
        function ( yoke, modResult ) {
    
    return then( yoke, divResult, modResult );
    
    } );
    } );
    } );
    } );
    } );
};
// TODO: Add shiftedLeft() and shiftedRightWithRemainder(), at least
// for small numbers of bits.
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
            return digitsLeft.divModSmall( yoke, base, 0,
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
            
            return result.timesCarrySmall( yoke, base, digitValue,
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



function AvlLeaf_() {}
AvlLeaf_.prototype.init_ = function ( compare ) {
    this.compare_ = compare;
    return this;
};
AvlLeaf_.prototype.getMaybe = function ( yoke, k, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, null );
    } );
};
AvlLeaf_.prototype.minusAnything_ = function ( yoke, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, !"depthDecreased", self );
    } );
};
AvlLeaf_.prototype.minusExtremeEntry = function ( yoke,
    kPolarity, then ) {
    
    return this.minusAnything_( yoke, then );
};
AvlLeaf_.prototype.plusEntry = function ( yoke, k, v, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, !!"depthIncreased",
            new AvlBranch_().init_( k, v, {
                "-1": { branch: self, maxDepthAdvantage: null },
                "1": { branch: self, maxDepthAdvantage: null }
            } ) );
    } );
};
AvlLeaf_.prototype.minusEntry = function ( yoke, k, then ) {
    return this.minusAnything_( yoke, then );
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
AvlLeaf_.prototype.getMaxDepth = function ( yoke, then ) {
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, null );
    } );
};

function AvlBranch_() {}
AvlBranch_.prototype.init_ = function ( key, val, branches ) {
    
    // NOTE: The value of `branches` is an object of the form
    // { "-1": _, "1": _ }, where the elements are objects of the form
    // { branch: _, maxDepthAdvantage: _ }. The keys in the -1 branch
    // are less than this key, and the keys in the 1 branch are
    // greater.
    
    this.key_ = key;
    this.val_ = val;
    this.branches_ = branches;
    this.compare_ = branches[ -1 ].compare_;
    return this;
};
function safeCompare_( yoke, compare, ka, kb, then ) {
    return runWaitOne( yoke, function ( yoke ) {
    return compare( yoke, ka, kb, function ( yoke, kaVsKb ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    return then( yoke, kaVsKb < 0 ? -1 : kaVsKb === 0 ? 0 : 1 );
    
    } );
    } );
    } );
};
AvlBranch_.prototype.getMaybe = function ( yoke, k, then ) {
    var self = this;
    return safeCompare_( yoke, self.compare_, k, self.key_,
        function ( yoke, kVsSelf ) {
        
        if ( kVsSelf === 0 )
            return then( yoke, { val: self.val_ } );
        return self.branches_[ kVsSelf ].getMaybe( yoke, k, then );
    } );
};
AvlBranch_.prototype.minusExtremeEntry = function ( yoke,
    kPolarity, then ) {
    
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
    return self.branches_[ kPolarity ].minusExtremeEntry( yoke,
        kPolarity,
        function ( yoke, maxDepthDecreased, entry, branchRemaining ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( entry === null )
        return then( yoke, !!"maxDepthDecreased",
            { k: self.key_, v: self.val_ },
            self.branches_[ -kPolarity ].branch );
    
    var modifiedBranches = {};
    modifiedBranches[ kPolarity ] = { branch: branchRemaining,
        maxDepthAdvantage:
            self.branches_[ kPolarity ].maxDepthAdvantage };
    modifiedBranches[ -kPolarity ] = {
        branch: self.branches_[ -kPolarity ].branch,
        maxDepthAdvantage:
            self.branches_[ -kPolarity ].maxDepthAdvantage };
    
    if ( maxDepthDecreased )
        modifiedBranches[ -kPolarity ].maxDepthAdvantage =
            { first: null, rest:
                modifiedBranches[ -kPolarity ].maxDepthAdvantage };
    
    return avlBranchMakeBalanced_( yoke,
        self.key_, self.val_, modifiedBranches,
        function ( yoke, depthChanges, tree ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    // There are two ways the overall max depth can decrease:
    //  - Subtracting the entry from one side caused that side to stop
    //    having more max depth than the other.
    //  - Subtracting the entry from one side caused that side to have
    //    much less max depth than the other, and the other lost some
    //    depth during a rebalancing.
    var finalMaxDepthDecreased =
        (self.branches_[ kPolarity ].maxDepthAdvantage !== null
            && tree.branches_[ kPolarity ].maxDepthAdvantage === null
        ) ||
        (maxDepthDecreased
            && self.branches_[ -kPolarity ].maxDepthAdvantage !== null
            && depthChanges[ -kPolarity ].sign !== 1);
    return then( yoke, finalMaxDepthDecreased, entry, tree );
    
    } );
    } );
    
    } );
    } );
    } );
};
AvlBranch_.prototype.plusEntry = function ( yoke, k, v, then ) {
    var self = this;
    return safeCompare_( yoke, self.compare_, k, self.key_,
        function ( yoke, kVsSelf ) {
    
    if ( kVsSelf === 0 )
        return then( yoke, !"maxDepthIncreased",
            new AvlBranch_().init_( k, v, self.branches_ ) );
    
    return self.branches_[ kVsSelf ].plusEntry( yoke, k, v,
        function ( yoke, maxDepthIncreased, branchAugmented ) {
    
    var modifiedBranches = {};
    modifiedBranches[ kVsSelf ] = { branch: branchAugmented,
        maxDepthAdvantage:
            self.branches_[ kVsSelf ].maxDepthAdvantage };
    modifiedBranches[ -kVsSelf ] = self.branches_[ -kVsSelf ];
    
    if ( maxDepthIncreased )
        modifiedBranches[ kVsSelf ].maxDepthAdvantage = { first: null,
            rest: modifiedBranches[ kVsSelf ].maxDepthAdvantage };
    
    return avlBranchMakeBalanced_( yoke,
        self.key_, self.val_, modifiedBranches,
        function ( yoke, depthChanges, tree ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    // There are two ways the overall max depth can increase:
    //  - Adding the entry to one side caused that side to start
    //    having more max depth than the other.
    //  - Adding the entry to one side caused that side to have much
    //    more max depth than the other, and it didn't lose that edge
    //    during a rebalancing.
    var finalMaxDepthIncreased = maxDepthIncreased &&
        self.branches_[ -kVsSelf ].maxDepthAdvantage === null &&
        (self.branches_[ kVsSelf ].maxDepthAdvantage === null
            || (self.branches_[ kVsSelf ].maxDepthAdvantage !== null
                && depthChanges[ kVsSelf ].sign === 1));
    return then( yoke, finalMaxDepthIncreased, tree );
    
    } );
    } );
    
    } );
    
    } );
};
function avlBranchMakeBalanced_( yoke, key, val, branches, then ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    var mdLesser = branches[ -1 ].maxDepthAdvantage;
    var mdBigger = branches[ 1 ].maxDepthAdvantage;
    
    if ( (mdLesser === null && mdBigger === null)
        || (mdLesser === null && mdBigger.rest === null)
        || (mdBigger === null && mdLesser.rest === null) )
        return then( yoke, {
            "-1": { sign: 1, abs: { first: null, rest: null } },
            "1": { sign: 1, abs: { first: null, rest: null } }
        }, new AvlBranch_().init_( key, val, branches ) );
    
    if ( mdLesser === null ) {
        var deeper = 1;
    } else if ( mdBigger === null ) {
        var deeper = -1;
    } else {
        return avlBranchMakeBalanced_( yoke, key, val, {
            "-1": { branch: branches[ -1 ].branch,
                maxDepthAdvantage: mdLesser.rest },
            "1": { branch: branches[ 1 ].branch,
                maxDepthAdvantage: mdBigger.rest }
        }, then );
    }
    
    return branches[ deeper ].branch.minusExtremeEntry( yoke, -deeper,
        function ( yoke, maxDepthDecreased, entry, branchRemaining ) {
    
    if ( entry === null )
        throw new Error();
    
    return branches[ -deeper ].branch.plusEntry( yoke, key, val,
        function ( yoke, maxDepthIncreased, branchAugmented ) {
    
    var modifiedBranches = {};
    modifiedBranches[ deeper ] = { branch: branchRemaining,
        maxDepthAdvantage: branches[ deeper ].maxDepthAdvantage };
    modifiedBranches[ -deeper ] = { branch: branchAugmented,
        maxDepthAdvantage: branches[ -deeper ].maxDepthAdvantage };
    
    if ( maxDepthDecreased )
        modifiedBranches[ deeper ].maxDepthAdvantage =
            modifiedBranches[ deeper ].maxDepthAdvantage.rest;
    if ( maxDepthIncreased )
        modifiedBranches[ deeper ].maxDepthAdvantage =
            modifiedBranches[ deeper ].maxDepthAdvantage.rest;
    
    return avlBranchMakeBalanced_( yoke,
        entry.k, entry.v, modifiedBranches,
        function ( yoke, depthChanges, tree ) {
        
        var modifiedDepthChanges = {};
        
        if ( !maxDepthDecreased )
            modifiedDepthChanges[ deeper ] = depthChanges[ deeper ];
        else if ( depthChanges[ deeper ].sign === 1 )
            modifiedDepthChanges[ deeper ] = {
                sign:
                    depthChanges[ deeper ].abs.rest === null ? 0 : 1,
                abs: depthChanges[ deeper ].abs.rest
            };
        else
            modifiedDepthChanges[ deeper ] = { sign: -1, abs:
                { first: null, rest: depthChanges[ deeper ].abs } };
        
        if ( !maxDepthIncreased )
            modifiedDepthChanges[ -deeper ] = depthChanges[ -deeper ];
        else if ( depthChanges[ -deeper ].sign === -1 )
            modifiedDepthChanges[ -deeper ] = {
                sign: depthChanges[ -deeper ].abs.rest === null ?
                    0 : -1,
                abs: depthChanges[ -deeper ].abs.rest
            };
        else
            modifiedDepthChanges[ -deeper ] = { sign: 1, abs:
                { first: null, rest: depthChanges[ -deeper ].abs } };
        
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, modifiedDepthChanges, tree );
        } );
    } );
    
    } );
    
    } );
    
    } );
}
function avlBranchConcatenate_( yoke, branches, then ) {
    // NOTE: Like avlBranchMakeBalanced_(), this assumes all the
    // elements are already in the proper order, just not necessarily
    // balanced between the two branches. It's not a merge of
    // arbitrary trees. For that, see avlMerge_().
    
    function attemptShift( yoke, polarity, onFail ) {
        return branches[ -polarity ].branch.minusExtremeEntry( yoke,
            polarity,
            function ( yoke,
                maxDepthDecreased, entry, branchRemaining ) {
            
            if ( entry === null )
                return onFail( yoke );
            
            var modifiedBranches = {};
            modifiedBranches[ -polarity ] = branches[ -polarity ];
            modifiedBranches[ polarity ] = branches[ polarity ];
            
            if ( maxDepthDecreased )
                modifiedBranches[ polarity ] = {
                    branch: branches[ polarity ].branch,
                    maxDepthAdvantage: { first: null,
                        rest: branches[ polarity ].maxDepthAdvantage }
                };
            
            return avlBranchMakeBalanced_( yoke,
                entry.k, entry.v, modifiedBranches,
                function ( yoke, depthChanges, tree ) {
                
                function signedUnaryPlusOne( num ) {
                    return num.sign === -1 ?
                        { sign: num.abs.rest === null ? 0 : -1,
                            abs: num.abs.rest } :
                        { sign: 1,
                            abs: { first: null, rest: num.abs } };
                }
                
                var modifiedDepthChanges = {};
                modifiedDepthChanges[ -polarity ] =
                    signedUnaryPlusOne( depthChanges[ -polarity ] );
                modifiedDepthChanges[ polarity ] =
                    signedUnaryPlusOne( depthChanges[ polarity ] );
                
                if ( maxDepthDecreased )
                    modifiedDepthChanges[ -polarity ] =
                        depthChanges[ polarity ];
                
                return then( yoke, modifiedDepthChanges, tree );
            } );
        } );
    }
    
    return attemptShift( yoke, 1, function ( yoke ) {
        return attemptShift( yoke, -1, function ( yoke ) {
            return then( yoke,
                {
                    "-1": { sign: 0, abs: null },
                    "1": { sign: 0, abs: null }
                },
                new AvlLeaf_().init_( branches[ -1 ].branch.compare_ )
                );
        } );
    } );
}
function avlMerge_( yoke, processBoth, a, b, then ) {
    var simpleMerging = processBoth !== null;
    // TOOD: Make sure this algorithm is near-optimal both when
    // `simpleMerging` is true and when it's false. When it's false,
    // this algorithm certainly takes at least O( m + n ) time because
    // it transforms every element.
    //
    // Online forum advice for merging AVL trees seems to recommend
    // the use of sorted vectors, building the tree by bisecting the
    // vector. We don't really have bigint-indexable vectors, and
    // bisecting a bigint would have its own time complexity to worry
    // about, so that's not an obvious way forward.
    //
    // (Yes, we're worrying about bigint operation complexity while
    // not worrying about JavaScript object allocation complexity.)
    
    function toLeft( val ) {
        return simpleMerging ? val :
            { left: { val: val }, right: null };
    }
    function toRight( val ) {
        return simpleMerging ? val :
            { left: null, right: { val: val } };
    }
    function toBothKeys( left, right ) {
        return right;
    }
    function toBoth( left, right ) {
        return simpleMerging ? processBoth( left, right ) :
            { left: { val: left }, right: { val: right } };
    }
    function mapLeft( yoke, aBranch, then ) {
        if ( simpleMerging )
            return runWaitOne( yoke, function ( yoke ) {
                return then( yoke, aBranch );
            } );
        aBranch.mapShortFoldAsc( yoke, null,
            function ( yoke, state, k, v, then ) {
            
            return then( yoke, toLeft( v ), !"exitedEarly" );
        }, then );
    }
    function mapRight( yoke, bBranch, then ) {
        if ( simpleMerging )
            return runWaitOne( yoke, function ( yoke ) {
                return then( yoke, aBranch );
            } );
        bBranch.mapShortFoldAsc( yoke, null,
            function ( yoke, state, k, v, then ) {
            
            return then( yoke, toRight( v ), !"exitedEarly" );
        }, then );
    }
    
    function negativeUnaryPlusBigUnary( yoke, a, b, then ) {
        return jsListTails( yoke, a, b, function ( yoke, a, b ) {
            if ( a !== null )
                throw new Error();
            return then( yoke, b );
        } );
    }
    function unaryPlusBigUnary( yoke, a, b, then ) {
        // NOTE: By using jsListRevAppend with a short first argument,
        // we avoid iterating over the whole depth.
        return jsListRevAppend( yoke, a, b, then );
    }
    function signedUnaryPlusBigUnary( yoke, a, b, then ) {
        if ( a.sign < 0 )
            return negativeUnaryPlusBigUnary( yoke, a.abs, b, then );
        else
            return unaryPlusBigUnary( yoke, a.abs, b, then );
    }
    
    function combineBranchChanges( yoke,
        thatBranch, thatChange, otherChange, then ) {
        
        // NOTE: This can call thatChange() or otherChange()
        // synchronously.
        
        var getBranchChange = thatBranch.maxDepthAdvantage === null ?
            otherChange : thatChange;
        
        return getBranchChange( yoke,
            function ( yoke, branchChange ) {
            
            return negativeUnaryPlusUnary( yoke,
                { first: null, rest: null }, branchChange, then );
        } );
    }
    
    
    if ( a instanceof AvlLeaf_ )
        return b.getMaxDepth( yoke, function ( yoke, maxDepth ) {
            return mapRight( yoke, b, function ( yoke, b ) {
                return then( yoke,
                    { left: maxDepth, right: null }, b );
            } );
        } );
    if ( b instanceof AvlLeaf_ )
        return a.getMaxDepth( yoke, function ( yoke, maxDepth ) {
            return mapLeft( yoke, a, function ( yoke, a ) {
                return then( yoke,
                    { left: null, right: maxDepth }, a );
            } );
        } );
    
    return safeCompare_( yoke, a.compare_, a.key_, b.key_,
        function ( aVsB ) {
    
    if ( aVsB === 0 ) {
        return avlMerge_( yoke, processBoth,
            a.branches_[ -1 ].branch, b.branches[ -1 ].branch,
            function ( yoke, lesserChanges, lesser ) {
        return unaryPlusBigUnary( yoke,
            a.branches_[ -1 ].maxDepthAdvantage, lesserChanges.left,
            function ( yoke, lesserAdvantage ) {
        return avlMerge_( yoke, processBoth,
            a.branches_[ 1 ].branch, b.branches[ 1 ].branch,
            function ( yoke, biggerChanges, bigger ) {
        return unaryPlusBigUnary( yoke,
            a.branches_[ 1 ].maxDepthAdvantage, biggerChanges.left,
            function ( yoke, biggerAdvantage ) {
        
        var branches = {};
        branches[ -1 ] =
            { branch: lesser, maxDepthAdvantage: lesserAdvantage };
        branches[ 1 ] =
            { branch: bigger, maxDepthAdvantage: biggerAdvantage };
        
        return avlBranchMakeBalanced_( yoke,
            toBothKeys( a.key_, b.key_ ), toBoth( a.val_, b.val_ ),
            branches,
            function ( yoke, balancedChanges, balanced ) {
        
        // TODO: See if iterating over `balancedChanges` makes
        // avlMerge_() less efficient than it could be.
        return combineBranchChanges( yoke, a.branches_[ -1 ],
            function ( yoke, then ) {
                return signedUnaryPlusBigUnary( yoke,
                    balancedChanges[ -1 ], lesserChanges.left, then );
            }, function ( yoke, then ) {
                return signedUnaryPlusBigUnary( yoke,
                    balancedChanges[ 1 ], biggerChanges.left, then );
            }, function ( yoke, aChange ) {
        return combineBranchChanges( yoke, b.branches_[ -1 ],
            function ( yoke, then ) {
                return signedUnaryPlusBigUnary( yoke,
                    balancedChanges[ -1 ], lesserChanges.right, then
                    );
            }, function ( yoke, then ) {
                return signedUnaryPlusBigUnary( yoke,
                    balancedChanges[ 1 ], biggerChanges.right, then );
            }, function ( yoke, aChange ) {
        
        var finalMaxDepthChanges = { left: aChange, right: bChange };
        // TODO: Change `finalMaxDepthChanges` based on the depth
        // changes.
        return then( yoke, finalMaxDepthChanges, balanced );
        
        } );
        } );
        
        } );
        
        } );
        } );
        } );
        } );
    } else {
        // TODO: See if this case would be more efficient if we
        // sometimes merged `a.branches_[ -aVsB ].branch` and `b`
        // instead. We'd probably need to know which of `a` and `b` is
        // smallest, and then merge it with the smallest branch of the
        // other.
        
        return avlMerge_( yoke, processBoth,
            a, b.branches_[ aVsB ].branch,
            function ( yoke, mergedChanges, mergedBranch ) {
        return mapRight( yoke, b.branches_[ -aVsB ].branch,
            function ( yoke, unmergedBranch ) {
        return unaryPlusBigUnary( yoke,
            b.branches_[ aVsB ].maxDepthAdvantage,
            mergedChanges.right,
            function ( yoke, mergedAdvantage ) {
        
        var branches = {};
        branches[ aVsB ] = { branch: mergedBranch,
            maxDepthAdvantage: mergedAdvantage };
        branches[ -aVsB ] = { branch: unmergedBranch,
            maxDepthAdvantage:
                b.branches_[ -aVsB ].maxDepthAdvantage };
        
        return avlBranchMakeBalanced_( yoke,
            b.key_, toRight( b.val_ ), branches,
            function ( yoke, balancedChanges, balanced ) {
        // TODO: See if iterating over `balancedChanges[ aVsB ]` and
        // `balancedChanges[ -aVsB ]` makes avlMerge_() less efficient
        // than it could be.
        return signedUnaryPlusBigUnary( yoke,
            balancedChanges[ aVsB ], mergedChanges.left,
            function ( yoke, aChange ) {
        return combineBranchChanges( yoke, b.branches_[ aVsB ],
            function ( yoke, then ) {
                return signedUnaryPlusBigUnary( yoke,
                    balancedChanges[ aVsB ], mergedChanges.right, then
                    );
            }, function ( yoke, then ) {
                return signedUnaryPlusBigUnary( yoke,
                    balancedChanges[ -aVsB ], null, then );
            }, function ( yoke, bChange ) {
        
        var finalMaxDepthChanges = { left: aChange, right: bChange };
        return then( yoke, finalMaxDepthChanges, balanced );
        
        } );
        } );
        } );
        
        } );
        } );
        } );
    }
    
    } );
}
AvlBranch_.prototype.minusEntry = function ( yoke, k, then ) {
    var self = this;
    return safeCompare_( yoke, self.compare_, k, self.key_,
        function ( yoke, kVsSelf ) {
    
    if ( kVsSelf === 0 )
        return avlBranchConcatenate_( yoke, self.branches_,
            function ( yoke, depthChanges, tree ) {
            
            var maxDepthDecreased = !(depthChanges[ -1 ].sign === 1 &&
                depthChanges[ 1 ].sign === 1);
            return then( yoke, maxDepthDecreased, tree );
        } );
    
    return self.branches_[ kVsSelf ].branch.minusEntry( yoke, k,
        function ( yoke, maxDepthDecreased, branchRemaining ) {
    
    var modifiedBranches = {};
    modifiedBranches[ kVsSelf ] = { branch: branchRemaining,
        maxDepthAdvantage:
            self.branches_[ kVsSelf ].maxDepthAdvantage };
    modifiedBranches[ -kVsSelf ] = {
        branch: self.branches_[ -kVsSelf ].branch,
        maxDepthAdvantage:
            self.branches_[ -kVsSelf ].maxDepthAdvantage
    };
    
    if ( maxDepthDecreased )
        modifiedBranches[ -kVsSelf ].maxDepthAdvantage =
            { first: null,
                rest: self.branches_[ -kVsSelf ].maxDepthAdvantage };
    
    return avlBranchMakeBalanced_( yoke,
        self.key_, self.val_, modifiedBranches,
        function ( yoke, depthChanges, tree ) {
    
    // There are two ways the overall max depth can decrease:
    //  - Subtracting the entry from one side caused that side to stop
    //    having more max depth than the other.
    //  - Subtracting the entry from one side caused that side to have
    //    much less max depth than the other, and the other lost some
    //    depth during a rebalancing.
    var finalMaxDepthDecreased =
        (self.branches_[ kVsSelf ].maxDepthAdvantage !== null
            && tree.branches_[ kVsSelf ].maxDepthAdvantage === null
        ) ||
        (maxDepthDecreased
            && self.branches_[ -kVsSelf ].maxDepthAdvantage !== null
            && depthChanges[ -kVsSelf ].sign !== 1);
    return then( yoke, finalMaxDepthDecreased, tree );
    
    } );
    
    } );
    
    } );
};
// NOTE: This body takes its args as ( yoke, state, k, v, then ).
AvlBranch_.prototype.shortFoldAsc = function ( yoke,
    state, body, then ) {
    
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
    return self.branches_[ -1 ].branch.shortFoldAsc( yoke,
        state, body,
        function ( yoke, state, exitedEarly ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( exitedEarly )
        return then( yoke, state, !!"exitedEarly" );
    
    return body( yoke, state, self.key_, self.val_,
        function ( yoke, state, exitedEarly ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( exitedEarly )
        return then( yoke, state, !!"exitedEarly" );
    
    return self.branches_[ 1 ].branch.shortFoldAsc( yoke,
        state, body, then );
    
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
    return self.branches_[ -1 ].branch.mapShortFoldAsc( yoke,
        state, body,
        function ( yoke, state, maybeLesserResult ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( maybeLesserResult === null )
        return then( yoke, state, null );
    
    return body( yoke, state, self.key_, self.val_,
        function ( yoke, state, maybeThisResult ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( maybeThisResult === null )
        return then( yoke, state, null );
    
    return self.branches[ 1 ].branch.mapShortFoldAsc( yoke,
        state, body,
        function ( yoke, state, maybeBiggerResult ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( maybeBiggerResult === null )
        return then( yoke, state, null );
    
    return then( yoke, state, { val: new AvlBranch_().init_(
        self.key_, maybeThisResult, {
            "-1": { branch: maybeLesserResult.val,
                maxDepthAdvantage:
                    self.branches[ -1 ].maxDepthAdvantage },
            "1": { branch: maybeBiggerResult.val,
                maxDepthAdvantage:
                    self.branches[ 1 ].maxDepthAdvantage }
        } ) } );
    
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
AvlBranch_.prototype.getMaxDepth = function ( yoke, then ) {
    var self = this;
    var bias =
        self.branches_[ -1 ].maxDepthAdvantage === null ? 1 : -1;
    return runWaitOne( yoke, function ( yoke ) {
    return self.branches_[ bias ].getMaxDepth( yoke,
        function ( yoke, subHeight ) {
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
function avlMap( compare ) {
    return new AvlMap().init_( new AvlLeaf_().init_( compare ) );
}
AvlMap.prototype.getMaybe = function ( yoke, k, then ) {
    return this.contents_.getMaybe( yoke, k, then );
};
AvlMap.prototype.minusEntry = function ( yoke, k, then ) {
    return this.contents_.minusEntry( yoke, k,
        function ( yoke, maxDepthDecreased, newContents ) {
        
        return then( yoke, new AvlMap().init_( newContents ) );
    } );
};
AvlMap.prototype.plusEntry = function ( yoke, k, v, then ) {
    var self = this;
    return this.contents_.plusEntry( yoke, k, v,
        function ( yoke, maxDepthIncreased, newContents ) {
        
        return then( yoke, new AvlMap().init_( newContents ) );
    } );
};
AvlMap.prototype.plusObj = function ( yoke, obj, then ) {
    // NOTE: This adds the entries in the reverse order they're found
    // in the object, but that's okay because the order of entries in
    // this map is entirely determined by its comparator.
    var entries = null;
    // TODO: Implement objOwnEach() for the purposes of this file.
    objOwnEach( obj, function ( k, v ) {
        entries = { first: { k: k, v: v }, rest: entries };
    } );
    return go( entries, this );
    function go( entries, total ) {
        return runWaitOne( yoke, function ( yoke ) {
            if ( entries === null )
                return then( yoke, total );
            return total.plusEntry( yoke,
                entries.first.k, entries.first.v,
                function ( yoke, total ) {
                
                return go( entries.rest, total );
            } );
        } );
    }
};
AvlMap.prototype.plus = function ( yoke, other, then ) {
    var self = this;
    if ( !(other instanceof AvlMap) )
        throw new Error();
    return avlMerge_( yoke,
        function ( a, b ) {
            return b;
        },
        self.contents_, other.contents_,
        function ( yoke, depthChanges, result ) {
        
        return then( yoke, new AvlMap().init_( result ) );
    } );
};
// TODO: Find a better name for this.
AvlMap.prototype.plusTruth = function ( yoke, k, then ) {
    return this.plusEntry( yoke, k, true, then );
};
// TODO: Find a better name for this.
AvlMap.prototype.plusArrTruth = function ( yoke, arr, then ) {
    // NOTE: This adds the entries in reverse order, but that's okay
    // because the order of entries in this map is entirely determined
    // by its comparator.
    var entries = null;
    // TODO: Implement arrEach() for the purposes of this file.
    arrEach( arr, function ( elem ) {
        entries = { first: elem, rest: entries };
    } );
    return go( entries, this );
    function go( entries, total ) {
        return runWaitOne( yoke, function ( yoke ) {
            if ( entries === null )
                return then( yoke, total );
            return total.plusTruth( yoke, entries.first,
                function ( yoke, total ) {
                
                return go( entries.rest, total );
            } );
        } );
    }
};
// NOTE: This body takes its args as ( yoke, k, v, then ).
AvlMap.prototype.any = function ( yoke, body, then ) {
    return this.contents_.shortFoldAsc( yoke, false,
        function ( yoke, state, k, v, then ) {
        
        return body( yoke, k, v, function ( yoke, result ) {
            if ( result )
                return then( yoke, result, !!"exitedEarly" );
            return then( yoke, state, !"exitedEarly" );
        } );
    }, function ( yoke, state, exitedEarly ) {
        return then( yoke, state );
    } );
};
AvlMap.prototype.hasAny = function () {
    return this.contents_.hasAny();
};
// NOTE: This body takes its args as ( yoke, k, v, then ).
AvlMap.prototype.each = function ( yoke, body, then ) {
    return this.any( yoke, function ( yoke, k, v, then ) {
        return body( yoke, k, v, function ( yoke ) {
            return then( yoke, !"exitedEarly" );
        } );
    }, function ( yoke, ignoredFalse ) {
        return then( yoke );
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

// NOTE: This is only meant for simple thunks that are memoizable and
// safe to run more than once concurrently. If the thunk has completed
// at least once so far, then it won't ever begin executing again
// because its existing result will be reused.
function makeLazy( isActuallyLazy, go ) {
    var lazyObj = {};
    lazyObj.go = !isActuallyLazy ? go : function ( yoke, then ) {
        return go( yoke, function ( yoke, result ) {
            lazyObj.go = function ( yoke, then ) {
                return runWaitOne( yoke, function ( yoke ) {
                    return then( yoke, result );
                } );
            };
            return then( yoke, result );
        } );
    };
    return lazyObj;
}
function makeSyncLazy( isActuallyLazy, go ) {
    return makeLazy( isActuallyLazy, function ( yoke, then ) {
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, go() );
        } );
    } );
}
function makeImmediateLazy( result ) {
    return makeSyncLazy( !"isActuallyLazy", function () {
        return result;
    } );
}

function arrPlusWithPolarity( polarity, a, b ) {
    if ( polarity === 1 )
        return [].concat( a, b );
    else
        return [].concat( b, a );
}
function arrCutWithPolarity( polarity, arr, start, stop ) {
    if ( polarity === 1 )
        return arr.slice( start, stop );
    else
        return arr.slice(
            arr.length - 1 - start, arr.length - 1 - stop );
}

// Finger trees have three cases and four methods:
//
// FingerTreeEmpty
// FingerTreeSingle
// FingerTreeDeep
//
// tree.push( yoke, polarity, element, then( yoke, tree ) )
// tree.pop( yoke, polarity, then( yoke, maybeElement, tree ) );
// tree.getSummaryStack( yoke, then( yoke, summaryStack ) )
// tree.split( yoke, summarySoFar, summaryStack, polarity,
//     testIsEarly( yoke, summary, then( yoke, isEarly ) ),
//     onFellOff( yoke, summarySoFar ),
//     onCompleted( yoke, earlyTree, LateTree ) )
//
// Each case also relies on a `meta` object with three properties:
//
// boolean meta.lazy
// meta.measure( yoke, element, then( yoke, summary ) )
// meta.plus( yoke, arrayOfSummaries, then( yoke, summary ) )
//
// When `meta.lazy` is `true`, the `push` and `pop` operations run in
// amortized constant time, and the `getSummaryStack` and `split`
// operations run in logarithmic time. (TODO: Is that true?) All lazy
// thunks created this way have the same space footprint before and
// after.
//
// When it's `false`, all four of these operations run in logarithmic
// time. (TODO: Is that true?)

function FingerTreeEmpty() {}
FingerTreeEmpty.prototype.init_ = function ( meta ) {
    this.meta_ = meta;
    return this;
};
FingerTreeEmpty.prototype.push = function ( yoke,
    polarity, element, then ) {
    
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke,
            new FingerTreeSingle().init_( self.meta_, element ) );
    } );
};
FingerTreeEmpty.prototype.pop = function ( yoke, polarity, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, null, self );
    } );
};
FingerTreeEmpty.prototype.getSummaryStack = function ( yoke, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
    return self.meta_.plus( yoke, [], function ( yoke, zero ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    return then( yoke, { first: zero, rest: null } );
    
    } );
    } );
    } );
};
FingerTreeEmpty.prototype.split = function ( yoke, summarySoFar,
    summaryStack, polarity, testIsEarly, onFellOff, onCompleted ) {
    
    return runWaitOne( yoke, function ( yoke ) {
        return onFellOff( yoke, summarySoFar );
    } );
};

function FingerTreeSingle() {}
FingerTreeSingle.prototype.init_ = function ( meta, element ) {
    this.meta_ = meta;
    this.element_ = element;
    return this;
};
FingerTreeSingle.prototype.push = function ( yoke,
    polarity, element, then ) {
    
    var self = this;
    
    var digits = {};
    digits[ -polarity ] = [ self.element_ ];
    digits[ polarity ] = [ element ];
    
    var subMeta = {};
    subMeta.lazy = self.meta_.lazy;
    subMeta.measure = function ( yoke, node, then ) {
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, node.summary );
        } );
    };
    subMeta.plus = self.meta_.plus;
    
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke,
            new FingerTreeDeep().init_( self.meta_, digits,
                makeImmediateLazy(
                    new FingerTreeEmpty().init_( subMeta ) ) ) );
    } );
};
FingerTreeSingle.prototype.pop = function ( yoke, polarity, then ) {
    var self = this;
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke, { val: self.element_ },
            new FingerTreeEmpty().init_( self.meta_ ) );
    } );
};
FingerTreeSingle.prototype.getSummaryStack = function ( yoke, then ) {
    return this.meta_.measure( yoke, this.element_,
        function ( yoke, summary ) {
        
        return then( yoke, { first: summary, rest: null } );
    } );
};
FingerTreeSingle.prototype.split = function ( yoke, summarySoFar,
    summaryStack, polarity, testIsEarly, onFellOff, onCompleted ) {
    
    var self = this;
    
    return self.meta_.measure( yoke, self.element_,
        function ( yoke, summary ) {
    return self.meta_.plus( yoke,
        arrPlusWithPolarity(
            polarity, [ summary ], [ summarySoFar ] ),
        function ( yoke, summarySoFar ) {
    return testIsEarly( yoke, summarySoFar,
        function ( yoke, isEarly ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( isEarly )
        return onFellOff( yoke, summarySoFar );
    
    var empty = new FingerTreeEmpty().init_( self.meta_ );
    return onCompleted( yoke, empty, self );
    
    } );
    } );
    } );
    } );
};

function FingerTreeDeep() {}
FingerTreeDeep.prototype.init_ = function ( meta, digits, lazyNext ) {
    
    // NOTE: The value of `digits` is an object of the form
    // { "-1": _, "1": _ }, where the elements are Arrays of one to
    // four elements. The elements in the -1 branch are the first
    // ones, and the keys in the 1 branch are the last ones.
    
    // NOTE: The value of `lazyNext` is a `makeLazy()` object that
    // calculates a finger tree containing "nodes" containing the type
    // of elements of this finger tree. A node is an object of the
    // form { summary: _, elements: _ }, where `elements` is an Array
    // of two or three elements.
    
    this.meta_ = meta;
    this.digits_ = digits;
    this.lazyNext_ = lazyNext;
    return this;
};
FingerTreeDeep.prototype.push = function ( yoke,
    polarity, element, then ) {
    
    var self = this;
    
    var digits = {};
    digits[ -polarity ] = self.digits_[ -polarity ];
    
    if ( self.digits_[ polarity ].length === 4 ) {
        digits[ polarity ] = arrPlusWithPolarity( polarity,
            arrCutWithPolarity(
                polarity, self.digits_[ polarity ], 3, 4 ),
            [ element ] );
        var newNodeElements = arrCutWithPolarity(
            polarity, self.digits_[ polarity ], 0, 3 );
        var newNodeElement0 = arrCutWithPolarity(
            polarity, newNodeElements, 0, 1 )[ 0 ];
        var newNodeElement1 = arrCutWithPolarity(
            polarity, newNodeElements, 1, 2 )[ 0 ];
        var newNodeElement2 = arrCutWithPolarity(
            polarity, newNodeElements, 2, 3 )[ 0 ];
        
        return self.meta_.measure( yoke, newNodeElement0,
            function ( yoke, summary0 ) {
        return self.meta_.measure( yoke, newNodeElement1,
            function ( yoke, summary1 ) {
        return self.meta_.measure( yoke, newNodeElement2,
            function ( yoke, summary2 ) {
        
        var summaries01 = arrCatWithPolarity(
            polarity, [ summary0 ], [ summary1 ] );
        var summaries012 = arrCatWithPolarity(
            polarity, summaries01, [ summary2 ] );
        
        return self.meta_.plus( yoke, summaries012,
            function ( yoke, newNodeSummary ) {
        
        var newNode =
            { summary: newNodeSummary, elements: newNodeElements };
        var oldLazyNext = self.lazyNext_;
        
        return then( yoke,
            new FingerTreeDeep().init_( self.meta_, digits,
                makeLazy( self.meta_.lazy, function ( yoke, then ) {
                    // NOTE: This `makeLazy()` isn't constant-time, so
                    // it's impure. It does have the same space
                    // footprint before and after.
                    
                    return runWaitOne( yoke, function ( yoke ) {
                    return oldLazyNext.go( yoke,
                        function ( yoke, oldNext ) {
                    return runWaitOne( yoke, function ( yoke ) {
                    
                    return oldNext.push( yoke,
                        polarity, newNode, then );
                    
                    } );
                    } );
                    } );
                } ) ) );
        
        } );
        
        } );
        } );
        } );
    } else {
        digits[ polarity ] = arrPlusWithPolarity(
            polarity, self.digits_[ polarity ], [ element ] );
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke,
                new FingerTreeDeep().init_(
                    self.meta_, digits, self.lazyNext_ ) );
        } );
    }
};
FingerTreeDeep.prototype.pop = function ( yoke, polarity, then ) {
    var self = this;
    var n = self.digits_[ polarity ].length;
    var digits = {};
    digits[ -polarity ] = self.digits_[ -polarity ];
    digits[ polarity ] = arrCutWithPolarity(
        polarity, self.digits_[ polarity ], 0, n - 1 );
    var poppedElement = arrCutWithPolarity(
        polarity, self.digits_[ polarity ], n - 1, n )[ 0 ];
    return makeFingerTreeMaybeDeep( yoke,
        polarity, self.meta_, digits, self.lazyNext_,
        function ( yoke, tree ) {
        
        return then( yoke, { val: poppedElement }, tree );
    } );
};
FingerTreeDeep.prototype.getSummaryStack = function ( yoke, then ) {
    var self = this;
    return self.lazyNext_.go( yoke, function ( yoke, next ) {
    return next.getSummaryStack( yoke,
        function ( yoke, nextSummaryStack ) {
    return arrFoldlAsync( yoke, nextSummaryStack.first,
        self.digits_[ -1 ].slice().reverse(),
        function ( yoke, total, elem, then ) {
        
        return self.meta_.measure( yoke, elem,
            function ( yoke, summary ) {
            
            return self.meta_.plus( yoke, [ summary, total ], then );
        } );
    }, function ( yoke, total ) {
    return arrFoldlAsync( yoke, total, self.digits_[ 1 ],
        function ( yoke, total, elem, then ) {
        
        return self.meta_.measure( yoke, elem,
            function ( yoke, summary ) {
            
            return self.meta_.plus( yoke, [ total, summary ], then );
        } );
    }, function ( yoke, total ) {
    
    return then( yoke, { first: total, rest: nextSummaryStack } );
    
    } );
    } );
    } );
    } );
};
FingerTreeDeep.prototype.split = function ( yoke, summarySoFar,
    summaryStack, polarity, testIsEarly, onFellOff, onCompleted ) {
    
    var self = this;
    
    if ( summaryStack === null )
        throw new Error();
    
    function tryDigit( yoke, summarySoFar, digitElements, then ) {
        return jsListShortFoldl( yoke,
            { summarySoFar: summarySoFar, i: 0 },
            jsListFromSmallArr( polarity === 1 ?
                digitElements.slice().reverse() : digitElements ),
            function ( yoke, state, elem, then ) {
            
            return self.meta_.measure( yoke, elem,
                function ( yoke, summary ) {
            return self.meta_.plus( yoke,
                arrPlusWithPolarity( polarity,
                    [ summary ], [ state.summarySoFar ] ),
                function ( yoke, summarySoFar ) {
            return testIsEarly( yoke, summarySoFar,
                function ( yoke, isEarly ) {
            
            if ( isEarly )
                return then( yoke,
                    { summarySoFar: summarySoFar, i: state.i + 1 },
                    !"exitedEarly" );
            else
                return then( yoke, state.i, !!"exitedEarly" );
            
            } );
            } );
            } );
        }, then );
    }
    
    return self.meta_.plus( yoke,
        [ summarySoFar, summaryStack.first ],
        function ( yoke, summary ) {
    return testIsEarly( yoke, summary, function ( yoke, isEarly ) {
    return runWaitOne( yoke, function ( yoke ) {
    
    if ( isEarly )
        return onFellOff( yoke, summary );
    
    // Try each of the `polarity`-side digits.
    return tryDigit( yoke, summarySoFar, self.digits_[ polarity ],
        function ( yoke, state, exitedEarly ) {
    
    if ( exitedEarly ) {
        var n = self.digits_[ polarity ].length;
        var lateDigits = {};
        lateDigits[ -polarity ] = self.digits_[ -polarity ];
        lateDigits[ polarity ] = arrCutWithPolarity(
            polarity, self.digits_[ polarity ], 0, n - state.i );
        var earlyDigits = arrCutWithPolarity(
            polarity, self.digits_[ polarity ], n - state.i, n );
        
        return fingerTreePushArr( yoke,
            new FingerTreeEmpty().init_( self.meta_ ),
            polarity,
            polarity === 1 ?
                earlyDigits : earlyDigits.slice().reverse(),
            function ( yoke, earlyTree ) {
        return makeFingerTreeMaybeDeep( yoke, polarity,
            self.meta_, lateDigits, self.lazyNext_,
            function ( yoke, lateTree ) {
        
        return onCompleted( yoke, earlyTree, lateTree );
        
        } );
        } );
    }
    
    
    // Try a recursive call on the `lazyNext_`.
    return self.lazyNext_.go( yoke, function ( yoke, nextTree ) {
    
    return nextTree.split( yoke,
        state.summarySoFar, summaryStack.rest, polarity, testIsEarly,
        nextStep,
        function ( yoke, earlyTree, lateTree ) {
            return fingerTreePushArr( yoke, earlyTree,
                polarity,
                polarity === 1 ?
                    self.digits_[ polarity ] :
                    self.digits_[ polarity ].slice().reverse(),
                function ( yoke, earlyTree ) {
            return fingerTreePushArr( yoke, lateTree,
                -polarity,
                -polarity === 1 ?
                    self.digits_[ -polarity ] :
                    self.digits_[ -polarity ].slice().reverse(),
                function ( yoke, lateTree ) {
            
            return onCompleted( yoke, earlyTree, lateTree );
            
            } );
            } );
        } );
    function nextStep( yoke, summarySoFar ) {
    
    
    // Try each of the `-polarity`-side digits.
    return tryDigit( yoke, summarySoFar, self.digits_[ -polarity ],
        function ( yoke, state, exitedEarly ) {
    
    if ( exitedEarly ) {
        var n = self.digits_[ -polarity ].length;
        var earlyDigits = {};
        earlyDigits[ polarity ] = self.digits_[ polarity ];
        earlyDigits[ -polarity ] = arrCutWithPolarity(
            polarity, self.digits_[ -polarity ], n - state.i, n );
        var lateDigits = arrCutWithPolarity(
            polarity, self.digits_[ -polarity ], 0, n - state.i );
        
        return makeFingerTreeMaybeDeep( yoke, polarity,
            self.meta_, earlyDigits, self.lazyNext_,
            function ( yoke, earlyTree ) {
        return fingerTreePushArr( yoke,
            new FingerTreeEmpty().init_( self.meta_ ),
            -polarity,
            -polarity === 1 ?
                lateDigits : lateDigits.slice().reverse(),
            function ( yoke, lateTree ) {
        
        return onCompleted( yoke, earlyTree, lateTree );
        
        } );
        } );
    }
    
    return onFellOff( yoke, state.summarySoFar );
    
    
    } );
    
    
    }
    
    } );
    
    
    } );
    
    } );
    } );
    } );
};


function makeFingerTreeMaybeDeep( yoke,
    polarity, meta, digits, lazyNext, then ) {
    
    if ( digits[ polarity ].length === 0 ) {
        return lazyNext.go( yoke, function ( yoke, next ) {
        return next.pop( yoke, polarity,
            function ( yoke, maybeNode, rest ) {
        return runWaitOne( yoke, function ( yoke ) {
        
        if ( maybeNode === null ) {
            return fingerTreePushArr( yoke,
                new FingerTreeEmpty().init_( meta ),
                -polarity,
                polarity === 1 ?
                    digits[ -1 ].slice().reverse() :
                    digits[ 1 ],
                function ( yoke, tree ) {
                
                return then( yoke, tree );
            } );
        } else {
            var newDigits = {};
            newDigits[ -polarity ] = digits[ -polarity ];
            newDigits[ polarity ] = maybeNode.val.elements;
            return then( yoke,
                new FingerTreeDeep().init_(
                    meta, newDigits, makeImmediateLazy( rest ) ) );
        }
        
        } );
        } );
        } );
    } else {
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke,
                new FingerTreeDeep().init_( meta, digits, lazyNext )
                );
        } );
    }
}
// NOTE: If the `polarity` is `-1`, this will push the elements so
// they're in the opposite order as they are in the original Array.
function fingerTreePushArr( yoke, tree, polarity, elems, then ) {
    if ( elems.length === 0 )
        return runWaitOne( yoke, function ( yoke ) {
            return then( yoke, tree );
        } );
    return tree.push( yoke, polarity, elems[ 0 ],
        function ( yoke, tree ) {
        
        return fingerTreePushArr( yoke,
            tree, polarity, elems.slice( 1 ) );
    } );
}
function fingerTreeCat( yoke, a, middleElems, b, then ) {
    if ( a instanceof FingerTreeEmpty )
        return fingerTreePushArr( yoke, b, -1,
            middleElems.slice().reverse(), then );
    if ( b instanceof FingerTreeEmpty )
        return fingerTreePushArr( yoke, a, 1, middleElems, then );
    if ( a instanceof FingerTreeSingle )
        return fingerTreePushArr( yoke, b, -1,
            middleElems.slice().reverse().concat(
                [ a.element_ ] ),
            then );
    if ( b instanceof FingerTreeSingle )
        return fingerTreePushArr( yoke, a, 1,
            middleElems.concat( [ b.element_ ] ), then );
    
    var digits = {};
    digits[ -1 ] = a.digits_[ -1 ];
    digits[ 1 ] = b.digits_[ 1 ];
    var aNext = a.lazyNext_;
    var bNext = b.lazyNext_;
    var nextMiddleElems =
        [].concat( a.digits_[ 1 ], middleElems, b.digits_[ -1 ] );
    return runWaitOne( yoke, function ( yoke ) {
        return then( yoke,
            new FingerTreeDeep().init_( a.meta_, digits,
                makeLazy( a.meta_.lazy, function ( yoke, then ) {
                    // NOTE: This `makeLazy()` isn't constant-time, so
                    // it's impure. It does have the same space
                    // footprint before and after.
                    
                    return runWaitOne( yoke, function ( yoke ) {
                    return aNext.go( yoke, function ( yoke, aNext ) {
                    return runWaitOne( yoke, function ( yoke ) {
                    return bNext.go( yoke, function ( yoke, bNext ) {
                    return runWaitOne( yoke, function ( yoke ) {
                    
                    return fingerTreeCat( yoke,
                        aNext, nextMiddleElems, bNext, then );
                    
                    } );
                    } );
                    } );
                    } );
                    } );
                } ) ) );
    } );
}
// This looks through every segment of the tree starting from the end
// that corresponds with `polarity` until it can drill down to the one
// element whose summary doesn't satisfy the asynchronous predicate
// `testIsEarly( yoke, summary, then( yoke, isEarly ) )`. It calls
// `then( yoke, earlyTree, lateTree )` with a tree containing the
// early elements and a tree containing the rest. (Note that if the
// polarity is 1, the `earlyTree` will be a suffix of the original
// tree, and `lateTree` will be a prefix.)
//
// The `testIsEarly` function is expected to satisfy certain
// properties with regard to the measurement monoid:
//
//   early (a + b) -> early a
//   early 0
//
// This allows us to scan over aggregate summaries (the `summary`
// property of { summary: _, elements: _ } node objects) and determine
// they're fully early without having to drill down and scan them for
// exceptional prefixes.
//
// NOTE: This operation doesn't follow quite the same contract as
// Hinze and Paterson's `splitTree`. In particular, where we use
// `testIsEarly`, they use the complement of that predicate, and where
// we split the tree into two trees, they split it into two trees and
// a first non-early element in between, which their operation
// requires to exist.
//
function fingerTreeSplit( yoke, tree, polarity, testIsEarly, then ) {
    var self = this;
    
    return tree.getSummaryStack( yoke,
        function ( yoke, summaryStack ) {
    return tree.meta_.plus( yoke, [], function ( yoke, zero ) {
    
    return tree.split( yoke,
        zero, summaryStack, polarity, testIsEarly,
        function ( yoke, summarySoFar ) {
            // Apparently everything is early.
            var empty = new FingerTreeEmpty().init_( tree.meta_ );
            return then( yoke, tree, empty );
        },
        then );
    
    } );
    } );
}
