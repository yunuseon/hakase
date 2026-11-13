import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/**', 'node_modules/**'] },
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['eslint.config.js'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/index', '**/index.*', './index', './index.*'],
                            message:
                                'No barrel files. Import the module that actually defines the symbol.',
                        },
                    ],
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            // The rules AGENTS.md states, enforced rather than remembered: `as const` stays allowed.
            '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
            '@typescript-eslint/no-non-null-assertion': 'error',
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'rxjs',
                            importNames: [
                                'Subject',
                                'BehaviorSubject',
                                'ReplaySubject',
                                'AsyncSubject',
                            ],
                            message:
                                'No Subject as an event bus: adapt the source with new Observable or fromEvent, and fold state with scan.',
                        },
                    ],
                },
            ],
        },
    },
    // The flat config itself is plain JS and lives outside the tsconfig project.
    {
        files: ['**/*.js', '**/*.mjs'],
        extends: [tseslint.configs.disableTypeChecked],
    },
    // Barrels cannot be written in the first place: any index module is an error
    // at its own Program node, whatever it contains.
    {
        files: ['**/index.ts', '**/index.js', '**/index.tsx'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'Program',
                    message:
                        'No barrel files. Name the module for what it contains (e.g. registry.ts).',
                },
            ],
        },
    },
);
