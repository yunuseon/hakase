#define STEPS 120

// Four neighbours and fourteen colours: with all eight neighbours the field freezes into still patches.
const float COLOURS = 14.0;

vec4 initial(float x, float y) {
    return vec4(floor(fract(sin(dot(vec2(x, y), vec2(12.9898, 78.233))) * 43758.5453) * COLOURS), 0.0, 0.0, 0.0);
}

vec4 evolve(float x, float y, float t) {
    float colour = state().x;
    float next = mod(colour + 1.0, COLOURS);
    float ahead = (abs(neighbour(1, 0).x - next) < 0.5 ? 1.0 : 0.0) + (abs(neighbour(-1, 0).x - next) < 0.5 ? 1.0 : 0.0)
        + (abs(neighbour(0, 1).x - next) < 0.5 ? 1.0 : 0.0) + (abs(neighbour(0, -1).x - next) < 0.5 ? 1.0 : 0.0);

    // One neighbour ahead winds spirals; past half on k1 it takes two, and the noise holds out longer.
    return vec4(ahead >= (k1 > 0.5 ? 2.0 : 1.0) ? next : colour, 0.0, 0.0, 0.0);
}

vec4 formula(float x, float y, float t) {
    float colour = state().x / COLOURS;

    return vec4(x, y, 0.02 * sin(2.0 * PI * colour), 0.3 + 0.7 * colour);
}
