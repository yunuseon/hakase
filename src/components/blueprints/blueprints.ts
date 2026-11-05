import type { Size } from '../window/frame.ts';

export type BlueprintCard = {
    readonly id: string;
    readonly name: string;
    readonly size: Size;
    readonly summary: string | null;
    readonly windows: readonly {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    }[];
};

export type BlueprintEvent =
    | { readonly kind: 'place'; readonly id: string }
    | { readonly kind: 'rename'; readonly id: string; readonly name: string }
    | { readonly kind: 'remove'; readonly id: string };

export type Arming = { readonly kind: 'click'; readonly id: string } | { readonly kind: 'expire' };

export type Armed = { readonly armed: string | null; readonly fired: string | null };

export const reduceArmed = ({ armed }: Armed, event: Arming): Armed =>
    event.kind === 'expire'
        ? { armed: null, fired: null }
        : armed === event.id
          ? { armed: null, fired: event.id }
          : { armed: event.id, fired: null };

export const describedCount = (count: number) => (count === 1 ? '1 window' : `${count} windows`);
