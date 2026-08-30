import type { Observable } from 'rxjs';
import type { Frame } from './components/window/frame.ts';
import type { CanvasSize, PanelParams } from './shared/params.ts';
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
    | { readonly kind: 'source'; readonly text: string }
    | { readonly kind: 'diagnostic'; readonly message: string | null };

/** Streams of app state, shared by every process. */
export type AppState = {
    readonly playhead$: Observable<number>;
    readonly playing$: Observable<boolean>;
    readonly duration$: Observable<number>;
    readonly panel$: Observable<PanelParams>;
    readonly source$: Observable<string>;
    readonly error$: Observable<string | null>;
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
    readonly size: CanvasSize;
    // A factory, not an element: two processes of one program need two elements.
    readonly launch: () => ProcessView;
};
