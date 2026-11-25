import {
    animationFrames,
    concat,
    animationFrameScheduler,
    combineLatest,
    EMPTY,
    from,
    Observable,
    type ObservableInput,
} from 'rxjs';
import {
    auditTime,
    concatMap,
    map,
    repeat,
    scan,
    shareReplay,
    switchMap,
    takeWhile,
} from 'rxjs/operators';
import { NONE, samplesWanted, type Image } from '../image.ts';
import {
    movedAt,
    movingSide,
    paced,
    SLOTS,
    startMoving,
    startPace,
    type Moving,
    type Pace,
} from './pacing.ts';
import type { Stroke } from '../shared/stroke.ts';
import {
    backdropOf,
    checkFormula,
    checkScene,
    cook,
    sheetOf,
    createEngine,
    presented,
    releaseEngine,
    type Engine,
    type FormulaCheck,
    type SceneCheck,
} from './engine.ts';
import type { Showing } from './moment.ts';

export type View =
    | { readonly kind: 'empty' }
    | { readonly kind: 'frame'; readonly bitmap: ImageBitmap; readonly samples: number | null }
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
            .then((bitmap): View => ({
                kind: 'frame',
                bitmap,
                samples: traces(image) ? Math.floor(moment.samples) : null,
            }))
            .catch(failed);
    } catch (error) {
        return [failed(error)];
    }
};

type Changed = {
    readonly image: Image;
    readonly showing: Showing | null;
    readonly moving: Moving;
};

const traces = (image: Image): boolean => samplesWanted(image, 'preview') > 1;

const refined$ = (image: Image, showing: Showing, side: number): Observable<Showing> => {
    const cap = samplesWanted(image, 'preview');
    const { traceSide } = showing.moment;

    const moving: Showing = {
        ...showing,
        moment: {
            ...showing.moment,
            samples: 1,
            traceSide: traceSide === null ? null : Math.min(traceSide, side),
        },
    };

    return cap <= 1
        ? from([showing])
        : concat(
              from([moving]),
              animationFrames().pipe(
                  scan((pace: Pace, { timestamp }) => paced(pace, timestamp, cap), startPace(0)),
                  map(({ parts }) => parts / SLOTS),
                  takeWhile(samples => samples < cap, true),
                  map(samples => ({ ...showing, moment: { ...showing.moment, samples } })),
              ),
          );
};

export const view$ = (image$: Observable<Image>, showing$: Observable<Showing>): Observable<View> =>
    engine$.pipe(
        switchMap(engine =>
            engine instanceof Error
                ? from([{ kind: 'failed', message: engine.message } as const])
                : combineLatest([image$, showing$]).pipe(
                      auditTime(0, animationFrameScheduler),
                      map(([image, showing]) => ({ image, showing, at: performance.now() })),
                      scan(
                          (last: Changed, { image, showing, at }): Changed => ({
                              image,
                              showing,
                              moving: movedAt(last.moving, at),
                          }),
                          { image: NONE, showing: null, moving: startMoving },
                      ),
                      switchMap(({ image, showing, moving }) =>
                          image.kind === 'none' || showing === null
                              ? from([{ kind: 'empty' } as const])
                              : refined$(image, showing, movingSide(moving)).pipe(
                                    concatMap(each => framed(engine, image, each)),
                                ),
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

export const sceneChecked$ = (code$: Observable<string>): Observable<SceneCheck> =>
    engine$.pipe(
        switchMap(engine =>
            engine instanceof Error
                ? from([{ ok: false, message: engine.message } as const])
                : code$.pipe(map(code => checkScene(engine, code))),
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
