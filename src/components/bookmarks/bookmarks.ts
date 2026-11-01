export type Bookmark = {
    readonly id: string;
    readonly name: string;
    readonly url: string;
};

export type Group = {
    readonly id: string;
    readonly name: string;
    readonly open: boolean;
    readonly items: readonly Bookmark[];
};

export type Bookmarks = {
    readonly groups: readonly Group[];
    // Shared by groups and bookmarks, so no id is ever handed out twice.
    readonly made: number;
};

export const STEPS = ['up', 'down'] as const;
export type Step = (typeof STEPS)[number];

export type BookmarkCommand =
    | {
          readonly kind: 'add';
          readonly group: string;
          readonly name: string;
          readonly address: string;
      }
    | { readonly kind: 'rename'; readonly id: string; readonly name: string }
    | { readonly kind: 'readdress'; readonly id: string; readonly address: string }
    | { readonly kind: 'remove'; readonly id: string }
    // `to` counts places in the target group without the moved bookmark, which is what a drop indicates.
    | { readonly kind: 'move'; readonly id: string; readonly group: string; readonly to: number }
    | { readonly kind: 'step'; readonly id: string; readonly step: Step }
    | { readonly kind: 'add-group' }
    | { readonly kind: 'rename-group'; readonly id: string; readonly name: string }
    | { readonly kind: 'remove-group'; readonly id: string }
    | { readonly kind: 'toggle-group'; readonly id: string }
    | { readonly kind: 'move-group'; readonly id: string; readonly to: number };

export const UNTITLED = 'Untitled';

export const defaultBookmarks: Bookmarks = {
    groups: [{ id: 'group-1', name: 'Bookmarks', open: true, items: [] }],
    made: 1,
};

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

