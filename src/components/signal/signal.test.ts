import { describe, expect, it } from 'vitest';
import { defaultSignal, waveOf } from '../../shared/signal.ts';
import { dragStep, HEIGHT, markerOf, plotOf, typedValue, valueText } from './signal.ts';

const waveWith = (offset: number, depth: number) =>
    waveOf(new Map([['s', { ...defaultSignal, offset, depth }]]), 's');

describe('plotOf', () => {
    it('spans what the wave reaches, however large', () => {
        const plot = plotOf(waveWith(12.5, 17.5));

        expect(plot.min).toBeCloseTo(-5);
        expect(plot.max).toBeCloseTo(30);
        expect(plot.zero).not.toBeNull();
    });

    it('puts the lowest point at the bottom and the highest at the top', () => {
        const wave = waveWith(0.5, 0.5);
        const plot = plotOf(wave);

        expect(markerOf(wave, plot, 0).y).toBeCloseTo(HEIGHT);
        expect(markerOf(wave, plot, 0.5).y).toBeCloseTo(0);
        expect(plot.zero).toBeNull();
    });

    it('gives a flat line room around it', () => {
        const plot = plotOf(waveWith(3, 0));

        expect(plot.max - plot.min).toBeCloseTo(1);
    });
});

describe('values', () => {
    it('show phase in degrees and fewer decimals as numbers grow', () => {
        expect(valueText('phase', 0.25)).toBe('90°');
        expect(valueText('depth', 0.5)).toBe('0.50');
        expect(valueText('offset', 12.34)).toBe('12.3');
        expect(valueText('offset', -250)).toBe('-250');
    });

    it('read typed text, degrees for the phase, and refuse what is no number', () => {
        expect(typedValue('phase', '90°')).toBeCloseTo(0.25);
        expect(typedValue('offset', ' 3,5 ')).toBe(3.5);
        expect(typedValue('depth', 'loud')).toBeNull();
    });

    it('drag ten times finer with shift', () => {
        expect(dragStep('depth', true)).toBeCloseTo(dragStep('depth', false) / 10);
    });
});
