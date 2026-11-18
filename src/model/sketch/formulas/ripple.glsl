vec3 formula(float x, float y, float t) {
    float depth = length(vec2(x, y)) / sqrt(2.0);
    float wave = sin(2.0 * (depth + t) * PI);

    return vec3(x, y * ((wave + depth) / 2.0), depth);
}
