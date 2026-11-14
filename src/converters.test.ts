import { describe, expect, it } from 'vitest';
import {
    DAY_MINUTES,
    emptyAgenda,
    reduceAgenda,
    type AgendaCommand,
} from './components/agenda/agenda.ts';
import { focusView, initialFocus, type Focus } from './components/focus/focus.ts';
import { defaultTickets, reduceTickets, type TicketCommand } from './shared/tickets.ts';
import type { Habits } from './components/habits/habits.ts';
import { initialClock, type Clock } from './shared/playhead.ts';
import {
    bitShaped,
    clockBit,
    clockLevel,
    CONVERTER_DEFAULTS,
    converterTitle,
    doneLevel,
    parseConverter,
    phaseLevel,
    pictureCurve,
    PLAIN_BITS,
    reduceConverter,
    shaped,
    soundBits,
    tasksBit,
    thresholded,
    timerBit,
    timingCurve,
    habitsBit,
    habitsLevel,
    zoneCurve,
    UNSHAPED,
    type ConverterCommand,
    type Shape,
    type ShapeField,
} from './converters.ts';
import { inputsFor } from './inputs.fixture.ts';
import { converterInputs } from './inputs.ts';
import { processFrom, storeFrom } from './workspace.ts';
import { CURVE_SAMPLES, curveOf, type Driver } from './shared/curve.ts';
import { driverAt } from './shared/signal.ts';

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
    const timing = CONVERTER_DEFAULTS['schedule-level'];

    it('takes only its own readings, and keeps what it reads and is read on', () => {
        expect(reduceConverter(timing, { kind: 'choose', choice: 'through' }).choice).toBe(
            'through',
        );
        expect(reduceConverter(timing, { kind: 'choose', choice: 'sideways' })).toBe(timing);
        expect(
            reduceConverter(timing, { kind: 'source', param: 'in', source: 'agenda' }).sources.in,
        ).toBe('agenda');
    });

    it('reads back what it saved, shape and all, and refuses what is not one', () => {
        const commands: readonly ConverterCommand[] = [
            { kind: 'choose', choice: 'before' },
            { kind: 'source', param: 'time', source: 'day' },
            { kind: 'shape', field: 'high', value: 4 },
            { kind: 'shape', field: 'invert', value: 1 },
        ];
        const linked = commands.reduce(reduceConverter, timing);

        expect(parseConverter(JSON.parse(JSON.stringify(linked)))).toEqual(linked);
        expect(parseConverter({ kind: 'schedule-level', choice: 'nope' })?.choice).toBe(
            timing.choice,
        );
        expect(parseConverter({ kind: 'nand' })).toBeNull();
    });

    it('reads a converter saved under its first name as its pair, reading and all', () => {
        expect(parseConverter({ kind: 'timing', choice: 'before' })).toMatchObject({
            kind: 'schedule-level',
            choice: 'before',
        });
        expect(parseConverter({ kind: 'kit', choice: 'hat' })).toMatchObject({
            kind: 'sound-level',
            choice: 'hat',
        });
        expect(parseConverter({ kind: 'envelope', choice: 'pitch' })?.kind).toBe('sound-level');
        expect(parseConverter({ kind: 'phase' })?.kind).toBe('timer-level');
        expect(parseConverter({ kind: 'done', choice: 'left' })?.kind).toBe('tasks-level');
    });

    it('brings a window and a state saved under a first name back as the pair', () => {
        const frame = { x: 0, y: 0, z: 0, width: 280, height: 220 };

        expect(
            processFrom({ id: 'kit-3', program: 'kit', store: 'store-3', frame }, inputsFor),
        ).toMatchObject({ program: 'sound-level', store: 'store-3' });
        expect(storeFrom({ id: 'store-3', program: 'timing', name: 'Day' })).toMatchObject([
            { program: 'schedule-level', name: 'Day' },
        ]);
    });

    it('takes every source of its type, so one sound converter reads voices and drums', () => {
        expect(
            converterInputs('sound-level')['in']?.sources.map(({ kind: source }) => source),
        ).toEqual(['voice', 'drums']);
        expect(converterTitle('sound-level')).toBe('sound → level');
    });
});

