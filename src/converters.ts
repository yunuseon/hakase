import { currentBlock, DAY_MINUTES, nextBlock, type Agenda } from './components/agenda/agenda.ts';
import { DRUM_LABELS, DRUMS } from './components/drums/drums.ts';
import type { FocusView } from './components/focus/focus.ts';
import { clamp } from './lib/math.ts';
import type { PortType } from './port-types.ts';
import { curveOf, type Curve, type Driver } from './shared/curve.ts';
import { driverAt } from './shared/signal.ts';
import type { Habits } from './components/habits/habits.ts';
import { streakOf } from './components/habits/habits.ts';
import type { Clock } from './shared/playhead.ts';
import type { Stage, Tickets } from './shared/tickets.ts';

export const CONVERTER_KINDS = [
    'schedule-level',
    'sound-level',
    'timer-level',
    'tasks-level',
    'level-level',
    'level-bit',
    'schedule-bit',
    'timer-bit',
    'tasks-bit',
    'sound-bit',
    'clock-level',
    'clock-bit',
    'zones-level',
    'zones-bit',
    'habits-level',
    'habits-bit',
] as const;
export type ConverterKind = (typeof CONVERTER_KINDS)[number];

export const isConverterKind = (value: string): value is ConverterKind =>
    CONVERTER_KINDS.some(kind => kind === value);

export type ConverterChoice = { readonly id: string; readonly title: string };

export type ConverterSpec = {
    readonly summary: string;
    readonly icon: string;
    readonly takes: PortType;
    readonly makes: PortType;
    readonly choices: readonly ConverterChoice[];
    readonly size: { readonly width: number; readonly height: number };
};

const SIZE = { width: 300, height: 340 };

