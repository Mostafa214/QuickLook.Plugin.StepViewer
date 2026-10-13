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
