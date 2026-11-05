import { parsePen, type Pen } from './components/pen/pen.ts';
import { parseVoice, type Voice } from './components/voice/voice.ts';
import { parseDrums, type Drums } from './components/drums/drums.ts';
import { parsePicture, type Picture } from './shared/picture.ts';
import type { Observable } from 'rxjs';
import { debounceTime, map, tap } from 'rxjs/operators';
import { parseAppearance, type Appearance } from './appearance.ts';
import { appearances, defaultLook, isAppearanceName, type AppearanceName } from './appearances.ts';
import {
    emptyLibrary,
    isFormulaId,
    parseLibrary,
    type FormulaId,
    type Library,
} from './library.ts';
import { parseTheme, type Theme } from './components/sketch/theme.ts';
import { parseBoard, type Board } from './components/board/board.ts';
import { parseNotes, type Notes } from './components/note/note.ts';
import {
    parseFocus,
    parseFocusLink,
    type Focus,
    type FocusLink,
} from './components/focus/focus.ts';
import { parseAgenda, type Agenda } from './components/agenda/agenda.ts';
import { parseHabits, type Habits } from './components/habits/habits.ts';
import { parseClocks, type Clocks } from './components/clocks/clocks.ts';
import { parseBookmarks, type Bookmarks } from './components/bookmarks/bookmarks.ts';
import { parseSignal, type Signal } from './shared/signal.ts';
import { parseTodos, type TodoList } from './components/todo/todo.ts';
import { isThemeName, type ThemeName } from './components/sketch/themes/registry.ts';
import { readStored, writeStored } from './lib/storage.ts';
import type { ProcessId, ProgramId } from './program.ts';
import { keptStores, type StoreId } from './stores.ts';
import { parseSettings, type Settings } from './settings.ts';
import { parseClock, type Clock } from './shared/playhead.ts';
import type { InputsFor } from './inputs.ts';
import { parseWorkspace, type Workspace } from './workspace.ts';
import { emptyBlueprints, parseBlueprints, type Blueprints } from './blueprints.ts';

const KEY = 'hakase.state';
const VERSION = 1;
// Read only when hakase.state is absent, so a first run after the upgrade keeps its windows and look.
const LEGACY_WORKSPACE = 'hakase.workspace';
const LEGACY_APPEARANCE = 'hakase.appearance';
const SETTLE_MS = 250;

export type Snapshot = {
    readonly workspace: Workspace;
    readonly look: AppearanceName;
    readonly looks: ReadonlyMap<AppearanceName, Appearance>;
    readonly formulas: ReadonlyMap<FormulaId, string>;
    readonly themes: ReadonlyMap<ThemeName, Theme>;
    readonly playback: ReadonlyMap<StoreId, Clock>;
    readonly settings: ReadonlyMap<ProcessId, Settings>;
    readonly todos: ReadonlyMap<StoreId, TodoList>;
    readonly board: ReadonlyMap<StoreId, Board>;
    readonly notes: ReadonlyMap<StoreId, Notes>;
    readonly focus: ReadonlyMap<StoreId, Focus>;
    readonly agenda: ReadonlyMap<StoreId, Agenda>;
    readonly habits: ReadonlyMap<StoreId, Habits>;
    readonly clocks: ReadonlyMap<StoreId, Clocks>;
    readonly bookmarks: ReadonlyMap<StoreId, Bookmarks>;
    readonly signals: ReadonlyMap<StoreId, Signal>;
    readonly paint: ReadonlyMap<StoreId, Picture>;
    readonly pens: ReadonlyMap<StoreId, Pen>;
    readonly voices: ReadonlyMap<StoreId, Voice>;
    readonly drums: ReadonlyMap<StoreId, Drums>;
    readonly focusLinks: ReadonlyMap<StoreId, FocusLink>;
    readonly library: Library;
    readonly blueprints: Blueprints;
    readonly seq: number;
};

