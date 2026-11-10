import { boundsOf } from './shared/area.ts';
import { parseAgenda } from './components/agenda/agenda.ts';
import { parseBookmarks } from './components/bookmarks/bookmarks.ts';
import { parseClocks } from './components/clocks/clocks.ts';
import { parseHabits } from './components/habits/habits.ts';
import { parseNotes } from './components/note/note.ts';
import { parsePen, type Pen } from './components/pen/pen.ts';
import { formulas as registry } from './components/sketch/formulas/registry.ts';
import { parseTickets } from './shared/tickets.ts';
import { parseVoice, type Voice } from './components/voice/voice.ts';
import { parseDrums, type Drums } from './components/drums/drums.ts';
import type { Documents } from './documents.ts';
import type { Bindings, InputsFor } from './inputs.ts';
import { isCustomId, isFormulaId, type CustomId, type FormulaId, type Library } from './library.ts';
import { isProgramId } from './program.ts';
import { parseSettings, type Settings } from './settings.ts';
import { parsePicture } from './shared/picture.ts';
import { parseSignal, reachedFrom, type Linked, type Signal } from './shared/signal.ts';
import {
    isSketchParam,
    linkedSketch,
    parseSketchLink,
    SKETCH_PARAMS,
    unlinkedSketch,
    type SketchLink,
} from './components/sketch/links.ts';
import {
    ensured,
    HOLDING,
    MAIN,
    mainStore,
    renamedStore,
    settingsKey,
    type ClockSeed,
    type StoreEntry,
    type StoreId,
} from './stores.ts';
import type { Size } from './components/window/frame.ts';
import type { Rect } from './shared/camera.ts';
import {
    boxOf,
    formerStoreFollows,
    linkFrom,
    ownsInputs,
    processFrom,
    storeFrom,
    type Draft,
    type Link,
} from './workspace.ts';

type HeldKind =
    | 'tickets'
    | 'notes'
    | 'agendas'
    | 'habits'
    | 'clocks'
    | 'bookmarks'
    | 'signals'
    | 'paintings'
    | 'pens'
    | 'voices'
    | 'drums'
    | 'sketchLinks';

type Entries<M> =
    M extends ReadonlyMap<StoreId, infer V> ? readonly (readonly [StoreId, V])[] : never;

export type Held = { readonly [K in HeldKind]: Entries<Documents[K]> };

export type BlueprintWindow = Draft & { readonly settings: Settings | null };

export type BlueprintFormula = {
    readonly id: FormulaId;
    readonly label: string;
    readonly source: string;
};

export type Captured = {
    readonly name: string;
    readonly size: Size;
    readonly windows: readonly BlueprintWindow[];
    readonly stores: readonly StoreEntry[];
    readonly held: Held;
    readonly formulas: readonly BlueprintFormula[];
    readonly links: readonly Link[];
};

export type Blueprint = Captured & { readonly id: string };

export type Blueprints = { readonly items: readonly Blueprint[] };

export const emptyBlueprints: Blueprints = { items: [] };

export type BlueprintCommand =
    | { readonly kind: 'add'; readonly blueprint: Captured }
    | { readonly kind: 'rename'; readonly id: string; readonly name: string }
    | { readonly kind: 'remove'; readonly id: string };

const named = (name: string) => name.trim() || 'Untitled';

export const reduceBlueprints = (
    blueprints: Blueprints,
    command: BlueprintCommand,
    { seq }: { readonly seq: number },
): Blueprints => {
    switch (command.kind) {
        case 'add':
            return {
                items: [...blueprints.items, { ...command.blueprint, id: `blueprint-${seq}` }],
            };
        case 'rename': {
            const name = named(command.name);

            return blueprints.items.some(({ id, name: was }) => id === command.id && was !== name)
                ? {
                      items: blueprints.items.map(blueprint =>
                          blueprint.id === command.id ? { ...blueprint, name } : blueprint,
                      ),
                  }
                : blueprints;
        }
        case 'remove':
            return blueprints.items.some(({ id }) => id === command.id)
                ? { items: blueprints.items.filter(({ id }) => id !== command.id) }
                : blueprints;
    }
};

const linkedOf = ({ signals, pens, voices, drums, sketchLinks }: Documents) =>
    new Map<StoreId, Linked>([...signals, ...pens, ...voices, ...drums, ...sketchLinks]);

const picked = <V>(map: ReadonlyMap<StoreId, V>, stores: ReadonlySet<StoreId>) =>
    [...map].filter(([id]) => stores.has(id));

const formulaOf = (settings: Settings | null) =>
    settings?.kind === 'sketch' || settings?.kind === 'formula' ? [settings.formula] : [];

