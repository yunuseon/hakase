import { describe, expect, it } from 'vitest';
import { colourOf, keptStores, pruned, storeEvent, withMain, type StoreEntry } from './stores.ts';

describe('storeEvent', () => {
    it('copies once, into a store with nothing in it yet', () => {
        const all = new Map([
            ['a', 3],
            ['b', 9],
        ]);

        expect(storeEvent(all, { kind: 'copy', from: 'a', to: 'c' }).get('c')).toBe(3);
        expect(storeEvent(all, { kind: 'copy', from: 'a', to: 'b' }).get('b')).toBe(9);
        expect(storeEvent(all, { kind: 'copy', from: 'x', to: 'c' })).toBe(all);
    });

    it('keeps only the stores in the set, and changes nothing when all are kept', () => {
        const all = new Map([
            ['a', 1],
            ['b', 2],
        ]);

        expect([...storeEvent(all, { kind: 'keep', stores: new Set(['b']) }).keys()]).toEqual([
            'b',
        ]);
        expect(storeEvent(all, { kind: 'keep', stores: new Set(['a', 'b', 'c']) })).toBe(all);
    });
});

describe('pruned', () => {
    const entry = (id: string, kept: boolean): StoreEntry => ({
        id,
        program: 'sketch',
        name: id,
        kept,
        copy: null,
        clock: null,
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
            ['tickets', 1],
            ['store-4', 2],
            ['store-9', 3],
        ]);
        const stores: StoreEntry[] = [
            { id: 'store-4', program: 'tickets', name: 'x', kept: true, copy: null, clock: null },
        ];

        expect([...keptStores(all, stores).keys()]).toEqual(['tickets', 'store-4']);
    });
});

describe('withMain', () => {
    it('offers the Main of a shared document, but none for a program whose windows each start their own', () => {
        expect(withMain('signal', []).map(({ id }) => id)).toEqual(['signal']);
        expect(withMain('kaleido', [])).toEqual([]);
        expect(withMain('sketch', [])).toEqual([]);
    });
});
