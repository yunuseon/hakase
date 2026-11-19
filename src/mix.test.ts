import { describe, expect, it } from 'vitest';
import { inputsFor } from './declarations.ts';
import { audible, MAIN_CLOCK, stripsOf, toggledSolo } from './mix.ts';
import { defaultWorkspace, type Process, type Workspace } from './workspace.ts';

const entry = (id: string, program: 'voice' | 'drums' | 'signal') => ({
    id,
    program,
    name: id,
    kept: true,
    copy: null,
    clock: null,
});

describe('the mix', () => {
    it('has a strip for every voice and drum machine, on the main clock with no window', () => {
        const base = defaultWorkspace({ width: 1200, height: 800 }, inputsFor);
        const workspace: Workspace = {
            ...base,
            processes: [],
            stores: [entry('lead', 'voice'), entry('lfo', 'signal'), entry('kit', 'drums')],
        };

        expect(stripsOf(workspace)).toEqual([
            { store: 'lead', program: 'voice', name: 'lead', clock: MAIN_CLOCK },
            { store: 'kit', program: 'drums', name: 'kit', clock: MAIN_CLOCK },
        ]);
    });

    it('plays a strip on the clock its first window follows', () => {
        const base = defaultWorkspace({ width: 1200, height: 800 }, inputsFor);
        const voice: Process = {
            id: 'voice-1',
            program: 'voice',
            store: 'lead',
            frame: { x: 0, y: 0, z: 0, width: 400, height: 360 },
            measured: { width: 400, height: 360 },
            follows: { playback: { kind: 'playback', store: 'slow' } },
        };
        const workspace: Workspace = {
            ...base,
            processes: [voice],
            stores: [entry('lead', 'voice')],
        };

        expect(stripsOf(workspace)[0]?.clock).toBe('slow');
    });

    it('sounds every unmuted strip, or only the soloed ones while any is', () => {
        const soloed = toggledSolo(new Set(), 'b');

        expect(audible('a', false, new Set())).toBe(true);
        expect(audible('a', true, new Set())).toBe(false);
        expect(audible('a', false, soloed)).toBe(false);
        expect(audible('b', true, soloed)).toBe(true);
        expect([...toggledSolo(soloed, 'b')]).toEqual([]);
    });
});
