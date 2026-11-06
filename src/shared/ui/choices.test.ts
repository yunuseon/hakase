import { describe, expect, it } from 'vitest';
import { choiceIndex } from './choices.ts';

describe('radio-choice navigation', () => {
    it('wraps while skipping unavailable choices', () => {
        const choices = [true, false, true];
        expect(choiceIndex(choices, 0, 'ArrowRight')).toBe(2);
        expect(choiceIndex(choices, 2, 'ArrowDown')).toBe(0);
        expect(choiceIndex(choices, 0, 'ArrowLeft')).toBe(2);
        expect(choiceIndex(choices, 2, 'Home')).toBe(0);
        expect(choiceIndex(choices, 0, 'End')).toBe(2);
    });
    it('handles RTL and empty or unrecognised input', () => {
        expect(choiceIndex([true, true, true], 1, 'ArrowRight', true)).toBe(0);
        expect(choiceIndex([true, true, true], 1, 'ArrowLeft', true)).toBe(2);
        expect(choiceIndex([false, false], 0, 'ArrowRight')).toBe(null);
        expect(choiceIndex([true], 0, 'Tab')).toBe(null);
        expect(choiceIndex([false, true], -1, 'ArrowLeft')).toBe(1);
    });
});
