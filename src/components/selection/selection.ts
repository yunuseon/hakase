export type SelectionView = {
    readonly count: number;
    readonly copied: boolean;
    readonly boxable: boolean;
};
export const SELECTION_COMMANDS = [
    'copy',
    'paste',
    'save',
    'component',
    'delete',
    'clear',
] as const;
export type SelectionCommand = (typeof SELECTION_COMMANDS)[number];
