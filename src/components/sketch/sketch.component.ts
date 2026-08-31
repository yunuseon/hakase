import { combineLatest, merge, type Observable } from 'rxjs';
import { map, pairwise, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { devicePixelRatio$ } from '../../lib/rx.ts';
import type { SketchParams } from './params.ts';
import { buildRamp } from './theme.ts';
import { applyGeometry, createSurface, type Surface } from './gl/surface.ts';
import { drawFrame, prepare, type Sketch } from './gl/sketch-program.ts';
import css from './sketch.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="viewport"><slot name="status"></slot></div>
    <slot name="controls"></slot>
`;

export class HksSketch extends HTMLElement {
    readonly gl: WebGL2RenderingContext;

    private readonly surface: Surface;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.surface = createSurface(requireChild(shadow, '.viewport'));
        this.gl = this.surface.gl;
    }

    connect$(
        params$: Observable<SketchParams>,
        playhead$: Observable<number>,
        sketch$: Observable<Sketch>,
    ): Observable<void> {
        // One chain: geometry as its own stream made a diamond that drew twice.
        const prepared$ = combineLatest([params$, sketch$, devicePixelRatio$]).pipe(
            map(([params, sketch, ratio]) => ({
                params,
                sketch,
                ratio,
                ramp: buildRamp(params.theme),
            })),
            tap(({ params, sketch, ratio, ramp }) => {
                applyGeometry(this.surface, {
                    width: params.width,
                    height: params.height,
                    ratio,
                });
                prepare(this.surface, sketch, params, ramp, ratio);
            }),
        );

        const frames$ = combineLatest([prepared$, playhead$]).pipe(
            tap(([{ sketch, params }, playhead]) => {
                drawFrame(this.surface.gl, sketch, params.dimension, playhead);
            }),
        );

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
