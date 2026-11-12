export type Filmstrip = {
    readonly bitmap: ImageBitmap;
    // Where it goes in the track, in track pixels.
    readonly left: number;
    readonly width: number;
    readonly height: number;
};
