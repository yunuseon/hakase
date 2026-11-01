// Grains pile up one step at a time, so a visible pile needs hundreds of steps a second.
#define STEPS 300

vec4 evolve(float x, float y, float t) {
    float grains = state().x;
    float spill = step(4.0, grains);
    float arriving = step(4.0, neighbour(1, 0).x) + step(4.0, neighbour(-1, 0).x)
        + step(4.0, neighbour(0, 1).x) + step(4.0, neighbour(0, -1).x);
    float next = grains - 4.0 * spill + arriving;

    // cell(), not x and y: the middle and the rim are places on the grid, wherever focus draws them.
    vec2 at = abs(cell());

    // One grain a step onto the four points around the middle.
    next += max(at.x, at.y) < latticeStep ? 1.0 : 0.0;

    // The rim swallows what reaches it; neighbour() wraps, and grains must not come back round.
    return vec4(max(at.x, at.y) > 1.0 - 1.5 * latticeStep ? 0.0 : next, 0.0, 0.0, 0.0);
}

vec4 formula(float x, float y, float t) {
    float grains = min(state().x, 3.0);

    return vec4(x, y, (0.03 + 0.07 * k1) * grains, grains < 0.5 ? 0.2 : 0.35 + 0.22 * grains);
}
