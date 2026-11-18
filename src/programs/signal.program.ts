import { declarations } from '../declarations.ts';
import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import type { AppInput, Program } from '../program.ts';
import { chainLine } from '../why.ts';

export const signalProgram = {
    ...declarations.signal,
    size: { width: 300, height: 300 },
    minimum: { width: 220, height: 240 },
    launch: async () => {
        const { HksSignal } = await import('../components/signal/signal.component.ts');
        const signal = new HksSignal();

        return {
            element: signal,
            run$: ({ signal$, wave$, playhead$, chains$ }) =>
                merge(
                    signal
                        .connect$(
                            signal$,
                            wave$,
                            playhead$,
                            chains$.pipe(
                                map(
                                    chains =>
                                        new Map(
                                            [...chains.keys()].map(param => [
                                                param,
                                                chainLine(param, chains),
                                            ]),
                                        ),
                                ),
                            ),
                        )
                        .pipe(ignoreElements()),
                    signal.commands$.pipe(
                        map((command): AppInput => ({ kind: 'signal', command })),
                    ),
                    signal.whys$.pipe(map((input): AppInput => ({ kind: 'why', input }))),
                ),
        };
    },
} satisfies Program;
