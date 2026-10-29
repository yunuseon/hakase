float height(float x, float y) {
    return 0.11 * sin(2.0 * PI * x + 3.0 * PI * y)
        + 0.07 * sin(5.0 * PI * x - 4.0 * PI * y) * cos(2.0 * PI * y)
        + 0.03 * sin(11.0 * PI * (x + y));
}

vec3 formula(float x, float y, float t) {
    // Reversed so the near rows are drawn last and sit on top of the far ones.
    float row = -y;
    float range = 2.05 - 1.3 * row;
    float lens = 1.4 / range;
    float ground = x * range * 0.75;
    float h = height(ground, row + 2.0 * t);

    return vec3(ground * lens, (h - 0.6) * lens + 0.3, clamp(0.15 + lens * 0.55 * (0.7 + 2.0 * h), 0.0, 1.0));
}
