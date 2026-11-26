// A true area average of each factor x factor block: bilinear sampling would skip most of the pixels.
@fragment
fn main(v: Varying) -> @location(0) vec4f {
    let factor = settings.factor;
    let base = vec2i(v.position.xy) * factor;
    var sum = vec3f(0.0);

    for (var y = 0; y < factor; y++) {
        for (var x = 0; x < factor; x++) {
            sum += textureLoad(in0, base + vec2i(x, y), 0).rgb;
        }
    }

    return vec4f(sum / f32(factor * factor), 1.0);
}
