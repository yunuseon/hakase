import type { Formula } from '../formula.ts';
import { ripple } from './ripple.ts';

export const formulas = {
    ripple,
} satisfies Record<string, Formula>;

export type FormulaName = keyof typeof formulas;
