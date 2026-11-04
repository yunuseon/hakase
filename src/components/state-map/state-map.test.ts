import { describe, expect, it } from 'vitest';
import {
    focusedStores,
    layoutOf,
    NODE_WIDTH,
    placedAt,
    relatedTo,
    unusedOf,
    type StateGraph,
} from './state-map.ts';

const view: StateGraph = {
    stores: [
        {
            id: 'sketch-2',
            target: 'store:sketch:sketch-2',
            global: false,
            program: 'sketch',
            kind: null,
            title: 'sketch',
            name: 'sketch 2',
            colour: 'green',
            ports: [],
        },
        {
            id: 'timeline',
            target: 'store:x:timeline',
            global: false,
            program: 'timeline',
            kind: 'playback',
            title: 'Playback',
            name: 'Main',
            colour: 'red',
            ports: [],
        },
        {
            id: 'signal',
            target: 'store:x:signal',
            global: false,
            program: 'signal',
            kind: 'signal',
            title: 'Signal',
            name: 'Main',
            colour: 'blue',
            ports: [],
        },
    ],
    windows: [
        {
            id: 'signal-5',
            program: 'signal',
            label: 'signal 1',
            icon: '',
            own: 'signal',
            ports: [],
        },
        {
            id: 'sketch-2',
            program: 'sketch',
            label: 'sketch 1',
            icon: '',
            own: 'sketch-2',
            ports: [
                {
                    input: 'playback',
                    title: 'Playback',
                    accepts: ['playback'],
                    optional: false,
                    bound: 'timeline',
                },
                { input: 'k1', title: 'k1', accepts: ['signal'], optional: true, bound: 'signal' },
                { input: 'k2', title: 'k2', accepts: ['signal'], optional: true, bound: null },
            ],
        },
    ],
};

describe('layoutOf', () => {
    it('wires own state into a header and follows into ports', () => {
        const { wires } = layoutOf(view);

        expect(
            wires.map(({ kind, sink, input, colour, removable }) => [
                kind,
                sink,
                input,
                colour,
                removable,
            ]),
        ).toEqual([
            ['own', 'signal-5', null, 'blue', false],
            ['own', 'sketch-2', null, 'green', false],
            ['follow', 'sketch-2', 'playback', 'red', false],
            ['follow', 'sketch-2', 'k1', 'blue', true],
        ]);
    });

    it('runs every wire from a store edge to a window edge', () => {
        const { stores, windows, wires } = layoutOf(view);
        const [, , signal] = stores;
        const window = windows[0];

        expect(signal?.anchor.x).toBe((signal?.x ?? 0) + NODE_WIDTH);
        expect(wires[0]?.path.startsWith(`M${signal?.anchor.x} ${signal?.anchor.y}`)).toBe(true);
        expect(wires[0]?.path.endsWith(`${window?.anchor.x} ${window?.anchor.y}`)).toBe(true);
    });

    it('stacks nodes without overlap', () => {
        const { windows } = layoutOf(view);
        const [first, second] = windows;

        expect((second?.y ?? 0) - (first?.y ?? 0)).toBeGreaterThanOrEqual(first?.height ?? 0);
    });
});

describe('relatedTo', () => {
    const layout = layoutOf(view);
    const sorted = (set: ReadonlySet<string>) => [...set].sort();

    it('brings a window its own state, what it follows and those wires', () => {
        const related = relatedTo(layout, { kind: 'window', id: 'sketch-2' });

        expect(sorted(related.stores)).toEqual(['signal', 'sketch-2', 'timeline']);
        expect(sorted(related.windows)).toEqual(['sketch-2']);
        expect(sorted(related.wires)).toEqual(['sketch-2:', 'sketch-2:k1', 'sketch-2:playback']);
    });

    it('brings a store every window that keeps it or follows it', () => {
        const related = relatedTo(layout, { kind: 'store', id: 'signal' });

        expect(sorted(related.stores)).toEqual(['signal']);
        expect(sorted(related.windows)).toEqual(['signal-5', 'sketch-2']);
        expect(sorted(related.wires)).toEqual(['signal-5:', 'sketch-2:k1']);
    });

    it('brings a private store only its one window', () => {
        const related = relatedTo(layout, { kind: 'store', id: 'sketch-2' });

        expect(sorted(related.windows)).toEqual(['sketch-2']);
        expect(sorted(related.wires)).toEqual(['sketch-2:']);
    });
});

