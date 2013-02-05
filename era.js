// TODO: Decide whether to introduce a dependency on Lathe.js just for
// these utilities.
function defer( body ) {
    setTimeout( function () {
        body();
    }, 0 );
}
function objPlus( a, b ) {
    var result = {};
    [ a, b ].forEach( function ( obj ) {
        for ( var k in obj )
            if ( {}.hasOwnProperty.call( obj, k ) )
                result[ k ] = obj[ k ];
    } );
    return result;
}

// $.stream.readc
// $.stream.peekc
// $.then
// $.macros
// $.list
// $.end
// $.unrecognized
function reader( $ ) {
    $.stream.peekc( function ( c ) {
        if ( !c )
            return void $.end( $ );
        var readerMacro = $.macros[ c ];
        if ( !readerMacro )
            return void $.unrecognized( $ );
        readerMacro( $ );
    } );
}
function addReaderMacros( readerMacros, string, func ) {
    for ( var i = 0, n = string.length; i < n; i++ )
        readerMacros[ string.charAt( i ) ] = func;
}
var symbolChars = "abcdefghijklmnopqrstuvwxyz";
symbolChars += symbolChars.toUpperCase() + "-*1234567890";
var symbolChopsChars = { "(": ")", "[": "]" };
var whiteChars = " \t\r\n";
// NOTE: The readListUntilParen() function is only for use by the "("
// and "/" macros to reduce duplication.
function readListUntilParen( $, consumeParen ) {
    function sub( $, list ) {
        return objPlus( $, {
            list: list,
            macros: objPlus( $.macros, { ")": function ( $sub ) {
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

var readerMacros = {};
readerMacros[ ";" ] = function ( $ ) {
    function loop() {
        $.stream.readc( function ( c ) {
            if ( !c )
                return void $.end();
            if ( /^[\r\n]$/.test( c ) )
                return void reader( $ );
            loop();
        } );
    }
    loop();
};
addReaderMacros( readerMacros, whiteChars, function ( $ ) {
    $.stream.readc( function ( c ) {
        reader( $ );
    } );
} );
addReaderMacros( readerMacros, symbolChars, function ( $ ) {
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
                    && symbolChopsChars[ c ] === void 0) )
                return void $.then( { ok: true, val: stringSoFar } );
            $.stream.readc( function ( open ) {
                var nextStringSoFar = stringSoFar + open;
                var close = symbolChopsChars[ open ];
                if ( close !== void 0 )
                    collectChops( nextStringSoFar, open, close, 1 );
                else
                    collect( nextStringSoFar );
            } );
        } );
    }
    collect( "" );
} );
readerMacros[ "(" ] = function ( $ ) {
    readListUntilParen( $, !!"consumeParen" );
};
readerMacros[ "/" ] = function ( $ ) {
    readListUntilParen( $, !"consumeParen" );
};

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

reader( {
    stream: stringStream(
        " (woo;comment\n b (c( woo( ) string) / x//)/())" ),
    macros: readerMacros,
    end: function ( $ ) {
        $.then( { ok: false, msg: "Reached the end" } );
    },
    unrecognized: function ( $ ) {
        $.then( { ok: false, msg: "Unrecognized char" } );
    },
    then: function ( result ) {
        console.log( JSON.stringify( result ) );
    }
} );