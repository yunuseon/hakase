import type {
    GraphPort,
    GraphStore,
    StateGraph,
    GraphWindow,
} from './components/state-map/state-map.ts';
import { followedBy, followedStores, SOURCES, type InputsFor } from './inputs.ts';
import { GLOBALS, targetId } from './inventory.ts';
import { defaultSignal, PARAMS, type Signal } from './shared/signal.ts';
import { PROGRAM_IDS, type ProgramId } from './program.ts';
import { colourOf, HOLDING, mainStore, type StoreEntry } from './stores.ts';
import { listed, type Workspace } from './workspace.ts';

type Titles = (program: ProgramId) => { readonly title: string; readonly icon: string };

const sourceOf = (program: ProgramId) => SOURCES.find(source => source.program === program);

const rank = ({ program, kind }: GraphStore) =>
    (kind === null ? PROGRAM_IDS.length : 0) + PROGRAM_IDS.findIndex(id => id === program);

export const graphOf = (
    { stores, processes }: Workspace,
    inputsFor: InputsFor,
    titles: Titles,
    held: ReadonlySet<string>,
    signals: ReadonlyMap<string, Signal>,
): StateGraph => {
    const followed = new Set(processes.flatMap(({ follows }) => followedStores(follows)));
    // A main store has no registry entry until a window opens: followed or holding data, it is listed anyway.
    const known: readonly StoreEntry[] = [
        ...stores,
        ...PROGRAM_IDS.flatMap(program =>
            (followed.has(program) || held.has(program)) && !stores.some(({ id }) => id === program)
                ? [mainStore(program)]
                : [],
        ),
    ];
    const nodes = known
        .filter(({ program }) => HOLDING[program] !== null)
        .map((store): GraphStore => ({
            id: store.id,
            target: targetId({ kind: 'store', program: store.program, store: store.id }),
            global: false,
            program: store.program,
            kind: sourceOf(store.program)?.kind ?? null,
            title: sourceOf(store.program)?.title ?? titles(store.program).title,
            name: store.name,
            colour: colourOf(store.id),
            ports:
                store.program === 'signal'
                    ? PARAMS.map(param => ({
                          input: param,
                          title: param,
                          accepts: ['signal'],
                          optional: true,
                          bound: (signals.get(store.id) ?? defaultSignal).sources[param],
                      }))
                    : [],
        }))
        .sort((a, b) => rank(a) - rank(b));
    const globals = GLOBALS.map((name): GraphStore => ({
        id: `global:${name}`,
        target: targetId({ kind: 'global', name }),
        global: true,
        program: '',
        kind: null,
        title: 'app',
        name,
        colour: 'var(--muted)',
        ports: [],
    }));

    const windows = listed(processes).flatMap(({ process, ordinal }): GraphWindow[] => {
        const ports = Object.entries(inputsFor(process.program)).flatMap(
            ([input, definition]): GraphPort[] => {
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
        const own = HOLDING[process.program] === null ? null : process.store;
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

    return { stores: [...nodes, ...globals], windows };
};

const sameStore = (a: GraphStore, b: GraphStore) =>
    a.id === b.id &&
    a.target === b.target &&
    a.global === b.global &&
    a.program === b.program &&
    a.kind === b.kind &&
    a.title === b.title &&
    a.name === b.name &&
    a.colour === b.colour &&
    samePorts(a.ports, b.ports);

const samePort = (a: GraphPort, b: GraphPort) =>
    a.input === b.input &&
    a.title === b.title &&
    a.optional === b.optional &&
    a.bound === b.bound &&
    a.accepts.join() === b.accepts.join();

const samePorts = (a: readonly GraphPort[], b: readonly GraphPort[]) =>
    a.length === b.length &&
    a.every((port, index) => {
        const other = b[index];

        return other !== undefined && samePort(port, other);
    });

const sameWindow = (a: GraphWindow, b: GraphWindow) =>
    a.id === b.id &&
    a.program === b.program &&
    a.label === b.label &&
    a.icon === b.icon &&
    a.own === b.own &&
    samePorts(a.ports, b.ports);

// The workspace emits on every pointer move of a drag; the graph changes far less often.
export const sameGraph = (a: StateGraph, b: StateGraph) =>
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
