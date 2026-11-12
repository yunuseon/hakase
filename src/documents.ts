import type { Appearance } from './appearance.ts';
import type { AppearanceName } from './appearances.ts';
import type { Aspect } from './components/sketch/animation.ts';
import { reduceAgenda, type Agenda, type AgendaCommand } from './components/agenda/agenda.ts';
import {
    defaultBookmarks,
    reduceBookmarks,
    type BookmarkCommand,
    type Bookmarks,
} from './components/bookmarks/bookmarks.ts';
import {
    defaultClocks,
    reduceClocks,
    type ClockCommand,
    type Clocks,
} from './components/clocks/clocks.ts';
import {
    emptyHabits,
    reduceHabits,
    type HabitCommand,
    type Habits,
} from './components/habits/habits.ts';
import { emptyNotes, reduceNotes, type NoteCommand, type Notes } from './components/note/note.ts';
import type { Theme } from './components/sketch/theme.ts';
import { reducePicture, type PaintCommand } from './components/paint/paint.ts';
import { defaultPicture, type Picture } from './shared/picture.ts';
import {
    defaultPen,
    isPenParam,
    reducePen,
    type Pen,
    type PenCommand,
} from './components/pen/pen.ts';
import {
    defaultDrums,
    reduceDrums,
    type Drums,
    type DrumsCommand,
} from './components/drums/drums.ts';
import type { FocusLink } from './components/focus/focus.ts';
import { defaultPedal, isPedalKind, reducePedal, type Pedal, type PedalCommand } from './pedals.ts';
import {
    GATE_DEFAULTS,
    isGateKind,
    loopEdges,
    readsTickBefore,
    reduceGate,
    type Gate,
    type GateCommand,
} from './gates.ts';
import { boxed, EMPTY_BOX, reduceBox, unboxed, type Box, type BoxCommand } from './boxes.ts';
import {
    isSketchParam,
    isUnlinked,
    linkedSketch,
    unlinkedSketch,
    type SketchLink,
    type SketchParam,
} from './components/sketch/links.ts';
import {
    defaultVoice,
    isVoiceParam,
    reduceVoice,
    type Voice,
    type VoiceCommand,
} from './components/voice/voice.ts';
import { isProgramId, type ProgramId } from './program.ts';
import {
    placed,
    reduceBlueprints,
    type BlueprintCommand,
    type Blueprints,
    type Captured,
} from './blueprints.ts';
import { blueprintIn } from './starters.ts';
import type { Rect } from './shared/camera.ts';
import type { ThemeName } from './components/sketch/themes/registry.ts';
import {
    defaultTickets,
    reduceTickets,
    type TicketCommand,
    type Tickets,
} from './shared/tickets.ts';
import { emptyAgenda } from './components/agenda/agenda.ts';
import { storeInputOf, type InputsFor } from './inputs.ts';
import { reduceLibrary, type FormulaId, type Library, type LibraryCommand } from './library.ts';
import type { ProcessId, Written } from './program.ts';
import { viewOnly, type Settings } from './settings.ts';
import {
    closesLoop,
    defaultSignal,
    isParam,
    reachedFrom,
    reduceSignal,
    type Linked,
    type Signal,
    type SignalCommand,
} from './shared/signal.ts';
import { storeEvent, type StoreEntry, type StoreEvent, type StoreId } from './stores.ts';
import {
    logged,
    redone,
    takenBack,
    travelled,
    undone,
    type Kit,
    type StepKind,
    type Timeline,
} from './timeline.ts';
import {
    keepingView,
    labelOf as workspaceLabel,
    reduceWorkspace,
    settledAction,
    stepOf as workspaceStep,
    usedStores,
    type Workspace,
    type WorkspaceAction,
} from './workspace.ts';