// A clock is carried only with a timeline window to play it; a window on any other clock is placed on the main one.
export const blueprintOf = (
    documents: Documents,
    playback: ReadonlyMap<StoreId, ClockSeed>,
    selected: readonly string[],
    name = 'Selection',
): Captured | null => {
    const { workspace } = documents;
    const inside = workspace.processes.filter(p => selected.includes(p.id));
    const bounds = boundsOf(inside.map(boxOf));

    if (inside.length === 0) {
        return null;
    }

    const played = new Set(inside.filter(p => p.program === 'timeline').map(p => p.store));
    const followsOf = ({ follows }: { readonly follows: Bindings }): Bindings =>
        Object.fromEntries(
            Object.entries(follows).map(([name, binding]) => [
                name,
                binding.kind === 'playback' && !played.has(binding.store)
                    ? { ...binding, store: 'timeline' }
                    : binding,
            ]),
        );
    const windows = inside.map((process): BlueprintWindow => ({
        id: process.id,
        program: process.program,
        store: process.store,
        follows: followsOf(process),
        frame: {
            ...process.frame,
            x: process.frame.x - bounds.x,
            y: process.frame.y - bounds.y,
        },
        measured: process.measured,
        settings:
            documents.settings.get(settingsKey(process.program, process.store, process.id)) ?? null,
    }));
    const bound = new Set(
        windows.flatMap(({ store, follows }) => [
            store,
            ...Object.values(follows).flatMap(binding =>
                binding.kind === 'playback' && !played.has(binding.store) ? [] : [binding.store],
            ),
        ]),
    );
    const stores = new Set(reachedFrom(linkedOf(documents), bound));
    const entries = [...stores].flatMap((id): StoreEntry[] => {
        const entry = workspace.stores.find(store => store.id === id);
        // A main store has no registry entry until a window opens on it; its id is its program's.
        const program = entry?.program ?? (isProgramId(id) ? id : undefined);
        const saved = program === 'timeline' ? playback.get(id) : undefined;
        const clock =
            saved === undefined ? null : { duration: saved.duration, looping: saved.looping };

        return program === undefined
            ? []
            : [{ id, program, name: entry?.name ?? MAIN, kept: true, copy: null, clock }];
    });
    const formulas = [...new Set(windows.flatMap(({ settings }) => formulaOf(settings)))].flatMap(
        (id): BlueprintFormula[] => {
            if (isCustomId(id)) {
                const item = documents.library.items.find(candidate => candidate.id === id);

                return item === undefined ? [] : [{ id, label: item.label, source: item.source }];
            }

            const edited = documents.formulas.get(id);

            return edited === undefined
                ? []
                : [{ id, label: registry[id].label, source: edited.value }];
        },
    );
    const ids = new Set(windows.map(({ id }) => id));

    return {
        name,
        size: { width: bounds.width, height: bounds.height },
        windows,
        stores: entries,
        held: {
            tickets: picked(documents.tickets, stores),
            notes: picked(documents.notes, stores),
            agendas: picked(documents.agendas, stores),
            habits: picked(documents.habits, stores),
            clocks: picked(documents.clocks, stores),
            bookmarks: picked(documents.bookmarks, stores),
            signals: picked(documents.signals, stores),
            paintings: picked(documents.paintings, stores),
            pens: picked(documents.pens, stores),
            voices: picked(documents.voices, stores),
            drums: picked(documents.drums, stores),
            sketchLinks: picked(documents.sketchLinks, stores),
        },
        formulas,
        links: workspace.links.filter(({ a, b }) => ids.has(a) && ids.has(b)),
    };
};

const formulaIdsIn = (library: Library, formulas: readonly BlueprintFormula[]) =>
    formulas.reduce(
        ({ ids, items, made }, formula) => {
            const same = items.find(({ source }) => source === formula.source);
            const id: CustomId = same?.id ?? `custom-${made + 1}`;

            return {
                ids: new Map(ids).set(formula.id, id),
                items:
                    same === undefined
                        ? [...items, { id, label: formula.label, source: formula.source }]
                        : items,
                made: same === undefined ? made + 1 : made,
            };
        },
        {
            ids: new Map<FormulaId, CustomId>(),
            items: library.items,
            made: library.made,
        },
    );

