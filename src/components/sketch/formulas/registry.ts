import type { Formula } from './formula.ts';
import { bloom } from './bloom.ts';
import { interference } from './interference.ts';
import { klein } from './klein.ts';
import { ripple } from './ripple.ts';
import { rose } from './rose.ts';
import { spiral } from './spiral.ts';
import { terrain } from './terrain.ts';
import { torus } from './torus.ts';
import { trefoil } from './trefoil.ts';
import { weave } from './weave.ts';

export const formulas = {
    ripple,
    spiral,
    interference,
    weave,
    rose,
    torus,
    klein,
    trefoil,
    bloom,
    terrain,
} satisfies Record<string, Formula>;

export type FormulaName = keyof typeof formulas;

export const isFormulaName = (value: string): value is FormulaName => value in formulas;
