import { combineLatest, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Agenda } from './components/agenda/agenda.ts';
import type { Focus, Plan } from './components/focus/focus.ts';
import type { Reading } from './components/progress-bar/progress-bar.ts';
import type { Tickets } from './shared/tickets.ts';
import { dayOf, minuteOfDay } from './lib/day.ts';
import type { ProgramId } from './program.ts';
import { PEDALS, type PedalKind } from './pedals.ts';
import { GATES, type GateKind } from './gates.ts';
import { CONVERTERS, converterTitle, type ConverterKind } from './converters.ts';
import { agendaReading, focusReading, ticketsReading } from './readings.ts';
import type { PortType } from './port-types.ts';
import type { StoreId } from './stores.ts';

export type PlaybackBinding = { readonly kind: 'playback'; readonly store: StoreId };
export type FocusBinding = { readonly kind: 'focus'; readonly store: StoreId };
export type AgendaBinding = { readonly kind: 'agenda'; readonly store: StoreId };
export type TicketsBinding = { readonly kind: 'tickets'; readonly store: StoreId };
export type SignalBinding = { readonly kind: 'signal'; readonly store: StoreId };
export type PaintBinding = { readonly kind: 'paint'; readonly store: StoreId };
export type PenBinding = { readonly kind: 'pen'; readonly store: StoreId };
export type VoiceBinding = { readonly kind: 'voice'; readonly store: StoreId };
export type DrumsBinding = { readonly kind: 'drums'; readonly store: StoreId };
export type SketchBinding = { readonly kind: 'sketch'; readonly store: StoreId };
export type PedalBinding = { readonly kind: PedalKind; readonly store: StoreId };
export type GateBinding = { readonly kind: GateKind; readonly store: StoreId };
export type ConverterBinding = { readonly kind: ConverterKind; readonly store: StoreId };
export type Follow =
    | PlaybackBinding
    | FocusBinding
    | AgendaBinding
    | TicketsBinding
    | SignalBinding
    | PaintBinding
    | PenBinding
    | VoiceBinding
    | DrumsBinding
    | SketchBinding
    | PedalBinding
    | GateBinding
    | ConverterBinding;

export type InputSources = {
    readonly focus$: (store: StoreId) => Observable<Focus>;
    readonly plan$: (store: StoreId) => Observable<Plan | null>;
    readonly agenda$: (store: StoreId) => Observable<Agenda>;
    readonly tickets$: (store: StoreId) => Observable<Tickets>;
    readonly now$: Observable<number>;
};

const playbackSource = {
    kind: 'playback',
    makes: 'clock',
    program: 'timeline',
    title: 'Playback',
    access: 'scrub',
} as const;

const focusSource = {
    kind: 'focus',
    makes: 'timer',
    program: 'focus',
    title: 'Focus',
    access: 'read',
    read: (store: StoreId, sources: InputSources): Observable<Reading> =>
        combineLatest([sources.focus$(store), sources.plan$(store)]).pipe(
            map(([focus, plan]) => focusReading(focus, plan)),
        ),
} as const;

const agendaSource = {
    kind: 'agenda',
    makes: 'schedule',
    program: 'agenda',
    title: 'Agenda',
    access: 'read',
    read: (store: StoreId, sources: InputSources): Observable<Reading> =>
        combineLatest([sources.agenda$(store), sources.now$]).pipe(
            map(([agenda, now]) => agendaReading(agenda, dayOf(now), minuteOfDay(now))),
        ),
} as const;

const ticketsSource = {
    kind: 'tickets',
    makes: 'tasks',
    program: 'tickets',
    title: 'Tickets',
    access: 'read',
    read: (store: StoreId, sources: InputSources): Observable<Reading> =>
        sources.tickets$(store).pipe(map(ticketsReading)),
} as const;

const signalSource = {
    kind: 'signal',
    makes: 'level',
    program: 'signal',
    title: 'Signal',
    access: 'read',
} as const;

const paintSource = {
    kind: 'paint',
    makes: 'sheet',
    program: 'paint',
    title: 'Painting',
    access: 'read',
} as const;

