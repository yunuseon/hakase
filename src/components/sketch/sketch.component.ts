import { combineLatest, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, pairwise, scan, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$, observeResize$ } from '../../lib/rx.ts';
import { pointerDelta$, pointerDrag$ } from '../../shared/drag.ts';
import type { Orbit, OrbitAction } from './space.ts';
import { cappedRatio, pointerAt, samePointer, type Pointer, type SketchParams } from './params.ts';
import { buildRamp } from './theme.ts';
import { applyGeometry, createSurface, type Surface } from './gl/surface.ts';
import { drawFrame, prepare, type Sketch } from './gl/sketch-program.ts';
import { bindState, evolve, simulated$, type Simulation } from './gl/simulation.ts';
import { evolutionTo, stepAt, type Clock, type Evolution } from './evolution.ts';
import type { Size } from '../window/frame.ts';
import css from './sketch.css?inline';

const sheet = styleSheet(css);

type Frame = {
    readonly stage: {
        readonly sketch: Sketch;
        readonly params: SketchParams;
        readonly simulation: Simulation | null;
    };
    readonly clock: Clock;
    readonly pointer: Pointer;
    readonly orbit: Orbit;
    readonly evolution: Evolution;
};

const TEMPLATE = `
    <div class="viewport"><slot name="status"></slot></div>
    <slot name="controls"></slot>
`;

export class HksSketch extends HTMLElement {
    readonly gl: WebGL2RenderingContext;
    readonly pointers$: Observable<Omit<Pointer, 'down'>>;
    readonly presses$: Observable<boolean>;
    readonly orbits$: Observable<OrbitAction>;
    readonly sizes$: Observable<Size>;

    private readonly surface: Surface<HTMLCanvasElement>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const viewport = requireChild(shadow, '.viewport');
        this.surface = createSurface(viewport);
        this.gl = this.surface.gl;

        const { canvas } = this.surface;
        // getBoundingClientRect, not offset*: the pointer is in screen pixels, zoom included.
        this.pointers$ = fromElementEvent$(canvas, 'pointermove').pipe(
            map(event => pointerAt(event.clientX, event.clientY, canvas.getBoundingClientRect())),
        );

        // Shift turns a drag into a press the formula can read, so it must not also orbit.
        const pressing = (start: PointerEvent): boolean => start.shiftKey;

        this.presses$ = merge(
            pointerDrag$(canvas, pressing).pipe(map(() => true)),
            fromDocumentEvent$('pointerup').pipe(map(() => false)),
            fromDocumentEvent$('pointercancel').pipe(map(() => false)),
        );

        // client*, not the client rect: the rect includes the canvas zoom, and a size here is in world units.
        this.sizes$ = merge(of(undefined), observeResize$(viewport)).pipe(
            map((): Size => ({ width: viewport.clientWidth, height: viewport.clientHeight })),
            filter(({ width, height }) => width > 0 && height > 0),
        );

        this.orbits$ = merge(
            pointerDelta$(canvas, start => !pressing(start)).pipe(
                map(({ dx, dy }): OrbitAction => ({ kind: 'turn', dx, dy })),
            ),
            fromElementEvent$(canvas, 'wheel').pipe(
                // A pinch arrives as ctrl+wheel and belongs to the canvas zoom, not the camera.
                filter(event => !event.ctrlKey && !event.metaKey),
                map((event): OrbitAction => ({ kind: 'dolly', delta: event.deltaY })),
            ),
            fromElementEvent$(canvas, 'dblclick').pipe(map((): OrbitAction => ({ kind: 'reset' }))),
        );
    }

    connect$(
        params$: Observable<SketchParams>,
        clock$: Observable<Clock>,
        sketch$: Observable<Sketch>,
        ratio$: Observable<number>,
        pointer$: Observable<Pointer>,
        orbit$: Observable<Orbit>,
    ): Observable<void> {
        // One chain: geometry as its own stream made a diamond that drew twice.
        const prepared$ = combineLatest([params$, sketch$, ratio$]).pipe(
            map(([params, sketch, ratio]) => ({
                params,
                sketch,
                ratio: cappedRatio(ratio, params),
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

        const frames$ = combineLatest([
            simulated$(this.surface.gl, prepared$),
            clock$,
            pointer$.pipe(distinctUntilChanged(samePointer)),
            orbit$,
        ]).pipe(
            scan(
                (done: Frame | null, [stage, clock, pointer, orbit]): Frame => ({
                    stage,
                    clock,
                    pointer,
                    orbit,
                    evolution: evolutionTo(
                        done !== null && done.stage.simulation === stage.simulation
                            ? done.evolution.end
                            : null,
                        stage.simulation === null
                            ? 0
                            : stepAt(clock.t, clock.seconds, stage.sketch.steps),
                    ),
                }),
                null,
            ),
            filter((frame): frame is Frame => frame !== null),
            tap(({ stage: { sketch, params, simulation }, clock, pointer, orbit, evolution }) => {
                const { gl } = this.surface;

                if (simulation !== null) {
                    evolve(gl, sketch, simulation, evolution, {
                        params,
                        seconds: clock.seconds,
                        pointer,
                        orbit,
                    });
                    bindState(gl, sketch, simulation, evolution.end.front);
                }

                drawFrame(gl, sketch, params, clock.t, pointer, orbit);
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
