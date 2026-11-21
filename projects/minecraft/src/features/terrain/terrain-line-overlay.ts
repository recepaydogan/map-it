import type { OrbitCamera, Point3 } from "./orbit-camera.ts";

const MAX_PATHS = 4_096;
const MAX_POINTS = 4_096;
const FLOATS_PER_VERTEX = 7;
const VERTICES_PER_SEGMENT = 6;

export interface TerrainLineOverlay {
  paths: readonly (readonly Point3[])[];
  points: number;
  segments: number;
  gpuBytes: number;
}

export interface TerrainLineOverlayGpu {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  count: number;
  uploadedTarget: Point3 | null;
}

type LineColor = readonly [number, number, number, number];
export interface TerrainLineOverlayStyle {
  readonly outerWidth: number;
  readonly innerWidth: number;
  readonly outerColor: LineColor;
  readonly innerColor: LineColor;
  readonly depthBias: number;
}

export const DEFAULT_TERRAIN_LINE_STYLE: TerrainLineOverlayStyle = Object.freeze({
  outerWidth: 3, innerWidth: 1.5, outerColor: [0.04, 0.04, 0.03, 0.82] as const,
  innerColor: [0.831, 0.686, 0.216, 0.98] as const, depthBias: 0.00035,
});

const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aOther;
layout(location=2) in float aSide;
uniform mat4 uViewProjection;
uniform vec2 uViewport;
uniform float uHalfWidth;
uniform float uDepthBias;
void main() {
  vec4 point = uViewProjection * vec4(aPosition, 1.0);
  vec4 other = uViewProjection * vec4(aOther, 1.0);
  if (point.w <= 0.0 || other.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 direction = (other.xy / other.w - point.xy / point.w) * uViewport;
  float lengthPixels = length(direction);
  if (lengthPixels < 0.001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 normal = vec2(-direction.y, direction.x) / lengthPixels;
  vec2 offset = normal * aSide * uHalfWidth * 2.0 / uViewport;
  gl_Position = point;
  gl_Position.xy += offset * point.w;
  // Keep a surface route visible without allowing it to pass through nearer blocks.
  gl_Position.z -= uDepthBias * point.w;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 outputColor;
void main() { outputColor = uColor; }`;

const createProgram = (gl: WebGL2RenderingContext) => {
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to allocate terrain line program");
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Unable to allocate terrain line shader");
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(`Terrain line shader failed: ${gl.getShaderInfoLog(shader)}`);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`Terrain line program failed: ${gl.getProgramInfoLog(program)}`);
    return program;
  } catch (error) { gl.deleteProgram(program); throw error; }
  finally { for (const shader of shaders) gl.deleteShader(shader); }
};

export const prepareTerrainLineOverlay = (paths: readonly (readonly Point3[])[]): TerrainLineOverlay => {
  if (!Array.isArray(paths) || paths.length > MAX_PATHS) throw new Error("Terrain line paths exceed their limit");
  let points = 0, segments = 0;
  const owned = paths.flatMap(path => {
    if (!Array.isArray(path)) throw new Error("Invalid terrain line path");
    const copy = path.map(point => {
      if (!Array.isArray(point) || point.length !== 3 || point.some(value => !Number.isFinite(value) || Math.abs(value) > 30_000_000))
        throw new Error("Invalid terrain line point");
      return [point[0], point[1], point[2]] as Point3;
    });
    points += copy.length;
    if (points > MAX_POINTS) throw new Error("Terrain line points exceed their limit");
    if (copy.length < 2) return [];
    segments += copy.length - 1;
    return [Object.freeze(copy)];
  });
  return Object.freeze({ paths: Object.freeze(owned), points, segments,
    gpuBytes: segments * VERTICES_PER_SEGMENT * FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT });
};

const writeVertex = (data: Float32Array, offset: number, point: Point3, other: Point3, side: number, target: Point3) => {
  data[offset] = point[0] - target[0]; data[offset + 1] = point[1] - target[1]; data[offset + 2] = point[2] - target[2];
  data[offset + 3] = other[0] - target[0]; data[offset + 4] = other[1] - target[1]; data[offset + 5] = other[2] - target[2];
  data[offset + 6] = side;
};

export const buildTerrainLineVertices = (overlay: TerrainLineOverlay, target: Point3): Float32Array => {
  if (!Array.isArray(target) || target.length !== 3 || target.some(value => !Number.isFinite(value)))
    throw new Error("Invalid terrain line target");
  const data = new Float32Array(overlay.segments * VERTICES_PER_SEGMENT * FLOATS_PER_VERTEX);
  let offset = 0;
  for (const path of overlay.paths) for (let index = 1; index < path.length; index++) {
    const start = path[index - 1], end = path[index];
    for (const [point, other, side] of [[start, end, -1], [start, end, 1], [end, start, 1],
      [end, start, 1], [start, end, 1], [end, start, -1]] as const) {
      writeVertex(data, offset, point, other, side, target); offset += FLOATS_PER_VERTEX;
    }
  }
  return data;
};

export const createTerrainLineOverlayGpu = (gl: WebGL2RenderingContext, overlay: TerrainLineOverlay): TerrainLineOverlayGpu => {
  const program = createProgram(gl), vao = gl.createVertexArray(), buffer = gl.createBuffer();
  if (!vao || !buffer) {
    gl.deleteVertexArray(vao); gl.deleteBuffer(buffer); gl.deleteProgram(program);
    throw new Error("Unable to allocate terrain line geometry");
  }
  try {
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, overlay.gpuBytes, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 3 * 4);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 6 * 4);
    gl.bindVertexArray(null);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("Terrain line allocation failed");
    return { program, vao, buffer, count: overlay.segments * VERTICES_PER_SEGMENT, uploadedTarget: null };
  } catch (error) {
    gl.deleteVertexArray(vao); gl.deleteBuffer(buffer); gl.deleteProgram(program); throw error;
  }
};

export const deleteTerrainLineOverlayGpu = (gl: WebGL2RenderingContext, resource: TerrainLineOverlayGpu): void => {
  gl.deleteVertexArray(resource.vao); gl.deleteBuffer(resource.buffer); gl.deleteProgram(resource.program);
};

export const drawTerrainLineOverlay = (gl: WebGL2RenderingContext, resource: TerrainLineOverlayGpu,
  overlay: TerrainLineOverlay, camera: OrbitCamera, viewProjection: Float32Array, pixelWidth: number, pixelHeight: number,
  cssWidth: number, style: TerrainLineOverlayStyle = DEFAULT_TERRAIN_LINE_STYLE): void => {
  const colors = [...style.outerColor, ...style.innerColor];
  if (![style.outerWidth, style.innerWidth, style.depthBias, ...colors].every(Number.isFinite) ||
    style.outerWidth <= 0 || style.innerWidth <= 0 || style.innerWidth > style.outerWidth || style.depthBias < 0 ||
    colors.some(value => value < 0 || value > 1)) throw new Error("Invalid terrain line style");
  if (!resource.uploadedTarget || resource.uploadedTarget.some((value, index) => value !== camera.target[index])) {
    const vertices = buildTerrainLineVertices(overlay, camera.target);
    gl.bindBuffer(gl.ARRAY_BUFFER, resource.buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    resource.uploadedTarget = [...camera.target];
  }
  try {
    gl.useProgram(resource.program); gl.bindVertexArray(resource.vao);
    gl.uniformMatrix4fv(gl.getUniformLocation(resource.program, "uViewProjection"), false, viewProjection);
    gl.uniform2f(gl.getUniformLocation(resource.program, "uViewport"), pixelWidth, pixelHeight);
    gl.uniform1f(gl.getUniformLocation(resource.program, "uDepthBias"), style.depthBias);
    const scale = pixelWidth / cssWidth;
    gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const [halfWidth, color] of [[style.outerWidth * scale, style.outerColor], [style.innerWidth * scale, style.innerColor]] as const) {
      gl.uniform1f(gl.getUniformLocation(resource.program, "uHalfWidth"), halfWidth);
      gl.uniform4f(gl.getUniformLocation(resource.program, "uColor"), color[0], color[1], color[2], color[3]);
      gl.drawArrays(gl.TRIANGLES, 0, resource.count);
    }
  } finally {
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.depthFunc(gl.LESS); gl.bindVertexArray(null);
  }
};
