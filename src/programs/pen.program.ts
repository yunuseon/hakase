import { declarations } from '../declarations.ts';
import { penCommandOf, penSections } from '../components/pen/pen-controls.ts';
import { combineLatest, merge } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    mergeMap,
    shareReplay,
    switchMap,
} from 'rxjs/operators';
import { sheet$ } from '../engine/view.ts';
import { parseHexColor } from '../lib/color.ts';
import { dabsAt } from '../shared/stroke.ts';
import { strokeOf } from '../model/pen.ts';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';

const FAINT = 0.22;

export const penProgram = {
    ...declarations.pen,
    size: { width: 380, height: 480 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const [{ HksPen }, { HksProperties }] = await Promise.all([
            import('../components/pen/pen.component.ts'),
            import('../shared/ui/properties.component.ts'),
        ]);
        const pen = new HksPen();
        const properties = new HksProperties();
        properties.slot = 'controls';
        pen.append(properties);

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
                    properties
                        .connect$(
                            shared$.pipe(
                                map(({ pen: document }) => document),
                                distinctUntilChanged(),
                                map(penSections),
                            ),
                        )
                        .pipe(ignoreElements()),
                    merge(pen.changes$, properties.changes$.pipe(mergeMap(penCommandOf))).pipe(
                        map((command): AppInput => ({ kind: 'pen', command })),
                    ),
                );
            },
        };
    },
} satisfies Program;
