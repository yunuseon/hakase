vec3 spin(vec3 p, float yaw, float pitch) {
    p = vec3(cos(yaw) * p.x + sin(yaw) * p.z, p.y, cos(yaw) * p.z - sin(yaw) * p.x);

    return vec3(p.x, cos(pitch) * p.y - sin(pitch) * p.z, sin(pitch) * p.y + cos(pitch) * p.z);
}

vec3 formula(float x, float y, float t) {
    float phase = t * 2.0 * PI;
    float u = (x + 1.0) * PI;
    float v = (y + 1.0) * PI;
    float half_u = u * 0.5 + phase;
    float sweep = 2.0 + cos(half_u) * sin(v) - sin(half_u) * sin(2.0 * v);
    vec3 p = vec3(
        sweep * cos(u),
        sweep * sin(u),
        sin(half_u) * sin(v) + cos(half_u) * sin(2.0 * v)
    ) * 0.27;
    p = spin(p, phase, 1.1 + 0.3 * cos(phase));
    float lens = 1.9 / (2.6 - p.z);

    return vec3(p.xy * lens, clamp(0.12 + 0.46 * (p.z + 1.0), 0.0, 1.0));
}
