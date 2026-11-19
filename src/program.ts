import type { Sound } from './mix.ts';
import type { WireStyle } from './shared/connections.ts';
import type { Image } from './image.ts';
import type { Observable } from 'rxjs';
import type { Appearance } from './appearance.ts';
import type { AppearanceName } from './appearances.ts';
import type { FormulaId, Library } from './library.ts';
import type { Blueprints } from './blueprints.ts';
import type { Theme } from './model/sketch/theme.ts';
import type { ThemeName } from './model/sketch/themes/registry.ts';
import type { Frame, Size } from './layout/frame.ts';
import type { Aspect } from './model/sketch/export.ts';
import type { Notes } from './model/note.ts';
import type { Focus, Plan } from './model/focus.ts';
import type { Agenda } from './model/agenda.ts';
import type { Habits } from './model/habits.ts';
import type { Clocks } from './model/clocks.ts';
import type { Clock } from './shared/playhead.ts';
import type { Signal, Wave } from './shared/signal.ts';
import type { Picture } from './shared/picture.ts';
import type { Sheet } from './shared/stroke.ts';
import type { Driver } from './shared/curve.ts';
import type { Drawing } from './model/pen.ts';
import type { Sounding } from './model/voice.ts';
import type { Kit } from './model/drums.ts';
import type { Pedal } from './pedals.ts';
import type { Gate } from './gates.ts';
import type { Conversion } from './converters.ts';
import type { BoxReading } from './boxes.ts';
import type { StateGraph } from './components/state-map/state-map.ts';
import type { Bookmarks } from './model/bookmarks.ts';
import type { HistoryEntry } from './components/history/history.component.ts';
import type { Tickets } from './shared/tickets.ts';
import type { Settings } from './settings.ts';
import type { Declaration } from './declarations.ts';
import type { PlaybackBinding } from './inputs.ts';
import type { Reading } from './model/reading.ts';

import type { AppInput, ProcessId, ProgramId, Source, Written } from './protocol.ts';

export type Task = {
    readonly id: ProcessId;
    readonly title: string;
    readonly icon: string;
    readonly ordinal: number;
    readonly focused: boolean;
};

export type MixStrip = {
    readonly store: string;
    readonly program: Sound;
    readonly name: string;
    readonly colour: string;
    readonly volume: number;
    readonly muted: boolean;
    // What plays its level, when something does; null while the fader is the user's.
    readonly chain: string | null;
};

export type AppState = {
    readonly listening$: Observable<boolean>;
    readonly soloed$: Observable<ReadonlySet<string>>;
    readonly mix$: Observable<readonly MixStrip[]>;
    readonly meter$: (store: string) => Observable<number>;
    readonly reading$: Observable<Reading>;
    readonly plan$: Observable<Plan | null>;
    readonly playhead$: Observable<number>;
    readonly playing$: Observable<boolean>;
    readonly looping$: Observable<boolean>;
    readonly duration$: Observable<number>;
    readonly ticks$: Observable<number>;
    // The window's clock whole: its position and its play state change together, and two projections would fire twice.
    readonly clock$: Observable<Clock>;
    readonly zoom$: Observable<number>;
    // Selectors, not streams: a formula is a document several processes may show.
    readonly source$: (formula: FormulaId) => Observable<Source>;
    readonly theme$: (theme: ThemeName) => Observable<Written<Theme>>;
    readonly error$: (formula: FormulaId) => Observable<string | null>;
    readonly look$: Observable<AppearanceName>;
    readonly aspect$: Observable<Aspect>;
    readonly wires$: Observable<WireStyle>;
    readonly previewSide$: Observable<number>;
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
    readonly pedal$: Observable<Pedal>;
    readonly gate$: Observable<Gate>;
    readonly conversion$: Observable<Conversion>;
    readonly bits$: Observable<Uint8Array>;
    readonly box$: Observable<BoxReading>;
    readonly linkedPicture$: (param: string) => Observable<Sheet | null>;
    readonly linkedDriver$: (param: string) => Observable<Driver | null>;
    readonly followedImage$: (input: string) => Observable<Image>;
    readonly image$: Observable<Image>;
    readonly linkedName$: (param: string) => Observable<string | null>;
    readonly chains$: Observable<ReadonlyMap<string, string>>;
    // One stream, not a wave beside a name: a rebind changes both, and two would fire twice.
    readonly followedLevel$: (input: string) => Observable<FollowedLevel | null>;
    readonly bookmarks$: Observable<Bookmarks>;
    // Read-only, for the state map alone: any store or global, which no other program can see.
    readonly inspect$: (target: string) => Observable<unknown>;
    readonly history$: Observable<readonly HistoryEntry[]>;
    readonly graph$: Observable<StateGraph>;
    readonly appearance$: (name: AppearanceName) => Observable<Written<Appearance>>;
};

export type FollowedLevel = {
    readonly id: string;
    readonly name: string;
    readonly colour: string;
    readonly driver: Driver;
};

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

// One stream, not frame$ beside focused$: a raise changes both, and two would fire twice.
export type Slot = {
    readonly frame: Frame;
    readonly focused: boolean;
    readonly folded: boolean;
    readonly wired: number;
};

export type Self = {
    readonly id: ProcessId;
    readonly slot$: Observable<Slot>;
    readonly store$: Observable<string>;
    readonly clock$: Observable<PlaybackBinding | null>;
    // undefined until this process first changes a setting; each program supplies its own default.
    readonly settings$: Observable<Settings | undefined>;
};

export type ProcessView = {
    readonly element: HTMLElement;
    readonly actions?: HTMLElement;
    readonly run$: (state: AppState, self: Self) => Observable<AppInput>;
};

export type Program<K extends ProgramId = ProgramId> = Declaration<K> & {
    readonly size: Size;
    // The smallest window its content still lays out in; the workspace clamps every resize to it.
    readonly minimum: Size;
    // A factory, not an element: two processes of one program need two elements. A promise, so a program's component loads with its first window.
    readonly launch: () => Promise<ProcessView>;
};
