import type { FollowGroup, WindowGesture } from './layout/frame.ts';
import { definitionOf, followedBy, followedStores, SOURCES, type ProgramInputs } from './inputs.ts';
import { isConverterKind } from './converters.ts';
import { dependentsOf, type Linked } from './shared/signal.ts';
import { readsTickBefore } from './gates.ts';
import { colourOf, MAIN, withMain, type StoreEntry } from './stores.ts';
import { isProgramId } from './protocol.ts';
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
    loops: ReadonlyMap<string, Linked> = linked,
    offering = false,
): readonly FollowGroup[] => {
    const looping = readsTickBefore(process.program)
        ? new Set<string>()
        : dependentsOf(loops, process.store);
    const users = new Map<string, number>();
    const time = sourceIn(linked, process.store, 'time');
    const readOn = time === null ? null : (stores.find(({ id }) => id === time)?.name ?? MAIN);

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

        const optionsOf = (program: Parameters<typeof withMain>[0], current: boolean) =>
            withMain(program, stores)
                .filter(store => definition.from !== 'store' || !looping.has(store.id))
                .map(store => ({
                    id: store.id,
                    name: store.name,
                    colour: colourOf(store.id),
                    users: users.get(store.id) ?? 0,
                    current: current && bound === store.id,
                }));
        const offers = offering
            ? SOURCES.flatMap(source => {
                  const via = `${source.makes}-${definition.takes}`;

                  return source.makes === definition.takes ||
                      !isConverterKind(via) ||
                      !definition.sources.some(({ kind }) => kind === via)
                      ? []
                      : [
                            {
                                input: name,
                                optional: false,
                                source: source.kind,
                                label: definition.title,
                                title: source.title,
                                type: definition.takes,
                                setAside: null,
                                options: optionsOf(source.program, false).filter(
                                    store => store.id !== process.store,
                                ),
                                via,
                            } satisfies FollowGroup,
                        ];
              })
            : [];

        return [
            ...definition.sources.map((source, index): FollowGroup => ({
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
                type: definition.takes,
                setAside:
                    definition.from === 'followed' && source.kind === 'playback' ? readOn : null,
                options: optionsOf(source.program, kind === source.kind),
                via: null,
            })),
            ...offers.filter(group => group.options.length > 0),
        ];
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
