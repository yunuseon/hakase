import { describe, expect, it } from 'vitest';
import type { Linked } from './shared/signal.ts';
import { chainLine, chainsOf, levelsFrom, reduceWhy, sameTraced, tracedOf } from './why.ts';

const linked = new Map<string, Linked>([
    ['sketch', { sources: { k1: 'lights', k2: null } }],
    ['lights', { sources: { depth: 'breath', phase: 'drift' } }],
    ['breath', { sources: { offset: 'slow' } }],
    ['drift', { sources: { offset: 'slow' } }],
    ['slow', { sources: {} }],
]);
const names: Readonly<Record<string, string>> = {
    lights: 'Lights',
    breath: 'Breath',
    drift: 'Drift',
    slow: 'Slow',
};
const nameOf = (id: string) => names[id] ?? id;

describe('why is this moving', () => {
    it('reads a chain level by level, each store once', () => {
        expect(levelsFrom(linked, 'lights')).toEqual([['lights'], ['breath', 'drift'], ['slow']]);
    });

    it('stops at a store already on the chain', () => {
        const loop = new Map<string, Linked>([
            ['a', { sources: { x: 'b' } }],
            ['b', { sources: { x: 'a' } }],
        ]);

        expect(levelsFrom(loop, 'a')).toEqual([['a'], ['b']]);
    });

    it('names every driven input of a store, and only those', () => {
        const chains = chainsOf(linked, 'sketch', nameOf);

        expect([...chains]).toEqual([['k1', 'Lights ← Breath · Drift ← Slow']]);
        expect(chainLine('k1', chains, 'Glow')).toBe('Glow ← Lights ← Breath · Drift ← Slow');
        expect(chainLine('k2', chains)).toBe('');
    });

    it('lights the windows on the path, and lets go when asked again or cleared', () => {
        const why = { window: 'sketch-1', store: 'sketch', input: 'k1' };
        const processes = [
            { id: 'sketch-1', store: 'sketch' },
            { id: 'signal-2', store: 'lights' },
            { id: 'signal-3', store: 'slow' },
            { id: 'notes-4', store: 'notes' },
        ];
        const traced = tracedOf(processes, linked, why);

        expect([...(traced?.windows ?? [])].sort()).toEqual(['signal-2', 'signal-3', 'sketch-1']);
        expect([...(traced?.stores ?? [])].sort()).toEqual(['breath', 'drift', 'lights', 'slow']);
        expect(traced?.socket).toBe('sketch-1:input:k1');
        expect(sameTraced(traced, tracedOf(processes, linked, why))).toBe(true);
        expect(tracedOf(processes, linked, { ...why, input: 'k2' })).toBeNull();
        expect(tracedOf(processes.slice(1), linked, why)).toBeNull();

        const lit = reduceWhy(null, { kind: 'why', why });
        expect(lit).toEqual(why);
        expect(reduceWhy(lit, { kind: 'why', why })).toBeNull();
        expect(reduceWhy(lit, { kind: 'why', why: { ...why, input: 'k3' } })).toEqual({
            ...why,
            input: 'k3',
        });
        expect(reduceWhy(lit, { kind: 'clear' })).toBeNull();
    });
});
