import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksBoard } from '../components/board/board.component.ts';
import type { AppInput, Program } from '../program.ts';

export const boardProgram: Program = {
    id: 'board',
    title: 'board',
    category: 'plan',
    icon: 'M4 4 H8.5 V20 H4 Z M10 4 H14.5 V14 H10 Z M16 4 H20.5 V10 H16 Z',
    size: { width: 720, height: 400 },
    minimum: { width: 260, height: 220 },
    launch: () => {
        const board = new HksBoard();

        return {
            element: board,
            run$: ({ board$ }) =>
                merge(
                    board.connect$(board$).pipe(ignoreElements()),
                    board.commands$.pipe(map((command): AppInput => ({ kind: 'board', command }))),
                ),
        };
    },
};
