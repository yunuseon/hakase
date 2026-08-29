import { concat, fromEvent, merge, type Observable, of } from 'rxjs';
import { filter, switchMap, takeUntil } from 'rxjs/operators';

/**
 * Emits the pointerdown that starts a drag followed by every pointermove until
 * the gesture ends. Uses pointer capture, so it works for mouse, touch and pen
 * and keeps tracking even when the pointer leaves the element.
 */
export const pointerDrag = (element: HTMLElement): Observable<PointerEvent> =>
    fromEvent<PointerEvent>(element, 'pointerdown').pipe(
        filter(event => event.isPrimary && event.button === 0),
        switchMap(initial => {
            initial.preventDefault();
            element.setPointerCapture(initial.pointerId);

            const samePointer = (event: PointerEvent) => event.pointerId === initial.pointerId;

            const end$ = merge(
                fromEvent<PointerEvent>(element, 'pointerup'),
                fromEvent<PointerEvent>(element, 'pointercancel'),
            ).pipe(filter(samePointer));

            return concat(
                of(initial),
                fromEvent<PointerEvent>(element, 'pointermove').pipe(
                    filter(samePointer),
                    takeUntil(end$),
                ),
            );
        }),
    );
