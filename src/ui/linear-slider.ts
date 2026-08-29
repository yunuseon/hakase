import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { requireChild, requireElementById } from '../lib/dom.ts';
import { clamp } from '../lib/math.ts';
import { pointerDrag } from './drag.ts';

export interface Slider {
    /** Values in [0, 1) produced by the user dragging the control. */
    readonly changes$: Observable<number>;
    /** Moves the visual indicator without emitting on `changes$`. */
    render(value: number): void;
}

export const createLinearSlider = (id: string): Slider => {
    const track = requireElementById(id);
    const indicator = requireChild(track, '.slider-indicator');

    return {
        changes$: pointerDrag(track).pipe(
            map(({ clientX }) => {
                const { left, width } = track.getBoundingClientRect();
                return clamp((clientX - left) / width, 0, 1);
            }),
        ),
        render(value) {
            indicator.style.width = `${(value * 100).toFixed(3)}%`;
        },
    };
};
