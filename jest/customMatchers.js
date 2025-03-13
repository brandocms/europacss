const prettier = require('prettier')
const { diff } = require('jest-diff')
const lightningcss = require('lightningcss')
const log = require('../src/util/log').default

let warn

beforeEach(() => {
  warn = jest.spyOn(log, 'warn')
  warn.mockImplementation(() => {})

  // jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

function formatPrettier(input) {
  return prettier.format(input, {
    parser: 'css',
    printWidth: 100
  })
}

function format(input) {
  try {
    return [
      lightningcss
        .transform({
          filename: 'input.css',
          code: Buffer.from(input),
          minify: false,
          targets: { chrome: 106 << 16 },
          drafts: {
            nesting: true,
            customMedia: true
          }
        })
        .code.toString('utf8'),
      null
    ]
  } catch (err) {
    let lines = err.source.split('\n')
    let e = new Error(
      [
        'Error formatting using Lightning CSS:',
        '',
        ...[
          '```css',
          ...lines.slice(Math.max(err.loc.line - 3, 0), err.loc.line),
          ' '.repeat(err.loc.column - 1) + '^-- ' + err.toString(),
          ...lines.slice(err.loc.line, err.loc.line + 2),
          '```'
        ]
      ].join('\n')
    )
    try {
      // Lightning CSS is pretty strict, so it will fail for `@media screen(md) {}` for example,
      // in that case we can fallback to prettier since it doesn't really care. However if an
      // actual syntax error is made, then we still want to show the proper error.
      return [formatPrettier(input.replace(/\n/g, '')), e]
    } catch {
      if (Error.captureStackTrace) {
        Error.captureStackTrace(e, toMatchFormattedCss)
      }
      throw e
    }
  }
}

function toMatchFormattedCss(received = '', argument = '') {
  // Ensure we're working with strings to avoid circular reference issues
  const receivedStr = typeof received === 'string' ? received : received.toString();
  const argumentStr = typeof argument === 'string' ? argument : argument.toString();
  
  let options = {
    comment: 'formatCSS(received) === formatCSS(argument)',
    isNot: this.isNot,
    promise: this.promise
  }

  try {
    let [formattedReceived, formattingReceivedError] = format(receivedStr)
    let [formattedArgument, formattingArgumentError] = format(argumentStr)

    let pass = formattedReceived === formattedArgument

    let message = pass
      ? () => {
          return (
            this.utils.matcherHint('toMatchFormattedCss', undefined, undefined, options) +
            '\n\n' +
            `Expected: not ${this.utils.printExpected(formattedReceived)}\n` +
            `Received: ${this.utils.printReceived(formattedArgument)}`
          )
        }
      : () => {
          let actual = formatPrettier(formattedReceived).replace(/\n\n/g, '\n')
          let expected = formatPrettier(formattedArgument).replace(/\n\n/g, '\n')

          let diffString = diff(expected, actual, {
            expand: this.expand
          })

          return (
            this.utils.matcherHint('toMatchFormattedCss', undefined, undefined, options) +
            '\n\n' +
            (diffString && diffString.includes('- Expect')
              ? `Difference:\n\n${diffString}`
              : `Expected: ${this.utils.printExpected(expected)}\n` +
                `Received: ${this.utils.printReceived(actual)}`) +
            (formattingReceivedError ? '\n\n' + formattingReceivedError : '') +
            (formattingArgumentError ? '\n\n' + formattingArgumentError : '') +
            `\n\n\nReceived (no diff):\n\n${this.utils.printReceived(actual)}`
          )
        }

    return { actual: receivedStr, message, pass }
  } catch (error) {
    // Provide a more helpful error message if we encounter issues with circular structures
    if (error.message && error.message.includes('circular structure')) {
      return {
        pass: false,
        message: () => 
          `Error comparing CSS: Circular reference detected. This usually happens when comparing PostCSS node objects directly. Make sure you're comparing string output rather than node objects.\n\nOriginal error: ${error.message}`
      };
    }
    // Re-throw other errors
    throw error;
  }
}

expect.extend({
  // Compare two CSS strings with all whitespace removed
  // This is probably naive but it's fast and works well enough.
  toMatchCSS: toMatchFormattedCss,
  toMatchFormattedCSS: toMatchFormattedCss,
  toIncludeCSS(received, argument) {
    // Ensure we're working with strings to avoid circular reference issues
    const receivedStr = typeof received === 'string' ? received : received.toString();
    const argumentStr = typeof argument === 'string' ? argument : argument.toString();
    
    let options = {
      comment: 'stripped(received).includes(stripped(argument))',
      isNot: this.isNot,
      promise: this.promise
    }

    try {
      let [formattedReceived, formattedReceivedError] = format(receivedStr)
      let [formattedArgument, formattedArgumentError] = format(argumentStr)
      let pass = formattedReceived.includes(formattedArgument)

      let message = pass
        ? () => {
            return (
              this.utils.matcherHint('toIncludeCss', undefined, undefined, options) +
              '\n\n' +
              `Expected: not ${this.utils.printExpected(formatPrettier(receivedStr))}\n` +
              `Received: ${this.utils.printReceived(formatPrettier(argumentStr))}`
            )
          }
        : () => {
            let actual = formatPrettier(receivedStr)
            let expected = formatPrettier(argumentStr)

            let diffString = diff(expected, actual, {
              expand: this.expand
            })

            return (
              this.utils.matcherHint('toIncludeCss', undefined, undefined, options) +
              '\n\n' +
              (diffString && diffString.includes('- Expect')
                ? `Difference:\n\n${diffString}`
                : `Expected: ${this.utils.printExpected(expected)}\n` +
                  `Received: ${this.utils.printReceived(actual)}`) +
              (formattedReceivedError ? '\n\n' + formattedReceivedError : '') +
              (formattedArgumentError ? '\n\n' + formattedArgumentError : '')
            )
          }

      return { actual: receivedStr, message, pass }
    } catch (error) {
      // Provide a more helpful error message if we encounter issues with circular structures
      if (error.message && error.message.includes('circular structure')) {
        return {
          pass: false,
          message: () => 
            `Error comparing CSS: Circular reference detected. This usually happens when comparing PostCSS node objects directly. Make sure you're comparing string output rather than node objects.\n\nOriginal error: ${error.message}`
        };
      }
      // Re-throw other errors
      throw error;
    }
  },
  toHaveBeenWarned() {
    let passed = warn.mock.calls.length > 0
    if (passed) {
      return {
        pass: true,
        message: () => {
          return (
            this.utils.matcherHint('toHaveBeenWarned') +
            '\n\n' +
            `Expected number of calls: >= ${this.utils.printExpected(1)}\n` +
            `Received number of calls:    ${this.utils.printReceived(actualWarningKeys.length)}`
          )
        }
      }
    } else {
      return {
        pass: false,
        message: () => {
          return (
            this.utils.matcherHint('toHaveBeenWarned') +
            '\n\n' +
            `Expected number of calls: >= ${this.utils.printExpected(1)}\n` +
            `Received number of calls:    ${this.utils.printReceived(warn.mock.calls.length)}`
          )
        }
      }
    }
  },
  toHaveBeenWarnedWith(_received, expectedWarningKeys) {
    let actualWarningKeys = warn.mock.calls.map(args => args[0])

    let passed = expectedWarningKeys.every(key => actualWarningKeys.includes(key))
    if (passed) {
      return {
        pass: true,
        message: () => {
          return (
            this.utils.matcherHint('toHaveBeenWarnedWith') +
            '\n\n' +
            `Expected: not ${this.utils.printExpected(expectedWarningKeys)}\n` +
            `Received: ${this.utils.printReceived(actualWarningKeys)}`
          )
        }
      }
    } else {
      let diffString = diff(expectedWarningKeys, actualWarningKeys)

      return {
        pass: false,
        message: () => {
          return (
            this.utils.matcherHint('toHaveBeenWarnedWith') +
            '\n\n' +
            (diffString && diffString.includes('- Expect')
              ? `Difference:\n\n${diffString}`
              : `Expected: ${this.utils.printExpected(expectedWarningKeys)}\n` +
                `Received: ${this.utils.printReceived(actualWarningKeys)}`)
          )
        }
      }
    }
  }
})
