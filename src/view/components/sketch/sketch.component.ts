import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, pairwise, tap } from 'rxjs/operators';
import { styleSheet } from '../../../lib/dom.ts';
import { devicePixelRatio$ } from '../../../lib/rx.ts';
import type { SketchParams } from '../../../model/params.ts';
import {
    applyGeometry,
    createSurface,
    type Surface,
    type SurfaceGeometry,
} from '../../gl/surface.ts';
import { drawFrame, prepare, toPalette, type Sketch } from '../../gl/sketch-program.ts';
import css from './sketch.css?inline';

const sheet = styleSheet(css);

const sameGeometry = (a: SurfaceGeometry, b: SurfaceGeometry): boolean =>
    a.width === b.width && a.height === b.height && a.ratio === b.ratio;

export class HksSketch extends HTMLElement {
    /** The formula stage compiles into this context; the element owns the canvas. */
    readonly gl: WebGL2RenderingContext;

    private readonly surface: Surface;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];

        this.surface = createSurface(shadow);
        this.gl = this.surface.gl;
    }

    connect$(
        params$: Observable<SketchParams>,
        playhead$: Observable<number>,
        sketch$: Observable<Sketch>,
    ): Observable<void> {
        const geometry$ = combineLatest([params$, devicePixelRatio$]).pipe(
            map(([{ width, height }, ratio]) => ({ width, height, ratio })),
            distinctUntilChanged(sameGeometry),
            tap(geometry => {
                applyGeometry(this.surface, geometry);
            }),
        );

        // Everything the playhead does not affect, derived and uploaded once per
        // change rather than once per frame. It is a dependency of the frame
        // below, not a step inside it: resizing clears the buffer and a new
        // shader loses its uniforms, so both have to force a redraw.
        const prepared$ = combineLatest([params$, sketch$, geometry$]).pipe(
            map(([params, sketch, geometry]) => ({
                params,
                sketch,
                palette: toPalette(params),
                ratio: geometry.ratio,
            })),
            tap(({ sketch, params, palette, ratio }) => {
                prepare(this.surface.gl, sketch, params, palette, ratio);
            }),
        );

        const frames$ = combineLatest([prepared$, playhead$]).pipe(
            tap(([{ sketch, params }, playhead]) => {
                drawFrame(this.surface.gl, sketch, params.dimension, playhead);
            }),
        );

        // Each shader is released once a newer one has replaced it, or editing
        // leaks a compiled program per recompile.
        const retired$ = sketch$.pipe(
            pairwise(),
            tap(([replaced]) => {
                this.surface.gl.deleteProgram(replaced.program);
            }),
        );

        return merge(frames$, retired$).pipe(map(() => undefined));
    }
}

customElements.define('hks-sketch', HksSketch);
