import { VERTEX_FLOATS } from "./terrain-draw-data.ts";
import type { TerrainTextureArray } from "./terrain-draw-data.ts";

const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aTexture;
layout(location=3) in vec3 aTint;
layout(location=4) in float aFlags;
uniform mat4 uViewProjection;
uniform vec3 uOffset;
out vec3 vNormal;
out vec3 vTexture;
out vec3 vTint;
flat out int vFlags;
void main() {
  gl_Position = uViewProjection * vec4(aPosition + uOffset, 1.0);
  vNormal = aNormal; vTexture = aTexture; vTint = aTint; vFlags = int(aFlags);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec3 vNormal;
in vec3 vTexture;
in vec3 vTint;
flat in int vFlags;
uniform sampler2DArray uTextures;
out vec4 outputColor;
void main() {
  vec4 texel = texture(uTextures, vec3(vTexture.x, 1.0 - vTexture.y, vTexture.z));
  if (texel.a < 0.5) discard;
  // Directional preview shading; actual game light levels belong to the lighting adapter.
  float shade = 0.65 + 0.35 * max(dot(normalize(vNormal), normalize(vec3(0.4, 0.8, 0.3))), 0.0);
  vec3 color = texel.rgb * vTint * shade;
  if ((vFlags & 1) != 0 && mod(gl_FragCoord.x + gl_FragCoord.y, 12.0) < 3.0) color *= 0.45;
  if ((vFlags & 2) != 0) color = min(vec3(1.0), color * 1.12);
  outputColor = vec4(color, 1.0);
}`;

export const createTerrainProgram = (gl: WebGL2RenderingContext): WebGLProgram => {
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to allocate terrain program");
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Unable to allocate terrain shader");
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Terrain shader failed: ${gl.getShaderInfoLog(shader)}`);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Terrain program failed: ${gl.getProgramInfoLog(program)}`);
    return program;
  } catch (error) { gl.deleteProgram(program); throw error; }
  finally { for (const shader of shaders) gl.deleteShader(shader); }
};

export const createTerrainTextures = (gl: WebGL2RenderingContext, data: TerrainTextureArray): WebGLTexture => {
  if (data.size > gl.getParameter(gl.MAX_TEXTURE_SIZE) || data.layers > gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS))
    throw new Error("Terrain textures exceed graphics capabilities");
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to allocate terrain textures");
  try {
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, data.size, data.size, data.layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, data.rgba);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // Pixel-art minification selects one nearest mip level; never blend between levels into a soft terrain image.
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("Terrain texture upload failed");
    return texture;
  } catch (error) { gl.deleteTexture(texture); throw error; }
};

export interface TerrainGpuMesh { vao: WebGLVertexArrayObject; vertices: WebGLBuffer; indices: WebGLBuffer; count: number }
export const deleteTerrainGpuMesh = (gl: WebGL2RenderingContext, mesh: TerrainGpuMesh): void => {
  gl.deleteVertexArray(mesh.vao); gl.deleteBuffer(mesh.vertices); gl.deleteBuffer(mesh.indices);
};

export const createTerrainGpuMesh = (gl: WebGL2RenderingContext, data: Float32Array, indices: Uint32Array): TerrainGpuMesh => {
  const vao = gl.createVertexArray(), vertices = gl.createBuffer(), indexBuffer = gl.createBuffer();
  if (!vao || !vertices || !indexBuffer) {
    gl.deleteVertexArray(vao); gl.deleteBuffer(vertices); gl.deleteBuffer(indexBuffer);
    throw new Error("Unable to allocate terrain geometry");
  }
  const mesh = { vao, vertices, indices: indexBuffer, count: indices.length };
  try {
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    for (const [location, size, offset] of [[0, 3, 0], [1, 3, 3], [2, 3, 6], [3, 3, 9], [4, 1, 12]]) {
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, VERTEX_FLOATS * 4, offset * 4);
    }
    gl.bindVertexArray(null);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("Terrain geometry upload failed");
    return mesh;
  } catch (error) { deleteTerrainGpuMesh(gl, mesh); throw error; }
};