describe('shaping a level', () => {
    const ramp = curveOf(t => t);
    const at = (shape: Partial<Shape>, t: number) =>
        driverAt(shaped(ramp, { ...UNSHAPED, ...shape }), t);

    it('passes a level through untouched when nothing is shaped', () => {
        expect(shaped(ramp, UNSHAPED)).toBe(ramp);
    });

    it('maps it into a range, turned upside down if inverted', () => {
        expect(at({ low: 2, high: 6 }, 0.5)).toBeCloseTo(4);
        expect(at({ invert: true }, 0.25)).toBeCloseTo(0.75);
        expect(at({ invert: true, low: -1, high: 1 }, 1 - 1 / CURVE_SAMPLES)).toBeCloseTo(-1, 1);
    });

    it('eases in or out, and steps', () => {
        expect(at({ curve: 0.5 }, 0.5)).toBeCloseTo(0.25);
        expect(at({ curve: -0.5 }, 0.25)).toBeCloseTo(0.5);
        expect(at({ steps: 3 }, 0.3)).toBeCloseTo(0.5);
        expect(at({ steps: 3 }, 0.2)).toBe(0);
    });

    it('smooths a jump, round the loop too', () => {
        const step = curveOf(t => (t < 0.5 ? 0 : 1));
        const smooth = shaped(step, { ...UNSHAPED, smooth: 0.9 });

        expect(driverAt(smooth, 0.51)).toBeGreaterThan(0);
        expect(driverAt(smooth, 0.51)).toBeLessThan(1);
        expect(driverAt(smooth, 0.01)).toBeGreaterThan(0);
    });

    it('turns a shape command into a clamped field, and refuses nonsense', () => {
        const timing = CONVERTER_DEFAULTS['schedule-level'];
        const shape = (field: ShapeField, value: number) =>
            reduceConverter(timing, { kind: 'shape', field, value }).shape;

        expect(shape('curve', 3).curve).toBe(1);
        expect(shape('steps', 1).steps).toBe(0);
        expect(shape('steps', 40).steps).toBe(16);
        expect(reduceConverter(timing, { kind: 'shape', field: 'low', value: Number.NaN })).toBe(
            timing,
        );
    });
});

describe('a phase converter', () => {
    const quarter: Focus = { ...initialFocus, remaining: initialFocus.remaining * 0.75 };
    const view = focusView(quarter, null);
    const resting = focusView({ ...quarter, phase: 'short' }, null);
    const planned = focusView(initialFocus, {
        id: 'block-1',
        title: 'Write',
        elapsed: 30,
        length: 60,
    });

    it('reads how far through the phase it is, or how much is left', () => {
        expect(phaseLevel(view, 'through')).toBeCloseTo(0.25);
        expect(phaseLevel(view, 'left')).toBeCloseTo(0.75);
        expect(phaseLevel(planned, 'through')).toBeCloseTo(0.5);
    });

    it('reads 1 while focusing, in a focus phase or an agenda block, and 0 on a break', () => {
        expect(phaseLevel(view, 'focusing')).toBe(1);
        expect(phaseLevel(planned, 'focusing')).toBe(1);
        expect(phaseLevel(resting, 'focusing')).toBe(0);
    });
});

describe('a done converter', () => {
    const added = (status: string, title: string): TicketCommand => ({
        kind: 'add',
        status,
        title,
        parent: null,
    });
    const tickets = [
        added('status-1', 'plan'),
        added('status-2', 'build'),
        added('status-3', 'ship'),
        added('status-3', 'celebrate'),
    ].reduce((all, command) => reduceTickets(all, command), defaultTickets);

    it('reads the share of tickets done, in progress, or left, by stage', () => {
        expect(doneLevel(tickets, 'done')).toBe(0.5);
        expect(doneLevel(tickets, 'active')).toBe(0.25);
        expect(doneLevel(tickets, 'left')).toBe(0.5);
    });

    it('reads 0 for a list with nothing in it', () => {
        expect(doneLevel(defaultTickets, 'done')).toBe(0);
        expect(doneLevel(defaultTickets, 'left')).toBe(0);
    });
});

