export type Shown =
    | { readonly kind: 'frame'; readonly bitmap: ImageBitmap }
    | { readonly kind: 'message'; readonly text: string };
