#define K1 strength
#define K2 falloff
#define K4 hue

vec4 formula(float x, float y, float t) {
    vec2 away = vec2(x, y) - pointer;
    float d = length(away);
    float strength = 1.0 + 4.0 * k1;
    float swirl = strength * exp(-d * (1.0 + 5.0 * k2));
    float angle = atan(away.y, away.x) + swirl * (1.0 + 0.5 * sin(t * 2.0 * PI));
    vec2 p = pointer + d * vec2(cos(angle), sin(angle));
    float tint = 0.65 + 0.35 * sin(3.0 * angle + 2.0 * PI * k4);

    return vec4(p, 0.6 + 0.4 * swirl / strength, tint);
}
