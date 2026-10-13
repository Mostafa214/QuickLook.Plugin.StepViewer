# Developer & AI Agent Handbook (Continuity & Architectural Guide)

> **FOR FUTURE AI ASSISTANTS & DEVELOPERS:**  
> If you are opening a fresh conversation session on this project, read this document, `docs/PROJECT_SPEC.md`, and `docs/PROJECT_STATUS.md` **before taking any action or answering the user**. You must have 100% full context of the project history, design decisions, GitHub operations, and workspace rules.

---

## 1. Project Philosophy & Architectural Decisions (The "Why")

### Why WebAssembly (OpenCASCADE.js) over Native C++ DLLs?
* **Problem:** Traditional CAD viewers require heavy native C++ binaries (OpenCASCADE native DLLs are hundreds of megabytes and require complex MSVC runtimes). If a native DLL crashes on a malformed STEP file, it crashes the entire Windows Explorer or QuickLook host process.
* **Decision:** We compiled the OpenCASCADE CAD kernel into a self-contained 7.7 MB WebAssembly binary (`occt-import-js.wasm`) running inside a background Web Worker (`stepWorker.js`).
* **Result:** Zero-install, portable on any Windows 10/11 system, memory-sandboxed (if a CAD file fails, only the Web Worker fails, never QuickLook), and instant hardware-accelerated 3D rendering via Microsoft Edge WebView2 Direct3D pipeline.

### Why IndexedDB Geometry Caching?
* **Problem:** On cold start, compiling 7.7 MB of WebAssembly into memory and parsing a new STEP file takes ~1.5 to 2.5 seconds.
* **Decision:** We implemented an in-browser IndexedDB cache (`_v4`). After the first tessellation, the raw vertex/normal/index buffers are cached under the key `<fileName>_<fileSize>_v4`.
* **Result:** Re-opening or returning to any previously viewed model takes **100–150 milliseconds** (virtually instant).

### The SolidWorks HLR Filter (Why Standard Wireframe Failed)
* **Problem:** Standard Three.js `EdgesGeometry` draws every triangle boundary where normal angle exceeds a threshold. This produced two severe bugs:
  1. **Stray lines on spheres/domes:** Triangular mesh parameterization at pole wrap coordinates produced artificial internal edges (`f1=111, f2=-1`). The old code treated `111 !== -1` as a boundary!
  2. **Concentric mesh rings on fillets:** Smooth blends and rounds were covered in ugly triangulation seams.
* **Decision:**
  1. We compute signed volume `bodyVol` to detect closed solids ($|V| \ge 10^{-4}$). Closed solids have **zero** open boundaries (`count === 1` is strictly rejected).
  2. We require an edge to be an intersection between **two distinct valid CAD faces**: `f1 >= 0 && f2 >= 0 && f1 !== f2`.
  3. We apply SolidWorks "Tangent Edges Removed" logic: boundaries with $\vec{n}_1 \cdot \vec{n}_2 \ge 0.88$ (angle $\le 28^\circ$) are suppressed. Only sharp mechanical cuts ($< 28^\circ$, steps, chamfers) are drawn.

### The ESC Key Conflict (Issue #1 Resolution)
* **Problem:** In QuickLook, `Esc` and `Space` are global window hooks reserved to close the preview. Our Smart Measure UI had a button labeled `Clear [Esc]`. When users pressed `Esc`, QuickLook instantly closed!
* **Decision:**
  1. We did not use `E` (user suggested `E`, but `E` is already bound to toggle mechanical edge lines).
  2. We selected **`C`** (Clear) — unmapped, intuitive, and standard.
  3. We added **Right-Click** (2nd mouse button without dragging) to quick-clear/cancel measurements and deselect entities, matching desktop CAD ergonomics (SolidWorks / Fusion 360).

---

## 2. GitHub Management & Repository Rules

* **Official Repository:** `https://github.com/Mostafa214/QuickLook.Plugin.StepViewer`
* **Maintainer Account:** `Mostafa214` (authenticated locally via `gh` CLI).
* **Latest Live Release:** `v1.0.1`

### Mandatory GitHub Check at Start of Session
Whenever entering a new session, verify the live GitHub state using `gh`:
```powershell
# 1. Check open issues
gh issue list --repo Mostafa214/QuickLook.Plugin.StepViewer

# 2. Check latest release
gh release list --repo Mostafa214/QuickLook.Plugin.StepViewer

# 3. Check traffic views and clones
gh api repos/Mostafa214/QuickLook.Plugin.StepViewer/traffic/views
```

### How to Release a New Version
When a new milestone is completed and verified:
1. Update `<Version>X.Y.Z</Version>` in `QuickLook.Plugin.Metadata.config`.
2. Sync files to `StepViewer-Release-Staging/` and package:
   ```powershell
   powershell -ExecutionPolicy Bypass -File pack-plugin.ps1 -Install -RestartQuickLook
   ```
3. Commit and push changes to `main`.
4. Create and push git tag:
   ```powershell
   git tag -a vX.Y.Z -m "Release vX.Y.Z: ..."
   git push origin vX.Y.Z
   ```
5. Publish GitHub release with `.qlplugin` attached:
   ```powershell
   gh release create vX.Y.Z "QuickLook.Plugin.StepViewer.qlplugin" --title "vX.Y.Z - ..." --notes-file release_notes.md
   ```

---

## 3. Workspace Discipline & Git Hygiene

1. **NEVER Commit Build Artifacts or Binaries to Git:**
   * `bin/`, `obj/`, `*.qlplugin`, `StepViewer-Release-Staging/` are ignored in `.gitignore`. Binary releases live exclusively in GitHub Releases.
2. **NEVER Commit Personal/Test CAD Models:**
   * Personal models like `Hosieni - Nar.stp`, `2-1.STEP` are strictly ignored.
   * Only `sample_box.step` is kept as a clean open-source demo file.
3. **NEVER Initialize Git inside Staging Directory:**
   * `StepViewer-Release-Staging/` is an isolated build output staging folder. Running `Test-Path "StepViewer-Release-Staging\.git"` must ALWAYS return `False`.
4. **Host Assembly Protection:**
   * `QuickLook.Common.dll` is referenced with `<Private>false</Private>`. It must NEVER be included inside the plugin folder or ZIP package to prevent AppDomain type collisions.

---

## 4. Continuity & Communication Style

* **Impartial & High-Technical Persona:** Speak with technical precision, zero fluff, no flattering apologies.
* **Context Preservation:** Never ask the user "What is this project?" or "What should we do?". Consult `docs/PROJECT_STATUS.md` and start immediately from the **Immediate Next Step**.
