import { readableLog } from '../components/sketch/gl/sketch-program.ts';
import { sceneKnobAt, type TracedImage } from '../image.ts';
import {
    MAX_OBJECTS,
    OBJECT_VEC4S,
    SCENE_KNOBS,
    objectUniforms,
    sceneAdapter,
} from '../model/scene.ts';
import { orbitUniform } from '../model/sketch/space.ts';
import { createProgram } from '../shared/gl/program.ts';
import traceSource from './shaders/trace.frag?raw';
import passSource from './shaders/pass.vert?raw';
import type { Target } from './targets.ts';

// The code is spliced after the prelude, so driver line numbers need rebasing.
const PRELUDE_LINES = traceSource.split('\n').length;

export type Tracer = {
    readonly program: WebGLProgram;
    readonly at: (name: string) => WebGLUniformLocation | null;
};

export type TracerResult =
    | { readonly ok: true; readonly tracer: Tracer }
    | { readonly ok: false; readonly message: string };

export const createTracer = (gl: WebGL2RenderingContext, code: string): TracerResult => {
    const result = createProgram(gl, passSource, `${traceSource}\n${code}\n${sceneAdapter(code)}`);

    if (!result.ok) {
        return {
            ok: false,
            message: readableLog(result.message, result.stage === 'fragment' ? PRELUDE_LINES : 0),
        };
    }

    const { program } = result;

    return { ok: true, tracer: { program, at: name => gl.getUniformLocation(program, name) } };
};

const sunOf = (turn: number, height: number): readonly [number, number, number] => {
    const around = turn * 2 * Math.PI;
    const up = height * (Math.PI / 2);

    return [Math.cos(up) * Math.sin(around), Math.sin(up), Math.cos(up) * Math.cos(around)];
};

export const traceBatch = (
    gl: WebGL2RenderingContext,
    tracer: Tracer,
    image: TracedImage,
    into: Target,
    previous: Target,
    palette: { readonly unit: number },
    { t, done, batch }: { readonly t: number; readonly done: number; readonly batch: number },
    vao: WebGLVertexArrayObject,
): void => {
    const { scene } = image;
    const { at } = tracer;
    const objects = objectUniforms(scene.objects);

    gl.useProgram(tracer.program);
    gl.uniform4fv(
        at('uObjects'),
        objects.length === 0 ? new Float32Array(OBJECT_VEC4S * 4) : objects,
    );
    gl.uniform1i(at('uCount'), Math.min(MAX_OBJECTS, scene.objects.length));
    gl.uniform1f(at('uPlayhead'), t);
    gl.uniform2f(at('uResolution'), into.width, into.height);
    gl.uniform3f(at('uOrbit'), ...orbitUniform(scene.orbit));
    gl.uniform1f(at('uDone'), done);
    gl.uniform1i(at('uBatch'), batch);
    gl.uniform1i(at('uBounces'), scene.bounces);
    gl.uniform3f(at('uSun'), ...sunOf(scene.sun, scene.height));
    gl.uniform1f(at('uSunPower'), scene.light);
    gl.uniform1f(at('uSky'), scene.sky);
    SCENE_KNOBS.forEach(knob => {
        gl.uniform1f(at(knob), sceneKnobAt(image, knob, t));
    });
    gl.uniform1i(at('uPalette'), palette.unit);
    gl.uniform1i(at('uPrevious'), palette.unit + 1);
    gl.activeTexture(gl.TEXTURE0 + palette.unit + 1);
    gl.bindTexture(gl.TEXTURE_2D, previous.texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, into.framebuffer);
    gl.viewport(0, 0, into.width, into.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
};
