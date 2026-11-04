export type Plain =
    null | boolean | number | string | readonly Plain[] | { readonly [key: string]: Plain };

// State holds Maps, which JSON.stringify writes as `{}`: they become objects, key for key.
export const displayable = (value: unknown): Plain => {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'boolean' || typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : String(value);
    }

    if (value instanceof Map) {
        return Object.fromEntries(
            [...value].map(([key, entry]): [string, Plain] => [String(key), displayable(entry)]),
        );
    }

    if (value instanceof Set) {
        return [...value].map(displayable);
    }

    if (Array.isArray(value)) {
        return value.map(displayable);
    }

    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]): [string, Plain] => [key, displayable(entry)]),
        );
    }

    return `[${typeof value}]`;
};

export type Kind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export type Row = {
    // Keys from the root, encoded and joined by '/', so a path names one node however the state changes.
    readonly path: string;
    readonly depth: number;
    readonly key: string;
    readonly kind: Kind;
    readonly text: string;
    readonly open: boolean;
};

const MAX_TEXT = 160;

const kindOf = (value: Plain): Kind =>
    value === null
        ? 'null'
        : Array.isArray(value)
          ? 'array'
          : typeof value === 'object'
            ? 'object'
            : typeof value === 'string'
              ? 'string'
              : typeof value === 'number'
                ? 'number'
                : 'boolean';

const childrenOf = (value: Plain): readonly (readonly [string, Plain])[] =>
    value === null || typeof value !== 'object'
        ? []
        : Array.isArray(value)
          ? value.map((child, index): readonly [string, Plain] => [String(index), child])
          : Object.entries(value);

export const textOf = (value: Plain): string => {
    const kind = kindOf(value);

    if (kind === 'array' || kind === 'object') {
        const count = childrenOf(value).length;

        return kind === 'array' ? `[${count}]` : `{${count}}`;
    }

    const text = JSON.stringify(value);

    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
};

export const childPath = (path: string, key: string): string =>
    path === '' ? encodeURIComponent(key) : `${path}/${encodeURIComponent(key)}`;

export const rowsOf = (value: Plain, expanded: ReadonlySet<string>): readonly Row[] => {
    const walk = (node: Plain, path: string, depth: number): Row[] =>
        childrenOf(node).flatMap(([key, child]) => {
            const at = childPath(path, key);
            const kind = kindOf(child);
            const open = (kind === 'object' || kind === 'array') && expanded.has(at);
            const row: Row = { path: at, depth, key, kind, text: textOf(child), open };

            return open ? [row, ...walk(child, at, depth + 1)] : [row];
        });

    return walk(value, '', 0);
};

export const toggled = (expanded: readonly string[], path: string): readonly string[] =>
    expanded.includes(path) ? expanded.filter(open => open !== path) : [...expanded, path];
