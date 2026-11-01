#define K1 hills
#define K2 camera_height

float height(float x, float y) {
    return 0.11 * sin(2.0 * PI * x + 3.0 * PI * y)
        + 0.07 * sin(5.0 * PI * x - 4.0 * PI * y) * cos(2.0 * PI * y)
        + 0.03 * sin(11.0 * PI * (x + y));
}

vec4 formula(float x, float y, float t) {
    // 2.0 * t, not t: the ground repeats every 2 units, so a loop of the playhead flies one full repeat.
    float h = height(x, y + 2.0 * t);

    return vec4(x, y, h * (1.0 + 3.0 * k1), 0.35 + 0.65 * clamp(0.5 + 3.0 * h, 0.0, 1.0));
}

// Low over the ground and looking across it, with z as up: the hills are height, not depth.
Camera camera(float t) {
    float sway = 0.25 * sin(t * 2.0 * PI);
    vec3 eye = vec3(sway, -2.8, 0.7 + 0.8 * k2);

    return Camera(eye, vec3(sway * 0.5, 0.3, 0.0), vec3(0.0, 0.0, 1.0));
}
