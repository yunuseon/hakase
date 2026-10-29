export type Edge = 'top' | 'bottom' | 'left' | 'right';

export const EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

export const isEdge = (value: string): value is Edge => EDGES.some(edge => edge === value);

export type Placement = Edge | 'float';

export const isPlacement = (value: string): value is Placement =>
    value === 'float' || isEdge(value);

export type ZoomCommand = 'in' | 'out' | 'reset' | 'fit';

export const ZOOM_COMMANDS: readonly ZoomCommand[] = ['in', 'out', 'reset', 'fit'];

export const isZoomCommand = (value: string): value is ZoomCommand =>
    ZOOM_COMMANDS.some(command => command === value);

export type ToolbarView = {
    readonly placement: Placement;
    readonly retracted: boolean;
};

export const sameToolbarView = (a: ToolbarView, b: ToolbarView): boolean =>
    a.placement === b.placement && a.retracted === b.retracted;
