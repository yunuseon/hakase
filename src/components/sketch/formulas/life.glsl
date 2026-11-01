// Ten generations a second: one per frame would be too fast to follow.
#define STEPS 10

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 initial(float x, float y) {
    float alive = step(0.75 - 0.4 * k1, hash(vec2(x, y)));

    return vec4(alive, alive, 0.0, 0.0);
}

vec4 evolve(float x, float y, float t) {
    float around = 0.0;
    for (int dx = -1; dx <= 1; dx++) {
        for (int dy = -1; dy <= 1; dy++) {
            around += dx == 0 && dy == 0 ? 0.0 : neighbour(dx, dy).x;
        }
    }

    float alive = state().x;
    float next = around == 3.0 || (alive > 0.5 && around == 2.0) ? 1.0 : 0.0;
    vec2 pressed = vec2(x, y) - pointer;
    next = max(next, pointerDown * step(dot(pressed, pressed), 0.002));
    // A glow that fades after a cell dies, so the trails of gliders stay visible.
    float glow = max(next, state().y * (0.6 + 0.35 * k2));

    return vec4(next, glow, 0.0, 0.0);
}

vec4 formula(float x, float y, float t) {
    vec4 cell = state();

    return vec4(x, y, 0.15 * cell.x, 0.3 + 0.7 * cell.y);
}
