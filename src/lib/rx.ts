import { concat, defer, fromEvent, merge, Observable, of, timer } from 'rxjs';
import { remScale, viewportSize, visibleViewport, type Viewport } from './dom.ts';
import { distinctUntilChanged, map, shareReplay, startWith, switchMap, take } from 'rxjs/operators';

export const fromElementEvent$ = <K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    type: K,
    options?: AddEventListenerOptions,
): Observable<HTMLElementEventMap[K]> =>
    new Observable<HTMLElementEventMap[K]>(subscriber => {
        const listener = (event: HTMLElementEventMap[K]) => {
            subscriber.next(event);
        };

        element.addEventListener(type, listener, options);

        return () => {
            element.removeEventListener(type, listener, options);
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

const rootsWithin = (scope: ParentNode): readonly ShadowRoot[] =>
    [...scope.querySelectorAll('*')].flatMap(element =>
        element.shadowRoot ? [element.shadowRoot, ...rootsWithin(element.shadowRoot)] : [],
    );

const shadowRootsIn = (node: Node): readonly ShadowRoot[] =>
    node instanceof Element
        ? [
              ...(node.shadowRoot ? [node.shadowRoot, ...rootsWithin(node.shadowRoot)] : []),
              ...rootsWithin(node),
          ]
        : node instanceof Document || node instanceof DocumentFragment
          ? rootsWithin(node)
          : [];

const WATCHED: MutationObserverInit = {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
    attributeOldValue: true,
    characterDataOldValue: true,
};

// A MutationObserver stops at every shadow root, so each one is observed as it arrives.
export const mutations$ = (root: Node): Observable<readonly MutationRecord[]> =>
    new Observable<readonly MutationRecord[]>(subscriber => {
        const observer = new MutationObserver(records => {
            records
                .flatMap(record => [...record.addedNodes])
                .flatMap(shadowRootsIn)
                .forEach(shadow => observer.observe(shadow, WATCHED));
            subscriber.next(records);
        });

        observer.observe(root, WATCHED);
        shadowRootsIn(root).forEach(shadow => observer.observe(shadow, WATCHED));

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

// Deferred: a module that only imports this must load where there is no window.
export const viewport$: Observable<Viewport> = defer(() =>
    fromEvent(window, 'resize').pipe(
        map(() => viewportSize()),
        startWith(viewportSize()),
    ),
).pipe(shareReplay({ bufferSize: 1, refCount: false }));

export const wallClock$: Observable<number> = timer(0, 1000).pipe(
    map(() => Date.now()),
    shareReplay({ bufferSize: 1, refCount: true }),
);

export const visibleViewport$ = defer(() => {
    const viewport = window.visualViewport;
    const resize$ = fromEvent(window, 'resize');

    return (
        viewport === null || viewport === undefined
            ? resize$
            : merge(resize$, fromEvent(viewport, 'resize'), fromEvent(viewport, 'scroll'))
    ).pipe(startWith(undefined), map(visibleViewport));
}).pipe(shareReplay({ bufferSize: 1, refCount: true }));

export const coarsePointer$ = defer(() => {
    const query = window.matchMedia('(any-pointer: coarse)');

    return fromEvent(query, 'change').pipe(
        startWith(undefined),
        map(() => query.matches),
        distinctUntilChanged(),
    );
}).pipe(shareReplay({ bufferSize: 1, refCount: true }));

// A 1rem probe, since nothing fires when the root font size changes; measured at once, because a hidden pane delivers no resizes.
export const remScale$: Observable<number> = new Observable<number>(subscriber => {
    const probe = document.createElement('div');
    probe.style.cssText =
        'position: absolute; visibility: hidden; pointer-events: none; inline-size: 1rem; block-size: 0;';
    document.body.append(probe);
    const observer = new ResizeObserver(() => {
        subscriber.next(remScale());
    });
    subscriber.next(remScale());
    observer.observe(probe);

    return () => {
        observer.disconnect();
        probe.remove();
    };
}).pipe(distinctUntilChanged(), shareReplay({ bufferSize: 1, refCount: true }));
