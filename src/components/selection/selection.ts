import type { Rect } from '../../shared/camera.ts';
export type SelectionView = {
    readonly boxes: readonly Rect[];
    readonly copied: boolean;
};
export const SELECTION_COMMANDS = ['copy', 'paste', 'save', 'clear'] as const;
export type SelectionCommand = (typeof SELECTION_COMMANDS)[number];
