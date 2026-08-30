import { concat, defer, fromEvent, Observable, of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';

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

// defer is load-bearing: it resolves the self-reference at subscribe time, and
// a media query can only ask about one ratio, so the stream must re-arm itself.
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

export const shallowEqual = <T extends Record<string, unknown>>(a: T, b: T): boolean => {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
};

export const toVoid$ = map(() => undefined);