export type Documents = {
    readonly workspace: Workspace;
    readonly settings: ReadonlyMap<string, Settings>;
    readonly tickets: ReadonlyMap<StoreId, Tickets>;
    readonly notes: ReadonlyMap<StoreId, Notes>;
    readonly agendas: ReadonlyMap<StoreId, Agenda>;
    readonly habits: ReadonlyMap<StoreId, Habits>;
    readonly clocks: ReadonlyMap<StoreId, Clocks>;
    readonly bookmarks: ReadonlyMap<StoreId, Bookmarks>;
    readonly signals: ReadonlyMap<StoreId, Signal>;
    readonly paintings: ReadonlyMap<StoreId, Picture>;
    readonly pens: ReadonlyMap<StoreId, Pen>;
    readonly voices: ReadonlyMap<StoreId, Voice>;
    readonly drums: ReadonlyMap<StoreId, Drums>;
    readonly pedals: ReadonlyMap<StoreId, Pedal>;
    readonly gates: ReadonlyMap<StoreId, Gate>;
    readonly boxes: ReadonlyMap<StoreId, Box>;
    readonly focusLinks: ReadonlyMap<StoreId, FocusLink>;
    readonly sketchLinks: ReadonlyMap<StoreId, SketchLink>;
    readonly library: Library;
    readonly blueprints: Blueprints;
    readonly formulas: ReadonlyMap<FormulaId, Written<string>>;
    readonly themes: ReadonlyMap<ThemeName, Written<Theme>>;
    readonly looks: ReadonlyMap<AppearanceName, Written<Appearance>>;
    readonly look: AppearanceName;
    readonly aspect: Aspect;
};

type StoreCommands = {
    readonly tickets: TicketCommand;
    readonly notes: NoteCommand;
    readonly agendas: AgendaCommand;
    readonly habits: HabitCommand;
    readonly clocks: ClockCommand;
    readonly bookmarks: BookmarkCommand;
    readonly signals: SignalCommand;
    readonly paintings: PaintCommand;
    readonly pens: PenCommand;
    readonly voices: VoiceCommand;
    readonly drums: DrumsCommand;
    readonly pedals: PedalCommand;
    readonly gates: GateCommand;
    readonly boxes: BoxCommand;
};

type StoreDocument = keyof StoreCommands;

export type DocumentAction =
    | { readonly kind: 'workspace'; readonly action: WorkspaceAction }
    | { readonly kind: 'prune' }
    | { readonly kind: 'settings'; readonly key: string; readonly settings: Settings }
    | {
          [K in StoreDocument]: {
              readonly kind: K;
              readonly store: StoreId;
              readonly command: StoreCommands[K];
          };
      }[StoreDocument]
    | { readonly kind: 'box'; readonly ids: readonly ProcessId[] }
    | { readonly kind: 'unbox'; readonly id: ProcessId }
    | { readonly kind: 'library'; readonly command: LibraryCommand }
    | { readonly kind: 'blueprints'; readonly command: BlueprintCommand }
    | { readonly kind: 'place'; readonly blueprint: string; readonly view: Rect }
    | {
          readonly kind: 'paste';
          readonly blueprint: Captured;
          readonly view: Rect;
      }
    | {
          readonly kind: 'link';
          readonly store: StoreId;
          readonly param: string;
          readonly source: string | null;
      }
    | {
          readonly kind: 'formula';
          readonly formula: FormulaId;
          readonly text: string;
          readonly from: ProcessId;
      }
    | {
          readonly kind: 'theme';
          readonly theme: ThemeName;
          readonly value: Theme;
          readonly from: ProcessId;
      }
    | {
          readonly kind: 'appearance';
          readonly name: AppearanceName;
          readonly value: Appearance;
          readonly from: ProcessId;
      }
    | { readonly kind: 'look'; readonly name: AppearanceName }
    | { readonly kind: 'aspect'; readonly aspect: Aspect };

const commanded = <S, C>(
    all: ReadonlyMap<StoreId, S>,
    store: StoreId,
    empty: S,
    reduce: (state: S, command: C, logged?: { readonly seq: number }) => S,
    command: C,
    seq: number,
) => {
    const before = all.get(store) ?? empty;
    const after = reduce(before, command, { seq });

    return after === before ? all : new Map(all).set(store, after);
};

const withEvent = (documents: Documents, event: StoreEvent): Documents => ({
    ...documents,
    settings: storeEvent(documents.settings, event),
    tickets: storeEvent(documents.tickets, event),
    notes: storeEvent(documents.notes, event),
    agendas: storeEvent(documents.agendas, event),
    habits: storeEvent(documents.habits, event),
    clocks: storeEvent(documents.clocks, event),
    bookmarks: storeEvent(documents.bookmarks, event),
    signals: storeEvent(documents.signals, event),
    paintings: storeEvent(documents.paintings, event),
    pens: storeEvent(documents.pens, event),
    voices: storeEvent(documents.voices, event),
    drums: storeEvent(documents.drums, event),
    pedals: storeEvent(documents.pedals, event),
    gates: storeEvent(documents.gates, event),
    boxes: storeEvent(documents.boxes, event),
    focusLinks: storeEvent(documents.focusLinks, event),
    sketchLinks: storeEvent(documents.sketchLinks, event),
});