export type Restored = Omit<Snapshot, 'workspace'> & {
    readonly workspace: Workspace | null;
};

const entriesOf = (value: unknown): [string, unknown][] =>
    typeof value === 'object' && value !== null ? Object.entries(value) : [];

const field = (value: unknown, key: string): unknown =>
    entriesOf(value).find(([name]) => name === key)?.[1];

const looksFrom = (value: unknown): ReadonlyMap<AppearanceName, Appearance> =>
    new Map(
        entriesOf(value).flatMap(([name, stored]): [AppearanceName, Appearance][] => {
            if (!isAppearanceName(name)) {
                return [];
            }

            const appearance = parseAppearance(stored, appearances[name]);

            return appearance === null ? [] : [[name, appearance]];
        }),
    );

const lookFrom = (value: unknown): AppearanceName =>
    typeof value === 'string' && isAppearanceName(value) ? value : defaultLook;

const formulasFrom = (value: unknown): ReadonlyMap<FormulaId, string> =>
    new Map(
        entriesOf(value).flatMap(([name, text]): [FormulaId, string][] =>
            isFormulaId(name) && typeof text === 'string' ? [[name, text]] : [],
        ),
    );

const themesFrom = (value: unknown): ReadonlyMap<ThemeName, Theme> =>
    new Map(
        entriesOf(value).flatMap(([name, stored]): [ThemeName, Theme][] => {
            const theme = isThemeName(name) ? parseTheme(stored) : null;

            return isThemeName(name) && theme !== null ? [[name, theme]] : [];
        }),
    );

const seqFrom = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;

const settingsFrom = (value: unknown): ReadonlyMap<ProcessId, Settings> =>
    new Map(
        entriesOf(value).flatMap(([id, stored]): [ProcessId, Settings][] => {
            const settings = parseSettings(stored);

            return settings === null ? [] : [[id, settings]];
        }),
    );

// Saved before stores, a document was one value: it becomes its program's main store.
const byStore = <T>(
    value: unknown,
    program: ProgramId,
    parse: (stored: unknown) => T,
): ReadonlyMap<StoreId, T> => {
    const stores = field(value, 'byStore');

    if (stores !== undefined) {
        return new Map(entriesOf(stores).map(([id, stored]): [StoreId, T] => [id, parse(stored)]));
    }

    return value === undefined ? new Map() : new Map([[program, parse(value)]]);
};

const fresh: Restored = {
    workspace: null,
    look: defaultLook,
    looks: new Map(),
    formulas: new Map(),
    themes: new Map(),
    playback: new Map(),
    settings: new Map(),
    todos: new Map(),
    board: new Map(),
    notes: new Map(),
    focus: new Map(),
    agenda: new Map(),
    habits: new Map(),
    clocks: new Map(),
    bookmarks: new Map(),
    signals: new Map(),
    paint: new Map(),
    pens: new Map(),
    voices: new Map(),
    drums: new Map(),
    focusLinks: new Map(),
    library: emptyLibrary,
    blueprints: emptyBlueprints,
    seq: 0,
};

const legacy = (inputsFor: InputsFor): Restored => {
    const appearance = readStored(LEGACY_APPEARANCE);

    return {
        ...fresh,
        workspace: parseWorkspace(readStored(LEGACY_WORKSPACE), inputsFor),
        look: lookFrom(field(appearance, 'look')),
        looks: looksFrom(field(appearance, 'edits')),
    };
};

