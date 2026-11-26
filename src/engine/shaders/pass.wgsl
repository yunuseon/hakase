struct Settings {
    knobs: array<vec4f, 2>,
    resolution: vec2f,
    direction: vec2f,
    paper: vec4f,
    choice: i32,
    factor: i32,
    exposure: f32,
    spare: f32,
};

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(1) var in0: texture_2d<f32>;
@group(0) @binding(2) var in1: texture_2d<f32>;
@group(0) @binding(3) var previous: texture_2d<f32>;
@group(0) @binding(4) var palette: texture_2d<f32>;
@group(0) @binding(5) var bilinear: sampler;
@group(0) @binding(6) var nearest: sampler;

struct Varying {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

const TAU = 6.28318530718;

// One triangle that covers the target: no buffers, the corner comes from the vertex index.
@vertex
fn fullscreen(@builtin(vertex_index) id: u32) -> Varying {
    let corner = vec2f(f32((id << 1u) & 2u), f32(id & 2u));

    return Varying(vec4f(corner * 2.0 - 1.0, 0.0, 1.0), corner);
}

// The passes reckon with y up; a texture keeps its top row first.
fn at(uv: vec2f) -> vec2f {
    return vec2f(uv.x, 1.0 - uv.y);
}

fn knob(index: i32) -> f32 {
    return settings.knobs[index / 4][index % 4];
}

fn floorMod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}
