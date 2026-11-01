export type Link = {
    readonly id: string;
    readonly url: string;
    readonly title: string;
};

export type Links = {
    readonly items: readonly Link[];
    readonly made: number;
};

export type LinkCommand =
    | { readonly kind: 'add'; readonly text: string }
    | { readonly kind: 'rename'; readonly id: string; readonly title: string }
    | { readonly kind: 'remove'; readonly id: string }
    | { readonly kind: 'move'; readonly id: string; readonly to: number };

export const emptyLinks: Links = { items: [], made: 0 };

const numberOf = (id: string): number => Number(/-(\d+)$/.exec(id)?.[1] ?? 0);

// Only http and https: a stored `javascript:` link would run in the app when clicked.
export const safeUrl = (text: string): string | null => {
    const trimmed = text.trim();

    if (trimmed === '' || /\s/.test(trimmed)) {
        return null;
    }

    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
        const url = new URL(candidate);

        return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.')
            ? url.href
            : null;
    } catch {
        return null;
    }
};

export const hostOf = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
};

const splitText = (text: string): { readonly title: string; readonly address: string } => {
    const words = text.trim().split(/\s+/);
    const address = words.at(-1) ?? '';

    return { title: words.slice(0, -1).join(' '), address };
};

export const addable = (text: string): boolean => safeUrl(splitText(text).address) !== null;

export const reduceLinks = (links: Links, command: LinkCommand): Links => {
    switch (command.kind) {
        case 'add': {
            const { title, address } = splitText(command.text);
            const url = safeUrl(address);
            const made = links.made + 1;

            return url === null
                ? links
                : {
                      made,
                      items: [
                          ...links.items,
                          { id: `link-${made}`, url, title: title || hostOf(url) },
                      ],
                  };
        }
        case 'rename': {
            const title = command.title.trim();

            return {
                ...links,
                items: links.items.map(link =>
                    link.id === command.id ? { ...link, title: title || hostOf(link.url) } : link,
                ),
            };
        }
        case 'remove':
            return { ...links, items: links.items.filter(({ id }) => id !== command.id) };
        case 'move': {
            const moved = links.items.find(({ id }) => id === command.id);

            if (moved === undefined) {
                return links;
            }

            const rest = links.items.filter(({ id }) => id !== command.id);
            const to = Math.min(Math.max(Math.round(command.to), 0), rest.length);

            return { ...links, items: [...rest.slice(0, to), moved, ...rest.slice(to)] };
        }
    }
};

const linkFrom = (value: unknown): Link | null => {
    if (
        typeof value !== 'object' ||
        value === null ||
        !('id' in value && 'url' in value && 'title' in value)
    ) {
        return null;
    }

    const { id, url, title } = value;
    const safe = typeof url === 'string' ? safeUrl(url) : null;

    return typeof id === 'string' && typeof title === 'string' && safe !== null
        ? { id, url: safe, title }
        : null;
};

export const parseLinks = (value: unknown): Links => {
    if (typeof value !== 'object' || value === null || !('items' in value && 'made' in value)) {
        return emptyLinks;
    }

    const { items, made } = value;

    if (!Array.isArray(items) || typeof made !== 'number' || !Number.isInteger(made)) {
        return emptyLinks;
    }

    const kept = items.map(linkFrom).filter(link => link !== null);

    return { items: kept, made: Math.max(made, 0, ...kept.map(({ id }) => numberOf(id))) };
};
