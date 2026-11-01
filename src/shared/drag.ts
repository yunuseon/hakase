import { concat, merge, type Observable, of } from 'rxjs';
import {
    filter,
    map,
    pairwise,
    shareReplay,
    switchMap,
    take,
    takeUntil,
    tap,
} from 'rxjs/operators';
import { fromDocumentEvent$, fromElementEvent$ } from '../lib/rx.ts';

const always = (): boolean => true;

export const PHASES = ['grab', 'move', 'release'] as const;
export type Phase = (typeof PHASES)[number];

export type PointerPhase = {
    readonly phase: Phase;
    readonly event: PointerEvent;
};

const gestures$ = (
    element: HTMLElement,
    accepts: (start: PointerEvent) => boolean,
): Observable<Observable<PointerPhase>> =>
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

            // On the document, so a release off the element still ends it; replayed, as the moves see it first.
            const end$ = merge(
                fromDocumentEvent$('pointerup'),
                fromDocumentEvent$('pointercancel'),
            ).pipe(filter(samePointer), take(1), shareReplay({ bufferSize: 1, refCount: false }));

            return concat(
                of({ phase: 'grab' as const, event: initial }),
                fromDocumentEvent$('pointermove').pipe(
                    filter(samePointer),
                    takeUntil(end$),
                    map((event): PointerPhase => ({ phase: 'move', event })),
                ),
                end$.pipe(map((event): PointerPhase => ({ phase: 'release', event }))),
            );
        }),
    );

export const pointerGesture$ = (
    element: HTMLElement,
    accepts: (start: PointerEvent) => boolean = always,
): Observable<PointerPhase> => gestures$(element, accepts).pipe(switchMap(gesture => gesture));

const pressed$ = (gesture: Observable<PointerPhase>): Observable<PointerEvent> =>
    gesture.pipe(
        filter(({ phase }) => phase !== 'release'),
        map(({ event }) => event),
    );

export const pointerDrag$ = (
    element: HTMLElement,
    accepts: (start: PointerEvent) => boolean = always,
): Observable<PointerEvent> =>
    gestures$(element, accepts).pipe(switchMap(gesture => pressed$(gesture)));

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
            pressed$(gesture).pipe(
                pairwise(),
                map(([from, to]) => ({
                    dx: to.clientX - from.clientX,
                    dy: to.clientY - from.clientY,
                })),
            ),
        ),
    );
