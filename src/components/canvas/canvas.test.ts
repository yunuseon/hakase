import { describe, expect, it } from 'vitest';
import { keyStateHold } from './canvas.ts';

describe('keyStateHold', () => {
    it('reserves an unmodified W outside editors, without retriggering on repeat', () => {
        expect(keyStateHold('KeyW', false, false, false)).toBe(true);
        expect(keyStateHold('KeyW', false, false, true)).toBe(false);
        expect(keyStateHold('KeyW', true, false, false)).toBe(false);
        expect(keyStateHold('KeyW', false, true, false)).toBe(false);
        expect(keyStateHold('ShiftLeft', false, false, false)).toBe(false);
    });
});
