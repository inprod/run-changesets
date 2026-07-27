'use strict';

// Flat config (ESLint 9+). This is a direct port of the previous .eslintrc.json,
// which set parser options only and enabled no rules — linting here is a syntax
// and parse check, not a style gate.
module.exports = [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
    },
    rules: {},
  },
];
