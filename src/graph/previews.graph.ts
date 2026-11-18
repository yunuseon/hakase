import { combineLatest, EMPTY, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, startWith, switchMap, take } from 'rxjs/operators';
import { SPARK, sparkOf, type Previews } from '../components/state-wiring/wiring.ts';
import { isConverterKind } from '../converters.ts';
import { followedBy, progressBinding } from '../inputs.ts';
import { driverAt } from '../shared/signal.ts';
import { secondsOf } from '../shared/playhead.ts';
import type { Chrome } from './chrome.graph.ts';
import type { Levels, Pace } from './levels.graph.ts';
import type { Projections } from './projections.graph.ts';
import type { StateMode } from './state-mode.graph.ts';
import type { Timekeeping } from './timekeeping.graph.ts';

type Reads = Pick<Chrome, 'wiring'> &
    Pick<StateMode, 'wiringView$'> &
    Pick<Projections, 'workspace$'> &
    Pick<Timekeeping, 'playbackIn'> &
    Pick<Levels, 'boundIn' | 'offeredIn'>;

const NONE: Previews = { key: null, paths: new Map() };

export const previewsOf = ({
    wiring,
    wiringView$,
    workspace$,
    playbackIn,
    boundIn,
    offeredIn,
}: Reads) => {
    const open$ = combineLatest([wiring.open$, wiringView$]).pipe(
        map(([key, view]) => view?.sockets.find(socket => socket.key === key) ?? null),
        distinctUntilChanged(
            (a, b) =>
                a?.key === b?.key &&
                a?.options.map(({ id, via }) => `${id}>${via}`).join() ===
                    b?.options.map(({ id, via }) => `${id}>${via}`).join(),
        ),
    );
    const clockOf$ = (window: string) =>
        workspace$.pipe(
            take(1),
            map(
                ({ processes }) =>
                    followedBy(processes.find(({ id }) => id === window)?.follows ?? {}, 'playback')
                        ?.store ?? 'timeline',
            ),
        );

    const previews$: Observable<Previews> = open$.pipe(
        switchMap(socket =>
            socket === null || socket.end.kind !== 'port'
                ? of(NONE)
                : clockOf$(socket.window).pipe(
                      switchMap(clock => {
                          const pace$ = playbackIn(clock).pipe(
                              map((now): Pace => ({ seconds: secondsOf(now), ticks: now.ticks })),
                              distinctUntilChanged(
                                  (a, b) => a.seconds === b.seconds && a.ticks === b.ticks,
                              ),
                          );
                          const lines = socket.options.map(option => {
                              const binding = progressBinding(option.source, option.id);
                              const driver$ =
                                  binding === null
                                      ? of(null)
                                      : option.via !== null && isConverterKind(option.via)
                                        ? offeredIn(option.via, binding, pace$)
                                        : boundIn(binding, pace$, new Set());

                              return driver$.pipe(
                                  map(driver =>
                                      driver === null
                                          ? null
                                          : sparkOf(
                                                Array.from({ length: SPARK.samples }, (_, index) =>
                                                    driverAt(driver, index / SPARK.samples),
                                                ),
                                            ),
                                  ),
                                  startWith(null),
                                  map(path => [option.id, path] as const),
                              );
                          });

                          return lines.length === 0
                              ? of({ key: socket.key, paths: new Map<string, string>() })
                              : combineLatest(lines).pipe(
                                    map((pairs): Previews => ({
                                        key: socket.key,
                                        paths: new Map(
                                            pairs.flatMap(([id, path]) =>
                                                path === null ? [] : [[id, path] as const],
                                            ),
                                        ),
                                    })),
                                );
                      }),
                  ),
        ),
    );
    const previewAt$ = open$.pipe(
        switchMap(socket =>
            socket === null
                ? EMPTY
                : clockOf$(socket.window).pipe(
                      switchMap(clock => playbackIn(clock)),
                      map(({ at }) => at),
                      distinctUntilChanged(),
                  ),
        ),
    );

    return { previews$, previewAt$ };
};

export type PreviewsGraph = ReturnType<typeof previewsOf>;
