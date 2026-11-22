import samsungEngines from './samsung-engines.js';

const families = new Set(['chrome', 'edge', 'firefox', 'ie', 'ios_saf', 'opera', 'safari']);
const versionText = (version) => `${version >>> 16}.${(version >>> 8) & 255}`;

// Vite's CSS target conversion only supports these engine families and drops
// patch versions. Normalize once, then give both compilers the same floors.
export function sharedTargets(resolved) {
  const engines = {};
  for (let [browser, version] of Object.entries(resolved)) {
    if (!Number.isInteger(version) || version < 0 || version > 0xffffff) {
      throw new Error('Invalid browser version returned by EuropaCSS');
    }
    if (browser === 'android') {
      // Browserslist's modern Android entry is Chromium's version, not Android OS.
      if ((version >>> 16) < 37) throw new Error('Vite cannot represent stock Android Browser targets. Use Chromium-era browser targets for this adapter.');
      browser = 'chrome';
    } else if (browser === 'samsung') {
      const chromium = samsungEngines[versionText(version)];
      if (!chromium) throw new Error(`No Chromium mapping for Samsung Internet ${versionText(version)}. Update the EuropaCSS adapter before using this target.`);
      version = Number(chromium) << 16;
      browser = 'chrome';
    }
    if (!families.has(browser)) throw new Error(`Vite cannot represent the EuropaCSS browser target ${browser}`);
    version &= 0xffff00;
    engines[browser] = Math.min(engines[browser] ?? version, version);
  }
  if (!Object.keys(engines).length) throw new Error('EuropaCSS targets did not select any supported browsers');
  const entries = Object.entries(engines).sort(([a], [b]) => a.localeCompare(b));
  return {
    lightning: Object.fromEntries(entries),
    vite: entries.map(([browser, version]) => `${browser === 'ios_saf' ? 'ios' : browser}${versionText(version)}`),
    browsers: entries.map(([browser, version]) => `${browser} ${versionText(version)}`),
  };
}

export const sameTargets = (a, b) => JSON.stringify([...new Set([a].flat())].sort()) === JSON.stringify([...new Set([b].flat())].sort());
