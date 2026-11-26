// radius; one axis per pass, direction (1, 0) then (0, 1)
const TAPS = 12;

@fragment
fn main(v: Varying) -> @location(0) vec4f {
    let resolution = settings.resolution;
    let radius = knob(0) * 0.04 * max(resolution.x, resolution.y);
    let step = settings.direction / resolution * radius / f32(TAPS);
    var sum = vec3f(0.0);
    var weights = 0.0;

    for (var i = -TAPS; i <= TAPS; i++) {
        let x = f32(i) / f32(TAPS);
        let weight = exp(-4.0 * x * x);
        sum += textureSample(in0, bilinear, at(v.uv + step * f32(i))).rgb * weight;
        weights += weight;
    }

    return vec4f(sum / weights, 1.0);
}
