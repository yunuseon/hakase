import { map } from 'rxjs/operators';
import { requireElementById } from '../lib/dom.ts';
import { TAU, wrap01 } from '../lib/math.ts';
import { pointerDrag } from './drag.ts';
import type { Slider } from './linear-slider.ts';

/** A value of 0 sits at the top of the circle, a quarter turn before 0 radians. */
const ZERO_AT = 0.25;

export const createCircularSlider = (trackId: string, indicatorId: string): Slider => {
    const track = requireElementById(trackId);
    const indicator = requireElementById(indicatorId);

    // Cached so the render path never forces a layout. A ResizeObserver keeps
    // them honest, which also covers the first layout pass: the sizes read
    // during construction are not necessarily final.
    let trackRadiusX = 0;
    let trackRadiusY = 0;
    let indicatorRadiusX = 0;
    let indicatorRadiusY = 0;
    let lastValue = 0;

    const place = (value: number) => {
        lastValue = value;

        const angle = (value - ZERO_AT) * TAU;
        const x = trackRadiusX - indicatorRadiusX + Math.cos(angle) * trackRadiusX;
        const y = trackRadiusY - indicatorRadiusY + Math.sin(angle) * trackRadiusY;

        indicator.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    };

    const measure = () => {
        trackRadiusX = track.offsetWidth / 2;
        trackRadiusY = track.offsetHeight / 2;
        indicatorRadiusX = indicator.offsetWidth / 2;
        indicatorRadiusY = indicator.offsetHeight / 2;

        place(lastValue);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(track);
    observer.observe(indicator);

    return {
        changes$: pointerDrag(track).pipe(
            map(({ clientX, clientY }) => {
                const { left, top, width, height } = track.getBoundingClientRect();

                const deltaX = clientX - (left + width / 2);
                const deltaY = clientY - (top + height / 2);

                return wrap01(Math.atan2(deltaY, deltaX) / TAU + ZERO_AT);
            }),
        ),
        render: place,
    };
};
