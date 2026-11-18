vec3 formula(float x, float y, float t) {
    float radius = length(vec2(x, y));
    float angle = atan(y, x) + radius * 3.0 + t * 2.0 * PI;
    float arms = 0.5 + 0.5 * sin(angle * 3.0);

    return vec3(cos(angle) * radius, sin(angle) * radius, 0.25 + 0.75 * arms);
}
