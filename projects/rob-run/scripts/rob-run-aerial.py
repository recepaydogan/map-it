
"""Render overhead geometry and Unity albedo textures from the installed game."""
import re
from functools import lru_cache

import moderngl
import numpy as np
from PIL import Image
from UnityPy.helpers.MeshHelper import MeshHandler


DEPENDENCY_PATTERNS = (
    "shared-environment-*_assets_all.bundle",
    "environment*_assets_all.bundle",
    "shared-global_assets_all.bundle",
    "shared-characters_assets_all.bundle",
    "location-city-data_assets_all.bundle",
    "space-global_assets_all.bundle",
    "space-battle_assets_all.bundle",
    "scriptableobjects_assets_all.bundle",
    "*_unitybuiltinassets.bundle",
)
HIDDEN_MESH = re.compile(r"shadow|lightbarrier|godrays|trigger|collision|decal|water|invisible|occlusion|cubemap|imposter", re.I)
HIDDEN_ROOT = re.compile(r"minimap|mapmeshview|preview|lighting", re.I)
SHADER = dict(
    vertex_shader="""
        #version 330
        uniform mat4 model;
        uniform vec4 bounds;
        uniform vec2 terrain;
        in vec3 position;
        in vec2 texcoord;
        out vec3 world;
        out vec2 uv;
        void main() {
            world = (model * vec4(position, 1.0)).xyz;
            uv = terrain.y > 0.0 ? (world.xz + terrain.x) / terrain.y : texcoord;
            gl_Position = vec4((world.xz - bounds.xy) / bounds.zw * 2.0 - 1.0,
                               -world.y / 300.0, 1.0);
        }
    """,
    fragment_shader="""
        #version 330
        uniform sampler2D albedo;
        uniform vec4 tint;
        uniform vec4 texture_transform;
        uniform float cutoff;
        uniform vec2 terrain;
        uniform vec4 cutaway;
        uniform float cutaway_height;
        in vec3 world;
        in vec2 uv;
        out vec4 color;
        void main() {
            if (world.y > cutaway_height && all(greaterThanEqual(world.xz, cutaway.xy))
                && all(lessThanEqual(world.xz, cutaway.zw))) discard;
            vec4 sample_color = texture(albedo, uv * texture_transform.xy + texture_transform.zw) * tint;
            if (sample_color.a < cutoff) discard;
            vec3 surface = normalize(cross(dFdx(world), dFdy(world)));
            float light = terrain.y > 0.0 ? 1.0
                : 0.80 + 0.20 * abs(dot(surface, normalize(vec3(-0.30, 1.0, 0.22))));
            color = vec4(sample_color.rgb * light, 1.0);
        }
    """,
)


def object_key(pointer):
    reader = pointer.deref()
    return reader.assets_file.name, reader.path_id


