vec4 formula(float x, float y, float t) {
    float ink = paint(x, y);
    float sweep = 0.5 + 0.5 * sin(2.0 * PI * (t - 0.35 * (x + y)));
    float lift = ink * (0.4 + 0.6 * sweep);

    return vec4(x, y, mix(-0.8, 0.5, lift), mix(0.08, 1.0, ink));
}
