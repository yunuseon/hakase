#define K1 bass
#define K2 arpeggio
#define K3 melody
#define K4 drums

float plate(vec2 p, float n, float m) {
    return cos(n * PI * p.x) * cos(m * PI * p.y) - cos(m * PI * p.x) * cos(n * PI * p.y);
}

vec4 formula(float x, float y, float t) {
    float note = floor(k3 * 12.0 + 0.5);
    float n = 1.0 + mod(note, 4.0);
    float m = n + 1.0 + mod(floor(note / 4.0), 3.0);
    vec2 p = vec2(x, y) * (1.0 + 0.12 * k4);
    float r = length(p);
    float figure = plate(p, n, m);
    // 32.0 * PI * t: sixteen rings a loop, one for every beat of the ground bass.
    float ring = sin(9.0 * r - 32.0 * PI * t);
    float z = figure * (0.04 + 0.16 * k2) + ring * 0.12 * k1 * exp(-r);
    float tint = 0.35 + 0.35 * clamp(k3 / 1.4, 0.0, 1.0) + 0.12 * abs(figure) + 0.15 * k2;

    return vec4(p, z, tint);
}

Camera camera(float t) {
    float a = 2.0 * PI * t;

    return Camera(vec3(4.4 * sin(a), -4.4 * cos(a), 4.0), vec3(0.0), vec3(0.0, 0.0, 1.0));
}
