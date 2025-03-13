import buildMediaQueryQ from '../../src/util/buildMediaQueryQ'
import resolveConfig from '../../src/util/resolveConfig'
import defaultConfig from '../../stubs/defaultConfig.js'

const config = resolveConfig([defaultConfig])
const { theme: { breakpoints, breakpointCollections } } = config

it('returns correct for <sm', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, '<sm')
  const expected = '(min-width: 0) and (max-width: 739px)'
  expect(output).toEqual(expected)
})

it('returns correct for <=sm', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, '<=sm')
  const expected = '(min-width: 0) and (max-width: 1023px)'
  expect(output).toEqual(expected)
})

it('returns correct for >sm', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, '>sm')
  const expected = '(min-width: 1024px)'
  expect(output).toEqual(expected)
})

it('returns correct for >=sm', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, '>=sm')
  const expected = '(min-width: 740px)'
  expect(output).toEqual(expected)
})

it('returns correct for >lg', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, '>lg')
  const expected = '(min-width: 1900px)'
  expect(output).toEqual(expected)
})

it('returns correct for >=lg', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, '>=lg')
  const expected = '(min-width: 1399px)'
  expect(output).toEqual(expected)
})

it('returns only xs', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, 'xs')
  const expected = '(min-width: 0) and (max-width: 739px)'
  expect(output).toEqual(expected)
})

it('returns only sm', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, 'sm')
  const expected = '(min-width: 740px) and (max-width: 1023px)'
  expect(output).toEqual(expected)
})

it('returns only md', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, 'md')
  const expected = '(min-width: 1024px) and (max-width: 1398px)'
  expect(output).toEqual(expected)
})

it('returns only lg', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, 'lg')
  const expected = '(min-width: 1399px) and (max-width: 1899px)'
  expect(output).toEqual(expected)
})

it('returns only xl', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, 'xl')
  const expected = '(min-width: 1900px)'
  expect(output).toEqual(expected)
})

it('parses multiple bps', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, 'xs/sm/xl')
  const expected = '(min-width: 0) and (max-width: 1023px), (min-width: 1900px)'
  expect(output).toEqual(expected)
})

it('parses collection', () => {
  const output = buildMediaQueryQ({ breakpoints, breakpointCollections }, '$desktop')
  const expected = '(min-width: 1024px)'
  expect(output).toEqual(expected)
})
