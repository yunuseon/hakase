vec3 formula(float x, float y, float t) {
    float phase = t * 2.0 * PI;
    float travel = cos(phase) * 0.55;
    float left = length(vec2(x - travel, y));
    float right = length(vec2(x + travel, y));
    float wave = sin(left * 14.0 - phase) + sin(right * 14.0 - phase);

    return vec3(x, y, 0.5 + 0.25 * wave);
}
