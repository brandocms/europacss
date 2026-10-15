#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const { getBinaryPath } = require('../index.cjs');

try {
  const child = spawn(getBinaryPath(), process.argv.slice(2), { stdio: 'inherit', windowsHide: true });
  const signals = ['SIGINT', 'SIGTERM'];
  const handlers = new Map(signals.map(signal => [signal, () => child.kill(signal)]));
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const cleanup = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
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
  console.error(error.message);
  process.exitCode = 1;
}
