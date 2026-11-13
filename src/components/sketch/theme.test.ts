import { describe, expect, it } from 'vitest';
import { buildRamp, gradientCss, RAMP_SIZE, type Theme } from './theme.ts';

const at = (ramp: Uint8Array, t: number) => {
    const index = Math.round(t * (RAMP_SIZE - 1)) * 4;

    return [ramp[index], ramp[index + 1], ramp[index + 2]];
};

describe('a theme', () => {
    const stepped: Theme = {
        blend: 'steps',
        stops: [
            { at: 0.67, color: '#0000ff' },
            { at: 0, color: '#ff0000' },
            { at: 0.34, color: '#00ff00' },
        ],
    };

    it('holds each stepped colour until the next stop, in stop order however it was saved', () => {
        const ramp = buildRamp(stepped);

        expect(at(ramp, 0.2)).toEqual([255, 0, 0]);
        expect(at(ramp, 0.5)).toEqual([0, 255, 0]);
        expect(at(ramp, 0.9)).toEqual([0, 0, 255]);
    });

    it('draws the same bands in its preview: each colour doubled at the next stop', () => {
        expect(gradientCss(stepped)).toBe(
            'linear-gradient(90deg, #ff0000 0.00%, #ff0000 34.00%, #00ff00 34.00%, #00ff00 67.00%, #0000ff 67.00%, #0000ff 100.00%)',
        );
    });

    it('blends a smooth theme between its stops, and its ends are its end colours', () => {
        const smooth: Theme = {
            blend: 'smooth',
            stops: [
                { at: 0, color: '#000000' },
                { at: 1, color: '#ffffff' },
            ],
        };
        const ramp = buildRamp(smooth);

        expect(at(ramp, 0)).toEqual([0, 0, 0]);
        expect(at(ramp, 1)).toEqual([255, 255, 255]);
        expect(at(ramp, 0.5)[0]).toBeCloseTo(128, -1);
        expect(gradientCss(smooth)).toBe('linear-gradient(90deg, #000000 0.00%, #ffffff 100.00%)');
    });
});
