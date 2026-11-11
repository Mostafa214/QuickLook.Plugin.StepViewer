# Project: QuickLook STL Native Support

## Architecture
QuickLook.Plugin.StepViewer provides high-performance 3D CAD preview capabilities for Windows QuickLook. This project extends the plugin with production-ready native STL (Binary and ASCII) file support, smart mesh measurement intelligence, 3D printing filament/infill estimation, UI adaptations, and automated test coverage.

### Core Architectural Principles
1. **Zero OpenCASCADE Overhead for STL**: The heavy OpenCASCADE WebAssembly worker (`stepWorker.js` / `occt-import-js.wasm`) is deferred lazily and never initialized when loading STL files. STL files parse and load in < 15ms.
2. **Robust Dual-Format Support**: Single-pass Binary STL parser (84-byte header + triangle count + 50-byte facets) with strict 64-bit length validation, and streaming ASCII STL parser supporting multiline loops and scientific notation. Precedence checks binary length first to eliminate false classifications of binary files containing ASCII "solid" headers.
3. **Smart Mesh Feature Extraction**: Because STL meshes lack B-Rep topological curves and edges, `meshFeatureDetector.js` performs 1 μm spatial vertex welding, detects sharp crease edges (dihedral angle > 25°), computes crease midpoints, fits planar circular hole loops using centered Kåsa algebraic circle fitting (diameter and center coordinates accurate to < ±0.05 mm), and extracts coplanar face centroids/normals.
4. **Seamless Measure Engine Integration**: Detected circular hole loops and crease edges are injected directly into `cadState.js:modelEdgeFeatures` and `modelCadVertices`, enabling existing screen-space raycasting in `measureEngine.js` to snap to hole centers, hole perimeters, and crease midpoints, and compute center-to-center hole pitch without touching core measurement raycasting logic.
5. **3D Printing Estimator**: Physical properties calculation combines Gauss divergence theorem watertight volume ($V = \frac{1}{6} \sum \vec{v}_1 \cdot (\vec{v}_2 \times \vec{v}_3)$) with infill percentages (15%, 20%, 50%, 100%) and 3D printing filament densities (PLA 1.24 g/cm³, PETG 1.27 g/cm³, ABS 1.04 g/cm³, TPU 1.21 g/cm³, Resin 1.15 g/cm³) to calculate live part mass, 1.75 mm filament length, and 1 kg spool percentage.
6. **Zero Regression Guarantee**: STEP, IGES, and BREP files continue to route to OpenCASCADE WASM; existing 292 C# tests and Node.js sanitization test suites remain 100% passing.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | C# Plugin Extension Registration | Register `.stl` in `Plugin.cs` `_supportedExtensions` and update metadata configuration | M1 | Survey 1 |
| 2 | Fast C# STL Header Validation | Implement `IsStlFile`, `IsBinaryStlFile` (`84 + 50 * count` with 64-bit math), and `IsAsciiStlFile` in `StepMetadataParser.cs` (< 2ms) | M1 | Survey 1 |
| 3 | C# Metadata Extraction for STL | Populate `Format = "STL"`, facet count schema, and model title in `StepMetadataParser.ExtractMetadata` | M1 | Survey 1 |
| 4 | C# Unit Test Suite for STL | Add 10 synthetic test fixtures to `tests/StepMetadataParserTests.cs` covering binary, ASCII, corrupted, and overflow edge cases | M1 | Survey 1 |
| 5 | Packaging Script Asset Guard | Update `pack-plugin.ps1` `$requiredAssets` array to include `js\stlLoader.js` and `js\meshFeatureDetector.js` | M1 | Survey 1 |
| 6 | Zero-Dependency Pure JS STL Parser | Implement `Assets/js/stlLoader.js` supporting Binary and ASCII STL files in single pass (< 15ms) | M2 | Survey 2 |
| 7 | Watertight Gauss Signed Volume | Calculate exact signed volume via $V = \frac{1}{6} \sum \vec{v}_1 \cdot (\vec{v}_2 \times \vec{v}_3)$ and compute surface area in `stlLoader.js` | M2 | Survey 2 |
| 8 | OpenCASCADE WASM Worker Bypass | Lazily defer `initWorker()` in `viewerApp.js` so OpenCASCADE WASM is never initialized for STL models | M2 | Survey 2 |
| 9 | Format Discrimination & Routing | Update `detectCadFormat` and `startTessellation` in `viewerApp.js` to route format `'STL'` to `stlLoader.js` | M2 | Survey 2 |
| 10 | Mesh Summary Badges | Display triangle count, elapsed parse time, and watertight/manifold status in HUD status badges in `viewerApp.js` | M2 | Survey 2 |
| 11 | STL Parser Automated Test Suite | Implement `tests/test_stl_parser.js` verifying binary cube, ASCII cube, tetrahedron, open mesh, zero normals, and benchmark | M2 | Survey 2 |
| 12 | Spatial Vertex Welding | Implement 1 μm spatial hashing and vertex welding in `Assets/js/meshFeatureDetector.js` | M3 | Survey 3 |
| 13 | Sharp Crease Edge & Midpoint Detection | Detect edges where dihedral angle > 25° and compute 3D midpoints in `meshFeatureDetector.js` | M3 | Survey 3 |
| 14 | Circular Hole Loop Detection & Kåsa Fit | Detect closed planar loops and execute centered Kåsa algebraic circle fit (< ±0.05 mm error) in `meshFeatureDetector.js` | M3 | Survey 3 |
| 15 | Coplanar Face Clustering | Flood-fill cluster coplanar triangles to compute planar centroids and normals in `meshFeatureDetector.js` | M3 | Survey 3 |
| 16 | Measure Engine Snap Index Integration | Inject detected circles, lines, and midpoints into `cadState.js` / `measureEngine.js` for screen-space snapping and pitch measurement | M3 | Survey 3 |
| 17 | Mesh Intelligence Automated Test Suite | Implement `tests/test_mesh_feature_detector.js` verifying cube creases, bushing hole loops, bolt patterns, and dihedral thresholds | M3 | Survey 3 |
| 18 | 3D Printing Materials Expansion | Add TPU (1.21 g/cm³) and Photopolymer Resin (1.15 g/cm³) alongside PLA, PETG, ABS in `materialsEngine.js` | M4 | Survey 3 |
| 19 | Infill Percentage Slider & Estimation | Implement infill slider (15%, 20%, 50%, 100%) calculating part mass, 1.75 mm filament length, and 1 kg spool percentage | M4 | Survey 3 |
| 20 | Exploded View Tool Disabling | Disable `#btn-explode` and shortcut 'X' for single-body STL meshes with multi-body assembly tooltip in `workbenchUiEngine.js` | M4 | Survey 3 |
| 21 | Blueprint & Section Tool Verification | Confirm 2D Blueprint (`blueprintSvgEngine.js`) and 3D Section (`sectionEngine.js`) function without errors on STL models | M4 | Survey 3 |
| 22 | E2E Test Suite & Test Runner | Implement opaque-box E2E test suite covering Tiers 1–4 across all STL requirements, publishing `TEST_READY.md` | E2E | Architecture |
| 23 | Live Packaging & QuickLook Deployment | Execute `pack-plugin.ps1 -Install -RestartQuickLook` to deploy and verify live plugin in QuickLook | M5 | Architecture |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | C# Host Registration & Header Validation | Features 1, 2, 3, 4, 5 (`Plugin.cs`, `StepMetadataParser.cs`, `Metadata.config`, `pack-plugin.ps1`, C# tests) | none | DONE (Gated PASS: 302 tests pass, build 0 warnings/errors, Auditor CLEAN) |
| M2 | Zero-Dependency JS STL Loader & WASM Bypass | Features 6, 7, 8, 9, 10, 11 (`stlLoader.js`, `viewerApp.js`, `viewer.html`, `test_stl_parser.js`) | none | DONE (`orch_m2_gen1`: all 6 verification agents APPROVE/CLEAN, 574 assertions pass) |
| M3 | Smart Mesh Feature Detection & Snapping | Features 12, 13, 14, 15, 16, 17 (`meshFeatureDetector.js`, `measureEngine.js`, `cadState.js`, `test_mesh_feature_detector.js`) | M2 | DONE (`orch_m3`: all verification agents APPROVE, auditor CLEAN, 6/6 detector, 15/15 adv, 6,551 assertions pass) |
| M4 | 3D Printing Materials, Infill & UI Adaptations | Features 18, 19, 20, 21 (`materialsEngine.js`, `workbenchUiEngine.js`, `viewer.html`, `blueprintSvgEngine.js`, `sectionEngine.js`) | M2, M3 | DONE (`orch_m4`: all 6 verification agents APPROVE/CLEAN, 25/25 M4 tests, 14k+ adv assertions, 322 C# tests pass) |
| E2E | Opaque-Box E2E Testing Suite | Feature 22 (Test infrastructure, synthetic binary/ASCII fixtures, requirement-driven Tiers 1–4, `TEST_READY.md`) | none | DONE (Gated PASS: Auditor CLEAN, Reviewers APPROVE, Challengers APPROVE, 107/107 tests pass, TEST_READY.md published) |
| M5 | Final Integration, Test Pass & Live Deployment | Feature 23 (100% E2E test pass, 292+ dotnet tests, sanitization tests, live packaging via `pack-plugin.ps1`) | M1, M2, M3, M4, E2E | DONE (Gated PASS: Auditor CLEAN, Reviewers APPROVE, Challengers APPROVE, 570 tests pass, Package deployed PID 33112) |

---

## Interface Contracts

### 1. `StepMetadataParser.cs` ↔ `Plugin.cs`
- `public static bool IsValidCadFile(string path)`:
  Returns `true` if `IsStepFile(path) || IsIgesFile(path) || IsBrepFile(path) || IsStlFile(path)`.
- `public static bool IsStlFile(string path)`:
  Returns `true` if `IsBinaryStlFile(path, out _, out _) || IsAsciiStlFile(path, out _)`.
- `public static bool IsBinaryStlFile(string path, out uint triangleCount, out string headerText)`:
  Checks `Length == 84L + ((long)count * 50L)` in 64-bit integer space.
- `public static bool IsAsciiStlFile(string path, out string solidName)`:
  Checks preamble for `solid`, presence of `facet` or `endsolid`, and zero null (`0x00`) bytes.

### 2. `stlLoader.js` ↔ `viewerApp.js`
- `window.StlLoader.parse(arrayBuffer, fileName)`:
  Returns `{ format: 'STL', meshes: [ { name, position: Float32Array, normal: Float32Array, index: null, volumeMm3, areaMm2, bbox, isWatertight, isManifold } ], totalTriangles, elapsedMs }`.
- Conforms directly to the schema consumed by `onTessellationComplete(data)`.

### 3. `meshFeatureDetector.js` ↔ `cadState.js` & `measureEngine.js`
- `window.MeshFeatureDetector.detectFeatures(geometry)`:
  Returns:
  ```javascript
  {
    edgeFeatures: [
      { type: 'circle', radius, diameter, center: [x,y,z], normal: [nx,ny,nz], isClosed: true, isHole: true, points: Float32Array },
      { type: 'line', length, start: [x,y,z], end: [x,y,z], midpoint: [x,y,z], points: Float32Array }
    ],
    brepFaces: [
      { surfaceType: 'plane', areaMm2, centroid: [x,y,z], normal: [nx,ny,nz] }
    ],
    edgeIndices: Uint32Array
  }
  ```
- Directly assigned to `modelEdgeFeatures = featureBundle.edgeFeatures; mesh.userData.brepFaces = featureBundle.brepFaces; mesh.userData.edgeIndices = featureBundle.edgeIndices;` and passed to `indexModelVertices([mesh])`.

### 4. `materialsEngine.js` ↔ `viewer.html` & Blueprint
- `window.MaterialsEngine.setInfill(percentage)`: Sets infill factor ($0.05 \le \eta \le 1.0$).
- `window.MaterialsEngine.getPrintMetrics()`: Returns `{ massGrams, massKg, filamentLengthMeters, spoolFractionPercent, infillPercent }`.
- Updates `#print-est-mass`, `#print-est-length`, `#print-est-spool`.

---

## Code Layout

```
f:\Projects\STP-Quicklook\
├── Plugin.cs                                    # C# QuickLook plugin host extension & CanHandle
├── StepMetadataParser.cs                        # C# Fast header validation & metadata extraction
├── QuickLook.Plugin.Metadata.config             # Plugin description & supported format declarations
├── pack-plugin.ps1                              # PowerShell release packaging & deployment script
├── tests\                                       # Automated test suites
│   ├── StepMetadataParserTests.cs               # C# Unit tests for metadata and STL validation
│   ├── test_stl_parser.js                       # Node.js automated tests for stlLoader.js
│   ├── test_mesh_feature_detector.js            # Node.js automated tests for meshFeatureDetector.js
│   ├── test_sec01_sec04_sanitization.js         # Existing sanitization test suite
│   └── test_blueprint_v36_multiformat.js        # Existing blueprint test suite
└── Assets\
    ├── viewer.html                              # Webview HTML shell
    ├── css\viewer.css                           # UI stylesheets & theme variables
    └── js\
        ├── stlLoader.js                         # [NEW] Zero-dependency Binary & ASCII STL parser
        ├── meshFeatureDetector.js               # [NEW] Smart mesh intelligence & feature detector
        ├── cadState.js                          # Global CAD state (modelEdgeFeatures, modelCadVertices)
        ├── measureEngine.js                     # CAD snapping, dimensions & hole pitch analysis
        ├── materialsEngine.js                   # Materials library, infill slider, filament estimator
        ├── workbenchUiEngine.js                 # Toolbar actions, #btn-explode disabling, tooltips
        ├── blueprintSvgEngine.js                # 2D Blueprint generation
        ├── sectionEngine.js                     # 3D Cross-section stencil analysis
        ├── viewerApp.js                         # Viewport lifecycle, format routing, WASM bypass
        └── stepWorker.js                        # OpenCASCADE WASM worker (isolated for STEP/IGES/BREP)
```
