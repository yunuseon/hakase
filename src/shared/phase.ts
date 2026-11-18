export const PHASES = ['grab', 'move', 'release'] as const;
export type Phase = (typeof PHASES)[number];
