import type { FollowGroup, WindowGesture } from './components/window/frame.ts';
import { definitionOf, followedBy, followedStores, type ProgramInputs } from './inputs.ts';
import { dependentsOf, type Linked } from './shared/signal.ts';
import { colourOf, withMain, type StoreEntry } from './stores.ts';
import { isProgramId } from './program.ts';
import type { Process } from './workspace.ts';

// Read by entry, not sources[param]: the documents come from storage.
export const sourceIn = (linked: ReadonlyMap<string, Linked>, store: string, param: string) =>
    Object.entries(linked.get(store)?.sources ?? {}).find(([key]) => key === param)?.[1] ?? null;

export const inputGroups = (
    process: Process,
    inputs: ProgramInputs,
    processes: readonly Process[],
    stores: readonly StoreEntry[],
    linked: ReadonlyMap<string, Linked>,
): readonly FollowGroup[] => {
    const looping = dependentsOf(linked, process.store);
    const users = new Map<string, number>();

    processes.forEach(({ store, follows }) => {
        new Set([store, ...followedStores(follows)]).forEach(id => {
            users.set(id, (users.get(id) ?? 0) + 1);
        });
    });

    return Object.entries(inputs).flatMap(([name, definition]) => {
        if (definition.from === 'own') {
            return [];
        }

        const bound =
            definition.from === 'store'
                ? sourceIn(linked, process.store, definition.param)
                : (followedBy(process.follows, name)?.store ?? null);
        const owner =
            stores.find(({ id }) => id === bound)?.program ??
            (bound !== null && isProgramId(bound) ? bound : null);
        const kind =
            definition.from === 'store'
                ? definition.sources.find(source => source.program === owner)?.kind
                : followedBy(process.follows, name)?.kind;

        return definition.sources.map((source, index): FollowGroup => ({
            input: name,
            optional: index === 0 && definition.initial === null,
            source: source.kind,
            label: definition.title,
            title: [
                source.title,
                ...(definition.sources.some(other => other.access !== source.access) &&
                source.access === 'read'
                    ? ['read-only']
                    : []),
            ].join(' · '),
            options: withMain(source.program, stores)
                .filter(store => definition.from !== 'store' || !looping.has(store.id))
                .map(store => ({
                    id: store.id,
                    name: store.name,
                    colour: colourOf(store.id),
                    users: users.get(store.id) ?? 0,
                    current: kind === source.kind && bound === store.id,
                })),
        }));
    });
};

export const storeInputCommand = (inputs: ProgramInputs, gesture: WindowGesture) => {
    if (gesture.kind !== 'follow' && gesture.kind !== 'unfollow') {
        return null;
    }

    const definition = definitionOf(inputs, gesture.input);

    return definition?.from !== 'store' ||
        (gesture.kind === 'follow' &&
            !definition.sources.some(source => source.kind === gesture.source))
        ? null
        : { param: definition.param, source: gesture.kind === 'follow' ? gesture.store : null };
};