export const CONVERTERS = {
    'schedule-level': {
        summary:
            'An agenda over today: 1 in a block, rising through one, or rising as the next one nears.',
        icon: 'M4 6 H20 V18 H4 Z M8 6 V18 M4 12 H8 M12 15 L15 10 L18 15',
        takes: 'schedule',
        makes: 'level',
        choices: [
            { id: 'in', title: 'in a block' },
            { id: 'through', title: 'through a block' },
            { id: 'before', title: 'before a block' },
        ],
        size: SIZE,
    },
    'sound-level': {
        summary:
            'A voice or drum machine: how loud it is, the note a voice is on (octaves above its root), or one drum of a kit.',
        icon: 'M3 18 L7 6 L10 13 L13 9 L21 18 M3 18 H21',
        takes: 'sound',
        makes: 'level',
        choices: [
            { id: 'loudness', title: 'loudness' },
            { id: 'pitch', title: 'pitch' },
            ...DRUMS.map(drum => ({ id: drum, title: DRUM_LABELS[drum] })),
        ],
        size: { width: 320, height: 360 },
    },
    'timer-level': {
        summary:
            'A focus timer as it stands now: how far through its phase or block, how much is left, or whether you are focusing.',
        icon: 'M12 4 A8 8 0 1 0 20 12 M12 4 V12 L17 15',
        takes: 'timer',
        makes: 'level',
        choices: [
            { id: 'through', title: 'through' },
            { id: 'left', title: 'left' },
            { id: 'focusing', title: 'focusing' },
        ],
        size: SIZE,
    },
    'tasks-level': {
        summary:
            'A ticket list as it stands now: the share of its tickets done, in progress, or not done yet.',
        icon: 'M4 6 H20 M4 12 H20 M4 18 H12 M15 17 L17 19 L21 15',
        takes: 'tasks',
        makes: 'level',
        choices: [
            { id: 'done', title: 'done' },
            { id: 'active', title: 'in progress' },
            { id: 'left', title: 'left' },
        ],
        size: SIZE,
    },
    'level-level': {
        summary: 'Any level reshaped: its range, direction, curve, steps and smoothness.',
        icon: 'M4 18 C 9 18, 10 6, 20 6 M4 12 H8 M16 12 H20',
        takes: 'level',
        makes: 'level',
        choices: [{ id: 'shape', title: 'shape' }],
        size: SIZE,
    },
    'level-bit': {
        summary: 'A level as a bit: on while it is above its threshold, or below it.',
        icon: 'M3 15 C 7 15, 8 6, 12 6 S 17 15, 21 15 M3 11 H21',
        takes: 'level',
        makes: 'bit',
        choices: [
            { id: 'above', title: 'above' },
            { id: 'below', title: 'below' },
        ],
        size: SIZE,
    },
    'schedule-bit': {
        summary: 'An agenda over today as a bit: on in a block, or in the hour before one.',
        icon: 'M4 6 H20 V18 H4 Z M8 6 V18 M11 14 H14 V10 H18',
        takes: 'schedule',
        makes: 'bit',
        choices: [
            { id: 'in', title: 'in a block' },
            { id: 'before', title: 'before a block' },
        ],
        size: SIZE,
    },
    'timer-bit': {
        summary: 'A focus timer as a bit, as it stands now: on while focusing, or while it runs.',
        icon: 'M12 4 A8 8 0 1 0 20 12 M9 12 H12 V8 H15',
        takes: 'timer',
        makes: 'bit',
        choices: [
            { id: 'focusing', title: 'focusing' },
            { id: 'running', title: 'running' },
        ],
        size: SIZE,
    },
    'tasks-bit': {
        summary:
            'A ticket list as a bit, as it stands now: on when all are done, or while any is in progress.',
        icon: 'M4 6 H20 M4 12 H12 M4 18 H12 M15 15 H17 V11 H21',
        takes: 'tasks',
        makes: 'bit',
        choices: [
            { id: 'done', title: 'all done' },
            { id: 'active', title: 'any in progress' },
        ],
        size: SIZE,
    },
    'sound-bit': {
        summary:
            'A voice or drum machine as a bit: on while it sounds, or for a moment at each hit.',
        icon: 'M3 18 L7 6 L10 13 L13 9 L21 18 M14 4 V8 H18',
        takes: 'sound',
        makes: 'bit',
        choices: [
            { id: 'sounding', title: 'sounding' },
            { id: 'hit', title: 'hit' },
        ],
        size: SIZE,
    },
    'clock-level': {
        summary: 'A clock as it stands now: how far through its loop, or the tick it is on.',
        icon: 'M12 4 A8 8 0 1 0 12.01 4 M12 12 L17 9',
        takes: 'clock',
        makes: 'level',
        choices: [
            { id: 'position', title: 'position' },
            { id: 'tick', title: 'tick' },
        ],
        size: SIZE,
    },
    'clock-bit': {
        summary:
            'A clock as a bit, as it stands now: on while it plays, or in the first half of each tick.',
        icon: 'M12 4 A8 8 0 1 0 12.01 4 M9 14 H12 V10 H15',
        takes: 'clock',
        makes: 'bit',
        choices: [
            { id: 'playing', title: 'playing' },
            { id: 'beat', title: 'beat' },
        ],
        size: SIZE,
    },
    'zones-level': {
        summary: 'A city of a world clock over your day: the time of day there, or its daylight.',
        icon: 'M12 4 A8 8 0 1 0 12.01 4 M4 12 H20 M12 4 C 8 8, 8 16, 12 20 M12 4 C 16 8, 16 16, 12 20',
        takes: 'zones',
        makes: 'level',
        choices: [
            { id: 'time', title: 'time of day' },
            { id: 'daylight', title: 'daylight' },
        ],
        size: SIZE,
    },
    'zones-bit': {
        summary:
            'A city of a world clock over your day as a bit: on while it is day there, or office hours.',
        icon: 'M12 4 A8 8 0 1 0 12.01 4 M4 12 H20 M9 16 H12 V12 H15',
        takes: 'zones',
        makes: 'bit',
        choices: [
            { id: 'day', title: 'day there' },
            { id: 'office', title: 'office hours' },
        ],
        size: SIZE,
    },
    'habits-level': {
        summary:
            'Habits as they stand today: the share of them done, or the streak, of one habit or all.',
        icon: 'M5 6 H19 V18 H5 Z M8 10 L10 12 L14 8 M8 15 H16',
        takes: 'habits',
        makes: 'level',
        choices: [
            { id: 'today', title: 'done today' },
            { id: 'streak', title: 'streak' },
        ],
        size: SIZE,
    },
    'habits-bit': {
        summary:
            'Habits as a bit, as they stand today: on once one habit, or all of them, are done.',
        icon: 'M5 6 H19 V18 H5 Z M8 12 L10 14 L16 8',
        takes: 'habits',
        makes: 'bit',
        choices: [{ id: 'today', title: 'done today' }],
        size: SIZE,
    },
} as const satisfies Record<ConverterKind, ConverterSpec>;

