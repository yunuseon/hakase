// Gray-Scott runs slowly per step, so many steps a second; a replay from the start costs more for it.
#define STEPS 480

vec4 initial(float x, float y) {
    float seeded = step(length(vec2(x, y)), 0.12) + step(length(vec2(x, y) - vec2(0.45, -0.3)), 0.08);

    return vec4(1.0, min(seeded, 1.0), 0.0, 0.0);
}

vec4 evolve(float x, float y, float t) {
    vec2 here = state().xy;
    vec2 near = neighbour(1, 0).xy + neighbour(-1, 0).xy + neighbour(0, 1).xy + neighbour(0, -1).xy;
    vec2 corners = neighbour(1, 1).xy + neighbour(-1, 1).xy + neighbour(1, -1).xy + neighbour(-1, -1).xy;
    vec2 spread = 0.2 * near + 0.05 * corners - here;
    float feed = 0.03 + 0.03 * k1;
    float kill = 0.055 + 0.01 * k2;
    float reaction = here.x * here.y * here.y;
    vec2 next = here + vec2(spread.x - reaction + feed * (1.0 - here.x), 0.5 * spread.y + reaction - (kill + feed) * here.y);

    vec2 pressed = vec2(x, y) - pointer;
    next.y += pointerDown * 0.5 * exp(-dot(pressed, pressed) * 400.0);

    return vec4(clamp(next, 0.0, 1.0), 0.0, 0.0);
}

vec4 formula(float x, float y, float t) {
    float grown = state().y;

    return vec4(x, y, 0.4 * grown, 0.35 + 1.6 * grown);
}
