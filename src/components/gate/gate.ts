import type { Bit } from '../../gates.ts';

export type GateView = {
    readonly icon: string;
    readonly summary: string;
    readonly bit: Bit;
    readonly tick: number;
    readonly row: readonly Bit[];
    readonly toggle: boolean;
    readonly steps: readonly Bit[] | null;
    readonly threshold: number | null;
    readonly name: string | null;
};

export type GateChange =
    | { readonly kind: 'toggle' }
    | { readonly kind: 'step'; readonly index: number; readonly value: Bit }
    | { readonly kind: 'threshold'; readonly threshold: number }
    | { readonly kind: 'rename'; readonly name: string };
