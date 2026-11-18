vec3 spin(vec3 p, float yaw, float pitch) {
    p = vec3(cos(yaw) * p.x + sin(yaw) * p.z, p.y, cos(yaw) * p.z - sin(yaw) * p.x);

    return vec3(p.x, cos(pitch) * p.y - sin(pitch) * p.z, sin(pitch) * p.y + cos(pitch) * p.z);
}

vec4 formula(float x, float y, float t) {
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

    return vec4(p * 0.8, 0.35 + 0.65 * clamp(0.5 + p.z, 0.0, 1.0));
}
