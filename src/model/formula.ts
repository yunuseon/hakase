import type { Vector } from './vector.ts';

export type Formula = (x: number, y: number, playhead: number) => Vector;
