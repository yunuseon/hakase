import { describe, expect, it } from 'vitest';
import {
    defaultBookmarks,
    dropTarget,
    faviconOf,
    parseBookmarks,
    reduceBookmarks,
    safeUrl,
    UNTITLED,
    type BookmarkCommand,
    type Bookmarks,
} from './bookmarks.ts';

const run = (...commands: BookmarkCommand[]): Bookmarks =>
    commands.reduce(reduceBookmarks, defaultBookmarks);

const names = (bookmarks: Bookmarks): string[][] =>
    bookmarks.groups.map(({ items }) => items.map(({ name }) => name));

const filled = run(
    { kind: 'add', group: 'group-1', name: 'Docs', address: 'developer.mozilla.org' },
    { kind: 'add', group: 'group-1', name: '', address: 'www.github.com' },
    { kind: 'add-group' },
    { kind: 'add', group: 'group-4', name: 'Wiki', address: 'https://wiki.example.org' },
);

describe('safeUrl', () => {
    it('accepts web addresses, with or without a scheme', () => {
        expect(safeUrl('example.com/a?b=1')).toBe('https://example.com/a?b=1');
        expect(safeUrl('http://localhost.test:5173')).toBe('http://localhost.test:5173/');
    });

    it('refuses anything that could run or is not an address', () => {
        expect(safeUrl('javascript:alert(1)')).toBeNull();
        expect(safeUrl('JavaScript:alert(1)')).toBeNull();
        expect(safeUrl('data:text/html,<b>x</b>')).toBeNull();
        expect(safeUrl('not a url')).toBeNull();
        expect(safeUrl('word')).toBeNull();
    });
});

describe('faviconOf', () => {
    it('asks the site itself, at its origin, and only over https', () => {
        expect(faviconOf('https://wiki.example.org/home?x=1')).toBe(
            'https://wiki.example.org/favicon.ico',
        );
        expect(faviconOf('http://example.com/')).toBeNull();
        expect(faviconOf('nonsense')).toBeNull();
    });
});

describe('reduceBookmarks', () => {
    it('names a bookmark by its host when no name is given, and refuses unsafe addresses', () => {
        const refused = reduceBookmarks(filled, {
            kind: 'add',
            group: 'group-1',
            name: 'x',
            address: 'javascript:alert(1)',
        });

        expect(names(filled)).toEqual([['Docs', 'github.com'], ['Wiki']]);
        expect(refused).toBe(filled);
    });

    it('moves within and across groups, counting places without the moved one', () => {
        const across = reduceBookmarks(filled, {
            kind: 'move',
            id: 'bookmark-2',
            group: 'group-4',
            to: 0,
        });
        const within = reduceBookmarks(filled, {
            kind: 'move',
            id: 'bookmark-2',
            group: 'group-1',
            to: 1,
        });

        expect(names(across)).toEqual([['github.com'], ['Docs', 'Wiki']]);
        expect(names(within)).toEqual([['github.com', 'Docs'], ['Wiki']]);
    });

    it('steps across the end of a group into the next open one', () => {
        const down = reduceBookmarks(filled, { kind: 'step', id: 'bookmark-3', step: 'down' });
        const closed = reduceBookmarks(
            reduceBookmarks(filled, { kind: 'toggle-group', id: 'group-4' }),
            {
                kind: 'step',
                id: 'bookmark-3',
                step: 'down',
            },
        );
        const up = reduceBookmarks(filled, { kind: 'step', id: 'bookmark-5', step: 'up' });

        expect(names(down)).toEqual([['Docs'], ['github.com', 'Wiki']]);
        expect(names(closed)).toEqual([['Docs', 'github.com'], ['Wiki']]);
        expect(names(up)).toEqual([['Docs', 'github.com', 'Wiki'], []]);
    });

    it('keeps the address when an edit is not one, and the host when a name is emptied', () => {
        const kept = reduceBookmarks(filled, {
            kind: 'readdress',
            id: 'bookmark-2',
            address: 'nope',
        });
        const renamed = reduceBookmarks(filled, { kind: 'rename', id: 'bookmark-2', name: ' ' });

        expect(kept).toBe(filled);
        expect(names(renamed)[0]).toEqual(['developer.mozilla.org', 'github.com']);
    });

    it('removes only an empty group, names one untitled rather than nothing, and reorders', () => {
        const kept = reduceBookmarks(filled, { kind: 'remove-group', id: 'group-1' });
        const emptied = run(
            { kind: 'add-group' },
            { kind: 'rename-group', id: 'group-2', name: ' ' },
        );
        const moved = reduceBookmarks(filled, { kind: 'move-group', id: 'group-4', to: 0 });

        expect(kept.groups).toHaveLength(2);
        expect(emptied.groups[1]?.name).toBe(UNTITLED);
        expect(
            reduceBookmarks(emptied, { kind: 'remove-group', id: 'group-2' }).groups,
        ).toHaveLength(1);
        expect(moved.groups.map(({ id }) => id)).toEqual(['group-4', 'group-1']);
    });

    it('opens a group when something is added to it', () => {
        const closed = reduceBookmarks(filled, { kind: 'toggle-group', id: 'group-4' });
        const added = reduceBookmarks(closed, {
            kind: 'add',
            group: 'group-4',
            name: '',
            address: 'a.com',
        });

        expect(added.groups[1]?.open).toBe(true);
    });
});

describe('dropTarget', () => {
    const shelves = [
        { id: 'one', top: 0, bottom: 100, middles: [20, 50] },
        { id: 'two', top: 120, bottom: 200, middles: [] },
    ];

    it('picks the group under the pointer, or the nearest, and counts what is above', () => {
        expect(dropTarget(40, shelves)).toEqual({ group: 'one', to: 1 });
        expect(dropTarget(150, shelves)).toEqual({ group: 'two', to: 0 });
        expect(dropTarget(-30, shelves)).toEqual({ group: 'one', to: 0 });
        expect(dropTarget(0, [])).toBeNull();
    });
});

describe('parseBookmarks', () => {
    it('turns the old links shelf into one group', () => {
        const migrated = parseBookmarks(undefined, {
            items: [
                { id: 'link-3', url: 'https://ok.com', title: 'ok' },
                { id: 'link-5', url: 'javascript:alert(1)', title: 'x' },
            ],
            made: 5,
        });

        expect(migrated.groups).toEqual([
            {
                id: 'group-0',
                name: 'Bookmarks',
                open: true,
                items: [{ id: 'bookmark-3', name: 'ok', url: 'https://ok.com/' }],
            },
        ]);
        expect(migrated.made).toBe(3);
    });

    it('drops unsafe stored bookmarks and keeps the counter above every id', () => {
        const parsed = parseBookmarks({
            groups: [
                {
                    id: 'group-9',
                    name: 'a',
                    open: false,
                    items: [
                        { id: 'bookmark-2', name: 'x', url: 'javascript:alert(1)' },
                        { id: 'bookmark-4', name: 'y', url: 'https://y.com' },
                    ],
                },
            ],
            made: 0,
        });

        expect(parsed.groups[0]?.items.map(({ id }) => id)).toEqual(['bookmark-4']);
        expect(parsed.groups[0]?.open).toBe(false);
        expect(parsed.made).toBe(9);
        expect(parseBookmarks(null)).toBe(defaultBookmarks);
    });
});
