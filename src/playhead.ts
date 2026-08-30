import { animationFrames, concat, merge, type Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { wrap01 } from './lib/math.ts';
import type { TimelineParams } from './sketch/params.ts';

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
