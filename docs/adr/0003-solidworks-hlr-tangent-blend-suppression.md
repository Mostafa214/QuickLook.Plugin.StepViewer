# ADR 0003: SolidWorks-Grade HLR Edge & Tangent Blend Suppression

## Status
Accepted

## Context
Raw mesh tessellation of B-Rep surfaces produces triangular edges across flat faces, spherical domes, and cylindrical fillets. Standard edge algorithms (e.g., Three.js `EdgesGeometry`) draw wireframe lines across tangent transitions and triangulation boundaries, creating visual noise that distracts engineers inspecting CAD files.

## Decision
In `Assets/stepWorker.js`, implement a geometric filter mirroring SolidWorks' "Tangent Edges Removed" rule:
1. **Solid Manifold Check**: Compute the signed volume of each body. For closed solids ($|V| \ge 10^{-4}$), an edge is only considered a candidate feature line if it bounds two distinct CAD topological faces: `e.f1 >= 0 && e.f2 >= 0 && e.f1 !== e.f2`.
2. **Tangent Blend Suppression**: Calculate the dot product between the surface normals of the two adjacent faces $\vec{n}_1 \cdot \vec{n}_2$.
   - If $\vec{n}_1 \cdot \vec{n}_2 \ge 0.88$ (dihedral angle $\le 28^\circ$), suppress the edge line from rendering.
   - If $\vec{n}_1 \cdot \vec{n}_2 < 0.88$ (sharp step, chamfer, or crease), render a high-contrast mechanical feature line.
3. **Open Shell Preservation**: For open surface sheets (zero thickness quilts), always retain boundary perimeter edges (`faceCount === 1`).

## Consequences
### Positive
- Produces clean, publication-quality mechanical outlines identical to desktop CAD suites.
- Eliminates triangulation seams on cylindrical bosses and spherical caps.

### Negative
- Requires maintaining topological face IDs during tessellation in OpenCASCADE.
