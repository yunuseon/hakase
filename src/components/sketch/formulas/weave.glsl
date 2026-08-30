vec3 formula(float x, float y, float t) {
    float phase = t * 2.0 * PI;
    float warp = 0.5 + 0.5 * cos(3.0 * (x + y) * PI + phase);

    return vec3(
        x + 0.18 * sin(3.0 * y * PI + phase),
        y + 0.18 * sin(3.0 * x * PI - phase),
        0.15 + 0.8 * warp
    );
}
