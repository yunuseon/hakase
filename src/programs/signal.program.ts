import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksSignal } from '../components/signal/signal.component.ts';
import { playbackInput } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';

export const signalProgram = {
    id: 'signal',
    inputs: { playback: playbackInput },
    title: 'signal',
    category: 'make',
    icon: 'M3 12 C 6 3, 9 3, 12 12 S 18 21, 21 12',
    size: { width: 300, height: 300 },
    minimum: { width: 220, height: 240 },
    launch: () => {
        const signal = new HksSignal();

        return {
            element: signal,
            run$: ({ signal$, wave$, playhead$ }) =>
                merge(
                    signal.connect$(signal$, wave$, playhead$).pipe(ignoreElements()),
                    signal.commands$.pipe(
                        map((command): AppInput => ({ kind: 'signal', command })),
                    ),
                ),
        };
    },
} satisfies Program;
