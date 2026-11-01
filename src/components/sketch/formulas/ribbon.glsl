#define K1 twist
// Twists the formula's flat strip around the vertical axis, more the higher it goes.
vec3 space(vec3 p) {
    float twist = p.y * PI * (0.5 + 1.5 * k1);
    float depth = p.z - 0.5;

    return vec3(p.x * cos(twist) - depth * sin(twist), p.y, p.x * sin(twist) + depth * cos(twist));
}

vec4 formula(float x, float y, float t) {
    float wave = 0.15 * sin(3.0 * PI * x + t * 2.0 * PI);
    float tint = 0.65 + 0.35 * sin(2.0 * PI * y - t * 2.0 * PI);

    return vec4(x * 0.45, y, 0.5 + wave, tint);
}
