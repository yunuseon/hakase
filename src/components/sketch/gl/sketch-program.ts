import {
    DRAW_MODES,
    KNOBS,
    type DrawMode,
    type Knob,
    type PanelParams,
    type Pointer,
    type SketchParams,
} from '../params.ts';
import { orbitUniform, projection, REFERENCE_DISTANCE, type Orbit } from '../space.ts';
import { RAMP_SIZE } from '../theme.ts';
import type { Surface } from './surface.ts';
import { createProgram, type ProgramResult } from './program.ts';
import fragmentSource from './shaders/sketch.frag?raw';
import vertexSource from './shaders/sketch.vert?raw';

// The formula is spliced after the prelude, so driver line numbers need rebasing.
const PRELUDE_LINES = vertexSource.split('\n').length;

const NULL_TERMINATOR = /\0/g;
const RETURNS_TINT = /\bvec4\s+formula\s*\(/;
const SCRIPTS_CAMERA = /\bCamera\s+camera\s*\(/;

// Appended after the formula, never before it, or every reported line number would shift.
export const adapterFor = (formula: string): string =>
    [
        RETURNS_TINT.test(formula)
            ? 'vec4 point(float x, float y, float t) { return formula(x, y, t); }'
            : 'vec4 point(float x, float y, float t) { vec3 v = formula(x, y, t); return vec4(v, v.z); }',
        SCRIPTS_CAMERA.test(formula)
            ? 'Camera view(float t) { return camera(t); }'
            : 'Camera view(float t) { return Camera(vec3(0.0, 0.0, uReference), vec3(0.0), vec3(0.0, 1.0, 0.0)); }',
    ].join('\n');
const LOG_LOCATION = /^(ERROR|WARNING): \d+:(\d+):/gm;

const readableLog = (log: string, offset: number): string =>
    log
        .replace(NULL_TERMINATOR, '')
        .trimEnd()
        .replace(
            LOG_LOCATION,
            (_match: string, level: string, line: string) =>
                `${level} line ${Number(line) - offset}:`,
        );

export type Uniforms = {
    readonly dimension: WebGLUniformLocation | null;
    readonly mode: WebGLUniformLocation | null;
    readonly playhead: WebGLUniformLocation | null;
    readonly depthScalar: WebGLUniformLocation | null;
    readonly baseSize: WebGLUniformLocation | null;
    readonly pixelRatio: WebGLUniformLocation | null;
    readonly palette: WebGLUniformLocation | null;
    readonly knobs: readonly (WebGLUniformLocation | null)[];
    readonly pointer: WebGLUniformLocation | null;
    readonly pointerDown: WebGLUniformLocation | null;
    readonly projection: WebGLUniformLocation | null;
    readonly orbit: WebGLUniformLocation | null;
    readonly pass: WebGLUniformLocation | null;
    readonly reference: WebGLUniformLocation | null;
};

export type Sketch = {
    readonly program: WebGLProgram;
    readonly uniforms: Uniforms;
};

export type SketchResult =
    | { readonly ok: true; readonly sketch: Sketch }
    | { readonly ok: false; readonly message: string };

export const createSketch = (gl: WebGL2RenderingContext, formula: string): SketchResult => {
    const result: ProgramResult = createProgram(
        gl,
        `${vertexSource}\n${formula}\n${adapterFor(formula)}`,
        fragmentSource,
    );

    if (!result.ok) {
        return {
            ok: false,
            message: readableLog(result.message, result.stage === 'vertex' ? PRELUDE_LINES : 0),
        };
    }

    const { program } = result;
    const at = (name: string) => gl.getUniformLocation(program, name);

    return {
        ok: true,
        sketch: {
            program,
            uniforms: {
                dimension: at('uDimension'),
                mode: at('uMode'),
                playhead: at('uPlayhead'),
                depthScalar: at('uDepthScalar'),
                baseSize: at('uBaseSize'),
                pixelRatio: at('uPixelRatio'),
                palette: at('uPalette'),
                knobs: KNOBS.map(at),
                pointer: at('uPointer'),
                pointerDown: at('pointerDown'),
                projection: at('uProjection'),
                orbit: at('uOrbit'),
                pass: at('uPass'),
                reference: at('uReference'),
            },
        },
    };
};

// The linker drops a uniform nothing reads, so a null location means the formula ignores that knob.
export const knobsUsed = ({ uniforms }: Sketch): readonly Knob[] =>
    KNOBS.filter((_, index) => (uniforms.knobs[index] ?? null) !== null);

export const prepare = (
    { gl, palette }: Surface,
    { program, uniforms }: Sketch,
    params: SketchParams,
    ramp: Uint8Array,
    pixelRatio: number,
): void => {
    gl.useProgram(program);

    gl.uniform1i(uniforms.dimension, params.dimension);
    // The index must match the MODE_* defines in both shader stages.
    gl.uniform1i(uniforms.mode, DRAW_MODES.indexOf(params.draw.mode));

    if (params.draw.mode === 'dots') {
        gl.uniform1f(uniforms.depthScalar, params.draw.depthScalar);
        gl.uniform1f(uniforms.baseSize, params.draw.baseSize);
    }
    gl.uniform1f(uniforms.pixelRatio, pixelRatio);
    gl.uniform1f(uniforms.reference, REFERENCE_DISTANCE);
    gl.uniformMatrix4fv(
        uniforms.projection,
        false,
        projection(params.width / Math.max(params.height, 1)),
    );
    KNOBS.forEach((knob, index) => {
        gl.uniform1f(uniforms.knobs[index] ?? null, params.knobs[knob]);
    });

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, palette);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, RAMP_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, ramp);
    gl.uniform1i(uniforms.palette, 0);

    // The backdrop is the ramp's first entry, so a theme owns the whole canvas.
    gl.clearColor((ramp[0] ?? 0) / 255, (ramp[1] ?? 0) / 255, (ramp[2] ?? 0) / 255, 1);

    gl.enable(gl.DEPTH_TEST);
};

const vertexCount = (mode: DrawMode, dimension: number): number => {
    const side = 2 * dimension;

    switch (mode) {
        case 'dots':
            return side * side;
        case 'lines':
            return side * side * 4;
        case 'surface':
            return (side - 1) * (side - 1) * 6;
    }
};

const primitive = (gl: WebGL2RenderingContext, mode: DrawMode): number => {
    switch (mode) {
        case 'dots':
            return gl.POINTS;
        case 'lines':
            return gl.LINES;
        case 'surface':
            return gl.TRIANGLES;
    }
};

const PASS_LATTICE = 0;
const PASS_AXES = 1;
// Must match axisVertex in sketch.vert: 14 for the axes and the z = 0 square, then 12 ticks of two.
const AXIS_VERTICES = 14 + 12 * 2;

export const drawFrame = (
    gl: WebGL2RenderingContext,
    { uniforms }: Sketch,
    { draw: { mode }, dimension, axes }: PanelParams,
    playhead: number,
    { x, y, down }: Pointer,
    orbit: Orbit,
): void => {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(uniforms.playhead, playhead);
    gl.uniform2f(uniforms.pointer, x, y);
    gl.uniform1f(uniforms.pointerDown, down ? 1 : 0);
    gl.uniform3f(uniforms.orbit, ...orbitUniform(orbit));
    gl.uniform1i(uniforms.pass, PASS_LATTICE);
    gl.drawArrays(primitive(gl, mode), 0, vertexCount(mode, dimension));

    if (axes) {
        gl.uniform1i(uniforms.pass, PASS_AXES);
        gl.drawArrays(gl.LINES, 0, AXIS_VERTICES);
    }
};
