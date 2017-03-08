"use strict";
var eraPlatform = eraPlatform || {};
eraPlatform.staccatoFiles = eraPlatform.staccatoFiles || {};
eraPlatform.staccatoFiles[ "test.stc" ] =
"\\= test.stc\n\\= Copyright 2015, 2016 Ross Angle. Released under the MIT License.\n\\=\n\\= These are some tests for Staccato. They depend on\n\\= era-staccato-lib.stc as well as the `test` macro implemented in\n\\= era-staccato-lib-runner.js.\n\\=\n\\= See era-staccato.js for more information about what Staccato is.\n\n(test\n  (rev/cons (yep/nil) /cons (nope/nil) /nil)\n  (cons (nope/nil) /cons (yep/nil) /nil))\n\n(test\n  (rev/nil)\n  (nil))\n\n(test\n  (not/yep/nil)\n  (nope/nil))\n\n(test\n  (let x (nope/nil) y (yep/nil)\n  /let x y y x\n  /cons x y)\n  (cons (yep/nil) (nope/nil)))\n\n(test\n  (list (nil) (nil))\n  (cons (nil) /cons (nil) /nil))\n";
