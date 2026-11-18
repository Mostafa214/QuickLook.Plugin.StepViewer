# Changelog

All notable changes to **QuickLook.Plugin.StepViewer** are documented in this file.

## [3.0.1] - 2026-11-18

### Added & Improved
- **SolidWorks Color Fidelity (`moVisualProperties_c`):** Decodes binary `ThirdPtyStore/VisualStates` RGB appearance colors (`COLORREF`) for both `.SLDPRT` parts and `.SLDASM` assemblies (including `VirtualComp` and external sibling parts), preserving exact SolidWorks colors without palette overrides.
- **Upgraded RealView Studio Mode:** Procedural HDR-style studio equirectangular `PMREM` environment, boosted key/rim directional lighting, grounded contact shadow & subtle studio floor sheen (`groundShadowPlane` + `realViewFloorDisc`), machined PBR response, and synced `#btn-realview` active state.
- **Two-Stage Exploded Assembly View:** Clicking `Explode` smoothly animates `0% → 25%` on the first click, `25% → 100%` on the second click, and `Collapse` smoothly returns to `0%`.
- **1-Click Metric & Imperial Unit Selector Popover:** Replaced 5-click cycling with a compact popover menu under `#btn-units` offering instant 1-click switching across **Metric (`mm`, `cm`, `m`)** and **Imperial (`in`, `ft`)** in Measure, Section, CoM, and 2D Blueprints.
- **RAM Optimization:** Idle `occt-import-js.wasm` worker termination (`2.5s` after STEP/IGES/BREP load) freeing 40–200 MB WASM heap, HiDPI `devicePixelRatio` cap (`1.75`), GPU/PMREM disposal on `clearModel`/`Dispose`, and `about:blank` navigation before `WebView2.Dispose()`.
- **Version Drift Prevention:** Added automatic `[0/5]` version consistency gate in `pack-plugin.ps1` and `tests/test_version_sync.js` ensuring `.csproj`, `QuickLook.Plugin.Metadata.config`, and `APP_CURRENT_VERSION` stay synchronized.

### Fixed
- Fixed `APP_CURRENT_VERSION` (`v2.0.0` → `v3.0.1`) so the updater no longer prompts self-updates.
- Fixed `const formatLength` duplicate global declaration in `Assets/js/materialsEngine.js` and undeclared `groundShadowPlane` `ReferenceError` in `Assets/js/viewerApp.js`.

## [3.0.0] - 2026-11-18

### Added
- **Phase 6 — Native SolidWorks Support (`.SLDPRT` & `.SLDASM`):**
  - Registered `.sldprt` and `.sldasm` in `Plugin.cs`, `QuickLook.Plugin.Metadata.config`, and `StepMetadataParser.cs` with fast OLE2 (`OpenMcdf` / `__ZLB`) and modern SolidWorks block header detection (`14 00 06 00 08 00`), plus XML metadata extraction.
  - Added sandboxed same-directory `https://cad-stream.local/cad-sibling` endpoint in `WebViewEnvironmentManager.cs` to resolve external sibling `.SLDPRT` components in `.SLDASM` assemblies without path traversal.
  - Implemented `Assets/js/solidworksWorker.js` and `Assets/js/solidworksLoader.js` to decode `Contents/DisplayLists` (`uoTempBodyTessData_c` / `uoTempFaceTessData_c`) triangle strips with preserved body/face colors, parse `swXmlContents/COMPINSTANCETREE` transforms, and fall back gracefully to embedded `PreviewPNG` thumbnails when cached tessellation is absent.
- **Phase 5 — Smart Measure v2, 3D Printability & Precision Controls:**
  - Upgraded `measureEngine.js` with multi-dimension pinning in the 3D viewport, BVH-accelerated **Wall Thickness** probing along opposite face normals, and **Minimum Clearance** distance between two selected assembly bodies.
  - Added **3D Printability Diagnostics** in `cadAnalysisEngine.js`: configurable **Overhang Angle Heatmap** (`15°–75°`) and **Open / Non-Manifold Edge Visualizer** (magenta boundary edges, red non-manifold edges).
  - Added numeric precision offset input for 3D section planes (`sectionEngine.js`) and `localStorage` persistence for theme, units, HLR edges, and default camera projection.
- **Phase 4 — Multi-Format Support & Format Conversion Export:**
  - Added native loading for **`.3mf`** (`3MFLoader` + `fflate`), **`.obj`** (+ `.mtl`), **`.ply`** (ASCII & binary), and **`.glb` / `.gltf`** with `< 2ms` C# header validation in `StepMetadataParser.cs` and unified normalization into the CAD inspection pipeline.
  - Added **"Export 3D Model As..."** (`Binary STL`, `OBJ`, `GLB`) via `SnapshotExportService.cs` and `IpcContracts.cs`.
- **Phase 3 — Engineering Accuracy, BVH HLR & Worker Offloading:**
  - Upgraded assembly collision detection to AABB broad-phase + `three-mesh-bvh` narrow-phase exact triangle-triangle intersection.
  - Replaced bounding-box Center of Mass approximations with exact signed-tetrahedron volumetric centroid summation integrated with `MaterialsEngine`.
  - Added **BVH-Accelerated Hidden Line Removal (HLR)** and an interactive **2D Blueprint Studio Live Preview Modal** supporting First-Angle / Third-Angle projection, hidden line toggling, and Metric / Imperial units.
  - Offloaded STL parsing and `MeshFeatureDetector` to `Assets/stlWorker.js` using Zero-Copy `Transferable` `Float32Array` buffers.
- **Dual-Theme Engineering Studio, RealView & Original CAD Colors:**
  - Added **Light Engineering Workbench** theme alongside **Dark CAD Studio**, paired with an interactive 3D ViewCube.
  - Added **RealView Studio** toolbar mode (`#btn-realview`) boosting PMREM environment reflections, `ACESFilmic` exposure, PBR metallic/roughness response, and grounded floor shadows across both live viewport and Snapshot exports.
  - Added native **STEP AP214/AP242 per-face colors** (`brepFaces` vertex colors) and **SolidWorks appearance color** extraction with clean per-body override and 1-click Reset.

### Changed & Fixed
- **Phase 1 — Critical Bug Fixes, Memory Leaks & Security Hardening:**
  - Fixed collision results DOM ID mismatch, STL triangle count & face highlight/focus in `assemblyTree.js`, `OrthographicCamera` zoom handling in `zoomToBody`/`focusOnFace`, CoM unit readouts, `clearModel()` state reset, section gizmo visibility toggling, and STL QR passport tags.
  - Fixed GPU/memory leaks in `viewerApp.js` (`animFrameId` / `__cleanupViewer`), `sectionStencilGroup` disposal, and cached `ViewCube` `CanvasTexture` instances.
  - Hardened `innerHTML` sinks against XSS (`escapeHtml` + delegated listeners), fixed `WebViewEnvironmentManager` faulted `Task` caching and `%TEMP%` fallback, made guardrail thresholds format-aware (`35 MB` STEP/IGES/BREP, `150 MB` STL), and stopped `_watchdog` cleanly on lifecycle completion.
- **Phase 2 — Code Deduplication & Repository Hygiene:**
  - Deduplicated IndexedDB cache logic (delegated to `AdminTwin`), `toggleUnits()`, `#btn-clearcache`, and `#btn-explode` listeners; removed dead exports, stale version strings, and unsupported `.stpx` registration.
  - Consolidated obsolete ad-hoc test scripts and stale root audit reports into a structured C# (`QuickLook.Plugin.StepViewer.Tests.csproj`) and Node.js regression suite.
