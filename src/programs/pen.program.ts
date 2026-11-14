import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map, shareReplay, switchMap } from 'rxjs/operators';
import { sheet$ } from '../engine/view.ts';
import { parseHexColor } from '../lib/color.ts';
import { dabsAt } from '../shared/stroke.ts';
import { strokeOf } from '../components/pen/pen.ts';
import { penInputs, playbackInput } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';

const FAINT = 0.22;

export const penProgram = {
    id: 'pen',
    inputs: { playback: playbackInput, ...penInputs },
    title: 'pen',
    category: 'make',
    icon: 'M4 20 C8 8 12 16 15 9 S 19 6 20 4 M17 3 L21 7',
    size: { width: 380, height: 480 },
    minimum: { width: 280, height: 360 },
    launch: async () => {
        const { HksPen } = await import('../components/pen/pen.component.ts');
        const pen = new HksPen();

        return {
            element: pen,
            run$: ({ drawing$, playhead$, look$, appearance$ }, { store$ }) => {
                const shared$ = drawing$.pipe(shareReplay({ bufferSize: 1, refCount: true }));
                const stroke$ = shared$.pipe(
                    map(strokeOf),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const count$ = combineLatest([stroke$, playhead$]).pipe(
                    map(([stroke, t]) => dabsAt(stroke, t)),
                    distinctUntilChanged(),
                );
                const colours$ = look$.pipe(
                    switchMap(name => appearance$(name)),
                    map(({ value }) => ({
                        ink: parseHexColor(value.ink),
                        paper: parseHexColor(value.well),
                        faint: FAINT,
                    })),
                    distinctUntilChanged(
                        (a, b) =>
                            a.ink.r === b.ink.r &&
                            a.ink.g === b.ink.g &&
                            a.ink.b === b.ink.b &&
                            a.paper.r === b.paper.r &&
                            a.paper.g === b.paper.g &&
                            a.paper.b === b.paper.b,
                    ),
                );

                return merge(
                    pen
                        .connect$(
                            shared$,
                            sheet$(
                                store$.pipe(map(store => `pen:${store}`)),
                                stroke$,
                                count$,
                                colours$,
                            ),
                            playhead$,
                        )
                        .pipe(ignoreElements()),
                    pen.changes$.pipe(map((command): AppInput => ({ kind: 'pen', command }))),
                );
            },
        };
    },
} satisfies Program;
