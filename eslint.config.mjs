// जाँच के नियम (ADEGAON वाली प्रक्रिया): index.html के अंदर की script भी (eslint-plugin-html), sw.js, notify/ और tests/।
// innerHTML / insertAdjacentHTML में कोई डेटा बिना escape के न जाए — no-unsanitized यही पकड़ता है (XSS से बचाव)।
import js from '@eslint/js';
import globals from 'globals';
import html from 'eslint-plugin-html';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

// असली bug पकड़ने वाले नियम (शैली वाले नहीं) — ADEGAON की सूची
const quality = {
  eqeqeq: ['error', 'smart'],
  'no-self-compare': 'error',
  'no-constant-binary-expression': 'error',
  'no-unreachable-loop': 'error',
  'no-unmodified-loop-condition': 'error',
  'no-dupe-else-if': 'error',
  'no-template-curly-in-string': 'error',
  'no-promise-executor-return': 'error',
  'array-callback-return': 'error',
  'no-return-assign': 'error',
  'no-sequences': 'error',
  'no-throw-literal': 'error',
  'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
  'default-case-last': 'error',
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
};

export default [
  { ignores: ['node_modules/**', 'lib/**', '.netlify/**'] },
  js.configs.recommended,
  {
    files: ['index.html'],
    plugins: { html, 'no-unsanitized': noUnsanitized },
    languageOptions: { sourceType: 'script', ecmaVersion: 2022, globals: { ...globals.browser, L: 'readonly' } },
    rules: {
      ...quality,
      // innerHTML में सिर्फ़ ऐप का अपना पक्का markup, या xmlEsc() से गुज़रा डेटा
      'no-unsanitized/method': ['error', { escape: { methods: ['xmlEsc'] } }],
      'no-unsanitized/property': ['error', { escape: { methods: ['xmlEsc'] } }],
    },
  },
  {
    files: ['sw.js'],
    languageOptions: { sourceType: 'script', ecmaVersion: 2022, globals: { ...globals.serviceworker } },
    rules: quality,
  },
  {
    files: ['notify/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.mjs', 'stylelint.config.mjs'],
    // tests के page.evaluate() वाले हिस्से ब्राउज़र में चलते हैं, इसलिए दोनों तरह के globals
    languageOptions: { sourceType: 'module', ecmaVersion: 2024, globals: { ...globals.node, ...globals.browser, L: 'readonly' } },
    rules: quality,
  },
];
