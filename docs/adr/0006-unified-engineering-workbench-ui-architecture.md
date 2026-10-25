# ADR 0006: Unified Engineering Workbench UI Architecture (v2.0)

## Status
Accepted

## Context
As features were incrementally added (Model Tree, Mass Properties, Section View, Exploded View, Color/Material Picker, High-DPI Export, Auto-Updater), multiple independent floating cards and HUDs were introduced into `Assets/viewer.html`. While highly functional, these independent panels can overlap geometry, compete for screen real estate, and create visual clutter.

A proposal was evaluated to completely tear down and rebuild the entire viewer codebase from scratch.

## Decision
**Reject a full full-stack rewrite** (to protect battle-tested Three.js graphics, OpenCASCADE WASM pipelines, Zero-Copy transfer lists, and WPF WebView2 virtual host bindings from regression).

**Adopt a Modular UI Evolution (Unified Engineering Workbench)**:
1. **Floating Command Dock (Bottom Center)**:
   - A single, compact frosted glassmorphism pill (`backdrop-filter: blur(20px)`) housing all tool triggers with clear hotkey labels (`[T]`, `[M]`, `[S]`, `[X]`, `[P]`).
   - Active tool indicated by a subtle glowing cyan/cobalt indicator pill.
2. **Unified Collapsible Inspector Drawer (Right Side)**:
   - Consolidate all independent property panels (Assembly Tree, Smart Measure readouts, Physical Properties, PBR Materials) into a single, docked right-hand drawer with smooth CSS spring transitions.
   - Tabs allow switching contexts cleanly. Pressing `ESC` or clicking in the 3D space collapses the drawer, preserving 90%+ unobstructed viewport area.
3. **Interactive 3D ViewCube / NavCube (Top Right)**:
   - A 3D isometric navigation cube synchronized with the main camera.
   - Clicking faces (`TOP`, `FRONT`, `RIGHT`, `ISO`) triggers smooth quaternion slerp camera tweening to standard orthographic and isometric perspectives.

## Consequences
### Positive
- Delivers an elite, cohesive Linear / Shapr3D aesthetic.
- Zero risk to the underlying 3D CAD kernel, WASM caching, or IPC stability.
- Maximizes visible viewport space for mechanical inspection.

### Negative
- Requires refactoring `viewer.html` CSS classes and JavaScript UI event binders to route through the new Dock and Drawer controllers.
