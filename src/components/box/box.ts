import type { Bit } from '../../gates.ts';

export type PinView = {
    readonly store: string;
    readonly name: string;
    readonly bit: Bit;
    readonly row: readonly Bit[];
};

export type BoxView = {
    readonly name: string;
    readonly tick: number;
    readonly inputs: readonly PinView[];
    readonly outputs: readonly PinView[];
};

export type BoxChange =
    { readonly kind: 'rename'; readonly name: string } | { readonly kind: 'open' };
