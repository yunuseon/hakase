import { describe, expect, it } from 'vitest';
import { linkedSketch, unlinkedSketch } from './components/sketch/links.ts';
import { envelopeOf, enveloped, type Wired } from './envelopes.ts';
import { GATE_DEFAULTS } from './gates.ts';
import { defaultPedal } from './pedals.ts';
import { mainStore, type StoreEntry } from './stores.ts';

const entry = (id: string, program: StoreEntry['program'], name: string): StoreEntry => ({
    ...mainStore(program),
    id,
    name,
});

const wired = (sources: { k1?: string; radius?: string; compare?: string }): Wired => ({
    stores: [entry('harp', 'voice', 'Harp'), entry('wave', 'signal', 'Wave')],
    sketchLinks: new Map([['sketch-1', linkedSketch(unlinkedSketch, 'k1', sources.k1 ?? null)]]),
    pedals: new Map([
        [
            'haze',
            { ...defaultPedal('blur'), sources: { in: null, radius: sources.radius ?? null } },
        ],
    ]),
    gates: new Map([
        ['cmp', { ...GATE_DEFAULTS.compare, sources: { in: sources.compare ?? null, time: null } }],
    ]),
    converters: new Map(),
});

describe('the Envelope migration', () => {
    it('puts one Envelope between a sound and everything that read it as a level', () => {
        const after = enveloped(wired({ k1: 'harp', radius: 'drums', compare: 'harp' }));

        expect(after.sketchLinks.get('sketch-1')?.sources.k1).toBe(envelopeOf('harp'));
        expect(after.pedals.get('haze')?.sources['radius']).toBe(envelopeOf('drums'));
        expect(after.gates.get('cmp')?.sources['in']).toBe(envelopeOf('harp'));
        expect(after.converters.get(envelopeOf('harp'))).toMatchObject({
            kind: 'envelope',
            choice: 'loudness',
            sources: { in: 'harp', time: null },
        });
        expect(after.stores.filter(({ program }) => program === 'envelope')).toEqual([
            entry(envelopeOf('harp'), 'envelope', 'Harp level'),
            { ...entry(envelopeOf('drums'), 'envelope', 'Main level'), kept: true },
        ]);
    });

    it('leaves what never read a sound alone, and runs once', () => {
        const signal = wired({ k1: 'wave' });
        const once = enveloped(wired({ k1: 'harp' }));

        expect(enveloped(signal)).toBe(signal);
        expect(enveloped(once).stores).toHaveLength(once.stores.length);
    });
});