const penSource = {
    kind: 'pen',
    makes: 'sheet',
    program: 'pen',
    title: 'Pen',
    access: 'read',
} as const;

const voiceSource = {
    kind: 'voice',
    makes: 'sound',
    program: 'voice',
    title: 'Voice',
    access: 'read',
} as const;

const drumsSource = {
    kind: 'drums',
    makes: 'sound',
    program: 'drums',
    title: 'Drums',
    access: 'read',
} as const;

const sketchSource = {
    kind: 'sketch',
    makes: 'picture',
    program: 'sketch',
    title: 'Sketch',
    access: 'read',
} as const;

const pedalSource = <K extends PedalKind>(kind: K) =>
    ({ kind, makes: 'picture', program: kind, title: PEDALS[kind].title, access: 'read' }) as const;

export const IMAGE_SOURCES = [
    sketchSource,
    pedalSource('colourmap'),
    pedalSource('kaleido'),
    pedalSource('feedback'),
    pedalSource('mix'),
    pedalSource('blur'),
] as const;

export const isImageKind = (kind: string): boolean =>
    IMAGE_SOURCES.some(source => source.kind === kind);

const gateSource = <K extends GateKind>(kind: K) =>
    ({ kind, makes: 'bit', program: kind, title: GATES[kind].title, access: 'read' }) as const;

export const GATE_SOURCES = [
    gateSource('nand'),
    gateSource('delay'),
    gateSource('switch'),
    gateSource('pattern'),
    gateSource('compare'),
    gateSource('lamp'),
    gateSource('pin-in'),
    gateSource('pin-out'),
] as const;

const converterSource = <K extends ConverterKind>(kind: K) =>
    ({
        kind,
        makes: CONVERTERS[kind].makes,
        program: kind,
        title: converterTitle(kind),
        access: 'read',
    }) as const;

export const CONVERTER_SOURCES = [
    converterSource('schedule-level'),
    converterSource('sound-level'),
    converterSource('timer-level'),
    converterSource('tasks-level'),
    converterSource('level-level'),
    converterSource('level-bit'),
    converterSource('schedule-bit'),
    converterSource('timer-bit'),
    converterSource('tasks-bit'),
    converterSource('sound-bit'),
] as const;

export const SOURCES = [
    playbackSource,
    focusSource,
    agendaSource,
    ticketsSource,
    signalSource,
    paintSource,
    penSource,
    voiceSource,
    drumsSource,
    ...IMAGE_SOURCES,
    ...GATE_SOURCES,
    ...CONVERTER_SOURCES,
] as const;

type Source = (typeof SOURCES)[number];

const OWN_TYPES = {
    clocks: 'zones',
    note: 'notes',
    habits: 'habits',
    bookmarks: 'bookmarks',
    formula: 'formula',
    theme: 'theme',
    box: 'component',
} as const satisfies Partial<Record<ProgramId, PortType>>;

export const madeBy = (program: ProgramId): PortType | null =>
    SOURCES.find(source => source.program === program)?.makes ??
    Object.entries(OWN_TYPES).find(([id]) => id === program)?.[1] ??
    null;

export type FollowedInput = {
    readonly title: string;
    readonly takes: PortType;
    readonly from: 'followed';
    readonly group: string | null;
    readonly sources: readonly Source[];
    readonly initial: Follow | null;
};

export type OwnInput = {
    readonly title: string;
    readonly takes: PortType;
    readonly from: 'own';
    readonly kind: 'playback';
};

export type StoreInput = {
    readonly title: string;
    readonly takes: PortType;
    readonly from: 'store';
    readonly param: string;
    readonly group: string | null;
    readonly sources: readonly Source[];
    readonly initial: null;
};

export type InputDefinition = FollowedInput | OwnInput | StoreInput;
export type ProgramInputs = { readonly [name: string]: InputDefinition };
export type InputsFor = (program: ProgramId) => ProgramInputs;

