#include "generator.h"
#include "finders.h"
#include "engine-build-config.h"
#include <stdint.h>
#include <stdlib.h>

/* One instance belongs to one worker. All output is bounded and caller-copied. */
static Generator generator;
static SurfaceNoise surface_noise;
static int initialized = 0;
static int *output = NULL;
static int output_length = 0;
static float *height_output = NULL;
static int height_output_length = 0;
static const int profiles[] = ENGINE_PROFILE_CODES;
static const uint32_t profile_flags[] = ENGINE_PROFILE_FLAGS;
#define ENGINE_STRONGHOLD (-1)
#define ENGINE_UNSUPPORTED_STRUCTURE (-2)
#define ENGINE_DENSE_REGION_SIZE 16
static const int structures[] = ENGINE_STRUCTURE_TYPES;
static Pos structure_position;
#ifdef ENGINE_JAVA
static Pos stronghold_positions[128];
static int stronghold_count = 0;
static int strongholds_loaded = 0;

static void load_strongholds(void) {
    if (strongholds_loaded || generator.dim != 0) return;
    StrongholdIter iterator;
    initFirstStronghold(&iterator, generator.mc, generator.seed);
    for (int index = 0; index < 128; index++) {
        nextStronghold(&iterator, &generator);
        stronghold_positions[stronghold_count++] = iterator.pos;
    }
    strongholds_loaded = 1;
}
#endif

int engine_profile_count(void) { return sizeof(profiles) / sizeof(profiles[0]); }
void engine_release(void) {
    free(output); output = NULL; output_length = 0;
    free(height_output); height_output = NULL; height_output_length = 0;
    initialized = 0; structure_position = (Pos){0, 0};
#ifdef ENGINE_JAVA
    stronghold_count = 0; strongholds_loaded = 0;
#endif
}
int engine_seed(int profile, int dimension, uint32_t low, uint32_t high) {
    engine_release();
    if (profile < 0 || profile >= engine_profile_count() || dimension < -1 || dimension > 1) return 1;
    setupGenerator(&generator, profiles[profile], profile_flags[profile]);
    applySeed(&generator, dimension, ((uint64_t) high << 32) | low);
    if (dimension == 0) initSurfaceNoise(&surface_noise, dimension, generator.seed);
    initialized = 1;
    return 0;
}
static int valid_position(int scale, int x, int y, int z) {
    if (scale != 1 && scale != 4 && scale != 16 && scale != 64 && scale != 256) return 0;
    return (int64_t)x * scale >= -30000000 && (int64_t)x * scale <= 30000000 &&
        (int64_t)z * scale >= -30000000 && (int64_t)z * scale <= 30000000 && y >= -2048 && y <= 2048;
}
int engine_biome(int scale, int x, int y, int z) {
    if (!initialized || (scale != 1 && scale != 4) || !valid_position(scale, x, y, z)) return -1;
    return getBiomeAt(&generator, scale, x, y, z);
}
int engine_generate(int scale, int x, int z, int width, int height, int y) {
    free(output); output = NULL; output_length = 0;
    if (!initialized || width < 1 || width > 256 || height < 1 || height > 256 ||
        !valid_position(scale, x, y, z) || (int64_t)x + width > INT32_MAX || (int64_t)z + height > INT32_MAX ||
        !valid_position(scale, x + width - 1, y, z + height - 1) || (scale == 256 && generator.dim != 0)) return 1;
    Range range = { scale, x, z, width, height, y, 1 };
    size_t count = getMinCacheSize(&generator, scale, width, 1, height);
    if (count < (size_t)(width * height) || count > 4 * 1024 * 1024) return 2;
    output = malloc(count * sizeof(int));
    if (!output) return 3;
    if (genBiomes(&generator, output, range)) { free(output); output = NULL; return 4; }
    output_length = width * height;
    return 0;
}
int engine_output_pointer(void) { return (int)(uintptr_t)output; }
int engine_output_length(void) { return output_length; }

static int floor_div4(int64_t value) {
    return value >= 0 ? (int)(value / 4) : -(int)((-value + 3) / 4);
}

static int floor_mod4(int64_t value) {
    int quotient = floor_div4(value);
    return (int)(value - (int64_t)quotient * 4);
}

static int approximate_height_at_quart(int x, int z, float *value) {
    return mapApproxHeight(value, NULL, &generator, &surface_noise, x, z, 1, 1);
}

