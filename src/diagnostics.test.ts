import { describe, expect, it } from 'vitest';
import {
    digestOf,
    doublesOf,
    emptyLog,
    keysAt,
    KEEP_MS,
    lineOf,
    mentions,
    newestAction,
    recordTurn,
    rewritesOf,
    valueAt,
    reportOf,
    type Turn,
} from './diagnostics.ts';

const turn = (at: number, streams: readonly string[]): Turn => ({
    at,
    pulses: streams.map(stream => ({ stream, at, digest: stream })),
});

describe('a digest', () => {
    it('reads like the value, briefly', () => {
        expect(
            digestOf({ kind: 'scene', command: { kind: 'set', field: 'sun', value: 0.123456 } }),
        ).toBe('scene{command: set{field: "sun", value: 0.123}}');
        expect(
            digestOf(
                new Map([
                    ['a', 1],
                    ['b', 2],
                    ['c', 3],
                    ['d', 4],
                ]),
            ),
        ).toBe('Map(4){"a": 1, "b": 2, "c": 3, …}');
        expect(digestOf([1, 2])).toBe('[2: 1, 2]');
        expect(digestOf(new Float32Array(4))).toBe('Float32Array(16 bytes)');
        expect(digestOf('x'.repeat(100)).length).toBeLessThan(50);
        expect(digestOf({ deep: { deeper: { deepest: { far: 1 } } } })).toBe(
            '{deep: {deeper: {deepest: {1 fields}}}}',
        );
    });

    it('never runs long', () => {
        const wide = Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [`field${i}`, 'y'.repeat(30)]),
        );

        expect(digestOf(wide).length).toBeLessThanOrEqual(161);
    });
});

describe('a log of turns', () => {
    it('names a stream that fired more than once in one turn, and what fired beside it', () => {
        expect(doublesOf(turn(5, ['documents', 'recipe', 'recipe', 'cook']))).toEqual([
            { at: 5, stream: 'recipe', times: 2, with: ['documents', 'cook'] },
        ]);
        expect(doublesOf(turn(5, ['documents', 'recipe']))).toEqual([]);
        expect(doublesOf(turn(5, ['windows', 'windows', 'rewrites', 'rewrites']))).toEqual([]);
    });

    it('keeps the last few seconds of turns, and every total', () => {
        const log = [
            turn(0, ['clock']),
            turn(1000, ['clock']),
            turn(KEEP_MS + 500, ['clock']),
        ].reduce(recordTurn, emptyLog);

        expect(log.turns.map(({ at }) => at)).toEqual([1000, KEEP_MS + 500]);
        expect(log.totals.get('clock')).toBe(3);
    });

    it('reports rates, last values and doubles by stream, in the order asked', () => {
        const log = [
            turn(100, ['inputs', 'documents']),
            turn(200, ['documents', 'documents']),
            turn(300, ['clocks']),
        ].reduce(recordTurn, emptyLog);
        const report = reportOf(log, ['clocks', 'documents', 'inputs', 'timers'], 400);

        expect(
            report.streams.map(({ name, total, doubled, last }) => [name, total, doubled, last]),
        ).toEqual([
            ['clocks', 1, 0, 'clocks'],
            ['documents', 3, 1, 'documents'],
            ['inputs', 1, 0, 'inputs'],
            ['timers', 0, 0, null],
        ]);
        expect(report.streams[1]?.perSecond).toBe(1);
        expect(report.recent.map(({ fired }) => fired)).toEqual([
            ['inputs', 'documents'],
            ['documents', 'documents'],
            ['clocks'],
        ]);
        expect(report.doubles).toEqual([{ at: 200, stream: 'documents', times: 2, with: [] }]);
    });
});

describe('what the console shows', () => {
    const said: Turn = {
        at: 1234.4,
        pulses: [
            { stream: 'inputs', at: 1234, digest: 'scene{command: add{}}' },
            { stream: 'actions', at: 1234, digest: '{step: "Added a box"}' },
            { stream: 'documents', at: 1234, digest: '{…}' },
            { stream: 'scenes', at: 1234, digest: 'Map(1)' },
            { stream: 'scenes', at: 1234, digest: 'Map(1)' },
        ],
    };

    it('says what started a turn, what it reached, and what fired twice', () => {
        expect(lineOf(said)).toBe(
            'hakase 1234ms  inputs scene{command: add{}}  actions {step: "Added a box"}  → documents, scenes ×2  ⚠ fired twice in one turn: scenes',
        );
    });

    it('keeps a turn that names a word in a stream or a value', () => {
        expect(mentions(said, [])).toBe(true);
        expect(mentions(said, ['box'])).toBe(true);
        expect(mentions(said, ['scenes'])).toBe(true);
        expect(mentions(said, ['clocks'])).toBe(false);
    });

    it('reads a path through objects, arrays and maps', () => {
        const documents = { scenes: new Map([['store-3', { objects: [{ id: 'ball' }] }]]) };

        expect(valueAt(documents, 'scenes.store-3.objects.0.id')).toBe('ball');
        expect(valueAt(documents, 'scenes.nowhere.objects')).toBeUndefined();
        expect(valueAt(documents, '')).toBe(documents);
        expect(keysAt(valueAt(documents, 'scenes'))).toEqual(['store-3']);
        expect(valueAt({}, 'constructor')).toBeUndefined();
    });

    it('finds the newest logged action and the step it joined', () => {
        expect(
            newestAction(
                {
                    cursor: 1,
                    steps: [
                        { label: 'Moved', actions: [{ seq: 4, action: 'a' }] },
                        {
                            label: 'Added',
                            actions: [
                                { seq: 6, action: 'c' },
                                { seq: 5, action: 'b' },
                            ],
                        },
                    ],
                },
                action => action !== 'c',
            ),
        ).toEqual({ seq: 6, step: null, action: 'c', undone: 1 });
        expect(
            newestAction(
                { cursor: 1, steps: [{ label: 'Added', actions: [{ seq: 2, action: 'b' }] }] },
                () => true,
            )?.step,
        ).toBe('Added');
        expect(newestAction({ steps: [], cursor: 0 }, () => true)).toBeNull();
    });
});

describe('a rewrite', () => {
    it('is a place written more than once in one batch, with every value it held', () => {
        const label = { id: 'label' };
        const text = { id: 'text' };

        expect(
            rewritesOf([
                { target: label, name: 'aria-label', old: 'a' },
                { target: text, name: '#text', old: '0.31' },
                { target: label, name: 'style', old: '' },
                { target: label, name: 'style', old: 'x' },
                { target: text, name: '#text', old: '0.32' },
            ]),
        ).toEqual([{ target: text, name: '#text', olds: ['0.31', '0.32'] }]);
    });
});
