export type KnobView = {
    readonly name: string;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly value: number;
    readonly driven: boolean;
};

export type PedalView = {
    readonly summary: string;
    readonly knobs: readonly KnobView[];
    readonly choices: readonly string[];
    readonly choice: string;
    readonly inputs: readonly { readonly name: string; readonly from: string | null }[];
};

export type PedalChange =
    | { readonly kind: 'value'; readonly name: string; readonly value: number }
    | { readonly kind: 'choice'; readonly choice: string };

export const readout = (value: number, step: number): string =>
    value.toFixed(step >= 1 ? 0 : step >= 0.01 ? 2 : 3);
