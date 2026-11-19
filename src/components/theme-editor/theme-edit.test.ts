import { describe, expect, it } from 'vitest';
import { editedTheme } from './theme-edit.ts';

const theme = {
    blend: 'smooth' as const,
    stops: [
        { at: 0, color: '#000000' },
        { at: 1, color: '#ffffff' },
    ],
};

describe('a theme edit', () => {
    it('applies to the theme as it stands, so a blend change keeps the stops', () => {
        expect(editedTheme(theme, { kind: 'blend', blend: 'steps' })).toEqual({
            ...theme,
            blend: 'steps',
        });
    });

    it('orders stops dragged past each other, and keeps the blend', () => {
        const edited = editedTheme(theme, {
            kind: 'stops',
            stops: [
                { at: 0.9, color: '#000000' },
                { at: 0.2, color: '#ffffff' },
            ],
        });

        expect(edited.stops.map(({ at }) => at)).toEqual([0.2, 0.9]);
        expect(edited.blend).toBe('smooth');
    });

    it('adds into the widest gap and never removes the last stop', () => {
        expect(editedTheme(theme, { kind: 'add' }).stops.map(({ at }) => at)).toEqual([0, 0.5, 1]);
        const one = { ...theme, stops: [{ at: 0, color: '#000000' }] };
        expect(editedTheme(one, { kind: 'remove', index: 0 })).toEqual(one);
    });
});
