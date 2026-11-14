import { describe, expect, it } from 'vitest';
import { defaultSignal, waveOf, type Signal } from '../../shared/signal.ts';
import { atOf, boundsOf, HEIGHT, lanesOf, readingsAt, WIDTH, type Trace } from './plot.ts';

const trace = (key: string, signal: Signal): Trace => ({
    key,
    label: key,
    colour: 'red',
    driver: waveOf(new Map([[key, signal]]), key),
});
const unit = trace('a', defaultSignal);
const wide = trace('b', { ...defaultSignal, offset: 5, depth: 10 });

describe('the plot', () => {
    it('overlays every trace on one scale, labelled once', () => {
        const lanes = lanesOf([unit, wide], 'overlay');

        expect(lanes.map(({ min, max }) => [min, max])).toEqual([
            [-5, 15],
            [-5, 15],
        ]);
        expect(boundsOf(lanes, 'overlay')).toEqual([
            { text: '15.0', y: 0, low: false },
            { text: '-5.00', y: HEIGHT, low: true },
        ]);
        expect(lanes[0]?.zero).not.toBeNull();
    });

    it('gives each trace a lane of its own, scaled to itself', () => {
        const lanes = lanesOf([unit, wide], 'lanes');

        expect(lanes.map(({ min, max }) => [Math.round(min), Math.round(max)])).toEqual([
            [0, 1],
            [-5, 15],
        ]);
        expect(lanes[1]?.top).toBeGreaterThan((lanes[0]?.top ?? 0) + (lanes[0]?.height ?? 0));
        expect(boundsOf(lanes, 'lanes')).toHaveLength(4);
    });

    it('reads each trace at the playhead, where its line is drawn', () => {
        const lanes = lanesOf([unit], 'overlay');
        const [reading] = readingsAt([unit], lanes, 0.5);

        expect(reading?.value).toBeCloseTo(1);
        expect(reading?.x).toBe(WIDTH / 2);
        expect(reading?.y).toBeCloseTo(0);
    });

    it('gives a flat signal room, and keeps a scrub inside the loop', () => {
        const flat = lanesOf([trace('c', { ...defaultSignal, depth: 0 })], 'overlay');

        expect(flat[0]?.max).toBeGreaterThan(flat[0]?.min ?? 0);
        expect(atOf(-10, 200)).toBe(0);
        expect(atOf(50, 200)).toBe(0.25);
        expect(atOf(900, 200)).toBe(1);
    });
});
