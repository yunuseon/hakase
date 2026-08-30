import { combineLatest, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireElementById } from '../lib/dom.ts';
import { observeResize$ } from '../lib/rx.ts';
import { angularValue, ringOffset, type Point, type Ring } from '../model/slider.ts';
import { pointerDrag$ } from './drag.ts';
import type { Slider } from './slider.ts';

const indicatorTransform = ({ x, y }: Point): string =>
    `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;

export const createCircularSlider = (trackId: string, indicatorId: string): Slider => {
    const track = requireElementById(trackId);
    const indicator = requireElementById(indicatorId);

    const ring$: Observable<Ring> = observeResize$(track, indicator).pipe(
        map(() => ({
            trackRadiusX: track.offsetWidth / 2,
            trackRadiusY: track.offsetHeight / 2,
            indicatorRadiusX: indicator.offsetWidth / 2,
            indicatorRadiusY: indicator.offsetHeight / 2,
        })),
    );

    return {
        changes$: pointerDrag$(track).pipe(
            map(({ clientX, clientY }) => {
                const { left, top, width, height } = track.getBoundingClientRect();
                return angularValue(clientX - (left + width / 2), clientY - (top + height / 2));
            }),
        ),

        connect$: (playhead$: Observable<number>) =>
            combineLatest([ring$, playhead$]).pipe(
                map(([ring, value]) => indicatorTransform(ringOffset(ring, value))),
                distinctUntilChanged(),
                tap(transform => {
                    indicator.style.transform = transform;
                }),
                map(() => undefined),
            ),
    };
};
