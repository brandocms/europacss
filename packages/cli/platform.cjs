'use strict';

const platforms = require('./platforms.json');

function platformPackage(os = process.platform, cpu = process.arch, libc) {
  if (os === 'linux' && libc === undefined) {
    libc = process.report.getReport().header.glibcVersionRuntime ? 'glibc' : 'musl';
  }
  const platform = platforms.find(p => p.os === os && p.cpu === cpu && p.libc === libc);
  if (!platform) {
    throw new Error(`EuropaCSS does not provide a binary for ${os}/${cpu}${libc ? `/${libc}` : ''}. Supported platforms: ${platforms.map(p => p.suffix).join(', ')}.`);
  }
  return `@brandocms/europacss-${platform.suffix}`;
}

module.exports = { platformPackage };
