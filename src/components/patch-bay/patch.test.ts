import { describe, expect, it } from 'vitest';
import { accepts, layoutOf, NODE_WIDTH, type PatchView } from './patch.ts';

const view: PatchView = {
    sources: [
        {
            id: 'playback:timeline',
            kind: 'playback',
            store: 'timeline',
            title: 'Playback',
            name: 'Main',
            colour: 'red',
        },
        {
            id: 'signal:signal',
            kind: 'signal',
            store: 'signal',
            title: 'Signal',
            name: 'Main',
            colour: 'blue',
        },
    ],
    sinks: [
        {
            id: 'sketch-2',
            label: 'sketch 1',
            icon: '',
            ports: [
                {
                    input: 'playback',
                    title: 'Playback',
                    accepts: ['playback'],
                    optional: false,
                    bound: 'playback:timeline',
                },
                {
                    input: 'k1',
                    title: 'k1',
                    accepts: ['signal'],
                    optional: true,
                    bound: 'signal:signal',
                },
                { input: 'k2', title: 'k2', accepts: ['signal'], optional: true, bound: null },
            ],
        },
    ],
};

describe('layoutOf', () => {
    it('wires each bound port from its source, and only optional ones can be cut', () => {
        const { wires } = layoutOf(view);

        expect(wires.map(({ input, colour, removable }) => [input, colour, removable])).toEqual([
            ['playback', 'red', false],
            ['k1', 'blue', true],
        ]);
    });

    it('runs every wire from a source edge to a port edge', () => {
        const { sources, sinks, wires } = layoutOf(view);
        const [from] = sources;
        const port = sinks[0]?.ports[0];

        expect(from?.anchor.x).toBe((from?.x ?? 0) + NODE_WIDTH);
        expect(wires[0]?.path.startsWith(`M${from?.anchor.x} ${from?.anchor.y}`)).toBe(true);
        expect(wires[0]?.path.endsWith(`${port?.anchor.x} ${port?.anchor.y}`)).toBe(true);
    });

    it('stacks nodes without overlap', () => {
        const { sources } = layoutOf(view);
        const [first, second] = sources;

        expect((second?.y ?? 0) - (first?.y ?? 0)).toBeGreaterThanOrEqual(first?.height ?? 0);
    });
});

describe('accepts', () => {
    it('matches a port to the kinds it takes', () => {
        const [playback, signal] = view.sources;
        const knob = view.sinks[0]?.ports[1];

        expect(knob !== undefined && signal !== undefined && accepts(knob, signal)).toBe(true);
        expect(knob !== undefined && playback !== undefined && accepts(knob, playback)).toBe(false);
    });
});
