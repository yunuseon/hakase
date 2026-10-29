vec3 spin(vec3 p, float yaw, float pitch) {
    p = vec3(cos(yaw) * p.x + sin(yaw) * p.z, p.y, cos(yaw) * p.z - sin(yaw) * p.x);

    return vec3(p.x, cos(pitch) * p.y - sin(pitch) * p.z, sin(pitch) * p.y + cos(pitch) * p.z);
}

vec3 formula(float x, float y, float t) {
    float phase = t * 2.0 * PI;
    float u = x * PI;
    float v = y * PI;
    float tube = 0.3 + 0.07 * sin(6.0 * u + 3.0 * v - 2.0 * phase);
    float ring = 0.6 + tube * cos(v);
    vec3 p = spin(vec3(ring * cos(u), ring * sin(u), tube * sin(v)), phase, 1.0 + 0.4 * sin(phase));
    float lens = 1.8 / (2.6 - p.z);

    return vec3(p.xy * lens, clamp(0.12 + 0.44 * (p.z + 1.0), 0.0, 1.0));
}
