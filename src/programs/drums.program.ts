import { declarations } from '../declarations.ts';
import { combineLatest, EMPTY, merge, of } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
    tap,
} from 'rxjs/operators';
import { applyVolume, drumBus$, type DrumBus } from '../components/drums/audio/bus.ts';
import { hit } from '../components/drums/audio/hit.ts';
import { hitsOf, swellOf, type Hit } from '../model/drums.ts';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';
import {
    drumsCommandOf,
    drumsMenu,
    drumsMenuCommandOf,
    drumsSections,
} from '../components/drums/drums-controls.ts';
import { frameOf, scheduled, unscheduled, type Schedule, type Strike } from '../shared/schedule.ts';

type Scheduling = { readonly schedule: Schedule; readonly strikes: readonly Strike<Hit>[] };

export const drumsProgram = {
    ...declarations.drums,
    size: { width: 560, height: 400 },
    minimum: { width: 220, height: 180 },
    audible: true,
    launch: async () => {
        const [{ HksDrums }, { HksProperties }, { HksMenu }] = await Promise.all([
            import('../components/drums/drums.component.ts'),
            import('../shared/ui/properties.component.ts'),
            import('../shared/ui/menu.component.ts'),
        ]);
        const drums = new HksDrums();
        const properties = new HksProperties();
        properties.slot = 'controls';
        drums.append(properties);
        const menu = new HksMenu();

        return {
            element: drums,
            actions: menu,
            run$: ({ kit$, playhead$, clock$ }) => {
                // Together: hits derived beside the kit would reach the combineLatest below by two paths.
                const heard$ = kit$.pipe(
                    map(kit => ({ kit, hits: hitsOf(kit.drums) })),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const events$ = drums.changes$.pipe(share());
                const listening$ = events$.pipe(
                    scan((on, event) => (event.kind === 'listen' ? !on : on), false),
                    startWith(false),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const frames$ = combineLatest([heard$, clock$]);
                const played$ = (bus: DrumBus) =>
                    merge(
                        frames$.pipe(
                            map(([{ kit }, { at, playing }]) => (playing ? swellOf(kit, at) : 0)),
                            distinctUntilChanged(),
                            tap(volume => {
                                applyVolume(bus, volume);
                            }),
                        ),
                        // Ahead of the playhead on the audio clock: struck at the frame rate, a hit would land up to a frame late.
                        frames$.pipe(
                            // Stamped before the fold, so the fold reads nothing but its arguments.
                            map(([{ hits }, clock]) => ({
                                hits,
                                frame: frameOf(clock, bus.context.currentTime),
                            })),
                            scan(
                                ({ schedule }: Scheduling, { hits, frame }) =>
                                    scheduled(schedule, frame, hits),
                                { schedule: unscheduled, strikes: [] },
                            ),
                            mergeMap(({ strikes }) => strikes),
                            tap(({ at, span }) => {
                                hit(bus.context, bus.input, span.drum, at, span.velocity);
                            }),
                        ),
                    );

                return merge(
                    drums
                        .connect$(
                            kit$.pipe(
                                map(({ drums: pattern }) => pattern),
                                distinctUntilChanged(),
                                shareReplay({ bufferSize: 1, refCount: true }),
                            ),
                            playhead$,
                            listening$,
                        )
                        .pipe(ignoreElements()),
                    listening$.pipe(
                        switchMap(on => (on ? drumBus$.pipe(switchMap(played$)) : EMPTY)),
                        ignoreElements(),
                    ),
                    properties
                        .connect$(
                            kit$.pipe(
                                map(({ drums: pattern }) => pattern),
                                distinctUntilChanged(),
                                map(drumsSections),
                            ),
                        )
                        .pipe(ignoreElements()),
                    menu.connect$(of(drumsMenu), 'pattern actions').pipe(ignoreElements()),
                    merge(
                        properties.changes$.pipe(mergeMap(drumsCommandOf)),
                        menu.picks$.pipe(mergeMap(drumsMenuCommandOf)),
                    ).pipe(map((command): AppInput => ({ kind: 'drums', command }))),
                    events$.pipe(
                        mergeMap((event): AppInput[] =>
                            event.kind === 'command'
                                ? [{ kind: 'drums', command: event.command }]
                                : [],
                        ),
                    ),
                );
            },
        };
    },
} satisfies Program;
