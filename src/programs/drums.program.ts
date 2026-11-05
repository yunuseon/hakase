import { combineLatest, EMPTY, merge } from 'rxjs';
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
import { HksDrums } from '../components/drums/drums.component.ts';
import { hitsOf, swellOf, type Hit } from '../components/drums/drums.ts';
import { drumsInputs, playbackInput } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';
import { scheduled, unscheduled, type Schedule, type Strike } from '../shared/schedule.ts';

type Scheduling = { readonly schedule: Schedule; readonly strikes: readonly Strike<Hit>[] };

export const drumsProgram = {
    id: 'drums',
    inputs: { playback: playbackInput, ...drumsInputs },
    title: 'drums',
    category: 'make',
    icon: 'M4 9 A8 3 0 0 1 20 9 V15 A8 3 0 0 1 4 15 Z M4 9 A8 3 0 0 0 20 9 M7 4 L11 8 M17 4 L13 8',
    size: { width: 560, height: 400 },
    minimum: { width: 420, height: 300 },
    launch: () => {
        const drums = new HksDrums();

        return {
            element: drums,
            run$: ({ kit$, playhead$, playing$, duration$ }) => {
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
                const frames$ = combineLatest([heard$, playhead$, duration$, playing$]);
                const played$ = (bus: DrumBus) =>
                    merge(
                        frames$.pipe(
                            map(([{ kit }, t, , playing]) => (playing ? swellOf(kit, t) : 0)),
                            distinctUntilChanged(),
                            tap(volume => {
                                applyVolume(bus, volume);
                            }),
                        ),
                        // Ahead of the playhead on the audio clock: struck at the frame rate, a hit would land up to a frame late.
                        frames$.pipe(
                            scan(
                                ({ schedule }: Scheduling, [{ hits }, t, seconds, playing]) =>
                                    scheduled(
                                        schedule,
                                        { t, now: bus.context.currentTime, seconds, playing },
                                        hits,
                                    ),
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
