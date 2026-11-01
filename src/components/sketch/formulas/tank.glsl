
vec2 dropAt(float beat) {
    return vec2(fract(sin(beat * 12.9898) * 43758.5453), fract(sin(beat * 78.233) * 43758.5453)) * 1.6 - 0.8;
}

vec4 initial(float x, float y) {
    vec2 from = vec2(x, y) - vec2(0.3, 0.2);
    float drop = 0.6 * exp(-dot(from, from) * 80.0);

    return vec4(drop, drop, 0.0, 0.0);
}

vec4 evolve(float x, float y, float t) {
    vec4 here = state();
    float around = neighbour(1, 0).x + neighbour(-1, 0).x + neighbour(0, 1).x + neighbour(0, -1).x;
    // Above a half the explicit wave equation blows up; this stays well under it.
    float speed = 0.15 + 0.3 * k1;
    float next = (2.0 * here.x - here.y + speed * (around - 4.0 * here.x)) * (0.990 + 0.009 * k2);

    // Four drops a loop, at fixed moments and places, so a replay lands every one the same.
    float beat = floor(t * 4.0);
    vec2 from = vec2(x, y) - dropAt(beat);
    next += fract(t * 4.0) < 0.004 ? 0.5 * exp(-dot(from, from) * 120.0) : 0.0;

    vec2 pressed = vec2(x, y) - pointer;
    next += pointerDown * 0.05 * exp(-dot(pressed, pressed) * 200.0);

    return vec4(next, here.x, 0.0, 0.0);
}

vec4 formula(float x, float y, float t) {
    float height = state().x;

    return vec4(x, y, 0.8 * height, 0.55 + 1.5 * height);
}
