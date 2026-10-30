vec2 field(vec2 p, float phase) {
    return vec2(sin(5.0 * p.y + phase + sin(3.0 * p.x)), sin(5.0 * p.x - phase + sin(3.0 * p.y)));
}

vec4 formula(float x, float y, float t) {
    float phase = t * 2.0 * PI;
    vec2 p = vec2(x, y);
    vec2 v = field(p, phase);
    float speed = length(v) / sqrt(2.0);
    float tint = 0.65 + 0.35 * sin(atan(v.y, v.x) + 2.0 * PI * k2);

    return vec4(p + 0.12 * k1 * v, 0.4 + 0.6 * speed, tint);
}
