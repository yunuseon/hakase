import { describe, expect, it } from 'vitest';
import { cellsOf } from './levels.ts';

describe('cutting the atlas back into frames', () => {
    it('reads each cell row by row, cell 0 at the bottom left, the next to its right', () => {
        const across = 2;
        const cell = 2;
        const side = across * cell;
        const atlas = Uint8Array.from({ length: side * side * 4 }, (_, at) => {
            const pixel = Math.floor(at / 4);
            const x = pixel % side;
            const y = Math.floor(pixel / side);

            return at % 4 === 0 ? Math.floor(y / cell) * across + Math.floor(x / cell) : x * 10 + y;
        });
        const cells = cellsOf(atlas, across, cell);

        expect(cells).toHaveLength(4);
        expect(cells.map(frame => frame[0])).toEqual([0, 1, 2, 3]);
        expect(
            Array.from(cells[1] ?? [], (value, at) => (at % 4 === 1 ? value : null)).filter(
                v => v !== null,
            ),
        ).toEqual([20, 30, 21, 31]);
    });
});
