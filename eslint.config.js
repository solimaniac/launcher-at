import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist', '**/node_modules', 'public'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.stylistic,
  {
    rules: {
      eqeqeq: 'error',
      curly: ['error', 'multi-line'],
      'prefer-const': 'error',
      'no-console': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // Intentional no-op handlers such as `.catch(() => {})` are clearer than named noops.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['src/**'], languageOptions: { globals: globals.browser } },
  { files: ['build/**', 'server/**', '*.config.{js,ts}'], languageOptions: { globals: globals.node } },
  prettier,
)
