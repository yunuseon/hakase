import { section, type Option, type Section } from '../../shared/properties.ts';

export type AppearanceInput = {
    readonly look: string;
    readonly looks: readonly Option[];
    readonly wires: string;
    readonly styles: readonly string[];
    readonly tokens: readonly string[];
    readonly values: ReadonlyMap<string, string>;
};

export const TOKEN = 'token.';

export const appearanceSections = ({
    look,
    looks,
    wires,
    styles,
    tokens,
    values,
}: AppearanceInput): readonly Section[] => [
    section(
        'look',
        null,
        [
            { kind: 'choice', id: 'look', label: 'look', value: look, options: looks },
            {
                kind: 'choice',
                id: 'wires',
                label: 'wires',
                value: wires,
                options: styles.map(style => ({ value: style, label: style })),
                hint: 'how wires between windows are drawn',
            },
        ],
        false,
    ),
    section(
        'colours',
        'Colours',
        tokens.map(token => ({
            kind: 'colour' as const,
            id: `${TOKEN}${token}`,
            label: token,
            value: values.get(token) ?? '#000000',
        })),
    ),
];
