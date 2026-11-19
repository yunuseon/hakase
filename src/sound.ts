import { combineLatest, EMPTY, merge, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    ignoreElements,
    map,
    mergeMap,
    pairwise,
    scan,
    shareReplay,
    startWith,
    switchMap,
    takeUntil,
    tap,
} from 'rxjs/operators';
import { applyVolume, drumBus$, type DrumBus } from './components/drums/audio/bus.ts';
import { hit } from './components/drums/audio/hit.ts';
import { applyLevel, voiceGraph$, type VoiceGraph } from './components/voice/audio/graph.ts';
import { strike } from './components/voice/audio/strike.ts';
import type { Mix } from './graph/mix.graph.ts';
import { audible, sameStrip, type Strip } from './mix.ts';
import { swellOf, type Hit, type Kit } from './model/drums.ts';
import { plannedNotes, playedAt, unplanned, type Heard, type Planning } from './model/voice.ts';
import type { Clock } from './shared/playhead.ts';
import { frameOf, scheduled, unscheduled, type Schedule, type Strike } from './shared/schedule.ts';
import type { StoreId } from './stores.ts';

type Scheduling = { readonly schedule: Schedule; readonly strikes: readonly Strike<Hit>[] };

// Ahead of the playhead on the audio clock: struck at the frame rate, a note would land up to a frame late.
const voice$ = (frames$: Observable<readonly [Heard, Clock]>) =>
    voiceGraph$.pipe(
        switchMap((graph: VoiceGraph) =>
            merge(
                frames$.pipe(
                    map(([heard, { at, duration, playing }]) =>
                        playedAt(heard, at, duration, playing),
                    ),
                    tap(played => {
                        applyLevel(graph, played);
                    }),
                ),
                frames$.pipe(
                    // Stamped before the fold, so the fold reads nothing but its arguments.
                    map(([heard, clock]) => ({
                        heard,
                        frame: frameOf(clock, graph.context.currentTime),
                    })),
                    scan(
                        (planning: Planning, { heard, frame }) =>
                            plannedNotes(planning, heard, frame),
                        unplanned,
                    ),
                    mergeMap(({ strikes }) => strikes),
                    tap(({ instrument, frequency, at, held }) => {
                        strike(graph.context, graph.filter, instrument, frequency, at, held);
                    }),
                ),
            ),
        ),
    );

const drums$ = (frames$: Observable<readonly [{ kit: Kit; hits: readonly Hit[] }, Clock]>) =>
    drumBus$.pipe(
        switchMap((bus: DrumBus) =>
            merge(
                frames$.pipe(
                    map(([{ kit }, { at, playing }]) => (playing ? swellOf(kit, at) : 0)),
                    distinctUntilChanged(),
                    tap(volume => {
                        applyVolume(bus, volume);
                    }),
                ),
                frames$.pipe(
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
            ),
        ),
    );

type Reads = Pick<Mix, 'strips$' | 'playedIn' | 'clockIn' | 'mutedIn'>;

// Every sound store plays, window or not: what a store sounds like is the core's, the speakers are this effect's.
export const sound$ = (
    { strips$, playedIn, clockIn, mutedIn }: Reads,
    listening$: Observable<boolean>,
    soloed$: Observable<ReadonlySet<StoreId>>,
): Observable<never> => {
    const played$ = (strip: Strip) => {
        const frames = playedIn(strip).pipe(shareReplay({ bufferSize: 1, refCount: true }));

        return strip.program === 'voice'
            ? voice$(
                  combineLatest([
                      frames.pipe(
                          mergeMap(played => (played.kind === 'voice' ? [played.heard] : [])),
                      ),
                      clockIn(strip),
                  ]),
              )
            : drums$(
                  combineLatest([
                      frames.pipe(
                          mergeMap(played =>
                              played.kind === 'drums'
                                  ? [{ kit: played.kit, hits: played.hits }]
                                  : [],
                          ),
                      ),
                      clockIn(strip),
                  ]),
              );
    };

    const heard$ = (strip: Strip) =>
        combineLatest([mutedIn(strip), soloed$]).pipe(
            map(([muted, soloed]) => audible(strip.store, muted, soloed)),
            distinctUntilChanged(),
            switchMap(on => (on ? played$(strip) : EMPTY)),
        );

    // One sound per strip for as long as the strip lasts, so a new voice does not restart the others.
    const each$ = strips$.pipe(
        startWith<readonly Strip[]>([]),
        pairwise(),
        mergeMap(([before, after]) =>
            after.filter(strip => !before.some(other => sameStrip(strip, other))),
        ),
        mergeMap(strip =>
            heard$(strip).pipe(
                takeUntil(
                    strips$.pipe(filter(strips => !strips.some(other => sameStrip(strip, other)))),
                ),
            ),
        ),
    );

    return listening$.pipe(
        distinctUntilChanged(),
        switchMap(on => (on ? each$ : EMPTY)),
        ignoreElements(),
    );
};
