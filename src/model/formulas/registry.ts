import type { Formula } from '../formula.ts';
import { rippleAt } from './ripple.ts';

export const formulas = {
    ripple: { label: 'Ripple', apply: rippleAt },
} satisfies Record<string, { label: string; apply: Formula }>;

export type FormulaName = keyof typeof formulas;