describe('focusedStores', () => {
    const layout = layoutOf(view);

    it('lists what a focus inspects in the left column order, and nothing once it is gone', () => {
        expect(
            focusedStores(layout, { kind: 'window', id: 'sketch-2' }).map(({ id }) => id),
        ).toEqual(['sketch-2', 'timeline', 'signal']);
        expect(focusedStores(layout, { kind: 'window', id: 'gone' })).toEqual([]);
        expect(focusedStores(layout, null)).toEqual([]);
    });
});

describe('unusedOf', () => {
    it('counts the stores no wire touches, never a global', () => {
        const lonely = layoutOf({
            ...view,
            stores: [
                ...view.stores,
                {
                    id: 'spare',
                    target: 'store:sketch:spare',
                    global: false,
                    program: 'sketch',
                    kind: null,
                    title: 'sketch',
                    name: 'spare',
                    colour: 'grey',
                    ports: [],
                },
                {
                    id: 'global:library',
                    target: 'global:library',
                    global: true,
                    program: '',
                    kind: null,
                    title: 'app',
                    name: 'library',
                    colour: 'grey',
                    ports: [],
                },
            ],
        });

        expect(unusedOf(lonely)).toBe(1);
    });
});

describe('chains in the map', () => {
    const signalStore = (id: string, bound: string | null) => ({
        id,
        target: `store:signal:${id}`,
        global: false,
        program: 'signal',
        kind: 'signal',
        title: 'Signal',
        name: id,
        colour: id,
        ports: [{ input: 'high', title: 'high', accepts: ['signal'], optional: true, bound }],
    });
    const chain: StateGraph = {
        stores: [signalStore('slow', null), signalStore('fast', 'slow')],
        windows: [
            {
                id: 'sketch-2',
                program: 'sketch',
                label: 'sketch 1',
                icon: '',
                own: null,
                ports: [
                    {
                        input: 'k1',
                        title: 'k1',
                        accepts: ['signal'],
                        optional: true,
                        bound: 'fast',
                    },
                ],
            },
        ],
    };

    it('puts a signal right of what it follows, and windows right of both', () => {
        const { stores, windows } = layoutOf(chain);
        const slow = stores.find(({ id }) => id === 'slow');
        const fast = stores.find(({ id }) => id === 'fast');

        expect((fast?.x ?? 0) > (slow?.x ?? 0)).toBe(true);
        expect((windows[0]?.x ?? 0) > (fast?.x ?? 0)).toBe(true);
    });

    it('wires the chain store to store, and focusing the middle lights both ends', () => {
        const layout = layoutOf(chain);
        const related = relatedTo(layout, { kind: 'store', id: 'fast' });

        expect(layout.wires.map(({ kind, sink, store }) => [kind, sink, store])).toEqual([
            ['source', 'fast', 'slow'],
            ['follow', 'sketch-2', 'fast'],
        ]);
        expect([...related.stores].sort()).toEqual(['fast', 'slow']);
        expect([...related.windows]).toEqual(['sketch-2']);
    });

    it('counts a store that only feeds a used one as used, and a chain nothing reads as unused', () => {
        expect(unusedOf(layoutOf(chain))).toBe(0);
        expect(unusedOf(layoutOf({ ...chain, windows: [] }))).toBe(2);
    });
});

describe('moved nodes', () => {
    it('keeps a moved node where it was put, and wires follow it', () => {
        const auto = layoutOf(view);
        const moved = layoutOf(view, { 'window:sketch-2': { x: 900, y: 40 } });
        const sketch = moved.windows.find(({ id }) => id === 'sketch-2');

        expect(sketch).toMatchObject({ x: 900, y: 40 });
        expect(placedAt(moved, 'window:sketch-2')).toMatchObject({ x: 900, y: 40 });
        expect(moved.windows.find(({ id }) => id === 'signal-5')?.x).toBe(
            auto.windows.find(({ id }) => id === 'signal-5')?.x,
        );
        expect(
            moved.wires
                .find(({ input }) => input === 'k1')
                ?.path.endsWith(`900 ${40 + 30 + 24 + 12}`),
        ).toBe(true);
    });

    it('frames every node, wherever it was moved', () => {
        const { bounds } = layoutOf(view, { 'store:timeline': { x: -200, y: -50 } });

        expect(bounds.x).toBe(-200);
        expect(bounds.y).toBe(-50);
    });

    it('ignores a stored spot named after something every object has', () => {
        expect(() => layoutOf(view, { constructor: { x: 1, y: 1 } })).not.toThrow();
    });
});
