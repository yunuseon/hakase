#version 300 es
precision highp float;

uniform sampler2D uIn0;

in vec2 vUv;
out vec4 colour;

void main() {
    colour = vec4(texture(uIn0, vUv).rgb, 1.0);
}
