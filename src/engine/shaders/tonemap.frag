#version 300 es
precision highp float;

uniform sampler2D uIn0;
uniform float uExposure;

in vec2 vUv;
out vec4 colour;

// ACES, fitted by Narkowicz: highlights roll off instead of clipping to white.
vec3 filmic(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
    vec3 linear = texture(uIn0, vUv).rgb * exp2(uExposure);
    colour = vec4(pow(filmic(linear), vec3(1.0 / 2.2)), 1.0);
}