// Takes what programs read from other programs, so a saved follow is kept only where it still fits.
export const restoreState = (inputsFor: InputsFor): Restored => {
    const stored = readStored(KEY);

    if (field(stored, 'version') !== VERSION) {
        return legacy(inputsFor);
    }

    return {
        workspace: parseWorkspace(field(stored, 'workspace'), inputsFor),
        look: lookFrom(field(stored, 'look')),
        looks: looksFrom(field(stored, 'looks')),
        formulas: formulasFrom(field(stored, 'formulas')),
        themes: themesFrom(field(stored, 'themes')),
        // Saved before clocks were stores: the one clock there was becomes the timeline's main one.
        playback:
            field(stored, 'playback') === undefined
                ? new Map([
                      [
                          'timeline',
                          parseClock({
                              at: field(stored, 'playhead'),
                              looping: field(stored, 'looping'),
                              duration: field(stored, 'duration'),
                          }),
                      ],
                  ])
                : byStore(field(stored, 'playback'), 'timeline', parseClock),
        settings: settingsFrom(field(stored, 'settings')),
        todos: byStore(field(stored, 'todos'), 'todo', parseTodos),
        board: byStore(field(stored, 'board'), 'board', parseBoard),
        notes: byStore(field(stored, 'notes'), 'note', parseNotes),
        focus: byStore(field(stored, 'focus'), 'focus', parseFocus),
        agenda: byStore(field(stored, 'agenda'), 'agenda', parseAgenda),
        habits: byStore(field(stored, 'habits'), 'habits', parseHabits),
        clocks: byStore(field(stored, 'clocks'), 'clocks', parseClocks),
        bookmarks:
            field(stored, 'bookmarks') === undefined && field(stored, 'links') !== undefined
                ? new Map([['bookmarks', parseBookmarks(undefined, field(stored, 'links'))]])
                : byStore(field(stored, 'bookmarks'), 'bookmarks', value => parseBookmarks(value)),
        signals: byStore(field(stored, 'signals'), 'signal', parseSignal),
        paint: byStore(field(stored, 'paint'), 'paint', parsePicture),
        pens: byStore(field(stored, 'pens'), 'pen', parsePen),
        voices: byStore(field(stored, 'voices'), 'voice', parseVoice),
        drums: byStore(field(stored, 'drums'), 'drums', parseDrums),
        focusLinks: byStore(field(stored, 'focusLinks'), 'focus', parseFocusLink),
        library: parseLibrary(field(stored, 'library')),
        blueprints: parseBlueprints(
            field(stored, 'blueprints') ?? field(stored, 'pieces'),
            inputsFor,
        ),
        seq: seqFrom(field(stored, 'seq')),
    };
};

const serialised = (snapshot: Snapshot): unknown => {
    const { stores } = snapshot.workspace;
    const live = new Set([
        ...snapshot.workspace.processes.map(({ id }) => id),
        ...stores.map(({ id }) => id),
    ]);
    const saved = <T>(all: ReadonlyMap<StoreId, T>): unknown => ({
        byStore: Object.fromEntries(keptStores(all, stores)),
    });

    return {
        version: VERSION,
        workspace: snapshot.workspace,
        look: snapshot.look,
        looks: Object.fromEntries(snapshot.looks),
        formulas: Object.fromEntries(snapshot.formulas),
        themes: Object.fromEntries(snapshot.themes),
        playback: saved(snapshot.playback),
        settings: Object.fromEntries([...snapshot.settings].filter(([id]) => live.has(id))),
        todos: saved(snapshot.todos),
        board: saved(snapshot.board),
        notes: saved(snapshot.notes),
        focus: saved(snapshot.focus),
        agenda: saved(snapshot.agenda),
        habits: saved(snapshot.habits),
        clocks: saved(snapshot.clocks),
        bookmarks: saved(snapshot.bookmarks),
        signals: saved(snapshot.signals),
        paint: saved(snapshot.paint),
        pens: saved(snapshot.pens),
        voices: saved(snapshot.voices),
        drums: saved(snapshot.drums),
        focusLinks: saved(snapshot.focusLinks),
        library: snapshot.library,
        blueprints: snapshot.blueprints,
        seq: snapshot.seq,
    };
};

export const persistState$ = (snapshot$: Observable<Snapshot>): Observable<void> =>
    snapshot$.pipe(
        debounceTime(SETTLE_MS),
        tap(snapshot => {
            writeStored(KEY, serialised(snapshot));
        }),
        map(() => undefined),
    );
