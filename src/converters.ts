import { currentBlock, DAY_MINUTES, nextBlock, type Agenda } from './components/agenda/agenda.ts';
import { DRUM_LABELS, DRUMS } from './components/drums/drums.ts';
import type { FocusView } from './components/focus/focus.ts';
import type { PortType } from './port-types.ts';
import type { Stage, Tickets } from './shared/tickets.ts';
import { curveOf, type Curve } from './shared/curve.ts';

export const CONVERTER_KINDS = ['timing', 'envelope', 'kit', 'phase', 'done'] as const;
export type ConverterKind = (typeof CONVERTER_KINDS)[number];

export const isConverterKind = (value: string): value is ConverterKind =>
    CONVERTER_KINDS.some(kind => kind === value);

export type ConverterChoice = { readonly id: string; readonly title: string };

export type ConverterSpec = {
    readonly title: string;
    readonly summary: string;
    readonly icon: string;
    readonly takes: PortType;
    readonly reads: readonly string[] | null;
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
        reads: null,
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
        reads: null,
        makes: 'level',
        choices: [
            { id: 'loudness', title: 'loudness' },
            { id: 'pitch', title: 'pitch' },
        ],
        size: { width: 280, height: 220 },
    },
    kit: {
        title: 'Kit',
        summary:
            "One drum of a drum machine as a level: up at each of its hits, falling away as it decays, at the hit's own velocity.",
        icon: 'M5 9 A7 3 0 0 0 19 9 A7 3 0 0 0 5 9 Z M5 9 V15 A7 3 0 0 0 19 15 V9 M3 4 L9 8 M21 4 L15 8',
        takes: 'sound',
        reads: ['drums'],
        makes: 'level',
        choices: DRUMS.map(drum => ({ id: drum, title: DRUM_LABELS[drum] })),
        size: { width: 300, height: 240 },
    },
    phase: {
        title: 'Phase',
        summary:
            'A focus timer as a level, as it stands now: how far through its phase or block, how much is left, or whether you are focusing.',
        icon: 'M12 4 A8 8 0 1 0 20 12 M12 4 V12 L17 15',
        takes: 'timer',
        reads: null,
        makes: 'level',
        choices: [
            { id: 'through', title: 'through' },
            { id: 'left', title: 'left' },
            { id: 'focusing', title: 'focusing' },
        ],
        size: { width: 280, height: 220 },
    },
    done: {
        title: 'Done',
        summary:
            'A ticket list as a level, as it stands now: the share of its tickets that are done, in progress, or not done yet.',
        icon: 'M4 6 H20 M4 12 H20 M4 18 H12 M15 17 L17 19 L21 15',
        takes: 'tasks',
        reads: null,
        makes: 'level',
        choices: [
            { id: 'done', title: 'done' },
            { id: 'active', title: 'in progress' },
            { id: 'left', title: 'left' },
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
    choice: CONVERTERS[kind].choices[0]?.id ?? '',
    sources: { in: null, time: null },
});

// One object per kind: a fresh default on every read would look like an edit downstream.
export const CONVERTER_DEFAULTS: Readonly<Record<ConverterKind, Converter>> = {
    timing: made('timing'),
    envelope: made('envelope'),
    kit: made('kit'),
    phase: made('phase'),
    done: made('done'),
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
