import type { Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, requireElementById } from '../lib/dom.ts';
import { linearValue } from '../model/slider.ts';
import { pointerDrag$ } from './drag.ts';
import type { Slider } from './slider.ts';

const indicatorWidth = (value: number): string => `${(value * 100).toFixed(3)}%`;

export const createLinearSlider = (id: string): Slider => {
    const track = requireElementById(id);
    const indicator = requireChild(track, '.slider-indicator');

    return {
        changes$: pointerDrag$(track).pipe(
            map(({ clientX }) => {
                const { left, width } = track.getBoundingClientRect();
                return linearValue(clientX - left, width);
            }),
        ),

        connect$: (playhead$: Observable<number>) =>
            playhead$.pipe(
                map(indicatorWidth),
                distinctUntilChanged(),
                tap(width => {
                    indicator.style.width = width;
                }),
                map(() => undefined),
            ),
    };
};
