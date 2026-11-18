vec3 spin(vec3 p, float yaw, float pitch) {
    p = vec3(cos(yaw) * p.x + sin(yaw) * p.z, p.y, cos(yaw) * p.z - sin(yaw) * p.x);

    return vec3(p.x, cos(pitch) * p.y - sin(pitch) * p.z, sin(pitch) * p.y + cos(pitch) * p.z);
}

vec4 formula(float x, float y, float t) {
    float phase = t * 2.0 * PI;
    float theta = (y + 1.0) * 0.5 * PI;
    float phi = x * PI;
    float lobes = sin(4.0 * theta + phase) * cos(3.0 * phi - phase);
    float pulse = 0.5 + 0.5 * sin(6.0 * theta - 2.0 * phase) * sin(5.0 * phi);
    float radius = 0.5 + 0.2 * lobes + 0.06 * pulse;
    vec3 p = radius * vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
    p = spin(p, -phase, 0.5 * sin(phase));

    return vec4(p * 1.2, 0.3 + 0.7 * clamp((0.5 + p.z) * (0.6 + pulse * 0.6), 0.0, 1.0));
}