export const playbackInput = {
    title: 'Playback',
    takes: 'clock',
    from: 'followed',
    group: null,
    sources: [playbackSource],
    initial: { kind: 'playback', store: 'timeline' },
} as const satisfies FollowedInput;

export const loosePlaybackInput = {
    ...playbackInput,
    initial: null,
} as const satisfies FollowedInput;

export const progressInput = {
    title: 'Progress',
    takes: 'clock',
    from: 'followed',
    group: null,
    sources: [playbackSource],
    initial: { kind: 'playback', store: 'timeline' },
} as const satisfies FollowedInput;

export const sourceInput = {
    title: 'Source',
    takes: 'reading',
    from: 'followed',
    group: null,
    sources: [focusSource, agendaSource, ticketsSource],
    initial: { kind: 'focus', store: 'focus' },
} as const satisfies FollowedInput;

const signalInput = (title: string, group: string) =>
    ({
        title,
        takes: 'level',
        from: 'followed',
        group,
        sources: [signalSource],
        initial: null,
    }) as const satisfies FollowedInput;

const driveInput = (title: string, param: string, group: string) =>
    ({
        title,
        takes: 'level',
        from: 'store',
        param,
        group,
        sources: [signalSource, ...GATE_SOURCES, ...CONVERTER_SOURCES],
        initial: null,
    }) satisfies StoreInput;

// Not a bit: a compare's input is read while the circuit table is made, so a gate there would wait on itself.
const levelInput = (param: string) =>
    ({
        title: param,
        takes: 'level',
        from: 'store',
        param,
        group: null,
        sources: [signalSource, ...CONVERTER_SOURCES],
        initial: null,
    }) satisfies StoreInput;

const storedSignalInput = (param: string) =>
    ({
        title: param,
        takes: 'level',
        from: 'store',
        param,
        group: null,
        sources: [signalSource],
        initial: null,
    }) satisfies StoreInput;

export const timeInput = {
    title: 'read on',
    takes: 'clock',
    from: 'store',
    param: 'time',
    group: null,
    sources: [playbackSource],
    initial: null,
} satisfies StoreInput;

export const signalInputs = {
    phase: storedSignalInput('phase'),
    offset: storedSignalInput('offset'),
    depth: storedSignalInput('depth'),
    time: timeInput,
};

export const knobInputs = {
    k1: driveInput('k1', 'k1', 'Knobs'),
    k2: driveInput('k2', 'k2', 'Knobs'),
    k3: driveInput('k3', 'k3', 'Knobs'),
    k4: driveInput('k4', 'k4', 'Knobs'),
};

export const sceneInputs = {
    turn: driveInput('turn', 'turn', 'Camera'),
    pitch: driveInput('pitch', 'pitch', 'Camera'),
    distance: driveInput('distance', 'distance', 'Camera'),
    focus: driveInput('focus', 'focus', 'Look'),
    colour: driveInput('colour', 'colour', 'Look'),
    size: driveInput('dot size', 'size', 'Look'),
    depth: driveInput('depth', 'depth', 'Look'),
    trails: driveInput('trails', 'trails', 'Look'),
};

export const paintInput = {
    title: 'paint',
    takes: 'sheet',
    from: 'store',
    param: 'paint',
    group: null,
    sources: [paintSource, penSource],
    initial: null,
} satisfies StoreInput;

export const penInputs = {
    x: storedSignalInput('x'),
    y: storedSignalInput('y'),
    size: storedSignalInput('size'),
    ink: storedSignalInput('ink'),
};

export const voiceInputs = {
    pitch: storedSignalInput('pitch'),
    volume: storedSignalInput('volume'),
    filter: storedSignalInput('filter'),
    pan: storedSignalInput('pan'),
};

export const focusInputs = {
    agenda: {
        title: 'agenda',
        takes: 'schedule',
        from: 'store',
        param: 'agenda',
        group: null,
        sources: [agendaSource],
        initial: null,
    } satisfies StoreInput,
};

export const drumsInputs = {
    volume: storedSignalInput('volume'),
};

