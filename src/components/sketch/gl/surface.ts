import { RAMP_SIZE } from '../theme.ts';

export type Surface = {
    readonly canvas: HTMLCanvasElement;
    readonly gl: WebGL2RenderingContext;
    readonly palette: WebGLTexture;
};

export type SurfaceGeometry = {
    width: number;
    height: number;
    ratio: number;
};

export const createSurface = (parent: HTMLElement): Surface => {
    const canvas = document.createElement('canvas');
    parent.appendChild(canvas);

    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
    if (!gl) {
        throw new Error('This browser does not support WebGL2');
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const palette = gl.createTexture();
    if (!palette) {
        throw new Error('This browser refused a palette texture');
    }

    gl.bindTexture(gl.TEXTURE_2D, palette);
    // NEAREST: a stepped theme must not be smeared across texels by the sampler.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RAMP_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    return { canvas, gl, palette };
};

// Reallocating the drawing buffer costs ~7ms, so never resize to an equal size.
export const applyGeometry = (
    { canvas, gl }: Surface,
    { width, height, ratio }: SurfaceGeometry,
): void => {
    const buffer = { width: Math.round(width * ratio), height: Math.round(height * ratio) };
    if (canvas.width === buffer.width && canvas.height === buffer.height) {
        return;
    }

    canvas.width = buffer.width;
    canvas.height = buffer.height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);
};
