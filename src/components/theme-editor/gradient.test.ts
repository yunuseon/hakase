import { describe, expect, it } from 'vitest';
import { gradientCss } from './gradient.ts';

describe('a theme preview', () => {
    it('draws the same bands as the ramp: each colour doubled at the next stop', () => {
        expect(
            gradientCss({
                blend: 'steps',
                stops: [
                    { at: 0.67, color: '#0000ff' },
                    { at: 0, color: '#ff0000' },
                    { at: 0.34, color: '#00ff00' },
                ],
            }),
        ).toBe(
            'linear-gradient(90deg, #ff0000 0.00%, #ff0000 34.00%, #00ff00 34.00%, #00ff00 67.00%, #0000ff 67.00%, #0000ff 100.00%)',
        );
    });

    it('blends a smooth theme between its stops', () => {
        expect(
            gradientCss({
                blend: 'smooth',
                stops: [
                    { at: 0, color: '#000000' },
                    { at: 1, color: '#ffffff' },
                ],
            }),
        ).toBe('linear-gradient(90deg, #000000 0.00%, #ffffff 100.00%)');
    });
});
