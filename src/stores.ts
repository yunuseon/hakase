import type { ProgramId } from './program.ts';

export type StoreId = string;

export type Sharing = 'shared' | 'private';

// What a new window of each program binds to: the program's one shared store, a fresh one, or none at all.
export const SHARING: Readonly<Record<ProgramId, Sharing | null>> = {
    formula: 'private',
    theme: 'private',
    appearance: null,
    sketch: 'private',
    timeline: null,
    playhead: null,
    tasks: null,
    todo: 'shared',
    board: 'shared',
    note: 'private',
    focus: 'shared',
    agenda: 'private',
    habits: 'shared',
    clocks: 'shared',
    bookmarks: 'shared',
};

export type StoreEntry = {
    readonly id: StoreId;
    readonly program: ProgramId;
    readonly name: string;
    // False only for a store a launch made for one window; it goes when no window uses it.
    readonly kept: boolean;
    // The store this one was split off from, so its content can be copied in once.
    readonly copy: StoreId | null;
};

export const MAIN = 'Main';

export const mainStore = (program: ProgramId): StoreEntry => ({
    id: program,
    program,
    name: MAIN,
    kept: true,
    copy: null,
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