export const linkedOf = ({
    signals,
    pens,
    voices,
    drums,
    pedals,
    gates,
    boxes,
    focusLinks,
    sketchLinks,
}: Pick<
    Documents,
    | 'signals'
    | 'pens'
    | 'voices'
    | 'drums'
    | 'pedals'
    | 'gates'
    | 'boxes'
    | 'focusLinks'
    | 'sketchLinks'
>) =>
    new Map<StoreId, Linked>([
        ...signals,
        ...pens,
        ...voices,
        ...drums,
        ...pedals,
        ...gates,
        ...boxes,
        ...focusLinks,
        ...sketchLinks,
    ]);

export const loopsOf = (documents: Parameters<typeof linkedOf>[0]) =>
    new Map<StoreId, Linked>([
        ...linkedOf(documents),
        ...[...documents.gates].map(([id, gate]): [StoreId, Linked] => [id, loopEdges(gate)]),
    ]);

const linkedSketchIn = (
    documents: Documents,
    store: StoreId,
    param: SketchParam,
    source: StoreId | null,
): Documents => {
    const before = documents.sketchLinks.get(store) ?? unlinkedSketch;
    const after = linkedSketch(before, param, source);

    return after === before
        ? documents
        : {
              ...documents,
              sketchLinks: isUnlinked(after)
                  ? new Map([...documents.sketchLinks].filter(([id]) => id !== store))
                  : new Map(documents.sketchLinks).set(store, after),
          };
};

const linkedFocus = (documents: Documents, store: StoreId, agenda: StoreId | null): Documents =>
    (documents.focusLinks.get(store)?.sources.agenda ?? null) === agenda
        ? documents
        : {
              ...documents,
              focusLinks:
                  agenda === null
                      ? new Map([...documents.focusLinks].filter(([id]) => id !== store))
                      : new Map(documents.focusLinks).set(store, { sources: { agenda } }),
          };

export const ownerOf = ({ stores }: Pick<Workspace, 'stores'>, store: StoreId) =>
    stores.find(({ id }) => id === store)?.program ?? (isProgramId(store) ? store : null);

// A fork's copy belongs to the step that made the fork, so undoing one undoes both.
const copiesOf = (before: readonly StoreEntry[], after: readonly StoreEntry[]): StoreEvent[] =>
    after === before
        ? []
        : after.flatMap(({ id, copy }): StoreEvent[] =>
              copy === null || before.some(store => store.id === id)
                  ? []
                  : [{ kind: 'copy', from: copy, to: id }],
          );

const written = <K, V>(all: ReadonlyMap<K, Written<V>>, key: K, value: V, from: ProcessId) =>
    new Map(all).set(key, { value, from });

const linked = (
    inputsFor: InputsFor,
    documents: Documents,
    owner: ProgramId,
    store: StoreId,
    param: string,
    source: StoreId | null,
    seq: number,
): Documents => {
    const reduce = reduceDocuments(inputsFor);

    switch (owner) {
        case 'signal':
            return isParam(param)
                ? reduce(
                      documents,
                      { kind: 'signals', store, command: { kind: 'source', param, source } },
                      seq,
                  )
                : documents;
        case 'pen':
            return isPenParam(param)
                ? reduce(
                      documents,
                      { kind: 'pens', store, command: { kind: 'source', param, source } },
                      seq,
                  )
                : documents;
        case 'voice':
            return isVoiceParam(param)
                ? reduce(
                      documents,
                      { kind: 'voices', store, command: { kind: 'source', param, source } },
                      seq,
                  )
                : documents;
        case 'drums':
            return param === 'volume'
                ? reduce(
                      documents,
                      { kind: 'drums', store, command: { kind: 'source', param, source } },
                      seq,
                  )
                : documents;
        case 'focus':
            return param === 'agenda' ? linkedFocus(documents, store, source) : documents;
        case 'sketch':
            return isSketchParam(param)
                ? linkedSketchIn(documents, store, param, source)
                : documents;
        default:
            return isPedalKind(owner)
                ? reduce(
                      documents,
                      { kind: 'pedals', store, command: { kind: 'source', param, source } },
                      seq,
                  )
                : isGateKind(owner)
                  ? reduce(
                        documents,
                        { kind: 'gates', store, command: { kind: 'source', param, source } },
                        seq,
                    )
                  : documents;
    }
};

