import type { Observable } from 'rxjs';
import type { FormulaName } from './components/sketch/formulas/registry.ts';
import type { Frame, Size } from './components/window/frame.ts';
import type { TransportCommand } from './shared/playhead.ts';

export type ProgramId = 'formula' | 'sketch' | 'timeline' | 'playhead';

export const PROGRAM_IDS: readonly ProgramId[] = ['formula', 'sketch', 'timeline', 'playhead'];

export const isProgramId = (value: string): value is ProgramId =>
    PROGRAM_IDS.some(id => id === value);

/** Identifies one running instance. Several may share a ProgramId. */
export type ProcessId = string;

// Collected from whichever processes run, so feeding app state needs no singleton.
export type AppInput =
    | { readonly kind: 'scrub'; readonly at: number }
    | { readonly kind: 'transport'; readonly command: TransportCommand }
    | { readonly kind: 'source'; readonly formula: FormulaName; readonly text: string }
    | {
          readonly kind: 'diagnostic';
          readonly formula: FormulaName;
          readonly message: string | null;
      };

/** Streams of app state, shared by every process. */
export type AppState = {
    readonly playhead$: Observable<number>;
    readonly playing$: Observable<boolean>;
    readonly duration$: Observable<number>;
    // Selectors, not streams: a formula is a document several processes may show.
    readonly source$: (formula: FormulaName) => Observable<Source>;
    readonly error$: (formula: FormulaName) => Observable<string | null>;
};

/** A formula's current text, and which process last wrote it. */
export type Source = {
    readonly text: string;
    /** null while it is still the registry's own definition. */
    readonly from: ProcessId | null;
};

/** The state one process has that its siblings do not. */
export type Self = {
    readonly id: ProcessId;
    readonly frame$: Observable<Frame>;
};

export type ProcessView = {
    readonly element: HTMLElement;
    readonly run$: (state: AppState, self: Self) => Observable<AppInput>;
};

export type Program = {
    readonly id: ProgramId;
    readonly title: string;
    readonly kind: 'floating' | 'fitted';
    /** Path data on a 24x24 viewBox: the program's face in the dock and on the desktop. */
    readonly icon: string;
    readonly size: Size;
    // A factory, not an element: two processes of one program need two elements.
    readonly launch: () => ProcessView;
};
