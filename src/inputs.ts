import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Focus } from './components/focus/focus.ts';
import type { Clock } from './shared/playhead.ts';
import type { ProgramId } from './program.ts';
import { focusProgress, type ProgressConnection } from './progress.ts';
import type { StoreId } from './stores.ts';

export type PlaybackBinding = { readonly kind: 'playback'; readonly store: StoreId };
export type FocusBinding = { readonly kind: 'focus'; readonly store: StoreId };
export type SignalBinding = { readonly kind: 'signal'; readonly store: StoreId };
export type Follow = PlaybackBinding | FocusBinding | SignalBinding;

export type InputSources = {
    readonly playback$: (store: StoreId) => Observable<Clock>;
    readonly focus$: (store: StoreId) => Observable<Focus>;
};

const playbackSource = {
    kind: 'playback',
    program: 'timeline',
    title: 'Playback',
    access: 'scrub',
    connect: (store: StoreId, sources: InputSources): ProgressConnection => ({
        access: 'scrub',
        position$: sources.playback$(store).pipe(map(({ at }) => at)),
    }),
} as const;

const focusSource = {
    kind: 'focus',
    program: 'focus',
    title: 'Focus',
    access: 'read',
    connect: (store: StoreId, sources: InputSources): ProgressConnection => ({
        access: 'read',
        position$: sources.focus$(store).pipe(map(value => focusProgress(value).at)),
    }),
} as const;

const signalSource = {
    kind: 'signal',
    program: 'signal',
    title: 'Signal',
    access: 'read',
} as const;

export const SOURCES = [playbackSource, focusSource, signalSource] as const;

type Source = (typeof SOURCES)[number];

export type FollowedInput = {
    readonly title: string;
    readonly from: 'followed';
    readonly sources: readonly Source[];
    readonly initial: Follow | null;
};

export type OwnInput = { readonly title: string; readonly from: 'own'; readonly kind: 'playback' };

export type InputDefinition = FollowedInput | OwnInput;
export type ProgramInputs = { readonly [name: string]: InputDefinition };
export type InputsFor = (program: ProgramId) => ProgramInputs;

export const playbackInput = {
    title: 'Playback',
    from: 'followed',
    sources: [playbackSource],
    initial: { kind: 'playback', store: 'timeline' },
} as const satisfies FollowedInput;

export const progressInput = {
    title: 'Progress',
    from: 'followed',
    sources: [playbackSource, focusSource],
    initial: { kind: 'playback', store: 'timeline' },
} as const satisfies FollowedInput;

const knobInput = (title: string) =>
    ({
        title,
        from: 'followed',
        sources: [signalSource],
        initial: null,
    }) as const satisfies FollowedInput;

export const knobInputs = {
    k1: knobInput('k1'),
    k2: knobInput('k2'),
    k3: knobInput('k3'),
    k4: knobInput('k4'),
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
        case 'signal':
            return signalSource.program;
    }
};

export const progressBinding = (kind: string, store: StoreId) => {
    switch (kind) {
        case 'playback':
            return { kind, store };
        case 'focus':
            return { kind, store };
        case 'signal':
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

export const progressConnection = (binding: Follow, sources: InputSources) =>
    (binding.kind === 'focus' ? focusSource : playbackSource).connect(binding.store, sources);