// A store something links to is kept, as a named one is: closing its window must not take it out from under the link.
const keptSource = (documents: Documents, source: StoreId | null): Documents =>
    source === null || !documents.workspace.stores.some(({ id, kept }) => id === source && !kept)
        ? documents
        : {
              ...documents,
              workspace: {
                  ...documents.workspace,
                  stores: documents.workspace.stores.map(entry =>
                      entry.id === source ? { ...entry, kept: true } : entry,
                  ),
              },
          };

export const reduceDocuments =
    (inputsFor: InputsFor) =>
    (documents: Documents, action: DocumentAction, seq: number): Documents => {
        switch (action.kind) {
            case 'workspace': {
                const workspace = reduceWorkspace(
                    documents.workspace,
                    action.action,
                    inputsFor,
                    seq,
                );

                return workspace === documents.workspace
                    ? documents
                    : copiesOf(documents.workspace.stores, workspace.stores).reduce(withEvent, {
                          ...documents,
                          workspace,
                      });
            }
            case 'prune': {
                const linked = linkedOf(documents);
                const workspace = reduceWorkspace(
                    documents.workspace,
                    { kind: 'prune-stores', followed: linked },
                    inputsFor,
                    seq,
                );
                const { processes } = documents.workspace;

                // Settings of a document program are kept by window, so the windows' ids are kept too.
                return withEvent(
                    { ...documents, workspace },
                    {
                        kind: 'keep',
                        stores: new Set([
                            ...reachedFrom(linked, usedStores(processes)),
                            ...processes.map(({ id }) => id),
                        ]),
                    },
                );
            }
            case 'settings':
                return documents.settings.get(action.key) === action.settings
                    ? documents
                    : {
                          ...documents,
                          settings: new Map(documents.settings).set(action.key, action.settings),
                      };
            case 'tickets':
                return {
                    ...documents,
                    tickets: commanded(
                        documents.tickets,
                        action.store,
                        defaultTickets,
                        reduceTickets,
                        action.command,
                        seq,
                    ),
                };
            case 'notes':
                return {
                    ...documents,
                    notes: commanded(
                        documents.notes,
                        action.store,
                        emptyNotes,
                        reduceNotes,
                        action.command,
                        seq,
                    ),
                };
            case 'agendas':
                return {
                    ...documents,
                    agendas: commanded(
                        documents.agendas,
                        action.store,
                        emptyAgenda,
                        reduceAgenda,
                        action.command,
                        seq,
                    ),
                };
            case 'habits':
                return {
                    ...documents,
                    habits: commanded(
                        documents.habits,
                        action.store,
                        emptyHabits,
                        reduceHabits,
                        action.command,
                        seq,
                    ),
                };
            case 'clocks':
                return {
                    ...documents,
                    clocks: commanded(
                        documents.clocks,
                        action.store,
                        defaultClocks,
                        reduceClocks,
                        action.command,
                        seq,
                    ),
                };
            case 'bookmarks':
                return {
                    ...documents,
                    bookmarks: commanded(
                        documents.bookmarks,
                        action.store,
                        defaultBookmarks,
                        reduceBookmarks,
                        action.command,
                        seq,
                    ),
                };
            case 'signals': {
                const { command, store } = action;

                // Refused here, against the very state it would change: a source that reaches back is a loop.
                return command.kind === 'source' &&
                    command.source !== null &&
                    closesLoop(documents.signals, store, command.source)
                    ? documents
                    : {
                          ...documents,
                          signals: commanded(
                              documents.signals,
                              store,
                              defaultSignal,
                              reduceSignal,
                              command,
                              seq,
                          ),
                      };
            }
            case 'paintings':
                return {
                    ...documents,
                    paintings: commanded(
                        documents.paintings,
                        action.store,
                        defaultPicture,
                        reducePicture,
                        action.command,
                        seq,
                    ),
                };
            case 'pens':
                return {
                    ...documents,
                    pens: commanded(
                        documents.pens,
                        action.store,
                        defaultPen,
                        reducePen,
                        action.command,
                        seq,
                    ),
                };
            case 'voices':
                return {
                    ...documents,
                    voices: commanded(
                        documents.voices,
                        action.store,
                        defaultVoice,
                        reduceVoice,
                        action.command,
                        seq,
                    ),
                };
            case 'drums':
                return {
                    ...documents,
                    drums: commanded(
                        documents.drums,
                        action.store,
                        defaultDrums,
                        reduceDrums,
                        action.command,
                        seq,
                    ),
                };
            case 'gates': {
                const owner = ownerOf(documents.workspace, action.store);

                return owner === null || !isGateKind(owner)
                    ? documents
                    : {
                          ...documents,
                          gates: commanded(
                              documents.gates,
                              action.store,
                              GATE_DEFAULTS[owner],
                              reduceGate,
                              action.command,
                              seq,
                          ),
                      };
            }
            case 'boxes':
                return ownerOf(documents.workspace, action.store) !== 'box' ||
                    !documents.boxes.has(action.store)
                    ? documents
                    : {
                          ...documents,
                          boxes: commanded(
                              documents.boxes,
                              action.store,
                              EMPTY_BOX,
                              reduceBox,
                              action.command,
                              seq,
                          ),
                      };
            case 'box':
            case 'unbox': {
                const parts =
                    action.kind === 'box'
                        ? boxed(documents, action.ids, seq, inputsFor)
                        : unboxed(documents, action.id, seq, inputsFor);

                return parts === null ? documents : { ...documents, ...parts };
            }
            case 'pedals': {
                const owner = ownerOf(documents.workspace, action.store);

                return owner === null || !isPedalKind(owner)
                    ? documents
                    : {
                          ...documents,
                          pedals: commanded(
                              documents.pedals,
                              action.store,
                              defaultPedal(owner),
                              reducePedal,
                              action.command,
                              seq,
                          ),
                      };
            }
            case 'link': {
                const { store, param, source } = action;
                const owner = ownerOf(documents.workspace, store);
                const definition =
                    owner === null ? undefined : storeInputOf(inputsFor(owner), param);
                const from = source === null ? null : ownerOf(documents.workspace, source);

                return owner === null ||
                    definition === undefined ||
                    (source !== null &&
                        ((from !== null &&
                            !definition.sources.some(({ program }) => program === from)) ||
                            (!readsTickBefore(owner) &&
                                closesLoop(loopsOf(documents), store, source))))
                    ? documents
                    : keptSource(
                          linked(inputsFor, documents, owner, store, param, source, seq),
                          source,
                      );
            }
            case 'library': {
                const library = reduceLibrary(documents.library, action.command);

                return library === documents.library ? documents : { ...documents, library };
            }
            case 'blueprints': {
                const blueprints = reduceBlueprints(documents.blueprints, action.command, { seq });

                return blueprints === documents.blueprints
                    ? documents
                    : { ...documents, blueprints };
            }
            case 'paste':
                return placed(
                    documents,
                    { ...action.blueprint, id: 'clipboard' },
                    action.view,
                    seq,
                    inputsFor,
                );
            case 'place': {
                const blueprint = blueprintIn(documents.blueprints, action.blueprint);

                return blueprint === undefined
                    ? documents
                    : placed(documents, blueprint, action.view, seq, inputsFor);
            }
            case 'formula':
                return documents.formulas.get(action.formula)?.value === action.text
                    ? documents
                    : {
                          ...documents,
                          formulas: written(
                              documents.formulas,
                              action.formula,
                              action.text,
                              action.from,
                          ),
                      };
            case 'theme':
                return {
                    ...documents,
                    themes: written(documents.themes, action.theme, action.value, action.from),
                };
            case 'appearance':
                return {
                    ...documents,
                    looks: written(documents.looks, action.name, action.value, action.from),
                };
            case 'look':
                return action.name === documents.look
                    ? documents
                    : { ...documents, look: action.name };
            case 'aspect':
                return action.aspect === documents.aspect
                    ? documents
                    : { ...documents, aspect: action.aspect };
        }
    };

