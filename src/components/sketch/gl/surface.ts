import { createInkPass, releaseInkPass, type InkPass } from '../../../shared/gl/ink.ts';
import type { Size } from '../../window/frame.ts';
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

export type SurfaceGeometry = {
    width: number;
    height: number;
    ratio: number;
};

// preserveDrawingBuffer: trails fade the last frame instead of clearing it, so it must survive.
const CONTEXT = { alpha: false, antialias: true, preserveDrawingBuffer: true } as const;

const surfaceOn = <C extends HTMLCanvasElement | OffscreenCanvas>(canvas: C): Surface<C> => {
    const gl =
        canvas instanceof HTMLCanvasElement
            ? canvas.getContext('webgl2', CONTEXT)
            : canvas.getContext('webgl2', CONTEXT);
    if (!(gl instanceof WebGL2RenderingContext)) {
        throw new Error('This browser does not support WebGL2');
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    return { canvas, gl, ...createSketchResources(gl) };
};

export type SketchResources = Pick<Surface, 'palette' | 'paint' | 'ink' | 'inkTarget'>;

// Apart from the context, so the engine can give every sketch it draws its own palette and paint in one context.
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

export const createSurface = (parent: HTMLElement): Surface<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    parent.appendChild(canvas);

    return surfaceOn(canvas);
};

// For renders nobody watches: thumbnails and exports, in a context of their own so the live canvas is untouched.
export const createOffscreenSurface = ({ width, height }: Size): Surface<OffscreenCanvas> =>
    surfaceOn(new OffscreenCanvas(Math.max(1, width), Math.max(1, height)));

export const resizeSurface = (
    { canvas, gl }: Surface<OffscreenCanvas>,
    { width, height }: Size,
): void => {
    if (canvas.width === width && canvas.height === height) {
        return;
    }

    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
};

const GROWTH = 512;

const grownSide = (current: number, needed: number, limit: number): number =>
    needed <= current
        ? current
        : Math.min(limit, Math.ceil(Math.max(needed, current * 1.5) / GROWTH) * GROWTH);

// Grows by half at least and never shrinks: a strip changes size every pinch tick, and each reallocation took up to 100ms.
export const growSurface = (
    { canvas }: Surface<OffscreenCanvas>,
    { width, height }: Size,
    limit: number,
): void => {
    const grown = {
        width: grownSide(canvas.width, width, limit),
        height: grownSide(canvas.height, height, limit),
    };

    if (grown.width !== canvas.width || grown.height !== canvas.height) {
        canvas.width = grown.width;
        canvas.height = grown.height;
    }
};

// Releases the GPU at once rather than whenever the collector gets to it; a page has a handful of contexts.
export const releaseSurface = ({ gl }: Surface): void => {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
};

// Reallocating the drawing buffer costs ~7ms, so never resize to an equal size.
export const applyGeometry = (
    { canvas, gl }: Surface<HTMLCanvasElement>,
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
