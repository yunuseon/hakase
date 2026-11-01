import { describe, expect, it } from 'vitest';
import { dayOf, daysBetween, isDay, minuteOfDay, shiftDay } from './day.ts';

describe('days', () => {
    it('formats local days and steps across months and years', () => {
        expect(dayOf(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
        expect(shiftDay('2026-01-31', 1)).toBe('2026-02-01');
        expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
        expect(shiftDay('2024-02-28', 1)).toBe('2024-02-29');
    });

    it('steps over a daylight-saving change without skipping a day', () => {
        expect(shiftDay('2026-03-28', 1)).toBe('2026-03-29');
        expect(shiftDay('2026-03-29', 1)).toBe('2026-03-30');
        expect(shiftDay('2026-10-25', 1)).toBe('2026-10-26');
    });

    it('rejects what is not a real day', () => {
        expect(isDay('2026-02-29')).toBe(false);
        expect(isDay('2026-13-01')).toBe(false);
        expect(isDay('today')).toBe(false);
        expect(isDay('2028-02-29')).toBe(true);
    });

    it('counts days and minutes', () => {
        expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3);
        expect(minuteOfDay(new Date(2026, 0, 1, 9, 30).getTime())).toBe(570);
    });
});
