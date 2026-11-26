import type { Sound } from './mix.ts';
import type { WireStyle } from './shared/connections.ts';
import type { Phase } from './shared/phase.ts';
import type { Appearance } from './appearance.ts';
import type { AppearanceName } from './appearances.ts';
import type { FormulaId, LibraryCommand } from './library.ts';
import type { BlueprintCommand } from './blueprints.ts';
import type { Theme } from './model/sketch/theme.ts';
import type { ThemeName } from './model/sketch/themes/registry.ts';
import type { Aspect } from './model/sketch/export.ts';
import type { NoteCommand } from './model/note.ts';
import type { FocusCommand } from './model/focus.ts';
import type { AgendaCommand } from './model/agenda.ts';
import type { HabitCommand } from './model/habits.ts';
import type { ClockCommand } from './model/clocks.ts';
import type { SignalCommand } from './shared/signal.ts';
import type { PaintCommand } from './model/paint.ts';
import type { PenCommand } from './model/pen.ts';
import type { SceneCommand } from './model/scene.ts';
import type { VoiceCommand } from './model/voice.ts';
import type { DrumsCommand } from './model/drums.ts';
import type { PedalCommand } from './pedals.ts';
import type { GateCommand } from './gates.ts';
import type { ConverterCommand } from './converters.ts';
import type { BoxCommand } from './boxes.ts';
import type { StateCommand } from './shared/connections.ts';
import type { BookmarkCommand } from './model/bookmarks.ts';
import type { TicketCommand } from './shared/tickets.ts';
import type { Settings } from './settings.ts';
import type { PlaybackBinding } from './inputs.ts';
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
    'scene',
    'voice',
    'drums',
    'mixer',
    'output',
    'colourmap',
    'kaleido',
    'feedback',
    'mix',
    'blur',
    'nand',
    'delay',
    'switch',
    'pattern',
    'compare',
    'lamp',
    'pin-in',
    'pin-out',
    'box',
    'schedule-level',
    'sound-level',
    'timer-level',
    'tasks-level',
    'level-level',
    'level-bit',
    'schedule-bit',
    'timer-bit',
    'tasks-bit',
    'sound-bit',
    'clock-level',
    'clock-bit',
    'zones-level',
    'zones-bit',
    'habits-level',
    'habits-bit',
    'picture-level',
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
    'streams',
    'state',
    'storybook',
] as const;

export type ProgramId = (typeof PROGRAM_IDS)[number];

export const isProgramId = (value: string): value is ProgramId =>
    PROGRAM_IDS.some(id => id === value);

export type ProcessId = string;

export type AppInput =
    | { readonly kind: 'scrub'; readonly phase: Phase; readonly at: number }
    | { readonly kind: 'transport'; readonly command: TransportCommand }
    | { readonly kind: 'duration'; readonly seconds: number }
    | { readonly kind: 'ticks'; readonly count: number }
    | { readonly kind: 'day' }
    | { readonly kind: 'source'; readonly formula: FormulaId; readonly text: string }
    | { readonly kind: 'theme'; readonly theme: ThemeName; readonly value: Theme }
    | { readonly kind: 'look'; readonly name: AppearanceName }
    | { readonly kind: 'aspect'; readonly aspect: Aspect }
    | { readonly kind: 'wires'; readonly wires: WireStyle }
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
    | { readonly kind: 'scene'; readonly command: SceneCommand }
    | { readonly kind: 'voice'; readonly command: VoiceCommand }
    | { readonly kind: 'drums'; readonly command: DrumsCommand }
    | {
          readonly kind: 'strip';
          readonly store: string;
          readonly program: Sound;
          readonly command: StripCommand;
      }
    | { readonly kind: 'listen' }
    | { readonly kind: 'solo'; readonly store: string }
    | { readonly kind: 'pedal'; readonly command: PedalCommand }
    | { readonly kind: 'gate'; readonly command: GateCommand }
    | { readonly kind: 'converter'; readonly command: ConverterCommand }
    | { readonly kind: 'box'; readonly command: BoxCommand }
    | { readonly kind: 'unbox' }
    | { readonly kind: 'why'; readonly input: string }
    | {
          readonly kind: 'modulate';
          readonly store: string;
          readonly param: string;
          readonly source: string | null;
      }
    | { readonly kind: 'convert'; readonly command: Extract<StateCommand, { kind: 'convert' }> }
    | {
          readonly kind: 'wiring';
          readonly command: Exclude<
              StateCommand,
              { kind: 'locate' | 'prune' | 'source' | 'convert' }
          >;
      }
    | { readonly kind: 'bookmark'; readonly command: BookmarkCommand }
    | { readonly kind: 'appearance'; readonly name: AppearanceName; readonly value: Appearance }
    | {
          readonly kind: 'diagnostic';
          readonly formula: FormulaId;
          readonly message: string | null;
      };

export type TaskCommand = 'reveal' | 'close';

export type StripCommand =
    | { readonly kind: 'volume'; readonly volume: number }
    | { readonly kind: 'mute'; readonly muted: boolean };

export type AppSignal = {
    readonly to: 'app';
    readonly from: ProcessId;
    readonly store: string;
    readonly clock: PlaybackBinding | null;
    readonly program: ProgramId;
    readonly input: AppInput;
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

export const CATEGORIES = [
    { id: 'make', title: 'Make', icon: 'M4 20 L9.5 9.5 L15 20 Z M14 4 H20 V10 H14 Z' },
    {
        id: 'logic',
        title: 'Logic',
        icon: 'M4 6 H11 A6 6 0 0 1 11 18 H4 Z M17 12 H21 M1 9 H4 M1 15 H4',
    },
    {
        id: 'convert',
        title: 'Convert',
        icon: 'M4 8 H15 M12 5 L15 8 L12 11 M20 16 H9 M12 13 L9 16 L12 19',
    },
    {
        id: 'plan',
        title: 'Plan',
        icon: 'M5 4 H19 V20 H5 Z M8.5 9 H15.5 M8.5 12.5 H15.5 M8.5 16 H12.5',
    },
    { id: 'system', title: 'System', icon: 'M4 7 H20 M4 17 H20 M9 4 V10 M15 14 V20' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];
