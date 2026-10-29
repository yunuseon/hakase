vec3 spin(vec3 p, float yaw, float pitch) {
    p = vec3(cos(yaw) * p.x + sin(yaw) * p.z, p.y, cos(yaw) * p.z - sin(yaw) * p.x);

    return vec3(p.x, cos(pitch) * p.y - sin(pitch) * p.z, sin(pitch) * p.y + cos(pitch) * p.z);
}

vec3 knot(float s) {
    return vec3(sin(s) + 2.0 * sin(2.0 * s), cos(s) - 2.0 * cos(2.0 * s), -sin(3.0 * s));
}

vec3 formula(float x, float y, float t) {
    float phase = t * 2.0 * PI;
    float s = x * PI;
    float around = y * PI + 3.0 * s + phase;
    vec3 centre = knot(s);
    vec3 tangent = normalize(knot(s + 0.001) - knot(s - 0.001));
    vec3 normal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    vec3 binormal = cross(tangent, normal);
    float tube = 0.42 + 0.08 * sin(4.0 * around);
    vec3 p = (centre + tube * (cos(around) * normal + sin(around) * binormal)) * 0.26;
    p = spin(p, phase, 0.6 + 0.3 * sin(2.0 * phase));
    float lens = 1.9 / (2.6 - p.z);

    return vec3(p.xy * lens, clamp(0.1 + 0.5 * (p.z + 1.0), 0.0, 1.0));
}
