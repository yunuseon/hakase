import { describe, expect, it } from 'vitest';
import {
    DAY_MINUTES,
    emptyAgenda,
    laidOut,
    nextBlockId,
    parseAgenda,
    reduceAgenda,
    timeOf,
    type Agenda,
    type AgendaCommand,
    type Block,
} from './agenda.ts';

const run = (...commands: AgendaCommand[]): Agenda => commands.reduce(reduceAgenda, emptyAgenda);

const block = (id: string, start: number, end: number): Block => ({
    id,
    day: '2026-11-02',
    start,
    end,
    title: '',
});

describe('reduceAgenda', () => {
    it('snaps a new block to quarter hours and gives it a length', () => {
        const agenda = run({ kind: 'add', id: 'block-1', day: 'd', start: 547, end: 549 });

        expect(agenda.blocks[0]).toMatchObject({ start: 540, end: 555 });
        expect(nextBlockId(agenda)).toBe('block-2');
    });

    it('moves a block whole and keeps it inside the day', () => {
        const added = run({ kind: 'add', id: 'block-1', day: 'd', start: 60, end: 120 });

        expect(
            reduceAgenda(added, { kind: 'move', id: 'block-1', start: 200 }).blocks[0],
        ).toMatchObject({
            start: 195,
            end: 255,
        });
        expect(
            reduceAgenda(added, { kind: 'move', id: 'block-1', start: 5000 }).blocks[0],
        ).toMatchObject({
            start: DAY_MINUTES - 60,
            end: DAY_MINUTES,
        });
    });

    it('never resizes below one step', () => {
        const added = run({ kind: 'add', id: 'block-1', day: 'd', start: 60, end: 120 });

        expect(reduceAgenda(added, { kind: 'resize', id: 'block-1', end: 0 }).blocks[0]?.end).toBe(
            75,
        );
    });
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

describe('timeOf', () => {
    it('writes minutes as a clock', () => {
        expect(timeOf(545)).toBe('09:05');
    });
});

describe('parseAgenda', () => {
    it('drops blocks that are not inside one day', () => {
        const agenda = parseAgenda({
            blocks: [block('block-4', 60, 90), block('block-5', 90, 60), { id: 1 }],
            made: 0,
        });

        expect(agenda.blocks.map(({ id }) => id)).toEqual(['block-4']);
        expect(agenda.made).toBe(4);
    });
});
