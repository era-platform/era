// era-misc-strmap-avl.js
// Copyright 2013-2015 Ross Angle. Released under the MIT License.
"use strict";


function strAvlRotateLesserToBigger( lesser, bigger, k, v, balance ) {
    // The depth of `bigger` should be exactly one less than `balance`
    // would suggest. Everything in `lesser` should be lesser than
    // `k`, and everything in `bigger` should be bigger.
    
    // The result's `depthDecreased` is stated relative to a supposed
    // original tree where `bigger` went one level deeper and
    // `balance` was accurate.
    
    if ( balance === "lesser" ) {
        // The "lmb" stands for "lesser minusBiggest_".
        var lmb = { key: k, val: v,
            shrunk: { depthDecreased: false, after: lesser } };
        
        // The "bp" stands for "bigger plusEntry_".
        var bp = { depthIncreased: false, after: bigger };
        
        while ( !(false
            || lmb.shrunk.depthDecreased
            || bp.depthIncreased
        ) ) {
            
            // TODO: This might do unnecessary comparisons, since we
            // already know the key is the least value in this
            // subtree. Stop that.
            bp = bp.after.plusEntry_( lmb.key, lmb.val );
            
            lmb = lmb.shrunk.after.minusBiggest_();
            if ( lmb === null )
                throw new Error();
        }
        
        return { depthDecreased: lmb.shrunk.depthDecreased,
            after: new StrAvlBranch_( lmb.shrunk.after, bp.after,
                lmb.key, lmb.val,
                lmb.shrunk.depthDecreased && bp.depthIncreased ?
                    "balanced" : "lesser" ) };
    } else if ( balance === "balanced" ) {
        return { depthDecreased: false, after:
            new StrAvlBranch_( lesser, bigger, k, v, "lesser" ) };
    } else if ( balance === "bigger" ) {
        return { depthDecreased: true, after:
            new StrAvlBranch_( lesser, bigger, k, v, "balanced" ) };
    } else {
        throw new Error();
    }
}
function strAvlRotateBiggerToLesser( lesser, bigger, k, v, balance ) {
    // The depth of `lesser` should be exactly one less than `balance`
    // would suggest. Everything in `lesser` should be lesser than
    // `k`, and everything in `bigger` should be bigger.
    
    // The result's `depthDecreased` is stated relative to a supposed
    // original tree where `lesser` went one level deeper and
    // `balance` was accurate.
    
    if ( balance === "lesser" ) {
        return { depthDecreased: true, after:
            new StrAvlBranch_( lesser, bigger, k, v, "balanced" ) };
    } else if ( balance === "balanced" ) {
        return { depthDecreased: false, after:
            new StrAvlBranch_( lesser, bigger, k, v, "bigger" ) };
    } else if ( balance === "bigger" ) {
        // The "bml" stands for "bigger minusLeast_".
        var bml = { key: k, val: v,
            shrunk: { depthDecreased: false, after: bigger } };
        
        // The "lp" stands for "lesser plusEntry_".
        var lp = { depthIncreased: false, after: lesser };
        
        while ( !(false
            || bml.shrunk.depthDecreased
            || lp.depthIncreased
        ) ) {
            
            // TODO: This might do unnecessary comparisons, since we
            // already know the key is the least value in this
            // subtree. Stop that.
            lp = lp.after.plusEntry_( bml.key, bml.val );
            
            bml = bml.shrunk.after.minusLeast_();
            if ( bml === null )
                throw new Error();
        }
        
        return { depthDecreased: bml.shrunk.depthDecreased,
            after: new StrAvlBranch_( lp.after, bml.shrunk.after,
                bml.key, bml.val,
                bml.shrunk.depthDecreased && lp.depthIncreased ?
                    "balanced" : "bigger" ) };
    } else {
        throw new Error();
    }
}

