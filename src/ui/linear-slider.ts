import type { Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, requireElementById } from '../lib/dom.ts';
import { clamp } from '../lib/math.ts';
import { toVoid$ } from '../lib/rx.ts';
import { pointerDrag$ } from './drag.ts';
import type { Slider } from './slider.ts';

const valueAt = (clientX: number, left: number, width: number): number =>
    clamp((clientX - left) / width, 0, 1);

const indicatorWidth = (value: number): string => `${(value * 100).toFixed(3)}%`;

export const createLinearSlider = (id: string): Slider => {
    const track = requireElementById(id);
    const indicator = requireChild(track, '.slider-indicator');

    return {
        changes$: pointerDrag$(track).pipe(
            map(({ clientX }) => {
                const { left, width } = track.getBoundingClientRect();
                return valueAt(clientX, left, width);
            }),
        ),

        connect$: (playhead$: Observable<number>) =>
            playhead$.pipe(
                map(indicatorWidth),
                distinctUntilChanged(),
                tap(width => {
                    indicator.style.width = width;
                }),
                toVoid$,
            ),
    };
};
