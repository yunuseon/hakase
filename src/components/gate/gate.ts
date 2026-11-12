import { GATES, type Bit, type Gate, type GateKind } from '../../gates.ts';

export type GateView = {
    readonly summary: string;
    readonly bit: Bit;
    readonly tick: number;
    readonly row: readonly Bit[];
    readonly toggle: boolean;
    readonly steps: readonly Bit[] | null;
    readonly step: number;
    readonly threshold: number | null;
    readonly name: string | null;
};

export type GateChange =
    | { readonly kind: 'toggle' }
    | { readonly kind: 'step'; readonly index: number; readonly value: Bit }
    | { readonly kind: 'steps'; readonly count: number }
    | { readonly kind: 'threshold'; readonly threshold: number }
    | { readonly kind: 'rename'; readonly name: string };

export const gateView = (
    kind: GateKind,
    gate: Gate,
    bits: ArrayLike<number>,
    tick: number,
): GateView => ({
    summary: GATES[kind].summary,
    bit: bits[tick] === 1 ? 1 : 0,
    tick,
    row: bits.length < 2 ? [] : Array.from(bits, (bit): Bit => (bit === 1 ? 1 : 0)),
    toggle: kind === 'switch',
    steps: kind === 'pattern' ? gate.steps : null,
    step: bits.length < 2 ? -1 : Math.floor((tick * gate.steps.length) / bits.length),
    threshold: kind === 'compare' ? gate.threshold : null,
    name: kind === 'pin-in' || kind === 'pin-out' ? gate.name : null,
});
