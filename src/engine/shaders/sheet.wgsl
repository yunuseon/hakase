// Both layers are premultiplied ink on nothing: the whole figure faintly, then the line drawn so far.
@fragment
fn main(v: Varying) -> @location(0) vec4f {
    let whole = textureSample(in0, bilinear, at(v.uv));
    let now = textureSample(in1, bilinear, at(v.uv));
    let faint = settings.paper.w;
    let under = settings.paper.rgb * (1.0 - faint * whole.a) + faint * whole.rgb;

    return vec4f(under * (1.0 - now.a) + now.rgb, 1.0);
}
