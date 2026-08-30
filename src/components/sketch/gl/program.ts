export type ProgramStage = 'vertex' | 'fragment' | 'link';

export type ProgramResult =
    | { readonly ok: true; readonly program: WebGLProgram }
    | { readonly ok: false; readonly stage: ProgramStage; readonly message: string };

const compileShader = (
    gl: WebGL2RenderingContext,
    type: number,
    stage: ProgramStage,
    source: string,
): { ok: true; shader: WebGLShader } | { ok: false; stage: ProgramStage; message: string } => {
    const shader = gl.createShader(type);
    if (!shader) {
        return { ok: false, stage, message: 'Could not create shader' };
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error';
        gl.deleteShader(shader);
        return { ok: false, stage, message };
    }

    return { ok: true, shader };
};

export const createProgram = (
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
): ProgramResult => {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, 'vertex', vertexSource);
    if (!vertex.ok) {
        return vertex;
    }

    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, 'fragment', fragmentSource);
    if (!fragment.ok) {
        gl.deleteShader(vertex.shader);
        return fragment;
    }

    const program = gl.createProgram();
    if (!program) {
        return { ok: false, stage: 'link', message: 'Could not create program' };
    }

    gl.attachShader(program, vertex.shader);
    gl.attachShader(program, fragment.shader);
    gl.linkProgram(program);
    gl.deleteShader(vertex.shader);
    gl.deleteShader(fragment.shader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program) ?? 'Unknown program link error';
        gl.deleteProgram(program);
        return { ok: false, stage: 'link', message };
    }

    return { ok: true, program };
};
