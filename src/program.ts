import type { Observable } from 'rxjs';
import type { Phase } from './shared/drag.ts';
import type { Appearance } from './appearance.ts';
import type { AppearanceName } from './appearances.ts';
import type { FormulaId, Library, LibraryCommand } from './library.ts';
import type { Theme } from './components/sketch/theme.ts';
import type { ThemeName } from './components/sketch/themes/registry.ts';
import type { Frame, Size } from './components/window/frame.ts';
import type { Board, BoardCommand } from './components/board/board.ts';
import type { NoteCommand, Notes } from './components/note/note.ts';
import type { Todo, TodoCommand } from './components/todo/todo.ts';
import type { Settings } from './settings.ts';
import type { TransportCommand } from './shared/playhead.ts';

export const PROGRAM_IDS = [
    'formula',
    'theme',
    'appearance',
    'sketch',
    'timeline',
    'playhead',
    'tasks',
    'todo',
    'board',
    'note',
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
    | { readonly kind: 'close-others' }
    | { readonly kind: 'settings'; readonly settings: Settings }
    | { readonly kind: 'library'; readonly command: LibraryCommand }
    | { readonly kind: 'todo'; readonly command: TodoCommand }
    | { readonly kind: 'board'; readonly command: BoardCommand }
    | { readonly kind: 'note'; readonly command: NoteCommand }
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
    readonly playhead$: Observable<number>;
    readonly playing$: Observable<boolean>;
    readonly looping$: Observable<boolean>;
    readonly duration$: Observable<number>;
    readonly zoom$: Observable<number>;
    // Selectors, not streams: a formula is a document several processes may show.
    readonly source$: (formula: FormulaId) => Observable<Source>;
    readonly theme$: (theme: ThemeName) => Observable<Written<Theme>>;
    readonly error$: (formula: FormulaId) => Observable<string | null>;
    readonly look$: Observable<AppearanceName>;
    readonly library$: Observable<Library>;
    readonly tasks$: Observable<readonly Task[]>;
    readonly todos$: Observable<readonly Todo[]>;
    readonly board$: Observable<Board>;
    readonly notes$: Observable<Notes>;
    readonly appearance$: (name: AppearanceName) => Observable<Written<Appearance>>;
};

export type Written<T> = {
    readonly value: T;
    // null while the value is still the registry's own definition.
    readonly from: ProcessId | null;
};

export type Source = Written<string>;

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
    // undefined until this process first changes a setting; each program supplies its own default.
    readonly settings$: Observable<Settings | undefined>;
};

export type ProcessView = {
    readonly element: HTMLElement;
    readonly run$: (state: AppState, self: Self) => Observable<AppInput>;
};

export type Program = {
    readonly id: ProgramId;
    readonly title: string;
    // Path data on a 24x24 viewBox: the program's face in the dock and on the desktop.
    readonly icon: string;
    readonly size: Size;
    // The smallest window its content still lays out in; the workspace clamps every resize to it.
    readonly minimum: Size;
    // A factory, not an element: two processes of one program need two elements.
    readonly launch: () => ProcessView;
};
