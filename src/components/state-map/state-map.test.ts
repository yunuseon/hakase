import { describe, expect, it } from 'vitest';
import {
    focusedStores,
    layoutOf,
    NODE_WIDTH,
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
            wires.map(({ kind, window, input, colour, removable }) => [
                kind,
                window,
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
                },
            ],
        });

        expect(unusedOf(lonely)).toBe(1);
    });
});
