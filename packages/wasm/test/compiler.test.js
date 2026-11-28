import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createCompiler, wasmUrl } from '../index.js'

const examples = new URL('../../../crates/europacss/examples/', import.meta.url)
const source = readFileSync(new URL('app.css', examples), 'utf8')
const config = readFileSync(new URL('europa.json5', examples), 'utf8')
const europa = await createCompiler()

test('the module needs no host imports', () => {
  const module = new WebAssembly.Module(readFileSync(wasmUrl))
  assert.deepEqual(WebAssembly.Module.imports(module), [])
})

test('reports the package version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(europa.version, pkg.version)
})

test('compiles the example stylesheet', () => {
  const result = europa.compile({ source, config, browsers: ['chrome 100'] })
  assert.equal(result.error, null)
  assert.match(result.css, /@layer components/)
  assert.match(result.css, /@media \(min-width:/)
})

test('matches the native executable', { skip: !process.env.EUROPA_BINARY && 'set EUROPA_BINARY' }, () => {
  const native = execFileSync(process.env.EUROPA_BINARY, [
    new URL('app.css', examples).pathname, '--config', new URL('europa.json5', examples).pathname,
    '--targets', 'chrome 100', '--quiet',
  ], { encoding: 'utf8' })
  assert.equal(europa.compile({ source, config, browsers: ['chrome 100'] }).css, native)
})

test('accepts config objects, minify and source maps', () => {
  const result = europa.compile({
    source: '.a { @color fg ink; }',
    config: { theme: { colors: { ink: '#102030' } } },
    filename: 'theme.css',
    minify: true,
    sourceMap: true,
  })
  assert.equal(result.css, '.a{color:#102030}')
  assert.deepEqual(result.map.sources, ['theme.css'])
})

test('returns located diagnostics instead of throwing', () => {
  const css = europa.compile({ source: '.a {\n  @space margin-top nope;\n}', config })
  assert.equal(css.css, null)
  assert.deepEqual([css.error.code, css.error.line, css.error.column], ['EU_SIZE', 2, 3])

  const json5 = europa.compile({ source: '.a {}', config: '{\n  theme: {\n    colors: { a: 1 \n' })
  assert.equal(json5.error.filename, 'europa.json5')
  assert.equal(json5.error.code, 'EU_CONFIG')
  assert.ok(json5.error.line >= 3, JSON.stringify(json5.error))
})

test('previews config tokens', () => {
  const { preview } = europa.preview(config)
  assert.ok(preview.colors.length > 0)
  assert.ok(preview.breakpoints.length > 0)
  assert.match(europa.preview('{ nope').error, /./)
})

test('survives memory growth across many compilations', () => {
  const big = Array.from({ length: 4000 }, (_, i) => `.r${i} { @space margin-top md; @color fg text; }`).join('\n')
  const first = europa.compile({ source: big, config })
  assert.equal(first.error, null)
  for (let i = 0; i < 50; i++) europa.compile({ source, config })
  assert.equal(europa.compile({ source: big, config }).css, first.css)
})

test('resolves configs with defaults and references', () => {
  const { config: resolved } = europa.resolveConfig('{ theme: { colors: { a: "#111", b: "{colors.a}" } } }')
  assert.equal(resolved.theme.colors.b, '#111')
  assert.ok(resolved.theme.breakpoints)
  assert.equal(europa.resolveConfig('{ a: 1, a: 2 }').error.code, 'EU_CONFIG')
})

test('scopes module styles and limits external URLs', () => {
  const ok = europa.compile({
    source: '.inner { background: url(/a.png); }',
    config,
    minify: true,
    scope: '[b-tpl="hero"]',
    externalUrls: ['cdn.example.com'],
  })
  assert.equal(ok.error, null)
  assert.match(ok.css, /^\[b-tpl=hero\] \.inner\{/)
  const escape = europa.compile({ source: '& ~ * { display: none; }', config, scope: '[b-tpl="hero"]' })
  assert.equal(escape.error.code, 'EU_SCOPE')
  const beacon = europa.compile({ source: 'input { background: url(https://evil.example/?a); }', config, externalUrls: 'deny' })
  assert.deepEqual([beacon.error.code, beacon.error.line, beacon.error.column], ['EU_EXTERNAL_URL', 1, 25])
})
