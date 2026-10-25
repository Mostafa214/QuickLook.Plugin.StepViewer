# ADR 0004: Two-Pass Stencil Buffer Section Capping & 3D Ray-Drag

## Status
Accepted

## Context
When inspecting internal assemblies or wall thicknesses, cutting planes are used. Standard OpenGL/WebGL clipping planes discard fragments behind the plane, exposing hollow interior shells because CAD boundary meshes have zero wall thickness and culled backfaces.

## Decision
1. **Multi-Pass Stencil Capping**:
   - Enable `renderer.localClippingEnabled = true`.
   - Pass 1: Render backfaces with the clipping plane, incrementing the GPU stencil buffer on Z-pass.
   - Pass 2: Render frontfaces with the clipping plane, decrementing the GPU stencil buffer on Z-pass.
   - Pass 3: Render a planar cap geometry coincident with the section plane, masked to pixels where `stencilFunc = NotEqual(0)`. Shade with a solid dark slate material (`#1e293b`).
2. **Interactive 3D Arrow Gizmo**:
   - Provide an in-viewport 3D arrow mesh aligned with the section normal $\vec{n}$.
   - To prevent cursor slip and jitter during dragging, construct an invisible mathematical drag plane facing the camera. Raycast against this plane and compute the 1D dot-product projection along $\vec{n}$ to adjust the clipping constant $d$.

## Consequences
### Positive
- Solid, watertight cross-sections without hollow polygon artifacts.
- Fluid, intuitive direct-manipulation 3D interaction matching commercial CAD software.

### Negative
- Increases draw calls when section view is active due to stencil pre-passes.
