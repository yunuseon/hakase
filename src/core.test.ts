import { EMPTY, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { coreOf } from './core.ts';
import type { DocumentAction } from './documents.ts';
import type { Ports } from './ports.ts';
import type { AppSignal } from './protocol.ts';
import type { AppInput, ProgramId } from './protocol.ts';

const memory = () => {
    const kept = new Map<string, unknown>();

    return {
        kept,
        storage: { read: (key: string) => kept.get(key) ?? null, write: kept.set.bind(kept) },
    };
};

const said = (program: ProgramId, store: string, input: AppInput): AppSignal => ({
    to: 'app',
    from: `${program}-1`,
    store,
    clock: program === 'timeline' ? { kind: 'playback', store } : null,
    program,
    input,
});

const portsWith = (storage: Ports['storage']): Ports => ({
    frames$: of(0, 400, 800),
    wall$: of(Date.UTC(2026, 10, 18, 12)),
    viewport: { width: 1400, height: 900 },
    storage,
});

describe('the core, with no client', () => {
    it('folds what processes say into documents, clocks and storage', async () => {
        const { kept, storage } = memory();
        const core = coreOf({
            ports: portsWith(storage),
            inputs$: of(
                said('tickets', 'tickets', {
                    kind: 'ticket',
                    command: { kind: 'add', status: null, title: 'water the plants', parent: null },
                }),
                said('signal', 'signal', {
                    kind: 'signal',
                    command: { kind: 'set', param: 'depth', value: 0.25 },
                }),
                said('timeline', 'timeline', { kind: 'transport', command: 'toggle' }),
            ),
            documentActions$: EMPTY,
            workspaceActions$: EMPTY,
            pictureFrames$: () => of(null),
        });

        const saving = core.persisted$.subscribe();
        const documents = await firstValueFrom(core.documents$);
        const titles = documents.tickets
            .get('tickets')
            ?.statuses.flatMap(({ tickets }) => tickets.map(({ title }) => title));
        const clock = await firstValueFrom(core.playbackIn('timeline'));

        expect(titles).toEqual(['water the plants']);
        expect(documents.signals.get('signal')?.depth).toBe(0.25);
        expect(clock.playing).toBe(true);
        expect(clock.at).toBeCloseTo(800 / 8000);

        await new Promise(resolve => setTimeout(resolve, 300));
        saving.unsubscribe();
        expect(JSON.stringify(kept.get('hakase.state'))).toContain('water the plants');
    });

    it('restores what it saved', async () => {
        const { storage } = memory();
        const first = coreOf({
            ports: portsWith(storage),
            inputs$: of(
                said('note', 'note', {
                    kind: 'note',
                    command: { kind: 'create', id: 'note-1', text: 'from a terminal' },
                }),
            ),
            documentActions$: EMPTY,
            workspaceActions$: EMPTY,
            pictureFrames$: () => of(null),
        });
        const saving = first.persisted$.subscribe();
        await new Promise(resolve => setTimeout(resolve, 300));
        saving.unsubscribe();

        const again = coreOf({
            ports: portsWith(storage),
            inputs$: EMPTY,
            documentActions$: EMPTY,
            workspaceActions$: EMPTY,
            pictureFrames$: () => of(null),
        });
        const notes = await firstValueFrom(again.notes$);

        expect(notes.get('note')?.items.map(({ text }) => text)).toEqual(['from a terminal']);
    });

    it('makes and names a store with no window, and keeps it', async () => {
        const windowless = [
            {
                kind: 'stores',
                command: { kind: 'make', program: 'note', name: 'Journal', copy: null },
            },
            { kind: 'stores', command: { kind: 'rename', store: 'note', name: 'Inbox' } },
        ] satisfies readonly DocumentAction[];
        const { storage } = memory();
        const first = coreOf({
            ports: portsWith(storage),
            inputs$: EMPTY,
            documentActions$: of(...windowless),
            workspaceActions$: EMPTY,
            pictureFrames$: () => of(null),
        });
        const saving = first.persisted$.subscribe();
        const made = await firstValueFrom(first.stores$);
        await new Promise(resolve => setTimeout(resolve, 300));
        saving.unsubscribe();

        const again = coreOf({
            ports: portsWith(storage),
            inputs$: EMPTY,
            documentActions$: EMPTY,
            workspaceActions$: EMPTY,
            pictureFrames$: () => of(null),
        });
        const { workspace, registry } = await firstValueFrom(again.documents$);
        const names = (stores: typeof made) =>
            stores.filter(({ program }) => program === 'note').map(({ name }) => name);

        expect(names(made)).toEqual(['Journal', 'Inbox']);
        expect(names(registry.stores)).toEqual(['Journal', 'Inbox']);
        expect(workspace.processes.some(({ program }) => program === 'note')).toBe(false);
    });
});
