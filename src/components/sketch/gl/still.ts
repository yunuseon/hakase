import { Observable } from 'rxjs';
import type { Size } from '../../window/frame.ts';
import type { SketchParams } from '../params.ts';
import { buildRamp } from '../theme.ts';
import { prepare, type Sketch } from './sketch-program.ts';
import { createOffscreenSurface, releaseSurface, resizeSurface, type Surface } from './surface.ts';

export const offscreen$ = (size: Size): Observable<Surface<OffscreenCanvas>> =>
    new Observable(subscriber => {
        const surface = createOffscreenSurface(size);
        subscriber.next(surface);

        return () => {
            releaseSurface(surface);
        };
    });

// scale is pixels per sketch CSS pixel, not the device ratio, or a smaller copy's dots would swamp it.
export const prepareStill = (
    surface: Surface<OffscreenCanvas>,
    sketch: Sketch,
    params: SketchParams,
    pixels: Size,
    scale: number,
    dotScale = 1,
): void => {
    resizeSurface(surface, pixels);
    prepare(surface, sketch, params, buildRamp(params.theme), scale, dotScale);
};
