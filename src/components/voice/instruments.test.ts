import { describe, expect, it } from 'vitest';
import { envelopeAt, INSTRUMENT_NAMES, INSTRUMENTS, ringOf, STAGE } from './instruments.ts';

const adsr = { attack: 0.1, decay: 0.3, sustain: 0.5, release: 0.6 };

describe('an instrument', () => {
    it('rises over its attack, settles towards its sustain, and lets go over its release', () => {
        expect(envelopeAt(adsr, -0.1, 1)).toBe(0);
        expect(envelopeAt(adsr, 0.05, 1)).toBeCloseTo(0.5);
        expect(envelopeAt(adsr, 0.1 + 0.3 / STAGE, 1)).toBeCloseTo(0.5 + 0.5 * Math.exp(-1));
        expect(envelopeAt(adsr, 0.9, 1)).toBeCloseTo(0.5, 2);
        expect(envelopeAt(adsr, 1 + 0.6 / STAGE, 1)).toBeCloseTo(
            envelopeAt(adsr, 1, 1) * Math.exp(-1),
        );
    });

    it('rings until its release is done, or until it falls silent by itself', () => {
        expect(ringOf(INSTRUMENTS.organ, 1)).toBeCloseTo(1 + 2 * INSTRUMENTS.organ.amp.release);
        expect(ringOf(INSTRUMENTS.bell, 0.2)).toBeCloseTo(0.2 + 2 * INSTRUMENTS.bell.amp.release);
        expect(ringOf(INSTRUMENTS.bell, 30)).toBeCloseTo(
            INSTRUMENTS.bell.amp.attack + 2 * INSTRUMENTS.bell.amp.decay,
        );
        expect(ringOf(INSTRUMENTS.harp, 30)).toBeLessThanOrEqual(4);
    });

    it('lists every preset by name, each with something to sound', () => {
        expect(INSTRUMENT_NAMES).toEqual(Object.keys(INSTRUMENTS));
        INSTRUMENT_NAMES.forEach(name => {
            expect(INSTRUMENTS[name].sources.length).toBeGreaterThan(0);
        });
    });
});
