import { declarations } from '../declarations.ts';
import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map, mergeMap } from 'rxjs/operators';
import { signalCommandOf, signalSections } from '../components/signal/signal-controls.ts';
import { PARAMS, type Wave } from '../shared/signal.ts';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';
import { chainLine } from '../why.ts';

const sameMods = (a: Wave['mods'], b: Wave['mods']): boolean =>
    PARAMS.every(param => (a[param] === null) === (b[param] === null));

export const signalProgram = {
    ...declarations.signal,
    size: { width: 300, height: 300 },
    minimum: { width: 220, height: 240 },
    launch: async () => {
        const [{ HksSignal }, { HksProperties }] = await Promise.all([
            import('../components/signal/signal.component.ts'),
            import('../shared/ui/properties.component.ts'),
        ]);
        const signal = new HksSignal();
        const properties = new HksProperties();
        signal.append(properties);

        return {
            element: signal,
            run$: ({ signal$, wave$, playhead$, chains$ }) =>
                merge(
                    signal.connect$(signal$, wave$, playhead$).pipe(ignoreElements()),
                    properties
                        .connect$(
                            combineLatest([
                                signal$,
                                wave$.pipe(
                                    map(({ mods }) => mods),
                                    distinctUntilChanged(sameMods),
                                ),
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
                            ]).pipe(
                                map(([document, mods, lines]) =>
                                    signalSections(document, mods, lines),
                                ),
                            ),
                        )
                        .pipe(ignoreElements()),
                    merge(
                        signal.commands$,
                        properties.changes$.pipe(mergeMap(signalCommandOf)),
                    ).pipe(map((command): AppInput => ({ kind: 'signal', command }))),
                    signal.whys$.pipe(map((input): AppInput => ({ kind: 'why', input }))),
                ),
        };
    },
} satisfies Program;
