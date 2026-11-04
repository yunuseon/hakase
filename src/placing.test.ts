import { describe, expect, it } from 'vitest';
import { footprintAt, ghostOf, idle, reducePlacing, type PlacingAction } from './placing.ts';

const run = (actions: readonly PlacingAction[]) => actions.reduce(reducePlacing, idle);

describe('placing a piece', () => {
    it('follows the pointer until a drop, which keeps the piece and where it fell', () => {
        expect(
            run([
                { kind: 'start', piece: 'piece-1', at: { x: 10, y: 10 } },
                { kind: 'move', at: { x: 40, y: 50 } },
            ]),
        ).toEqual({ mode: 'placing', piece: 'piece-1', at: { x: 40, y: 50 } });
        expect(
            run([
                { kind: 'start', piece: 'piece-1', at: { x: 10, y: 10 } },
                { kind: 'drop', at: { x: 70, y: 80 } },
                { kind: 'move', at: { x: 0, y: 0 } },
            ]),
        ).toEqual({ mode: 'dropped', piece: 'piece-1', at: { x: 70, y: 80 } });
    });

    it('drops nothing that was not being placed, and a cancel lets go', () => {
        expect(run([{ kind: 'drop', at: { x: 1, y: 1 } }])).toBe(idle);
        expect(
            run([{ kind: 'start', piece: 'piece-1', at: { x: 0, y: 0 } }, { kind: 'cancel' }]),
        ).toEqual(idle);
    });

    it('centres the section under the pointer in world units, and draws the ghost where it will land', () => {
        const camera = { x: 100, y: 50, zoom: 0.5 };
        const piece = {
            name: 'Twinkle',
            size: { width: 400, height: 200 },
            windows: [
                {
                    id: 'voice-1',
                    program: 'voice' as const,
                    store: 'voice',
                    follows: {},
                    frame: { x: 20, y: 30, z: 0, width: 100, height: 60 },
                    measured: { width: 100, height: 60 },
                    settings: null,
                },
            ],
        };

        expect(footprintAt(piece.size, { x: 300, y: 250 }, camera)).toEqual({
            x: 200,
            y: 300,
            width: 400,
            height: 200,
        });
        expect(ghostOf(piece, { x: 300, y: 250 }, camera)).toEqual({
            name: 'Twinkle',
            section: { x: 200, y: 200, width: 200, height: 100 },
            windows: [{ x: 210, y: 215, width: 50, height: 30 }],
        });
    });
});
