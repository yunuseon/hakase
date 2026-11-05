import { defaultTickets } from './shared/tickets.ts';
import type { Size } from './components/window/frame.ts';
import type { Bindings } from './inputs.ts';
import type { Blueprint, BlueprintWindow, Blueprints } from './blueprints.ts';
import type { ProgramId } from './program.ts';
import type { Settings } from './settings.ts';
import type { StoreEntry, StoreId } from './stores.ts';

export type Starter = Blueprint & { readonly summary: string };

const held = {
    tickets: [],
    notes: [],
    agendas: [],
    habits: [],
    clocks: [],
    bookmarks: [],
    signals: [],
    paintings: [],
    pens: [],
    voices: [],
    drums: [],
} satisfies Blueprint['held'];

const opened = (
    id: string,
    program: ProgramId,
    store: StoreId,
    { x, y, width, height }: { readonly x: number; readonly y: number } & Size,
    follows: Bindings = {},
    settings: Settings | null = null,
): BlueprintWindow => ({
    id,
    program,
    store,
    follows,
    frame: { x, y, z: 0, width, height },
    measured: { width, height },
    settings,
});

const own = (id: StoreId, program: ProgramId, name: string): StoreEntry => ({
    id,
    program,
    name,
    kept: true,
    copy: null,
    clock: null,
});

const REVIEW = `Daily review

Went well
-

Did not go to plan
-

Tomorrow's top three
1.
2.
3.
`;

// A window on a store the blueprint does not list keeps that id when placed, so these work on the main tickets, agenda, habits and timer.
export const STARTERS: readonly Starter[] = [
    {
        id: 'starter-today',
        name: 'Today',
        summary: 'Your agenda, where you are in it, and how far through your to-dos you are.',
        size: { width: 684, height: 592 },
        windows: [
            opened('agenda', 'agenda', 'agenda', { x: 24, y: 48, width: 320, height: 520 }),
            opened(
                'progress',
                'progress',
                'progress',
                { x: 360, y: 48, width: 300, height: 130 },
                { source: { kind: 'agenda', store: 'agenda' } },
            ),
            opened(
                'todo',
                'tickets',
                'tickets',
                { x: 360, y: 194, width: 300, height: 228 },
                {},
                { kind: 'tickets', view: 'list' },
            ),
            opened(
                'done',
                'progress',
                'progress',
                { x: 360, y: 438, width: 300, height: 130 },
                { source: { kind: 'tickets', store: 'tickets' } },
            ),
        ],
        stores: [],
        held,
        formulas: [],
        links: [],
    },
    {
        id: 'starter-focus-session',
        name: 'Focus session',
        summary:
            'A fresh ticket board for the work, the focus timer, and how far the phase has run.',
        size: { width: 1044, height: 558 },
        windows: [
            opened(
                'board',
                'tickets',
                'session',
                { x: 24, y: 48, width: 720, height: 486 },
                {},
                { kind: 'tickets', view: 'board' },
            ),
            opened('focus', 'focus', 'focus', { x: 760, y: 48, width: 260, height: 340 }),
            opened(
                'progress',
                'progress',
                'progress',
                { x: 760, y: 404, width: 260, height: 130 },
                { source: { kind: 'focus', store: 'focus' } },
            ),
        ],
        stores: [own('session', 'tickets', 'Focus session')],
        held: { ...held, tickets: [['session', defaultTickets]] },
        formulas: [],
        links: [],
    },
    {
        id: 'starter-daily-review',
        name: 'Daily review',
        summary: 'A fresh review note for tonight, your habits, and what to carry over.',
        size: { width: 864, height: 512 },
        windows: [
            opened(
                'note',
                'note',
                'review',
                { x: 24, y: 48, width: 340, height: 440 },
                {},
                { kind: 'note', note: 'note-1' },
            ),
            opened('habits', 'habits', 'habits', { x: 380, y: 48, width: 460, height: 220 }),
            opened(
                'todo',
                'tickets',
                'tickets',
                { x: 380, y: 284, width: 460, height: 204 },
                {},
                { kind: 'tickets', view: 'list' },
            ),
        ],
        stores: [own('review', 'note', 'Daily review')],
        held: {
            ...held,
            notes: [['review', { items: [{ id: 'note-1', text: REVIEW }], made: 1 }]],
        },
        formulas: [],
        links: [],
    },
];

export const blueprintIn = (blueprints: Blueprints, id: string): Blueprint | undefined =>
    STARTERS.find(starter => starter.id === id) ??
    blueprints.items.find(blueprint => blueprint.id === id);
