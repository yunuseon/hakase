import { createInkPass, releaseInkPass, type InkPass } from '../../../shared/gl/ink.ts';
import { RAMP_SIZE } from '../theme.ts';

export type Surface<
    C extends HTMLCanvasElement | OffscreenCanvas = HTMLCanvasElement | OffscreenCanvas,
> = {
    readonly canvas: C;
    readonly gl: WebGL2RenderingContext;
    readonly palette: WebGLTexture;
    readonly paint: WebGLTexture;
    readonly ink: InkPass;
    readonly inkTarget: WebGLFramebuffer;
};

// Its own unit: the palette is read from 0 and a formula's state from 1.
export const PAINT_UNIT = 2;

export type SketchResources = Pick<Surface, 'palette' | 'paint' | 'ink' | 'inkTarget'>;

export const createSketchResources = (gl: WebGL2RenderingContext): SketchResources => {
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

    const paint = gl.createTexture();
    if (!paint) {
        throw new Error('This browser refused a paint texture');
    }

    gl.activeTexture(gl.TEXTURE0 + PAINT_UNIT);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, paint);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        gl.R8,
        1,
        1,
        1,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        new Uint8Array(1),
    );
    gl.activeTexture(gl.TEXTURE0);

    return { palette, paint, ink: createInkPass(gl), inkTarget: gl.createFramebuffer() };
};

export const releaseSketchResources = (
    gl: WebGL2RenderingContext,
    { palette, paint, ink, inkTarget }: SketchResources,
): void => {
    gl.deleteTexture(palette);
    gl.deleteTexture(paint);
    gl.deleteFramebuffer(inkTarget);
    releaseInkPass(gl, ink);
};
