import { concat, merge, type Observable, of } from 'rxjs';
import { filter, switchMap, takeUntil, tap } from 'rxjs/operators';
import { fromElementEvent$ } from '../lib/rx.ts';

export const pointerDrag$ = (element: HTMLElement): Observable<PointerEvent> =>
    fromElementEvent$(element, 'pointerdown').pipe(
        filter(event => event.isPrimary && event.button === 0),

        tap(initial => {
            initial.preventDefault();
            element.setPointerCapture(initial.pointerId);
        }),
        switchMap(initial => {
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
