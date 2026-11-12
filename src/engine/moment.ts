import { combineLatest, of, timer, type Observable } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { centre, samePointer, steppedRatio, type Pointer } from '../components/sketch/params.ts';
import type { Size } from '../components/window/frame.ts';
import { devicePixelRatio$ } from '../lib/rx.ts';
import type { Clock } from '../shared/playhead.ts';
import type { Moment } from './engine.ts';

const MAX_SIDE = 2048;
const SETTLE_MS = 150;

const scaleOf = ({ width, height }: Size, ratio: number): number =>
    Math.min(ratio, MAX_SIDE / Math.max(width, height, 1));

export const pixelsOf = ({ width, height }: Size, ratio: number): Size => {
    const scale = scaleOf({ width, height }, ratio);

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
};

// A new ratio means new targets in the engine, so a moving zoom waits to settle; the first applies at once.
export const viewRatio$ = (zoom$: Observable<number>): Observable<number> =>
    combineLatest([devicePixelRatio$, zoom$]).pipe(
        map(([pixelRatio, zoom]) => steppedRatio(pixelRatio, zoom)),
        distinctUntilChanged(),
        switchMap((ratio, index) =>
            index === 0 ? of(ratio) : timer(SETTLE_MS).pipe(map(() => ratio)),
        ),
    );

export const momentOf$ = (
    clock$: Observable<Clock>,
    size$: Observable<Size>,
    ratio$: Observable<number>,
): Observable<Moment> =>
    combineLatest([clock$, size$, ratio$]).pipe(
        map(([{ at, duration }, size, ratio]) => ({
            t: at,
            seconds: duration,
            ...pixelsOf(size, ratio),
            pointer: centre,
            pass: 0,
            frame: null,
            dotScale: 1,
            lane: '',
        })),
        distinctUntilChanged(
            (a, b) =>
                a.t === b.t &&
                a.seconds === b.seconds &&
                a.width === b.width &&
                a.height === b.height,
        ),
    );

export const windowMoment$ = (
    clock$: Observable<Clock>,
    size$: Observable<Size>,
    ratio$: Observable<number>,
    pointer$: Observable<Pointer>,
): Observable<Moment> =>
    combineLatest([clock$, size$, ratio$, pointer$.pipe(distinctUntilChanged(samePointer))]).pipe(
        map(([{ at, duration }, size, ratio, pointer]) => ({
            t: at,
            seconds: duration,
            ...pixelsOf(size, ratio),
            pointer,
            pass: 0,
            frame: size,
            dotScale: 1,
            lane: '',
        })),
    );
