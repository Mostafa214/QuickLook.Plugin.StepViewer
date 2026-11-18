# Roadmap & Actionable Execution Plan — `QuickLook.Plugin.StepViewer`

> **Document Purpose:** Self-contained engineering backlog and phased execution plan derived from full codebase inspection (`net48` C# host, WebView2 IPC, Three.js `r128` + `occt-import-js` WASM frontend, and test suite).
> **Verified Baseline:** `dotnet test tests/QuickLook.Plugin.StepViewer.Tests.csproj` passes **322 / 322** tests (1 analyzer warning `xUnit2020`).
> **SolidWorks Reference:** See [`docs/RESEARCH_SOLIDWORKS_FORMAT.md`](RESEARCH_SOLIDWORKS_FORMAT.md).

---

## Execution Rules for Future Sessions
1. Work phase-by-phase (or task-by-task as instructed by the user).
2. Keep C# `net48` compatibility and zero-telemetry / strict CSP security posture intact.
3. Preserve all passing `dotnet test` assertions and add unit/integration tests for every fix and new format.
4. Run `dotnet test tests/QuickLook.Plugin.StepViewer.Tests.csproj` and JS test suites after each phase, and verify packaging via `pack-plugin.ps1`.

---

## Phase 1: Critical Bug Fixes, Memory Leaks & Security Hardening

### 1.1 Broken UI Wiring & State Bugs
- [x] **Fix Collision Results DOM ID mismatch**
  - *Location:* `Assets/viewer.html#L577` (`id="collision-results"`) vs `Assets/js/cadAnalysisEngine.js#L172` (`getElementById('collision-results-list')`).
  - *Fix:* Align ID (`collision-results`) so interference results render in the Analysis tab.
- [x] **Fix STL Triangle Count & Face Highlight/Focus in Assembly Tree**
  - *Location:* `Assets/js/assemblyTree.js#L81`, `#L444`, `#L607`, `#L623`; `Assets/js/meshFeatureDetector.js#L689-L698`.
  - *Fix:*
    - In `assemblyTree.js#L81`, fallback to `b.data.position.length / 9` when `b.data.index` is `null`.
    - In `meshFeatureDetector.js#L689-L698`, include `triangleCount: cluster.length` on each `brepFaces` entry.
    - In `createFaceHighlightGroup` and `focusOnFace`, support `face.triangles` (`Uint32Array`) and non-indexed geometries (`idxAttr === null`) instead of returning `null`.
- [x] **Fix `zoomToBody` and `focusOnFace` for `OrthographicCamera`**
  - *Location:* `Assets/js/assemblyTree.js#L317-L333`, `#L692-L727`; `Assets/js/viewerApp.js#L263-L341`, `#L1154-L1156`.
  - *Fix:* When `camera.isOrthographicCamera` is true, compute target `camera.zoom` (frustum fit) and animate/apply `camera.zoom` + `camera.updateProjectionMatrix()` alongside `tweenCamera`.
- [x] **Fix CoM Unit Readout Bug**
  - *Location:* `Assets/js/cadAnalysisEngine.js#L351` (`window.currentUnits`) vs `Assets/js/cadState.js#L54` (`currentUnit`).
  - *Fix:* Use `currentUnit` (and re-render CoM readout inside `toggleUnits()`).
- [x] **Fix `clearModel()` Incomplete State Reset**
  - *Location:* `Assets/js/viewerApp.js#L1399-L1465`.
  - *Fix:* Reset `CadAnalysis` state (`clearCollisions()`, `toggleCenterOfMass(false)`, `toggleDraftAngle(false)`, `hideDraftLegend()`) and `WorkbenchUI` bounding box (`toggleBoundingBox(false)` if active, or refresh on next model load).
- [x] **Fix `Section` Plane Button Not Hiding 3D Gizmo**
  - *Location:* `Assets/js/sectionEngine.js#L436-L447`.
  - *Fix:* Also toggle `sectionGizmoMesh.visible = isSectionPlaneHelperActive`.
- [x] **Fix STL QR Passport Tag & Infill-Aware Filament Export**
  - *Location:* `Assets/js/snapshotEngine.js#L179`, `#L197`.
  - *Fix:* Handle `activeCadFormat === 'STL'` (`'STL Mesh'`) in `formatTag`, and use `MaterialsEngine.getPrintMetrics()` (or `getInfill()`) for mass/filament text.
- [x] **Prevent Double `MeshFeatureDetector.detectFeatures()` Run on Smooth STLs**
  - *Location:* `Assets/js/viewerApp.js#L835-L846`, `#L960-L969`.
  - *Fix:* Mark mesh `m._featuresDetected = true` in `startTessellation` so `onTessellationComplete` doesn't re-run feature detection when a smooth mesh legitimately yields 0 edges.

### 1.2 Memory & GPU Resource Leaks
- [x] **Fix `window.__cleanupViewer` & `animate()` Frame ID**
  - *Location:* `Assets/js/viewerApp.js#L531-L544`, `#L2006-L2015`; `StepViewerControl.xaml.cs#L239-L261`.
  - *Fix:* Declare `let animFrameId = null;` and assign `animFrameId = requestAnimationFrame(animate);`. In `StepViewerControl.Dispose()`, invoke `__cleanupViewer()` cleanly (or guard disposal ordering).
- [x] **Dispose Geometries & Materials in `sectionStencilGroup`**
  - *Location:* `Assets/js/sectionEngine.js#L229`, `#L362`.
  - *Fix:* Traverse children of `sectionStencilGroup` and `.dispose()` geometries/materials before `.clear()`.
- [x] **Dispose Old `CanvasTexture` on ViewCube Face Hover**
  - *Location:* `Assets/js/viewCubeEngine.js#L212`, `#L258`.
  - *Fix:* Cache the 6 normal and 6 hovered `CanvasTexture` instances at init time and swap references without allocating/leaking new textures on every `pointermove`.

### 1.3 Security & C# Host Hardening
- [x] **Fix XSS / HTML Injection Sinks in `innerHTML`**
  - *Location:* `Assets/js/cadAnalysisEngine.js#L194` (`c.nameA`, `c.nameB`); `Assets/js/materialsEngine.js#L404-L417` (`m.id`, `m.name`, `m.std`).
  - *Fix:* Escape with `escapeHtml(...)` and avoid inline `onclick="..."` string interpolation with unsanitized IDs (use `data-mat-id` + delegated event listener).
- [x] **Fix Faulted `Task` Caching & Watchdog Lifecycle in C# Host**
  - *Location:* `WebViewEnvironmentManager.cs#L23-L35`, `#L84`; `Plugin.cs#L86-L96`.
  - *Fix:* Clear `s_initEnvTask = null` on failure in `GetSharedEnvironmentAsync()` so transient initialization errors can retry; fall back to `%TEMP%` instead of `CreateAsync(null, null)` (which fails in read-only app directories); stop `_watchdog` inside `OnReady`/`OnModelLoaded`/`OnModelError`.
- [x] **Fix Guardrail Text & Threshold for Non-STEP Formats**
  - *Location:* `StepViewerControl.xaml#L57`, `StepViewerControl.xaml.cs#L20`, `#L174-L193`.
  - *Fix:* Make guardrail message format-aware (`STEP / IGES / BREP` WebAssembly vs large `STL` mesh) and raise STL threshold (e.g., 150 MB) since pure JS STL parses without WASM heap overhead.
- [x] **Fix Shortcut Documentation & `B` Key Conflict**
  - *Location:* `Assets/js/workbenchUiEngine.js#L464`, `Assets/viewer.html#L989-L1006`, `README.md#L93-L111`.
  - *Fix:* Align shortcuts across code, HUD hints bar, and README (e.g., assign `B` to Bounding Box and `D` or `Shift+B` to Blueprint, or vice-versa; document `1–4` or add `5–6` for Back/Left/Bottom).

---

## Phase 2: Code Deduplication & Repository Cleanup

- [x] **Deduplicate IndexedDB Cache Logic**
  - Remove duplicate `openCacheDB` / `getCachedModel` / `saveCachedModel` / `pruneCache` / `clearAllCache` from `Assets/js/viewerApp.js#L647-L773` and delegate solely to `window.AdminTwin`.
- [x] **Deduplicate `toggleUnits()`, `#btn-clearcache`, and `#btn-explode` Listeners**
  - Keep `toggleUnits()` solely in `Assets/js/materialsEngine.js` (remove duplicate in `Assets/js/snapshotEngine.js#L555-L575`).
  - Keep `#btn-clearcache` click handler in one place (`adminTwin.js` or `measureEngine.js`, not both).
  - Remove redundant `#btn-explode` styling from `Assets/js/assemblyTree.js#L58-L65` (owned by `workbenchUiEngine.js`).
- [x] **Remove Dead Exports & Stale Version Strings**
  - Remove `window._unused` in `Assets/js/blueprintSvgEngine.js#L819-L822`.
  - Fix `Update to v1.1.0` placeholder in `Assets/viewer.html#L122` and `v2.1.0` comment at `#L989`.
  - Either wire `AdminTwin.toggleInspectionCard(renderer)` to a debug shortcut (e.g. `Ctrl+Shift+D`) + call `AdminTwin.recordRenderFrame()` in `animate()`, or remove the unused card UI.
  - Remove unsupported `.stpx` from `Plugin.cs#L12` until STEP-XML support exists.
- [x] **Fix Compiler Warning & Clean Repository Clutter**
  - Replace `Assert.False(true, ...)` with `Assert.Fail(...)` in `tests/NavigationAndCspAdversarialStressTests.cs#L262`.
  - Consolidate/archive the ~70 ad-hoc audit scripts in `tests/` (`test_challenger_*`, `test_phase*`, `capture_*`, `diagnose_*`, `probe_*`, `verify_*`) into a clean structured test suite.
  - Remove stale root reports (`AUDIT_REPORT.md`, `FINAL_AUDIT_REPORT.md`, `TEST_INFRA.md`, `TEST_READY.md`) and untracked local temp artifacts (`.tmp_chrome_*`, `svg_*.svg`, `VerifyPhase*.ps1`, `test_*.ps1`, `diagnose_*.ps1`, `stream_test.log`).
  - Update `docs/PROJECT_STATUS.md` to reflect actual v2.0+ state.

---

## Phase 3: Engineering Accuracy & UX Improvements

- [x] **Upgrade Collision Detection to Exact Mesh Intersection (`three-mesh-bvh`)**
  - *Library:* Add `three-mesh-bvh` (MIT, UMD build `window.MeshBVHLib`, compatible with Three.js `r128`).
  - *Implementation:* Keep AABB as broad-phase filter, then build/cache `MeshBVH` per body geometry (`computeBoundsTree()`) and call `bvhA.intersectsGeometry(geomB, matAInv * matB)` for narrow-phase exact triangle-triangle collision detection.
- [x] **Compute True Mesh Center of Mass (Tetrahedron Centroid)**
  - *Implementation:* Replace AABB `box.getCenter()` and `0.45` volume fallback in `Assets/js/cadAnalysisEngine.js#L218-L237` with exact signed-tetrahedron centroid summation:
    $$\vec{C} = \frac{\sum_i V_i \cdot \frac{\vec{a}_i + \vec{b}_i + \vec{c}_i}{4}}{\sum_i V_i}, \quad V_i = \frac{1}{6} \vec{a}_i \cdot (\vec{b}_i \times \vec{c}_i)$$
    and use `MaterialsEngine.getSelectedMaterial().density` as the fallback density instead of hardcoded Steel `7.85`.
- [x] **2D Blueprint Hidden Line Removal (HLR) & Interactive Preview Modal**
  - *Implementation:*
    - Add raycast/depth-buffer occlusion visibility testing (or dashed hidden-line layer `#94a3b8` `stroke-dasharray="4,3"`) in `Assets/js/blueprintSvgEngine.js`.
    - Add an interactive SVG preview modal before download, with toggles for **First-Angle vs Third-Angle Projection**, **Show Hidden Lines**, and **Metric (mm) / Imperial (in)**.
- [x] **Offload Large STL Parsing & Feature Detection to a Web Worker**
  - *Implementation:* Create `Assets/stlWorker.js` importing `js/stlLoader.js` and `js/meshFeatureDetector.js`, using Zero-Copy `Transferable` `Float32Array` buffers so large STLs never freeze the UI thread.

---

## Phase 4: New Formats (`3MF`, `OBJ`, `PLY`, `GLB/GLTF`) & Format Conversion Export

### 4.1 Library Tooling (Three.js `r128` Compatible, Local Offline Assets)
Because `Assets/three.min.js` is **Three.js r128** (non-module global `THREE` namespace), all loaders/exporters come from `three@0.128.0/examples/js/` (or UMD-wrapped `jsm` equivalents) + `fflate`:
- [x] `Assets/js/vendor/fflate.min.js` (MIT, ~30KB — required by `3MFLoader` for `.3mf` ZIP decompression and `JS` export)
- [x] `Assets/js/vendor/3MFLoader.js` (MIT, Three.js `r128` — supports multi-body, colors, units in `.3mf`)
- [x] `Assets/js/vendor/OBJLoader.js` + `MTLLoader.js` (MIT, Three.js `r128`)
- [x] `Assets/js/vendor/PLYLoader.js` (MIT, Three.js `r128` — ASCII & Binary PLY meshes/colors)
- [x] `Assets/js/vendor/GLTFLoader.js` (MIT, Three.js `r128` — `.glb` & `.gltf`)
- [x] `Assets/js/vendor/STLExporter.js`, `OBJExporter.js`, `GLTFExporter.js` (MIT, Three.js `r128`)

### 4.2 C# Host Registration & Fast Header Validation
- [x] Register `.3mf`, `.obj`, `.ply`, `.glb`, `.gltf` in `Plugin.cs` and `QuickLook.Plugin.Metadata.config`.
- [x] Implement `< 2ms` header validators in `StepMetadataParser.cs`:
  - **`.3mf`**: ZIP local header `PK\x03\x04` (`50 4B 03 04`) + entry check for `3D/3dmodel.model` or `[Content_Types].xml` (using `System.IO.Compression.ZipArchive` in read-only mode).
  - **`.glb`**: Binary glTF magic `glTF` (`67 6C 54 46`) + version `2` (`u32 LE`).
  - **`.gltf`**: UTF-8 JSON preamble containing `"asset"` and `"version"`.
  - **`.ply`**: Starts with `ply\n` / `ply\r\n` + `format ascii` or `format binary_little_endian` / `format binary_big_endian`.
  - **`.obj`**: Absence of null bytes + preamble scan for `#`, `v `, `vt `, `vn `, `f `, `o `, `g `, `mtllib`.

### 4.3 Frontend Unified Mesh Pipeline & Export UI
- [x] Normalize loaded Three.js `Group`/`BufferGeometry` from `3MF`/`OBJ`/`PLY`/`GLB` into the existing `onTessellationComplete` schema (computing signed volume, surface area, AABB, `MeshFeatureDetector`, and unit scaling — e.g. glTF is metres → convert to mm or preserve metadata).
- [x] Add **"Export 3D Model As..."** (`Binary STL`, `OBJ`, `GLB`) inside the Export tab (`Assets/viewer.html` + `SnapshotExportService.cs` extending `AllowedSnapshotExtensions` or adding a dedicated `ExportModelMessage` IPC contract in `IpcContracts.cs` with strict path validation & magic-byte validation).

---

## Phase 5: Advanced Inspection & 3D Printing Capabilities

- [x] **Multi-Dimension Pinning (Smart Measure v2):**
  - Allow pinning multiple measurement annotations simultaneously on the 3D viewport with an individual delete/clear list in the Measure tab (`#measure-card`).
  - Add **Wall Thickness / Parallel Distance** probe (cast ray inward along `-faceNormal` via `three-mesh-bvh` to find opposite wall hit distance).
  - Add **Minimum Clearance Distance** between two selected bodies in an assembly.
- [x] **3D Printability Diagnostics (`cadAnalysisEngine.js`):**
  - **Overhang Angle Heatmap:** Highlight faces exceeding configurable support threshold (e.g. `> 45°` from build plate `-Y` / `-Z`) with red/amber color coding.
  - **Open / Non-Manifold Edge Visualizer:** Render `stlLoader.js` boundary edges (`count === 1`) in bright magenta and non-manifold edges (`count > 2`) in red directly on the 3D model.
- [x] **Section Plane Precision Controls:**
  - Add numeric offset input (mm / in) next to `#sec-slider` in `Assets/viewer.html` + `sectionEngine.js`.
- [x] **User Preferences Persistence:**
  - Persist default unit (`mm`/`in`), HLR edges toggle, default camera mode (`Ortho`/`Persp`), and theme in `localStorage`.

---

## Phase 6: Native SolidWorks Support (`.SLDPRT` & `.SLDASM`)

> Full binary spec, stream anatomy, and license compatibility matrix are documented in [`docs/RESEARCH_SOLIDWORKS_FORMAT.md`](RESEARCH_SOLIDWORKS_FORMAT.md).

### 6.1 Phase 6A — Fast Display Mesh & Assembly Engine (MIT Clean-Room)
- [x] **C# Host (`Plugin.cs`, `StepMetadataParser.cs`, `WebViewEnvironmentManager.cs`):**
  - Register `.sldprt` and `.sldasm`.
  - Detect OLE2 (`D0 CF 11 E0 A1 B1 1A E1`) or Modern SW block header (`14 00 06 00 08 00` + nibble-swapped directory name).
  - Add `OpenMcdf` (MPL-2.0, `net48`) to unpack pre-2015 OLE2 containers & `__ZLB` streams when needed.
  - Extract metadata (`docProps/custom.xml`, `docProps/ISolidWorksInformation.xml`) for QuickLook title bar.
  - Add secured `https://cad-stream.local/cad-sibling?name=...` endpoint restricted strictly to the parent directory of `_currentFilePath` (preventing path traversal) so `.SLDASM` can load uncached sibling `.SLDPRT` files.
- [x] **JS / Worker Parser (`Assets/js/solidworksWorker.js`):**
  - Parse Modern container blocks (marker `14 00 06 00 08 00`, nibble-swap names, CRC-32 validation, raw-DEFLATE via `fflate`).
  - Decode `Contents/DisplayLists` (`uoTempBodyTessData_c` / `uoTempFaceTessData_c`) descriptor tables and unwind triangle strips into indexed/non-indexed meshes (scaled metres → mm `× 1000`), preserving body/face colors.
  - Parse `swXmlContents/COMPINSTANCETREE` for `.SLDASM`: build hierarchical assembly tree, apply `swTransform` 4×4 row-vector matrices (translation `× 1000`), skip suppressed components, resolve virtual `<name>^<assembly>` sections and external sibling `.SLDPRT` files.
  - Feed directly into `onTessellationComplete()` + `MeshFeatureDetector` so Measure, Section, Explode, Blueprint, and 3D Print Estimator work seamlessly.
  - Graceful fallback: if a part has no cached tessellation (e.g. imported STEP without display list), show `PreviewPNG` + clear status badge.

### 6.2 Phase 6B — Exact B-Rep via Parasolid XT (Optional Upgrade)
- [ ] Compile/integrate `schwitters/openswx` (`libopenswx` + `libopenparasolid` + `libopenswstep`, **MIT**) or `cadmpeg` (**Apache-2.0**) to WebAssembly (or `win-x64` native helper DLL) to decode `Contents/Config-N-Partition` / `LocalBodies` Parasolid XT streams into exact B-Rep STEP for files lacking `DisplayLists` or when exact analytic surfaces are needed.

---

## Verification Matrix (Post-Phase Gate)
1. **C# Build & Unit Tests:** `dotnet test tests/QuickLook.Plugin.StepViewer.Tests.csproj` (0 failures, 0 warnings).
2. **JS Engine Tests:** Run Node test suites for `stlLoader`, `meshFeatureDetector`, `blueprintSvgEngine`, sanitization (`SEC-01`..`SEC-04`), and new format loaders/exporters.
3. **Packaging & Live Smoke Test:** `powershell -ExecutionPolicy Bypass -File .\pack-plugin.ps1 -Install -RestartQuickLook`, verifying Spacebar preview across `.step`, `.iges`, `.brep`, `.stl`, `.3mf`, `.obj`, `.ply`, `.glb`, and `.sldprt`/`.sldasm`.
