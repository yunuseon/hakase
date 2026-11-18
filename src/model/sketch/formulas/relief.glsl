#define K1 height

vec4 formula(float x, float y, float t) {
    float ink = paint(x, y);
    float breath = 0.04 * sin(2.0 * PI * (t + 0.6 * length(vec2(x, y))));

    return vec4(x, y, ink * (0.25 + 1.2 * k1) + breath * ink, 0.3 + 0.7 * ink);
}
