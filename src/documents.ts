import type { Appearance } from './appearance.ts';
import type { AppearanceName } from './appearances.ts';
import { reduceAgenda, type Agenda, type AgendaCommand } from './components/agenda/agenda.ts';
import {
    reduceBoard,
    defaultBoard,
    type Board,
    type BoardCommand,
} from './components/board/board.ts';
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
    defaultVoice,
    isVoiceParam,
    reduceVoice,
    type Voice,
    type VoiceCommand,
} from './components/voice/voice.ts';
import { isProgramId } from './program.ts';
import { placed, reducePieces, type PieceCommand, type Pieces } from './pieces.ts';
import type { Rect } from './shared/camera.ts';
import type { ThemeName } from './components/sketch/themes/registry.ts';
import {
    emptyTodos,
    reduceTodos,
    type TodoCommand,
    type TodoList,
} from './components/todo/todo.ts';
import { emptyAgenda } from './components/agenda/agenda.ts';
import type { InputsFor } from './inputs.ts';
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
    readonly todos: ReadonlyMap<StoreId, TodoList>;
    readonly boards: ReadonlyMap<StoreId, Board>;
    readonly notes: ReadonlyMap<StoreId, Notes>;
    readonly agendas: ReadonlyMap<StoreId, Agenda>;
    readonly habits: ReadonlyMap<StoreId, Habits>;
    readonly clocks: ReadonlyMap<StoreId, Clocks>;
    readonly bookmarks: ReadonlyMap<StoreId, Bookmarks>;
    readonly signals: ReadonlyMap<StoreId, Signal>;
    readonly paintings: ReadonlyMap<StoreId, Picture>;
    readonly pens: ReadonlyMap<StoreId, Pen>;
    readonly voices: ReadonlyMap<StoreId, Voice>;
    readonly library: Library;
    readonly pieces: Pieces;
    readonly formulas: ReadonlyMap<FormulaId, Written<string>>;
    readonly themes: ReadonlyMap<ThemeName, Written<Theme>>;
    readonly looks: ReadonlyMap<AppearanceName, Written<Appearance>>;
    readonly look: AppearanceName;
};

type StoreCommands = {
    readonly todos: TodoCommand;
    readonly boards: BoardCommand;
    readonly notes: NoteCommand;
    readonly agendas: AgendaCommand;
    readonly habits: HabitCommand;
    readonly clocks: ClockCommand;
    readonly bookmarks: BookmarkCommand;
    readonly signals: SignalCommand;
    readonly paintings: PaintCommand;
    readonly pens: PenCommand;
    readonly voices: VoiceCommand;
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
    | { readonly kind: 'library'; readonly command: LibraryCommand }
    | { readonly kind: 'pieces'; readonly command: PieceCommand }
    | { readonly kind: 'place'; readonly piece: string; readonly view: Rect }
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
    | { readonly kind: 'look'; readonly name: AppearanceName };

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
    todos: storeEvent(documents.todos, event),
    boards: storeEvent(documents.boards, event),
    notes: storeEvent(documents.notes, event),
    agendas: storeEvent(documents.agendas, event),
    habits: storeEvent(documents.habits, event),
    clocks: storeEvent(documents.clocks, event),
    bookmarks: storeEvent(documents.bookmarks, event),
    signals: storeEvent(documents.signals, event),
    paintings: storeEvent(documents.paintings, event),
    pens: storeEvent(documents.pens, event),
    voices: storeEvent(documents.voices, event),
});

export const linkedOf = ({
    signals,
    pens,
    voices,
}: Pick<Documents, 'signals' | 'pens' | 'voices'>) =>
    new Map<StoreId, Linked>([...signals, ...pens, ...voices]);

const ownerOf = ({ stores }: Workspace, store: StoreId) =>
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
            case 'todos':
                return {
                    ...documents,
                    todos: commanded(
                        documents.todos,
                        action.store,
                        emptyTodos,
                        reduceTodos,
                        action.command,
                        seq,
                    ),
                };
            case 'boards':
                return {
                    ...documents,
                    boards: commanded(
                        documents.boards,
                        action.store,
                        defaultBoard,
                        reduceBoard,
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
            case 'link': {
                const { store, param, source } = action;
                const owner = ownerOf(documents.workspace, store);

                return owner === 'signal' && isParam(param)
                    ? reduceDocuments(inputsFor)(
                          documents,
                          { kind: 'signals', store, command: { kind: 'source', param, source } },
                          seq,
                      )
                    : owner === 'pen' && isPenParam(param)
                      ? reduceDocuments(inputsFor)(
                            documents,
                            { kind: 'pens', store, command: { kind: 'source', param, source } },
                            seq,
                        )
                      : owner === 'voice' && isVoiceParam(param)
                        ? reduceDocuments(inputsFor)(
                              documents,
                              { kind: 'voices', store, command: { kind: 'source', param, source } },
                              seq,
                          )
                        : documents;
            }
            case 'library': {
                const library = reduceLibrary(documents.library, action.command);

                return library === documents.library ? documents : { ...documents, library };
            }
            case 'pieces': {
                const pieces = reducePieces(documents.pieces, action.command, { seq });

                return pieces === documents.pieces ? documents : { ...documents, pieces };
            }
            case 'place': {
                const piece = documents.pieces.items.find(({ id }) => id === action.piece);

                return piece === undefined
                    ? documents
                    : placed(documents, piece, action.view, seq, inputsFor);
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
        }
    };

const idOf = (command: object) =>
    'id' in command && typeof command.id === 'string'
        ? command.id
        : 'param' in command && typeof command.param === 'string'
          ? command.param
          : '';

const JOINING: Readonly<Record<StoreDocument, readonly string[]>> = {
    todos: [],
    boards: ['edit-card', 'rename-column'],
    notes: ['edit'],
    agendas: ['move', 'resize', 'rename'],
    habits: ['rename'],
    clocks: [],
    bookmarks: ['rename', 'readdress', 'rename-group'],
    signals: ['nudge', 'drag-wave', 'draw', 'set'],
    paintings: ['shift'],
    pens: ['weight'],
    voices: ['decay', 'glide', 'volume'],
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
        case 'place':
            return { key: action.kind, joins: false };
        case 'pieces':
            return action.command.kind === 'rename'
                ? { key: `piece:${action.command.id}`, joins: true }
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
    todos: 'todo list',
    boards: 'board',
    notes: 'notes',
    agendas: 'agenda',
    habits: 'habits',
    clocks: 'world clock',
    bookmarks: 'bookmarks',
    signals: 'signal',
    paintings: 'painting',
    pens: 'pen',
    voices: 'voice',
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
        case 'pieces': {
            const { command } = action;
            const was = before.pieces.items.find(
                ({ id }) => command.kind !== 'add' && id === command.id,
            );

            return command.kind === 'add'
                ? `Saved piece ${command.piece.name}`
                : command.kind === 'rename'
                  ? `Renamed piece ${was?.name ?? ''} to ${command.name}`
                  : `Deleted piece ${was?.name ?? ''}`;
        }
        case 'place':
            return `Placed piece ${before.pieces.items.find(({ id }) => id === action.piece)?.name ?? ''}`;
        case 'formula':
            return `Edited formula ${before.library.items.find(({ id }) => id === action.formula)?.label ?? action.formula}`;
        case 'theme':
            return `Edited theme ${action.theme}`;
        case 'appearance':
            return `Edited the ${action.name} look`;
        case 'look':
            return `Switched to the ${action.name} look`;
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
            documents.todos,
            documents.boards,
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
