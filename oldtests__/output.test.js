import fs from 'fs'
import postcss from 'postcss'
import plugin from '../../src'

function input (name) {
  return fs.readFileSync('__tests__/output/fixtures/' + name + '.in.pcss', 'utf-8').trim()
}

function output (name) {
  return fs.readFileSync('__tests__/output/fixtures/' + name + '.out.css', 'utf-8').trim()
}

function run (name) {
  return postcss([plugin()]).process(input(name), { from: undefined }).then(result => {
    expect(result.css).toMatchCSS(output(name))
    expect(result.warnings().length).toBe(0)
  })
}

it('parses advanced @space nesting under @responsive', () => {
  return run('spaceAdvancedNesting')
})

it('parses advanced nesting 2 levels under @responsive', () => {
  return run('spaceAdvancedNesting2levels')
})

it('parses advanced @extend with at-rules', () => {
  return run('extendAdvanced')
})
