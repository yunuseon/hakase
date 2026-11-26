struct Ink {
    colour: vec4f,
    texel: f32,
    hardness: f32,
    spare: vec2f,
};

@group(0) @binding(0) var<uniform> ink: Ink;

struct Varying {
    @builtin(position) position: vec4f,
    @location(0) local: vec2f,
    @location(1) inner: f32,
    @location(2) reach: f32,
    @location(3) flow: f32,
};

@vertex
fn dab(@builtin(vertex_index) id: u32, @location(0) dab: vec4f) -> Varying {
    let least = 0.5 * ink.texel;
    // Thinner than half a pixel draws fainter rather than clamping, or a size signal could not thin the line.
    let radius = max(dab.z, least);
    let reach = radius + least;
    let corner = vec2f(f32(id & 1u), f32(id >> 1u)) * 2.0 - 1.0;
    let local = corner * reach;
    let at = (dab.xy + local) * 2.0 - 1.0;

    // A stroke's y runs down the picture, and every target keeps its top row first.
    return Varying(
        vec4f(at.x, -at.y, 0.0, 1.0),
        local,
        radius * ink.hardness,
        reach,
        dab.w * min(1.0, dab.z / least),
    );
}

@fragment
fn paint(v: Varying) -> @location(0) vec4f {
    let weight = v.flow * (1.0 - smoothstep(v.inner, v.reach, length(v.local)));

    if (weight <= 0.0) {
        discard;
    }

    return vec4f(ink.colour.rgb * weight, weight);
}
