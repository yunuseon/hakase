import { describe, expect, expectTypeOf, it } from 'vitest';
import { inputGroups, storeInputCommand } from './input-connections.ts';
import { inputsFor } from './inputs.fixture.ts';
import { fits, initialFollows } from './inputs.ts';
import { defaultSignal } from './shared/signal.ts';
import { mainStore } from './stores.ts';
import { defaultWorkspace, reduceWorkspace, type Process } from './workspace.ts';

const workspace = reduceWorkspace(
    defaultWorkspace({ width: 1200, height: 900 }, inputsFor),
    {
        kind: 'launch',
        program: 'signal',
        size: { width: 300, height: 300 },
        viewport: { width: 1200, height: 900 },
    },
    inputsFor,
);
const process = workspace.processes.find(process => process.program === 'signal');
if (process === undefined) throw new Error('Missing signal process');
const stores = [...workspace.stores, { ...mainStore('signal'), id: 'other', name: 'Other' }];

const groups = (current: Process, signals = new Map([['signal', defaultSignal]])) =>
    inputGroups(current, inputsFor(current.program), workspace.processes, stores, signals);

describe('store-owned inputs', () => {
    it('offers modulation beside playback without putting it in process follows', () => {
        expect(groups(process).map(({ input }) => input)).toEqual([
            'playback',
            'phase',
            'offset',
            'depth',
            'time',
        ]);
        expect(initialFollows(inputsFor('signal'))).toEqual({
            playback: { kind: 'playback', store: 'timeline' },
        });
        expect(
            fits(inputsFor('signal'), {
                ...process.follows,
                depth: { kind: 'signal', store: 'other' },
            }),
        ).toBe(false);
        expectTypeOf<Extract<Process, { program: 'signal' }>['follows']>().toEqualTypeOf<{
            readonly playback: { readonly kind: 'playback'; readonly store: string };
        }>();
    });

    it('shows the same connection in two windows sharing a signal and changes it on rebind', () => {
        const signals = new Map([
            [
                'signal',
                {
                    ...defaultSignal,
                    sources: { phase: null, offset: null, depth: 'other', time: null },
                },
            ],
        ]);
        const selected = (current: Process) =>
            groups(current, signals)
                .find(group => group.input === 'depth')
                ?.options.filter(option => option.current)
                .map(option => option.id);

        expect(selected(process)).toEqual(['other']);
        expect(selected({ ...process, id: 'second-window' })).toEqual(['other']);
        expect(selected({ ...process, store: 'other' })).toEqual([]);
    });

    it('excludes self-connections and sources that lead back to the target', () => {
        const signals = new Map([
            [
                'other',
                {
                    ...defaultSignal,
                    sources: { phase: 'signal', offset: null, depth: null, time: null },
                },
            ],
        ]);

        expect(groups(process, signals).find(group => group.input === 'depth')?.options).toEqual(
            [],
        );
    });

    it('connects and disconnects through signal commands, retaining the manual value', () => {
        const inputs = inputsFor('signal');
        const command = storeInputCommand(inputs, {
            kind: 'follow',
            input: 'depth',
            source: 'signal',
            store: 'other',
        });
        const disconnect = storeInputCommand(inputs, { kind: 'unfollow', input: 'depth' });

        expect(command).toEqual({ param: 'depth', source: 'other' });
        expect(disconnect).toEqual({ param: 'depth', source: null });
        expect(
            storeInputCommand(inputs, {
                kind: 'follow',
                input: 'depth',
                source: 'focus',
                store: 'focus',
            }),
        ).toBeNull();
        expect(storeInputCommand(inputs, { kind: 'unfollow', input: 'playback' })).toBeNull();
        expect(
            storeInputCommand(inputsFor('focus'), {
                kind: 'follow',
                input: 'agenda',
                source: 'agenda',
                store: 'store-3',
            }),
        ).toEqual({ param: 'agenda', source: 'store-3' });
        expect(
            storeInputCommand(inputsFor('focus'), {
                kind: 'follow',
                input: 'agenda',
                source: 'signal',
                store: 'signal',
            }),
        ).toBeNull();
        expect(storeInputCommand(inputs, { kind: 'unfollow', input: 'constructor' })).toBeNull();
    });
});

describe('a playback set aside', () => {
    it('names the clock a read-on link shows the window on, on its playback row only', () => {
        const linked = new Map([
            ['signal', { ...defaultSignal, sources: { ...defaultSignal.sources, time: 'other' } }],
        ]);
        const shown = groups(process, linked);

        expect(shown.find(group => group.input === 'playback')?.setAside).toBe('Other');
        expect(
            shown
                .filter(group => group.input !== 'playback')
                .every(group => group.setAside === null),
        ).toBe(true);
        expect(groups(process).every(group => group.setAside === null)).toBe(true);
    });
});
