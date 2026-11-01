import type { Formula } from './formula.ts';
import { bloom } from './bloom.ts';
import { interference } from './interference.ts';
import { klein } from './klein.ts';
import { magnet } from './magnet.ts';
import { lens } from './lens.ts';
import { vortex } from './vortex.ts';
import { peaks } from './peaks.ts';
import { flow } from './flow.ts';
import { ribbon } from './ribbon.ts';
import { sunflower } from './sunflower.ts';
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
    magnet,
    lens,
    vortex,
    peaks,
    flow,
    sunflower,
    ribbon,
} satisfies Record<string, Formula>;

export type FormulaName = keyof typeof formulas;

export const isFormulaName = (value: string): value is FormulaName => value in formulas;
