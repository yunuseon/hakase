import type { Image } from './image.ts';
import type { Observable } from 'rxjs';
import type { Phase } from './shared/drag.ts';
import type { Appearance } from './appearance.ts';
import type { AppearanceName } from './appearances.ts';
import type { FormulaId, Library, LibraryCommand } from './library.ts';
import type { BlueprintCommand, Blueprints } from './blueprints.ts';
import type { Theme } from './components/sketch/theme.ts';
import type { ThemeName } from './components/sketch/themes/registry.ts';
import type { Frame, Size } from './components/window/frame.ts';
import type { NoteCommand, Notes } from './components/note/note.ts';
import type { Focus, FocusCommand, Plan } from './components/focus/focus.ts';
import type { Agenda, AgendaCommand } from './components/agenda/agenda.ts';
import type { HabitCommand, Habits } from './components/habits/habits.ts';
import type { ClockCommand, Clocks } from './components/clocks/clocks.ts';
import type { Clock } from './shared/playhead.ts';
import type { Signal, SignalCommand, Wave } from './shared/signal.ts';
import type { Picture } from './shared/picture.ts';
import type { Sheet } from './shared/stroke.ts';
import type { Driver } from './shared/curve.ts';
import type { PaintCommand } from './components/paint/paint.ts';
import type { Drawing, PenCommand } from './components/pen/pen.ts';
import type { Sounding, VoiceCommand } from './components/voice/voice.ts';
import type { DrumsCommand, Kit } from './components/drums/drums.ts';
import type { StateGraph } from './components/state-map/state-map.ts';
import type { StateCommand } from './shared/connections.ts';
import type { BookmarkCommand, Bookmarks } from './components/bookmarks/bookmarks.ts';
import type { HistoryEntry } from './components/history/history.component.ts';
import type { TicketCommand, Tickets } from './shared/tickets.ts';
import type { Settings } from './settings.ts';
import type { ProgramInputs } from './inputs.ts';
import type { PlaybackBinding } from './inputs.ts';
import type { Reading } from './components/progress-bar/progress-bar.ts';
import type { TransportCommand } from './shared/playhead.ts';

export const PROGRAM_IDS = [
    'formula',
    'theme',
    'appearance',
    'sketch',
    'timeline',
    'playhead',
    'signal',
    'plot',
    'paint',
    'pen',
    'voice',
    'drums',
    'output',
    'blueprints',
    'tasks',
    'tickets',
    'note',
    'focus',
    'agenda',
    'progress',
    'habits',
    'clocks',
    'bookmarks',
    'history',
    'state',
    'storybook',
] as const;

export type ProgramId = (typeof PROGRAM_IDS)[number];

export const isProgramId = (value: string): value is ProgramId =>
    PROGRAM_IDS.some(id => id === value);

// One running instance. Several processes may share one ProgramId.
export type ProcessId = string;

// Collected from whichever processes run, so feeding app state needs no singleton.
export type AppInput =
    | { readonly kind: 'scrub'; readonly phase: Phase; readonly at: number }
    | { readonly kind: 'transport'; readonly command: TransportCommand }
    | { readonly kind: 'duration'; readonly seconds: number }
    | { readonly kind: 'source'; readonly formula: FormulaId; readonly text: string }
    | { readonly kind: 'theme'; readonly theme: ThemeName; readonly value: Theme }
    | { readonly kind: 'look'; readonly name: AppearanceName }
    | { readonly kind: 'task'; readonly command: TaskCommand; readonly id: ProcessId }
    | { readonly kind: 'locate'; readonly id: ProcessId }
    | { readonly kind: 'close-others' }
    | { readonly kind: 'prune' }
    | { readonly kind: 'travel'; readonly offset: number }
    | { readonly kind: 'take-back'; readonly id: number }
    | { readonly kind: 'settings'; readonly settings: Settings }
    | { readonly kind: 'library'; readonly command: LibraryCommand }
    | { readonly kind: 'blueprint'; readonly command: BlueprintCommand }
    | { readonly kind: 'place-blueprint'; readonly id: string }
    | { readonly kind: 'ticket'; readonly command: TicketCommand }
    | { readonly kind: 'note'; readonly command: NoteCommand }
    | { readonly kind: 'focus'; readonly command: FocusCommand }
    | { readonly kind: 'agenda'; readonly command: AgendaCommand }
    | { readonly kind: 'habit'; readonly command: HabitCommand }
    | { readonly kind: 'clock'; readonly command: ClockCommand }
    | { readonly kind: 'signal'; readonly command: SignalCommand }
    | { readonly kind: 'paint'; readonly command: PaintCommand }
    | { readonly kind: 'pen'; readonly command: PenCommand }
    | { readonly kind: 'voice'; readonly command: VoiceCommand }
    | { readonly kind: 'drums'; readonly command: DrumsCommand }
    | {
          readonly kind: 'modulate';
          readonly store: string;
          readonly param: string;
          readonly source: string | null;
      }
    | {
          readonly kind: 'wiring';
          readonly command: Exclude<StateCommand, { kind: 'locate' | 'prune' | 'source' }>;
      }
    | { readonly kind: 'bookmark'; readonly command: BookmarkCommand }
    | { readonly kind: 'appearance'; readonly name: AppearanceName; readonly value: Appearance }
    | {
          readonly kind: 'diagnostic';
          readonly formula: FormulaId;
          readonly message: string | null;
      };

export type TaskCommand = 'reveal' | 'close';

export type Task = {
    readonly id: ProcessId;
    readonly title: string;
    readonly icon: string;
    readonly ordinal: number;
    readonly focused: boolean;
};

