import { DRAW_MODES, type DrawMode, type PanelParams, type SketchParams } from '../params.ts';
import { RAMP_SIZE } from '../theme.ts';
import type { Surface } from './surface.ts';
import { createProgram, type ProgramResult } from './program.ts';
import fragmentSource from './shaders/sketch.frag?raw';
import vertexSource from './shaders/sketch.vert?raw';

// The formula is spliced after the prelude, so driver line numbers need rebasing.
const PRELUDE_LINES = vertexSource.split('\n').length;

const NULL_TERMINATOR = /\0/g;
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
};

export type Sketch = {
    readonly program: WebGLProgram;
    readonly uniforms: Uniforms;
};

export type SketchResult =
    | { readonly ok: true; readonly sketch: Sketch }
    | { readonly ok: false; readonly message: string };

export const createSketch = (gl: WebGL2RenderingContext, formula: string): SketchResult => {
    const result: ProgramResult = createProgram(gl, `${vertexSource}\n${formula}`, fragmentSource);

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
            },
        },
    };
};

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

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, palette);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, RAMP_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, ramp);
    gl.uniform1i(uniforms.palette, 0);

    // The backdrop is the ramp's first entry, so a theme owns the whole canvas.
    gl.clearColor((ramp[0] ?? 0) / 255, (ramp[1] ?? 0) / 255, (ramp[2] ?? 0) / 255, 1);

    // Surfaces only: a dot's soft edge would write depth and punch a fringe through its neighbours.
    if (params.draw.mode === 'surface') {
        gl.enable(gl.DEPTH_TEST);
    } else {
        gl.disable(gl.DEPTH_TEST);
    }
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

export const drawFrame = (
    gl: WebGL2RenderingContext,
    { uniforms }: Sketch,
    { draw: { mode }, dimension }: PanelParams,
    playhead: number,
): void => {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(uniforms.playhead, playhead);
    gl.drawArrays(primitive(gl, mode), 0, vertexCount(mode, dimension));
};
