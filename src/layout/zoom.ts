export const ZOOM_COMMANDS = ['in', 'out', 'reset', 'fit'] as const;

export type ZoomCommand = (typeof ZOOM_COMMANDS)[number];

export const isZoomCommand = (value: string): value is ZoomCommand =>
    ZOOM_COMMANDS.some(command => command === value);
