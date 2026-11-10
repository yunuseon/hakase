import { themes } from './components/sketch/themes/registry.ts';

export const PEDAL_KINDS = ['colourmap', 'kaleido', 'feedback', 'mix', 'blur'] as const;
export type PedalKind = (typeof PEDAL_KINDS)[number];

export const isPedalKind = (value: string): value is PedalKind =>
    PEDAL_KINDS.some(kind => kind === value);

export type KnobSpec = {
    readonly name: string;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly initial: number;
};

export type PedalSpec = {
    readonly title: string;
    readonly summary: string;
    readonly inputs: readonly string[];
    readonly knobs: readonly KnobSpec[];
    readonly choices: readonly string[];
    readonly icon: string;
};

const knob = (name: string, min: number, max: number, initial: number, step = 0.01): KnobSpec => ({
    name,
    min,
    max,
    step,
    initial,
});

export const MIX_MODES = ['over', 'add', 'screen', 'multiply', 'difference'] as const;

// The index of a choice is what its shader reads, so the order of each list is load-bearing.
export const PEDALS = {
    colourmap: {
        title: 'Colour map',
        summary: 'Repaints the picture through a theme: its brightness picks the colour.',
        inputs: ['in'],
        knobs: [knob('amount', 0, 1, 1), knob('offset', -1, 1, 0)],
        choices: Object.keys(themes),
        icon: 'M4 18a8 8 0 0 1 16 0M7 18a5 5 0 0 1 10 0M10 18a2 2 0 0 1 4 0',
    },
    kaleido: {
        title: 'Kaleidoscope',
        summary: 'Folds the picture into mirrored slices around a centre.',
        inputs: ['in'],
        knobs: [
            knob('segments', 2, 12, 6, 1),
            knob('rotate', 0, 1, 0),
            knob('x', -1, 1, 0),
            knob('y', -1, 1, 0),
        ],
        choices: ['mirror', 'turn'],
        icon: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9',
    },
    feedback: {
        title: 'Feedback',
        summary: 'Lays the picture over its own last frame, zoomed, turned and fading.',
        inputs: ['in'],
        knobs: [
            knob('decay', 0, 0.99, 0.9),
            knob('zoom', 0.9, 1.1, 1.02, 0.001),
            knob('rotate', -0.1, 0.1, 0.01, 0.001),
            knob('x', -0.05, 0.05, 0, 0.001),
            knob('y', -0.05, 0.05, 0, 0.001),
        ],
        choices: [],
        icon: 'M12 4a8 8 0 1 0 8 8M12 8a4 4 0 1 0 4 4M20 4v4h-4',
    },
    mix: {
        title: 'Mix',
        summary: 'Blends two pictures, the second over the first.',
        inputs: ['a', 'b'],
        knobs: [knob('amount', 0, 1, 0.5)],
        choices: MIX_MODES,
        icon: 'M9 12a5 5 0 1 0 0 0.01M15 12a5 5 0 1 0 0 0.01',
    },
    blur: {
        title: 'Blur',
        summary: 'Softens the picture.',
        inputs: ['in'],
        knobs: [knob('radius', 0, 1, 0.2)],
        choices: [],
        icon: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
    },
} satisfies Record<PedalKind, PedalSpec>;

export type Pedal = {
    readonly kind: PedalKind;
    readonly values: Readonly<Record<string, number>>;
    readonly choice: string;
    readonly sources: Readonly<Record<string, string | null>>;
};

export const paramsOf = (kind: PedalKind): readonly string[] => [
    ...PEDALS[kind].inputs,
    ...PEDALS[kind].knobs.map(({ name }) => name),
];

export const defaultPedal = (kind: PedalKind): Pedal => ({
    kind,
    values: Object.fromEntries(PEDALS[kind].knobs.map(({ name, initial }) => [name, initial])),
    choice: PEDALS[kind].choices[0] ?? '',
    sources: Object.fromEntries(paramsOf(kind).map(param => [param, null])),
});

// Read by entry, never record[name]: a name from storage could be "constructor", which every object has.
const entry = (record: object, key: string): unknown =>
    Object.entries(record).find(([name]) => name === key)?.[1];

const specOf = (kind: PedalKind, name: string) =>
    PEDALS[kind].knobs.find(spec => spec.name === name);

const clamped = ({ min, max, step }: KnobSpec, value: number) => {
    const inside = Math.min(max, Math.max(min, value));

    return step >= 1 ? Math.round(inside) : inside;
};

export const valueOf = (pedal: Pedal, name: string): number => {
    const value = entry(pedal.values, name);
    const spec = specOf(pedal.kind, name);

    return typeof value === 'number' && spec !== undefined ? value : (spec?.initial ?? 0);
};

export const sourceOf = (pedal: Pedal, param: string): string | null => {
    const source = entry(pedal.sources, param);

    return typeof source === 'string' ? source : null;
};

export type PedalCommand =
    | { readonly kind: 'value'; readonly name: string; readonly value: number }
    | { readonly kind: 'choice'; readonly choice: string }
    | { readonly kind: 'source'; readonly param: string; readonly source: string | null };

export const reducePedal = (pedal: Pedal, command: PedalCommand): Pedal => {
    switch (command.kind) {
        case 'value': {
            const spec = specOf(pedal.kind, command.name);

            if (spec === undefined || !Number.isFinite(command.value)) {
                return pedal;
            }

            const value = clamped(spec, command.value);

            return value === valueOf(pedal, command.name)
                ? pedal
                : { ...pedal, values: { ...pedal.values, [command.name]: value } };
        }
        case 'choice':
            return command.choice === pedal.choice ||
                !PEDALS[pedal.kind].choices.some(choice => choice === command.choice)
                ? pedal
                : { ...pedal, choice: command.choice };
        case 'source':
            return !paramsOf(pedal.kind).includes(command.param) ||
                sourceOf(pedal, command.param) === command.source
                ? pedal
                : { ...pedal, sources: { ...pedal.sources, [command.param]: command.source } };
    }
};

export const parsePedal = (kind: PedalKind, value: unknown): Pedal => {
    const empty = defaultPedal(kind);

    if (typeof value !== 'object' || value === null) {
        return empty;
    }

    const values = entry(value, 'values');
    const choice = entry(value, 'choice');
    const sources = entry(value, 'sources');

    return {
        kind,
        values: Object.fromEntries(
            PEDALS[kind].knobs.map(spec => {
                const saved =
                    typeof values === 'object' && values !== null
                        ? entry(values, spec.name)
                        : undefined;

                return [
                    spec.name,
                    typeof saved === 'number' && Number.isFinite(saved)
                        ? clamped(spec, saved)
                        : spec.initial,
                ];
            }),
        ),
        choice:
            typeof choice === 'string' && PEDALS[kind].choices.some(option => option === choice)
                ? choice
                : empty.choice,
        sources: Object.fromEntries(
            paramsOf(kind).map(param => {
                const saved =
                    typeof sources === 'object' && sources !== null
                        ? entry(sources, param)
                        : undefined;

                return [param, typeof saved === 'string' ? saved : null];
            }),
        ),
    };
};

export const parseStoredPedal = (value: unknown): Pedal | null => {
    const kind = typeof value === 'object' && value !== null ? entry(value, 'kind') : undefined;

    return typeof kind === 'string' && isPedalKind(kind) ? parsePedal(kind, value) : null;
};
