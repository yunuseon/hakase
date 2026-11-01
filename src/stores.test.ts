import { describe, expect, it } from 'vitest';
import { colourOf, keptStores, pruned, reduceStores, type StoreEntry } from './stores.ts';

const count = reduceStores((total: number, step: number) => total + step, 0);

describe('reduceStores', () => {
    it('folds each store apart, starting from empty', () => {
        const all = [
            { kind: 'command' as const, store: 'a', command: 2 },
            { kind: 'command' as const, store: 'b', command: 5 },
            { kind: 'command' as const, store: 'a', command: 1 },
        ].reduce(count, new Map<string, number>());

        expect([...all]).toEqual([
            ['a', 3],
            ['b', 5],
        ]);
    });

    it('copies once, into a store with nothing in it yet', () => {
        const all = new Map([
            ['a', 3],
            ['b', 9],
        ]);

        expect(count(all, { kind: 'copy', from: 'a', to: 'c' }).get('c')).toBe(3);
        expect(count(all, { kind: 'copy', from: 'a', to: 'b' }).get('b')).toBe(9);
        expect(count(all, { kind: 'copy', from: 'x', to: 'c' })).toBe(all);
    });
});

describe('pruned', () => {
    const entry = (id: string, kept: boolean): StoreEntry => ({
        id,
        program: 'sketch',
        name: id,
        kept,
        copy: null,
    });

    it('keeps named stores and bound ones', () => {
        const stores = [entry('a', true), entry('b', false), entry('c', false)];

        expect(pruned(stores, new Set(['b'])).map(({ id }) => id)).toEqual(['a', 'b']);
    });
});

describe('colourOf', () => {
    it('is stable for an id', () => {
        expect(colourOf('store-3')).toBe(colourOf('store-3'));
    });
});

describe('keptStores', () => {
    it('keeps every main store, open or not, and drops removed ones', () => {
        const all = new Map([
            ['board', 1],
            ['store-4', 2],
            ['store-9', 3],
        ]);
        const stores: StoreEntry[] = [
            { id: 'store-4', program: 'board', name: 'x', kept: true, copy: null },
        ];

        expect([...keptStores(all, stores).keys()]).toEqual(['board', 'store-4']);
    });
});
