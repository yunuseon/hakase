import { isProgramId, type ProgramId } from './program.ts';
import type { StoreId } from './stores.ts';

export const GLOBALS = ['workspace', 'appearance', 'formulas', 'themes', 'library'] as const;
export type Global = (typeof GLOBALS)[number];

const isGlobal = (value: string): value is Global => GLOBALS.some(name => name === value);

export type Target =
    | { readonly kind: 'store'; readonly program: ProgramId; readonly store: StoreId }
    | { readonly kind: 'global'; readonly name: Global };

export const targetId = (target: Target): string =>
    target.kind === 'store' ? `store:${target.program}:${target.store}` : `global:${target.name}`;

export const parseTarget = (id: string): Target | null => {
    const [kind, first = '', ...rest] = id.split(':');

    if (kind === 'global') {
        return isGlobal(first) ? { kind: 'global', name: first } : null;
    }

    return kind === 'store' && isProgramId(first) && rest.length > 0
        ? { kind: 'store', program: first, store: rest.join(':') }
        : null;
};
