import { describe, expect, it } from 'vitest';
import {
    DAY_MINUTES,
    emptyAgenda,
    reduceAgenda,
    type AgendaCommand,
} from './components/agenda/agenda.ts';
import { CONVERTER_DEFAULTS, parseConverter, reduceConverter, timingCurve } from './converters.ts';
import { driverAt } from './shared/curve.ts';

const DAY = '2026-11-13';
const commands: readonly AgendaCommand[] = [
    { kind: 'add', id: 'block-1', day: DAY, start: 9 * 60, end: 11 * 60 },
    { kind: 'add', id: 'block-2', day: '2026-11-14', start: 14 * 60, end: 15 * 60 },
];
const agenda = commands.reduce(reduceAgenda, emptyAgenda);
const at = (hours: number) => (hours * 60) / DAY_MINUTES;
const read = (choice: string, hours: number) =>
    driverAt(timingCurve(agenda, DAY, choice), at(hours));

describe('timing', () => {
    it('reads 1 through a block of its day, and 0 around it and on other days', () => {
        expect(read('in', 10)).toBe(1);
        expect(read('in', 8)).toBe(0);
        expect(read('in', 14.5)).toBe(0);
    });

    it('rises through a block', () => {
        expect(read('through', 9.5)).toBeCloseTo(0.25, 1);
        expect(read('through', 10.5)).toBeCloseTo(0.75, 1);
        expect(read('through', 12)).toBe(0);
    });

    it('rises over the hour before a block, and rests otherwise', () => {
        expect(read('before', 7)).toBe(0);
        expect(read('before', 8.5)).toBeCloseTo(0.5, 1);
        expect(read('before', 10)).toBe(0);
    });
});

describe('a converter document', () => {
    const timing = CONVERTER_DEFAULTS.timing;

    it('takes only its own choices, and keeps what it reads and is read on', () => {
        expect(reduceConverter(timing, { kind: 'choose', choice: 'through' }).choice).toBe(
            'through',
        );
        expect(reduceConverter(timing, { kind: 'choose', choice: 'sideways' })).toBe(timing);
        expect(
            reduceConverter(timing, { kind: 'source', param: 'in', source: 'agenda' }).sources.in,
        ).toBe('agenda');
    });

    it('reads back what it saved, and refuses what is not one', () => {
        const linked = reduceConverter(
            reduceConverter(timing, { kind: 'choose', choice: 'before' }),
            { kind: 'source', param: 'time', source: 'day' },
        );

        expect(parseConverter(JSON.parse(JSON.stringify(linked)))).toEqual(linked);
        expect(parseConverter({ kind: 'timing', choice: 'nope' })?.choice).toBe(timing.choice);
        expect(parseConverter({ kind: 'nand' })).toBeNull();
    });
});
