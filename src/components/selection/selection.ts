export type SelectionView = {
    readonly count: number;
    readonly copied: boolean;
};
export const SELECTION_COMMANDS = ['copy', 'paste', 'save', 'clear'] as const;
export type SelectionCommand = (typeof SELECTION_COMMANDS)[number];
