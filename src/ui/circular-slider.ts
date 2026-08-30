import { combineLatest, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireElementById } from '../lib/dom.ts';
import { TAU, wrap01 } from '../lib/math.ts';
import { observeResize$, shallowEqual, toVoid$ } from '../lib/rx.ts';
import { pointerDrag$ } from './drag.ts';
import type { Slider } from './slider.ts';

const ZERO_AT = 0.25;

type Geometry = {
    trackRadiusX: number;
    trackRadiusY: number;
    indicatorRadiusX: number;
    indicatorRadiusY: number;
};

type Offset = {
    x: number;
    y: number;
};

const valueAt = (clientX: number, clientY: number, track: DOMRect): number => {
    const deltaX = clientX - (track.left + track.width / 2);
    const deltaY = clientY - (track.top + track.height / 2);

    return wrap01(Math.atan2(deltaY, deltaX) / TAU + ZERO_AT);
};

const offsetFor = (geometry: Geometry, value: number): Offset => {
    const angle = (value - ZERO_AT) * TAU;

    return {
        x:
            geometry.trackRadiusX -
            geometry.indicatorRadiusX +
            Math.cos(angle) * geometry.trackRadiusX,
        y:
            geometry.trackRadiusY -
            geometry.indicatorRadiusY +
            Math.sin(angle) * geometry.trackRadiusY,
    };
};

export const createCircularSlider = (trackId: string, indicatorId: string): Slider => {
    const track = requireElementById(trackId);
    const indicator = requireElementById(indicatorId);

    const geometry$: Observable<Geometry> = observeResize$(track, indicator).pipe(
        map(() => ({
            trackRadiusX: track.offsetWidth / 2,
            trackRadiusY: track.offsetHeight / 2,
            indicatorRadiusX: indicator.offsetWidth / 2,
            indicatorRadiusY: indicator.offsetHeight / 2,
        })),
        distinctUntilChanged(shallowEqual),
    );

    return {
        changes$: pointerDrag$(track).pipe(
            map(({ clientX, clientY }) => valueAt(clientX, clientY, track.getBoundingClientRect())),
        ),

        connect$: (playhead$: Observable<number>) =>
            combineLatest([geometry$, playhead$]).pipe(
                map(([geometry, value]) => offsetFor(geometry, value)),
                distinctUntilChanged(shallowEqual),
                tap(({ x, y }) => {
                    indicator.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
                }),
                toVoid$,
            ),
    };
};
