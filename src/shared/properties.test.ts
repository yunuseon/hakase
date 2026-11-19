import { describe, expect, it } from 'vitest';
import { charsFor, fieldOf, numberOf, pulled, section, textOf, toggled } from './properties.ts';

describe('properties', () => {
    it('sizes a number field to its value, never under three characters', () => {
        expect(charsFor(0.5, 0.1)).toBe(3);
        expect(charsFor(-12.25, 0.01)).toBe(6);
        expect(charsFor(1, 0.1)).toBe(3);
        expect(charsFor(12345, 1)).toBe(5);
    });

    it('reads a change as the type its reader wants', () => {
        expect(numberOf({ id: 'a', value: 2 })).toBe(2);
        expect(numberOf({ id: 'a', value: true })).toBe(1);
        expect(numberOf({ id: 'a', value: 'x' })).toBeNull();
        expect(textOf({ id: 'a', value: 'x' })).toBe('x');
        expect(textOf({ id: 'a', value: 1 })).toBeNull();
    });

    it('names a field within its group only', () => {
        expect(fieldOf('shape.low', 'shape')).toBe('low');
        expect(fieldOf('shapes.low', 'shape')).toBeNull();
        expect(fieldOf('reading', 'shape')).toBeNull();
    });

    it('folds a titled section unless told not to, and toggles which are open', () => {
        expect(section('a', 'A', []).fold).toBe(true);
        expect(section('a', null, []).fold).toBe(false);
        expect(section('a', 'A', [], false).fold).toBe(false);
        const open = toggled(new Set(), 'a');
        expect([...open]).toEqual(['a']);
        expect([...toggled(open, 'a')]).toEqual([]);
    });

    it('reads a drag as how far it moved since the last event, up and right both raising', () => {
        const start = { id: 'offset', x: 10, y: 10, moved: 0, by: 0 };
        const up = pulled(start, { x: 10, y: 6 }, 0.01);
        const right = pulled(up, { x: 13, y: 6 }, 0.01);

        expect(up.by).toBeCloseTo(0.04);
        expect(up.moved).toBe(4);
        expect(right.by).toBeCloseTo(0.03);
        expect(right.moved).toBe(7);
    });
});
