#define K1 pull

vec4 formula(float x, float y, float t) {
    float e = 0.04;
    float here = paint(x, y);
    vec2 slope = vec2(paint(x + e, y) - paint(x - e, y), paint(x, y + e) - paint(x, y - e)) / (2.0 * e);
    float swing = sin(2.0 * PI * t + 6.0 * here);
    vec2 along = vec2(-slope.y, slope.x);
    vec2 moved = vec2(x, y) + (0.04 + 0.12 * k1) * swing * along + 0.05 * here * slope;

    return vec4(moved, 0.3 * here, 0.35 + 0.65 * here);
}
