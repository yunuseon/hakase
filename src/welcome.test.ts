import { describe, expect, it } from 'vitest';
import { STARTERS } from './starters.ts';
import { welcomeOf } from './welcome.ts';

describe('the welcome', () => {
    it('invites only on an empty canvas, with every starter as a card', () => {
        const empty = welcomeOf(0, STARTERS);

        expect(empty.shown).toBe(true);
        expect(empty.cards.map(({ id }) => id)).toEqual(STARTERS.map(({ id }) => id));
        expect(empty.cards[0]?.windows).toHaveLength(STARTERS[0]?.windows.length ?? 0);
        expect(welcomeOf(1, STARTERS).shown).toBe(false);
    });
});
