#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const { getBinaryPath } = require('../index.cjs');

// Install handlers before spawning: the executable can produce output (and a
// supervisor can request shutdown) before spawn() returns to this process.
let child, pendingSignal;
const handlers = new Map(['SIGINT', 'SIGTERM'].map(signal => [signal, () => {
  if (child) child.kill(signal);
  else pendingSignal = signal;
}]));
for (const [signal, handler] of handlers) process.on(signal, handler);
const cleanup = () => {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
};

try {
  child = spawn(getBinaryPath(), process.argv.slice(2), { stdio: 'inherit', windowsHide: true });
  if (pendingSignal) child.kill(pendingSignal);
  child.on('error', error => {
    cleanup();
    console.error(`Cannot start EuropaCSS: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    cleanup();
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
} catch (error) {
  cleanup();
  console.error(error.message);
  process.exitCode = 1;
}
