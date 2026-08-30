import type { Formula } from './formula.ts';
import { interference } from './interference.ts';
import { ripple } from './ripple.ts';
import { rose } from './rose.ts';
import { spiral } from './spiral.ts';
import { weave } from './weave.ts';

export const formulas = {
    ripple,
    spiral,
    interference,
    weave,
    rose,
} satisfies Record<string, Formula>;

export type FormulaName = keyof typeof formulas;

export const isFormulaName = (value: string): value is FormulaName => value in formulas;