const idOf = (command: object) =>
    'id' in command && typeof command.id === 'string'
        ? command.id
        : 'param' in command && typeof command.param === 'string'
          ? command.param
          : 'name' in command && typeof command.name === 'string'
            ? command.name
            : '';

const JOINING: Readonly<Record<StoreDocument, readonly string[]>> = {
    tickets: ['rename', 'describe', 'rename-status'],
    notes: ['edit'],
    agendas: ['move', 'resize', 'rename'],
    habits: ['rename'],
    clocks: [],
    bookmarks: ['rename', 'readdress', 'rename-group'],
    signals: ['nudge', 'drag-wave', 'draw', 'set'],
    paintings: ['shift'],
    pens: ['weight'],
    voices: ['decay', 'glide', 'volume'],
    drums: ['swing', 'volume'],
    pedals: ['value'],
    gates: ['threshold', 'rename'],
    boxes: ['rename'],
};

export const stepOfDocument = (action: DocumentAction, before: Documents): StepKind => {
    switch (action.kind) {
        case 'workspace': {
            const step = workspaceStep(action.action);

            return step ?? { key: null, breaks: action.action.kind === 'raise' };
        }
        case 'prune':
        case 'library':
        case 'look':
        case 'aspect':
        case 'paste':
        case 'place':
        case 'box':
        case 'unbox':
            return { key: action.kind, joins: false };
        case 'blueprints':
            return action.command.kind === 'rename'
                ? { key: `blueprint:${action.command.id}`, joins: true }
                : { key: action.kind, joins: false };
        case 'link':
            return { key: `link:${action.store}:${action.param}`, joins: false };
        case 'settings':
            return viewOnly(before.settings.get(action.key), action.settings)
                ? { key: null, breaks: false }
                : { key: `settings:${action.key}`, joins: true };
        case 'formula':
            return { key: `formula:${action.formula}`, joins: true };
        case 'theme':
            return { key: `theme:${action.theme}`, joins: true };
        case 'appearance':
            return { key: `appearance:${action.name}`, joins: true };
        default: {
            const kind = action.command.kind;

            // A stroke joins only the moves of its own gesture: two strokes in a row are two steps.
            if (
                action.kind === 'drums' &&
                (action.command.kind === 'tap' || action.command.kind === 'paint')
            ) {
                return {
                    key: `drums:${action.store}:stroke`,
                    joins: action.command.kind === 'paint',
                };
            }

            if (action.kind === 'paintings' && action.command.kind === 'stroke') {
                return { key: `paintings:${action.store}:stroke`, joins: !action.command.start };
            }

            return {
                key: `${action.kind}:${action.store}:${kind}:${idOf(action.command)}`,
                joins: JOINING[action.kind].includes(kind),
            };
        }
    }
};

