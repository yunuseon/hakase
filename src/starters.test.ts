import { parseTickets } from './shared/tickets.ts';
import { describe, expect, it } from 'vitest';
import type { Documents } from './documents.ts';
import { inputsFor } from './inputs.fixture.ts';
import { emptyLibrary } from './library.ts';
import { emptyBlueprints, parseBlueprints, placed } from './blueprints.ts';
import { blueprintIn, RHYTHM, STARTERS } from './starters.ts';
import { bitCurve, circuitTable } from './circuit.ts';
import { defaultWorkspace } from './workspace.ts';
import { notesOf, soundingOf } from './components/voice/voice.ts';
import { shaped } from './converters.ts';
import { curveAt, curveOf } from './shared/curve.ts';
import { waveOf } from './shared/signal.ts';

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
    pedals: new Map(),
    gates: new Map(),
    converters: new Map(),
    boxes: new Map(),
    sketchLinks: new Map(),
    library: emptyLibrary,
    blueprints: emptyBlueprints,
    formulas: new Map(),
    themes: new Map(),
    looks: new Map(),
    look: 'paper',
    aspect: '1:1',
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

    it('plays the Canon: the ground, its arpeggio, and two violins a turn apart', () => {
        const { held } = starter('starter-canon');
        const signals = new Map(held.signals);
        const voices = new Map(held.voices);
        const played = (id: string) => {
            const voice = voices.get(id);

            return voice === undefined
                ? []
                : notesOf(soundingOf(voice, signals)).map(
                      ({ semitones }) => voice.root + semitones,
                  );
        };
        const ground = [50, 45, 47, 42, 43, 38, 43, 45];
        const line = [78, 76, 74, 73, 71, 69, 71, 73, 74, 73, 71, 69, 67, 66, 67, 64];

        expect(played('bass')).toEqual([...ground, ...ground]);
        expect(played('violin-1')).toEqual(line);
        expect(played('violin-2')).toEqual(
            [...line.slice(8), ...line.slice(0, 8)].map(n => n - 12),
        );
        expect(played('harp')).toEqual(
            [...ground, ...ground].flatMap(root => [0, 7, 12, 7].map(n => root + 12 + n)),
        );
    });

    it('places a Pedalboard whose every cable points at the fresh copies', () => {
        const before = scene();
        const after = placed(before, starter('starter-pedalboard'), view, 300, inputsFor);
        const id = (name: string) =>
            after.workspace.stores.find(
                store => store.name === name && store.id.startsWith('store-300'),
            )?.id ?? '';
        const output = after.workspace.processes.find(({ program }) => program === 'output');

        expect(after.pedals.get(id('Fold'))?.sources).toMatchObject({
            in: id('Source'),
            rotate: id('Spin'),
        });
        expect(after.pedals.get(id('Tint'))?.sources).toMatchObject({ in: id('Fold') });
        expect(after.pedals.get(id('Tint'))?.choice).toBe('ember');
        expect(output?.follows).toMatchObject({ in: { kind: 'colourmap', store: id('Tint') } });
        expect(after.workspace.links).toHaveLength(before.workspace.links.length + 5);
    });

    it('places a Light show whose two chains meet in one graded picture', () => {
        const before = scene();
        const after = placed(before, starter('starter-light-show'), view, 300, inputsFor);
        const id = (name: string) =>
            after.workspace.stores.find(
                store => store.name === name && store.id.startsWith('store-300'),
            )?.id ?? '';
        const output = after.workspace.processes.find(({ program }) => program === 'output');

        expect(after.pedals.get(id('Fold'))?.sources).toMatchObject({
            in: id('Knot'),
            rotate: id('Spin'),
        });
        expect(after.pedals.get(id('Echo'))?.sources).toMatchObject({ in: id('Fold') });
        expect(after.pedals.get(id('Haze'))?.sources).toMatchObject({
            in: id('Swirl'),
            radius: id('Kick'),
        });
        expect(after.converters.get(id('Kick'))?.sources.in).toBe(id('Pulse'));
        expect(after.pedals.get(id('Blend'))).toMatchObject({
            choice: 'screen',
            sources: { a: id('Echo'), b: id('Haze'), amount: id('Swell') },
        });
        expect(after.pedals.get(id('Grade'))?.sources).toMatchObject({
            in: id('Blend'),
            offset: id('Cycle'),
            amount: id('Strobe'),
        });
        expect(after.sketchLinks.get(id('Knot'))?.sources.turn).toBe(id('Spin'));
        expect(output?.follows).toMatchObject({ in: { kind: 'colourmap', store: id('Grade') } });
    });

    it('places a Light band whose picture plays every part', () => {
        const before = scene();
        const after = placed(before, starter('starter-light-band'), view, 300, inputsFor);
        const id = (name: string) =>
            after.workspace.stores.find(
                store => store.name === name && store.id.startsWith('store-300'),
            )?.id ?? '';

        expect(after.sketchLinks.get(id('Lights'))?.sources.distance).toBe(id('Breath'));
        expect(after.converters.get(id('Glow'))).toMatchObject({
            choice: 'brightness',
            sources: { in: id('Lights') },
        });
        expect(after.converters.get(id('Stir'))?.sources.in).toBe(id('Lights'));
        expect(after.converters.get(id('Busy'))?.sources.in).toBe(id('Stir'));
        expect(after.voices.get(id('Marimba'))?.sources).toMatchObject({
            pitch: id('Glow'),
            volume: id('Rhythm'),
            pan: id('Shimmer'),
        });
        expect(after.voices.get(id('Bass'))?.sources).toMatchObject({
            pitch: id('Chords'),
            volume: id('Groove'),
        });
        expect(after.voices.get(id('Pad'))?.sources).toMatchObject({
            pitch: id('Chords'),
            volume: id('Stir'),
        });
        expect(after.signals.get(id('Shimmer'))?.sources.depth).toBe(id('Stir'));
        expect(after.drums.get(id('Kit'))?.sources.volume).toBe(id('Busy'));
    });

    it('strikes the marimba on its rhythm alone, the picture choosing only the notes', () => {
        const { held } = starter('starter-light-band');
        const glow = new Map(held.converters).get('glow');
        const lead = new Map(held.voices).get('lead');
        const rhythm = new Map(held.gates).get('rhythm');
        if (glow === undefined || lead === undefined || rhythm === undefined) {
            throw new Error('Light band is missing its marimba');
        }
        const brightness = curveOf(
            t => 0.26 + 0.1 * Math.cos(2 * Math.PI * t) * Math.cos(6 * Math.PI * t),
        );
        const volume = bitCurve(Uint8Array.from(rhythm.steps));
        const struck = notesOf({
            voice: lead,
            waves: { pitch: shaped(brightness, glow.shape), volume, filter: null, pan: null },
        }).filter(({ from }) => curveAt(volume, from + 1e-4) > 0.5);
        const hits = [...RHYTHM].flatMap((mark, index) =>
            mark === '1' && RHYTHM[index - 1] !== '1' ? [index / RHYTHM.length] : [],
        );

        expect(struck.map(({ from }) => Number(from.toFixed(4)))).toEqual(
            hits.map(t => Number(t.toFixed(4))),
        );
        expect(new Set(struck.map(({ semitones }) => semitones)).size).toBeGreaterThan(4);
    });

    it('plays Am, F, C and G on the bass, three strikes a bar', () => {
        const { held } = starter('starter-light-band');
        const bass = new Map(held.voices).get('bass');
        const groove = new Map(held.gates).get('groove');
        const chords = waveOf(new Map(held.signals), 'chords');
        if (bass === undefined || groove === undefined) {
            throw new Error('Light band is missing its bass');
        }
        const played = notesOf({
            voice: bass,
            waves: {
                pitch: chords,
                volume: bitCurve(Uint8Array.from(groove.steps)),
                filter: null,
                pan: null,
            },
        }).map(({ semitones }) => bass.root + semitones);

        expect(played).toEqual([33, 33, 33, 29, 29, 29, 36, 36, 36, 31, 31, 31]);
    });

    it('places a Logic primer whose half adder adds and whose counter counts', () => {
        const before = scene();
        const after = placed(before, starter('starter-logic'), view, 300, inputsFor);
        const id = (name: string) =>
            after.workspace.stores.find(
                store => store.name === name && store.id.startsWith('store-300'),
            )?.id ?? '';
        const gates = new Map([...after.gates].filter(([store]) => store.startsWith('store-300')));
        const table = circuitTable(gates, 8);
        const row = (name: string) => [...(table.get(id(name)) ?? [])];
        const box = after.boxes.get(id('half adder'));

        expect(row('sum')).toEqual([0, 1, 1, 0, 0, 1, 1, 0]);
        expect(row('carry')).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
        expect(row('count')).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
        expect(box?.outputs).toEqual([id('half adder.sum'), id('half adder.carry')]);
        expect(box?.inner.every(({ store }) => store.startsWith('store-300'))).toBe(true);
        expect(after.workspace.processes.some(({ store }) => store === id('a nand b'))).toBe(false);
    });
});
