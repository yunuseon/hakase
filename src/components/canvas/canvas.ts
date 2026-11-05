import type { Camera } from '../../shared/camera.ts';

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
    (target instanceof HTMLElement && target.localName === 'hks-select') ||
    (target instanceof HTMLElement && target.isContentEditable);

export type KeyStep = 'next' | 'previous';

// Bare arrows and page keys only, and never inside something editable, where they move a caret or a thumb.
export const keyStep = (key: string, modified: boolean, editing: boolean): KeyStep | null => {
    if (modified || editing) {
        return null;
    }

    if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'PageDown') {
        return 'next';
    }

    return key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageUp' ? 'previous' : null;
};

export const keyStateHold = (code: string, modified: boolean, repeat: boolean, editing: boolean) =>
    code === 'KeyW' && !modified && !repeat && !editing;
