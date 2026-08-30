import { parseHexColor, type Rgb } from '../../lib/color.ts';
import type { SketchParams } from '../../model/params.ts';
import { createProgram, type ProgramResult } from './program.ts';
import fragmentSource from './shaders/sketch.frag?raw';
import vertexSource from './shaders/sketch.vert?raw';

export type Uniforms = {
    readonly dimension: WebGLUniformLocation | null;
    readonly playhead: WebGLUniformLocation | null;
    readonly depthScalar: WebGLUniformLocation | null;
    readonly baseSize: WebGLUniformLocation | null;
    readonly pixelRatio: WebGLUniformLocation | null;
    readonly color1: WebGLUniformLocation | null;
    readonly color2: WebGLUniformLocation | null;
    readonly color3: WebGLUniformLocation | null;
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
        return result;
    }

    const { program } = result;
    const at = (name: string) => gl.getUniformLocation(program, name);

    return {
        ok: true,
        sketch: {
            program,
            uniforms: {
                dimension: at('uDimension'),
                playhead: at('uPlayhead'),
                depthScalar: at('uDepthScalar'),
                baseSize: at('uBaseSize'),
                pixelRatio: at('uPixelRatio'),
                color1: at('uColor1'),
                color2: at('uColor2'),
                color3: at('uColor3'),
            },
        },
    };
};

export type Palette = {
    readonly low: Rgb;
    readonly mid: Rgb;
    readonly high: Rgb;
};

export const toPalette = ({ color1, color2, color3 }: SketchParams): Palette => ({
    low: parseHexColor(color1),
    mid: parseHexColor(color2),
    high: parseHexColor(color3),
});

const setColor = (
    gl: WebGL2RenderingContext,
    location: WebGLUniformLocation | null,
    { r, g, b }: Rgb,
): void => {
    gl.uniform3f(location, r, g, b);
};

/** Everything that only changes when the params, shader or geometry change. */
export const prepare = (
    gl: WebGL2RenderingContext,
    { program, uniforms }: Sketch,
    params: SketchParams,
    palette: Palette,
    pixelRatio: number,
): void => {
    gl.useProgram(program);

    gl.uniform1i(uniforms.dimension, params.dimension);
    gl.uniform1f(uniforms.depthScalar, params.depthScalar);
    gl.uniform1f(uniforms.baseSize, params.baseSize);
    gl.uniform1f(uniforms.pixelRatio, pixelRatio);

    setColor(gl, uniforms.color1, palette.low);
    setColor(gl, uniforms.color2, palette.mid);
    setColor(gl, uniforms.color3, palette.high);

    gl.clearColor(palette.low.r, palette.low.g, palette.low.b, 1);
};

/** The per-frame path: one uniform, one clear, one draw. */
export const drawFrame = (
    gl: WebGL2RenderingContext,
    { uniforms }: Sketch,
    dimension: number,
    playhead: number,
): void => {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniforms.playhead, playhead);

    const side = 2 * dimension;
    gl.drawArrays(gl.POINTS, 0, side * side);
};
