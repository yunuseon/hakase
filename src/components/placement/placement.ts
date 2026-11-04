export type Box = {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};

export type GhostView = {
    readonly name: string;
    readonly section: Box;
    readonly windows: readonly Box[];
};

export type PlacementEvent =
    | { readonly kind: 'move'; readonly at: { readonly x: number; readonly y: number } }
    | { readonly kind: 'drop'; readonly at: { readonly x: number; readonly y: number } }
    | { readonly kind: 'cancel' };
