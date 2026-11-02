import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Focus } from './components/focus/focus.ts';
import type { Clock } from './shared/playhead.ts';
import type { ProgramId } from './program.ts';
import { focusProgress, type ProgressConnection } from './progress.ts';
import type { StoreId } from './stores.ts';

export type PlaybackBinding = { readonly kind: 'playback'; readonly store: StoreId };
export type FocusBinding = { readonly kind: 'focus'; readonly store: StoreId };
export type Follow = PlaybackBinding | FocusBinding;

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

export const playbackInput = {
    title: 'Playback',
    from: 'followed',
    sources: [playbackSource],
    initial: { kind: 'playback', store: 'timeline' },
} as const;

export const progressInput = {
    title: 'Progress',
    from: 'followed',
    sources: [playbackSource, focusSource],
    initial: { kind: 'playback', store: 'timeline' },
} as const;

export const ownPlaybackInput = { ...playbackInput, from: 'own' } as const;

export type ProgramInputs =
    | {
          readonly playback: typeof playbackInput | typeof ownPlaybackInput;
          readonly progress?: never;
      }
    | { readonly progress: typeof progressInput; readonly playback?: never }
    | { readonly playback?: never; readonly progress?: never };

export type InputsFor = (program: ProgramId) => ProgramInputs;
export type InputDefinition = typeof playbackInput | typeof progressInput | typeof ownPlaybackInput;

export type FollowFor<I extends ProgramInputs> = I extends { readonly playback: InputDefinition }
    ? PlaybackBinding
    : I extends { readonly progress: InputDefinition }
      ? Follow
      : never;

export const inputDefinition = (inputs: ProgramInputs): InputDefinition | undefined =>
    inputs.playback ?? inputs.progress;

export const initialFollows = (inputs: ProgramInputs): readonly Follow[] => {
    const definition = inputDefinition(inputs);

    return definition === undefined || definition.from === 'own' ? [] : [definition.initial];
};

export const accepts = (inputs: ProgramInputs, kind: Follow['kind']): boolean => {
    const definition = inputDefinition(inputs);

    return (
        definition?.from === 'followed' && definition.sources.some(source => source.kind === kind)
    );
};

export const sourceProgram = (kind: Follow['kind']): ProgramId =>
    kind === 'playback' ? playbackSource.program : focusSource.program;

export const progressBinding = (kind: string, store: StoreId): Follow | null => {
    switch (kind) {
        case 'playback':
            return { kind, store };
        case 'focus':
            return { kind, store };
        default:
            return null;
    }
};

export const followed = (follows: readonly Follow[]): Follow | null => follows[0] ?? null;
export const followedStores = (follows: readonly Follow[]): readonly StoreId[] =>
    follows.map(({ store }) => store);

export const playbackBinding = (
    inputs: ProgramInputs,
    store: StoreId,
    follows: readonly Follow[],
): PlaybackBinding | null => {
    if (inputs.playback?.from === 'own') {
        return { kind: 'playback', store };
    }

    const binding = followed(follows);
    const source = inputDefinition(inputs)?.sources.find(source => source.kind === binding?.kind);

    return binding?.kind === 'playback' && source?.access === 'scrub' ? binding : null;
};

export const progressConnection = (
    definition: typeof progressInput,
    binding: Follow,
    sources: InputSources,
): ProgressConnection => {
    const source = definition.sources.find(source => source.kind === binding.kind);

    return (source ?? playbackSource).connect(binding.store, sources);
};
