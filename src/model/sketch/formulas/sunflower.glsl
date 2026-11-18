#define K1 spacing
#define K2 winding
// Its lattice goes around in x, so the sketch must close the seam where the last column meets the first.
#define WRAPS

// Rings spaced so each holds the same area, each turned a little further than the last: spiral arms,
// with neighbours on the grid still neighbours here, so lines and surfaces hold together.
vec2 lattice(vec2 uv, float index, float count) {
    float ring = (uv.y + 1.0) * 0.5;
    float angle = uv.x * PI + ring * (2.0 + 4.0 * k2) * PI;

    return sqrt(ring) * vec2(cos(angle), sin(angle));
}

vec4 formula(float x, float y, float t) {
    float r = length(vec2(x, y));
    float angle = atan(y, x);
    float pulse = 0.5 + 0.5 * sin(r * (8.0 + 16.0 * k1) - t * 2.0 * PI);
    float tint = 0.8 + 0.2 * sin(angle * 3.0 + t * 2.0 * PI);

    return vec4(x, y, 0.25 + 0.6 * pulse, tint);
}
