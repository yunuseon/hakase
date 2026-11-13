import { currentBlock, DAY_MINUTES, nextBlock, type Agenda } from './components/agenda/agenda.ts';
import { DRUM_LABELS, DRUMS } from './components/drums/drums.ts';
import type { FocusView } from './components/focus/focus.ts';
import { clamp } from './lib/math.ts';
import type { PortType } from './port-types.ts';
import { curveOf, driverAt, type Curve, type Driver } from './shared/curve.ts';
import type { Stage, Tickets } from './shared/tickets.ts';

export const CONVERTER_KINDS = [
    'schedule-level',
    'sound-level',
    'timer-level',
    'tasks-level',
    'level-level',
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

export type Converter = {
    readonly kind: ConverterKind;
    readonly choice: string;
    readonly shape: Shape;
    readonly sources: Readonly<Record<ConverterParam, string | null>>;
};

const made = (kind: ConverterKind): Converter => ({
    kind,
    choice: CONVERTERS[kind].choices[0]?.id ?? '',
    shape: UNSHAPED,
    sources: { in: null, time: null },
});

// One object per kind: a fresh default on every read would look like an edit downstream.
export const CONVERTER_DEFAULTS: Readonly<Record<ConverterKind, Converter>> = {
    'schedule-level': made('schedule-level'),
    'sound-level': made('sound-level'),
    'timer-level': made('timer-level'),
    'tasks-level': made('tasks-level'),
    'level-level': made('level-level'),
};

export type Conversion = { readonly converter: Converter; readonly driver: Driver | null };

export type ConverterCommand =
    | { readonly kind: 'choose'; readonly choice: string }
    | { readonly kind: 'shape'; readonly field: ShapeField; readonly value: number }
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
    const sources = field(value, 'sources');
    const source = (param: ConverterParam) => {
        const id =
            typeof sources === 'object' && sources !== null ? field(sources, param) : undefined;

        return typeof id === 'string' ? id : null;
    };
    const shape = shapeFrom(field(value, 'shape'));

    return {
        kind,
        choice:
            typeof choice === 'string' && choosable(kind, choice)
                ? choice
                : CONVERTER_DEFAULTS[kind].choice,
        shape: sameShape(shape, UNSHAPED) ? UNSHAPED : shape,
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
