import { TIME } from './shared/signal.ts';

export const GATE_KINDS = [
    'nand',
    'delay',
    'switch',
    'pattern',
    'compare',
    'lamp',
    'pin-in',
    'pin-out',
] as const;
export type GateKind = (typeof GATE_KINDS)[number];

export const isGateKind = (value: string): value is GateKind =>
    GATE_KINDS.some(kind => kind === value);

export type Bit = 0 | 1;

export type GateSpec = {
    readonly title: string;
    readonly summary: string;
    readonly bits: readonly string[];
    readonly drives: readonly string[];
    readonly icon: string;
    readonly size: { readonly width: number; readonly height: number };
};

const LINE = { width: 184, height: 64 };
const TWO_LINES = { width: 208, height: 80 };

export const GATES = {
    nand: {
        title: 'NAND',
        summary: '0 only while both inputs are 1. Every other gate can be built from it.',
        bits: ['a', 'b'],
        drives: [],
        icon: 'M5 5h7a7 7 0 0 1 0 14H5zM19 12h2M21 12a1 1 0 1 1 0 0.01',
        size: LINE,
    },
    delay: {
        title: 'Delay',
        summary: 'What its input was one tick ago: the one way a cable may come back round.',
        bits: ['in'],
        drives: [],
        icon: 'M4 12h4l2-5 4 10 2-5h4',
        size: LINE,
    },
    switch: {
        title: 'Switch',
        summary: 'A bit you set by hand.',
        bits: [],
        drives: [],
        icon: 'M4 12a4 4 0 0 1 4-4h8a4 4 0 0 1 0 8H8a4 4 0 0 1-4-4zM16 12a1 1 0 1 1 0 0.01',
        size: LINE,
    },
    pattern: {
        title: 'Pattern',
        summary: 'A row of steps played across the loop, one bit per step.',
        bits: [],
        drives: [],
        icon: 'M4 8h3v8H4zM10.5 8h3v8h-3zM17 8h3v8h-3z',
        size: { width: 208, height: 64 },
    },
    compare: {
        title: 'Compare',
        summary: 'A signal turned into a bit: 1 while it is at or above the threshold.',
        bits: [],
        drives: ['in'],
        icon: 'M4 16l5-8 4 6 3-4 4 6M4 11h16',
        size: { width: 224, height: 80 },
    },
    lamp: {
        title: 'Lamp',
        summary: 'Lights while its input is 1, and passes the bit on.',
        bits: ['in'],
        drives: [],
        icon: 'M12 4a6 6 0 0 1 3 11v3H9v-3a6 6 0 0 1 3-11zM10 21h4',
        size: LINE,
    },
    'pin-in': {
        title: 'Pin in',
        summary:
            'An input of the component it is boxed into: the bit plugged into it from outside.',
        bits: ['in'],
        drives: [],
        icon: 'M3 12h10M9 8l4 4-4 4M15 5h4v14h-4',
        size: TWO_LINES,
    },
    'pin-out': {
        title: 'Pin out',
        summary: 'An output of the component it is boxed into.',
        bits: ['in'],
        drives: [],
        icon: 'M5 5h4v14H5M11 12h10M17 8l4 4-4 4',
        size: TWO_LINES,
    },
} satisfies Record<GateKind, GateSpec>;

export const MIN_STEPS = 2;
export const MAX_STEPS = 32;

export type Gate = {
    readonly kind: GateKind;
    readonly name: string;
    readonly value: Bit;
    readonly steps: readonly Bit[];
    readonly threshold: number;
    readonly sources: Readonly<Record<string, string | null>>;
};

export const paramsOf = (kind: GateKind): readonly string[] => [
    ...GATES[kind].bits,
    ...GATES[kind].drives,
    TIME,
];

const made = (kind: GateKind): Gate => ({
    kind,
    name: kind === 'pin-in' ? 'in' : kind === 'pin-out' ? 'out' : '',
    value: 0,
    steps: [1, 0, 0, 0, 1, 0, 0, 0],
    threshold: 0.5,
    sources: Object.fromEntries(paramsOf(kind).map(param => [param, null])),
});

