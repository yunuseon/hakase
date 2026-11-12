#version 300 es
precision highp float;

uniform sampler2D uIn0;
uniform int uFactor;

out vec4 colour;

// A true area average of each factor x factor block: bilinear sampling would skip most of the pixels.
void main() {
    ivec2 base = ivec2(gl_FragCoord.xy) * uFactor;
    vec3 sum = vec3(0.0);
    for (int y = 0; y < uFactor; y++) {
        for (int x = 0; x < uFactor; x++) {
            sum += texelFetch(uIn0, base + ivec2(x, y), 0).rgb;
        }
    }
    colour = vec4(sum / float(uFactor * uFactor), 1.0);
}
