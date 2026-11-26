// amount, offset
@fragment
fn main(v: Varying) -> @location(0) vec4f {
    let picture = textureSample(in0, bilinear, at(v.uv)).rgb;
    let light = dot(picture, vec3f(0.2126, 0.7152, 0.0722));
    let mapped = textureSample(palette, nearest, vec2f(fract(light + knob(1)), 0.5)).rgb;

    return vec4f(mix(picture, mapped, knob(0)), 1.0);
}
