// k1: bass
// k2: arpeggio
// k3: melody
// k4: drums

fn plate(p: vec2f, n: f32, m: f32) -> f32 {
    return cos(n * PI * p.x) * cos(m * PI * p.y) - cos(m * PI * p.x) * cos(n * PI * p.y);
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let note = floor(k3 * 12.0 + 0.5);
    let n = 1.0 + floorMod(note, 4.0);
    let m = n + 1.0 + floorMod(floor(note / 4.0), 3.0);
    let p = vec2f(x, y) * (1.0 + 0.12 * k4);
    let r = length(p);
    let figure = plate(p, n, m);
    // 32.0 * PI * t: sixteen rings a loop, one for every beat of the ground bass.
    let ring = sin(9.0 * r - 32.0 * PI * t);
    let z = figure * (0.04 + 0.16 * k2) + ring * 0.12 * k1 * exp(-r);
    let tint = 0.35 + 0.35 * clamp(k3 / 1.4, 0.0, 1.0) + 0.12 * abs(figure) + 0.15 * k2;

    return vec4f(p, z, tint);
}

fn camera(t: f32) -> Camera {
    let a = 2.0 * PI * t;

    return Camera(vec3f(4.4 * sin(a), -4.4 * cos(a), 4.0), vec3f(0.0), vec3f(0.0, 0.0, 1.0));
}
