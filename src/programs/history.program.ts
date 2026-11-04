import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksHistory } from '../components/history/history.component.ts';
import type { AppInput, Program } from '../program.ts';

export const historyProgram = {
    id: 'history',
    inputs: {},
    title: 'history',
    category: 'system',
    icon: 'M4 12 A8 8 0 1 0 6.5 6.2 M4 4 V8 H8 M12 8 V12 L15 14',
    size: { width: 280, height: 360 },
    minimum: { width: 200, height: 180 },
    launch: () => {
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
