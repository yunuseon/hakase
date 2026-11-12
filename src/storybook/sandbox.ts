import { DEFAULT_ASPECT } from '../components/sketch/animation.ts';
import type { AppInput } from '../program.ts';
import type { Settings } from '../settings.ts';
import { appearances, isAppearanceName, defaultLook, type AppearanceName } from '../appearances.ts';
import { themes, isThemeName } from '../components/sketch/themes/registry.ts';
import { emptyLibrary, reduceLibrary } from '../library.ts';
import { defaultTickets, reduceTickets, type TicketCommand } from '../shared/tickets.ts';
import { emptyNotes, reduceNotes } from '../components/note/note.ts';
import { initialFocus, reduceFocus } from '../components/focus/focus.ts';
import { emptyAgenda, reduceAgenda } from '../components/agenda/agenda.ts';
import { emptyHabits, reduceHabits } from '../components/habits/habits.ts';
import { defaultClocks, reduceClocks } from '../components/clocks/clocks.ts';
import { defaultBookmarks, reduceBookmarks } from '../components/bookmarks/bookmarks.ts';
import { defaultSignal, reduceSignal } from '../shared/signal.ts';
import { defaultPicture } from '../shared/picture.ts';
import { reducePicture } from '../components/paint/paint.ts';
import { defaultPen, reducePen } from '../components/pen/pen.ts';
import { initialClock, reduceTransport } from '../shared/playhead.ts';
import type { Appearance } from '../appearance.ts';
import type { Theme } from '../components/sketch/theme.ts';
import type { FormulaId } from '../library.ts';
import type { ThemeName } from '../components/sketch/themes/registry.ts';

const commands: readonly TicketCommand[] = [
    {
        kind: 'add',
        status: 'status-1',
        title: 'Document the design language',
        parent: null,
        tags: ['design'],
        description: 'Collect the shared patterns and their interactive states.',
        priority: 'high',
    },
    {
        kind: 'add',
        status: 'status-2',
        title: 'Build the component catalogue',
        parent: null,
        tags: ['design', 'engineering'],
        priority: 'medium',
    },
    {
        kind: 'add',
        status: 'status-3',
        title: 'Adopt lit-html',
        parent: null,
        tags: ['engineering'],
    },
];
export const exampleTickets = commands.reduce(
    (tickets, command) => reduceTickets(tickets, command),
    defaultTickets,
);

export const sandboxSeed = (settings: Settings | undefined, empty = false) => ({
    settings,
    tickets: empty ? defaultTickets : exampleTickets,
    notes: empty
        ? emptyNotes
        : {
              items: [
                  {
                      id: 'note-1',
                      text: 'A small, coherent interface\n\nQuiet controls, meaningful colour and space to think.',
                  },
              ],
              made: 1,
          },
    focus: initialFocus,
    agenda: emptyAgenda,
    habits: empty
        ? emptyHabits
        : {
              items: [
                  { id: 'habit-1', name: 'Make something', done: [] },
                  { id: 'habit-2', name: 'Read a little', done: [] },
              ],
              made: 2,
          },
    clocks: empty ? { zones: [] } : defaultClocks,
    bookmarks: defaultBookmarks,
    signal: defaultSignal,
    picture: defaultPicture,
    pen: defaultPen,
    clock: initialClock,
    library: emptyLibrary,
    look: defaultLook,
    aspect: DEFAULT_ASPECT,
    appearances: new Map<AppearanceName, Appearance>(
        Object.keys(appearances)
            .filter(isAppearanceName)
            .map(name => [name, appearances[name]]),
    ),
    themes: new Map<ThemeName, Theme>(
        Object.keys(themes)
            .filter(isThemeName)
            .map(name => [name, themes[name]]),
    ),
    sources: new Map<FormulaId, string>(),
});
export type Sandbox = ReturnType<typeof sandboxSeed>;

export type SandboxInput = AppInput | { readonly kind: 'advance'; readonly ms: number };
export const reduceSandbox = (state: Sandbox, input: SandboxInput): Sandbox => {
    switch (input.kind) {
        case 'advance':
            return {
                ...state,
                clock: {
                    ...state.clock,
                    ...reduceTransport(state.clock, {
                        kind: 'advance',
                        ms: input.ms,
                        duration: state.clock.duration,
                    }),
                },
                focus: reduceFocus(state.focus, { kind: 'tick', ms: input.ms }),
            };
        case 'settings':
            return { ...state, settings: input.settings };
        case 'ticket':
            return { ...state, tickets: reduceTickets(state.tickets, input.command) };
        case 'note':
            return { ...state, notes: reduceNotes(state.notes, input.command) };
        case 'focus':
            return {
                ...state,
                focus: reduceFocus(state.focus, { kind: 'command', command: input.command }),
            };
        case 'agenda':
            return { ...state, agenda: reduceAgenda(state.agenda, input.command) };
        case 'habit':
            return { ...state, habits: reduceHabits(state.habits, input.command) };
        case 'clock':
            return { ...state, clocks: reduceClocks(state.clocks, input.command) };
        case 'bookmark':
            return { ...state, bookmarks: reduceBookmarks(state.bookmarks, input.command) };
        case 'signal':
            return { ...state, signal: reduceSignal(state.signal, input.command) };
        case 'paint':
            return { ...state, picture: reducePicture(state.picture, input.command) };
        case 'pen':
            return { ...state, pen: reducePen(state.pen, input.command) };
        case 'library':
            return { ...state, library: reduceLibrary(state.library, input.command) };
        case 'look':
            return { ...state, look: input.name };
        case 'aspect':
            return { ...state, aspect: input.aspect };
        case 'appearance':
            return {
                ...state,
                appearances: new Map([...state.appearances, [input.name, input.value]]),
            };
        case 'theme':
            return { ...state, themes: new Map([...state.themes, [input.theme, input.value]]) };
        case 'source':
            return { ...state, sources: new Map([...state.sources, [input.formula, input.text]]) };
        case 'duration':
            return { ...state, clock: { ...state.clock, duration: input.seconds } };
        case 'scrub':
            return {
                ...state,
                clock: {
                    ...state.clock,
                    ...reduceTransport(state.clock, {
                        kind: 'scrub',
                        scrub: { phase: input.phase, at: input.at },
                    }),
                },
            };
        case 'transport':
            return {
                ...state,
                clock: {
                    ...state.clock,
                    ...reduceTransport(state.clock, { kind: 'command', command: input.command }),
                },
            };
        default:
            return state;
    }
};
