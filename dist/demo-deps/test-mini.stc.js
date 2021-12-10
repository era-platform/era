"use strict";
var eraPlatform = eraPlatform || {};
eraPlatform.staccatoFiles = eraPlatform.staccatoFiles || {};
eraPlatform.staccatoFiles[ "test-mini.stc" ] =
"\\= test-mini.stc\n\\= Copyright 2016, 2021 Ross Angle. Released under the MIT License.\n\\=\n\\= These are some tests for Staccato mini. They depend on\n\\= era-staccato-lib.stc, the the `list` macro defined in\n\\= era-staccato-self-compiler.stc, and the `test` macro implemented in\n\\= era-staccato-lib-runner-mini.js.\n\\=\n\\= See era-staccato.js for more information about what Staccato is\n\\= and era-staccato-lib-runner-mini.js for more information about what\n\\= Staccato mini is.\n\n(test\n  (list (nil) (nil))\n  (cons (nil) /cons (nil) /nil))\n";
