import {
    animationFrameScheduler,
    combineLatest,
    EMPTY,
    from,
    Observable,
    type ObservableInput,
} from 'rxjs';
import { auditTime, concatMap, map, repeat, shareReplay, switchMap } from 'rxjs/operators';
import type { Image } from '../image.ts';
import type { Stroke } from '../shared/stroke.ts';
import {
    backdropOf,
    checkFormula,
    cook,
    sheetOf,
    createEngine,
    presented,
    releaseEngine,
    type Engine,
    type FormulaCheck,
} from './engine.ts';
import type { Showing } from './moment.ts';

export type View =
    | { readonly kind: 'empty' }
    | { readonly kind: 'frame'; readonly bitmap: ImageBitmap }
    | { readonly kind: 'failed'; readonly message: string };

const RECREATE_MS = 100;

// A lost context completes this engine and repeat makes a fresh one; every picture is a recipe, so it simply draws again.
export const engine$ = new Observable<Engine | Error>(subscriber => {
    try {
        const engine = createEngine();
        const lost = (event: Event) => {
            event.preventDefault();
            subscriber.complete();
        };
        engine.canvas.addEventListener('webglcontextlost', lost);
        subscriber.next(engine);

        return () => {
            engine.canvas.removeEventListener('webglcontextlost', lost);
            releaseEngine(engine);
        };
    } catch (error) {
        subscriber.next(error instanceof Error ? error : new Error(String(error)));

        return undefined;
    }
}).pipe(repeat({ delay: RECREATE_MS }), shareReplay({ bufferSize: 1, refCount: true }));

const failed = (error: unknown): View => ({
    kind: 'failed',
    message: error instanceof Error ? error.message : String(error),
});

const framed = (engine: Engine, image: Image, { moment, slot }: Showing): ObservableInput<View> => {
    try {
        const picture = cook(engine, image, moment, performance.now());

        return presented(engine, picture, slot.width, slot.height, backdropOf(image))
            .then((bitmap): View => ({ kind: 'frame', bitmap }))
            .catch(failed);
    } catch (error) {
        return [failed(error)];
    }
};

export const view$ = (image$: Observable<Image>, showing$: Observable<Showing>): Observable<View> =>
    engine$.pipe(
        switchMap(engine =>
            engine instanceof Error
                ? from([{ kind: 'failed', message: engine.message } as const])
                : combineLatest([image$, showing$]).pipe(
                      auditTime(0, animationFrameScheduler),
                      concatMap(([image, showing]) =>
                          image.kind === 'none'
                              ? [{ kind: 'empty' } as const]
                              : framed(engine, image, showing),
                      ),
                  ),
        ),
    );

export const checked$ = (text$: Observable<string>): Observable<FormulaCheck> =>
    engine$.pipe(
        switchMap(engine =>
            engine instanceof Error
                ? from([{ ok: false, message: engine.message } as const])
                : text$.pipe(map(text => checkFormula(engine, text))),
        ),
    );

export type SheetColours = Parameters<typeof sheetOf>[4];

export const sheet$ = (
    key$: Observable<string>,
    stroke$: Observable<Stroke>,
    count$: Observable<number>,
    colours$: Observable<SheetColours>,
): Observable<ImageBitmap> =>
    engine$.pipe(
        switchMap(engine =>
            engine instanceof Error
                ? EMPTY
                : combineLatest([key$, stroke$, count$, colours$]).pipe(
                      auditTime(0, animationFrameScheduler),
                      concatMap(([key, stroke, count, colours]) =>
                          from(sheetOf(engine, key, stroke, count, colours, performance.now())),
                      ),
                  ),
        ),
    );
