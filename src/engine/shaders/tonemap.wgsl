// Its own layout: a float accumulation is read whole, and a float texture need not be filterable.
@group(0) @binding(0) var<uniform> exposure: vec4f;
@group(0) @binding(1) var accumulated: texture_2d<f32>;

@vertex
fn fullscreen(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
    let corner = vec2f(f32((id << 1u) & 2u), f32(id & 2u));

    return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

// ACES, fitted by Narkowicz: highlights roll off instead of clipping to white.
fn filmic(x: vec3f) -> vec3f {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

@fragment
fn main(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let linear = textureLoad(accumulated, vec2i(position.xy), 0).rgb * exp2(exposure.x);

    return vec4f(pow(filmic(linear), vec3f(1.0 / 2.2)), 1.0);
}