export const converterTitle = (kind: ConverterKind): string =>
    `${CONVERTERS[kind].takes} → ${CONVERTERS[kind].makes}`;

export const CONVERTER_PARAMS = ['in', 'time'] as const;
export type ConverterParam = (typeof CONVERTER_PARAMS)[number];
export const isConverterParam = (value: string): value is ConverterParam =>
    CONVERTER_PARAMS.some(param => param === value);

export type Shape = {
    readonly low: number;
    readonly high: number;
    readonly invert: boolean;
    readonly curve: number;
    readonly steps: number;
    readonly smooth: number;
};

export const SHAPE_FIELDS = ['low', 'high', 'invert', 'curve', 'steps', 'smooth'] as const;
export type ShapeField = (typeof SHAPE_FIELDS)[number];
export const isShapeField = (value: string): value is ShapeField =>
    SHAPE_FIELDS.some(field => field === value);

export const MAX_STEPS = 16;

export const UNSHAPED: Shape = { low: 0, high: 1, invert: false, curve: 0, steps: 0, smooth: 0 };

export const sameShape = (a: Shape, b: Shape): boolean =>
    a.low === b.low &&
    a.high === b.high &&
    a.invert === b.invert &&
    a.curve === b.curve &&
    a.steps === b.steps &&
    a.smooth === b.smooth;

const shapeWith = (shape: Shape, field: ShapeField, value: number): Shape => {
    if (!Number.isFinite(value)) {
        return shape;
    }

    switch (field) {
        case 'low':
            return { ...shape, low: value };
        case 'high':
            return { ...shape, high: value };
        case 'invert':
            return { ...shape, invert: value !== 0 };
        case 'curve':
            return { ...shape, curve: clamp(value, -1, 1) };
        case 'steps': {
            const steps = Math.round(value);

            return { ...shape, steps: steps < 2 ? 0 : Math.min(steps, MAX_STEPS) };
        }
        case 'smooth':
            return { ...shape, smooth: clamp(value, 0, 1) };
    }
};

export type BitShape = {
    readonly invert: boolean;
    readonly hold: number;
    readonly threshold: number;
    readonly band: number;
};

export const BIT_FIELDS = ['invert', 'hold', 'threshold', 'band'] as const;
export type BitField = (typeof BIT_FIELDS)[number];
export const isBitField = (value: string): value is BitField =>
    BIT_FIELDS.some(field => field === value);

export const PLAIN_BITS: BitShape = { invert: false, hold: 0, threshold: 0.5, band: 0 };

export const sameBits = (a: BitShape, b: BitShape): boolean =>
    a.invert === b.invert && a.hold === b.hold && a.threshold === b.threshold && a.band === b.band;

const bitsWith = (bits: BitShape, field: BitField, value: number): BitShape => {
    if (!Number.isFinite(value)) {
        return bits;
    }

    switch (field) {
        case 'invert':
            return { ...bits, invert: value !== 0 };
        case 'hold':
            return { ...bits, hold: clamp(value, 0, 0.5) };
        case 'threshold':
            return { ...bits, threshold: value };
        case 'band':
            return { ...bits, band: Math.max(0, value) };
    }
};

export type Converter = {
    readonly kind: ConverterKind;
    readonly choice: string;
    readonly shape: Shape;
    readonly bits: BitShape;
    readonly item: string | null;
    readonly sources: Readonly<Record<ConverterParam, string | null>>;
};

