// Next resolves its server-only marker at build time. In Node-only server tests,
// use Next's own empty server implementation; application imports stay intact.
const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) {
  return resolve.call(this, name === 'server-only' ? 'next/dist/compiled/server-only/empty.js' : name, ...args);
};
