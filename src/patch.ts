import type {
    PatchPort,
    PatchStore,
    PatchView,
    PatchWindow,
} from './components/patch-bay/patch.ts';
import { followedBy, followedStores, SOURCES, type InputsFor } from './inputs.ts';
import { PROGRAM_IDS, type ProgramId } from './program.ts';
import { colourOf, HOLDING, MAIN, mainStore, type StoreEntry } from './stores.ts';
import { listed, type Workspace } from './workspace.ts';

type Titles = (program: ProgramId) => { readonly title: string; readonly icon: string };

const sourceOf = (program: ProgramId) => SOURCES.find(source => source.program === program);

const rank = ({ program, kind }: PatchStore) =>
    (kind === null ? PROGRAM_IDS.length : 0) + PROGRAM_IDS.findIndex(id => id === program);

export const patchOf = (
    { stores, processes }: Workspace,
    inputsFor: InputsFor,
    titles: Titles,
): PatchView => {
    const followed = new Set(processes.flatMap(({ follows }) => followedStores(follows)));
    const usersOf = (store: string) => processes.filter(process => process.store === store).length;
    // Followed before it has a window, a main store has no registry entry yet.
    const known: readonly StoreEntry[] = [
        ...stores,
        ...SOURCES.flatMap(({ program }) =>
            followed.has(program) && !stores.some(({ id }) => id === program)
                ? [mainStore(program)]
                : [],
        ),
    ];
    const isNode = ({ id, program }: StoreEntry) =>
        sourceOf(program) !== undefined || followed.has(id) || usersOf(id) > 1;

    const nodes = known
        .filter(isNode)
        .map((store): PatchStore => ({
            id: store.id,
            program: store.program,
            kind: sourceOf(store.program)?.kind ?? null,
            title: sourceOf(store.program)?.title ?? titles(store.program).title,
            name: store.name,
            colour: colourOf(store.id),
        }))
        .sort((a, b) => rank(a) - rank(b));

    const windows = listed(processes).flatMap(({ process, ordinal }): PatchWindow[] => {
        const ports = Object.entries(inputsFor(process.program)).flatMap(
            ([input, definition]): PatchPort[] => {
                if (definition.from === 'own') {
                    return [];
                }

                const binding = followedBy(process.follows, input);

                return [
                    {
                        input,
                        title: definition.title,
                        accepts: definition.sources.map(({ kind }) => kind),
                        optional: definition.initial === null,
                        bound: binding?.store ?? null,
                    },
                ];
            },
        );
        const entry = known.find(({ id }) => id === process.store);
        const own =
            HOLDING[process.program] === null
                ? null
                : {
                      store: process.store,
                      name: entry?.name ?? MAIN,
                      colour: colourOf(process.store),
                      shown:
                          entry !== undefined && isNode(entry)
                              ? ('node' as const)
                              : ('tag' as const),
                  };
        const { title, icon } = titles(process.program);

        return own === null && ports.length === 0
            ? []
            : [
                  {
                      id: process.id,
                      program: process.program,
                      label: `${title} ${ordinal}`,
                      icon,
                      own,
                      ports,
                  },
              ];
    });

    return { stores: nodes, windows };
};

const sameStore = (a: PatchStore, b: PatchStore) =>
    a.id === b.id &&
    a.program === b.program &&
    a.kind === b.kind &&
    a.title === b.title &&
    a.name === b.name &&
    a.colour === b.colour;

const samePort = (a: PatchPort, b: PatchPort) =>
    a.input === b.input &&
    a.title === b.title &&
    a.optional === b.optional &&
    a.bound === b.bound &&
    a.accepts.join() === b.accepts.join();

const sameWindow = (a: PatchWindow, b: PatchWindow) =>
    a.id === b.id &&
    a.program === b.program &&
    a.label === b.label &&
    a.icon === b.icon &&
    a.own?.store === b.own?.store &&
    a.own?.name === b.own?.name &&
    a.own?.colour === b.own?.colour &&
    a.own?.shown === b.own?.shown &&
    a.ports.length === b.ports.length &&
    a.ports.every((port, index) => {
        const other = b.ports[index];

        return other !== undefined && samePort(port, other);
    });

// The workspace emits on every pointer move of a drag; the graph changes far less often.
export const samePatch = (a: PatchView, b: PatchView) =>
    a.stores.length === b.stores.length &&
    a.windows.length === b.windows.length &&
    a.stores.every((store, index) => {
        const other = b.stores[index];

        return other !== undefined && sameStore(store, other);
    }) &&
    a.windows.every((window, index) => {
        const other = b.windows[index];

        return other !== undefined && sameWindow(window, other);
    });
