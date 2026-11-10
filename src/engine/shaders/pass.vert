#version 300 es

out vec2 vUv;

// One triangle that covers the target: no buffers, the corner comes from the vertex index.
void main() {
    vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = corner;
    gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
