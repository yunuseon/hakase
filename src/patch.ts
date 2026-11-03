import type { PatchPort, PatchSink, PatchSource, PatchView } from './components/patch-bay/patch.ts';
import { followedBy, followedStores, SOURCES, type InputsFor } from './inputs.ts';
import type { ProgramId } from './program.ts';
import { colourOf, MAIN, type StoreEntry } from './stores.ts';
import { listed, type Workspace } from './workspace.ts';

export const sourceId = (kind: string, store: string) => `${kind}:${store}`;

type Titles = (program: ProgramId) => { readonly title: string; readonly icon: string };

const sourcesOf = ({ stores, processes }: Workspace): readonly PatchSource[] =>
    SOURCES.flatMap(({ kind, program, title }) => {
        const own = stores.filter(store => store.program === program);
        const followed = processes
            .flatMap(({ follows }) => followedStores(follows))
            .filter(store => store === program);
        const all: readonly StoreEntry[] =
            followed.length > 0 && !own.some(({ id }) => id === program)
                ? [{ id: program, program, name: MAIN, kept: true, copy: null }, ...own]
                : own;

        return all.map(store => ({
            id: sourceId(kind, store.id),
            kind,
            store: store.id,
            title,
            name: store.name,
            colour: colourOf(store.id),
        }));
    });

export const patchOf = (workspace: Workspace, inputsFor: InputsFor, titles: Titles): PatchView => ({
    sources: sourcesOf(workspace),
    sinks: listed(workspace.processes).flatMap(({ process, ordinal }): PatchSink[] => {
        const ports = Object.entries(inputsFor(process.program)).flatMap(([input, definition]) => {
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
                    bound: binding === null ? null : sourceId(binding.kind, binding.store),
                },
            ];
        });
        const { title, icon } = titles(process.program);

        return ports.length === 0
            ? []
            : [{ id: process.id, label: `${title} ${ordinal}`, icon, ports }];
    }),
});

const sameSource = (a: PatchSource, b: PatchSource) =>
    a.id === b.id &&
    a.kind === b.kind &&
    a.store === b.store &&
    a.title === b.title &&
    a.name === b.name &&
    a.colour === b.colour;

const samePort = (a: PatchPort, b: PatchPort) =>
    a.input === b.input &&
    a.title === b.title &&
    a.optional === b.optional &&
    a.bound === b.bound &&
    a.accepts.join() === b.accepts.join();

const sameSink = (a: PatchSink, b: PatchSink) =>
    a.id === b.id &&
    a.label === b.label &&
    a.icon === b.icon &&
    a.ports.length === b.ports.length &&
    a.ports.every((port, index) => {
        const other = b.ports[index];

        return other !== undefined && samePort(port, other);
    });

// The workspace emits on every pointer move of a drag; the graph changes far less often.
export const samePatch = (a: PatchView, b: PatchView) =>
    a.sources.length === b.sources.length &&
    a.sinks.length === b.sinks.length &&
    a.sources.every((source, index) => {
        const other = b.sources[index];

        return other !== undefined && sameSource(source, other);
    }) &&
    a.sinks.every((sink, index) => {
        const other = b.sinks[index];

        return other !== undefined && sameSink(sink, other);
    });
