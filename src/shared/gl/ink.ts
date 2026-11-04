import { DAB, type Stroke } from '../stroke.ts';
import { createProgram } from './program.ts';
import fragment from './shaders/dab.frag?raw';
import vertex from './shaders/dab.vert?raw';

export type InkPass = {
    readonly gl: WebGL2RenderingContext;
    readonly program: WebGLProgram;
    readonly vao: WebGLVertexArrayObject;
    readonly buffer: WebGLBuffer;
    readonly uniforms: {
        readonly texel: WebGLUniformLocation | null;
        readonly hardness: WebGLUniformLocation | null;
        readonly flip: WebGLUniformLocation | null;
        readonly colour: WebGLUniformLocation | null;
    };
};

export type InkTarget = {
    readonly side: number;
    readonly colour: readonly [number, number, number];
    readonly flip: 1 | -1;
};

export const createInkPass = (gl: WebGL2RenderingContext): InkPass => {
    const result = createProgram(gl, vertex, fragment);
    if (!result.ok) {
        throw new Error(`The ink pass did not compile: ${result.message}`);
    }

    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, DAB * 4, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    const at = (name: string) => gl.getUniformLocation(result.program, name);

    return {
        gl,
        program: result.program,
        vao,
        buffer,
        uniforms: {
            texel: at('uTexel'),
            hardness: at('uHardness'),
            flip: at('uFlip'),
            colour: at('uColour'),
        },
    };
};

export const loadStroke = ({ gl, buffer }: InkPass, { dabs }: Stroke): void => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, dabs, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
};

// The first `count` dabs of the stroke last loaded, into whatever framebuffer is bound; the caller restores its blend.
export const inked = (
    { gl, program, vao, uniforms }: InkPass,
    { hardness }: Stroke,
    count: number,
    { side, colour, flip }: InkTarget,
): void => {
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform1f(uniforms.texel, 1 / side);
    gl.uniform1f(uniforms.hardness, hardness);
    gl.uniform1f(uniforms.flip, flip);
    gl.uniform3f(uniforms.colour, ...colour);
    gl.enable(gl.BLEND);
    // The brush's rule, ink + (1 - ink) * dab, in premultiplied colour as well as alpha.
    gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
};
