'use strict';

const { accessSync, constants } = require('node:fs');
const path = require('node:path');
const { platformPackage } = require('./platform.cjs');
const { version } = require('./package.json');

/** Absolute path to this package's matching native executable. Never searches PATH. */
function getBinaryPath() {
  const name = platformPackage();
  let manifest;
  try {
    manifest = require.resolve(`${name}/package.json`);
  } catch (cause) {
    throw new Error(`Missing EuropaCSS platform package ${name}@${version}. Reinstall @brandocms/europacss-cli with optional dependencies enabled, on the machine that runs the build. Do not copy node_modules between platforms.`, { cause });
  }
  const installed = require(manifest).version;
  if (installed !== version) {
    throw new Error(`EuropaCSS binary version mismatch: expected ${name}@${version}, found ${installed}. Reinstall dependencies using your lockfile.`);
  }
  const binary = path.join(path.dirname(manifest), 'bin', process.platform === 'win32' ? 'europa.exe' : 'europa');
  try {
    accessSync(binary, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
  } catch (cause) {
    throw new Error(`EuropaCSS executable is missing or not executable: ${binary}. Reinstall ${name}@${version}.`, { cause });
  }
  return binary;
}

module.exports = { getBinaryPath };
