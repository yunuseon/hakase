export type Shown =
    | { readonly kind: 'frame'; readonly bitmap: ImageBitmap; readonly samples?: number | null }
    | { readonly kind: 'message'; readonly text: string };
