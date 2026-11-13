import { currentBlock, DAY_MINUTES, nextBlock, type Agenda } from './components/agenda/agenda.ts';
import type { PortType } from './port-types.ts';
import { curveOf, type Curve } from './shared/curve.ts';

export const CONVERTER_KINDS = ['timing', 'envelope'] as const;
export type ConverterKind = (typeof CONVERTER_KINDS)[number];

export const isConverterKind = (value: string): value is ConverterKind =>
    CONVERTER_KINDS.some(kind => kind === value);

export type ConverterChoice = { readonly id: string; readonly title: string };

export type ConverterSpec = {
    readonly title: string;
    readonly summary: string;
    readonly icon: string;
    readonly takes: PortType;
    readonly makes: PortType;
    readonly choices: readonly ConverterChoice[];
    readonly size: { readonly width: number; readonly height: number };
};

export const CONVERTERS = {
    timing: {
        title: 'Timing',
        summary:
            'Your agenda as a level over today: 1 in a block, rising through one, or rising as the next one nears.',
        icon: 'M4 6 H20 V18 H4 Z M8 6 V18 M4 12 H8 M12 15 L15 10 L18 15',
        takes: 'schedule',
        makes: 'level',
        choices: [
            { id: 'in', title: 'in a block' },
            { id: 'through', title: 'through a block' },
            { id: 'before', title: 'before a block' },
        ],
        size: { width: 280, height: 220 },
    },
    envelope: {
        title: 'Envelope',
        summary:
            'A voice or drum machine as a level: how loud it is as it plays, or the note a voice is on, in octaves above its root.',
        icon: 'M3 18 L7 6 L10 13 L13 9 L21 18 M3 18 H21',
        takes: 'sound',
        makes: 'level',
        choices: [
            { id: 'loudness', title: 'loudness' },
            { id: 'pitch', title: 'pitch' },
        ],
        size: { width: 280, height: 220 },
    },
} as const satisfies Record<ConverterKind, ConverterSpec>;

export const CONVERTER_PARAMS = ['in', 'time'] as const;
export type ConverterParam = (typeof CONVERTER_PARAMS)[number];
export const isConverterParam = (value: string): value is ConverterParam =>
    CONVERTER_PARAMS.some(param => param === value);

export type Converter = {
    readonly kind: ConverterKind;
    readonly choice: string;
    readonly sources: Readonly<Record<ConverterParam, string | null>>;
};

const made = (kind: ConverterKind): Converter => ({
    kind,
    choice: CONVERTERS[kind].choices[0].id,
    sources: { in: null, time: null },
});

// One object per kind: a fresh default on every read would look like an edit downstream.
export const CONVERTER_DEFAULTS: Readonly<Record<ConverterKind, Converter>> = {
    timing: made('timing'),
    envelope: made('envelope'),
};

export type ConverterCommand =
    | { readonly kind: 'choose'; readonly choice: string }
    | { readonly kind: 'source'; readonly param: ConverterParam; readonly source: string | null };

const choosable = (kind: ConverterKind, choice: string) =>
    CONVERTERS[kind].choices.some(({ id }) => id === choice);

export const reduceConverter = (converter: Converter, command: ConverterCommand): Converter => {
    switch (command.kind) {
        case 'choose':
            return choosable(converter.kind, command.choice) && command.choice !== converter.choice
                ? { ...converter, choice: command.choice }
                : converter;
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

export const parseConverter = (value: unknown): Converter | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const kind = field(value, 'kind');

    if (typeof kind !== 'string' || !isConverterKind(kind)) {
        return null;
    }

    const choice = field(value, 'choice');
    const sources = field(value, 'sources');
    const source = (param: ConverterParam) => {
        const id =
            typeof sources === 'object' && sources !== null ? field(sources, param) : undefined;

        return typeof id === 'string' ? id : null;
    };

    return {
        kind,
        choice:
            typeof choice === 'string' && choosable(kind, choice)
                ? choice
                : CONVERTER_DEFAULTS[kind].choice,
        sources: { in: source('in'), time: source('time') },
    };
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