export type ConverterItem = { readonly id: string; readonly title: string };

const made = (kind: ConverterKind): Converter => ({
    kind,
    choice: CONVERTERS[kind].choices[0]?.id ?? '',
    shape: UNSHAPED,
    bits: PLAIN_BITS,
    item: null,
    sources: { in: null, time: null },
});

// One object per kind: a fresh default on every read would look like an edit downstream.
export const CONVERTER_DEFAULTS: Readonly<Record<ConverterKind, Converter>> = {
    'schedule-level': made('schedule-level'),
    'sound-level': made('sound-level'),
    'timer-level': made('timer-level'),
    'tasks-level': made('tasks-level'),
    'level-level': made('level-level'),
    'level-bit': made('level-bit'),
    'schedule-bit': made('schedule-bit'),
    'timer-bit': made('timer-bit'),
    'tasks-bit': made('tasks-bit'),
    'sound-bit': made('sound-bit'),
    'clock-level': made('clock-level'),
    'clock-bit': made('clock-bit'),
    'zones-level': made('zones-level'),
    'zones-bit': made('zones-bit'),
    'habits-level': made('habits-level'),
    'habits-bit': made('habits-bit'),
};

export type Conversion = {
    readonly converter: Converter;
    readonly driver: Driver | null;
    readonly items: readonly ConverterItem[];
};

export type ConverterCommand =
    | { readonly kind: 'choose'; readonly choice: string }
    | { readonly kind: 'shape'; readonly field: ShapeField; readonly value: number }
    | { readonly kind: 'bits'; readonly field: BitField; readonly value: number }
    | { readonly kind: 'item'; readonly item: string | null }
    | { readonly kind: 'source'; readonly param: ConverterParam; readonly source: string | null };

const choosable = (kind: ConverterKind, choice: string) =>
    CONVERTERS[kind].choices.some(({ id }) => id === choice);

export const reduceConverter = (converter: Converter, command: ConverterCommand): Converter => {
    switch (command.kind) {
        case 'choose':
            return choosable(converter.kind, command.choice) && command.choice !== converter.choice
                ? { ...converter, choice: command.choice }
                : converter;
        case 'shape': {
            const shape = shapeWith(converter.shape, command.field, command.value);

            return sameShape(shape, converter.shape) ? converter : { ...converter, shape };
        }
        case 'bits': {
            const bits = bitsWith(converter.bits, command.field, command.value);

            return sameBits(bits, converter.bits) ? converter : { ...converter, bits };
        }
        case 'item':
            return converter.item === command.item
                ? converter
                : { ...converter, item: command.item };
        case 'source':
            return converter.sources[command.param] === command.source
                ? converter
                : {
                      ...converter,
                      sources: { ...converter.sources, [command.param]: command.source },
                  };
    }
};

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

const FORMER: Readonly<Record<string, ConverterKind>> = {
    timing: 'schedule-level',
    envelope: 'sound-level',
    kit: 'sound-level',
    phase: 'timer-level',
    done: 'tasks-level',
};

export const formerConverter = (kind: string): string =>
    Object.entries(FORMER).find(([old]) => old === kind)?.[1] ?? kind;

const shapeFrom = (value: unknown): Shape =>
    typeof value !== 'object' || value === null
        ? UNSHAPED
        : SHAPE_FIELDS.reduce((shape, name) => {
              const stored = field(value, name);

              return typeof stored === 'number' || typeof stored === 'boolean'
                  ? shapeWith(shape, name, Number(stored))
                  : shape;
          }, UNSHAPED);

