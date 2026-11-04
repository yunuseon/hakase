import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksPieces } from '../components/pieces/pieces.component.ts';
import type { PieceCard } from '../components/pieces/pieces.ts';
import type { Piece } from '../pieces.ts';
import type { AppInput, Program } from '../program.ts';

const cardOf = ({ id, name, size, windows }: Piece): PieceCard => ({
    id,
    name,
    size,
    windows: windows.map(({ frame }) => ({
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
    })),
});

export const piecesProgram = {
    id: 'pieces',
    inputs: {},
    title: 'pieces',
    category: 'make',
    icon: 'M4 5 H11 V12 H4 Z M13 5 H20 V9 H13 Z M13 11 H20 V19 H13 Z M4 14 H11 V19 H4 Z',
    size: { width: 360, height: 420 },
    minimum: { width: 260, height: 220 },
    launch: () => {
        const pieces = new HksPieces();

        return {
            element: pieces,
            run$: ({ pieces$ }) =>
                merge(
                    pieces
                        .connect$(pieces$.pipe(map(({ items }) => items.map(cardOf))))
                        .pipe(ignoreElements()),
                    pieces.changes$.pipe(
                        map((event): AppInput =>
                            event.kind === 'place'
                                ? { kind: 'place-piece', id: event.id }
                                : { kind: 'piece', command: event },
                        ),
                    ),
                ),
        };
    },
} satisfies Program;