/* The upstream approximation lives on a 1:4 lattice; interpolate it for block-detail views. */
static int approximate_height_at_block(int64_t x, int64_t z, float *value) {
    int qx = floor_div4(x), qz = floor_div4(z);
    float dx = floor_mod4(x) / 4.0f, dz = floor_mod4(z) / 4.0f;
    float h00, h10, h01, h11;
    if (approximate_height_at_quart(qx, qz, &h00)) return 1;
    if (dx == 0 && dz == 0) { *value = h00; return 0; }
    if (dx != 0 && approximate_height_at_quart(qx + 1, qz, &h10)) return 1;
    if (dz != 0 && approximate_height_at_quart(qx, qz + 1, &h01)) return 1;
    if (dx == 0) { *value = h00 + (h01 - h00) * dz; return 0; }
    if (dz == 0) { *value = h00 + (h10 - h00) * dx; return 0; }
    if (approximate_height_at_quart(qx + 1, qz + 1, &h11)) return 1;
    float north = h00 + (h10 - h00) * dx;
    float south = h01 + (h11 - h01) * dx;
    *value = north + (south - north) * dz;
    return 0;
}

/*
 * Approximate Overworld surface height on the same cell lattice as a biome
 * tile. A one-cell border is included so the caller can derive centered
 * gradients without lighting seams between independently generated tiles.
 */
int engine_generate_heights(int scale, int x, int z, int width, int height) {
    free(height_output); height_output = NULL; height_output_length = 0;
    if (!initialized || generator.dim != 0 || (scale != 1 && scale != 4 && scale != 16 && scale != 64 && scale != 256) ||
        width < 1 || width > 256 || height < 1 || height > 256 ||
        !valid_position(scale, x, 0, z) || (int64_t)x + width > INT32_MAX || (int64_t)z + height > INT32_MAX ||
        !valid_position(scale, x + width - 1, 0, z + height - 1)) return 1;
    int padded_width = width + 2, padded_height = height + 2;
    size_t count = (size_t)padded_width * padded_height;
    height_output = malloc(count * sizeof(float));
    if (!height_output) return 2;
    /* Batch the two common detail scales. This removes tens of thousands of C call/setup cycles per tile. */
    if (scale == 4 && x > -7500000 && z > -7500000 && (int64_t)x + width < 7500000 && (int64_t)z + height < 7500000) {
        if (mapApproxHeight(height_output, NULL, &generator, &surface_noise,
            x - 1, z - 1, padded_width, padded_height)) {
            free(height_output); height_output = NULL; return 3;
        }
        height_output_length = (int)count;
        return 0;
    }
    if (scale == 1 && x > -29999996 && z > -29999996 && (int64_t)x + width < 29999996 && (int64_t)z + height < 29999996) {
        int64_t first_block_x = (int64_t)x - 1, first_block_z = (int64_t)z - 1;
        int64_t last_block_x = (int64_t)x + width, last_block_z = (int64_t)z + height;
        int quart_x = floor_div4(first_block_x), quart_z = floor_div4(first_block_z);
        int quart_width = floor_div4(last_block_x) - quart_x + 2;
        int quart_height = floor_div4(last_block_z) - quart_z + 2;
        size_t quart_count = (size_t)quart_width * quart_height;
        float *quart = malloc(quart_count * sizeof(float));
        if (!quart) { free(height_output); height_output = NULL; return 2; }
        if (mapApproxHeight(quart, NULL, &generator, &surface_noise,
            quart_x, quart_z, quart_width, quart_height)) {
            free(quart); free(height_output); height_output = NULL; return 3;
        }
        for (int row = 0; row < padded_height; row++) for (int column = 0; column < padded_width; column++) {
            int64_t block_x = first_block_x + column, block_z = first_block_z + row;
            int local_x = floor_div4(block_x) - quart_x, local_z = floor_div4(block_z) - quart_z;
            float dx = floor_mod4(block_x) / 4.0f, dz = floor_mod4(block_z) / 4.0f;
            int index = local_z * quart_width + local_x;
            float north = quart[index] + (quart[index + 1] - quart[index]) * dx;
            float south = quart[index + quart_width] + (quart[index + quart_width + 1] - quart[index + quart_width]) * dx;
            height_output[row * padded_width + column] = north + (south - north) * dz;
        }
        free(quart);
        height_output_length = (int)count;
        return 0;
    }
    for (int row = 0; row < padded_height; row++) {
        for (int column = 0; column < padded_width; column++) {
            int64_t cell_x = (int64_t)x + column - 1;
            int64_t cell_z = (int64_t)z + row - 1;
            int64_t block_x = cell_x * scale;
            int64_t block_z = cell_z * scale;
            if (block_x < -30000000) block_x = -30000000;
            if (block_x > 30000000) block_x = 30000000;
            if (block_z < -30000000) block_z = -30000000;
            if (block_z > 30000000) block_z = 30000000;
            float value = 0;
            if (approximate_height_at_block(block_x, block_z, &value)) {
                free(height_output); height_output = NULL;
                return 3;
            }
            height_output[row * padded_width + column] = value;
        }
    }
    height_output_length = (int)count;
    return 0;
}
int engine_height_output_pointer(void) { return (int)(uintptr_t)height_output; }
int engine_height_output_length(void) { return height_output_length; }