export const placed = (
    documents: Documents,
    blueprint: Blueprint,
    view: Rect,
    seq: number,
    inputsFor: InputsFor,
): Documents => {
    const { workspace } = documents;
    const storeIds = new Map(
        blueprint.stores.map(({ id }, index) => [id, `store-${seq}-${index + 1}`]),
    );
    const windowIds = new Map(
        blueprint.windows.map(({ id, program }, index) => [id, `${program}-${seq}-${index + 1}`]),
    );
    const storeOf = (id: StoreId) => storeIds.get(id) ?? id;
    const sourceOf = (id: StoreId | null) => (id === null ? null : storeOf(id));
    const x = Math.round(view.x + (view.width - blueprint.size.width) / 2);
    const y = Math.round(view.y + (view.height - blueprint.size.height) / 2);
    const processes = blueprint.windows
        .map((window): Draft => ({
            id: windowIds.get(window.id) ?? window.id,
            program: window.program,
            store: storeOf(window.store),
            follows: Object.fromEntries(
                Object.entries(window.follows).map(([name, binding]) => [
                    name,
                    { ...binding, store: storeOf(binding.store) },
                ]),
            ),
            frame: { ...window.frame, x: x + window.frame.x, y: y + window.frame.y },
            measured: window.measured,
        }))
        .filter(ownsInputs(inputsFor));
    const formulas = formulaIdsIn(documents.library, blueprint.formulas);
    const settled = (settings: Settings): Settings =>
        settings.kind === 'sketch' || settings.kind === 'formula'
            ? { ...settings, formula: formulas.ids.get(settings.formula) ?? settings.formula }
            : settings;
    const settings = blueprint.windows.flatMap(({ id, program, store, settings: saved }) =>
        saved === null
            ? []
            : [
                  [
                      settingsKey(program, storeOf(store), windowIds.get(id) ?? id),
                      settled(saved),
                  ] as const,
              ],
    );
    const into = <V>(
        map: ReadonlyMap<StoreId, V>,
        entries: readonly (readonly [StoreId, V])[],
        relink: (value: V) => V = value => value,
    ): ReadonlyMap<StoreId, V> =>
        entries.length === 0
            ? map
            : new Map([
                  ...map,
                  ...entries.map(([id, value]): [StoreId, V] => [storeOf(id), relink(value)]),
              ]);
    const { held } = blueprint;

    return {
        ...documents,
        workspace: {
            ...workspace,
            launched: workspace.launched + processes.length,
            processes: [...workspace.processes, ...processes],
            // A window on its program's main store registers it, as a launch would, or it shows no chip.
            stores: processes
                .filter(({ program, store }) => store === program)
                .reduce<readonly StoreEntry[]>(
                    (all, { program }) => ensured(all, mainStore(program)),
                    [
                        ...workspace.stores,
                        ...blueprint.stores.map((entry): StoreEntry => ({
                            ...entry,
                            id: storeOf(entry.id),
                            // A copy is not its program's main store, so it should not answer to the name.
                            name: entry.name === MAIN ? blueprint.name : entry.name,
                            kept: HOLDING[entry.program]?.sharing !== 'private',
                        })),
                    ],
                ),
            links: [
                ...workspace.links,
                ...blueprint.links.flatMap(({ a, b }) => {
                    const from = windowIds.get(a);
                    const to = windowIds.get(b);

                    return from === undefined || to === undefined ? [] : [{ a: from, b: to }];
                }),
            ],
        },
        settings: new Map([...documents.settings, ...settings]),
        library:
            formulas.items === documents.library.items
                ? documents.library
                : { items: formulas.items, made: formulas.made },
        tickets: into(documents.tickets, held.tickets),
        notes: into(documents.notes, held.notes),
        agendas: into(documents.agendas, held.agendas),
        habits: into(documents.habits, held.habits),
        clocks: into(documents.clocks, held.clocks),
        bookmarks: into(documents.bookmarks, held.bookmarks),
        signals: into(documents.signals, held.signals, (signal): Signal => ({
            ...signal,
            sources: {
                phase: sourceOf(signal.sources.phase),
                offset: sourceOf(signal.sources.offset),
                depth: sourceOf(signal.sources.depth),
            },
        })),
        paintings: into(documents.paintings, held.paintings),
        pens: into(documents.pens, held.pens, (pen): Pen => ({
            ...pen,
            sources: {
                x: sourceOf(pen.sources.x),
                y: sourceOf(pen.sources.y),
                size: sourceOf(pen.sources.size),
                ink: sourceOf(pen.sources.ink),
            },
        })),
        voices: into(documents.voices, held.voices, (voice): Voice => ({
            ...voice,
            sources: {
                pitch: sourceOf(voice.sources.pitch),
                volume: sourceOf(voice.sources.volume),
                filter: sourceOf(voice.sources.filter),
                pan: sourceOf(voice.sources.pan),
            },
        })),
        drums: into(documents.drums, held.drums, (drums): Drums => ({
            ...drums,
            sources: { volume: sourceOf(drums.sources.volume) },
        })),
        sketchLinks: into(documents.sketchLinks, held.sketchLinks, link =>
            SKETCH_PARAMS.reduce(
                (relinked, param) => linkedSketch(relinked, param, sourceOf(link.sources[param])),
                link,
            ),
        ),
    };
};

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

