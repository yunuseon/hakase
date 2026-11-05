import { describe, expect, it } from 'vitest';
import { initialFocus, reduceFocus } from './components/focus/focus.ts';
import { focusView } from './components/focus/focus.ts';
import { agendaReading, focusReading, planOf, plansOf, todoReading } from './readings.ts';

const block = (id: string, day: string, start: number, end: number, title = '') => ({
    id,
    day,
    start,
    end,
    title,
});

const agenda = {
    made: 4,
    blocks: [
        block('block-1', '2026-11-05', 600, 660, 'Standup'),
        block('block-2', '2026-11-05', 630, 645),
        block('block-3', '2026-11-05', 720, 780, 'Lunch'),
        block('block-4', '2026-11-06', 600, 660),
    ],
};

describe('agendaReading', () => {
    it('reads how far through the current block now is', () => {
        expect(agendaReading(agenda, '2026-11-05', 620)).toEqual({
            kind: 'now',
            title: 'Standup',
            at: 1 / 3,
            remaining: 40 * 60_000,
            running: true,
            span: { start: '10:00', end: '11:00' },
        });
    });

    it('follows the block that began last where blocks overlap', () => {
        expect(agendaReading(agenda, '2026-11-05', 640)).toMatchObject({
            title: 'Untitled',
            at: 2 / 3,
        });
    });

    it('names the next block between blocks', () => {
        expect(agendaReading(agenda, '2026-11-05', 690)).toEqual({
            kind: 'next',
            title: 'Lunch',
            remaining: 30 * 60_000,
            span: { start: '12:00', end: '13:00' },
        });
    });

    it('has nothing after the last block or on an empty day', () => {
        expect(agendaReading(agenda, '2026-11-05', 780).kind).toBe('none');
        expect(agendaReading(agenda, '2026-11-07', 620).kind).toBe('none');
    });
});

describe('focusReading', () => {
    it('reads the phase, its progress and whether it runs', () => {
        const running = reduceFocus(initialFocus, { kind: 'command', command: { kind: 'toggle' } });
        const halfway = reduceFocus(running, { kind: 'tick', ms: running.remaining / 2 });

        expect(focusReading(halfway, null)).toEqual({
            kind: 'now',
            title: 'Focus',
            at: 0.5,
            remaining: halfway.remaining,
            running: true,
            span: null,
        });
        expect(focusReading(initialFocus, null)).toMatchObject({ at: 0, running: false });
    });
});

describe('todoReading', () => {
    it('counts what is done, and has nothing to show for an empty list', () => {
        const todo = (id: string, done: boolean) => ({ id, text: id, done });

        expect(
            todoReading({ items: [todo('a', true), todo('b', false), todo('c', true)], made: 3 }),
        ).toEqual({ kind: 'count', title: 'To-dos', done: 2, total: 3 });
        expect(todoReading({ items: [], made: 0 }).kind).toBe('none');
    });
});

describe('plans', () => {
    it('are the block running now, measured in milliseconds', () => {
        expect(planOf(agenda, '2026-11-05', 620)).toEqual({
            id: 'block-1',
            title: 'Standup',
            elapsed: 20 * 60_000,
            length: 60 * 60_000,
        });
        expect(planOf(agenda, '2026-11-05', 690)).toBeNull();
    });

    it('are kept per timer, only for timers that follow an agenda with a block running', () => {
        const links = new Map([
            ['focus', { sources: { agenda: 'agenda' } }],
            ['store-2', { sources: { agenda: null } }],
            ['store-3', { sources: { agenda: 'store-9' } }],
        ]);
        const plans = plansOf(links, new Map([['agenda', agenda]]), '2026-11-05', 620);

        expect([...plans.keys()]).toEqual(['focus']);
    });

    it('drive the timer while they run: their title, countdown and progress', () => {
        const plan = planOf(agenda, '2026-11-05', 615);

        expect(focusView(initialFocus, plan)).toMatchObject({
            planned: true,
            label: 'Standup',
            clock: '45:00',
            progress: 0.25,
            running: true,
        });
        expect(focusReading(initialFocus, plan)).toMatchObject({
            title: 'Standup',
            at: 0.25,
            remaining: 45 * 60_000,
            running: true,
        });
        expect(focusView(initialFocus, null).planned).toBe(false);
    });
});