describe('converters that make a bit', () => {
    const ramp = curveOf(t => t);
    const on = (driver: Driver) => {
        const samples = 'samples' in driver ? driver.samples : new Float32Array(1);

        return Array.from(samples).filter(value => value === 1).length / samples.length;
    };

    it('read a level above or below a threshold, holding through a band', () => {
        expect(on(thresholded(ramp, false, 0.75, 0))).toBeCloseTo(0.25, 2);
        expect(on(thresholded(ramp, true, 0.75, 0))).toBeCloseTo(0.75, 2);

        const wobble = curveOf(t => 0.5 + 0.05 * Math.sin(t * Math.PI * 40));

        expect(on(thresholded(wobble, false, 0.5, 0))).toBeCloseTo(0.5, 1);
        expect([0, 1]).toContain(on(thresholded(wobble, false, 0.5, 0.2)));
    });

    it('read sound as sounding, or a short pulse at each hit', () => {
        const struck = curveOf(t => ((t * 4) % 1 < 0.1 ? 1 : 0));
        const hits = soundBits(struck, 'hit');

        expect(on(soundBits(struck, 'sounding'))).toBeCloseTo(0.1, 1);
        expect(on(hits)).toBeGreaterThan(0);
        expect(on(hits)).toBeLessThan(0.1);
        expect(driverAt(hits, 0.25)).toBe(1);
        expect(driverAt(hits, 0.4)).toBe(0);
    });

    it('read a timer and a ticket list as they stand now', () => {
        expect(timerBit(focusView(initialFocus, null), 'focusing')).toBe(1);
        expect(timerBit(focusView(initialFocus, null), 'running')).toBe(0);
        expect(tasksBit(defaultTickets, 'done')).toBe(0);
    });

    it('invert and hold a bit, and pass a plain one through untouched', () => {
        const pulse = curveOf(t => (t < 0.1 ? 1 : 0));

        expect(bitShaped(pulse, PLAIN_BITS)).toBe(pulse);
        expect(on(bitShaped(pulse, { ...PLAIN_BITS, invert: true }))).toBeCloseTo(0.9, 2);
        expect(on(bitShaped(pulse, { ...PLAIN_BITS, hold: 0.2 }))).toBeCloseTo(0.3, 2);
    });

    it('keep their bit settings through storage, clamped', () => {
        const set = [
            { kind: 'bits', field: 'threshold', value: 0.3 },
            { kind: 'bits', field: 'band', value: -2 },
            { kind: 'bits', field: 'hold', value: 0.9 },
        ] satisfies readonly ConverterCommand[];
        const converter = set.reduce(reduceConverter, CONVERTER_DEFAULTS['level-bit']);

        expect(converter.bits).toEqual({ invert: false, hold: 0.5, threshold: 0.3, band: 0 });
        expect(parseConverter(JSON.parse(JSON.stringify(converter)))).toEqual(converter);
    });
});

