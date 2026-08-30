import type { Observable } from 'rxjs';
import type { SketchResult } from './components/sketch/gl/sketch-program.ts';
import type { Frame } from './components/window/frame.ts';
import type { PanelParams } from './shared/params.ts';

export type ProgramId = 'formula' | 'sketch' | 'timeline' | 'playhead';

export const PROGRAM_IDS: readonly ProgramId[] = ['formula', 'sketch', 'timeline', 'playhead'];

// Streams of app state, and only that: one shaped for a single program belongs in it.
export type AppState = {
    readonly frame$: (id: ProgramId) => Observable<Frame>;
    readonly playhead$: Observable<number>;
    readonly panel$: Observable<PanelParams>;
    readonly preset$: Observable<string>;
    readonly compiled$: Observable<SketchResult>;
};

// One component, and the window that holds it. Neither half knows about the other,
// so this pairing is the only place allowed to know about both.
export type Program = {
    readonly id: ProgramId;
    readonly title: string;
    readonly kind: 'floating' | 'fitted';
    readonly content: HTMLElement;
    // A function, not a stream: this program is an input to the state it reads back.
    readonly connect$: (state: AppState) => Observable<void>;
};
