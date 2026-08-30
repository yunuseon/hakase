import { animationFrames, EMPTY, merge, type Observable, of } from 'rxjs';
import {
    distinctUntilChanged,
    map,
    mergeMap,
    pairwise,
    scan,
    startWith,
    switchMap,
    withLatestFrom,
} from 'rxjs/operators';
import { wrap01 } from '../lib/math.ts';
import type { TimelineParams } from './params.ts';

export type TransportCommand = 'toggle' | 'stop';

const timeCode = (seconds: number): string => {
    const whole = Math.floor(seconds);

    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

export const clockLabel = (at: number, duration: number): string =>
    `${timeCode(at * duration)} / ${timeCode(duration)}`;

// The button cannot know which it means, so the fold owns the flip.
export const isPlaying$ = (commands$: Observable<TransportCommand>): Observable<boolean> =>
    commands$.pipe(
        scan((playing, command) => (command === 'toggle' ? !playing : false), false),
        startWith(false),
        distinctUntilChanged(),
    );

type PlayheadAction =
    | { readonly kind: 'seek'; readonly at: number }
    | { readonly kind: 'advance'; readonly ms: number; readonly duration: number };

const reducePlayhead = (at: number, action: PlayheadAction): number => {
    if (action.kind === 'seek') {
        return action.at;
    }

    return action.duration === 0 ? at : wrap01(at + action.ms / (action.duration * 1000));
};

export const createPlayhead$ = (
    scrubs$: Observable<number>,
    commands$: Observable<TransportCommand>,
    playing$: Observable<boolean>,
    timeline$: Observable<TimelineParams>,
): Observable<number> => {
    const seeks$ = merge(
        scrubs$,
        commands$.pipe(mergeMap(command => (command === 'stop' ? of(0) : EMPTY))),
    ).pipe(map((at): PlayheadAction => ({ kind: 'seek', at })));

    const advances$ = playing$.pipe(
        // Deltas, not elapsed: pausing then playing must resume, not jump.
        switchMap(playing =>
            playing
                ? animationFrames().pipe(
                      pairwise(),
                      map(([previous, frame]) => frame.elapsed - previous.elapsed),
                  )
                : EMPTY,
        ),
        withLatestFrom(timeline$),
        map(([ms, { duration }]): PlayheadAction => ({ kind: 'advance', ms, duration })),
    );

    return merge(seeks$, advances$).pipe(scan(reducePlayhead, 0), startWith(0));
};