describe('converters reading clocks, cities and habits', () => {
    const clock: Clock = { ...initialClock, at: 0.6, ticks: 4, playing: true };

    it('read a clock as it stands: its position, its tick, playing, and the beat', () => {
        expect(clockLevel(clock, 'position')).toBe(0.6);
        expect(clockLevel(clock, 'tick')).toBe(0.5);
        expect(clockBit(clock, 'playing')).toBe(1);
        expect(clockBit({ ...clock, held: true }, 'playing')).toBe(0);
        expect(clockBit(clock, 'beat')).toBe(1);
        expect(clockBit({ ...clock, at: 0.7 }, 'beat')).toBe(0);
    });

    it("read a city's day over yours, shifted by how far ahead it is", () => {
        const noonHere = 0.5;

        expect(driverAt(zoneCurve(0, 'time'), noonHere)).toBeCloseTo(0.5, 2);
        expect(driverAt(zoneCurve(9 * 60, 'time'), noonHere)).toBeCloseTo(21 / 24, 2);
        expect(driverAt(zoneCurve(0, 'daylight'), noonHere)).toBeCloseTo(1, 2);
        expect(driverAt(zoneCurve(12 * 60, 'daylight'), noonHere)).toBe(0);
        expect(driverAt(zoneCurve(0, 'day'), noonHere)).toBe(1);
        expect(driverAt(zoneCurve(-4 * 60, 'office'), noonHere)).toBe(0);
    });

    it('read habits as done today or as a streak, for one or for all', () => {
        const today = '2026-11-13';
        const habits: Habits = {
            made: 2,
            items: [
                { id: 'habit-1', name: 'run', done: ['2026-11-12', today] },
                { id: 'habit-2', name: 'read', done: ['2026-11-12'] },
            ],
        };

        expect(habitsLevel(habits, null, today, 'today')).toBe(0.5);
        expect(habitsLevel(habits, 'habit-1', today, 'today')).toBe(1);
        expect(habitsLevel(habits, 'habit-1', today, 'streak')).toBe(2);
        expect(habitsLevel(habits, null, today, 'streak')).toBe(1);
        expect(habitsBit(habits, null, today)).toBe(0);
        expect(habitsBit(habits, 'habit-1', today)).toBe(1);
        expect(habitsLevel(habits, 'gone', today, 'today')).toBe(0);
    });

    it('keep which item they read through storage', () => {
        const picked = reduceConverter(CONVERTER_DEFAULTS['zones-level'], {
            kind: 'item',
            item: 'Asia/Tokyo',
        });

        expect(picked.item).toBe('Asia/Tokyo');
        expect(parseConverter(JSON.parse(JSON.stringify(picked)))).toEqual(picked);
        expect(parseConverter({ kind: 'habits-bit', item: 3 })?.item).toBeNull();
    });

    it('plug into a world clock list and a habit list, which are sources now', () => {
        expect(
            converterInputs('zones-level')['in']?.sources.map(({ kind: source }) => source),
        ).toEqual(['clocks']);
        expect(
            converterInputs('habits-bit')['in']?.sources.map(({ kind: source }) => source),
        ).toEqual(['habits']);
        expect(
            converterInputs('clock-level')['in']?.sources.map(({ kind: source }) => source),
        ).toEqual(['playback']);
    });
});

describe('a picture converter', () => {
    const frame = (r: number, g: number, b: number) =>
        Uint8Array.from({ length: 16 }, (_, index) => [r, g, b, 255][index % 4] ?? 0);
    const frames = [frame(0, 0, 0), frame(255, 255, 255), frame(255, 0, 0), frame(0, 0, 255)];
    const read = (choice: string) =>
        Array.from(pictureCurve(frames, choice).samples, value => Number(value.toFixed(3)));

    it('reads the brightness of each moment, or one colour of it, as a curve over the loop', () => {
        expect(read('brightness')).toEqual([0, 1, 0.213, 0.072]);
        expect(read('red')).toEqual([0, 1, 1, 0]);
        expect(read('blue')).toEqual([0, 1, 0, 1]);
    });

    it('reads motion as the change from the moment before, the first from the last', () => {
        expect(read('motion')).toEqual([0.072, 1, 0.787, 0.14]);
    });

    it('takes a sketch or a pedal, never a level', () => {
        expect(converterInputs('picture-level')['in']?.sources.map(({ kind }) => kind)).toEqual([
            'sketch',
            'colourmap',
            'kaleido',
            'feedback',
            'mix',
            'blur',
        ]);
        expect(converterTitle('picture-level')).toBe('picture → level');
    });
});
