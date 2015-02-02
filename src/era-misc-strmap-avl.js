// era-misc-strmap-avl.js
// Copyright 2013-2015 Ross Angle. Released under the MIT License.
"use strict";


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
    if ( this.balance_ === "lesser" ) {
        return { depthDecreased: false,
            after: new StrAvlBranch_( lm.after, this.bigger_,
                this.key_, this.val_, "balanced" ) };
    } else if ( this.balance_ === "balanced" ) {
        return { depthDecreased: false,
            after: new StrAvlBranch_( lm.after, this.bigger_,
                this.key_, this.val_, "bigger" ) };
    } else if ( this.balance_ === "bigger" ) {
        var bml = this.bigger_.minusLeast_();
        if ( bml === null )
            throw new Error();
        // TODO: This might do unnecessary comparisons, since we
        // already know the key is the biggest value in this subtree.
        // Stop that.
        var lmp = lm.after.plusEntry_( this.key_, this.val_ );
        if ( !lmp.depthIncreased )
            throw new Error();
        return { depthDecreased: bml.shrunk.depthDecreased,
            after: new StrAvlBranch_( lmp.after, bml.shrunk.after,
                bml.key, bml.val,
                bml.shrunk.depthDecreased ? "balanced" : "bigger" ) };
    } else {
        throw new Error();
    }
};
StrAvlBranch_.prototype.shrinkBigger_ = function ( bm ) {
    if ( !bm.depthDecreased )
        return { depthDecreased: false,
            after: new StrAvlBranch_( this.lesser_, bm.after,
                this.key_, this.val_, this.balance_ ) };
    if ( this.balance_ === "lesser" ) {
        var lmb = this.lesser_.minusBiggest_();
        if ( lmb === null )
            throw new Error();
        // TODO: This might do unnecessary comparisons, since we
        // already know the key is the least value in this subtree.
        // Stop that.
        var bmp = bm.after.plusEntry_( this.key_, this.val_ );
        if ( !bmp.depthIncreased )
            throw new Error();
        return { depthDecreased: lmb.shrunk.depthDecreased,
            after: new StrAvlBranch_( lmb.shrunk.after, bmp.after,
                lmb.key, lmb.val,
                lmb.shrunk.depthDecreased ? "balanced" : "lesser" ) };
    } else if ( this.balance_ === "balanced" ) {
        return { depthDecreased: false,
            after: new StrAvlBranch_( this.lesser_, bm.after,
                this.key_, this.val_, "lesser" ) };
    } else if ( this.balance_ === "bigger" ) {
        return { depthDecreased: false,
            after: new StrAvlBranch_( this.lesser_, bm.after,
                this.key_, this.val_, "balanced" ) };
    } else {
        throw new Error();
    }
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
        if ( this.balance_ === "lesser" ) {
            var spmb = subPlus.after.minusBiggest_();
            if ( spmb === null )
                throw new Error();
            // TODO: This might do unnecessary comparisons, since we
            // already know the key is the least value in this
            // subtree. Stop that.
            var bp = this.bigger_.plusEntry_( this.key_, this.val_ );
            if ( !bp.depthIncreased )
                throw new Error();
            return { depthIncreased: !spmb.shrunk.depthDecreased,
                after: new StrAvlBranch_( spmb.shrunk.after, bp.after,
                    spmb.key, spmb.val,
                    spmb.shrunk.depthDecreased ?
                        "balanced" : "lesser" ) };
        } else if ( this.balance_ === "balanced" ) {
            return { depthIncreased: false,
                after: new StrAvlBranch_( subPlus.after, this.bigger_,
                    this.key_, this.val_, "lesser" ) };
        } else if ( this.balance_ === "bigger" ) {
            return { depthIncreased: false,
                after: new StrAvlBranch_( subPlus.after, this.bigger_,
                    this.key_, this.val_, "balanced" ) };
        } else {
            throw new Error();
        }
    } else {
        var subPlus = this.bigger_.plusEntry_( k, v );
        if ( !subPlus.depthIncreased )
            return { depthIncreased: false,
                after: new StrAvlBranch_( this.lesser_, subPlus.after,
                    this.key_, this.val_, this.balance_ ) };
        if ( this.balance_ === "lesser" ) {
            return { depthIncreased: false,
                after: new StrAvlBranch_( this.lesser_, subPlus.after,
                    this.key_, this.val_, "balanced" ) };
        } else if ( this.balance_ === "balanced" ) {
            return { depthIncreased: false,
                after: new StrAvlBranch_( this.lesser_, subPlus.after,
                    this.key_, this.val_, "bigger" ) };
        } else if ( this.balance_ === "bigger" ) {
            var spml = subPlus.after.minusLeast_();
            if ( spml === null )
                throw new Error();
            // TODO: This might do unnecessary comparisons, since we
            // already know the key is the biggest value in this
            // subtree. Stop that.
            var lp = this.lesser_.plusEntry_( this.key_, this.val_ );
            if ( !lp.depthIncreased )
                throw new Error();
            return { depthIncreased: !spml.shrunk.depthDecreased,
                after: new StrAvlBranch_( lp.after, spml.shrunk.after,
                    spml.key, spml.val,
                    spml.shrunk.depthDecreased ?
                        "balanced" : "bigger" ) };
        } else {
            throw new Error();
        }
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
