# E2E Test Infra: QuickLook STL Native Support

## Test Philosophy
- **Opaque-Box & Requirement-Driven**: Derived strictly from `ORIGINAL_REQUEST.md` and `PROJECT.md` without coupling to internal module private states or implementation details.
- **Zero-Dependency Headless Runtime**: Leverages standard Node.js built-ins (`vm`, `assert`, `fs`, `path`) and the project's bundled Three.js library (`Assets/three.min.js`, Revision 128) with isolated browser/DOM shims. No npm dependencies required.
- **Progressive Testability**: Verification mechanisms do not depend on features more complex than the feature under test (e.g. basic binary STL length and header checks do not depend on Kåsa circle fitting).
- **Mathematical Ground Truth**: Every synthetic test fixture is parameterized with exact closed-form analytical invariants (Gauss signed volume, polyhedral surface area, dihedral angle normal dot products, Newell plane Kåsa circle centers and diameters).
- **Methodology**: Systematic 4-tier testing applying Category-Partition, Boundary Value Analysis (BVA), Pairwise Combinatorial Interaction Testing, and Real-World Workload Scenarios.

---

## Feature Inventory & Test Matrix

| # | Feature Under Test | Source Requirement | Tier 1 (Happy) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|-------------------|--------------------|:--------------:|:-----------------:|:-----------------:|:-----------------:|
| 1 | Binary STL Header & Length Validation | ORIGINAL_REQUEST R1, PROJECT F1-F4 | 5 | 5 | ✓ | ✓ |
| 2 | Pure JS Binary STL Parsing & Normals | ORIGINAL_REQUEST R1, PROJECT F6 | 5 | 5 | ✓ | ✓ |
| 3 | ASCII STL Parsing & Streaming Loops | ORIGINAL_REQUEST R1, PROJECT F6 | 5 | 5 | ✓ | ✓ |
| 4 | Watertight Gauss Signed Volume & Area | ORIGINAL_REQUEST R1, PROJECT F7 | 5 | 5 | ✓ | ✓ |
| 5 | Sharp Crease Edge Detection (>25°) | ORIGINAL_REQUEST R2, PROJECT F13 | 5 | 5 | ✓ | ✓ |
| 6 | Circular Hole Loop Detection & Kåsa Fit | ORIGINAL_REQUEST R2, PROJECT F14 | 5 | 5 | ✓ | ✓ |
| 7 | Measure Engine Snap Index Integration | ORIGINAL_REQUEST R2, PROJECT F16 | 5 | 5 | ✓ | ✓ |
| 8 | 3D Printing Materials & Infill Estimator | ORIGINAL_REQUEST R3, PROJECT F18-F19 | 5 | 5 | ✓ | ✓ |
| 9 | UI Tool Adaptations (Explode Disabling) | ORIGINAL_REQUEST R4, PROJECT F20-F21 | 5 | 5 | ✓ | ✓ |

---

## Test Architecture

### 1. Test Harness & Runner Directory Layout
```
f:\Projects\STP-Quicklook\
├── TEST_INFRA.md                           # Master E2E test infrastructure specification
├── TEST_READY.md                           # Published completion signal with test coverage ledger
└── tests\
    ├── stl_test_fixtures.js                # Programmatic Binary & ASCII STL fixture generator
    ├── stl_test_harness.js                 # Sandboxed CAD runtime, DOM/Three.js mocks, assertions
    ├── test_stl_e2e_tier1_features.js      # Tier 1: ≥45 Isolated happy-path feature tests
    ├── test_stl_e2e_tier2_boundaries.js    # Tier 2: ≥45 Boundary, corner & malformed tests
    ├── test_stl_e2e_tier3_tier4.js         # Tier 3 (Pairwise) & Tier 4 (5 Realistic Models)
    └── run_all_stl_e2e_tests.js            # Unified master CLI runner with per-tier execution
```

### 2. Invocation Semantics & CLI Flags
The test suite can be run in its entirety or tier-by-tier:
- **Full Suite**:
  ```powershell
  node tests/run_all_stl_e2e_tests.js
  ```
- **Selective Tier Execution**:
  ```powershell
  node tests/run_all_stl_e2e_tests.js --tier=1
  node tests/run_all_stl_e2e_tests.js --tier=2
  node tests/run_all_stl_e2e_tests.js --tier=3
  node tests/run_all_stl_e2e_tests.js --tier=4
  ```
- **Exit Code Contract**:
  - Exit Code `0`: 100% of executed test cases and assertions passed.
  - Exit Code `1`: One or more assertions or test cases failed.

### 3. Assertion & Reporting Contracts
- Output format uses Windows-console-safe ANSI color formatting with clear markers (`[PASS]`, `[FAIL]`).
- Per-test reporting includes test name, execution duration in milliseconds, and detailed failure diffs with stack traces on error.

---

## Real-World Application Scenarios (Tier 4)

| # | Scenario Model | Description & Features Exercised | Geometry & Complexity |
|---|----------------|----------------------------------|----------------------|
| 1 | Flanged Bushing with Concentric Bore | Tests circular hole detection on both ends, sharp cylindrical crease edges, Gauss volume, and 3D print infill estimation on rotational mechanical components. (F1, F2, F4, F5, F6, F7, F8) | Stepped cylinder ($R_{\text{flange}}=30$, $R_{\text{neck}}=18$, $R_{\text{bore}}=10$), 384 triangles, 2 hole loops. |
| 2 | Structural Mounting Bracket with Fillet & Bolt Pattern | Tests multiple through-holes on planar face, center-to-center hole pitch dimensioning, 90° corner midpoints, and 2D blueprint orthographic projection. (F2, F5, F6, F7, F9) | L-shaped bracket with 4 bolt circle holes ($\varnothing = 6\text{ mm}$), 480 triangles. |
| 3 | Snap-Fit Electronics Enclosure Base | Tests thin-wall shell watertightness, open cavity section analysis, infill scaling (15% vs 100%), and single-body explode disabling. (F1, F4, F8, F9) | Rectangular enclosure ($80 \times 50 \times 20\text{ mm}$, $2\text{ mm}$ wall thickness), 216 triangles. |
| 4 | Multi-Aperture Filter Manifold Plate | Tests dense hole clustering, Kåsa fitting across varied hole diameters ($\varnothing = 4, 8, 12\text{ mm}$), and pitch measurements between adjacent hole pairs. (F2, F4, F6, F7) | Hexagonal/rectangular plate with 7 through-holes, 672 triangles. |
| 5 | Organic Scanned Artifact (Dual ASCII & Binary) | Tests high-facet tessellation loading (< 15ms), smooth curved surface dihedral suppression ($\le 25^\circ$), and material mass comparison (PLA vs PETG vs Resin). (F1, F3, F4, F5, F8) | High-poly organic curved surface (1,500+ triangles), non-orthogonal vertices. |

---

## Coverage Thresholds

- **Tier 1 (Feature Coverage)**: $\ge 5$ test cases per feature $\times$ 9 features = **$\ge 45$ test cases**.
- **Tier 2 (Boundary & Corner Cases)**: $\ge 5$ test cases per feature $\times$ 9 features = **$\ge 45$ test cases**.
- **Tier 3 (Cross-Feature Combinations)**: Pairwise coverage across format (Binary vs ASCII), feature detection, snapping, infill, and UI = **$\ge 9$ test cases**.
- **Tier 4 (Real-World Scenarios)**: Realistic end-to-end engineering models = **$\ge 5$ comprehensive scenario tests**.
- **Total Suite Minimum**: $45 + 45 + 9 + 5 =$ **$\ge 104$ test cases**.
