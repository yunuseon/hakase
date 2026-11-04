import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, scan, shareReplay, startWith } from 'rxjs/operators';
import { isProgramId, type ProgramId } from './program.ts';

export type StoreId = string;

export type Sharing = 'shared' | 'private';

export type Holding = {
    // What the store holds: the program's document, or its window settings when it has no document.
    readonly holds: 'document' | 'settings';
    // What a new window binds to: the program's main store, or a fresh one of its own.
    readonly sharing: Sharing;
};

const document: Holding = { holds: 'document', sharing: 'shared' };
const settings: Holding = { holds: 'settings', sharing: 'private' };

// null: the program keeps no state of its own, so its windows have nothing to bind.
export const HOLDING: Readonly<Record<ProgramId, Holding | null>> = {
    formula: settings,
    theme: settings,
    appearance: null,
    sketch: settings,
    timeline: document,
    playhead: null,
    signal: document,
    plot: null,
    paint: document,
    pen: document,
    voice: document,
    pieces: null,
    tasks: null,
    todo: document,
    board: document,
    note: document,
    focus: document,
    agenda: document,
    habits: document,
    clocks: document,
    bookmarks: document,
    history: null,
    state: null,
};

export type StoreEntry = {
    readonly id: StoreId;
    readonly program: ProgramId;
    readonly name: string;
    // False only for a store a launch made for one window; it goes when no window uses it.
    readonly kept: boolean;
    // The store this one was split off from, so its content can be copied in once.
    readonly copy: StoreId | null;
    // A clock placed from a piece: its loop as it was saved, since the clock it was saved from may be gone.
    readonly clock: ClockSeed | null;
};

export type ClockSeed = { readonly duration: number; readonly looping: boolean };

export const MAIN = 'Main';

// A program whose store holds settings keys them by store; any other keys them by window.
export const settingsKey = (program: ProgramId, store: StoreId, window: string): string =>
    HOLDING[program]?.holds === 'settings' ? store : window;

export const mainStore = (program: ProgramId): StoreEntry => ({
    id: program,
    program,
    name: MAIN,
    kept: true,
    copy: null,
    clock: null,
});

export const ensured = (stores: readonly StoreEntry[], entry: StoreEntry): readonly StoreEntry[] =>
    stores.some(({ id }) => id === entry.id) ? stores : [...stores, entry];

export const pruned = (
    stores: readonly StoreEntry[],
    bound: ReadonlySet<StoreId>,
): readonly StoreEntry[] => {
    const kept = stores.filter(store => store.kept || bound.has(store.id));

    return kept.length === stores.length ? stores : kept;
};

// Spread round the wheel by the golden angle, so neighbouring ids never share a colour.
export const colourOf = (id: StoreId): string => {
    const hash = [...id].reduce((total, letter) => (total * 31 + letter.charCodeAt(0)) >>> 0, 7);

    return `oklch(0.66 0.13 ${Math.round((hash * 137.508) % 360)})`;
};

export type Stamped<C> = {
    readonly store: StoreId;
    readonly command: C;
};

export type Copy = {
    readonly from: StoreId;
    readonly to: StoreId;
};

export type StoreEvent =
    | ({ readonly kind: 'copy' } & Copy)
    | { readonly kind: 'keep'; readonly stores: ReadonlySet<StoreId> };

export type StoreAction<C> = ({ readonly kind: 'command' } & Stamped<C>) | StoreEvent;

export const storeEvent = <S>(
    all: ReadonlyMap<StoreId, S>,
    event: StoreEvent,
): ReadonlyMap<StoreId, S> => {
    if (event.kind === 'keep') {
        const kept = new Map([...all].filter(([store]) => event.stores.has(store)));

        return kept.size === all.size ? all : kept;
    }

    const source = all.get(event.from);

    // Only into an empty store: undoing and redoing a split must not overwrite what was done since.
    return source === undefined || all.has(event.to) ? all : new Map(all).set(event.to, source);
};

export const reduceStores =
    <S, C>(reduce: (state: S, command: C) => S, empty: S) =>
    (all: ReadonlyMap<StoreId, S>, action: StoreAction<C>): ReadonlyMap<StoreId, S> =>
        action.kind === 'command'
            ? new Map(all).set(action.store, reduce(all.get(action.store) ?? empty, action.command))
            : storeEvent(all, action);

// Not refCount: a store outlives every window bound to it, and a rebind must not reset it.
export const perStore$ = <S, C>(
    commands$: Observable<Stamped<C>>,
    events$: Observable<StoreEvent>,
    reduce: (state: S, command: C) => S,
    empty: S,
    initial: ReadonlyMap<StoreId, S>,
): Observable<ReadonlyMap<StoreId, S>> =>
    merge(
        commands$.pipe(map((stamped): StoreAction<C> => ({ kind: 'command', ...stamped }))),
        events$,
    ).pipe(
        scan(reduceStores(reduce, empty), initial),
        startWith(initial),
        shareReplay({ bufferSize: 1, refCount: false }),
    );

export const inStore =
    <S>(all$: Observable<ReadonlyMap<StoreId, S>>, empty: S) =>
    (store: StoreId): Observable<S> =>
        all$.pipe(
            map(all => all.get(store) ?? empty),
            distinctUntilChanged(),
        );

// A main store is kept with no window open: it has no entry until one opens, and dropping it lost every document.
export const keptStores = <S>(
    all: ReadonlyMap<StoreId, S>,
    stores: readonly StoreEntry[],
): ReadonlyMap<StoreId, S> =>
    new Map([...all].filter(([id]) => isProgramId(id) || stores.some(store => store.id === id)));

export const withMain = (
    program: ProgramId,
    stores: readonly StoreEntry[],
): readonly StoreEntry[] => {
    const own = stores.filter(store => store.program === program);

    return HOLDING[program]?.holds === 'document' && !own.some(({ id }) => id === program)
        ? [mainStore(program), ...own]
        : own;
};
