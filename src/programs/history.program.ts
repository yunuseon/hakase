import { declarations } from '../declarations.ts';
import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import type { AppInput, Program } from '../program.ts';

export const historyProgram = {
    ...declarations.history,
    size: { width: 280, height: 360 },
    minimum: { width: 200, height: 180 },
    launch: async () => {
        const { HksHistory } = await import('../components/history/history.component.ts');
        const history = new HksHistory();

        return {
            element: history,
            run$: ({ history$ }) =>
                merge(
                    history.connect$(history$).pipe(ignoreElements()),
                    history.travels$.pipe(map((offset): AppInput => ({ kind: 'travel', offset }))),
                    history.takeBacks$.pipe(map((id): AppInput => ({ kind: 'take-back', id }))),
                ),
        };
    },
} satisfies Program;
