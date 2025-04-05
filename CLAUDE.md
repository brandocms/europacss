# CLAUDE.md - EuropaCSS Project Guidelines

## Build & Test Commands
- Build: `yarn build` (transpiles src to lib)
- Clean & Build: `yarn prebuild && yarn build`
- Test all: `yarn test`
- Test coverage: `yarn coverage`
- Test single file: `yarn test __tests__/path/to/file.test.js`
- Test specific test: `yarn test -t "test name pattern"`

## Code Style Guidelines
- **Indentation**: 2 spaces
- **Imports**: Group external dependencies first, then internal imports
- **Functions**: Arrow functions for simple cases, named functions for complex ones
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Exports**: Uses `module.exports = ...` and `export default ...`
- **Comments**: JSDoc for functions with param descriptions
- **Error handling**: Explicit error messages with descriptive text
- **Testing**: Jest with custom CSS matchers (`toMatchCSS`, `toMatchFormattedCSS`)
- **PostCSS Structure**: Plugins in lib/plugins, utilities in util/

No ESLint configuration exists, but maintain consistent code formatting with Prettier.

## Testing notes
There is sometimes an error like:
node:internal/child_process/serialization:159
    const string = JSONStringify(message) + '\n';
                   ^

TypeError: Converting circular structure to JSON

This is not the actual error in the test, but just a side effect of the test setup. Look other places in the
test results for the actual errors!