export const plotInputs = {
    a: signalInput('a', 'Signals'),
    b: signalInput('b', 'Signals'),
    c: signalInput('c', 'Signals'),
    d: signalInput('d', 'Signals'),
};

export const imageInput = (title: string) =>
    ({
        title,
        takes: 'picture',
        from: 'followed',
        group: null,
        sources: IMAGE_SOURCES,
        initial: null,
    }) as const satisfies FollowedInput;

const imageStoreInput = (param: string) =>
    ({
        title: param,
        takes: 'picture',
        from: 'store',
        param,
        group: null,
        sources: IMAGE_SOURCES,
        initial: null,
    }) satisfies StoreInput;

export const pedalInputs = (kind: PedalKind): Readonly<Record<string, StoreInput>> => {
    const entries: readonly (readonly [string, StoreInput])[] = [
        ...PEDALS[kind].inputs.map(input => [input, imageStoreInput(input)] as const),
        ...PEDALS[kind].knobs.map(({ name }) => [name, driveInput(name, name, 'Knobs')] as const),
    ];

    return Object.fromEntries(entries);
};

const bitInput = (param: string) =>
    ({
        title: param,
        takes: 'bit',
        from: 'store',
        param,
        group: null,
        sources: [...GATE_SOURCES, ...CONVERTER_SOURCES.filter(({ makes }) => makes === 'bit')],
        initial: null,
    }) satisfies StoreInput;

export const gateInputs = (kind: GateKind): Readonly<Record<string, StoreInput>> => {
    const entries: readonly (readonly [string, StoreInput])[] = [
        ...GATES[kind].bits.map(param => [param, bitInput(param)] as const),
        ...GATES[kind].drives.map(param => [param, levelInput(param)] as const),
        ['time', timeInput] as const,
    ];

    return Object.fromEntries(entries);
};

export const converterInputs = (kind: ConverterKind): Readonly<Record<string, StoreInput>> => ({
    in: {
        title: 'in',
        takes: CONVERTERS[kind].takes,
        from: 'store',
        param: 'in',
        group: null,
        // Its exact type, no implicit conversion: no converter may reach a gate, or the circuit table that reads converter bits would wait on itself.
        sources: SOURCES.filter(({ makes }) => makes === CONVERTERS[kind].takes),
        initial: null,
    },
    time: timeInput,
});

export const ownPlaybackInput = {
    title: 'Playback',
    takes: 'clock',
    from: 'own',
    kind: 'playback',
} as const satisfies OwnInput;

type BindingOf<D> = D extends {
    readonly from: 'followed';
    readonly sources: readonly { readonly kind: infer K }[];
}
    ? Extract<Follow, { readonly kind: K }>
    : never;

type Flat<T> = { [K in keyof T]: T[K] };

export type BindingsOf<I> = Flat<
    {
        readonly [N in keyof I as I[N] extends { readonly initial: Follow } ? N : never]: BindingOf<
            I[N]
        >;
    } & {
        readonly [
            N in keyof I as I[N] extends { readonly from: 'followed'; readonly initial: null }
                ? N
                : never
        ]?: BindingOf<I[N]>;
    }
>;

export type Bindings = { readonly [input: string]: Follow };

// Not inputs[name]: a name read from storage could be "constructor", which every object has.
export const definitionOf = (inputs: ProgramInputs, name: string) =>
    Object.entries(inputs).find(([key]) => key === name)?.[1];

export const storeInputOf = (inputs: ProgramInputs, param: string) =>
    Object.values(inputs).find(
        (definition): definition is StoreInput =>
            definition.from === 'store' && definition.param === param,
    );

export const followedBy = (follows: Bindings, name: string) =>
    Object.entries(follows).find(([key]) => key === name)?.[1] ?? null;

export const initialFollows = (inputs: ProgramInputs) =>
    Object.fromEntries(
        Object.entries(inputs).flatMap(([name, definition]) =>
            definition.from === 'followed' && definition.initial !== null
                ? [[name, definition.initial] as const]
                : [],
        ),
    );

