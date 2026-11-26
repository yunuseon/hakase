// k1: strength
// k2: falloff
// k4: hue

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let away = vec2f(x, y) - pointer;
    let d = length(away);
    let strength = 1.0 + 4.0 * k1;
    let swirl = strength * exp(-d * (1.0 + 5.0 * k2));
    let angle = atan2(away.y, away.x) + swirl * (1.0 + 0.5 * sin(t * 2.0 * PI));
    let p = pointer + d * vec2f(cos(angle), sin(angle));
    let tint = 0.65 + 0.35 * sin(3.0 * angle + 2.0 * PI * k4);

    return vec4f(p, 0.6 + 0.4 * swirl / strength, tint);
}