export type AppState = {
    readonly reading$: Observable<Reading>;
    readonly plan$: Observable<Plan | null>;
    readonly playhead$: Observable<number>;
    readonly playing$: Observable<boolean>;
    readonly looping$: Observable<boolean>;
    readonly duration$: Observable<number>;
    // The window's clock whole: its position and its play state change together, and two projections would fire twice.
    readonly clock$: Observable<Clock>;
    readonly zoom$: Observable<number>;
    // Selectors, not streams: a formula is a document several processes may show.
    readonly source$: (formula: FormulaId) => Observable<Source>;
    readonly theme$: (theme: ThemeName) => Observable<Written<Theme>>;
    readonly error$: (formula: FormulaId) => Observable<string | null>;
    readonly look$: Observable<AppearanceName>;
    readonly library$: Observable<Library>;
    readonly blueprints$: Observable<Blueprints>;
    readonly tasks$: Observable<readonly Task[]>;
    readonly tickets$: Observable<Tickets>;
    readonly notes$: Observable<Notes>;
    readonly focus$: Observable<Focus>;
    readonly agenda$: Observable<Agenda>;
    readonly habits$: Observable<Habits>;
    readonly clocks$: Observable<Clocks>;
    readonly signal$: Observable<Signal>;
    readonly wave$: Observable<Wave>;
    readonly picture$: Observable<Picture>;
    readonly drawing$: Observable<Drawing>;
    readonly sounding$: Observable<Sounding>;
    readonly kit$: Observable<Kit>;
    // What a store input of the window's own store follows: the store's link, not the window's.
    readonly linkedPicture$: (param: string) => Observable<Sheet | null>;
    readonly linkedDriver$: (param: string) => Observable<Driver | null>;
    // A cable is a recipe, never pixels: the engine cooks it at this window's own moment.
    readonly followedImage$: (input: string) => Observable<Image>;
    // One stream, not a wave beside a name: a rebind changes both, and two would fire twice.
    readonly followedSignal$: (input: string) => Observable<FollowedSignal | null>;
    readonly bookmarks$: Observable<Bookmarks>;
    // Read-only, for the state map alone: any store or global, which no other program can see.
    readonly inspect$: (target: string) => Observable<unknown>;
    readonly history$: Observable<readonly HistoryEntry[]>;
    readonly graph$: Observable<StateGraph>;
    readonly appearance$: (name: AppearanceName) => Observable<Written<Appearance>>;
};

export type FollowedSignal = {
    readonly id: string;
    readonly name: string;
    readonly colour: string;
    readonly wave: Wave;
};

export type Written<T> = {
    readonly value: T;
    // null while the value is still the registry's own definition.
    readonly from: ProcessId | null;
};

export type Source = Written<string>;

export type Seen<T> = { readonly had: T | null; readonly write: T | null };

export const unseen: Seen<never> = { had: null, write: null };

// Measured from what the editor had, its own edits included: from what it last wrote, an undo to that value would never arrive.
export const seenBy =
    <T>(self: ProcessId, same: (a: T, b: T) => boolean, ownWrites?: (had: T, next: T) => boolean) =>
    (seen: Seen<T>, written: Written<T>, index: number): Seen<T> => {
        const had = seen.had;
        const changed = had === null || !same(had, written.value);
        const write =
            index === 0 ||
            (written.from !== self && changed) ||
            (had !== null && written.from === self && ownWrites?.(had, written.value) === true)
                ? written.value
                : null;

        return { had: written.value, write };
    };

export const restored = <K, V>(values: ReadonlyMap<K, V>): ReadonlyMap<K, Written<V>> =>
    new Map([...values].map(([key, value]): [K, Written<V>] => [key, { value, from: null }]));

export const valuesOf = <K, V>(written: ReadonlyMap<K, Written<V>>): ReadonlyMap<K, V> =>
    new Map([...written].map(([key, { value }]): [K, V] => [key, value]));

// One stream, not frame$ beside focused$: a raise changes both, and two would fire twice.
export type Slot = {
    readonly frame: Frame;
    readonly focused: boolean;
};

export type Self = {
    readonly id: ProcessId;
    readonly slot$: Observable<Slot>;
    // The store this window is bound to; its state arrives already narrowed to it.
    readonly store$: Observable<string>;
    // The clock this window runs on, which its playhead and duration are narrowed to.
    readonly clock$: Observable<PlaybackBinding | null>;
    // undefined until this process first changes a setting; each program supplies its own default.
    readonly settings$: Observable<Settings | undefined>;
};

export type ProcessView = {
    readonly element: HTMLElement;
    readonly run$: (state: AppState, self: Self) => Observable<AppInput>;
};

export const CATEGORIES = [
    { id: 'make', title: 'Make', icon: 'M4 20 L9.5 9.5 L15 20 Z M14 4 H20 V10 H14 Z' },
    {
        id: 'plan',
        title: 'Plan',
        icon: 'M5 4 H19 V20 H5 Z M8.5 9 H15.5 M8.5 12.5 H15.5 M8.5 16 H12.5',
    },
    { id: 'system', title: 'System', icon: 'M4 7 H20 M4 17 H20 M9 4 V10 M15 14 V20' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export type Program<K extends ProgramId = ProgramId> = {
    readonly inputs: ProgramInputs;
    readonly id: K;
    readonly title: string;
    readonly category: CategoryId;
    // Path data on a 24x24 viewBox: the program's face in the dock and on the desktop.
    readonly icon: string;
    readonly size: Size;
    // The smallest window its content still lays out in; the workspace clamps every resize to it.
    readonly minimum: Size;
    // A factory, not an element: two processes of one program need two elements.
    readonly launch: () => ProcessView;
};