export const accepts = (inputs: ProgramInputs, name: string, kind: Follow['kind']) => {
    const definition = definitionOf(inputs, name);

    return (
        definition?.from === 'followed' && definition.sources.some(source => source.kind === kind)
    );
};

export const fits = (inputs: ProgramInputs, follows: Bindings) =>
    Object.entries(follows).every(([name, binding]) => accepts(inputs, name, binding.kind)) &&
    Object.entries(inputs).every(
        ([name, definition]) =>
            definition.from === 'own' ||
            definition.initial === null ||
            followedBy(follows, name) !== null,
    );

export const sourceProgram = (kind: Follow['kind']) => {
    switch (kind) {
        case 'playback':
            return playbackSource.program;
        case 'focus':
            return focusSource.program;
        case 'agenda':
            return agendaSource.program;
        case 'tickets':
            return ticketsSource.program;
        case 'signal':
            return signalSource.program;
        case 'paint':
            return paintSource.program;
        case 'pen':
            return penSource.program;
        case 'voice':
            return voiceSource.program;
        case 'drums':
            return drumsSource.program;
        case 'sketch':
            return sketchSource.program;
        case 'colourmap':
        case 'kaleido':
        case 'feedback':
        case 'mix':
        case 'blur':
            return kind;
        case 'nand':
        case 'delay':
        case 'switch':
        case 'pattern':
        case 'compare':
        case 'lamp':
        case 'pin-in':
        case 'pin-out':
        case 'schedule-level':
        case 'sound-level':
        case 'timer-level':
        case 'tasks-level':
        case 'level-level':
        case 'level-bit':
        case 'schedule-bit':
        case 'timer-bit':
        case 'tasks-bit':
        case 'sound-bit':
            return kind;
    }
};

export const progressBinding = (kind: string, store: StoreId) => {
    switch (kind) {
        case 'playback':
            return { kind, store };
        case 'focus':
            return { kind, store };
        case 'agenda':
            return { kind, store };
        case 'tickets':
            return { kind, store };
        case 'todo':
            return { kind: 'tickets' as const, store };
        case 'const':
            return { kind: 'switch' as const, store };
        case 'signal':
            return { kind, store };
        case 'paint':
            return { kind, store };
        case 'pen':
            return { kind, store };
        case 'voice':
            return { kind, store };
        case 'drums':
            return { kind, store };
        case 'sketch':
            return { kind, store };
        case 'colourmap':
        case 'kaleido':
        case 'feedback':
        case 'mix':
        case 'blur':
            return { kind, store };
        case 'nand':
        case 'delay':
        case 'switch':
        case 'pattern':
        case 'compare':
        case 'lamp':
        case 'pin-in':
        case 'pin-out':
        case 'schedule-level':
        case 'sound-level':
        case 'timer-level':
        case 'tasks-level':
        case 'level-level':
        case 'level-bit':
        case 'schedule-bit':
        case 'timer-bit':
        case 'tasks-bit':
        case 'sound-bit':
            return { kind, store };
        default:
            return null;
    }
};

export const followedStores = (follows: Bindings) =>
    Object.values(follows).map(({ store }) => store);

export const playbackBinding = (inputs: ProgramInputs, store: StoreId, follows: Bindings) => {
    if (Object.values(inputs).some(definition => definition.from === 'own')) {
        return { kind: 'playback' as const, store };
    }

    const scrubbed = Object.entries(follows).find(([name, binding]) => {
        const definition = definitionOf(inputs, name);

        return (
            definition?.from === 'followed' &&
            definition.sources.some(
                source => source.kind === binding.kind && source.access === 'scrub',
            )
        );
    })?.[1];

    return scrubbed?.kind === 'playback' ? scrubbed : null;
};

export const readingOf = (binding: Follow, sources: InputSources): Observable<Reading> | null => {
    switch (binding.kind) {
        case 'focus':
            return focusSource.read(binding.store, sources);
        case 'agenda':
            return agendaSource.read(binding.store, sources);
        case 'tickets':
            return ticketsSource.read(binding.store, sources);
        default:
            return null;
    }
};
