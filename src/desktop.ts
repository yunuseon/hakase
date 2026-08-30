import {
    clampFrame,
    frameFrom,
    moved,
    resized,
    type Frame,
    type WindowGesture,
} from './components/window/frame.ts';
import type { Viewport } from './lib/dom.ts';
import { isProgramId, type ProcessId, type ProgramId } from './program.ts';

export type Point = {
    readonly x: number;
    readonly y: number;
};

export type Process = {
    readonly id: ProcessId;
    readonly program: ProgramId;
    readonly frame: Frame;
};

export type Desktop = {
    /** Back to front: a process's index in here is its z-order. */
    readonly processes: readonly Process[];
    /** Monotone, so a relaunch never reuses a dead process's id. */
    readonly launched: number;
    readonly shortcuts: Readonly<Record<ProgramId, Point>>;
};

export type DesktopAction =
    | { readonly kind: 'launch'; readonly program: ProgramId; readonly frame: Frame }
    | {
          readonly kind: 'shortcut';
          readonly program: ProgramId;
          readonly dx: number;
          readonly dy: number;
      }
    | (WindowGesture & { readonly id: ProcessId });

const CASCADE = 26;

export const defaultDesktop = ({ width, height }: Viewport): Desktop => {
    const gutter = 6;
    const editorWidth = Math.min(360, Math.round(width * 0.26));
    const timelineHeight = 108;
    const dialSize = 200;
    const editorHeight = height - timelineHeight - 3 * gutter;
    const column = Math.max(gutter, width - 92);

    return {
        processes: [
            {
                id: 'formula-1',
                program: 'formula',
                frame: { x: gutter, y: gutter, width: editorWidth, height: editorHeight, z: 0 },
            },
            {
                id: 'sketch-2',
                program: 'sketch',
                frame: { x: editorWidth + 2 * gutter, y: gutter, width: 640, height: 640, z: 0 },
            },
            {
                id: 'timeline-3',
                program: 'timeline',
                frame: {
                    x: gutter,
                    y: editorHeight + 2 * gutter,
                    width: editorWidth,
                    height: timelineHeight,
                    z: 0,
                },
            },
            {
                id: 'playhead-4',
                program: 'playhead',
                frame: {
                    x: Math.max(gutter, width - dialSize - gutter),
                    y: gutter,
                    width: dialSize,
                    height: dialSize + 44,
                    z: 0,
                },
            },
        ],
        launched: 4,
        shortcuts: {
            formula: { x: column, y: 270 },
            sketch: { x: column, y: 350 },
            timeline: { x: column, y: 430 },
            playhead: { x: column, y: 510 },
        },
    };
};

const withFrame = (desktop: Desktop, id: ProcessId, next: (frame: Frame) => Frame): Desktop => ({
    ...desktop,
    processes: desktop.processes.map(process =>
        process.id === id ? { ...process, frame: next(process.frame) } : process,
    ),
});

export const reduceDesktop = (desktop: Desktop, action: DesktopAction): Desktop => {
    if (action.kind === 'launch') {
        const launched = desktop.launched + 1;
        const step = (launched % 8) * CASCADE;

        return {
            ...desktop,
            launched,
            processes: [
                ...desktop.processes,
                {
                    id: `${action.program}-${launched}`,
                    program: action.program,
                    frame: { ...action.frame, x: action.frame.x + step, y: action.frame.y + step },
                },
            ],
        };
    }

    if (action.kind === 'shortcut') {
        const spot = desktop.shortcuts[action.program];

        return {
            ...desktop,
            shortcuts: {
                ...desktop.shortcuts,
                [action.program]: { x: spot.x + action.dx, y: spot.y + action.dy },
            },
        };
    }

    if (action.kind === 'quit') {
        return { ...desktop, processes: desktop.processes.filter(({ id }) => id !== action.id) };
    }

    if (action.kind === 'raise') {
        const raised = desktop.processes.find(({ id }) => id === action.id);

        return raised === undefined
            ? desktop
            : {
                  ...desktop,
                  processes: [...desktop.processes.filter(({ id }) => id !== action.id), raised],
              };
    }

    return action.kind === 'move'
        ? withFrame(desktop, action.id, frame => moved(frame, action.dx, action.dy))
        : withFrame(desktop, action.id, frame => resized(frame, action.edge, action.dx, action.dy));
};

export const clampToViewport = (desktop: Desktop, viewport: Viewport): Desktop => ({
    ...desktop,
    processes: desktop.processes.map(process => ({
        ...process,
        frame: clampFrame(process.frame, viewport),
    })),
});

const finite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const pointFrom = (value: unknown): Point | null => {
    if (typeof value !== 'object' || value === null || !('x' in value && 'y' in value)) {
        return null;
    }

    const x = finite(value.x);
    const y = finite(value.y);

    return x === null || y === null ? null : { x, y };
};

const processFrom = (value: unknown): Process | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    if (!('id' in value && 'program' in value && 'frame' in value)) {
        return null;
    }

    const frame = frameFrom(value.frame);

    if (typeof value.id !== 'string' || typeof value.program !== 'string' || frame === null) {
        return null;
    }

    return isProgramId(value.program) ? { id: value.id, program: value.program, frame } : null;
};

export const parseDesktop = (value: unknown): Desktop | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    if (!('processes' in value && 'launched' in value && 'shortcuts' in value)) {
        return null;
    }

    const launched = finite(value.launched);
    const stored = value.processes;

    if (launched === null || !Array.isArray(stored)) {
        return null;
    }

    const processes = stored.map(processFrom);

    if (processes.some(process => process === null)) {
        return null;
    }

    const shortcuts = value.shortcuts;

    if (typeof shortcuts !== 'object' || shortcuts === null) {
        return null;
    }

    if (!(
        'formula' in shortcuts &&
        'sketch' in shortcuts &&
        'timeline' in shortcuts &&
        'playhead' in shortcuts
    )) {
        return null;
    }

    const formula = pointFrom(shortcuts.formula);
    const sketch = pointFrom(shortcuts.sketch);
    const timeline = pointFrom(shortcuts.timeline);
    const playhead = pointFrom(shortcuts.playhead);

    if (formula === null || sketch === null || timeline === null || playhead === null) {
        return null;
    }

    return {
        processes: processes.filter(process => process !== null),
        launched,
        shortcuts: { formula, sketch, timeline, playhead },
    };
};
