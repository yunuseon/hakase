import { DEFAULT_ASPECT, isAspect, type Aspect } from './components/sketch/animation.ts';
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
import { parseTickets, type Tickets } from './shared/tickets.ts';
import { isThemeName, type ThemeName } from './components/sketch/themes/registry.ts';
import { readStored, writeStored } from './lib/storage.ts';
import type { ProcessId } from './program.ts';
import { keptStores, renamedStore, type StoreId } from './stores.ts';
import { parseSettings, type Settings } from './settings.ts';
import { parseClock, type Clock } from './shared/playhead.ts';
import type { InputsFor } from './inputs.ts';
import { formerStoreFollows, parseWorkspace, type Workspace } from './workspace.ts';
import { parseStoredPedal, type Pedal } from './pedals.ts';
import { GATE_DEFAULTS, parseGate, type Gate } from './gates.ts';
import { parseBox, type Box } from './boxes.ts';
import {
    isSketchParam,
    linkedSketch,
    parseSketchLink,
    unlinkedSketch,
    type SketchLink,
} from './components/sketch/links.ts';
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
    readonly aspect: Aspect;
    readonly looks: ReadonlyMap<AppearanceName, Appearance>;
    readonly formulas: ReadonlyMap<FormulaId, string>;
    readonly themes: ReadonlyMap<ThemeName, Theme>;
    readonly playback: ReadonlyMap<StoreId, Clock>;
    readonly settings: ReadonlyMap<ProcessId, Settings>;
    readonly tickets: ReadonlyMap<StoreId, Tickets>;
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
    readonly pedals: ReadonlyMap<StoreId, Pedal>;
    readonly gates: ReadonlyMap<StoreId, Gate>;
    readonly boxes: ReadonlyMap<StoreId, Box>;
    readonly focusLinks: ReadonlyMap<StoreId, FocusLink>;
    readonly sketchLinks: ReadonlyMap<StoreId, SketchLink>;
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

// A constant left at its default 1 saved no document, and as a switch it would read 0.
const constantsFrom = (stored: unknown): [StoreId, Gate][] => {
    const stores = field(field(stored, 'workspace'), 'stores');

    return (Array.isArray(stores) ? stores : []).flatMap((entry): [StoreId, Gate][] => {
        const id = field(entry, 'id');

        return field(entry, 'program') === 'const' && typeof id === 'string'
            ? [[id, { ...GATE_DEFAULTS.switch, value: 1 }]]
            : [];
    });
};

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

const aspectFrom = (value: unknown): Aspect => (isAspect(value) ? value : DEFAULT_ASPECT);

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
    program: StoreId,
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
    aspect: DEFAULT_ASPECT,
    looks: new Map(),
    formulas: new Map(),
    themes: new Map(),
    playback: new Map(),
    settings: new Map(),
    tickets: new Map(),
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
    sketchLinks: new Map(),
    pedals: new Map(),
    gates: new Map(),
    boxes: new Map(),
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

// Saved before tickets: to-do lists and boards both become ticket lists, the to-do list's Main the tickets' Main.
const ticketsFrom = (stored: unknown): ReadonlyMap<StoreId, Tickets> => {
    const current = field(stored, 'tickets');

    return current !== undefined
        ? byStore(current, 'tickets', parseTickets)
        : new Map([
              ...[...byStore(field(stored, 'todos'), 'tickets', parseTickets)].map(
                  ([id, tickets]) => [renamedStore(id), tickets] as const,
              ),
              ...byStore(field(stored, 'board'), 'board', parseTickets),
          ]);
};

const ticketViews = (stored: unknown): ReadonlyMap<ProcessId, Settings> => {
    const settings = settingsFrom(field(stored, 'settings'));
    const processes = field(field(stored, 'workspace'), 'processes');

    return new Map([
        ...(Array.isArray(processes)
            ? processes.flatMap((process: unknown): [ProcessId, Settings][] => {
                  const id = field(process, 'id');
                  return typeof id === 'string' && field(process, 'program') === 'board'
                      ? [[id, { kind: 'tickets', view: 'board' }]]
                      : [];
              })
            : []),
        ...settings,
    ]);
};

