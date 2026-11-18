import { describe, expect, it } from 'vitest';
import type { Block } from '../../model/agenda.ts';
import { laidOut } from './lanes.ts';

const block = (id: string, start: number, end: number): Block => ({
    id,
    day: '2026-11-02',
    start,
    end,
    title: '',
});

describe('laidOut', () => {
    it('puts overlapping blocks side by side and leaves the rest full width', () => {
        const placed = laidOut([
            block('a', 60, 180),
            block('b', 120, 240),
            block('c', 200, 260),
            block('d', 300, 360),
        ]);
        const lanes = Object.fromEntries(
            placed.map(({ id, lane, lanes: count }) => [id, [lane, count]]),
        );

        expect(lanes).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
    });
});
