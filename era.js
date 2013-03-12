// era.js
// Copyright 2013 Ross Angle. Released under the MIT License.


// ===== Miscellaneous ===============================================

// TODO: Decide whether to introduce a dependency on Lathe.js just for
// these utilities.
function defer( body ) {
    setTimeout( function () {
        body();
    }, 0 );
}
// NOTE: This body takes its args as ( v, k ).
function arrAny( arr, body ) {
    for ( var i = 0, n = arr.length; i < n; i++ ) {
        var result = body( arr[ i ], i );
        if ( result )
            return result;
    }
    return false;
}
// NOTE: This body takes its args as ( v, k ).
function arrAll( arr, body ) {
    return !arrAny( arr, function ( v, k ) {
        return !body( v, k );
    } );
}
// NOTE: This body takes its args as ( v, k ).
function arrMap( arr, func ) {
    var result = [];
    for ( var i = 0, n = arr.length; i < n; i++ )
        result.push( func( arr[ i ], i ) );
    return result;
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
function objPlus( var_args ) {
    var result = {};
    for ( var i = 0, n = arguments.length; i < n; i++ )
        objOwnEach( arguments[ i ], function ( k, v ) {
            result[ k ] = v;
        } );
    return result;
}
function objMinus( a, b ) {
    var result = {};
    objOwnEach( a, function ( k, v ) {
        if ( !hasOwn( b, k ) )
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

function StrMap() {}
StrMap.prototype.init_ = function () {
    this.contents_ = {};
    return this;
};
function strMap() {
    return new StrMap().init_();
}
StrMap.prototype.mangle_ = function ( k ) {
    return "|" + k;
};
StrMap.prototype.unmangle_ = function ( k ) {
    return k.substring( 1 );
};
StrMap.prototype.has = function ( k ) {
    return {}.hasOwnProperty.call(
        this.contents_, this.mangle_( k ) );
};
StrMap.prototype.get = function ( k ) {
    return this.contents_[ this.mangle_( k ) ];
};
StrMap.prototype.del = function ( k ) {
    delete this.contents_[ this.mangle_( k ) ];
    return this;
};
StrMap.prototype.set = function ( k, v ) {
    this.contents_[ this.mangle_( k ) ] = v;
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
    var self = this;
    other.each( function ( k, v ) {
        self.set( k, v );
    } );
    return this;
};
StrMap.prototype.copy = function () {
    return strMap().setAll( this );
};
StrMap.prototype.add = function ( k ) {
    return this.set( k, true );
};
StrMap.prototype.plusEntry = function ( k, v ) {
    return this.copy().set( k, v );
};
// TODO: Find a better name for this.
StrMap.prototype.plusArrTruth = function ( arr ) {
    var result = this.copy();
    for ( var i = 0, n = arr.length; i < n; i++ )
        result.add( arr[ i ] );
    return result;
};
StrMap.prototype.minus = function ( other ) {
    if ( !(other instanceof StrMap) )
        throw new Error();
    var result = strMap();
    result.contents_ = objMinus( this.contents_, other.contents_ );
    return result;
};
// TODO: Find a better name for this.
StrMap.prototype.minusArrTruth = function ( arr ) {
    return this.minus( strMap().plusArrTruth( arr ) );
};
// NOTE: This body takes its args as ( v, k ).
StrMap.prototype.any = function ( body ) {
    var self = this;
    return objOwnAny( this.contents_, function ( v, k ) {
        return body( v, self.unmangle_( k ) );
    } );
};
StrMap.prototype.hasAny = function () {
    return this.any( function ( v, k ) {
        return true;
    } );
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
    var result = strMap();
    this.each( function ( k, v ) {
        result.set( k, func( v, k ) );
    } );
    return result;
};
StrMap.prototype.keys = function () {
    return this.map( function ( v, k ) {
        return true;
    } );
};

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

function logJson( x ) {
    console.log( JSON.stringify( x ) );
}

var unitTests = [];
function addNaiveIsoUnitTest( body ) {
    // TODO: Stop using JSON.stringify() here. It might be good to
    // have a naiveStringify() function or something for custom
    // stringification.
    unitTests.push( function ( then ) {
        body( function ( calculated, expected ) {
            if ( naiveIso( calculated, expected ) )
                console.log( "Test passed." );
            else
                console.log(
                    "Expected this:\n" +
                    JSON.stringify( expected ) + "\n" +
                    "But got this:\n" +
                    JSON.stringify( calculated ) );
            then();
        } );
    } );
}
function addPredicateUnitTest( body ) {
    // TODO: Stop using JSON.stringify() here. It might be good to
    // have a naiveStringify() function or something for custom
    // stringification.
    unitTests.push( function ( then ) {
        body( function ( calculated, predicate ) {
            if ( predicate( calculated ) )
                console.log( "Test passed." );
            else
                console.log(
                    "This result was unexpected:\n" +
                    JSON.stringify( calculated ) );
            then();
        } );
    } );
}


// ===== Reader ======================================================

// TODO: This reader is currently entangled with JavaScript's notion
// of string. It's probably good and fast for sequences of 16-bit
// values, but it doesn't go out of its way to parse UTF-16 surrogate
// pairs, and thus it's a few specificational kludges away from
// Unicode. Figure out whether to make the spec simple, or to keep the
// code and its performance simple.

// $.stream.readc
// $.stream.peekc
// $.then
// $.readerMacros
// $.list
// $.end
// $.unrecognized
function reader( $ ) {
    $.stream.peekc( function ( c ) {
        if ( c === "" )
            return void $.end( $ );
        var readerMacro = $.readerMacros.get( c );
        if ( readerMacro === void 0 )
            return void $.unrecognized( $ );
        readerMacro( $ );
    } );
}
function addReaderMacros( readerMacros, string, func ) {
    for ( var i = 0, n = string.length; i < n; i++ )
        readerMacros.set( string.charAt( i ), func );
}
// NOTE: The readListUntilParen() function is only for use by the "("
// and "/" reader macros to reduce duplication.
function readListUntilParen( $, consumeParen ) {
    function sub( $, list ) {
        return objPlus( $, {
            list: list,
            readerMacros: $.readerMacros.plusEntry( ")",
                function ( $sub ) {
                
                if ( consumeParen )
                    $sub.stream.readc( function ( c ) {
                        next();
                    } );
                else
                    next();
                
                function next() {
                    var result = [];
                    for ( var list = $sub.list;
                        list !== null; list = list.past )
                        result.unshift( list.last );
                    $.then( { ok: true, val: result } );
                }
            } ),
            then: function ( result ) {
                if ( result.ok )
                    reader(
                        sub( $, { past: list, last: result.val } ) );
                else
                    $.then( result );
            },
            end: function ( $sub ) {
                $.then( { ok: false, msg: "Incomplete list" } );
            }
        } );
    }
    $.stream.readc( function ( c ) {
        reader( sub( $, null ) );
    } );
}

var symbolChars = "abcdefghijklmnopqrstuvwxyz";
symbolChars += symbolChars.toUpperCase() + "-*0123456789";
var symbolChopsChars = strMap().setObj( { "(": ")", "[": "]" } );
var whiteChars = " \t\r\n";

var readerMacros = strMap();
readerMacros.set( ";", function ( $ ) {
    function loop() {
        $.stream.readc( function ( c ) {
            if ( c === "" )
                return void $.end();
            if ( /^[\r\n]$/.test( c ) )
                return void reader( $ );
            loop();
        } );
    }
    loop();
} );
addReaderMacros( readerMacros, whiteChars, function ( $ ) {
    $.stream.readc( function ( c ) {
        reader( $ );
    } );
} );
addReaderMacros( readerMacros, symbolChars, function ( $ ) {
    // TODO: See if this series of string concatenations is a
    // painter's algorithm. Those in the know seem to say it's faster
    // than keeping a big array and concatenating later, but maybe
    // there's something even better than either option.
    function collectChops( stringSoFar, open, close, nesting ) {
        if ( nesting === 0 )
            return void collect( stringSoFar );
        $.stream.readc( function ( c ) {
            var nextStringSoFar = stringSoFar + c;
            if ( c === "" )
                return void $.then(
                    { ok: false, msg: "Incomplete symbol" } );
            collectChops( nextStringSoFar, open, close,
                nesting + (c === open ? 1 : c === close ? -1 : 0) );
        } );
    }
    function collect( stringSoFar ) {
        $.stream.peekc( function ( c ) {
            if ( c === ""
                || (symbolChars.indexOf( c ) === -1
                    && !symbolChopsChars.has( c )) )
                return void $.then( { ok: true, val: stringSoFar } );
            $.stream.readc( function ( open ) {
                var nextStringSoFar = stringSoFar + open;
                var close = symbolChopsChars.get( open );
                if ( close !== void 0 )
                    collectChops( nextStringSoFar, open, close, 1 );
                else
                    collect( nextStringSoFar );
            } );
        } );
    }
    collect( "" );
} );
readerMacros.set( "(", function ( $ ) {
    readListUntilParen( $, !!"consumeParen" );
} );
readerMacros.set( "/", function ( $ ) {
    readListUntilParen( $, !"consumeParen" );
} );

function stringStream( string ) {
    var i = 0, n = string.length;
    var stream = {};
    stream.peekc = function ( then ) {
        defer( function () {
            if ( i < n )
                then( string.charAt( i ) );
            else
                then( "" );
        } );
    };
    stream.readc = function ( then ) {
        defer( function () {
            if ( i < n )
                then( string.charAt( i++ ) );
            else
                then( "" );
        } );
    };
    return stream;
}

addNaiveIsoUnitTest( function ( then ) {
    reader( {
        stream: stringStream(
            " (woo;comment\n b (c( woo( ) string) / x//)/())" ),
        readerMacros: readerMacros,
        end: function ( $ ) {
            $.then( { ok: false, msg: "Reached the end" } );
        },
        unrecognized: function ( $ ) {
            $.then( { ok: false, msg: "Unrecognized char" } );
        },
        then: function ( result ) {
            then( result, { ok: true, val:
                [ "woo", "b",
                    [ "c( woo( ) string)" , [ "x", [ [] ] ] ],
                    [ [] ] ]
            } );
        }
    } );
} );


// ===== Macroexpander ===============================================

// TODO: This section is extremely incomplete. Develop it further.

function macroexpand( macros, expr ) {
    if ( !(isArray( expr ) && 0 < expr.length) )
        return { ok: false, msg:
            "Can only macroexpand nonempty Arrays" };
    var op = expr[ 0 ];
    if ( !isPrimString( op ) )
        return { ok: false, msg:
            "Can only macroexpand Arrays with strings at the " +
            "beginning" };
    var macro = macros.get( op );
    if ( macro === void 0 )
        return { ok: false, msg: "Unknown macro " + op };
    return macro( macroexpand, macros, expr.slice( 1 ) );
}

var macros = strMap();
// TODO: This is just for getting started. Remove it.
macros.set( "log", function ( expand, macros, subexprs ) {
    if ( subexprs.length !== 1 )
        return { ok: false, msg: "Incorrect number of args to log" };
    var msg = subexprs[ 0 ];
    if ( !isPrimString( msg ) )
        return { ok: false, msg: "Incorrect args to log" };
    logJson( msg );
    return { ok: true, val: [ "noop" ] };
} );

addNaiveIsoUnitTest( function ( then ) {
    then( macroexpand( macros, [ "log", "hello" ] ),
        { ok: true, val: [ "noop" ] } );
} );


// ===== Alpha-equivalent pattern matching ===========================

function ToAndFromVars() {}
ToAndFromVars.prototype.initWith_ = function ( xy, yx ) {
    this.xy_ = xy;
    this.yx_ = yx;
    return this;
};
ToAndFromVars.prototype.init = function () {
    return this.initWith_( strMap(), strMap() );
};
ToAndFromVars.prototype.copy = function () {
    return new ToAndFromVars().initWith_(
        this.xy_.copy(), this.yx_.copy() );
};
ToAndFromVars.prototype.hasForward = function ( x ) {
    return this.xy_.has( x );
};
ToAndFromVars.prototype.getForward = function ( x ) {
    return this.xy_.get( x );
};
ToAndFromVars.prototype.getBackward = function ( y ) {
    return this.yx_.get( y );
};
ToAndFromVars.prototype.shadowWithArrs = function ( xs, ys ) {
    var n = xs.length;
    if ( n !== ys.length )
        throw new Error();
    for ( var i = 0; i < n; i++ ) {
        var y = ys[ i ];
        if ( this.yx_.has( y ) )
            this.xy_.del( this.yx_.get( y ) );
    }
    for ( var i = 0; i < n; i++ ) {
        var x = xs[ i ];
        var y = ys[ i ];
        this.yx_.set( y, x );
        this.xy_.set( x, y );
    }
    return this;
};
ToAndFromVars.prototype.withShadowingArrs = function ( xs, ys ) {
    return this.copy().shadowWithArrs( xs, ys );
};

function makeAlphaGrammar( spec ) {
    var n = spec.length;
    
    // Validate the spec.
    var names = strMap();
    for ( var i = 0; i < n; i++ ) {
        var specPart = spec[ i ];
        if ( !isPrimString( specPart ) )
            continue;
        if ( names.has( specPart ) )
            throw new Error(
                "Can't have duplicate names in a makeAlphaGrammar " +
                "spec" );
        names.set( specPart, i );
    }
    var namelessSpec = arrMap( spec, function ( specPart ) {
        if ( isPrimString( specPart ) ) {
            return null;
        } else if ( isArray( specPart ) ) {
            var result = [];
            var deps = strMap();
            for ( var j = 0, m = specPart.length; j < m; j++ ) {
                var dep = specPart[ j ];
                if ( !(isPrimString( dep ) && names.has( dep )) )
                    throw new Error(
                        "Invalid term dependency in makeAlphaGrammar"
                        );
                if ( deps.has( dep ) )
                    throw new Error(
                        "Duplicate term dependency in " +
                        "makeAlphaGrammar" );
                deps.add( dep );
                result.push( names.get( dep ) );
            }
            return result;
        } else {
            throw new Error( "Invalid entry in makeAlphaGrammar" );
        }
    } );
    function nameTerm( params ) {
        if ( params.length !== n )
            return { ok: false, msg: "Mismatched term length" };
        
        var bindings = strMap();
        for ( var i = 0; i < n; i++ ) {
            var param = params[ i ];
            if ( namelessSpec[ i ] === null
                && !isPrimString( param ) )
                return { ok: false, msg: "Var expected" };
            if ( bindings.has( param ) )
                return { ok: false, msg: "Duplicate var" };
            bindings.add( param );
        }
        return { ok: true, val: arrMap( namelessSpec,
            function ( specPart, i ) {
            
            if ( specPart === null )
                return null;
            return { boundVars: arrMap( specPart, function ( i ) {
                return params[ i ];
            } ), term: params[ i ] };
        } ) };
    }
    
    var grammar = {};
    grammar.parseData = function ( dataParams ) {
        return nameTerm( dataParams );
    };
    grammar.verifyNoBoundVars = function (
        matcher, alphaGrammars, boundVars, dataParams ) {
        
        var namedData = nameTerm( dataParams );
        if ( !namedData.ok )
            return namedData;
        for ( var i = 0; i < n; i++ ) {
            var dataPart = namedData.val[ i ];
            if ( dataPart === null )
                continue;
            var verified = matcher.verifyNoBoundVars(
                matcher, alphaGrammars,
                boundVars.minusArrTruth( dataPart.boundVars ),
                dataPart.term );
            if ( !verified.ok )
                return verified;
        }
        return { ok: true, val: null };
    };
    grammar.parsePattern = function (
        matcher, alphaGrammars, boundVars, patParams ) {
        
        var namedPat = nameTerm( patParams );
        if ( !namedPat.ok )
            return namedPat;
        var parsedPat = [];
        var result = {};
        result.freeVars = strMap();
        result.treeNames = strMap();
        function addTreeName( treeName ) {
            if ( result.treeNames.has( treeName ) )
                return { ok: false, msg: "Duplicate tree name" };
            result.treeNames.add( treeName );
        }
        for ( var i = 0; i < n; i++ ) {
            var patPart = namedPat.val[ i ];
            if ( patPart === null ) {
                parsedPat.push( { type: "var" } );
                continue;
            }
            var theseBoundVars =
                boundVars.plusArrTruth( patPart.boundVars );
            var processSubpat = function () {
                var subpat = matcher.parsePattern( matcher,
                    alphaGrammars, theseBoundVars, patPart.term );
                if ( !subpat.ok )
                    return subpat;
                subpat.val.treeNames.each( function ( treeName ) {
                    addTreeName( treeName );
                } );
                result.freeVars.setAll(
                    subpat.val.freeVars.minusArrTruth(
                        patPart.boundVars ) );
                parsedPat.push( { type: "subpat",
                    boundVars: patPart.boundVars,
                    subpat: subpat.val.patWithInfo } );
                return { ok: true, val: null };
            };
            if ( isPrimString( patPart.term ) ) {
                var subpatResult = processSubpat();
                if ( !subpatResult.ok )
                    return subpatResult;
                continue;
            }
            var partLen = patPart.term.length;
            if ( partLen === 0 )
                return { ok: false, msg: "Empty array" };
            var specialFormName = patPart.term[ 0 ];
            if ( !isPrimString( specialFormName ) )
                return { ok: false, msg:
                    "Array started with a non-string." };
            if ( specialFormName === "insbs" ) {
                if ( partLen < 2 )
                    return { ok: false, msg:
                        "Not enough args to insbs" };
                var treeName = patPart.term[ 1 ];
                if ( !isPrimString( treeName ) )
                    return { ok: false, msg:
                        "First arg to insbs must be a tree " +
                        "name" };
                var treeParams = patPart.term.slice( 2 );
                if ( !arrAll( treeParams,
                    function ( treeParam ) {
                    
                    return isPrimString( treeParam ) &&
                        theseBoundVars.has( treeParam );
                } ) )
                    return { ok: false, msg:
                        "Invalid tree param to insbs" };
                var treeParamsMap = strMap();
                for ( var j = 0, m = treeParams.length;
                    j < m; j++ ) {
                    var treeParam = treeParams[ j ];
                    if ( treeParamsMap.has( treeParam ) )
                        return { ok: false, msg:
                            "Tree params must be different" };
                    treeParamsMap.add( treeParam );
                }
                addTreeName( treeName );
                parsedPat.push( { type: "insbs",
                    boundVars: patPart.boundVars,
                    name: treeName, params: treeParams } );
                continue;
            }
            if ( specialFormName === "outsbs" ) {
                if ( partLen < 2 )
                    return { ok: false, msg:
                        "Not enough args to outsbs" };
                var treeName = patPart.term[ 1 ];
                if ( !isPrimString( treeName ) )
                    return { ok: false, msg:
                        "First arg to outsbs must be a tree " +
                        "name" };
                var treeParams = patPart.term.slice( 2 );
                var subpats = [];
                for ( var j = 0, m = treeParams.length; j < m; j++ ) {
                    var subpat = matcher.parsePattern( matcher,
                        alphaGrammars, theseBoundVars, patPart.term );
                    if ( !subpat.ok )
                        return subpat;
                    if ( subpat.val.treeNames.hasAny() )
                        return { ok: false, val:
                            "Can't have insbs inside outsbs" };
                    result.freeVars.setAll(
                        subpat.val.freeVars.minusArrTruth(
                            patPart.boundVars ) );
                    subpats.push( subpat.val.patWithInfo );
                }
                parsedPat.push( { type: "outsbs",
                    boundVars: patPart.boundVars,
                    name: treeName, params: subpats } );
                continue;
            }
            var subpatResult = processSubpat();
            if ( !subpatResult.ok )
                return subpatResult;
        }
        
        result.patWithoutInfo = {};
        result.patWithoutInfo.getTrees = function (
            matcher, toAndFromTreeVars, namedData ) {
            
            var trees = strMap();
            for ( var i = 0; i < n; i++ ) {
                var patPart = parsedPat[ i ];
                var dataPart = namedData[ i ];
                if ( patPart.type === "var" )
                    continue;
                var theseToAndFromTreeVars =
                    toAndFromTreeVars.withShadowingArrs(
                        dataPart.boundVars, patPart.boundVars );
                if ( patPart.type === "insbs" ) {
                    trees.set( patPart.name, { params:
                        arrMap( patPart.params, function ( treeVar ) {
                            return theseToAndFromTreeVars.getBackward(
                                treeVar );
                        } ), term: dataPart.term } );
                } else if ( patPart.type === "subpat" ) {
                    var subtrees = matcher.getTrees( matcher,
                        patPart.subpat, theseToAndFromTreeVars,
                        dataPart.term );
                    if ( !subtrees.ok )
                        return subtrees;
                    trees.setAll( subtrees.val );
                }
            }
            return { ok: true, val: trees };
        };
        result.patWithoutInfo.getLeaves = function (
            matcher, alphaGrammars, trees, toPatVars, namedData ) {
            
            var leaves = strMap();
            function addLeaves( subleaves ) {
                if ( !subleaves.ok )
                    return subleaves;
                if ( subleaves.val.any( function ( v, k ) {
                    if ( leaves.has( k ) )
                        return true;
                    leaves.set( k, v );
                    return false;
                } ) )
                    return { ok: false, msg: "Duplicate leaf" };
                return { ok: true, val: null };
            }
            for ( var i = 0; i < n; i++ ) {
                var patPart = parsedPat[ i ];
                var dataPart = namedData[ i ];
                var getTheseToPatVars = function () {
                    var n = patPart.boundVars.length;
                    if ( dataPart.boundVars.length !== n )
                        throw new Error();
                    var result = toPatVars.copy();
                    for ( var i = 0; i < n; i++ )
                        result.set( dataPart.boundVars[ i ],
                            patPart.boundVars[ i ] );
                    return result;
                };
                if ( patPart.type === "outsbs" ) {
                    if ( !trees.has( patPart.name ) )
                        return { ok: false, msg:
                            "Unrecognized tree name" };
                    var tree = trees.get( patPart.name );
                    var numParams = tree.params.length;
                    if ( patPart.params.length !== numParams )
                        return { ok: false, msg:
                            "Incorrect number of tree params" };
                    var treeParams = strMap();
                    for ( var i = 0; i < numParams; i++ )
                        treeParams.set(
                            tree.params[ i ], patPart.params[ i ] );
                    var added = addLeaves( matcher.getLeavesUnderTree(
                        matcher, treeParams, tree.term,
                        new ToAndFromVars().init(), alphaGrammars,
                        trees, getTheseToPatVars(), dataPart.term ) );
                    if ( !added.ok )
                        return added;
                } else if ( patPart.type === "subpat" ) {
                    var added = addLeaves( matcher.getLeaves(
                        matcher, patPart.subpat, alphaGrammars, trees,
                        getTheseToPatVars(), dataPart.term ) );
                    if ( !added.ok )
                        return added;
                }
            }
            return { ok: true, val: leaves };
        };
        return { ok: true, val: result };
    };
    return grammar;
}

var matcher = {};
matcher.parsePattern = function (
    matcher, alphaGrammars, boundVars, term ) {
    
    // NOTE: The grammars' parsePattern( matcher, alphaGrammars,
    // boundVars, patParams ) method returns a patWithoutInfo (among
    // other things), and this returns a patWithInfo (among other
    // things).
    if ( isPrimString( term ) ) {
        if ( boundVars.has( term ) ) {
            var result = {};
            result.treeNames = strMap();
            result.freeVars = strMap();
            result.patWithInfo =
                { type: "boundVar", boundVarName: term };
            return { ok: true, val: result };
        } else {
            var result = {};
            result.treeNames = strMap();
            result.freeVars = strMap().plusArrTruth( [ term ] );
            result.patWithInfo =
                { type: "freeVar", freeVarName: term };
            return { ok: true, val: result };
        }
    }
    if ( term.length === 0 )
        return { ok: false, msg:
            "Can't parse a pattern from an empty Array" };
    var op = term[ 0 ];
    if ( !(isPrimString( op ) && alphaGrammars.has( op )) )
        return { ok: false, msg: "Unrecognized pattern name" };
    var grammar = alphaGrammars.get( op );
    var pattern = grammar.parsePattern(
        matcher, alphaGrammars, boundVars, term.slice( 1 ) );
    if ( !pattern.ok )
        return pattern;
    var result = {};
    result.treeNames = pattern.val.treeNames;
    result.freeVars = pattern.val.freeVars;
    result.patWithInfo = { type: "form", arrayPatName: op,
        arrayAlphaGrammar: grammar,
        patWithoutInfo: pattern.val.patWithoutInfo };
    return { ok: true, val: result };
};
matcher.getTrees = function (
    matcher, patWithInfo, toAndFromTreeVars, data ) {
    
    if ( patWithInfo.type === "form" ) {
        if ( !isArray( data ) )
            return { ok: false, msg:
                "Can't get trees when trying to match an Array " +
                "pattern to a non-Array" };
        if ( data.length === 0 )
            return { ok: false, msg:
                "Can't get trees when trying to match an Array " +
                "pattern to an empty Array" };
        if ( data[ 0 ] !== patWithInfo.arrayPatName )
            return { ok: false, msg:
                "Can't get trees when trying to match an Array " +
                "pattern to an Array with a different operator" };
        // TODO: See if we actually need parseData() or if we should
        // just pass the data params directly to getTrees().
        var namedData = patWithInfo.arrayAlphaGrammar.parseData(
            data.slice( 1 ) );
        if ( !namedData.ok )
            return namedData;
        return patWithInfo.patWithoutInfo.getTrees(
            matcher, toAndFromTreeVars, namedData.val );
    } else if ( patWithInfo.type === "boundVar" ) {
        if ( !isPrimString( data ) )
            return { ok: false, msg:
                "Can't get trees when trying to match a boundVar " +
                "pattern to a non-string." };
        return { ok: true, val: strMap() };
    } else if ( patWithInfo.type === "freeVar" ) {
        return { ok: true, val: strMap() };
    } else {
        throw new Error();
    }
};
matcher.getLeavesUnderTree = function (
    matcher, baseTreeParams, baseTreeTerm, toAndFromTreeVars,
    alphaGrammars, trees, toPatVars, data ) {
    
    // TODO: See if we really need the "from" part of
    // toAndFromTreeVars.
    
    if ( isPrimString( baseTreeTerm ) ) {
        if ( baseTreeParams.has( baseTreeTerm ) )
            return matcher.getLeaves( matcher,
                baseTreeParams.get( baseTreeTerm ),
                alphaGrammars, trees, toPatVars, data );
        if ( isPrimString( data )
            && toAndFromTreeVars.hasForward( data )
            && toAndFromTreeVars.getForward( data ) === baseTreeTerm )
            return { ok: true, val: strMap() };
        return { ok: false, msg:
            "Can't get leaves under tree when trying to match a " +
            "bound variable within the tree to incompatible data" };
    }
    if ( !isArray( data ) )
        return { ok: false, msg:
            "Can't get leaves under tree when trying to match an " +
            "Array tree to non-Array data" };
    if ( baseTreeTerm.length === 0 || data.length === 0 )
        return { ok: false, msg:
            "Can't get leaves under tree when the tree or data is " +
            "an empty Array" };
    var opName = data[ 0 ];
    if ( baseTreeTerm[ 0 ] !== opName )
        return { ok: false, msg:
            "Can't get leaves under tree when the tree and data " +
            "use different operations" };
    if ( !alphaGrammars.has( opName ) )
        return { ok: false, msg:
            "Can't get leaves under tree when the operation is " +
            "unrecognized" };
    var grammar = alphaGrammars.get( opName );
    var namedTree = grammar.parseData( baseTreeTerm.slice( 1 ) );
    if ( !namedTree.ok )
        return namedTree;
    var namedData = grammar.parseData( data.slice( 1 ) );
    if ( !namedData.ok )
        return namedData;
    var leaves = strMap();
    function addLeaves( subleaves ) {
        if ( !subleaves.ok )
            return subleaves;
        if ( subleaves.val.any( function ( v, k ) {
            if ( leaves.has( k ) )
                return true;
            leaves.set( k, v );
            return false;
        } ) )
            return { ok: false, msg: "Duplicate leaf" };
        return { ok: true, val: null };
    }
    for ( var i = 0, n = namedTree.val.length; i < n; i++ ) {
        var treePart = namedTree.val[ i ];
        var dataPart = namedData.val[ i ];
        if ( treePart === null )
            continue;
        var added = addLeaves( matcher.getLeavesUnderTree( matcher,
            baseTreeParams, treePart.term,
            toAndFromTreeVars.withShadowingArrs(
                dataPart.boundVars, treePart.boundVars ),
            alphaGrammars, trees, toPatVars, dataPart.term ) );
        if ( !added.ok )
            return added;
    }
};
matcher.verifyNoBoundVars = function (
    matcher, alphaGrammars, boundVars, data ) {
    
    if ( isPrimString( data ) ) {
        if ( boundVars.has( data ) )
            return { ok: false, msg:
                "Can't get leaves when trying to match a freeVar " +
                "pattern to data with a bound variable occurrence" };
        return { ok: true, val: null };
    }
    if ( data.length === 0 )
        return { ok: false, msg:
            "Can't get leaves when trying to match a freeVar " +
            "pattern to data with an empty Array" };
    var opName = data[ 0 ];
    if ( !alphaGrammars.has( opName ) )
        return { ok: false, msg:
            "Can't get leaves when trying to match a freeVar " +
            "pattern to data with an unrecognized operation" };
    return alphaGrammars.get( opName ).verifyNoBoundVars(
        matcher, alphaGrammars, boundVars, data.slice( 1 ) );
};
matcher.getLeaves = function (
    matcher, patWithInfo, alphaGrammars, trees, toPatVars, data ) {
    
    if ( patWithInfo.type === "form" ) {
        if ( !isArray( data ) )
            return { ok: false, msg:
                "Can't get leaves when trying to match an Array " +
                "pattern to a non-Array" };
        if ( data.length === 0 )
            return { ok: false, msg:
                "Can't get leaves when trying to match an Array " +
                "pattern to an empty Array" };
        if ( data[ 0 ] !== patWithInfo.arrayPatName )
            return { ok: false, msg:
                "Can't get leaves when trying to match an Array " +
                "pattern to an Array with a different operator" };
        // TODO: See if we actually need parseData() or if we should
        // just pass the data params directly to getLeaves().
        var namedData = patWithInfo.arrayAlphaGrammar.parseData(
            data.slice( 1 ) );
        if ( !namedData.ok )
            return namedData;
        return patWithInfo.patWithoutInfo.getLeaves(
            matcher, alphaGrammars, trees, toPatVars, namedData.val );
    } else if ( patWithInfo.type === "boundVar" ) {
        if ( !isPrimString( data ) )
            return { ok: false, msg:
                "Can't get leaves when trying to match a boundVar " +
                "pattern to a non-string" };
        if ( !(toPatVars.has( data )
            && toPatVars.get( data ) === patWithInfo.boundVarName) )
            return { ok: false, msg:
                "Can't get leaves when trying to match a boundVar " +
                "pattern to an incorrect variable name" };
        return { ok: true, val: strMap() };
    } else if ( patWithInfo.type === "freeVar" ) {
        var verified = matcher.verifyNoBoundVars(
            matcher, alphaGrammars, toPatVars.keys(), data );
        if ( !verified.ok )
            return verified;
        return { ok: true, val:
            strMap().set( patWithInfo.freeVarName, data ) };
    } else {
        throw new Error();
    }
};

function matchAlpha( matcher, alphaGrammars, patTerm, dataTerm ) {
    var pattern = matcher.parsePattern(
        matcher, alphaGrammars, strMap(), patTerm );
    if ( !pattern.ok )
        return pattern;
    var trees = matcher.getTrees( matcher, pattern.val.patWithInfo,
        new ToAndFromVars().init(), dataTerm );
    if ( !trees.ok )
        return trees;
    var leaves = matcher.getLeaves( matcher, pattern.val.patWithInfo,
        alphaGrammars, trees.val, strMap(), dataTerm );
    if ( !leaves.ok )
        return leaves;
    return { ok: true, val:
        { trees: trees.val, leaves: leaves.val } };
}

(function () {
    var alphaGrammars = strMap();
    alphaGrammars.set( "fn", makeAlphaGrammar( [ "x", [ "x" ] ] ) );
    alphaGrammars.set( "call", makeAlphaGrammar( [ [], [] ] ) );
    
    addNaiveIsoUnitTest( function ( then ) {
        then( matchAlpha( matcher, alphaGrammars,
            [ "fn", "x",
                [ "fn", "y",
                    [ "call", [ "call", "x", "z" ],
                        "y" ] ] ],
            [ "fn", "a",
                [ "fn", "b",
                    [ "call", [ "call", "a", [ "call", "c", "d" ] ],
                        "b" ] ] ]
        ), { ok: true, val: {
            trees: strMap(),
            leaves: strMap().set( "z", [ "call", "c", "d" ] )
        } } );
    } );
    
    // Leaves can't depend on variables bound inside the pattern.
    addPredicateUnitTest( function ( then ) {
        then( matchAlpha( matcher, alphaGrammars,
            [ "fn", "x",
                [ "fn", "y",
                    [ "call", [ "call", "x", "z" ],
                        "y" ] ] ],
            [ "fn", "a",
                [ "fn", "b",
                    [ "call", [ "call", "a", [ "call", "c", "b" ] ],
                        "b" ] ] ]
        ), function ( result ) {
            return !result.ok;
        } );
    } );
    
    // Trees can depend on variables bound inside the pattern.
    addNaiveIsoUnitTest( function ( then ) {
        // TODO: See if we can stop hardcoding specific parameter
        // names (namely, "b") in the expected value.
        then( matchAlpha( matcher, alphaGrammars,
            [ "fn", "x",
                [ "fn", "y",
                    [ "call", [ "call", "x", [ "insbs", "z", "y" ] ],
                        "y" ] ] ],
            [ "fn", "a",
                [ "fn", "b",
                    [ "call", [ "call", "a", [ "call", "c", "b" ] ],
                        "b" ] ] ]
        ), { ok: true, val: {
            trees: strMap().set( "z",
                { params: [ "b" ], term: [ "call", "c", "b" ] } ),
            leaves: strMap()
        } } );
    } );
    
    // Trees don't have to use all their parameters in a match.
    addNaiveIsoUnitTest( function ( then ) {
        // TODO: See if we can stop hardcoding specific parameter
        // names (namely, "b") in the expected value.
        then( matchAlpha( matcher, alphaGrammars,
            [ "fn", "x",
                [ "fn", "y",
                    [ "call", [ "call", "x", [ "insbs", "z", "y" ] ],
                        "y" ] ] ],
            [ "fn", "a",
                [ "fn", "b",
                    [ "call", [ "call", "a", [ "call", "c", "d" ] ],
                        "b" ] ] ]
        ), { ok: true, val: {
            trees: strMap().set( "z",
                { params: [ "b" ], term: [ "call", "c", "d" ] } ),
            leaves: strMap()
        } } );
    } );
})();

// TODO: Use this. We need to build some inference rule objects, fact
// objects (to be used as premises and conclusions), and freshWorld
// objects with the following methods:
//
// rule.getPremisesAndConclusion( freshWorld )
// rule.getUnifiedPremisesFor( freshWorld, conclusion )
// fact.renameWith( varMap )
// freshWorld.getFresh()
//
// NOTE: The point of threading freshWorld through all these
// computations is so they can generate fresh names. It's assumed that
// the input `freshWorld` will never generate names occurring as free
// variables in `inferenceRules` or `newRule`.
//
function checkRuleEntailment( freshWorld, inferenceRules, newRule ) {
    var premisesAndConclusion =
        newRule.getPremisesAndConclusion( freshWorld );
    freshWorld = premisesAndConclusion.freshWorld;
    var allRules = [].concat(
        inferenceRules, premisesAndConclusion.val.premises );
    
    return arrAny( allRules, function ( rule ) {
        var match = rule.getUnifiedPremisesFor(
            freshWorld, premisesAndConclusion.val.conclusion );
        if ( !match.ok )
            return false;
        var thisFreshWorld = match.val.freshWorld;
        return arrAll( match.val.val, function ( subpremise ) {
            return checkRuleEntailment(
                thisFreshWorld, allRules, subpremise );
        } );
    } );
}
function makeInferenceRule( localVars, premises, conclusion ) {
    var rule = {};
    rule.getPremisesAndConclusion = function ( freshWorld ) {
        var renamedLocalVars = strMap();
        localVars.each( function ( localVar ) {
            var gotten = freshWorld.getFresh();
            freshWorld = gotten.freshWorld;
            renamedLocalVars.set( localVar, gotten.val );
        } );
        return { freshWorld: freshWorld, val: {
            premises: arrMap( premises, function ( premise ) {
                premise.renameWith( localVars );
            } ),
            conclusion: conclusion.renameWith( localVars )
        } };
    };
    rule.getUnifiedPremisesFor = function (
        freshWorld, sampleConclusion ) {
        
        // TODO: Implement this.
    };
    return rule;
}


// ===== Hand-rolled module validity checker =========================
//
// Hand-rolling a pattern-matcher is turning out to be just about as
// hard as hand-rolling the module checker itself. First things first.
//
// For now, we're just focusing on the deductive fragment. A more
// complete version of the grammar is available at
// <https://gist.github.com/4559120>. Also, it's worth noting that
// we're using s-expressions for the grammar.

// NOTE: For this version, we're taking the original grammar design
// and filling it out with lots of extra type annotations to make the
// type checker easy to write. Every function call expression must
// come with a full description of the function type it's calling.

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

var patternLang = {};
(function () {
    function Pat() {}
    Pat.prototype.init_ = function ( match ) {
        this.match_ = match;
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
            return isPrimStr( data ) ?
                { val: strMap().set( x, data ) } : null;
        } );
    };
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


// TODO: Implement renameAway().

function knownEqual( exprA, exprB, opt_boundVarsAToB ) {
    // Do a test of intrinsic equality, respecting alpha-equivalence.
    //
    // NOTE: When we support the observational subtyping fragment,
    // this should also respect proof-irrelevance, as described in
    // "Observational Equality, Now!"
    
    // NOTE: We assume exprA and exprB have already been beta-reduced.
    
    // NOTE: Even though we take exprA and exprB as env-term pairs, we
    // only use the terms.
    
    var aToB =
        opt_boundVarsAToB !== void 0 ? opt_boundVarsAToB : strMap();
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    var am, bm;
    function aget( k ) {
        return { env: exprA.env, term: am.val.get( k ) };
    }
    function bget( k ) {
        return { env: exprB.env, term: bm.val.get( k ) };
    }
    function recurWith( k, aToB ) {
        return knownEqual( aget( k ), bget( k ), aToB );
    }
    function recur( k ) {
        return recurWith( k, aToB );
    }
    function recurPlus( termK, argK ) {
        return recurWith( termK, aToB.plusEntry(
            am.val.get( argK ), bm.val.get( argK ) ) );
    }
    
    function aSucceeds( pattern ) {
        am = getMatch( exprA.term, pattern );
        if ( !am )
            return false;
        bm = getMatch( exprB.term, pattern );
        return true;
    }
    
    if ( isPrimString( exprA.term ) ) {
        if ( !isPrimString( exprB.term ) )
            return false;
        return aToB.has( exprA.term ) &&
            aToB.get( exprA.term ) === exprB.term;
        
    } else if ( aSucceeds(
        [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) && recurPlus( "resultType", "arg" );
        
    } else if ( aSucceeds(
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) && recurPlus( "result", "arg" );
        
    } else if ( aSucceeds( [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) &&
            recurPlus( "resultType", "argName" ) &&
            recur( "fn" ) && recur( "argVal" );
        
    } else if ( aSucceeds(
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recurPlus( "resultType", "arg" );
        
    } else if ( aSucceeds(
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recurPlus( "result", "arg" );
        
    } else if ( aSucceeds( [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recurPlus( "resultType", "argName" ) &&
            recur( "fn" ) && recur( "argVal" );
        
    } else if ( aSucceeds(
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) && recurPlus( "resultType", "arg" );
        
    } else if ( aSucceeds( [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) && recur( "argVal" ) &&
            recurPlus( "resultVal", "arg" );
        
    } else if ( aSucceeds( [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) &&
            recurPlus( "resultType", "argName" ) && recur( "fn" );
        
    } else if ( aSucceeds( [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        if ( !bm )
            return false;
        
        return recur( "argType" ) &&
            recurPlus( "resultType", "argName" ) && recur( "fn" );
        
    } else {
        // TODO: Handle more language fragments.
        return false;
    }
}

function betaReduce( expr ) {
    // NOTE: Pretty much every time we call betaReduce(), we call
    // isType() or typeCheck() first, so that we know beta reduction
    // will terminate (albeit without rigorous mathematical proof
    // yet).
    //
    // TODO: See if this practice leads to significant amounts of
    // duplicated computation.
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
    var getMatch = patternLang.getMatch;
    
    function eget( k ) {
        return { env: expr.env, term: em.val.get( k ) };
    }
    function beget( k ) {
        return betaReduce( eget( k ) );
    }
    
    var env = expr.env;
    
    // NOTE: This has a side effect (changing the binding of `env`),
    // even if we use it in a way that makes it look pure.
    function rename( k ) {
        var result = renameAway( env, [], beget( k ) );
        env = result.env;
        return result.term;
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
        if ( exprVal === null )
            throw new Error();
        
        // TODO: Figure out if it should be necessary to beta-reduce
        // env-term pairs before they're stored in environments (under
        // knownType and knownVal). We do this now, but do we have to?
        // Maybe we could beta-reduce knownVal here instead. But
        // where would we beta-reduce knownType?
        
        // TODO: See if a call to renameAway() here would obviate the
        // need to do renaming in any other case. After all, this
        // seems to be the only case whose result's environment has
        // mappings that conflict with the original environment.
        
        return exprVal.val;
    } else if ( em = getMatch( expr.term,
        [ lit( "tfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        var term = [ "tfa", em.val.get( "arg" ),
            rename( "argType" ), em.val.get( "resultType" ) ];
        return { env: env, term: term };
        
    } else if ( em = getMatch( expr.term,
        [ lit( "tfn" ), str( "arg" ), "argType", "result" ] ) ) {
        
        var term = [ "tfn", em.val.get( "arg" ),
            rename( "argType" ), em.val.get( "result" ) ];
        return { env: env, term: term };
        
    } else if ( em = getMatch( expr.term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term,
            [ lit( "tfn" ), str( "arg" ), "argType", "result" ] );
        if ( !matchedFn )
            throw new Error();
        return betaReduce( {
            env: reducedFn.env.plusEntry( matchedFn.val.get( "arg" ),
            {
                knownIsType: null,
                // TODO: Figure out if we actually need this knownType
                // here. If so, figure out whether we should use
                // argType from matchedFn instead.
                knownType: { val: beget( "argType" ) },
                knownVal: { val: beget( "argVal" ) }
            } ),
            term: matchedFn.val.get( "result" )
        } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        return expr;
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfn" ), str( "arg" ), "result" ] ) ) {
        
        return expr;
        
    } else if ( em = getMatch( expr.term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term,
            [ lit( "ttfn" ), str( "arg" ), "result" ] );
        if ( !matchedFn )
            throw new Error();
        return betaReduce( {
            env: reducedFn.env.plusEntry( matchedFn.val.get( "arg" ),
            {
                // TODO: Figure out if we actually need this
                // knownIsType here.
                knownIsType: { val: true },
                knownType: null,
                knownVal: { val: beget( "argVal" ) }
            } ),
            term: matchedFn.val.get( "result" )
        } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        var term = [ "sfa", em.val.get( "arg" ),
            rename( "argType" ), em.val.get( "resultType" ) ];
        return { env: env, term: term };
        
    } else if ( em = getMatch( expr.term, [ lit( "sfn" ),
        str( "arg" ), "argType", "argVal", "resultVal" ] ) ) {
        
        var term = [ "sfn", em.val.get( "arg" ), rename( "argType" ),
            rename( "argVal" ), rename( "resultVal" ) ];
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
        return { env: env, term: matchedFn.val.get( "resultVal" ) };
        
    } else {
        // TODO: Handle more language fragments.
        throw new Error();
    }
}

function isType( expr ) {
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
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
        
        if ( !isType( eget( "argType" ) ) )
            return false;
        return isType( {
            env: expr.env.plusEntry( em.val.get( "arg" ), {
                knownIsType: null,
                knownType: { val: beget( "argType" ) },
                knownVal: null
            } ),
            term: em.val.get( "resultType" )
        } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "ttfa" ), str( "arg" ), "resultType" ] ) ) {
        
        return isType( {
            env: expr.env.plusEntry( em.val.get( "arg" ), {
                knownIsType: { val: true },
                knownType: null,
                knownVal: null
            } ),
            term: em.val.get( "resultType" )
        } );
        
    } else if ( em = getMatch( expr.term,
        [ lit( "sfa" ), str( "arg" ), "argType", "resultType" ] ) ) {
        
        if ( !isType( eget( "argType" ) ) )
            return false;
        return isType( {
            env: expr.env.plusEntry( em.val.get( "arg" ), {
                knownIsType: null,
                knownType: { val: beget( "argType" ) },
                knownVal: null
            } ),
            term: em.val.get( "resultType" )
        } );
    } else {
        // TODO: Handle more language fragments.
        return false;
    }
}

function typeCheck( expr, type ) {
    // NOTE: The type is assumed to be beta-reduced already.
    
    var lit = patternLang.lit;
    var str = patternLang.str;
    var pat = patternLang.pat;
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
        if ( !isType( eget( "argType" ) ) )
            return false;
        if ( !knownEqual( beget( "argType" ), argType ) )
            return false;
        // TODO: Figure out whether argType can have free variables at
        // this point.
        return typeCheck( {
            env: expr.env.plusEntry( em.val.get( "arg" ), {
                knownIsType: null,
                knownType: { val: argType },
                knownVal: null
            } ),
            term: em.val.get( "result" ),
        }, betaReduce( {
            env: type.env.plusEntry( tm.val.get( "arg" ), {
                knownIsType: null,
                knownType: { val: argType },
                knownVal: null
            } ),
            term: tm.val.get( "resultType" )
        } ) );
        
    } else if ( em = getMatch( expr.term, [ lit( "tcall" ),
        str( "argName" ), "argType", "resultType",
        "fn", "argVal" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "tfa", em.val.get( "argName" ), em.val.get( "argType" ),
                em.val.get( "resultType" ) ] };
        if ( !isType( fnType ) )
            return false;
        if ( !typeCheck( eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        var argType = beget( "argType" );
        if ( !typeCheck( eget( "argVal" ), argType ) )
            return false;
        return knownEqual(
            betaReduce( {
                env: expr.env.plusEntry( em.val.get( "argName" ), {
                    knownIsType: null,
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
        return typeCheck( eget( "result" ), tget( "resultType" ) );
        
    } else if ( em = getMatch( expr.term, [ lit( "ttcall" ),
        str( "argName" ), "resultType", "fn", "argVal" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "ttfa", em.val.get( "argName" ),
                em.val.get( "resultType" ) ] };
        if ( !isType( fnType ) )
            return false;
        if ( !typeCheck( eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        if ( !isType( eget( "argVal" ) ) )
            return false;
        return knownEqual(
            betaReduce( {
                env: expr.env.plusEntry( em.val.get( "argName" ), {
                    knownIsType: { val: true },
                    knownType: null,
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
        var argType = tget( "argType" );
        if ( !isType( eget( "argType" ) ) )
            return false;
        if ( !knownEqual( beget( "argType" ), argType ) )
            return false;
        if ( !typeCheck( eget( "argVal" ), argType ) )
            return false;
        return typeCheck( eget( "resultVal" ), betaReduce( {
            env: type.env.plusEntry( tm.val.get( "arg" ), {
                knownIsType: null,
                knownType: { val: argType },
                knownVal: { val: beget( "argVal" ) }
            } ),
            term: tm.val.get( "resultType" )
        } ) );
        
    } else if ( em = getMatch( expr.term, [ lit( "fst" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "sfa", em.val.get( "argName" ), em.val.get( "argType" ),
                em.val.get( "resultType" ) ] };
        if ( !isType( fnType ) )
            return false;
        if ( !typeCheck( eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        return knownEqual( beget( "argType" ), type );
        
    } else if ( em = getMatch( expr.term, [ lit( "snd" ),
        str( "argName" ), "argType", "resultType", "fn" ] ) ) {
        
        var fnType = { env: expr.env, term:
            [ "sfa", em.val.get( "argName" ), em.val.get( "argType" ),
                em.val.get( "resultType" ) ] }
        if ( !isType( fnType ) )
            return false;
        if ( !typeCheck( eget( "fn" ), betaReduce( fnType ) ) )
            return false;
        var reducedFn = beget( "fn" );
        var matchedFn = getMatch( reducedFn.term, [ lit( "sfn" ),
            str( "arg" ), "argType", "argVal", "resultVal" ] );
        if ( matchedFn === null )
            return false;
        return typeCheck(
            { env: reducedFn.env,
                term: matchedFn.val.get( "resultVal" ) },
            type );
    } else {
        // TODO: Handle more language fragments.
        return false;
    }
}


// ===== Unit test runner ============================================

(function () {
    function run( i ) {
        if ( !(i < unitTests.length) )
            return;
        var unitTest = unitTests[ i ];
        unitTest( function () {
            run( i + 1 );
        } )
    }
    run( 0 );
})();
