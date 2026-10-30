vec3 formula(float x, float y, float t) {
    vec2 away = vec2(x, y) - pointer;
    float radius = 0.2 + 0.6 * k1;
    float d = length(away);
    float inside = 1.0 - smoothstep(0.0, radius, d);
    float zoom = 1.0 + (0.5 + 2.5 * k2) * inside * inside;
    float wobble = 0.02 * sin(t * 2.0 * PI - d * 14.0) * inside;

    return vec3(pointer + away * (zoom + wobble), 0.5 + 0.5 * inside);
}
