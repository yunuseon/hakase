import { concat, defer, fromEvent, Observable, of } from 'rxjs';
import { viewportSize, type Viewport } from './dom.ts';
import { map, shareReplay, startWith, switchMap, take } from 'rxjs/operators';

export const fromElementEvent$ = <K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    type: K,
): Observable<HTMLElementEventMap[K]> =>
    new Observable<HTMLElementEventMap[K]>(subscriber => {
        const listener = (event: HTMLElementEventMap[K]) => {
            subscriber.next(event);
        };

        element.addEventListener(type, listener);

        return () => {
            element.removeEventListener(type, listener);
        };
    });

export const fromDocumentEvent$ = <K extends keyof DocumentEventMap>(
    type: K,
): Observable<DocumentEventMap[K]> =>
    new Observable<DocumentEventMap[K]>(subscriber => {
        const listener = (event: DocumentEventMap[K]) => {
            subscriber.next(event);
        };

        document.addEventListener(type, listener);

        return () => {
            document.removeEventListener(type, listener);
        };
    });

export const observeResize$ = (...elements: Element[]): Observable<void> =>
    new Observable<void>(subscriber => {
        const observer = new ResizeObserver(() => {
            subscriber.next();
        });

        for (const element of elements) {
            observer.observe(element);
        }

        return () => {
            observer.disconnect();
        };
    });

// defer is load-bearing: it resolves the self-reference, which re-arms the query.
export const devicePixelRatio$: Observable<number> = defer(() => {
    const ratio = window.devicePixelRatio;
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);

    return concat(
        of(ratio),
        fromEvent(query, 'change').pipe(
            take(1),
            switchMap(() => devicePixelRatio$),
        ),
    );
});

export const viewport$: Observable<Viewport> = fromEvent(window, 'resize').pipe(
    map(() => viewportSize()),
    startWith(viewportSize()),
    shareReplay({ bufferSize: 1, refCount: false }),
);