export const parseConverter = (value: unknown): Converter | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const stored = field(value, 'kind');
    const kind = typeof stored === 'string' ? formerConverter(stored) : null;

    if (kind === null || !isConverterKind(kind)) {
        return null;
    }

    const choice = field(value, 'choice');
    const item = field(value, 'item');
    const sources = field(value, 'sources');
    const source = (param: ConverterParam) => {
        const id =
            typeof sources === 'object' && sources !== null ? field(sources, param) : undefined;

        return typeof id === 'string' ? id : null;
    };
    const shape = shapeFrom(field(value, 'shape'));
    const savedBits = field(value, 'bits');
    const bits =
        typeof savedBits !== 'object' || savedBits === null
            ? PLAIN_BITS
            : BIT_FIELDS.reduce((read, name) => {
                  const saved = field(savedBits, name);

                  return typeof saved === 'number' || typeof saved === 'boolean'
                      ? bitsWith(read, name, Number(saved))
                      : read;
              }, PLAIN_BITS);

    return {
        kind,
        choice:
            typeof choice === 'string' && choosable(kind, choice)
                ? choice
                : CONVERTER_DEFAULTS[kind].choice,
        shape: sameShape(shape, UNSHAPED) ? UNSHAPED : shape,
        bits: sameBits(bits, PLAIN_BITS) ? PLAIN_BITS : bits,
        item: typeof item === 'string' ? item : null,
        sources: { in: source('in'), time: source('time') },
    };
};

const eased = (value: number, curve: number) =>
    value <= 0 || value >= 1 || curve === 0 ? value : value ** (2 ** (curve * 2));

const stepped = (value: number, steps: number) =>
    steps < 2 ? value : Math.round(value * (steps - 1)) / (steps - 1);

const slewed = (samples: Float32Array, smooth: number): Float32Array => {
    const keep = smooth ** 0.25;
    const out = new Float32Array(samples.length);
    let state = samples.at(-1) ?? 0;

    for (let pass = 0; pass < 2; pass++) {
        for (let index = 0; index < samples.length; index++) {
            state = keep * state + (1 - keep) * (samples[index] ?? 0);
            out[index] = state;
        }
    }

    return out;
};

export const shapedValue = (value: number, shape: Shape): number => {
    const flipped = shape.invert ? 1 - value : value;

    return shape.low + (shape.high - shape.low) * stepped(eased(flipped, shape.curve), shape.steps);
};

export const shaped = (driver: Driver, shape: Shape): Driver => {
    if (sameShape(shape, UNSHAPED)) {
        return driver;
    }

    const samples =
        'samples' in driver ? driver.samples : curveOf(t => driverAt(driver, t)).samples;
    const smoothed =
        shape.smooth > 0 && samples.length > 1 ? slewed(samples, shape.smooth) : samples;

    return { samples: smoothed.map(value => shapedValue(value, shape)) };
};

const LEAD_MINUTES = 60;

const timingAt = (agenda: Agenda, day: string, choice: string, minute: number): number => {
    const current = currentBlock(agenda, day, minute);

    switch (choice) {
        case 'through':
            return current === null ? 0 : (minute - current.start) / (current.end - current.start);
        case 'before': {
            const next = current === null ? nextBlock(agenda, day, minute) : null;

            return next === null ? 0 : Math.max(0, 1 - (next.start - minute) / LEAD_MINUTES);
        }
        default:
            return current === null ? 0 : 1;
    }
};

export const timingCurve = (agenda: Agenda, day: string, choice: string): Curve =>
    curveOf(t => timingAt(agenda, day, choice, t * DAY_MINUTES));

export const phaseLevel = ({ phase, progress }: FocusView, choice: string): number => {
    switch (choice) {
        case 'left':
            return 1 - progress;
        case 'focusing':
            return phase === 'work' ? 1 : 0;
        default:
            return progress;
    }
};

export const doneLevel = ({ statuses }: Tickets, choice: string): number => {
    const count = (stage: Stage | null) =>
        statuses
            .filter(status => stage === null || status.stage === stage)
            .reduce((sum, { tickets }) => sum + tickets.length, 0);
    const total = count(null);

    if (total === 0) {
        return 0;
    }

    switch (choice) {
        case 'active':
            return count('active') / total;
        case 'left':
            return 1 - count('done') / total;
        default:
            return count('done') / total;
    }
};