// A board's old Main is no program's main store now: without an entry, the next save would drop it.
const withBoard = (
    workspace: Workspace | null,
    tickets: ReadonlyMap<StoreId, Tickets>,
): Workspace | null =>
    workspace === null || !tickets.has('board') || workspace.stores.some(({ id }) => id === 'board')
        ? workspace
        : {
              ...workspace,
              stores: [
                  ...workspace.stores,
                  {
                      id: 'board',
                      program: 'tickets',
                      name: 'Board',
                      kept: true,
                      copy: null,
                      clock: null,
                  },
              ],
          };

const sketchLinksFrom = (
    stored: unknown,
    inputsFor: InputsFor,
): ReadonlyMap<StoreId, SketchLink> => {
    const saved = byStore(field(stored, 'sketchLinks'), 'sketch', parseSketchLink);
    const processes = field(field(stored, 'workspace'), 'processes');
    const former = Array.isArray(processes)
        ? processes.flatMap((process: unknown) => formerStoreFollows(process, inputsFor))
        : [];

    return former.reduce(
        (all, [store, param, source]) =>
            saved.has(store) || !isSketchParam(param)
                ? all
                : new Map(all).set(
                      store,
                      linkedSketch(all.get(store) ?? unlinkedSketch, param, source),
                  ),
        saved,
    );
};

// Takes what programs read from other programs, so a saved follow is kept only where it still fits.
export const parseSnapshot = (stored: unknown, inputsFor: InputsFor): Restored | null => {
    if (field(stored, 'version') !== VERSION) {
        return null;
    }

    return {
        workspace: withBoard(
            parseWorkspace(field(stored, 'workspace'), inputsFor),
            ticketsFrom(stored),
        ),
        look: lookFrom(field(stored, 'look')),
        aspect: aspectFrom(field(stored, 'aspect')),
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
        settings: ticketViews(stored),
        tickets: ticketsFrom(stored),
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
        gates: new Map([
            ...constantsFrom(stored),
            ...[...byStore(field(stored, 'gates'), 'gates', parseGate)].flatMap(
                ([id, gate]): [StoreId, Gate][] => (gate === null ? [] : [[id, gate]]),
            ),
        ]),
        boxes: new Map(
            [
                ...byStore(field(stored, 'boxes'), 'boxes', value => parseBox(value, inputsFor)),
            ].flatMap(([id, box]): [StoreId, Box][] => (box === null ? [] : [[id, box]])),
        ),
        pedals: new Map(
            [...byStore(field(stored, 'pedals'), 'pedals', parseStoredPedal)].flatMap(
                ([id, pedal]): [StoreId, Pedal][] => (pedal === null ? [] : [[id, pedal]]),
            ),
        ),
        focusLinks: byStore(field(stored, 'focusLinks'), 'focus', parseFocusLink),
        sketchLinks: sketchLinksFrom(stored, inputsFor),
        library: parseLibrary(field(stored, 'library')),
        blueprints: parseBlueprints(
            field(stored, 'blueprints') ?? field(stored, 'pieces'),
            inputsFor,
        ),
        seq: seqFrom(field(stored, 'seq')),
    };
};

export const restoreState = (inputsFor: InputsFor): Restored =>
    parseSnapshot(readStored(KEY), inputsFor) ?? legacy(inputsFor);

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
        aspect: snapshot.aspect,
        looks: Object.fromEntries(snapshot.looks),
        formulas: Object.fromEntries(snapshot.formulas),
        themes: Object.fromEntries(snapshot.themes),
        playback: saved(snapshot.playback),
        settings: Object.fromEntries([...snapshot.settings].filter(([id]) => live.has(id))),
        tickets: saved(snapshot.tickets),
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
        sketchLinks: saved(snapshot.sketchLinks),
        pedals: saved(snapshot.pedals),
        gates: saved(snapshot.gates),
        boxes: saved(snapshot.boxes),
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
