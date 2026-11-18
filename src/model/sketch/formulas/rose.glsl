vec3 formula(float x, float y, float t) {
    float radius = length(vec2(x, y));
    float angle = atan(y, x);
    float petals = 0.5 + 0.5 * cos(5.0 * angle + t * 2.0 * PI);
    float reach = radius * (0.35 + 0.65 * petals);

    return vec3(cos(angle) * reach, sin(angle) * reach, 0.2 + 0.8 * petals * (1.0 - radius * 0.5));
}
