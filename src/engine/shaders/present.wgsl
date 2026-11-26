@fragment
fn main(v: Varying) -> @location(0) vec4f {
    return vec4f(textureSample(in0, bilinear, at(v.uv)).rgb, 1.0);
}
