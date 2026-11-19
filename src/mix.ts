import { followedBy } from './inputs.ts';
import type { StoreId } from './stores.ts';
import type { Workspace } from './workspace.ts';

export const SOUNDS = ['voice', 'drums'] as const;
export type Sound = (typeof SOUNDS)[number];
const isSound = (program: string): program is Sound => SOUNDS.some(sound => sound === program);

export const MAIN_CLOCK: StoreId = 'timeline';

export type Strip = {
    readonly store: StoreId;
    readonly program: Sound;
    readonly name: string;
    readonly clock: StoreId;
};

// The clock its first window plays on, so a patch that put its band on a clock of its own keeps its tempo.
const clockOf = ({ processes }: Workspace, store: StoreId): StoreId => {
    const window = processes.find(process => process.store === store);
    const binding = window === undefined ? null : followedBy(window.follows, 'playback');

    return binding?.kind === 'playback' ? binding.store : MAIN_CLOCK;
};

export const stripsOf = (workspace: Workspace): readonly Strip[] =>
    workspace.stores.flatMap(({ id, program, name }): Strip[] =>
        isSound(program) ? [{ store: id, program, name, clock: clockOf(workspace, id) }] : [],
    );

export const sameStrip = (a: Strip, b: Strip): boolean =>
    a.store === b.store && a.program === b.program && a.name === b.name && a.clock === b.clock;

export const sameStrips = (a: readonly Strip[], b: readonly Strip[]): boolean =>
    a.length === b.length &&
    a.every((strip, index) => {
        const other = b[index];
        return other !== undefined && sameStrip(strip, other);
    });

// Every strip sounds unless muted; while any is soloed, only the soloed ones do.
export const audible = (store: StoreId, muted: boolean, soloed: ReadonlySet<StoreId>): boolean =>
    soloed.size > 0 ? soloed.has(store) : !muted;

export const toggledSolo = (soloed: ReadonlySet<StoreId>, store: StoreId): ReadonlySet<StoreId> =>
    soloed.has(store)
        ? new Set([...soloed].filter(each => each !== store))
        : new Set([...soloed, store]);