def render_aerial(scene, bundles, scene_file, image, background, project, *,
                  terrain_name="terrainLOD_base", cutaway=None, extra_bundles=()):
    terrain = next(reader.read() for reader in scene.objects
                   if reader.type.name == "Material" and reader.peek_name() == terrain_name)
    world = dict(terrain.m_SavedProperties.m_Floats)
    terrain_mapping = world["_SplatMapWorldOffset"], world["_SplatMapWorldSize"]
    terrain_source = dict(terrain.m_SavedProperties.m_TexEnvs)["_BaseMap"]

    for pattern in (*DEPENDENCY_PATTERNS, *extra_bundles):
        for bundle in bundles.glob(pattern):
            scene.load_file(str(bundle))

    scene_meshes = (reader for reader in scene_file.objects.values() if reader.type.name == "MeshRenderer")

    ctx = moderngl.create_standalone_context(require=330)
    framebuffer = ctx.simple_framebuffer(image.size, components=4)
    framebuffer.use()
    framebuffer.clear(0, 0, 0, 0)
    ctx.enable(moderngl.DEPTH_TEST)
    ctx.depth_func = "<="
    program = ctx.program(**SHADER)
    x0, north0 = project(0, 0)
    x1, north1 = project(1, 1)
    scale_x, scale_z = x1 - x0, north0 - north1
    program["bounds"].value = (-x0 / scale_x, (north0 - image.height) / scale_z,
                               image.width / scale_x, image.height / scale_z)
    program["cutaway"].value = cutaway[:4] if cutaway else (0, 0, 0, 0)
    program["cutaway_height"].value = cutaway[4] if cutaway else 300
    white = ctx.texture((1, 1), 4, bytes([255] * 4))
    program["albedo"].value = 0

    transforms = {}
    objects = {}
    for reader in scene_file.objects.values():
        if reader.type.name == "Transform":
            transform = reader.read()
            transforms[transform.m_GameObject.m_PathID] = transform
        elif reader.type.name == "GameObject":
            objects[reader.path_id] = reader

    @lru_cache(maxsize=None)
    def active_transform(actor_id):
        actor = objects[actor_id].read()
        if not actor.m_IsActive or HIDDEN_ROOT.search(actor.m_Name):
            return None
        transform = transforms[actor_id]
        position, scale, rotation = transform.m_LocalPosition, transform.m_LocalScale, transform.m_LocalRotation
        x, y, z, w = rotation.x, rotation.y, rotation.z, rotation.w
        matrix = np.eye(4, dtype="f4")
        matrix[:3, :3] = np.array([
            [1 - 2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
            [2*(x*y+z*w), 1 - 2*(x*x+z*z), 2*(y*z-x*w)],
            [2*(x*z-y*w), 2*(y*z+x*w), 1 - 2*(x*x+y*y)],
        ], dtype="f4") * [scale.x, scale.y, scale.z]
        matrix[:3, 3] = position.x, position.y, position.z
        if not transform.m_Father:
            return matrix
        parent = active_transform(transform.m_Father.read().m_GameObject.m_PathID)
        return None if parent is None else parent @ matrix

    unused_lod_renderers = set()
    for reader in scene_file.objects.values():
        if reader.type.name != "LODGroup":
            continue
        lods = reader.read().m_LODs
        for lod in lods[1:]:
            unused_lod_renderers.update(renderer.renderer.m_PathID for renderer in lod.renderers)

    mesh_cache = {}
    texture_cache = {}
    materials = {}
    rendered = 0
    omitted_materials = set()

    for reader in scene_meshes:
        if reader.path_id in unused_lod_renderers:
            continue
        renderer = reader.read()
        actor_id = renderer.m_GameObject.m_PathID
        if not renderer.m_Enabled or actor_id not in transforms:
            continue
        actor = objects[actor_id].read()
        if HIDDEN_MESH.search(actor.m_Name) or not renderer.m_Materials:
            continue
        matrix = active_transform(actor_id)
        if matrix is None:
            continue
        mesh_pointers = (entry.component for entry in actor.m_Component if entry.component.type.name == "MeshFilter")
        mesh_filter = next(mesh_pointers, None)
        if mesh_filter is None:
            continue
        mesh_pointer = mesh_filter.read().m_Mesh
        if not mesh_pointer:
            continue
        try:
            mesh_key = object_key(mesh_pointer)
        except (FileNotFoundError, KeyError):
            continue
        if mesh_key not in mesh_cache:
            mesh = MeshHandler(mesh_pointer.read())
            mesh.process()
            positions = np.asarray(mesh.m_Vertices, dtype="f4")
            if not len(positions):
                continue
            uv = np.asarray(mesh.m_UV0, dtype="f4")[:, :2] if mesh.m_UV0 is not None and len(mesh.m_UV0) else np.zeros((len(positions), 2), dtype="f4")
            geometry = ctx.buffer(np.c_[positions, uv].tobytes())
            vaos = []
            for triangles in mesh.get_triangles():
                if len(triangles):
                    indices = ctx.buffer(np.asarray(triangles, dtype="u4").tobytes())
                    vaos.append(ctx.vertex_array(program, [(geometry, "3f 2f", "position", "texcoord")], indices))
                else:
                    vaos.append(None)
            mesh_cache[mesh_key] = (positions.min(0), positions.max(0), vaos)
        low, high, vaos = mesh_cache[mesh_key]
        center = matrix[:3, :3] @ ((high + low) / 2) + matrix[:3, 3]
        radius = np.abs(matrix[:3, :3]) @ ((high - low) / 2)
        x, y = project(center[0], center[2])
        if (x + radius[0]*scale_x < 0 or x - radius[0]*scale_x >= image.width
                or y + radius[2]*scale_z < 0 or y - radius[2]*scale_z >= image.height
                or center[1] + radius[1] < -1):
            continue
        program["model"].write(matrix.T.copy().tobytes())
        for vao, material_pointer in zip(vaos, renderer.m_Materials):
            if vao is None or not material_pointer:
                continue
            try:
                key = object_key(material_pointer)
            except (KeyError, FileNotFoundError):
                omitted_materials.add(material_pointer.m_PathID)
                continue
            if key not in materials:
                material = material_pointer.read()
                properties = material.m_SavedProperties
                textures, colors, floats = map(dict, (properties.m_TexEnvs, properties.m_Colors, properties.m_Floats))
                is_terrain = material.m_Name in {
                    "terrain_base", "DesertTerrain", terrain_name,
                }
                base = terrain_source if is_terrain else next((textures[name] for name in (
                    "_BaseMap", "_MainTex", "_Side1BaseMap", "_Layer0BaseMap",
                ) if name in textures and textures[name].m_Texture), None)
                tint = colors.get("_BaseColor") or colors.get("_Color")
                color = (tint.r, tint.g, tint.b, 1) if tint else (0.83, 0.84, 0.85, 1)
                tex, tex_transform = white, (1, 1, 0, 0)
                if base and base.m_Texture:
                    try:
                        tk = object_key(base.m_Texture)
                        if tk not in texture_cache:
                            source = base.m_Texture.read().image.convert("RGBA")
                            source.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
                            source = source.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
                            texture = ctx.texture(source.size, 4, source.tobytes())
                            texture.build_mipmaps()
                            texture_cache[tk] = texture
                        tex = texture_cache[tk]
                        tex_transform = (base.m_Scale.x, base.m_Scale.y, base.m_Offset.x, base.m_Offset.y)
                        if tint is None:
                            color = (1, 1, 1, 1)
                    except (ValueError, KeyError, FileNotFoundError, NotImplementedError):
                        pass
                world_texture = terrain_mapping if is_terrain else (0, 0)
                alpha_clip = any(floats.get(flag, 0) > 0.5 for flag in ("_AlphaClip", "_AlphaClipping", "_AlphaTest"))
                cutoff = floats.get("_Cutoff", 0.5) if alpha_clip else 0.0
                if world_texture[1] > 0:
                    cutoff = 0.3
                    tex.repeat_x = tex.repeat_y = False
                materials[key] = tex, tex_transform, color, cutoff, world_texture
            tex, tex_transform, color, cutoff, world_texture = materials[key]
            tex.use(0)
            program["texture_transform"].value = tex_transform
            program["tint"].value = color
            program["cutoff"].value = cutoff
            program["terrain"].value = world_texture
            vao.render(moderngl.TRIANGLES)
            rendered += 1

    source = Image.frombytes("RGBA", image.size, framebuffer.read(components=4)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    composite = Image.new("RGBA", image.size, background)
    offset, size = terrain_mapping
    albedo = terrain_source.m_Texture.read().image.convert("RGBA")
    left, top = project(-offset, size-offset)
    u = albedo.width / (size*scale_x)
    v = albedo.height / (size*scale_z)
    composite.alpha_composite(albedo.transform(image.size, Image.Transform.AFFINE,
        (u, 0, -left*u, 0, v, -top*v), Image.Resampling.BICUBIC))
    composite.alpha_composite(source)
    print(f"{scene_file.name}: {rendered} rendered submeshes, {len(omitted_materials)} unresolved materials.", flush=True)
    if rendered < 100:
        raise ValueError(f"Too little scene geometry resolved from {scene_file.name}")
    result = composite.convert("RGB")
    framebuffer.release()
    ctx.release()
    return result

