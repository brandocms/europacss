import { isEqual } from 'lodash'
import { matcherHint, printReceived, printExpected } from 'jest-matcher-utils'
import { diff } from 'jest-diff'

// const replaceWhitespace = replace(/\s+/g, ` `)
// const compressWhitespace = map(replaceWhitespace)
const name = `toMatchCSS`

expect.extend({
  toMatchCSS(received, expected) {
    const [receivedWithCompresssedWhitespace, expectedWithCompresssedWhitespace] = [
      received,
      expected
    ].map(str => str.replace(/\s+/g, ' ').trim())
    const pass = isEqual(receivedWithCompresssedWhitespace, expectedWithCompresssedWhitespace)
    const message = pass
      ? () =>
          `${matcherHint(`.not.${name}`)}\n\n` +
          `Uncompressed expected value:\n` +
          `  ${printExpected(expected)}\n` +
          `Expected value with compressed whitespace to not equal:\n` +
          `  ${printExpected(expectedWithCompresssedWhitespace)}\n` +
          `Uncompressed received value:\n` +
          `  ${printReceived(received)}\n` +
          `Received value with compressed whitespace:\n` +
          `  ${printReceived(receivedWithCompresssedWhitespace)}`
      : () => {
          const diffString = diff(
            expectedWithCompresssedWhitespace,
            receivedWithCompresssedWhitespace,
            {
              expand: this.expand
            }
          )
          return (
            `${matcherHint(`.${name}`)}\n\n` +
            `Uncompressed received value:\n` +
            `  ${printReceived(received)}\n` +
            `Uncompressed expected value:\n` +
            `  ${printExpected(expected)}\n`
          )
        }
    return {
      actual: received,
      expected,
      message,
      name,
      pass
    }
  }
})
