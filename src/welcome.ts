import type { Starter } from './starters.ts';
import type { WelcomeView } from './components/welcome/welcome.ts';

export const welcomeOf = (windows: number, starters: readonly Starter[]): WelcomeView => ({
    shown: windows === 0,
    cards: starters.map(({ id, name, summary, size, windows: placed }) => ({
        id,
        name,
        summary,
        size,
        windows: placed.map(({ frame }) => ({
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
        })),
    })),
});
