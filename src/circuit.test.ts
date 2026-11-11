import { describe, expect, it } from 'vitest';
import { bitCurve, circuitTable, tickAt } from './circuit.ts';
import { GATE_DEFAULTS, type Bit, type Gate, type GateKind } from './gates.ts';
import { curveAt } from './shared/curve.ts';
import { defaultSignal } from './shared/signal.ts';

const gate = (
    kind: GateKind,
    sources: Record<string, string> = {},
    rest: Partial<Gate> = {},
): Gate => ({
    ...GATE_DEFAULTS[kind],
    ...rest,
    sources: { ...GATE_DEFAULTS[kind].sources, ...sources },
});

const on = (value: Bit) => gate('switch', {}, { value });

// Each derived gate from NANDs, named under a prefix so several can share one circuit.
const not = (name: string, input: string): [string, Gate][] => [
    [name, gate('nand', { a: input, b: input })],
];

const and = (name: string, a: string, b: string): [string, Gate][] => [
    [`${name}.n`, gate('nand', { a, b })],
    ...not(name, `${name}.n`),
];

const or = (name: string, a: string, b: string): [string, Gate][] => [
    ...not(`${name}.a`, a),
    ...not(`${name}.b`, b),
    [name, gate('nand', { a: `${name}.a`, b: `${name}.b` })],
];

const xor = (name: string, a: string, b: string): [string, Gate][] => [
    [`${name}.n`, gate('nand', { a, b })],
    [`${name}.l`, gate('nand', { a, b: `${name}.n` })],
    [`${name}.r`, gate('nand', { a: `${name}.n`, b })],
    [name, gate('nand', { a: `${name}.l`, b: `${name}.r` })],
];

const truth = (build: (a: string, b: string) => [string, Gate][], out: string) =>
    ([0, 1] as const).flatMap(a =>
        ([0, 1] as const).map(b => {
            const table = circuitTable(
                new Map([['a', on(a)], ['b', on(b)], ...build('a', 'b')]),
                1,
            );

            return table.get(out)?.[0];
        }),
    );

const row = (table: ReturnType<typeof circuitTable>, id: string) => [...(table.get(id) ?? [])];

describe('gates from NAND', () => {
    it('make NOT, AND, OR and XOR with their truth tables', () => {
        expect(truth((a, b) => [['x', gate('nand', { a, b })]], 'x')).toEqual([1, 1, 1, 0]);
        expect(truth(a => not('x', a), 'x')).toEqual([1, 1, 0, 0]);
        expect(truth((a, b) => and('x', a, b), 'x')).toEqual([0, 0, 0, 1]);
        expect(truth((a, b) => or('x', a, b), 'x')).toEqual([0, 1, 1, 1]);
        expect(truth((a, b) => xor('x', a, b), 'x')).toEqual([0, 1, 1, 0]);
    });

    it('add: a half adder and a full adder', () => {
        const half = (a: string, b: string) => [...xor('sum', a, b), ...and('carry', a, b)];

        expect(truth(half, 'sum')).toEqual([0, 1, 1, 0]);
        expect(truth(half, 'carry')).toEqual([0, 0, 0, 1]);

        ([0, 1] as const).forEach(a =>
            ([0, 1] as const).forEach(b =>
                ([0, 1] as const).forEach(c => {
                    const table = circuitTable(
                        new Map([
                            ['a', on(a)],
                            ['b', on(b)],
                            ['c', on(c)],
                            ...xor('ab', 'a', 'b'),
                            ...xor('sum', 'ab', 'c'),
                            ...and('c1', 'a', 'b'),
                            ...and('c2', 'ab', 'c'),
                            ...or('carry', 'c1', 'c2'),
                        ]),
                        1,
                    );
                    const total = a + b + c;

                    expect(table.get('sum')?.[0]).toBe(total % 2);
                    expect(table.get('carry')?.[0]).toBe(total >= 2 ? 1 : 0);
                }),
            ),
        );
    });
});

describe('memory through delays', () => {
    it('toggles each tick when a delay feeds back its own inverse', () => {
        const table = circuitTable(
            new Map([['q', gate('delay', { in: 'nq' })], ...not('nq', 'q')]),
            6,
        );

        expect(row(table, 'q')).toEqual([0, 1, 0, 1, 0, 1]);
    });

    it('counts in two bits', () => {
        const table = circuitTable(
            new Map([
                ['b0', gate('delay', { in: 'n0' })],
                ...not('n0', 'b0'),
                ['b1', gate('delay', { in: 'x' })],
                ...xor('x', 'b1', 'b0'),
            ]),
            5,
        );

        expect(
            row(table, 'b1').map((high, tick) => high * 2 + (row(table, 'b0')[tick] ?? 0)),
        ).toEqual([0, 1, 2, 3, 0]);
    });

    it('holds a set bit until it is reset', () => {
        const pulse = (at: number): Gate =>
            gate(
                'pattern',
                {},
                { steps: Array.from({ length: 8 }, (_, tick): Bit => (tick === at ? 1 : 0)) },
            );
        const table = circuitTable(
            new Map([
                ['set', pulse(2)],
                ['reset', pulse(5)],
                ['q', gate('delay', { in: 'next' })],
                ...not('keep', 'reset'),
                ...and('held', 'q', 'keep'),
                ...or('next', 'set', 'held'),
            ]),
            8,
        );

        expect(row(table, 'q')).toEqual([0, 0, 0, 1, 1, 1, 0, 0]);
    });

    it('reads 0 for gates caught in a loop with no delay, and replays the same every time', () => {
        const gates = new Map([
            ['a', gate('nand', { a: 'b', b: 'b' })],
            ['b', gate('nand', { a: 'a', b: 'a' })],
            ['lamp', gate('lamp', { in: 'a' })],
        ]);

        expect(row(circuitTable(gates, 3), 'a')).toEqual([0, 0, 0]);
        expect(row(circuitTable(gates, 3), 'lamp')).toEqual([0, 0, 0]);
        expect(circuitTable(gates, 3)).toEqual(circuitTable(gates, 3));
    });
});

describe('bits and signals', () => {
    it('plays a pattern across the loop at any tick count', () => {
        const steps: Bit[] = [1, 0, 1, 1];

        expect(row(circuitTable(new Map([['p', gate('pattern', {}, { steps })]]), 4), 'p')).toEqual(
            steps,
        );
        expect(row(circuitTable(new Map([['p', gate('pattern', {}, { steps })]]), 8), 'p')).toEqual(
            [1, 1, 0, 0, 1, 1, 1, 1],
        );
    });

    it('turns a signal into a bit at its threshold', () => {
        const rising = {
            signal: { ...defaultSignal, shape: 'saw' as const },
            mods: { phase: null, offset: null, depth: null },
        };
        const table = circuitTable(
            new Map([['c', gate('compare', { in: 'wave' }, { threshold: 0.5 })]]),
            4,
            new Map([['c', rising]]),
        );

        expect(row(table, 'c')).toEqual([0, 0, 1, 1]);
    });

    it('reads a row as a curve, and a moment as its tick', () => {
        const curve = bitCurve(Uint8Array.from([0, 1, 1, 0]));

        expect([0.1, 0.3, 0.6, 0.9].map(t => curveAt(curve, t))).toEqual([0, 1, 1, 0]);
        expect([0, 0.24, 0.25, 0.99, 1].map(t => tickAt(t, 4))).toEqual([0, 0, 1, 3, 0]);
    });
});
