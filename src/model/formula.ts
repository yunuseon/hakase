export type Formula = {
    readonly label: string;
    /**
     * GLSL ES 3.00 defining `vec3 formula(float x, float y, float t)`.
     * `x` and `y` are normalized to [-1, 1], `t` is the playhead in [0, 1).
     * The returned x and y are clip-space position; z is depth, driving both
     * point size and colour.
     */
    readonly source: string;
};
