import { concat, merge, type Observable, of } from 'rxjs';
import { filter, map, pairwise, switchMap, takeUntil, tap } from 'rxjs/operators';
import { fromElementEvent$ } from '../lib/rx.ts';

const gestures$ = (element: HTMLElement): Observable<Observable<PointerEvent>> =>
    fromElementEvent$(element, 'pointerdown').pipe(
        filter(event => event.isPrimary && event.button === 0),

        tap(initial => {
            initial.preventDefault();
            element.setPointerCapture(initial.pointerId);
        }),
        map(initial => {
            const samePointer = (event: PointerEvent) => event.pointerId === initial.pointerId;

            const end$ = merge(
                fromElementEvent$(element, 'pointerup'),
                fromElementEvent$(element, 'pointercancel'),
            ).pipe(filter(samePointer));

            return concat(
                of(initial),
                fromElementEvent$(element, 'pointermove').pipe(
                    filter(samePointer),
                    takeUntil(end$),
                ),
            );
        }),
    );

export const pointerDrag$ = (element: HTMLElement): Observable<PointerEvent> =>
    gestures$(element).pipe(switchMap(gesture => gesture));

export type Delta = {
    readonly dx: number;
    readonly dy: number;
};

// Pairing must stay inside the gesture, or each drag starts with a jump.
export const pointerDelta$ = (element: HTMLElement): Observable<Delta> =>
    gestures$(element).pipe(
        switchMap(gesture =>
            gesture.pipe(
                pairwise(),
                map(([from, to]) => ({
                    dx: to.clientX - from.clientX,
                    dy: to.clientY - from.clientY,
                })),
            ),
        ),
    );
