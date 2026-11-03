import { describe, expect, it } from 'vitest';
import { layoutOf, NODE_WIDTH, type PatchView } from './patch.ts';

const view: PatchView = {
    stores: [
        {
            id: 'timeline',
            program: 'timeline',
            kind: 'playback',
            title: 'Playback',
            name: 'Main',
            colour: 'red',
        },
        {
            id: 'signal',
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
            own: { store: 'signal', name: 'Main', colour: 'blue', shown: 'node' },
            ports: [],
        },
        {
            id: 'sketch-2',
            program: 'sketch',
            label: 'sketch 1',
            icon: '',
            own: { store: 'sketch-2', name: 'sketch 2', colour: 'green', shown: 'tag' },
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
    it('wires own state into a header, follows into ports, and no wire for a tag', () => {
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
            ['follow', 'sketch-2', 'playback', 'red', false],
            ['follow', 'sketch-2', 'k1', 'blue', true],
        ]);
    });

    it('runs every wire from a store edge to a window edge', () => {
        const { stores, windows, wires } = layoutOf(view);
        const [, signal] = stores;
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
