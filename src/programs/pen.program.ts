import { merge } from 'rxjs';
import { ignoreElements, map, shareReplay } from 'rxjs/operators';
import { HksPen } from '../components/pen/pen.component.ts';
import { strokeOf } from '../components/pen/pen.ts';
import { penInputs, playbackInput } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';

export const penProgram = {
    id: 'pen',
    inputs: { playback: playbackInput, ...penInputs },
    title: 'pen',
    category: 'make',
    icon: 'M4 20 C8 8 12 16 15 9 S 19 6 20 4 M17 3 L21 7',
    size: { width: 380, height: 480 },
    minimum: { width: 280, height: 360 },
    launch: () => {
        const pen = new HksPen();

        return {
            element: pen,
            run$: ({ drawing$, playhead$ }) => {
                const shared$ = drawing$.pipe(shareReplay({ bufferSize: 1, refCount: true }));
                const stroke$ = shared$.pipe(
                    map(strokeOf),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                return merge(
                    pen.connect$(shared$, stroke$, playhead$).pipe(ignoreElements()),
                    pen.changes$.pipe(map((command): AppInput => ({ kind: 'pen', command }))),
                );
            },
        };
    },
} satisfies Program;
