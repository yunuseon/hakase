import type { Theme } from '../theme.ts';

export const themes = {
    dusk: {
        blend: 'smooth',
        stops: [
            { at: 0, color: '#222831' },
            { at: 0.5, color: '#393e46' },
            { at: 1, color: '#00adb5' },
        ],
    },
    ember: {
        blend: 'smooth',
        stops: [
            { at: 0, color: '#2b1a2e' },
            { at: 0.45, color: '#c4633a' },
            { at: 1, color: '#f2e2cf' },
        ],
    },
    ice: {
        blend: 'smooth',
        stops: [
            { at: 0, color: '#0d1b2a' },
            { at: 0.5, color: '#415a77' },
            { at: 1, color: '#e0e1dd' },
        ],
    },
    bands: {
        blend: 'steps',
        stops: [
            { at: 0, color: '#1b1b1a' },
            { at: 0.34, color: '#00adb5' },
            { at: 0.67, color: '#eeeeee' },
        ],
    },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof themes;

export const isThemeName = (value: string): value is ThemeName => value in themes;
