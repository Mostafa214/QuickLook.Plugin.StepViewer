# ADR 0002: Dual-Tier IndexedDB Caching (Geometry & WASM Bytecode)

## Status
Accepted

## Context
Compiling OpenCASCADE's 7.7 MB C++ WebAssembly module takes 400–800ms of CPU time on each initial spacebar launch. Parsing large multi-body CAD files (e.g., 20+ MB assemblies) into Three.js buffer geometries takes 1.5–3 seconds.
Because QuickLook windows are opened and closed frequently during file exploration, repeating these operations on every preview damages the snappy, instant Spacebar experience.

## Decision
Implement a dual-tier persistence strategy using browser IndexedDB (`cad_cache_db`):
1. **Tier 1: WebAssembly Bytecode Caching**:
   - On first run, compile the WASM binary using `WebAssembly.compile()`.
   - Store the compiled `WebAssembly.Module` object directly in IndexedDB.
   - On subsequent launches, retrieve the compiled module and instantiate it with `WebAssembly.instantiate(module, imports)`. This completely skips the JIT compilation phase.
2. **Tier 2: Geometry Hash Caching**:
   - Compute a cache key based on file name, file size, and schema version (`<fileName>_<fileSize>_v4`).
   - Cache serialized vertex position, normal, color, and edge index buffers in IndexedDB.
   - On cache hit, bypass OpenCASCADE B-Rep parsing entirely and load Three.js meshes directly in < 100ms.

## Consequences
### Positive
- Sub-120ms instant preview for previously opened files.
- Reduces CPU heating and memory churn when rapidly navigating files in Windows Explorer.

### Negative
- Local IndexedDB storage footprint is increased (typically a few megabytes per unique CAD model). Cache auto-purging or version bumps invalidate stale buffers safely.
