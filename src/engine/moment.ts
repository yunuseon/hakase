import { combineLatest, of, timer, type Observable } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { centre, samePointer, steppedRatio, type Pointer } from '../components/sketch/params.ts';
import type { Size } from '../components/window/frame.ts';
import { devicePixelRatio$ } from '../lib/rx.ts';
import type { Clock } from '../shared/playhead.ts';
import type { Moment } from './engine.ts';
import { isPedalKind } from '../pedals.ts';
import { boxOf, onScreen, type Workspace } from '../workspace.ts';
import type { Extent } from '../shared/camera.ts';
import { aspectSize, type Aspect } from '../components/sketch/animation.ts';

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

export type Showing = { readonly moment: Moment; readonly slot: Size };

const PREVIEW_SIDES = [256, 512, 1024, 2048] as const;

// One for the app, so every window showing a chain shares one drawing a frame: the widest such window in view, in pixels, rounded up to a step.
export const previewSideOf = (workspace: Workspace, viewport: Extent, ratio: number): number => {
    const widest = workspace.processes
        .filter(process => process.program === 'output' || isPedalKind(process.program))
        .map(boxOf)
        .filter(box => onScreen(box, workspace.camera, viewport))
        .reduce((side, box) => Math.max(side, box.width * workspace.camera.zoom * ratio), 0);

    return PREVIEW_SIDES.find(side => side >= widest) ?? MAX_SIDE;
};

// A chain's picture has the app's aspect, whatever the window: a window only decides how finely it is drawn.
export const chainShowing$ = (
    clock$: Observable<Clock>,
    aspect$: Observable<Aspect>,
    side$: Observable<number>,
    size$: Observable<Size>,
    ratio$: Observable<number>,
): Observable<Showing> =>
    combineLatest([clock$, aspect$, side$, size$, ratio$]).pipe(
        map(([{ at, duration }, aspect, side, size, ratio]) => {
            const slot = pixelsOf(size, ratio);

            return {
                moment: {
                    t: at,
                    seconds: duration,
                    ...aspectSize(aspect, side),
                    pointer: centre,
                    pass: 0,
                    frame: null,
                    dotScale: 1,
                    lane: '',
                },
                slot,
            };
        }),
        distinctUntilChanged(
            (a, b) =>
                a.moment.t === b.moment.t &&
                a.moment.seconds === b.moment.seconds &&
                a.moment.width === b.moment.width &&
                a.moment.height === b.moment.height &&
                a.slot.width === b.slot.width &&
                a.slot.height === b.slot.height,
        ),
    );

export const windowShowing$ = (
    clock$: Observable<Clock>,
    size$: Observable<Size>,
    ratio$: Observable<number>,
    pointer$: Observable<Pointer>,
): Observable<Showing> =>
    combineLatest([clock$, size$, ratio$, pointer$.pipe(distinctUntilChanged(samePointer))]).pipe(
        map(([{ at, duration }, size, ratio, pointer]) => {
            const pixels = pixelsOf(size, ratio);

            return {
                moment: {
                    t: at,
                    seconds: duration,
                    ...pixels,
                    pointer,
                    pass: 0,
                    frame: size,
                    dotScale: 1,
                    lane: '',
                },
                slot: pixels,
            };
        }),
    );
