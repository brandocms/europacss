import { spawn } from 'node:child_process';
import { watchFile, unwatchFile } from 'node:fs';
import path from 'node:path';
import { sharedTargets, sameTargets } from './targets.js';

const normalize = (file) => path.resolve(file).replaceAll('\\', '/');

// One subprocess per compilation. argv/stdin transport never invokes a shell.
function compile(binary, request, cwd, targetsOnly = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, targetsOnly ? ['bridge', 'targets'] : ['bridge'], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const chunks = [];
    let size = 0;
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('EuropaCSS compilation timed out after 30 seconds'));
    }, 30_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Cannot start EuropaCSS executable ${JSON.stringify(binary)}: ${error.message}`));
    });
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024 * 1024) {
        child.kill();
        reject(new Error('EuropaCSS response exceeds 64 MiB'));
      } else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8192); });
    // EPIPE accompanies early exits; the close handler reports the actual result.
    child.stdin.on('error', () => {});
    child.on('close', (status) => {
      clearTimeout(timer);
      try {
        const response = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (response.version !== 1 || !Array.isArray(response.watchFiles)) {
          throw new Error('Unsupported EuropaCSS bridge response');
        }
        if (status !== 0 && !response.error) throw new Error(`EuropaCSS exited with status ${status}`);
        if (!response.error && (targetsOnly ? !response.targets || typeof response.targets !== 'object' || Array.isArray(response.targets) : typeof response.css !== 'string')) {
          throw new Error(targetsOnly ? 'Missing resolved browser targets; reinstall the EuropaCSS executable' : 'Missing compiled CSS');
        }
        resolve(response);
      } catch (error) {
        reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ''}`));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

