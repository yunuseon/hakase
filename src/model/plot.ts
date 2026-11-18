export const LAYOUTS = ['overlay', 'lanes'] as const;
export type Layout = (typeof LAYOUTS)[number];
export const isLayout = (value: string): value is Layout =>
    LAYOUTS.some(layout => layout === value);
