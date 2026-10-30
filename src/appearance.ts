export const TOKENS = [
    'canvas',
    'grid',
    'panel',
    'well',
    'ink',
    'label',
    'muted',
    'rule',
    'edge',
    'track',
    'accent',
    'highlight',
    'ok',
    'shadow',
    'code-text',
    'code-comment',
    'code-keyword',
    'code-function',
    'code-number',
] as const;

export type Token = (typeof TOKENS)[number];

// Opaque #rrggbb only, so every token can sit in an <input type="color">.
export type Appearance = Readonly<Record<Token, string>>;

// Names every field, so a token added to TOKENS is a compile error here until it is built.
export const appearanceFrom = (read: (token: Token) => string): Appearance => ({
    canvas: read('canvas'),
    grid: read('grid'),
    panel: read('panel'),
    well: read('well'),
    ink: read('ink'),
    label: read('label'),
    muted: read('muted'),
    rule: read('rule'),
    edge: read('edge'),
    track: read('track'),
    accent: read('accent'),
    highlight: read('highlight'),
    ok: read('ok'),
    shadow: read('shadow'),
    'code-text': read('code-text'),
    'code-comment': read('code-comment'),
    'code-keyword': read('code-keyword'),
    'code-function': read('code-function'),
    'code-number': read('code-number'),
});

export const tokenValues = (appearance: Appearance): ReadonlyMap<string, string> =>
    new Map(TOKENS.map(token => [token, appearance[token]]));

export const variables = (appearance: Appearance): ReadonlyMap<string, string> =>
    new Map(TOKENS.map(token => [`--${token}`, appearance[token]]));

export const sameAppearance = (a: Appearance, b: Appearance): boolean =>
    TOKENS.every(token => a[token] === b[token]);

const HEX = /^#[0-9a-f]{6}$/i;

// Per token, not all or nothing: a token added later must not wipe a stored look's edits.
export const parseAppearance = (value: unknown, fallback: Appearance): Appearance | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const stored = new Map<string, unknown>(Object.entries(value));

    return appearanceFrom(token => {
        const color = stored.get(token);

        return typeof color === 'string' && HEX.test(color) ? color.toLowerCase() : fallback[token];
    });
};