int engine_structure_count(void) { return sizeof(structures) / sizeof(structures[0]); }
/* Region size is a property of the exact seeded profile/type/dimension, not a universal 32-chunk grid. */
int engine_region_size(int type) {
    StructureConfig config;
    if (!initialized || type < 0 || type >= engine_structure_count()) return 0;
    if (structures[type] == ENGINE_UNSUPPORTED_STRUCTURE) return 0;
#ifdef ENGINE_JAVA
    if (structures[type] == ENGINE_STRONGHOLD) return generator.dim == 0 ? 32 : 0;
#endif
    if (structures[type] == Mineshaft || structures[type] == Treasure)
        return generator.dim == 0 ? ENGINE_DENSE_REGION_SIZE : 0;
    if (
        !getStructureConfig(structures[type], generator.mc, &config) || config.dim != generator.dim || config.regionSize <= 0) return 0;
    return config.regionSize;
}
/* 0: no attempt, 1: rejected by biome rules, 2: passes biome rules. Neither 1 nor 2 is saved-world observation. */
int engine_structure(int type, int region_x, int region_z) {
    structure_position = (Pos){0, 0};
    int span = engine_region_size(type) * 16;
    if (!span) return -1;
    int64_t x0 = (int64_t)region_x * span, z0 = (int64_t)region_z * span;
    if (x0 > 30000000 || x0 + span - 1 < -30000000 || z0 > 30000000 || z0 + span - 1 < -30000000) return -2;
#ifdef ENGINE_JAVA
    if (structures[type] == ENGINE_STRONGHOLD) {
        load_strongholds();
        for (int index = 0; index < stronghold_count; index++) {
            Pos point = stronghold_positions[index];
            if (point.x >= x0 && point.x < x0 + span && point.z >= z0 && point.z < z0 + span) {
                structure_position = point;
                return 2;
            }
        }
        return 0;
    }
#endif
    if (structures[type] == Mineshaft || structures[type] == Treasure) {
        StructureConfig config;
        if (!getStructureConfig(structures[type], generator.mc, &config) || config.dim != generator.dim ||
            config.regionSize <= 0 || ENGINE_DENSE_REGION_SIZE % config.regionSize) return 0;
        int factor = ENGINE_DENSE_REGION_SIZE / config.regionSize;
        Pos rejected = (Pos){0, 0};
        int has_rejected = 0;
        for (int offset_z = 0; offset_z < factor; offset_z++) {
            for (int offset_x = 0; offset_x < factor; offset_x++) {
                Pos point;
                int base_x = region_x * factor + offset_x, base_z = region_z * factor + offset_z;
                if (!getStructurePos(structures[type], generator.mc, generator.seed, base_x, base_z, &point)) continue;
                if (isViableStructurePos(structures[type], &generator, point.x, point.z, 0)) {
                    structure_position = point;
                    return 2;
                }
                if (!has_rejected) { rejected = point; has_rejected = 1; }
            }
        }
        if (has_rejected) { structure_position = rejected; return 1; }
        return 0;
    }
    Pos point;
    if (!getStructurePos(structures[type], generator.mc, generator.seed, region_x, region_z, &point)) return 0;
    if (point.x < -30000000 || point.x > 30000000 || point.z < -30000000 || point.z > 30000000) return 0;
    structure_position = point;
    return isViableStructurePos(structures[type], &generator, point.x, point.z, 0) ? 2 : 1;
}
int engine_structure_x(void) { return structure_position.x; }
int engine_structure_z(void) { return structure_position.z; }
