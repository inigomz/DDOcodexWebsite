module.exports = {
  root: true,
  extends: ['airbnb', 'airbnb/hooks'],
  env: {
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  ignorePatterns: ['dist/', 'node_modules/'],
  rules: {
    // These algorithms rely on early exits and nested iteration for pruning.
    'no-continue': 'off',
    'no-restricted-syntax': 'off',
    // Public CommonJS APIs already expose optional parameters before required ones.
    'default-param-last': 'off',
    // Lazy requires are intentional for optional integrations and cold-start cost.
    'global-require': 'off',
    // Cache fields use a leading underscore to distinguish process-local state.
    'no-underscore-dangle': 'off',
    // Sequential scraper requests must remain ordered and rate-limited.
    'no-await-in-loop': 'off',
    // Numeric search loops use explicit counters throughout the legacy planner.
    'no-plusplus': 'off',
    // Surface dead code without blocking the formatting migration.
    'no-unused-vars': 'warn',
  },
  overrides: [
    {
      files: ['src/**/*.{js,jsx}'],
      env: {
        browser: true,
        node: false,
      },
      rules: {
        // This JavaScript project does not ship a separate runtime PropTypes layer.
        'react/prop-types': 'off',
        // Several result lists have no stable identifier beyond their position.
        'react/no-array-index-key': 'off',
        // Compact status-label rendering is clearer here than duplicated button markup.
        'no-nested-ternary': 'off',
        // Effects may return cleanup functions only on branches that allocate resources.
        'consistent-return': 'off',
        // Labels and controls are associated through matching htmlFor/id attributes.
        'jsx-a11y/label-has-associated-control': 'off',
      },
    },
    {
      files: ['vite.config.js'],
      rules: {
        'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
      },
    },
    {
      files: ['netlify/**/*.js', 'scraper/**/*.js', 'tests/**/*.js'],
      rules: {
        // Command-line tools, tests, and serverless functions intentionally log.
        'no-console': 'off',
      },
    },
    {
      files: ['scraper/**/*.js'],
      rules: {
        // Some standalone/legacy scraper entry points have optional sibling modules.
        'import/extensions': 'off',
        'import/no-unresolved': 'off',
        // Cheerio callbacks conventionally use `_` for intentionally ignored indexes.
        'no-shadow': 'off',
      },
    },
    {
      files: ['tests/**/*.js'],
      rules: {
        // Test factories deliberately mirror imported production helper names.
        'no-shadow': 'off',
      },
    },
    {
      files: ['tools/openaiGearAdvisor.js'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
