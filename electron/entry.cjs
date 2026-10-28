"use strict";
// Electron entry wrapper
// This file is loaded by Electron via package.json "main" field
// When Electron loads through a directory/package.json, it fully initializes
// the runtime (process.type, built-in electron module, etc.)
const path = require('path');
const Module = require('module');

// Patch Module._resolveFilename to intercept 'electron' after full init
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request === 'electron') {
    // Check if we can access the real electron API
    if (process.type === 'browser' && process.versions.electron) {
      try {
        // Use the built-in module system to get the real electron API
        const builtins = Module.builtinModules;
        if (builtins.includes('electron')) {
          return origResolve.call(this, request, parent, isMain, options);
        }
      } catch(e) {}
    }
  }
  return origResolve.apply(this, arguments);
};

// Bundle output is at out/main/index.js relative to project root
const mainEntry = path.join(__dirname, 'out', 'main', 'index.js');
if (require('fs').existsSync(mainEntry)) {
  require(mainEntry);
} else {
  console.error('Build output not found at', mainEntry);
  process.exit(1);
}