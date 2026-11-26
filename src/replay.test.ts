import { runInThisContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { literalOf, recordingSource, type Recording } from './recording.ts';
import { replayed } from './replay.ts';

const recording = {
    start: null,
    wall: Date.UTC(2026, 10, 26, 12),
    turns: [
        {
            at: 0,
            received: [
                {
                    kind: 'input',
                    signal: {
                        to: 'app',
                        from: 'tickets-1',
                        store: 'tickets',
                        clock: null,
                        program: 'tickets',
                        input: {
                            kind: 'ticket',
                            command: { kind: 'add', status: null, title: 'oat milk', parent: null },
                        },
                    },
                },
            ],
        },
        {
            at: 40,
            received: [
                {
                    kind: 'input',
                    signal: {
                        to: 'app',
                        from: 'signal-1',
                        store: 'signal',
                        clock: null,
                        program: 'signal',
                        input: {
                            kind: 'signal',
                            command: { kind: 'set', param: 'depth', value: 0.5 },
                        },
                    },
                },
            ],
        },
    ],
} satisfies Recording;

describe('a recording', () => {
    it('replays into a fresh core, one turn per event, and says what fired twice', async () => {
        const { log, history } = await replayed(recording);
        const titles = history.present.tickets
            .get('tickets')
            ?.statuses.flatMap(({ tickets }) => tickets.map(({ title }) => title));

        expect(titles).toEqual(['oat milk']);
        expect(history.present.signals.get('signal')?.depth).toBe(0.5);
        expect(log.doubles).toEqual([]);
        expect(log.totals.get('inputs')).toBe(2);
    });

    it('is written as source that reads back as the same values', () => {
        const value = {
            stores: new Map([['a', { ink: Uint8Array.from([1, 2]), seen: new Set(['x']) }]]),
            far: Infinity,
            gone: undefined,
            text: 'it\'s "quoted"',
        };
        const read: unknown = runInThisContext(`(${literalOf(value)})`);

        expect(read).toEqual(value);
        expect(recordingSource(recording)).toContain('satisfies Recording;');
    });
});
