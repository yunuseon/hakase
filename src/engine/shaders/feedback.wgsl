// decay, zoom, rotate, x, y
@fragment
fn main(v: Varying) -> @location(0) vec4f {
    let aspect = settings.resolution.x / max(settings.resolution.y, 1.0);
    let turn = -knob(2) * TAU;
    let p = mat2x2f(cos(turn), sin(turn), -sin(turn), cos(turn)) * ((v.uv - 0.5) * vec2f(aspect, 1.0)) /
        max(knob(1), 0.0001);
    let back = p / vec2f(aspect, 1.0) + 0.5 - vec2f(knob(3), knob(4));
    let before = textureSample(previous, bilinear, at(back)).rgb;
    let picture = textureSample(in0, bilinear, at(v.uv)).rgb;

    return vec4f(mix(picture, before, knob(0)), 1.0);
}
