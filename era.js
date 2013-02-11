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

function StrMap() {
    this.contents_ = {};
};
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
    return new StrMap().setAll( this );
};
StrMap.prototype.add = function ( k ) {
    return this.set( k, true );
};
StrMap.prototype.plus = function ( other ) {
    return this.copy().setAll( other );
};
StrMap.prototype.plusObj = function ( other ) {
    return this.copy().setObj( other );
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
    var result = new StrMap();
    result.contents_ = objMinus( this.contents_, other.contents_ );
    return result;
};
// TODO: Find a better name for this.
StrMap.prototype.minusArrTruth = function ( arr ) {
    return this.minus( new StrMap().plusArrTruth( arr ) );
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

function logJson( x ) {
    console.log( JSON.stringify( x ) );
}

var unitTests = [];


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
            readerMacros: $.readerMacros.plusObj( { ")":
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
            } } ),
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
var symbolChopsChars = new StrMap().setObj( { "(": ")", "[": "]" } );
var whiteChars = " \t\r\n";

var readerMacros = new StrMap();
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

unitTests.push( function ( then ) {
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
            logJson( result );
            then();
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

var macros = new StrMap();
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

unitTests.push( function ( then ) {
    logJson( macroexpand( macros, [ "log", "hello" ] ) );
    defer( function () {
        then();
    } );
} );


// ===== Alpha-equivalent pattern matching ===========================

function makeAlphaGrammar( spec ) {
    var n = spec.length;
    
    // Validate the spec.
    var names = new StrMap();
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
            var deps = new StrMap();
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
        
        var bindings = new StrMap();
        for ( var i = 0; i < n; i++ ) {
            var param = params[ i ];
            if ( namelessSpec[ i ] === null
                && !isPrimString( param ) )
                return { ok: false, msg: "Var expected" };
            if ( bindings.has( param ) )
                return { ok: false, msg: "Duplicate var" };
            bindings.add( param );
        }
        return { ok: true, val: arrMap( spec, function ( specPart ) {
            if ( specPart === null )
                return null;
            return { boundVars: arrMap( specPart, function ( i ) {
                return params[ i ];
            } ), term: specPart };
        } ) };
    }
    
    var result = {};
    result.parsePattern = function (
        matcher, alphaGrammars, boundVars, patParams ) {
        
        var namedPat = nameTerm( patParams );
        if ( !namedPat.ok )
            return namedPat;
        var parsedPat = [];
        var result = {};
        result.freeVars = new StrMap();
        result.treeNames = new StrMap();
        function addTreeName( treeName ) {
            if ( result.treeNames.has( treeName ) )
                return { ok: false, msg: "Duplicate tree name" };
            result.treeNames.add( treeName );
        }
        for ( var i = 0; i < n; i++ ) {
            var patPart = namedPat[ i ];
            if ( patPart === null ) {
                parsedPat.push( { type: "var" } );
                continue;
            }
            var theseBoundVars =
                boundVars.plusArrTruth( patPart.boundVars );
            var processSubpat = function () {
                var subpat = matcher.parsePattern(
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
                var treeParamsMap = new StrMap();
                for ( var j = 0, m = treeParams.length;
                    j < m; j++ ) {
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
                    var subpat = matcher.parsePattern(
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
            matcher, toTreeVars, fromTreeVars, namedData ) {
            
            var trees = new StrMap();
            for ( var i = 0; i < n; i++ ) {
                var patPart = parsedPat[ i ];
                var dataPart = namedData[ i ];
                if ( patPart.type === "var" )
                    continue;
                var theseToTreeVars = toTreeVars.copy();
                var theseFromTreeVars = fromTreeVars.copy();
                for ( var j = 0, m = patPart.boundVars.length;
                    j < m; j++ )
                    theseToTreeVars.del( theseFromTreeVars.get(
                        patPart.boundVars[ j ] ) );
                for ( var j = 0, m = patPart.boundVars.length;
                    j < m; j++ ) {
                    theseFromTreeVars.set( patPart.boundVars[ j ],
                        dataPart.boundVars[ j ] );
                    theseToTreeVars.set( dataPart.boundVars[ j ],
                        patPart.boundVars[ j ] );
                }
                if ( patPart.type === "insbs" ) {
                    trees.set( patPart.name, { params:
                        arrMap( patPart.params, function ( treeVar ) {
                            return theseFromTreeVars.get( treeVar );
                        } ), term: dataPart.term } );
                } else if ( patPart.type === "subpat" ) {
                    var subtrees = matcher.getTrees( patPart.subpat,
                        theseToTreeVars, theseFromTreeVars,
                        dataPart.term );
                    if ( !subtrees.ok )
                        return subtrees;
                    trees.setAll( subtrees.val );
                }
            }
            return { ok: true, val: trees };
        };
        result.patWithoutInfo.getLeaves = function (
            matcher, alphaGrammars, trees, boundVars, namedData ) {
            
            var leaves = new StrMap();
            for ( var i = 0; i < n; i++ ) {
                var patPart = parsedPat[ i ];
                var dataPart = namedData[ i ];
                if ( patPart.type === "outsbs" ) {
                    if ( !trees.has( patPart.name ) )
                        return { ok: false, msg:
                            "Unrecognized tree name" };
                    var tree = trees.get( patPart.name );
                    var numParams = tree.params.length;
                    if ( patPart.params.length !== numParams )
                        return { ok: false, msg:
                            "Incorrect number of tree params" };
                    var treeParams = new StrMap();
                    for ( var i = 0; i < numParams; i++ )
                        treeParams.set(
                            tree.params[ i ], patPart.params[ i ] );
                    var subleaves = matcher.getLeavesUnderTree(
                        treeParams, tree.term, alphaGrammars, trees,
                        boundVars.plusArrTruth( dataPart.boundVars ),
                        dataPart.term );
                    if ( !subleaves.ok )
                        return subleaves;
                    leaves.setAll( subleaves.val );
                } else if ( patPart.type === "subpat" ) {
                    var subleaves = matcher.getLeaves(
                        patPart.subpat, alphaGrammars, trees,
                        boundVars.plusArrTruth( dataPart.boundVars ),
                        dataPart.term );
                    if ( !subleaves.ok )
                        return subleaves;
                    leaves.setAll( subleaves.val );
                }
            }
            return { ok: true, val: leaves };
        };
        return { ok: true, val: result };
    };
    return { ok: true, val: result };
}

var matcher = {};
matcher.parsePattern = function ( alphaGrammars, boundVars, term ) {
    // TODO: Implement this in terms of grammars' parsePattern(
    // matcher, alphaGrammars, boundVars, patParams ) method. That
    // method returns a patWithoutInfo (among other things), and this
    // one will return a patWithInfo (among other things).
};
matcher.getTrees = function (
    patWithInfo, toTreeVars, fromTreeVars, data ) {
    
    // TODO: Implement this in terms of patterns' getTrees(
    // matcher, toTreeVars, fromTreeVars, namedData ) method.
};
matcher.getLeavesUnderTree = function ( baseTreeParams, baseTreeTerm,
    alphaGrammars, trees, boundVars, data ) {
    
    // TODO: Implement this in terms of patterns' getLeaves(
    // matcher, alphaGrammars, trees, boundVars, namedData ) method.
    // Note that patterns probably won't need their own
    // getLeavesUnderTree() method, since the traversal of
    // "namedData"-style data representations doesn't require the use
    // of grammar-specific details.
};
matcher.getLeaves = function (
    patWithInfo, alphaGrammars, trees, boundVars, data ) {
    
    // TODO: Implement this in terms of patterns' getLeaves(
    // matcher, alphaGrammars, trees, boundVars, namedData ) method.
};

var alphaGrammars = new StrMap();
// TODO: This is just for getting started. Remove it.
alphaGrammars.set( "fn", makeAlphaGrammar( [ "x", [ "x" ] ] ) );

// TODO: Write a unit test.


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
