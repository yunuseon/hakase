vec3 knot(float s) {
    return vec3(sin(s) + 2.0 * sin(2.0 * s), cos(s) - 2.0 * cos(2.0 * s), -sin(3.0 * s));
}

vec4 formula(float x, float y, float t) {
    float phase = t * 2.0 * PI;
    float s = x * PI;
    float around = y * PI + 3.0 * s + phase;
    vec3 centre = knot(s);
    vec3 tangent = normalize(knot(s + 0.001) - knot(s - 0.001));
    vec3 normal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    vec3 binormal = cross(tangent, normal);
    float tube = 0.42 + 0.08 * sin(4.0 * around);
    vec3 p = (centre + tube * (cos(around) * normal + sin(around) * binormal)) * 0.26;

    return vec4(p * 0.8, 0.35 + 0.65 * clamp(0.5 + p.z, 0.0, 1.0));
}

// The knot holds still; the camera circles it once per loop and rises and dips twice.
Camera camera(float t) {
    float a = t * 2.0 * PI;
    vec3 eye = vec3(4.2 * sin(a), 1.4 * sin(2.0 * a), 4.2 * cos(a));

    return Camera(eye, vec3(0.0), vec3(0.0, 1.0, 0.0));
}