/** Compile selected physical CSS entries before Vite's CSS pipeline. */
export default function europa(options = {}) {
  let root;
  let binary;
  let config;
  let server;
  let targets;
  let debugTokens = false;
  const entries = new Map();
  const pending = new Set();
  const generations = new Map();
  const ignoredDependencies = new Map();
  let recoverIgnored;

  const stopIgnoredWatches = () => {
    for (const [file, listener] of ignoredDependencies) unwatchFile(file, listener);
    ignoredDependencies.clear();
  };
  const syncIgnoredWatches = () => {
    if (!server || !recoverIgnored || server.config.server.watch === null) return;
    // Vite always excludes node_modules from its watcher, even for explicitly
    // added files. Poll only dependencies actually read by Europa, not the tree.
    const needed = new Set([...entries.values()].flatMap(files => [...files].filter(file => file.includes('/node_modules/'))));
    for (const [file, listener] of ignoredDependencies) {
      if (!needed.has(file)) {
        unwatchFile(file, listener);
        ignoredDependencies.delete(file);
      }
    }
    for (const file of needed) {
      if (ignoredDependencies.has(file)) continue;
      const listener = (current, previous) => {
        if (current.mtimeMs === previous.mtimeMs && current.ctimeMs === previous.ctimeMs && current.size === previous.size && current.ino === previous.ino) return;
        Promise.allSettled([...pending]).then(() => {
          if (ignoredDependencies.has(file)) recoverIgnored(file);
        });
      };
      ignoredDependencies.set(file, listener);
      watchFile(file, { persistent: false, interval: 250 }, listener);
    }
  };

  const affectedModules = (file, graph) => {
    const modules = new Set();
    for (const [id, watched] of entries) {
      if (watched.has(normalize(file))) {
        const module = graph.getModuleById(id);
        if (module) modules.add(module);
      }
    }
    return modules;
  };

  return {
    name: 'vite-plugin-europacss-native',
    enforce: 'pre',
    config: {
      order: 'post',
      async handler(userConfig) {
        root = path.resolve(userConfig.root ?? process.cwd());
        binary = options.binary ?? 'europa';
        if (binary.includes('/') || binary.includes('\\')) binary = path.resolve(root, binary);
        const response = await compile(binary, { version: 1, browsers: options.targets ?? [] }, root, true);
        if (response.error) throw new Error(`[${response.error.code}] ${response.error.message} (resolving EuropaCSS targets; check the query and reinstall europa if the executable is older than the adapter)`);
        targets = sharedTargets(response.targets);
        // Replace arrays rather than merge them with Vite/legacy-plugin defaults.
        userConfig.build ??= {};
        userConfig.build.cssTarget = [...targets.vite];
        userConfig.css ??= {};
        userConfig.css.lightningcss ??= {};
        userConfig.css.lightningcss.targets = { ...targets.lightning };
      },
    },
    configResolved(resolved) {
      if (!targets || !sameTargets(resolved.build.cssTarget, targets.vite) ||
          JSON.stringify(Object.entries(resolved.css?.lightningcss?.targets ?? {}).sort()) !== JSON.stringify(Object.entries(targets.lightning).sort())) {
        throw new Error(`Another plugin changed EuropaCSS CSS targets. Configure browser support only with europa({ targets: [...] }). Expected ${JSON.stringify(targets?.vite)}, received ${JSON.stringify(resolved.build.cssTarget)}.`);
      }
      debugTokens = options.debugTokens === true && resolved.command === 'serve';
      root = resolved.root;
      binary = options.binary ?? 'europa';
      if (binary.includes('/') || binary.includes('\\')) binary = path.resolve(root, binary);
      config = options.config === false ? null : path.resolve(root, options.config ?? 'europa.json5');
    },
    configureServer(devServer) {
      server = devServer;
      // Vite's handleHotUpdate is only called for changes. Missing imports/configs
      // need add/unlink events too, including recovery from the initial build.
      const recover = (file) => {
        const modules = affectedModules(file, server.moduleGraph);
        if (!modules.size) return;
        for (const module of modules) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload', path: '*' });
      };
      server.watcher.on('add', recover);
      server.watcher.on('unlink', recover);
      recoverIgnored = recover;
      server.httpServer?.once('close', () => {
        server.watcher.off('add', recover);
        server.watcher.off('unlink', recover);
        stopIgnoredWatches();
      });
    },
    closeBundle() {
      stopIgnoredWatches();
    },
    async transform(source, id) {
      const [filename, query = ''] = id.split('?', 2);
      const params = new URLSearchParams(query);
      if (id.startsWith('\0') || !path.isAbsolute(filename) || !filename.endsWith('.css') ||
          params.has('raw') || params.has('url') || params.has('vue') || params.has('svelte') ||
          (options.include && !options.include(filename))) return null;

      const promise = compile(binary, { version: 1, filename, source, config, browsers: targets.browsers, ...(debugTokens ? { debugTokens: true } : {}) }, root);
      const generation = Symbol();
      generations.set(id, generation);
      pending.add(promise);
      let response;
      try { response = await promise; }
      catch (error) { this.error(error); }
      finally { pending.delete(promise); }
      const watched = new Set(response.watchFiles.map(normalize));
      // Keep the last complete graph on failure, so edits to later imports can
      // also recover a broken entry. Successful builds discard obsolete paths.
      if (response.error) for (const file of entries.get(id) ?? []) watched.add(file);
      // A superseded compilation must not replace the latest dependency graph.
      if (generations.get(id) === generation) {
        entries.set(id, watched);
        syncIgnoredWatches();
      }
      // Vite already watches the entry. Adding it as its own dependency creates
      // an import cycle in Vite's CSS graph and forces full reloads.
      for (const file of watched) {
        // Vite treats non-CSS dependencies of CSS as full-reload boundaries.
        // In dev our own graph handles those; Rollup still needs them in builds.
        if (file !== normalize(filename) && (!server || file.endsWith('.css'))) this.addWatchFile(file);
      }
      server?.watcher.add([...watched]);
      const diagnostic = (error) => ({
        message: `[${error.code}] ${error.message}`,
        id: error.filename ?? filename,
        ...(error.line > 0 ? { loc: { file: error.filename ?? filename, line: error.line, column: Math.max(0, error.column - 1) } } : {}),
      });
      for (const warning of response.warnings ?? []) this.warn(diagnostic(warning));
      if (response.error) this.error(diagnostic(response.error));
      return { code: response.css, map: response.map };
    },
    async handleHotUpdate(ctx) {
      // Include an in-flight compilation's newly discovered dependencies.
      await Promise.allSettled(pending.values());
      const affected = affectedModules(ctx.file, ctx.server.moduleGraph);
      for (const module of affected) ctx.server.moduleGraph.invalidateModule(module);
      return [...new Set([...ctx.modules, ...affected])];
    },
  };
}
