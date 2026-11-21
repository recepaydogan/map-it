import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.dev-build', '.release-dist', 'projects/**', 'public/apps/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        overwolf: 'readonly',
      },
    },
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'JSXOpeningElement[name.name="select"]',
        message: 'Use CategoryDropdown instead of a native select to keep menus styled, height-limited, and inside the app content boundary.',
      }],
    },
  },
])
