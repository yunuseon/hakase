/**
 * A 2d canvas that keeps its backing store in sync with the device pixel ratio,
 * so the drawing code can stay in CSS pixels and still render crisply on HiDPI
 * displays.
 */
export interface Surface {
    readonly canvas: HTMLCanvasElement;
    readonly context: CanvasRenderingContext2D;
    /** Resizes only when something actually changed — resizing clears the canvas. */
    resize(width: number, height: number): void;
}

export const createSurface = (container: HTMLElement): Surface => {
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
        throw new Error('Could not acquire a 2d rendering context for the canvas');
    }

    let currentWidth = 0;
    let currentHeight = 0;
    let currentRatio = 0;

    return {
        canvas,
        context,
        resize(width, height) {
            const ratio = window.devicePixelRatio || 1;
            if (width === currentWidth && height === currentHeight && ratio === currentRatio) {
                return;
            }

            currentWidth = width;
            currentHeight = height;
            currentRatio = ratio;

            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
        },
    };
};
