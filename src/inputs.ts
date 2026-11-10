import { combineLatest, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Agenda } from './components/agenda/agenda.ts';
import type { Focus, Plan } from './components/focus/focus.ts';
import type { Reading } from './components/progress-bar/progress-bar.ts';
import type { Tickets } from './shared/tickets.ts';
import { dayOf, minuteOfDay } from './lib/day.ts';
import type { ProgramId } from './program.ts';
import { agendaReading, focusReading, ticketsReading } from './readings.ts';
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
export type Follow =
    | PlaybackBinding
    | FocusBinding
    | AgendaBinding
    | TicketsBinding
    | SignalBinding
    | PaintBinding
    | PenBinding
    | VoiceBinding
    | DrumsBinding;

export type InputSources = {
    readonly focus$: (store: StoreId) => Observable<Focus>;
    readonly plan$: (store: StoreId) => Observable<Plan | null>;
    readonly agenda$: (store: StoreId) => Observable<Agenda>;
    readonly tickets$: (store: StoreId) => Observable<Tickets>;
    readonly now$: Observable<number>;
};

const playbackSource = {
    kind: 'playback',
    program: 'timeline',
    title: 'Playback',
    access: 'scrub',
} as const;

const focusSource = {
    kind: 'focus',
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
    program: 'tickets',
    title: 'Tickets',
    access: 'read',
    read: (store: StoreId, sources: InputSources): Observable<Reading> =>
        sources.tickets$(store).pipe(map(ticketsReading)),
} as const;

const signalSource = {
    kind: 'signal',
    program: 'signal',
    title: 'Signal',
    access: 'read',
} as const;

const paintSource = {
    kind: 'paint',
    program: 'paint',
    title: 'Painting',
    access: 'read',
} as const;

const penSource = {
    kind: 'pen',
    program: 'pen',
    title: 'Pen',
    access: 'read',
} as const;

const voiceSource = {
    kind: 'voice',
    program: 'voice',
    title: 'Voice',
    access: 'read',
} as const;

const drumsSource = {
    kind: 'drums',
    program: 'drums',
    title: 'Drums',
    access: 'read',
} as const;

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
] as const;

type Source = (typeof SOURCES)[number];

export type FollowedInput = {
    readonly title: string;
    readonly from: 'followed';
    readonly group: string | null;
    readonly sources: readonly Source[];
    readonly initial: Follow | null;
};

export type OwnInput = { readonly title: string; readonly from: 'own'; readonly kind: 'playback' };

export type StoreInput = {
    readonly title: string;
    readonly from: 'store';
    readonly param: string;
    readonly sources: readonly Source[];
    readonly initial: null;
};

export type InputDefinition = FollowedInput | OwnInput | StoreInput;
export type ProgramInputs = { readonly [name: string]: InputDefinition };
export type InputsFor = (program: ProgramId) => ProgramInputs;

export const playbackInput = {
    title: 'Playback',
    from: 'followed',
    group: null,
    sources: [playbackSource],
    initial: { kind: 'playback', store: 'timeline' },
} as const satisfies FollowedInput;

export const progressInput = {
    title: 'Progress',
    from: 'followed',
    group: null,
    sources: [playbackSource],
    initial: { kind: 'playback', store: 'timeline' },
} as const satisfies FollowedInput;

export const sourceInput = {
    title: 'Source',
    from: 'followed',
    group: null,
    sources: [focusSource, agendaSource, ticketsSource],
    initial: { kind: 'focus', store: 'focus' },
} as const satisfies FollowedInput;

const signalInput = (title: string, group: string) =>
    ({
        title,
        from: 'followed',
        group,
        sources: [signalSource],
        initial: null,
    }) as const satisfies FollowedInput;

const driveInput = (title: string, group: string) =>
    ({
        title,
        from: 'followed',
        group,
        sources: [signalSource, voiceSource, drumsSource],
        initial: null,
    }) as const satisfies FollowedInput;

const storedSignalInput = (param: string) =>
    ({
        title: param,
        from: 'store',
        param,
        sources: [signalSource],
        initial: null,
    }) satisfies StoreInput;

export const signalInputs = {
    phase: storedSignalInput('phase'),
    offset: storedSignalInput('offset'),
    depth: storedSignalInput('depth'),
};

export const knobInputs = {
    k1: driveInput('k1', 'Knobs'),
    k2: driveInput('k2', 'Knobs'),
    k3: driveInput('k3', 'Knobs'),
    k4: driveInput('k4', 'Knobs'),
};

export const sceneInputs = {
    turn: driveInput('turn', 'Camera'),
    pitch: driveInput('pitch', 'Camera'),
    distance: driveInput('distance', 'Camera'),
    focus: driveInput('focus', 'Look'),
    colour: driveInput('colour', 'Look'),
    size: driveInput('dot size', 'Look'),
    depth: driveInput('depth', 'Look'),
    trails: driveInput('trails', 'Look'),
};

export const paintInput = {
    title: 'paint',
    from: 'followed',
    group: null,
    sources: [paintSource, penSource],
    initial: null,
} as const satisfies FollowedInput;

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
        from: 'store',
        param: 'agenda',
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

export const ownPlaybackInput = {
    title: 'Playback',
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
        // Saved before to-do lists grew into tickets.
        case 'todo':
            return { kind: 'tickets' as const, store };
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
