import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@/lib/*',
            '@/components/*',
            '@workspace/mail-agent',
            '@workspace/mail-agent/*',
            '@workspace/pwa',
            '@workspace/pwa/*',
            '@tanstack/react-query',
            '@tanstack/react-router',
            'convex',
            'convex/*',
          ],
        },
      ],
    },
  },
])