const TITLES: Readonly<Record<StoreDocument, string>> = {
    tickets: 'tickets',
    notes: 'notes',
    agendas: 'agenda',
    habits: 'habits',
    clocks: 'world clock',
    bookmarks: 'bookmarks',
    signals: 'signal',
    paintings: 'painting',
    pens: 'pen',
    voices: 'voice',
    drums: 'drum machine',
    pedals: 'pedal',
    gates: 'gate',
    boxes: 'component',
};

const storeName = ({ stores }: Workspace, id: StoreId) =>
    stores.find(store => store.id === id)?.name ?? (isProgramId(id) ? 'Main' : id);

export const labelOfDocument = (action: DocumentAction, before: Documents): string => {
    switch (action.kind) {
        case 'workspace':
            return workspaceLabel(action.action, before.workspace);
        case 'prune':
            return 'Pruned unused states';
        case 'link':
            return `Set ${storeName(before.workspace, action.store)} ${action.param} to follow ${
                action.source === null ? 'nothing' : storeName(before.workspace, action.source)
            }`;
        case 'settings':
            return action.settings.kind === 'state-map'
                ? 'Arranged the state map'
                : `Changed ${action.settings.kind} settings`;
        case 'library':
            return action.command.kind === 'remove'
                ? 'Deleted a formula'
                : `Saved formula ${action.command.label}`;
        case 'blueprints': {
            const { command } = action;
            const was = before.blueprints.items.find(
                ({ id }) => command.kind !== 'add' && id === command.id,
            );

            return command.kind === 'add'
                ? `Saved blueprint ${command.blueprint.name}`
                : command.kind === 'rename'
                  ? `Renamed blueprint ${was?.name ?? ''} to ${command.name}`
                  : `Deleted blueprint ${was?.name ?? ''}`;
        }
        case 'box':
            return `Made a component of ${action.ids.length} programs`;
        case 'unbox':
            return `Opened ${storeName(before.workspace, before.workspace.processes.find(({ id }) => id === action.id)?.store ?? '')}`;
        case 'paste':
            return `Pasted ${action.blueprint.windows.length} programs`;
        case 'place':
            return `Placed blueprint ${blueprintIn(before.blueprints, action.blueprint)?.name ?? ''}`;
        case 'formula':
            return `Edited formula ${before.library.items.find(({ id }) => id === action.formula)?.label ?? action.formula}`;
        case 'theme':
            return `Edited theme ${action.theme}`;
        case 'appearance':
            return `Edited the ${action.name} look`;
        case 'look':
            return `Switched to the ${action.name} look`;
        case 'aspect':
            return `Made pictures ${action.aspect}`;
        default:
            return `Edited ${TITLES[action.kind]} ${storeName(before.workspace, action.store)}`;
    }
};

