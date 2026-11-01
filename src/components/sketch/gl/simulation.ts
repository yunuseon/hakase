import { Observable, of } from 'rxjs';
import { distinctUntilChanged, map, share, startWith, switchMap, takeWhile } from 'rxjs/operators';
import { momentOf, type Evolution, type Front } from '../evolution.ts';
import type { PanelParams, Pointer } from '../params.ts';
import type { Orbit } from '../space.ts';
import { PASS_SEED, PASS_STEP, setMoment, type Sketch } from './sketch-program.ts';

export type Simulation = {
    readonly side: number;
    readonly textures: readonly [WebGLTexture, WebGLTexture];
    readonly framebuffers: readonly [WebGLFramebuffer, WebGLFramebuffer];
};

const STATE_UNIT = 1;

const stateTexture = (gl: WebGL2RenderingContext, side: number): WebGLTexture => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // NEAREST: a state is read whole with texelFetch, and float textures need not be filterable.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, side, side, 0, gl.RGBA, gl.FLOAT, null);

    return texture;
};

const targetOf = (gl: WebGL2RenderingContext, texture: WebGLTexture): WebGLFramebuffer => {
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (!complete) {
        throw new Error('This browser cannot keep a formula’s state: no float render targets.');
    }

    return framebuffer;
};

export const simulation$ = (gl: WebGL2RenderingContext, side: number): Observable<Simulation> =>
    new Observable(subscriber => {
        if (gl.getExtension('EXT_color_buffer_float') === null) {
            subscriber.error(
                new Error('This browser cannot keep a formula’s state: no float render targets.'),
            );

            return undefined;
        }

        // Made on the state's own unit: binding them on the active one would put them where the palette is read.
        gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
        const textures = [stateTexture(gl, side), stateTexture(gl, side)] as const;
        const framebuffers = [targetOf(gl, textures[0]), targetOf(gl, textures[1])] as const;
        gl.activeTexture(gl.TEXTURE0);
        subscriber.next({ side, textures, framebuffers });

        return () => {
            framebuffers.forEach(framebuffer => {
                gl.deleteFramebuffer(framebuffer);
            });
            textures.forEach(texture => {
                gl.deleteTexture(texture);
            });
        };
    });

export const bindState = (
    gl: WebGL2RenderingContext,
    { uniforms }: Sketch,
    { textures }: Simulation,
    front: Front,
): void => {
    gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, textures[front]);
    gl.uniform1i(uniforms.state, STATE_UNIT);
    // Back to the palette's unit, which prepare and every later bind assume is active.
    gl.activeTexture(gl.TEXTURE0);
};

export type Moment = {
    readonly params: PanelParams;
    readonly seconds: number;
    readonly pointer: Pointer;
    readonly orbit: Orbit;
};

const pass = (
    gl: WebGL2RenderingContext,
    sketch: Sketch,
    simulation: Simulation,
    from: Front,
    kind: typeof PASS_STEP | typeof PASS_SEED,
    t: number,
    { params, pointer, orbit }: Moment,
): Front => {
    const into: Front = from === 0 ? 1 : 0;
    bindState(gl, sketch, simulation, from);
    setMoment(gl, sketch, params, t, pointer, orbit);
    gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.framebuffers[into]);
    gl.uniform1i(sketch.uniforms.pass, kind);
    gl.drawArrays(gl.POINTS, 0, simulation.side * simulation.side);

    return into;
};

export const evolve = (
    gl: WebGL2RenderingContext,
    sketch: Sketch,
    simulation: Simulation,
    evolution: Evolution,
    moment: Moment,
): void => {
    if (!evolution.reset && evolution.to === evolution.from) {
        return;
    }

    const viewport: unknown = gl.getParameter(gl.VIEWPORT);
    const scissor = gl.isEnabled(gl.SCISSOR_TEST);
    gl.viewport(0, 0, simulation.side, simulation.side);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);

    const seeded = evolution.reset
        ? pass(gl, sketch, simulation, evolution.start, PASS_SEED, 0, moment)
        : evolution.start;
    const steps = Array.from(
        { length: evolution.to - evolution.from },
        (_, index) => evolution.from + 1 + index,
    );
    steps.reduce<Front>(
        (front, step) =>
            pass(
                gl,
                sketch,
                simulation,
                front,
                PASS_STEP,
                momentOf(step, moment.seconds, sketch.steps),
                moment,
            ),
        seeded,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (viewport instanceof Int32Array) {
        gl.viewport(viewport[0] ?? 0, viewport[1] ?? 0, viewport[2] ?? 0, viewport[3] ?? 0);
    }
    gl.enable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    if (scissor) {
        gl.enable(gl.SCISSOR_TEST);
    }
};

type Stage = { readonly sketch: Sketch; readonly params: PanelParams };

type SimulationKey = { readonly sketch: Sketch; readonly side: number } | null;

const keyOf = ({ sketch, params }: Stage): SimulationKey =>
    sketch.evolves ? { sketch, side: 2 * params.dimension } : null;

const sameKey = (a: SimulationKey, b: SimulationKey): boolean =>
    a === null || b === null ? a === b : a.sketch === b.sketch && a.side === b.side;

export const simulated$ = <T extends Stage>(
    gl: WebGL2RenderingContext,
    stage$: Observable<T>,
): Observable<T & { readonly simulation: Simulation | null }> => {
    const shared$ = stage$.pipe(share());

    return shared$.pipe(
        distinctUntilChanged((a, b) => sameKey(keyOf(a), keyOf(b))),
        switchMap(first => {
            const key = keyOf(first);
            const state$: Observable<Simulation | null> =
                key === null ? of(null) : simulation$(gl, key.side);

            return state$.pipe(
                switchMap(simulation =>
                    shared$.pipe(
                        startWith(first),
                        // Never with another key's state: those textures may already be released.
                        takeWhile(stage => sameKey(keyOf(stage), key)),
                        map(stage => ({ ...stage, simulation })),
                    ),
                ),
            );
        }),
    );
};
