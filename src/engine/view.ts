import {
    animationFrameScheduler,
    combineLatest,
    from,
    Observable,
    type ObservableInput,
} from 'rxjs';
import { auditTime, concatMap, shareReplay, switchMap } from 'rxjs/operators';
import type { Image } from '../image.ts';
import {
    cook,
    createEngine,
    presented,
    releaseEngine,
    type Engine,
    type Moment,
} from './engine.ts';

export type View =
    | { readonly kind: 'empty' }
    | { readonly kind: 'frame'; readonly bitmap: ImageBitmap }
    | { readonly kind: 'failed'; readonly message: string };

export const engine$ = new Observable<Engine | Error>(subscriber => {
    try {
        const engine = createEngine();
        subscriber.next(engine);

        return () => {
            releaseEngine(engine);
        };
    } catch (error) {
        subscriber.next(error instanceof Error ? error : new Error(String(error)));

        return undefined;
    }
}).pipe(shareReplay({ bufferSize: 1, refCount: true }));

const failed = (error: unknown): View => ({
    kind: 'failed',
    message: error instanceof Error ? error.message : String(error),
});

const framed = (engine: Engine, image: Image, moment: Moment): ObservableInput<View> => {
    try {
        const texture = cook(engine, image, moment, performance.now());

        return presented(engine, texture, moment.width, moment.height)
            .then((bitmap): View => ({ kind: 'frame', bitmap }))
            .catch(failed);
    } catch (error) {
        return [failed(error)];
    }
};

export const view$ = (image$: Observable<Image>, moment$: Observable<Moment>): Observable<View> =>
    engine$.pipe(
        switchMap(engine =>
            engine instanceof Error
                ? from([{ kind: 'failed', message: engine.message } as const])
                : combineLatest([image$, moment$]).pipe(
                      auditTime(0, animationFrameScheduler),
                      concatMap(([image, moment]) =>
                          image.kind === 'none'
                              ? [{ kind: 'empty' } as const]
                              : framed(engine, image, moment),
                      ),
                  ),
        ),
    );