const entriesOf = <V>(value: unknown, parse: (stored: unknown) => V) =>
    Array.isArray(value)
        ? value.flatMap((entry: unknown): (readonly [StoreId, V])[] =>
              Array.isArray(entry) && typeof entry[0] === 'string'
                  ? [[entry[0], parse(entry[1])]]
                  : [],
          )
        : [];

const finite = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

// Saved before a sketch's inputs were its store's: what its window followed becomes the store's link.
const formerLinks = (
    saved: readonly (readonly [StoreId, SketchLink])[],
    former: readonly (readonly [StoreId, string, StoreId])[],
): readonly (readonly [StoreId, SketchLink])[] => [
    ...former
        .reduce((all, [store, param, source]) => {
            const link = all.get(store) ?? unlinkedSketch;

            return saved.some(([id]) => id === store) || !isSketchParam(param)
                ? all
                : new Map(all).set(store, linkedSketch(link, param, source));
        }, new Map<StoreId, SketchLink>())
        .entries(),
    ...saved,
];

const blueprintFrom = (value: unknown, inputsFor: InputsFor): Blueprint[] => {
    if (typeof value !== 'object' || value === null) {
        return [];
    }

    const id = field(value, 'id');
    const name = field(value, 'name');
    const size = field(value, 'size');
    const width = typeof size === 'object' && size !== null ? finite(field(size, 'width')) : null;
    const height = typeof size === 'object' && size !== null ? finite(field(size, 'height')) : null;
    const windows = field(value, 'windows');
    const stores = field(value, 'stores');
    const held = field(value, 'held');
    const formulas = field(value, 'formulas');
    const links = field(value, 'links');
    const heldOf = (kind: HeldKind | 'todos' | 'boards') =>
        typeof held === 'object' && held !== null ? field(held, kind) : undefined;

    if (typeof id !== 'string' || typeof name !== 'string' || width === null || height === null) {
        return [];
    }

    return [
        {
            id,
            name,
            size: { width, height },
            windows: Array.isArray(windows)
                ? windows.flatMap((stored: unknown): BlueprintWindow[] => {
                      const draft = processFrom(stored, inputsFor);
                      const settings =
                          typeof stored === 'object' && stored !== null
                              ? (parseSettings(field(stored, 'settings')) ??
                                (field(stored, 'program') === 'board'
                                    ? { kind: 'tickets' as const, view: 'board' as const }
                                    : null))
                              : null;

                      return draft === null ? [] : [{ ...draft, settings }];
                  })
                : [],
            stores: Array.isArray(stores) ? stores.flatMap(storeFrom) : [],
            held: {
                // Saved before tickets, to-do lists and boards are both read as ticket lists.
                tickets: [
                    ...entriesOf(heldOf('tickets'), parseTickets),
                    ...entriesOf(heldOf('todos'), parseTickets),
                    ...entriesOf(heldOf('boards'), parseTickets),
                ].map(([id, tickets]) => [renamedStore(id), tickets] as const),
                notes: entriesOf(heldOf('notes'), parseNotes),
                agendas: entriesOf(heldOf('agendas'), parseAgenda),
                habits: entriesOf(heldOf('habits'), parseHabits),
                clocks: entriesOf(heldOf('clocks'), parseClocks),
                bookmarks: entriesOf(heldOf('bookmarks'), stored => parseBookmarks(stored)),
                signals: entriesOf(heldOf('signals'), parseSignal),
                paintings: entriesOf(heldOf('paintings'), parsePicture),
                pens: entriesOf(heldOf('pens'), parsePen),
                voices: entriesOf(heldOf('voices'), parseVoice),
                drums: entriesOf(heldOf('drums'), parseDrums),
                sketchLinks: formerLinks(
                    entriesOf(heldOf('sketchLinks'), parseSketchLink),
                    Array.isArray(windows)
                        ? windows.flatMap((stored: unknown) =>
                              formerStoreFollows(stored, inputsFor),
                          )
                        : [],
                ),
            },
            formulas: Array.isArray(formulas)
                ? formulas.flatMap((stored: unknown): BlueprintFormula[] => {
                      if (typeof stored !== 'object' || stored === null) {
                          return [];
                      }

                      const formula = field(stored, 'id');
                      const label = field(stored, 'label');
                      const source = field(stored, 'source');

                      return typeof formula === 'string' &&
                          isFormulaId(formula) &&
                          typeof label === 'string' &&
                          typeof source === 'string'
                          ? [{ id: formula, label, source }]
                          : [];
                  })
                : [],
            links: Array.isArray(links) ? links.flatMap(linkFrom) : [],
        },
    ];
};

export const parseBlueprints = (value: unknown, inputsFor: InputsFor): Blueprints => {
    const items = typeof value === 'object' && value !== null ? field(value, 'items') : undefined;

    return Array.isArray(items)
        ? { items: items.flatMap((item: unknown) => blueprintFrom(item, inputsFor)) }
        : emptyBlueprints;
};
