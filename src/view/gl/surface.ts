export type Surface = {
    readonly canvas: HTMLCanvasElement;
    readonly gl: WebGL2RenderingContext;
};

export type SurfaceGeometry = {
    width: number;
    height: number;
    ratio: number;
};

export const createSurface = (root: ShadowRoot): Surface => {
    const canvas = document.createElement('canvas');
    root.appendChild(canvas);

    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
    if (!gl) {
        throw new Error('This browser does not support WebGL2');
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    return { canvas, gl };
};

export const applyGeometry = (
    { canvas, gl }: Surface,
    { width, height, ratio }: SurfaceGeometry,
): void => {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);
};
