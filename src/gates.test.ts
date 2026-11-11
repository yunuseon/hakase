import { describe, expect, it } from 'vitest';
import { GATE_DEFAULTS, loopEdges, parseGate, reduceGate, sourceOfGate } from './gates.ts';

describe('gate documents', () => {
    it('toggle only a switch or a constant, and keep steps inside their bounds', () => {
        const pattern = GATE_DEFAULTS.pattern;

        expect(reduceGate(GATE_DEFAULTS.switch, { kind: 'toggle' }).value).toBe(1);
        expect(reduceGate(GATE_DEFAULTS.nand, { kind: 'toggle' })).toBe(GATE_DEFAULTS.nand);
        expect(reduceGate(pattern, { kind: 'step', index: 1, value: 1 }).steps[1]).toBe(1);
        expect(reduceGate(pattern, { kind: 'step', index: 99, value: 1 })).toBe(pattern);
        expect(reduceGate(pattern, { kind: 'steps', count: 100 }).steps).toHaveLength(32);
        expect(reduceGate(pattern, { kind: 'steps', count: 3 }).steps).toEqual([1, 0, 0]);
    });

    it('take a source only on a param the kind has', () => {
        const nand = reduceGate(GATE_DEFAULTS.nand, {
            kind: 'source',
            param: 'a',
            source: 'switch-3',
        });

        expect(sourceOfGate(nand, 'a')).toBe('switch-3');
        expect(reduceGate(GATE_DEFAULTS.nand, { kind: 'source', param: 'in', source: 'x' })).toBe(
            GATE_DEFAULTS.nand,
        );
    });

    it('read a stored gate field by field, and refuse one of no known kind', () => {
        const parsed = parseGate({
            kind: 'pattern',
            steps: [1, 'x', 0, 1],
            sources: { constructor: 'x' },
            threshold: 'high',
        });

        expect(parsed?.steps).toEqual([1, 0, 0, 1]);
        expect(parsed?.threshold).toBe(0.5);
        expect(parseGate({ kind: 'constructor' })).toBeNull();
        expect(parseGate(null)).toBeNull();
    });

    it("cut only a delay's input out of the loop graph", () => {
        const delay = reduceGate(GATE_DEFAULTS.delay, { kind: 'source', param: 'in', source: 'q' });
        const nand = reduceGate(GATE_DEFAULTS.nand, { kind: 'source', param: 'a', source: 'q' });

        expect(loopEdges(delay).sources).toEqual({});
        expect(loopEdges(nand)).toBe(nand);
    });
});
