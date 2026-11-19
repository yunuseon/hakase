import { audible } from '../../mix.ts';
import type { MixStrip } from '../../program.ts';

export type StripView = MixStrip & {
    readonly soloed: boolean;
    readonly heard: boolean;
    readonly percent: string;
};

export type MixerView = {
    readonly listening: boolean;
    readonly strips: readonly StripView[];
};

export type MixerEvent =
    | { readonly kind: 'listen' }
    | { readonly kind: 'volume'; readonly store: string; readonly volume: number }
    | { readonly kind: 'mute'; readonly store: string }
    | { readonly kind: 'solo'; readonly store: string };

export const mixerView = (
    strips: readonly MixStrip[],
    listening: boolean,
    soloed: ReadonlySet<string>,
): MixerView => ({
    listening,
    strips: strips.map(strip => ({
        ...strip,
        soloed: soloed.has(strip.store),
        heard: listening && audible(strip.store, strip.muted, soloed),
        percent: `${Math.round(strip.volume * 100)}%`,
    })),
});

// What a meter shows: nothing from a strip nobody hears, and never past the top.
export const meterOf = (level: number, heard: boolean): number =>
    heard ? Math.min(1, Math.max(0, level)) : 0;