// Only over https: an http icon on an https page is blocked as mixed content anyway.
export const faviconOf = (url: string): string | null => {
    try {
        const { protocol, origin } = new URL(url);

        return protocol === 'https:' ? `${origin}/favicon.ico` : null;
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

const numberOf = (id: string): number => Number(/-(\d+)$/.exec(id)?.[1] ?? 0);

const inserted = <T>(items: readonly T[], item: T, to: number): readonly T[] => {
    const at = Math.min(Math.max(Math.round(to), 0), items.length);

    return [...items.slice(0, at), item, ...items.slice(at)];
};

const bookmarkOf = (bookmarks: Bookmarks, id: string): Bookmark | undefined =>
    bookmarks.groups.flatMap(({ items }) => items).find(item => item.id === id);

const withItems = (
    bookmarks: Bookmarks,
    change: (group: Group) => readonly Bookmark[],
): Bookmarks => ({
    ...bookmarks,
    groups: bookmarks.groups.map(group => ({ ...group, items: change(group) })),
});

const withGroup = (
    bookmarks: Bookmarks,
    id: string,
    change: (group: Group) => Group,
): Bookmarks => ({
    ...bookmarks,
    groups: bookmarks.groups.map(group => (group.id === id ? change(group) : group)),
});

export const placeOf = (
    bookmarks: Bookmarks,
    id: string,
): { readonly group: number; readonly index: number } | null => {
    const group = bookmarks.groups.findIndex(({ items }) => items.some(item => item.id === id));
    const index = bookmarks.groups[group]?.items.findIndex(item => item.id === id) ?? -1;

    return group < 0 || index < 0 ? null : { group, index };
};

// Past either end of a group a step crosses into the next open one, so the keyboard reaches every group.
export const stepped = (bookmarks: Bookmarks, id: string, step: Step): BookmarkCommand | null => {
    const place = placeOf(bookmarks, id);
    const home = place === null ? undefined : bookmarks.groups[place.group];

    if (place === null || home === undefined) {
        return null;
    }

    const within = place.index + (step === 'up' ? -1 : 1);

    if (within >= 0 && within < home.items.length) {
        return { kind: 'move', id, group: home.id, to: within };
    }

    const others =
        step === 'up'
            ? bookmarks.groups.slice(0, place.group).reverse()
            : bookmarks.groups.slice(place.group + 1);
    const next = others.find(({ open }) => open);

    return next === undefined
        ? null
        : { kind: 'move', id, group: next.id, to: step === 'up' ? next.items.length : 0 };
};

export const reduceBookmarks = (bookmarks: Bookmarks, command: BookmarkCommand): Bookmarks => {
    switch (command.kind) {
        case 'add': {
            const url = safeUrl(command.address);
            const made = bookmarks.made + 1;

            if (url === null || !bookmarks.groups.some(({ id }) => id === command.group)) {
                return bookmarks;
            }

            const bookmark = {
                id: `bookmark-${made}`,
                name: command.name.trim() || hostOf(url),
                url,
            };

            return {
                made,
                groups: bookmarks.groups.map(group =>
                    group.id === command.group
                        ? { ...group, open: true, items: [...group.items, bookmark] }
                        : group,
                ),
            };
        }
        case 'rename':
            return withItems(bookmarks, ({ items }) =>
                items.map(item =>
                    item.id === command.id
                        ? { ...item, name: command.name.trim() || hostOf(item.url) }
                        : item,
                ),
            );
        case 'readdress': {
            const url = safeUrl(command.address);

            return url === null
                ? bookmarks
                : withItems(bookmarks, ({ items }) =>
                      items.map(item => (item.id === command.id ? { ...item, url } : item)),
                  );
        }
        case 'remove':
            return withItems(bookmarks, ({ items }) => items.filter(({ id }) => id !== command.id));
        case 'move': {
            const moved = bookmarkOf(bookmarks, command.id);

            if (moved === undefined || !bookmarks.groups.some(({ id }) => id === command.group)) {
                return bookmarks;
            }

            return withItems(bookmarks, ({ id, items }) => {
                const rest = items.filter(item => item.id !== command.id);

                return id === command.group ? inserted(rest, moved, command.to) : rest;
            });
        }
        case 'step': {
            const move = stepped(bookmarks, command.id, command.step);

            return move === null ? bookmarks : reduceBookmarks(bookmarks, move);
        }
        case 'add-group': {
            const made = bookmarks.made + 1;

            return {
                made,
                groups: [
                    ...bookmarks.groups,
                    { id: `group-${made}`, name: UNTITLED, open: true, items: [] },
                ],
            };
        }
        case 'rename-group':
            return withGroup(bookmarks, command.id, group => ({
                ...group,
                name: command.name.trim() || UNTITLED,
            }));
        case 'remove-group':
            // Only an empty group: removing one would otherwise take its bookmarks with it, unasked.
            return {
                ...bookmarks,
                groups: bookmarks.groups.filter(
                    ({ id, items }) => id !== command.id || items.length > 0,
                ),
            };
        case 'toggle-group':
            return withGroup(bookmarks, command.id, group => ({ ...group, open: !group.open }));
        case 'move-group': {
            const moved = bookmarks.groups.find(({ id }) => id === command.id);

            return moved === undefined
                ? bookmarks
                : {
                      ...bookmarks,
                      groups: inserted(
                          bookmarks.groups.filter(({ id }) => id !== command.id),
                          moved,
                          command.to,
                      ),
                  };
        }
    }
};

export type Shelf = {
    readonly id: string;
    readonly top: number;
    readonly bottom: number;
    readonly middles: readonly number[];
};

export type Target = {
    readonly group: string;
    readonly to: number;
};

const distanceTo = (y: number, { top, bottom }: Shelf): number =>
    y < top ? top - y : y > bottom ? y - bottom : 0;

export const dropTarget = (y: number, shelves: readonly Shelf[]): Target | null => {
    const shelf = shelves.reduce<Shelf | null>(
        (best, candidate) =>
            best === null || distanceTo(y, candidate) < distanceTo(y, best) ? candidate : best,
        null,
    );

    return shelf === null
        ? null
        : { group: shelf.id, to: shelf.middles.filter(middle => middle < y).length };
};

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

const bookmarkFrom = (value: unknown): Bookmark | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const id = field(value, 'id');
    const name = field(value, 'name') ?? field(value, 'title');
    const url = field(value, 'url');
    const safe = typeof url === 'string' ? safeUrl(url) : null;

    return typeof id === 'string' && typeof name === 'string' && safe !== null
        ? { id, name, url: safe }
        : null;
};

const groupFrom = (value: unknown): Group | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const id = field(value, 'id');
    const name = field(value, 'name');
    const items = field(value, 'items');

    return typeof id === 'string' && typeof name === 'string' && Array.isArray(items)
        ? {
              id,
              name,
              open: field(value, 'open') !== false,
              items: items.map(bookmarkFrom).filter(item => item !== null),
          }
        : null;
};

const counted = (groups: readonly Group[], made: unknown): Bookmarks => ({
    groups,
    made: Math.max(
        typeof made === 'number' && Number.isInteger(made) ? made : 0,
        0,
        ...groups.flatMap(({ id, items }) => [id, ...items.map(item => item.id)]).map(numberOf),
    ),
});

// `legacy` is the links shelf this replaced: its list becomes the first group, so nothing saved is lost.
export const parseBookmarks = (value: unknown, legacy?: unknown): Bookmarks => {
    if (typeof value === 'object' && value !== null && Array.isArray(field(value, 'groups'))) {
        const groups = field(value, 'groups');

        return counted(
            Array.isArray(groups) ? groups.map(groupFrom).filter(group => group !== null) : [],
            field(value, 'made'),
        );
    }

    const items =
        typeof legacy === 'object' && legacy !== null ? field(legacy, 'items') : undefined;

    if (!Array.isArray(items)) {
        return defaultBookmarks;
    }

    const kept = items
        .map(bookmarkFrom)
        .filter(item => item !== null)
        .map(item => ({ ...item, id: item.id.replace(/^link-/, 'bookmark-') }));

    return counted(
        [
            {
                ...defaultBookmarks.groups[0],
                id: 'group-0',
                name: 'Bookmarks',
                open: true,
                items: kept,
            },
        ],
        0,
    );
};
