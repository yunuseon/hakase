import {
    animationFrameScheduler,
    combineLatest,
    concat,
    defer,
    from,
    of,
    scheduled,
    type Observable,
} from 'rxjs';
import { concatMap, debounceTime, ignoreElements, switchMap, tap } from 'rxjs/operators';
import { centre } from '../components/sketch/params.ts';
import { hasHistory, type Image } from '../image.ts';
import { averagedInto, cook, readAtlas, type Engine } from './engine.ts';
import { engine$ } from './view.ts';

const SIDE = 128;
const CELL = 32;
const ACROSS = 8;
const MOMENTS = ACROSS * ACROSS;
const ATLAS = CELL * ACROSS;
const PER_FRAME = 8;
const REFERENCE_SIDE = 640;
const SETTLE_MS = 250;

type Step = { readonly t: number; readonly pass: number; readonly cell: number | null };

const stepsOf = (image: Image): readonly (readonly Step[])[] => {
    const moments = Array.from({ length: MOMENTS }, (_, index) => index);
    // In order, so a simulation replays forward; a picture with history plays the loop once unkept first.
    const steps = [
        ...(hasHistory(image)
            ? moments.map(index => ({ t: index / MOMENTS, pass: 1, cell: null }))
            : []),
        ...moments.map(index => ({ t: index / MOMENTS, pass: 2, cell: index })),
    ];

    return Array.from({ length: Math.ceil(steps.length / PER_FRAME) }, (_, index) =>
        steps.slice(index * PER_FRAME, (index + 1) * PER_FRAME),
    );
};

const drawSteps = (engine: Engine, image: Image, seconds: number, steps: readonly Step[]) => {
    const now = performance.now();

    steps.forEach(({ t, pass, cell }) => {
        const picture = cook(
            engine,
            image,
            {
                t,
                seconds,
                width: SIDE,
                height: SIDE,
                pointer: centre,
                pass,
                frame: null,
                dotScale: SIDE / REFERENCE_SIDE,
                lane: 'level',
            },
            now,
        );

        if (cell !== null) {
            averagedInto(
                engine,
                picture,
                { x: (cell % ACROSS) * CELL, y: Math.floor(cell / ACROSS) * CELL },
                CELL,
                ATLAS,
                now,
            );
        }
    });
};

export const cellsOf = (atlas: Uint8Array, across: number, cell: number): Uint8Array[] =>
    Array.from({ length: across * across }, (_, index) => {
        const left = (index % across) * cell;
        const bottom = Math.floor(index / across) * cell;

        return Uint8Array.from({ length: cell * cell * 4 }, (_, at) => {
            const pixel = Math.floor(at / 4);
            const x = left + (pixel % cell);
            const y = bottom + Math.floor(pixel / cell);

            return atlas[(y * across * cell + x) * 4 + (at % 4)] ?? 0;
        });
    });

// A few moments a frame, then one read: 64 draws in one go held the page for 100 ms, and a read per moment waited on every window's drawing.
const framesOf$ = (engine: Engine, image: Image, seconds: number): Observable<Uint8Array[]> =>
    concat(
        from(stepsOf(image)).pipe(
            concatMap(steps => scheduled([steps], animationFrameScheduler)),
            tap(steps => {
                drawSteps(engine, image, seconds, steps);
            }),
            ignoreElements(),
        ),
        defer(() => of(cellsOf(readAtlas(engine, ATLAS, performance.now()), ACROSS, CELL))),
    );

export const pictureFrames$ = (
    image$: Observable<Image>,
    seconds$: Observable<number>,
): Observable<readonly Uint8Array[] | null> =>
    engine$.pipe(
        switchMap(engine =>
            engine instanceof Error
                ? of(null)
                : combineLatest([image$, seconds$]).pipe(
                      debounceTime(SETTLE_MS),
                      switchMap(([image, seconds]) =>
                          image.kind === 'none' ? of(null) : framesOf$(engine, image, seconds),
                      ),
                  ),
        ),
    );

export type PictureFrames = typeof pictureFrames$;
