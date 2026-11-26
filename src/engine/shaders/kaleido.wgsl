// segments, rotate, x, y; choice 0 mirrors, 1 turns
@fragment
fn main(v: Varying) -> @location(0) vec4f {
    let aspect = settings.resolution.x / max(settings.resolution.y, 1.0);
    let centre = vec2f(knob(2), knob(3)) * 0.5 + 0.5;
    let p = (v.uv - centre) * vec2f(aspect, 1.0);
    let slice = TAU / max(knob(0), 1.0);
    var angle = floorMod(atan2(p.y, p.x) + knob(1) * TAU, slice);

    if (settings.choice == 0) {
        angle = abs(angle - 0.5 * slice);
    }

    let folded = length(p) * vec2f(cos(angle), sin(angle));
    let uv = centre + folded / vec2f(aspect, 1.0);
    // Mirrored at the edges, so a fold that reaches past the picture finds picture rather than a clamp smear.
    let mirrored = 1.0 - abs(1.0 - vec2f(floorMod(uv.x, 2.0), floorMod(uv.y, 2.0)));

    return vec4f(textureSample(in0, bilinear, at(mirrored)).rgb, 1.0);
}
