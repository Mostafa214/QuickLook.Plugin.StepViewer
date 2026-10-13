# QuickLook STEP Viewer — Master Project Specification

## 1. Project Vision & Goals
**QuickLook.Plugin.StepViewer** is an open-source preview plugin for [QuickLook](https://github.com/QL-Win/QuickLook) on Windows. It delivers zero-friction, instant 3D CAD inspection for `.step` and `.stp` models directly in Windows Explorer by simply highlighting a file and pressing **Spacebar**.

### Target Audience
Mechanical engineers, CNC machinists, toolmakers, 3D printing enthusiasts, and CAD designers who frequently inspect downloaded or shared STEP models without waiting 20–45 seconds to launch heavyweight CAD suites (SolidWorks, Autodesk Inventor, Siemens NX, CATIA, PTC Creo).

---

## 2. System Architecture & Tech Stack

```
Windows Explorer (Select .step / .stp file and press Spacebar)
       │
       ▼
QuickLook Host Process (QuickLook.exe)
       │
       ▼
QuickLook.Plugin.StepViewer (C# .NET Framework 4.8 / WPF)
       │  ├── Plugin.cs (IViewer lifecycle, Prepare, View, Cleanup)
       │  ├── StepMetadataParser.cs (Extracts CAD header, schema AP203/214/242, file size)
       │  └── StepViewerControl.xaml (WPF UserControl hosting WebView2)
       │
       ▼ Microsoft Edge WebView2 (Chromium Embedded via Virtual Host Mapping)
┌────────────────────────────────────────────────────────────────────────┐
│ Assets/viewer.html (Three.js r128 WebGL Engine)                        │
│  ├── 60 FPS OrbitControls (Orbit: Left drag, Pan: Right drag, Zoom:    │
│  │   Scroll)                                                           │
│  ├── Smart Measure Raycaster (Vertex, Midpoint, Circular Center Snap)  │
│  ├── Model Tree & Multi-Body Assembly Panel (B-Rep hierarchy, solo,    │
│  │   ghost mode)                                                       │
│  ├── Mass Properties & Materials Inspector (Volume, area, weight       │
│  │   density presets)                                                  │
│  └── IndexedDB Geometry Cache (<file>_<size>_v4)                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Web Worker Message Channel
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Assets/stepWorker.js (Dedicated Background Web Worker)                 │
│  ├── OpenCASCADE.js (7.7 MB C++ WebAssembly CAD Kernel)                │
│  ├── Multi-Body B-Rep Topology Extractor                               │
│  ├── SolidWorks HLR Filter (Suppresses tangent blends dot >= 0.88)     │
│  └── Discretization Seam Eliminator (Signed volume isClosedSolid)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Functional Pillars

### A. Smart Measure Tool (`M` key)
* **Intelligent Geometric Snapping:** Snaps dynamically to 3D vertices (amber), edge midpoints (sky blue), and circular hole centers (emerald green).
* **Direct Feature Inspection:** Instant hover readout of circular diameters ($\varnothing$) / radii ($R$), linear edge lengths, and planar face surface areas.
* **Point-to-Point & Hole Pitch Measurement:** Computes 3D Euclidean distance $D$ and Cartesian components $(\Delta X, \Delta Y, \Delta Z)$ with dynamic leader dimension lines.
* **Ergonomic Quick Clear:** Triggered via the **`C`** key or **Right-Click** (2nd mouse button without dragging). *Note: `Esc` is intentionally not used because it is reserved by QuickLook to close the preview.*
* **Unit Switching (`U` key):** Live conversion between Metric ($\text{mm}, \text{mm}^2, \text{cm}^3$) and Imperial ($\text{in}, \text{in}^2, \text{in}^3$).

### B. Multi-Body Assembly Tree (`T` key)
* **Body Hierarchy:** Displays each distinct solid body with calculated volume, B-Rep face count, and triangle count.
* **Interactive 3D Hover & Focus:** Hovering over a body card in the tree lights up the solid in glowing cyan (`emissive: 0x004466`); clicking animates camera zoom and frames the body.
* **Inspection Modes:**
  * **Isolate Mode (`I`):** Hides all bodies except the target body.
  * **Ghost / X-Ray Mode (`G`):** Renders selected body at $45\%$ opacity so internal mating components are visible.
  * **Visibility Toggle (`V`):** Turns individual bodies on/off.

### C. SolidWorks-Grade HLR Edge Rendering
* **Strict Two-Face Adjacency:** For closed solids ($|V| \ge 10^{-4}$), an edge is only displayed if it is a true intersection between two distinct B-Rep faces: `f1 >= 0 && f2 >= 0 && f1 !== f2`.
* **Tangent Blend Suppression:** Suppresses lines where $\vec{n}_1 \cdot \vec{n}_2 \ge 0.88$ (angle $\le 28^\circ$) to eliminate distracting fillet seams and meshing triangulation rings.
* **Parametric Seam Elimination:** Prevents artificial pole discretization lines on spherical domes and cylinders.

### D. Physical Properties & Weight Calculator (`P` key)
* Computes accurate CAD volume and surface area.
* Provides real-time weight estimation using density presets:
  * Structural Steel ($7.85\text{ g/cm}^3$)
  * 6061 Aluminum ($2.70\text{ g/cm}^3$)
  * Brass ($8.50\text{ g/cm}^3$)
  * Grade 5 Titanium ($4.43\text{ g/cm}^3$)
  * ABS Plastic ($1.04\text{ g/cm}^3$)
  * Delrin / POM ($1.42\text{ g/cm}^3$)
  * Acrylic ($1.18\text{ g/cm}^3$)

---

## 4. Engineering & Repository Non-Negotiables

1. **Host Collision Defense:** `QuickLook.Common.dll` must **NEVER** be copied into the output directory (`bin/Release/net48`) or included in `.qlplugin`. It must have `<Private>false</Private>` in `.csproj`.
2. **Git Hygiene & Cleanliness:**
   * Test scripts (`*.ps1`), local CAD files (`*.stp`, `*.step`), `bin/`, `obj/`, and staging directories must be strictly ignored in `.gitignore`.
   * Only tracked source files, documentation, and `sample_box.step` are committed.
3. **Staging Directory Isolation:** `StepViewer-Release-Staging/` is used solely for clean standalone builds. It must **NEVER** have a `.git` folder initialized inside it.
4. **Release Distribution:** Binary archives (`.qlplugin`) must be distributed exclusively via **GitHub Releases**, never committed to the git tree.
5. **QuickLook Keyboard Etiquette:** Do not bind `Esc` or `Space` to internal viewer actions. `Space` and `Esc` are QuickLook's window close shortcuts. Use `C` and Right-Click for clearing/canceling.
