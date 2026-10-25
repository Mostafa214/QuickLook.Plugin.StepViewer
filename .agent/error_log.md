# Persistent Error Memory & Bug History

### [2026-09-25] QuickLook.Common.dll Assembly Type Collision
- **Command / Context:** QuickLook plugin execution inside `QuickLook.exe` host process.
- **Root Cause:** When `QuickLook.Common.dll` is copied into the plugin output folder (`bin/Release/net48`), .NET Framework loads a second duplicate instance of `QuickLook.Common` types into the AppDomain, causing runtime invalid cast exceptions when casting `IViewer` or `ContextObject`.
- **Failed Attempts:** Setting `<CopyLocal>false</CopyLocal>` in csproj was partially overwritten by build targets.
- **Verified Fix:** In `QuickLook.Plugin.StepViewer.csproj`, set `<Private>false</Private>` on the reference to `QuickLook.Common.dll`, and in `pack-plugin.ps1`, add a step that explicitly checks for and deletes any accidental `QuickLook.Common.dll` inside the output before creating `.qlplugin`.

### [2026-09-26] WebView2 Local File CORS & Web Worker Restriction
- **Command / Context:** Loading `stepWorker.js` and `occt-import-js.wasm` via `file:///` URLs inside Microsoft Edge WebView2.
- **Root Cause:** Modern Chromium security restricts `new Worker('file:///...')` and WebAssembly fetch requests on `file://` schemes due to cross-origin sandboxing.
- **Failed Attempts:** Trying to inline the 7.7MB WASM module as a base64 string caused memory exhaustion and UI freezes.
- **Verified Fix:** Intercept network requests in C# using `CoreWebView2.WebResourceRequested` with a virtual domain mapping: `https://step-viewer.local/`. Serve all HTML, JS, and WASM assets via virtual HTTPS stream with explicit `Content-Type` headers and CORS headers.

### [2026-10-03] Discretization Seams on Spheres & Tangent Fillet Lines
- **Command / Context:** Rendering CAD edge outlines on spherical domes and curved fillets in `Hosieni - Nar.stp`.
- **Root Cause:** OpenCASCADE triangulation of parametric spherical surfaces leaves internal mesh seams at coordinate wrap boundaries (pole coordinates). In `stepWorker.js`, an edge on the same face had `f1=111, f2=-1`. The comparison `e.f1 !== e.f2` evaluated `111 !== -1` as true, treating internal triangulation seams as real boundary edges! Additionally, standard dihedral angle filters treated tangent fillet transitions as sharp mechanical creases.
- **Failed Attempts:** Standard Three.js `EdgesGeometry` with threshold angle 15° caused random broken segments and jagged wireframes.
- **Verified Fix:** 
  1. Calculate signed volume `bodyVol` to detect closed manifold solids (`isClosedSolid = Math.abs(bodyVol) >= 1e-4`).
  2. For closed solids, strictly require that an edge is a boundary between **two distinct valid CAD faces**: `e.f1 >= 0 && e.f2 >= 0 && e.f1 !== e.f2`.
  3. Implement SolidWorks "Tangent Edges Removed" logic: suppress boundaries where `dot >= 0.88` (crease angle $\le 28^\circ$) so smooth blends/fillets are clean, keeping only sharp mechanical cuts and steps (`dot < 0.88`).

### [2026-10-13] ESC Key Closing QuickLook Host Window during Measurement (GitHub Issue #1)
- **Command / Context:** User pressed `Esc` while Smart Measure was active to clear points, prompted by UI button `Clear [Esc]`.
- **Root Cause:** In the QuickLook application, `Escape` and `Spacebar` are global window-level hotkeys hooked by QuickLook's window manager to close the preview window. When the user pressed `Esc`, QuickLook immediately closed the entire viewer.
- **Failed Attempts:** Intercepting `Escape` inside JavaScript was bypassed by QuickLook's outer WPF window keyboard hook.
- **Verified Fix:** 
  1. Replaced `Clear [Esc]` with `Clear [C]` in the Smart Measure UI card.
  2. Bound the unmapped `C` key (Clear) to clear measurements when active or deselect active entities.
  3. Added standard CAD 2nd mouse button (Right-Click without drag) to cancel/clear measurements and deselect entities.
  4. Updated documentation and hints bar to reflect `C / Right-Click`.

