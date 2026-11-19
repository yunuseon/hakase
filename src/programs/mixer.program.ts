import { declarations } from '../declarations.ts';
import { combineLatest, merge, of } from 'rxjs';
import {
    ignoreElements,
    map,
    mergeMap,
    shareReplay,
    switchMap,
    withLatestFrom,
} from 'rxjs/operators';
import { mixerView } from '../components/mixer/mixer.ts';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';

export const mixerProgram = {
    ...declarations.mixer,
    size: { width: 420, height: 320 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const { HksMixer } = await import('../components/mixer/mixer.component.ts');
        const mixer = new HksMixer();

        return {
            element: mixer,
            run$: ({ mix$, listening$, soloed$, meter$ }) => {
                const strips$ = mix$.pipe(shareReplay({ bufferSize: 1, refCount: true }));

                return merge(
                    mixer
                        .connect$(
                            combineLatest([strips$, listening$, soloed$]).pipe(
                                map(([strips, listening, soloed]) =>
                                    mixerView(strips, listening, soloed),
                                ),
                            ),
                            strips$.pipe(
                                map(strips => strips.map(({ store }) => store).join('\n')),
                                switchMap(joined =>
                                    joined === ''
                                        ? of([])
                                        : combineLatest(joined.split('\n').map(meter$)),
                                ),
                            ),
                        )
                        .pipe(ignoreElements()),
                    mixer.changes$.pipe(
                        withLatestFrom(strips$),
                        mergeMap(([event, strips]): AppInput[] => {
                            if (event.kind === 'listen') {
                                return [{ kind: 'listen' }];
                            }

                            if (event.kind === 'solo') {
                                return [{ kind: 'solo', store: event.store }];
                            }

                            const strip = strips.find(({ store }) => store === event.store);

                            return strip === undefined
                                ? []
                                : [
                                      {
                                          kind: 'strip',
                                          store: strip.store,
                                          program: strip.program,
                                          command:
                                              event.kind === 'volume'
                                                  ? { kind: 'volume', volume: event.volume }
                                                  : { kind: 'mute', muted: !strip.muted },
                                      },
                                  ];
                        }),
                    ),
                );
            },
        };
    },
} satisfies Program;
