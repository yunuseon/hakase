import {
    formulas,
    isFormulaName,
    type FormulaName,
} from './components/sketch/formulas/registry.ts';

export type CustomId = `custom-${number}`;

export type FormulaId = FormulaName | CustomId;

const CUSTOM = /^custom-\d+$/;

export const isCustomId = (value: string): value is CustomId => CUSTOM.test(value);

export const isFormulaId = (value: string): value is FormulaId =>
    isFormulaName(value) || isCustomId(value);

export type CustomFormula = {
    readonly id: CustomId;
    readonly label: string;
    readonly source: string;
};

export type Library = {
    readonly items: readonly CustomFormula[];
    // Monotone, like `launched`: a deleted formula's id is never handed out again.
    readonly made: number;
};

export type Shared = {
    readonly label: string;
    readonly source: string;
};

export type LibraryCommand =
    | {
          readonly kind: 'add';
          readonly id: CustomId;
          readonly label: string;
          readonly source: string;
      }
    | { readonly kind: 'import'; readonly label: string; readonly source: string }
    | { readonly kind: 'remove'; readonly id: CustomId };

export const emptyLibrary: Library = { items: [], made: 0 };

const numberOf = (id: CustomId): number => Number(id.slice('custom-'.length));

export const nextId = ({ made }: Library): CustomId => `custom-${made + 1}`;

const named = (label: string): string => label.trim() || 'Untitled';

export const reduceLibrary = (library: Library, command: LibraryCommand): Library => {
    switch (command.kind) {
        case 'add':
            return library.items.some(({ id }) => id === command.id)
                ? library
                : {
                      made: Math.max(library.made, numberOf(command.id)),
                      items: [
                          ...library.items,
                          { id: command.id, label: named(command.label), source: command.source },
                      ],
                  };
        case 'import': {
            // Opening the same link twice must not leave two copies of one formula.
            const known = library.items.some(
                ({ label, source }) => label === named(command.label) && source === command.source,
            );

            return known
                ? library
                : reduceLibrary(library, { ...command, kind: 'add', id: nextId(library) });
        }
        case 'remove':
            return { ...library, items: library.items.filter(({ id }) => id !== command.id) };
    }
};

export type FormulaOption = {
    readonly value: string;
    readonly label: string;
};

export const optionsOf = ({ items }: Library): readonly FormulaOption[] => [
    ...Object.entries(formulas).map(([value, { label }]) => ({ value, label })),
    ...items.map(({ id, label }) => ({ value: id, label: `${label} ·` })),
];

export const sourceOf = (id: FormulaId, { items }: Library): string =>
    isCustomId(id)
        ? (items.find(item => item.id === id)?.source ??
          'vec3 formula(float x, float y, float t) {\n    return vec3(x, y, 0.5);\n}')
        : formulas[id].source;

export const labelOf = (id: FormulaId, { items }: Library): string =>
    isCustomId(id)
        ? (items.find(item => item.id === id)?.label ?? 'Deleted formula')
        : formulas[id].label;

export const summaryOf = (id: FormulaId, library: Library): string =>
    isCustomId(id)
        ? `${labelOf(id, library)} is one of your own formulas. Change it freely, copy a link to share it, or delete it from the menu.`
        : formulas[id].summary;

const customFrom = (value: unknown): CustomFormula[] => {
    if (
        typeof value !== 'object' ||
        value === null ||
        !('id' in value && 'label' in value && 'source' in value)
    ) {
        return [];
    }

    const { id, label, source } = value;

    return typeof id === 'string' &&
        isCustomId(id) &&
        typeof label === 'string' &&
        typeof source === 'string'
        ? [{ id, label, source }]
        : [];
};

export const parseLibrary = (value: unknown): Library => {
    if (typeof value !== 'object' || value === null || !('items' in value && 'made' in value)) {
        return emptyLibrary;
    }

    const { items, made } = value;

    if (!Array.isArray(items) || typeof made !== 'number' || !Number.isInteger(made)) {
        return emptyLibrary;
    }

    const kept = items.flatMap(customFrom);

    return { items: kept, made: Math.max(made, ...kept.map(({ id }) => numberOf(id))) };
};

const SHARE_KEY = 'formula=';

const toBase64Url = (text: string): string =>
    btoa(String.fromCharCode(...new TextEncoder().encode(text)))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');

const fromBase64Url = (text: string): string | null => {
    try {
        const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));

        return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    } catch {
        return null;
    }
};

export const shareHash = ({ label, source }: Shared): string =>
    `#${SHARE_KEY}${toBase64Url(JSON.stringify({ label, source }))}`;

// A hash from a link is untrusted input like anything stored: parsed field by field, never evaluated.
export const parseShare = (hash: string): Shared | null => {
    if (!hash.startsWith(`#${SHARE_KEY}`)) {
        return null;
    }

    const json = fromBase64Url(hash.slice(SHARE_KEY.length + 1));

    try {
        const value: unknown = json === null ? null : JSON.parse(json);

        return typeof value === 'object' &&
            value !== null &&
            'label' in value &&
            'source' in value &&
            typeof value.label === 'string' &&
            typeof value.source === 'string'
            ? { label: value.label, source: value.source }
            : null;
    } catch {
        return null;
    }
};