export const GATE_DEFAULTS: Readonly<Record<GateKind, Gate>> = {
    nand: made('nand'),
    delay: made('delay'),
    switch: made('switch'),
    pattern: made('pattern'),
    compare: made('compare'),
    lamp: made('lamp'),
    'pin-in': made('pin-in'),
    'pin-out': made('pin-out'),
};

const entry = (record: object, key: string): unknown =>
    Object.entries(record).find(([name]) => name === key)?.[1];

export const sourceOfGate = (gate: Gate, param: string): string | null => {
    const source = entry(gate.sources, param);

    return typeof source === 'string' ? source : null;
};

export type GateCommand =
    | { readonly kind: 'toggle' }
    | { readonly kind: 'step'; readonly index: number; readonly value: Bit }
    | { readonly kind: 'steps'; readonly count: number }
    | { readonly kind: 'threshold'; readonly threshold: number }
    | { readonly kind: 'rename'; readonly name: string }
    | { readonly kind: 'source'; readonly param: string; readonly source: string | null };

const clampedCount = (count: number) => Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.round(count)));

export const reduceGate = (gate: Gate, command: GateCommand): Gate => {
    switch (command.kind) {
        case 'toggle':
            return gate.kind === 'switch' ? { ...gate, value: gate.value === 1 ? 0 : 1 } : gate;
        case 'step':
            return command.index < 0 ||
                command.index >= gate.steps.length ||
                gate.steps[command.index] === command.value
                ? gate
                : {
                      ...gate,
                      steps: gate.steps.map((bit, index) =>
                          index === command.index ? command.value : bit,
                      ),
                  };
        case 'steps': {
            const count = clampedCount(command.count);

            return !Number.isFinite(command.count) || count === gate.steps.length
                ? gate
                : {
                      ...gate,
                      steps: Array.from({ length: count }, (_, index) => gate.steps[index] ?? 0),
                  };
        }
        case 'threshold':
            return Number.isFinite(command.threshold) && command.threshold !== gate.threshold
                ? { ...gate, threshold: command.threshold }
                : gate;
        case 'rename': {
            const name = command.name.trim().slice(0, 24);

            return name === gate.name ? gate : { ...gate, name };
        }
        case 'source':
            return !paramsOf(gate.kind).includes(command.param) ||
                sourceOfGate(gate, command.param) === command.source
                ? gate
                : { ...gate, sources: { ...gate.sources, [command.param]: command.source } };
    }
};

const bitOf = (value: unknown): Bit => (value === 1 ? 1 : 0);

export const parseGate = (value: unknown): Gate | null => {
    const stored = typeof value === 'object' && value !== null ? entry(value, 'kind') : undefined;
    const kind = stored === 'const' ? 'switch' : stored;

    if (
        typeof value !== 'object' ||
        value === null ||
        typeof kind !== 'string' ||
        !isGateKind(kind)
    ) {
        return null;
    }

    const empty = GATE_DEFAULTS[kind];
    const name = entry(value, 'name');
    const steps = entry(value, 'steps');
    const threshold = entry(value, 'threshold');
    const sources = entry(value, 'sources');

    return {
        kind,
        name: typeof name === 'string' ? name.slice(0, 24) : empty.name,
        value: bitOf(entry(value, 'value')),
        steps:
            Array.isArray(steps) && steps.length >= MIN_STEPS && steps.length <= MAX_STEPS
                ? steps.map(bitOf)
                : empty.steps,
        threshold:
            typeof threshold === 'number' && Number.isFinite(threshold)
                ? threshold
                : empty.threshold,
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

export const readsTickBefore = (program: string): boolean => program === 'delay';

export const loopEdges = (gate: Gate): Gate =>
    gate.kind === 'delay' ? { ...gate, sources: {} } : gate;
