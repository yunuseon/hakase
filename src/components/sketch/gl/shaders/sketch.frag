#version 300 es
precision highp float;

uniform sampler2D uPalette;

in float vDepth;
in float vPointSize;

out vec4 fragColor;

void main() {
    float dist = length(gl_PointCoord - 0.5) * 2.0;
    float aa = 2.0 / max(vPointSize, 1.0);
    float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, dist);

    if (alpha <= 0.0) {
        discard;
    }

    vec3 color = texture(uPalette, vec2(clamp(vDepth, 0.0, 1.0), 0.5)).rgb;

    fragColor = vec4(color * alpha, alpha);
}
