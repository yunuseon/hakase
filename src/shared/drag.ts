import { concat, merge, type Observable, of } from 'rxjs';
import { filter, map, pairwise, switchMap, takeUntil, tap } from 'rxjs/operators';
import { fromDocumentEvent$, fromElementEvent$ } from '../lib/rx.ts';

const gestures$ = (
    element: HTMLElement,
    accepts: (start: PointerEvent) => boolean,
): Observable<Observable<PointerEvent>> =>
    fromElementEvent$(element, 'pointerdown').pipe(
        filter(event => event.isPrimary && event.button === 0 && accepts(event)),

        tap(initial => {
            initial.preventDefault();

            try {
                element.setPointerCapture(initial.pointerId);
            } catch {
                // The pointer can be gone already; one throw here kills the app.
            }
        }),
        map(initial => {
            const samePointer = (event: PointerEvent) => event.pointerId === initial.pointerId;

            // On the document: a release off the element must still end the gesture.
            const end$ = merge(
                fromDocumentEvent$('pointerup'),
                fromDocumentEvent$('pointercancel'),
            ).pipe(filter(samePointer));

            return concat(
                of(initial),
                fromDocumentEvent$('pointermove').pipe(filter(samePointer), takeUntil(end$)),
            );
        }),
    );

const always = (): boolean => true;

export const pointerDrag$ = (
    element: HTMLElement,
    accepts: (start: PointerEvent) => boolean = always,
): Observable<PointerEvent> => gestures$(element, accepts).pipe(switchMap(gesture => gesture));

export type Delta = {
    readonly dx: number;
    readonly dy: number;
};

// Pairing must stay inside the gesture, or each drag starts with a jump.
export const pointerDelta$ = (
    element: HTMLElement,
    accepts: (start: PointerEvent) => boolean = always,
): Observable<Delta> =>
    gestures$(element, accepts).pipe(
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
