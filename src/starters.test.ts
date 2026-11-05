import { parseTickets } from './shared/tickets.ts';
import { describe, expect, it } from 'vitest';
import type { Documents } from './documents.ts';
import { inputsFor } from './inputs.fixture.ts';
import { emptyLibrary } from './library.ts';
import { emptyBlueprints, parseBlueprints, placed } from './blueprints.ts';
import { blueprintIn, STARTERS } from './starters.ts';
import { defaultWorkspace } from './workspace.ts';

const tickets = parseTickets({ items: [{ id: 'todo-1', text: 'Mine', done: false }], made: 1 });

const scene = (): Documents => ({
    workspace: defaultWorkspace({ width: 1400, height: 900 }, inputsFor),
    settings: new Map(),
    tickets: new Map([['tickets', tickets]]),
    notes: new Map(),
    agendas: new Map(),
    habits: new Map(),
    clocks: new Map(),
    bookmarks: new Map(),
    signals: new Map(),
    paintings: new Map(),
    pens: new Map(),
    voices: new Map(),
    drums: new Map(),
    focusLinks: new Map(),
    library: emptyLibrary,
    blueprints: emptyBlueprints,
    formulas: new Map(),
    themes: new Map(),
    looks: new Map(),
    look: 'paper',
});

const view = { x: 0, y: 0, width: 1400, height: 900 };

const starter = (id: string) => {
    const found = STARTERS.find(blueprint => blueprint.id === id);

    if (found === undefined) {
        throw new Error(`Missing starter ${id}`);
    }

    return found;
};

const added = (before: Documents, after: Documents) =>
    after.workspace.processes.slice(before.workspace.processes.length);

describe('starter blueprints', () => {
    it('are blueprints a saved snapshot would parse back unchanged', () => {
        expect(
            parseBlueprints(JSON.parse(JSON.stringify({ items: STARTERS })), inputsFor).items,
        ).toEqual(STARTERS.map(({ summary: _, ...blueprint }) => blueprint));
        expect(new Set(STARTERS.map(({ id }) => id)).size).toBe(STARTERS.length);
    });

    it('places every window, each inside its blueprint', () => {
        STARTERS.forEach(blueprint => {
            const before = scene();
            const after = placed(before, blueprint, view, 40, inputsFor);

            expect(added(before, after)).toHaveLength(blueprint.windows.length);
            blueprint.windows.forEach(({ frame }) => {
                expect(frame.x + frame.width).toBeLessThanOrEqual(blueprint.size.width);
                expect(frame.y + frame.height).toBeLessThanOrEqual(blueprint.size.height);
            });
        });
    });

    it('works on the main todo list and agenda rather than copies', () => {
        const before = scene();
        const after = placed(before, starter('starter-today'), view, 40, inputsFor);

        expect(added(before, after).map(({ program, store }) => [program, store])).toEqual([
            ['agenda', 'agenda'],
            ['progress', 'progress'],
            ['tickets', 'tickets'],
            ['progress', 'progress'],
        ]);
        expect(added(before, after)[1]?.follows).toEqual({
            source: { kind: 'agenda', store: 'agenda' },
        });
        expect(added(before, after)[3]?.follows).toEqual({
            source: { kind: 'tickets', store: 'tickets' },
        });
        expect(after.tickets.get('tickets')).toBe(tickets);
        expect(after.workspace.stores.map(({ id }) => id)).toEqual([
            ...before.workspace.stores.map(({ id }) => id),
            'agenda',
            'progress',
            'tickets',
        ]);
    });

    it('gives each daily review a fresh note of its own, opened on the template', () => {
        const first = placed(scene(), starter('starter-daily-review'), view, 40, inputsFor);
        const second = placed(first, starter('starter-daily-review'), view, 41, inputsFor);
        const notes = added(first, second).find(({ program }) => program === 'note');

        expect(notes?.store).toBe('store-41-1');
        expect(second.notes.get('store-40-1')?.items[0]?.text).toMatch(/^Daily review/);
        expect(second.notes.get('store-41-1')?.items[0]?.text).toMatch(/^Daily review/);
        expect(second.settings.get(notes?.id ?? '')).toEqual({ kind: 'note', note: 'note-1' });
        expect(second.tickets.get('tickets')).toBe(tickets);
    });

    it('starts a focus session on a fresh board and the one focus timer', () => {
        const before = scene();
        const after = placed(before, starter('starter-focus-session'), view, 40, inputsFor);

        expect(added(before, after).map(({ program, store }) => [program, store])).toEqual([
            ['tickets', 'store-40-1'],
            ['focus', 'focus'],
            ['progress', 'progress'],
        ]);
        expect(after.tickets.get('store-40-1')?.statuses.map(({ title }) => title)).toEqual([
            'To do',
            'In progress',
            'Done',
        ]);
        expect(after.workspace.stores.find(({ id }) => id === 'store-40-1')?.name).toBe(
            'Focus session',
        );
    });

    it('are found beside saved blueprints, and only saved ones change', () => {
        const saved = { ...starter('starter-today'), id: 'blueprint-3', name: 'Mine' };
        const blueprints = { items: [saved] };

        expect(blueprintIn(blueprints, 'starter-today')?.name).toBe('Today');
        expect(blueprintIn(blueprints, 'blueprint-3')?.name).toBe('Mine');
        expect(blueprintIn(blueprints, 'nope')).toBeUndefined();
    });
});
