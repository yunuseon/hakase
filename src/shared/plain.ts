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
