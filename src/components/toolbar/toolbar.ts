export const EDGES = ['top', 'bottom', 'left', 'right'] as const;

export type Edge = (typeof EDGES)[number];

export const isEdge = (value: string): value is Edge => EDGES.some(edge => edge === value);

export type Placement = Edge | 'float';

export const isPlacement = (value: string): value is Placement =>
    value === 'float' || isEdge(value);

export const ZOOM_COMMANDS = ['in', 'out', 'reset', 'fit'] as const;

export type ZoomCommand = (typeof ZOOM_COMMANDS)[number];

export const isZoomCommand = (value: string): value is ZoomCommand =>
    ZOOM_COMMANDS.some(command => command === value);

export type ToolbarView = {
    readonly placement: Placement;
    readonly retracted: boolean;
};

export const sameToolbarView = (a: ToolbarView, b: ToolbarView): boolean =>
    a.placement === b.placement && a.retracted === b.retracted;
