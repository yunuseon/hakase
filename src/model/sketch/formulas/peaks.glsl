#define K1 diagonal

vec4 formula(float x, float y, float t) {
    float phase = t * 2.0 * PI;
    float a = sin(3.0 * PI * x + phase);
    float b = sin(3.0 * PI * y - phase);
    float c = sin(2.0 * PI * (x + y) * (1.0 + 2.0 * k1) + 2.0 * phase);
    float sum = (a + b + c) / 3.0;

    return vec4(x, y, 0.25 + 0.75 * abs(sum), 0.65 + 0.35 * sum);
}
