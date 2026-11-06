export const EDGES = ['top', 'bottom', 'left', 'right'] as const;

export type Edge = (typeof EDGES)[number];

export const isEdge = (value: string): value is Edge => EDGES.some(edge => edge === value);

export type Placement = Edge | 'float';

export const isPlacement = (value: string): value is Placement =>
    value === 'float' || isEdge(value);