// A restored edit is nobody's own: stamped by its writer, that writer's editor would never show it.
const restamped = <K, V>(
    restored: ReadonlyMap<K, Written<V>>,
    current: ReadonlyMap<K, Written<V>>,
) =>
    new Map(
        [...restored].map(([key, entry]): [K, Written<V>] => [
            key,
            current.get(key) === entry ? entry : { value: entry.value, from: null },
        ]),
    );

export const keptDocuments = (restored: Documents, current: Documents): Documents => ({
    ...restored,
    workspace: keepingView(restored.workspace, current.workspace),
    formulas: restamped(restored.formulas, current.formulas),
    themes: restamped(restored.themes, current.themes),
    looks: restamped(restored.looks, current.looks),
});

export const documentsKit = (inputsFor: InputsFor): Kit<Documents, DocumentAction> => ({
    reduce: reduceDocuments(inputsFor),
    settled: (action, before) =>
        action.kind === 'workspace'
            ? { kind: 'workspace', action: settledAction(before.workspace, action.action) }
            : action,
    stepOf: stepOfDocument,
    labelOf: labelOfDocument,
    kept: keptDocuments,
});

// A save from before the log had no sequence: start above every counter, so no new id meets an old one.
export const seqFloor = (documents: Documents) =>
    Math.max(
        documents.workspace.launched,
        documents.workspace.made,
        documents.library.made,
        ...[
            documents.tickets,
            documents.notes,
            documents.agendas,
            documents.habits,
            documents.bookmarks,
        ].flatMap(all => [...all.values()].map(({ made }) => made)),
    );

export type TimeCommand =
    | { readonly kind: 'undo' }
    | { readonly kind: 'redo' }
    | { readonly kind: 'travel'; readonly offset: number }
    | { readonly kind: 'take-back'; readonly id: number };

export type History = Timeline<Documents, DocumentAction>;

const isTime = (action: DocumentAction | TimeCommand): action is TimeCommand =>
    action.kind === 'undo' ||
    action.kind === 'redo' ||
    action.kind === 'travel' ||
    action.kind === 'take-back';

const timed = (kit: Kit<Documents, DocumentAction>, history: History, time: TimeCommand) => {
    switch (time.kind) {
        case 'undo':
            return undone(kit)(history);
        case 'redo':
            return redone(kit)(history);
        case 'travel':
            return travelled(kit)(history, Math.round(time.offset));
        case 'take-back':
            return takenBack(kit)(history, time.id);
    }
};

export const reduceHistory =
    (kit: Kit<Documents, DocumentAction>) =>
    (history: History, action: DocumentAction | TimeCommand): History => {
        if (isTime(action)) {
            return timed(kit, history, action);
        }

        const inner = action.kind === 'workspace' ? action.action : null;

        // Undo, redo and travel still also arrive as workspace actions, from the keys, the navigator and the palette.
        return inner?.kind === 'undo' || inner?.kind === 'redo' || inner?.kind === 'travel'
            ? timed(kit, history, inner)
            : logged(kit)(history, action);
    };
