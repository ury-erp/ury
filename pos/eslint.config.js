import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Design-system enforcement (see tracks/sa-design-system-fix). Kept at 'warn', not
      // 'error': a backlog of pre-existing raw elements and arbitrary-hex classes remains
      // (see the audit report's "Explicitly out of scope" list) and shouldn't fail CI until
      // that backlog is cleared. New code should not add to either pattern.
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'JSXOpeningElement[name.name=/^(button|input|textarea|select)$/]',
          message:
            'Use the @ury/ui Button/Input/Textarea/Select component instead of the raw HTML element, so styling stays on the design system.',
        },
        {
          selector: 'JSXAttribute[name.name="className"] Literal[value=/-\\[#[0-9a-fA-F]{3,8}\\]/]',
          message:
            'Arbitrary hex color in a Tailwind class bypasses the design-system tokens in packages/ui/src/styles/theme.css. Use a token class (primary, gray-*, etc.) or extend the shared preset instead.',
        },
      ],
    },
  },
)
