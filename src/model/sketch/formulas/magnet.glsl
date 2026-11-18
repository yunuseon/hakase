#define K1 reach
#define K2 pull
#define K3 rings
#define K4 hue

vec4 formula(float x, float y, float t) {
    vec2 here = vec2(x, y);
    vec2 toward = pointer - here;
    float reach = 0.15 + 0.6 * k1;
    float pull = exp(-dot(toward, toward) / (reach * reach)) * k2 * 0.8 * (1.0 + pointerDown);
    float rings = 0.5 + 0.5 * sin(length(toward) * (6.0 + 30.0 * k3) - t * 2.0 * PI);
    float depth = 0.25 + 0.75 * mix(rings, 1.0, pull);
    float tint = 0.65 + 0.35 * sin(atan(toward.y, toward.x) + 2.0 * PI * k4);

    return vec4(here + toward * pull, depth, tint);
}
