#version 300 es
precision highp float;

uniform sampler2D uIn0;
uniform sampler2D uIn1;
uniform vec3 uPaper;
uniform float uFaint;

in vec2 vUv;
out vec4 colour;

// Both layers are premultiplied ink on nothing: the whole figure faintly, then the line drawn so far.
void main() {
    vec4 whole = texture(uIn0, vUv);
    vec4 now = texture(uIn1, vUv);
    vec3 under = uPaper * (1.0 - uFaint * whole.a) + uFaint * whole.rgb;

    colour = vec4(under * (1.0 - now.a) + now.rgb, 1.0);
}
