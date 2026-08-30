export interface Surface {
    readonly canvas: HTMLCanvasElement;
    readonly context: CanvasRenderingContext2D;
}
export type SurfaceGeometry = {
    width: number;
    height: number;
    ratio: number;
};

export const createSurface = (container: HTMLElement): Surface => {
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
        throw new Error('Could not acquire a 2d rendering context for the canvas');
    }

    return { canvas, context };
};

export const applyGeometry = (
    { canvas, context }: Surface,
    { width, height, ratio }: SurfaceGeometry,
): void => {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
};
