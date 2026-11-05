import { describe, expect, it } from 'vitest';
import { barView, durationText } from './progress-bar.ts';

describe('durationText', () => {
    it('counts seconds under ten minutes, minutes under an hour, then hours', () => {
        expect(durationText(40_000)).toBe('0:40');
        expect(durationText(9 * 60_000 + 5_400)).toBe('9:06');
        expect(durationText(54 * 60_000)).toBe('54 min');
        expect(durationText(54 * 60_000 - 1)).toBe('54 min');
        expect(durationText(65 * 60_000)).toBe('1 h 05');
        expect(durationText(-5)).toBe('0:00');
    });
});

describe('barView', () => {
    it('shows a running reading as a filled bar with the time left', () => {
        expect(
            barView({
                kind: 'now',
                title: 'Write-up',
                at: 0.25,
                remaining: 54 * 60_000,
                running: true,
                span: { start: '19:45', end: '21:00' },
            }),
        ).toEqual({
            state: 'now',
            title: 'Write-up',
            detail: '54 min left',
            fill: 0.25,
            start: '19:45',
            end: '21:00',
        });
    });

    it('marks a paused reading', () => {
        expect(
            barView({
                kind: 'now',
                title: 'Focus',
                at: 0,
                remaining: 25 * 60_000,
                running: false,
                span: null,
            }),
        ).toMatchObject({ state: 'paused', detail: '25 min left · paused', start: '' });
    });

    it('shows what comes next with an empty bar', () => {
        expect(
            barView({
                kind: 'next',
                title: 'Reading',
                remaining: 15 * 60_000,
                span: { start: '21:15', end: '22:00' },
            }),
        ).toMatchObject({ state: 'next', title: 'Next: Reading', detail: 'in 15 min', fill: 0 });
    });

    it('shows a count as a share done', () => {
        expect(barView({ kind: 'count', title: 'To-dos', done: 3, total: 8 })).toMatchObject({
            state: 'now',
            detail: '3 of 8 done',
            fill: 3 / 8,
        });
        expect(barView({ kind: 'count', title: 'To-dos', done: 8, total: 8 }).detail).toBe(
            'all 8 done',
        );
    });
});
