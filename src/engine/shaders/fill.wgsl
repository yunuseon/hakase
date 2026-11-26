// A slot's backdrop: WebGPU clears a whole target, never a scissored part of it.
@fragment
fn main(v: Varying) -> @location(0) vec4f {
    return vec4f(settings.paper.rgb, 1.0);
}
