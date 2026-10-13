# Ubiquitous Domain Glossary (QuickLook STEP Viewer)

This document standardizes all technical, mechanical engineering, and software terminology used across the QuickLook STEP Viewer project.

---

### 1. CAD & Geometric Terminology

* **B-Rep (Boundary Representation):** The CAD mathematical method of representing 3D solid models by their limiting topological surfaces: faces, bounding edges, and vertices.
* **STEP / STP (Standard for the Exchange of Product model data):** ISO 10303 standard for 3D engineering data exchange.
  * **AP203:** Configuration controlled 3D designs of mechanical parts and assemblies.
  * **AP214:** Core data for automotive mechanical design processes (colors, layers, tolerances).
  * **AP242:** Managed model-based 3D engineering (combines AP203 and AP214 with semantic Product and Manufacturing Information).
* **Closed Manifold Solid:** A topologically watertight, fully enclosed 3D solid body. Characterized by zero open boundary edges and a non-zero signed volume ($|V| \ge 10^{-4}\text{ mm}^3$).
* **Open Surface Sheet:** A non-solid surface model (e.g., zero thickness shell or imported quilt) where outer perimeter edges belong to only a single face (`count === 1`).
* **Tangent Blend / Fillet:** A smooth rounded transition surface tangent to adjacent faces ($G^1$ continuity). Under SolidWorks HLR standards ("Tangent Edges Removed"), seams between tangent blends are suppressed from rendering.
* **Dihedral Angle:** The angle between the surface normals of two adjacent faces sharing a common edge.
* **Mechanical Crease / Sharp Feature Edge:** A high-contrast outline drawn where the dihedral angle between adjacent face normals exceeds $28^\circ$ ($\vec{n}_1 \cdot \vec{n}_2 < 0.88$).
* **Discretization Seam / Pole Artifact:** Triangular mesh edges created artificially when parameterizing curved or spherical topologies ($u, v$ coordinate wraps). Suppressed on closed manifold solids.
* **Multi-Body Part:** A single STEP file containing multiple distinct, disjoint solid bodies (e.g., `Hosieni - Nar.stp` containing two interacting mechanical solids).
* **Delta Distance:** The Cartesian components $(\Delta X, \Delta Y, \Delta Z)$ alongside the 3D Euclidean distance $D = \sqrt{\Delta X^2 + \Delta Y^2 + \Delta Z^2}$ measured between two geometric features.
* **Orientation Triad:** The 3D coordinate axis gizmo (Red: X, Green: Y, Blue: Z) tracking camera orientation in real time.

---

### 2. Architecture & Software Stack Terminology

* **QuickLook (QL-Win):** The host open-source Windows application (by Paddy Xu) providing instant spacebar file preview inside Windows Explorer.
* **`QuickLook.Common.dll`:** The host API assembly defining `IViewer`, `ContextObject`, and plugin lifecycle hooks.
* **`.qlplugin`:** The canonical distribution package for QuickLook plugins. A ZIP archive containing `QuickLook.Plugin.Metadata.config`, the .NET assembly DLL, and embedded 3D Web assets.
* **Microsoft Edge WebView2:** The embedded Chromium browser control hosting the HTML5/WebGL canvas inside WPF with hardware-accelerated Direct3D rendering.
* **OpenCASCADE.js (OCCT):** The professional C++ boundary representation CAD kernel compiled into a 7.7 MB WebAssembly binary (`occt-import-js.wasm`).
* **Web Worker (`stepWorker.js`):** The dedicated background thread responsible for compiling OpenCASCADE WebAssembly, parsing STEP files, extracting B-Rep topology, and filtering edges without blocking UI rendering.
* **IndexedDB Geometry Cache:** In-browser persistent key-value storage caching parsed Three.js geometry buffers by hash (`<filename>_<size>_v4`), reducing repeat load times from ~2.2s to under 120ms.
* **Studio Graphite UI:** The dark glassmorphic design system (`#14161b` background, `#38bdf8` cyan accents, subtle 1px border highlights, 60 FPS ease-out animations).
