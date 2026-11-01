import type { Camera, Point } from '../../shared/camera.ts';

export type Grid = {
    readonly size: number;
    readonly x: number;
    readonly y: number;
};

const SPACING = 24;
const MIN_PITCH = 12;

// Coarsened in powers of two, or zooming out packs the dots into a flat tint.
export const gridOf = ({ x, y, zoom }: Camera): Grid => {
    const coarse = 2 ** Math.max(0, Math.ceil(Math.log2(MIN_PITCH / (SPACING * zoom))));
    const size = SPACING * zoom * coarse;

    return { size, x: ((x % size) + size) % size, y: ((y % size) + size) % size };
};

export type CanvasGesture =
    | { readonly kind: 'pan'; readonly dx: number; readonly dy: number }
    | { readonly kind: 'zoom'; readonly factor: number; readonly at: Point };

export type WheelInput = {
    readonly deltaX: number;
    readonly deltaY: number;
    readonly lines: boolean;
    readonly pinch: boolean;
    readonly onGround: boolean;
    readonly at: Point;
};

const LINE = 16;
const ZOOM_RATE = 0.004;
const MAX_TICK = 50;

// null: a plain wheel over a window belongs to that window, so textareas still scroll.
export const wheelGesture = (input: WheelInput): CanvasGesture | null => {
    const scale = input.lines ? LINE : 1;
    const dx = input.deltaX * scale;
    const dy = input.deltaY * scale;

    if (input.pinch) {
        const tick = Math.max(-MAX_TICK, Math.min(MAX_TICK, dy));

        return { kind: 'zoom', factor: Math.exp(-tick * ZOOM_RATE), at: input.at };
    }

    return input.onGround ? { kind: 'pan', dx: -dx, dy: -dy } : null;
};

export type KeyZoom = 'in' | 'out' | 'reset';

export const keyZoom = (key: string, modified: boolean): KeyZoom | null => {
    if (!modified) {
        return null;
    }

    if (key === '=' || key === '+') {
        return 'in';
    }

    if (key === '-') {
        return 'out';
    }

    return key === '0' ? 'reset' : null;
};

export const sameVariables = (
    a: ReadonlyMap<string, string>,
    b: ReadonlyMap<string, string>,
): boolean => a.size === b.size && [...a].every(([name, value]) => b.get(name) === value);

export type KeyEdit = 'undo' | 'redo';

// Never inside something editable: the formula editor and every input keep their own undo.
export const keyEdit = (
    key: string,
    modified: boolean,
    shift: boolean,
    editing: boolean,
): KeyEdit | null => {
    if (!modified || editing) {
        return null;
    }

    const lower = key.toLowerCase();

    if (lower === 'z') {
        return shift ? 'redo' : 'undo';
    }

    return lower === 'y' ? 'redo' : null;
};

export const isEditable = (target: EventTarget | null): boolean =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);