const samplesOf = (driver: Driver) =>
    'samples' in driver ? driver.samples : curveOf(t => driverAt(driver, t)).samples;

const asBits = (on: (index: number) => boolean, length: number): Curve => ({
    samples: Float32Array.from({ length }, (_, index) => (on(index) ? 1 : 0)),
});

export const thresholded = (
    driver: Driver,
    below: boolean,
    threshold: number,
    band: number,
): Curve => {
    const samples = samplesOf(driver);
    const out = new Float32Array(samples.length);
    let on = false;

    for (let pass = 0; pass < 2; pass++) {
        for (let index = 0; index < samples.length; index++) {
            const value = samples[index] ?? 0;
            on = on ? value >= threshold - band / 2 : value >= threshold + band / 2;
            out[index] = on !== below ? 1 : 0;
        }
    }

    return { samples: out };
};

const HIT = 0.1;
const PULSE = 1 / 64;

export const soundBits = (loudness: Driver, choice: string): Curve => {
    const samples = samplesOf(loudness);
    const width = Math.max(1, Math.round(samples.length * PULSE));
    const rises = Array.from(
        samples,
        (value, index) =>
            value - (samples[(index + samples.length - 1) % samples.length] ?? 0) > HIT,
    );

    return choice === 'hit'
        ? asBits(
              index =>
                  Array.from({ length: width }, (_, back) => back).some(
                      back => rises[(index - back + samples.length) % samples.length] === true,
                  ),
              samples.length,
          )
        : asBits(index => (samples[index] ?? 0) >= 0.05, samples.length);
};

export const timerBit = ({ phase, running }: FocusView, choice: string): number =>
    choice === 'running' ? Number(running) : Number(phase === 'work');

export const tasksBit = (tickets: Tickets, choice: string): number =>
    choice === 'active'
        ? Number(doneLevel(tickets, 'active') > 0)
        : Number(
              tickets.statuses.some(({ tickets: list }) => list.length > 0) &&
                  doneLevel(tickets, 'left') === 0,
          );

export const bitShaped = (driver: Driver, bits: BitShape): Driver => {
    if (!bits.invert && bits.hold === 0) {
        return driver;
    }

    const samples = samplesOf(driver);
    const span = Math.round(bits.hold * samples.length);
    const held = Array.from(samples, (_, index) =>
        Array.from({ length: span + 1 }, (_unused, back) => back).some(
            back => (samples[(index - back + samples.length) % samples.length] ?? 0) >= 0.5,
        ),
    );

    return asBits(index => held[index] !== bits.invert, samples.length);
};

export const clockLevel = ({ at, ticks }: Clock, choice: string): number =>
    choice === 'tick' ? Math.floor(at * ticks) / ticks : at;

export const clockBit = ({ at, ticks, playing, held }: Clock, choice: string): number =>
    choice === 'beat' ? Number((at * ticks) % 1 < 0.5) : Number(playing && !held);

export const zoneCurve = (ahead: number, choice: string): Curve =>
    curveOf(t => {
        const hour = ((((t * DAY_MINUTES + ahead) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES) / 60;

        switch (choice) {
            case 'daylight':
                return Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12));
            case 'day':
                return Number(hour >= 7 && hour < 19);
            case 'office':
                return Number(hour >= 9 && hour < 17);
            default:
                return hour / 24;
        }
    });

const chosen = ({ items }: Habits, item: string | null) =>
    item === null ? items : items.filter(({ id }) => id === item);

export const habitsLevel = (
    habits: Habits,
    item: string | null,
    today: string,
    choice: string,
): number => {
    const picked = chosen(habits, item);

    if (picked.length === 0) {
        return 0;
    }

    return choice === 'streak'
        ? Math.min(...picked.map(({ done }) => streakOf(done, today)))
        : picked.filter(({ done }) => done.includes(today)).length / picked.length;
};

export const habitsBit = (habits: Habits, item: string | null, today: string): number => {
    const picked = chosen(habits, item);

    return Number(picked.length > 0 && picked.every(({ done }) => done.includes(today)));
};
