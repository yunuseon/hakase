import { animationFrames, concat, merge, type Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { wrap01 } from './lib/math.ts';
import type { TimelineParams } from './sketch/params.ts';

/**
 * The position being drawn, in [0, 1).
 *
 * Scrubbing any slider sets the position directly. While a non-zero loop
 * duration is set, the position advances every animation frame starting from
 * wherever the last scrub left it.
 */
export const createPlayhead$ = (
    scrubs$: Observable<number>[],
    timeline$: Observable<TimelineParams>,
): Observable<number> => {
    const scrubbed$ = concat(of(0), merge(...scrubs$));

    return scrubbed$.pipe(
        switchMap(offset =>
            timeline$.pipe(
                switchMap(({ duration }) => {
                    if (duration === 0) {
                        return of(offset);
                    }

                    const period = duration * 1000;
                    return animationFrames().pipe(
                        map(({ elapsed }) => wrap01(offset + elapsed / period)),
                    );
                }),
            ),
        ),
    );
};
