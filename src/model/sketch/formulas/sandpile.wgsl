// k1: height
// Grains pile up one step at a time, so a visible pile needs hundreds of steps a second.
const STEPS = 300;

fn evolve(x: f32, y: f32, t: f32) -> vec4f {
    let grains = state().x;
    let spill = step(4.0, grains);
    let arriving = step(4.0, neighbour(1, 0).x) + step(4.0, neighbour(-1, 0).x) +
        step(4.0, neighbour(0, 1).x) + step(4.0, neighbour(0, -1).x);
    // cell(), not x and y: the middle and the rim are places on the grid, wherever focus draws them.
    let at = abs(cell());
    // One grain a step onto the four points around the middle.
    let next = grains - 4.0 * spill + arriving + select(0.0, 1.0, max(at.x, at.y) < latticeStep);

    // The rim swallows what reaches it; neighbour() wraps, and grains must not come back round.
    return vec4f(select(next, 0.0, max(at.x, at.y) > 1.0 - 1.5 * latticeStep), 0.0, 0.0, 0.0);
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let grains = min(state().x, 3.0);

    return vec4f(x, y, (0.03 + 0.07 * k1) * grains, select(0.35 + 0.22 * grains, 0.2, grains < 0.5));
}