### [2026-10-18] Synchronous WebView2 Execution Deadlock on STA Dispatcher
- **Command / Context:** Automated UI testing scripts (`test_auto_updater.ps1`, `test_section_suite.ps1`) executing scripts inside WebView2 from PowerShell.
- **Root Cause:** Calling `.GetAwaiter().GetResult()` or `.Result` synchronously on `ExecuteScriptAsync` or `CoreWebView2Initialization` from the WPF STA thread blocks the thread. Because WebView2's internal IPC relies on the STA message queue to deliver results, the thread deadlocks waiting for itself to pump messages.
- **Failed Attempts:** Using `[System.Threading.Thread]::Sleep(500)` or `.Wait()` locks the process indefinitely.
- **Verified Fix:** Implement an explicit message pumping loop:
  ```powershell
  while (-not $task.IsCompleted) {
      [System.Windows.Threading.Dispatcher]::CurrentDispatcher.Invoke([Action]{}, [System.Windows.Threading.DispatcherPriority]::Background)
      Start-Sleep -Milliseconds 20
  }
  ```

### [2026-10-18] Missing `System.IO.Compression.FileSystem` in .NET 4.8 for `ZipFile`
- **Command / Context:** Compiling `StepViewerControl.xaml.cs` referencing `System.IO.Compression.ZipFile.OpenRead(...)` for update integrity checks.
- **Root Cause:** In .NET Framework 4.8, `ZipFile` lives in `System.IO.Compression.FileSystem.dll`, separate from `System.IO.Compression.dll`. Referencing only `System.IO.Compression` produces CS0234: `The type or namespace name 'ZipFile' does not exist in the namespace 'System.IO.Compression'`.
- **Failed Attempts:** Attempting to use reflection or custom decompression libraries.
- **Verified Fix:** Add explicit assembly references to both `<Reference Include="System.IO.Compression" />` and `<Reference Include="System.IO.Compression.FileSystem" />` in `QuickLook.Plugin.StepViewer.csproj`.

### [2026-10-19] Hollow Shells & Inverted Backfaces in 3D Section Views
- **Command / Context:** Enabling 3D cutting plane (`S` key) on complex solid bodies.
- **Root Cause:** Three.js default clipping planes clip geometry by discarding fragments behind the plane. Because B-Rep triangulated meshes have zero interior thickness and backfaces are culled (`side: THREE.FrontSide`), slicing open a solid exposes a hollow void, destroying the illusion of a solid CAD model.
- **Failed Attempts:** Setting `side: THREE.DoubleSide` rendered backface polygons inside the cavity, but still showed a hollow shell with confusing inverted normals.
- **Verified Fix:** Implement a two-pass GPU stencil buffer capping pipeline:
  1. Pass 1: Render backfaces with clipping plane active, incrementing the stencil buffer on Z-pass.
  2. Pass 2: Render frontfaces with clipping plane active, decrementing the stencil buffer on Z-pass.
  3. Pass 3: Render a planar cap geometry matching the section plane bounding box, restricted to pixels where `stencilFunc = NotEqual(0)`, shaded with a high-contrast dark slate cap material (`#1e293b`).

### [2026-10-19] Raycasting Jumps and Discontinuity during 3D Arrow Gizmo Drag
- **Command / Context:** Interactively dragging the 3D section arrow gizmo along the cut normal.
- **Root Cause:** Raycasting against the arrow geometry during fast mouse movement causes the cursor to leave the narrow mesh, triggering sudden mouseout / drag-stop events and jerky clipping plane jumps.
- **Failed Attempts:** Constraining mouse movement in 2D screen space caused perspective distortions and incorrect 3D unit mapping.
- **Verified Fix:** On `pointerdown`, instantiate an invisible mathematical plane (`THREE.Plane`) perpendicular to the camera look direction that intersects the arrow's start position. During `pointermove`, raycast against this infinite drag plane, project the 3D displacement vector onto the clipping normal $\vec{n}$, and apply the scalar distance to the clipping constant.

### [2026-10-19] GitHub API Rate Limit Starvation in Auto-Updater
- **Command / Context:** Checking GitHub releases API `https://api.github.com/repos/Mostafa214/.../releases/latest`.
- **Root Cause:** Unauthenticated client requests to GitHub API share an IP quota of 60 requests/hour. Frequent spacebar launches quickly exhaust the limit, returning HTTP 403 Forbidden.
- **Failed Attempts:** Checking on every window launch.
- **Verified Fix:** Store check timestamps in browser `localStorage` (`cad_last_update_check` and `cad_cached_release_info`). Enforce a 12-hour throttling guard for automated checks, while allowing manual force-checks (`AutoUpdater.checkForUpdates(true)`) when the user explicitly clicks the status bar pill.