function StrAvlLeaf_() {}
StrAvlLeaf_.prototype.has = function ( k ) {
    return false;
};
StrAvlLeaf_.prototype.get = function ( k ) {
    return void 0;
};
StrAvlLeaf_.prototype.minusEntry_ = function ( k ) {
    return { depthDecreased: false, after: this };
};
StrAvlLeaf_.prototype.minusLeast_ = function () {
    return null;
};
StrAvlLeaf_.prototype.minusBiggest_ = function () {
    return null;
};
StrAvlLeaf_.prototype.plusEntry_ = function ( k, v ) {
    return { depthIncreased: true,
        after: new StrAvlBranch_( this, this, k, v, "balanced" ) };
};
// NOTE: This body takes its args as ( v, k ).
StrAvlLeaf_.prototype.any = function ( body ) {
    return false;
};
// NOTE: This body takes its args as ( v, k ).
StrAvlLeaf_.prototype.map = function ( func ) {
    return this;
};
function StrAvlBranch_( lesser, bigger, key, val, balance ) {
    this.lesser_ = lesser;
    this.bigger_ = bigger;
    this.key_ = key;
    this.val_ = val;
    this.balance_ = balance;
}
StrAvlBranch_.prototype.has = function ( k ) {
    return this.key_ === k ? true :
        k < this.key_ ? this.lesser_.has( k ) : this.bigger_.has( k );
};
StrAvlBranch_.prototype.get = function ( k ) {
    return this.key_ === k ? this.val_ :
        k < this.key_ ? this.lesser_.get( k ) : this.bigger_.get( k );
};
StrAvlBranch_.prototype.shrinkLesser_ = function ( lm ) {
    if ( !lm.depthDecreased )
        return { depthDecreased: false,
            after: new StrAvlBranch_( lm.after, this.bigger_,
                this.key_, this.val_, this.balance_ ) };
    return strAvlRotateBiggerToLesser(
        lm.after, this.bigger_, this.key_, this.val_, this.balance_ );
};
StrAvlBranch_.prototype.shrinkBigger_ = function ( bm ) {
    if ( !bm.depthDecreased )
        return { depthDecreased: false,
            after: new StrAvlBranch_( this.lesser_, bm.after,
                this.key_, this.val_, this.balance_ ) };
    return strAvlRotateLesserToBigger(
        this.lesser_, bm.after, this.key_, this.val_, this.balance_ );
};
StrAvlBranch_.prototype.minusEntry_ = function ( k ) {
    if ( this.key_ === k ) {
        if ( this.balance_ === "lesser" ) {
            var lmb = this.lesser_.minusBiggest_();
            if ( lmb === null )
                throw new Error();
            return { depthDecreased: lmb.shrunk.depthDecreased,
                after: new StrAvlBranch_(
                    lmb.shrunk.after, this.bigger_, lmb.key, lmb.val,
                    lmb.shrunk.depthDecreased ?
                        "balanced" : "lesser" ) };
        } else if ( this.balance_ === "balanced" ) {
            // When removing the root of a balanced tree, we err
            // toward having more elements on the lesser side.
            var bml = this.bigger_.minusLeast_();
            if ( bml === null )
                return { depthDecreased: true, after: this.lesser_ };
            return { depthDecreased: false,
                after: new StrAvlBranch_(
                    this.lesser_, bml.shrunk.after, bml.key, bml.val,
                    bml.shrunk.depthDecreased ?
                        "lesser" : "balanced" ) };
        } else if ( this.balance_ === "bigger" ) {
            var bml = this.bigger_.minusLeast_();
            if ( bml === null )
                throw new Error();
            return { depthDecreased: bml.shrunk.depthDecreased,
                after: new StrAvlBranch_(
                    this.lesser_, bml.shrunk.after, bml.key, bml.val,
                    bml.shrunk.depthDecreased ?
                        "balanced" : "bigger" ) };
        } else {
            throw new Error();
        }
    } else if ( k < this.key_ ) {
        return this.shrinkLesser_( this.lesser_.minusEntry_( k ) );
    } else {
        return this.shrinkBigger_( this.bigger_.minusEntry_( k ) );
    }
    return this;
};
StrAvlBranch_.prototype.minusLeast_ = function () {
    var lml = this.lesser_.minusLeast_();
    if ( lml === null )
        return { key: this.key_, val: this.val_,
            shrunk: { depthDecreased: true, after: this.bigger_ } };
    return { key: lml.key, val: lml.val,
        shrunk: this.shrinkLesser_( lml.shrunk ) };
};
StrAvlBranch_.prototype.minusBiggest_ = function () {
    var bmb = this.bigger_.minusBiggest_();
    if ( bmb === null )
        return { key: this.key_, val: this.val_,
            shrunk: { depthDecreased: true, after: this.lesser_ } };
    return { key: bmb.key, val: bmb.val,
        shrunk: this.shrinkBigger_( bmb.shrunk ) };
};
StrAvlBranch_.prototype.plusEntry_ = function ( k, v ) {
    if ( this.key_ === k )
        return { depthIncreased: false,
            after: new StrAvlBranch_(
                this.lesser_, this.bigger_, k, v, this.balance_ ) };
    if ( k < this.key_ ) {
        var subPlus = this.lesser_.plusEntry_( k, v );
        if ( !subPlus.depthIncreased )
            return { depthIncreased: false,
                after: new StrAvlBranch_( subPlus.after, this.bigger_,
                    this.key_, this.val_, this.balance_ ) };
        var rotated = strAvlRotateLesserToBigger(
            subPlus.after, this.bigger_,
            this.key_, this.val_, this.balance_ );
        return { depthIncreased: !rotated.depthDecreased,
            after: rotated.after };
    } else {
        var subPlus = this.bigger_.plusEntry_( k, v );
        if ( !subPlus.depthIncreased )
            return { depthIncreased: false,
                after: new StrAvlBranch_( this.lesser_, subPlus.after,
                    this.key_, this.val_, this.balance_ ) };
        var rotated = strAvlRotateBiggerToLesser(
            this.lesser_, subPlus.after,
            this.key_, this.val_, this.balance_ );
        return { depthIncreased: !rotated.depthDecreased,
            after: rotated.after };
    }
};
// NOTE: This body takes its args as ( v, k ).
StrAvlBranch_.prototype.any = function ( body ) {
    return body( this.val_, this.key_ ) ||
        this.lesser_.any( body ) || this.bigger_.any( body );
};
// NOTE: This body takes its args as ( v, k ).
StrAvlBranch_.prototype.map = function ( func ) {
    return new StrAvlBranch_(
        this.lesser_.map( func ), this.bigger_.map( func ),
        this.key_, func( this.val_, this.key_ ), this.balance_ );
};

