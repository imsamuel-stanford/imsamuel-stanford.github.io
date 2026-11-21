/**
 * @file Strict ESLint flat configuration for Stanford profile scripts and tests.
 */
export default [
    {
        files: ['assets/**/*.js', 'scripts/**/*.js', 'test/**/*.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                document: 'readonly',
                window: 'readonly',
                globalThis: 'readonly',
                fetch: 'readonly',
                process: 'readonly',
                URL: 'readonly'
            }
        },
        rules: {
            'eqeqeq': ['error', 'always'],
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-var': 'error',
            'prefer-const': 'error',
            'curly': ['error', 'all'],
            'no-implicit-coercion': 'error',
            'no-console': 'error'
        }
    }
];