function StrMap() {}
StrMap.prototype.init_ = function ( contents ) {
    this.contents_ = contents;
    return this;
};
function strMap() {
    return new StrMap().init_( new StrAvlLeaf_() );
}
StrMap.prototype.has = function ( k ) {
    return this.contents_.has( k );
};
StrMap.prototype.get = function ( k ) {
    return this.contents_.get( k );
};
StrMap.prototype.del = function ( k ) {
    this.contents_ = this.contents_.minusEntry_( k ).after;
    return this;
};
StrMap.prototype.set = function ( k, v ) {
    this.contents_ = this.contents_.plusEntry_( k, v ).after;
    return this;
};
StrMap.prototype.setObj = function ( obj ) {
    var self = this;
    objOwnEach( obj, function ( k, v ) {
        self.set( k, v );
    } );
    return this;
};
StrMap.prototype.setAll = function ( other ) {
    if ( !(other instanceof StrMap) )
        throw new Error();
    // TODO: Merge the trees more efficiently than this. We're using
    // AVL trees, which can supposedly merge in O( log (m + n) ) time,
    // but this operation is probably O( n * log (m + n) ).
    var self = this;
    other.each( function ( k, v ) {
        self.set( k, v );
    } );
    return this;
};
StrMap.prototype.delAll = function ( other ) {
    if ( !(other instanceof StrMap) )
        throw new Error();
    // TODO: Merge the trees more efficiently than this. We're using
    // AVL trees, which can supposedly merge in O( log (m + n) ) time,
    // but this operation is probably O( n * log (m + n) ).
    var self = this;
    other.each( function ( k, v ) {
        self.del( k );
    } );
    return this;
};
StrMap.prototype.copy = function () {
    return new StrMap().init_( this.contents_ );
};
StrMap.prototype.add = function ( k ) {
    return this.set( k, true );
};
StrMap.prototype.plusEntry = function ( k, v ) {
    return new StrMap().init_(
        this.contents_.plusEntry_( k, v ).after );
};
StrMap.prototype.plusObj = function ( other ) {
    return this.copy().setObj( other );
};
StrMap.prototype.plus = function ( other ) {
    return this.copy().setAll( other );
};
// TODO: Find a better name for this.
StrMap.prototype.plusTruth = function ( k ) {
    return this.copy().add( k );
};
// TODO: Find a better name for this.
StrMap.prototype.plusArrTruth = function ( arr ) {
    // TODO: Merge the trees more efficiently than this. We're using
    // AVL trees, which can supposedly merge in O( log (m + n) ) time,
    // but this operation is probably O( n * log (m + n) ).
    var result = this.copy();
    for ( var i = 0, n = arr.length; i < n; i++ )
        result.add( arr[ i ] );
    return result;
};
StrMap.prototype.minusEntry = function ( k ) {
    return new StrMap().init_(
        this.contents_.minusEntry_( k ).after );
};
StrMap.prototype.minus = function ( other ) {
    return this.copy().delAll( other );
};
// NOTE: This body takes its args as ( v, k ).
StrMap.prototype.any = function ( body ) {
    return this.contents_.any( body );
};
StrMap.prototype.hasAny = function () {
    return this.any( function ( v, k ) {
        return true;
    } );
};
StrMap.prototype.subset = function ( other ) {
    return !this.minus( other ).hasAny();
};
// NOTE: This body takes its args as ( k, v ).
StrMap.prototype.each = function ( body ) {
    this.any( function ( v, k ) {
        body( k, v );
        return false;
    } );
};
// NOTE: This body takes its args as ( v, k ).
StrMap.prototype.map = function ( func ) {
    return new StrMap().init_( this.contents_.map( func ) );
};
