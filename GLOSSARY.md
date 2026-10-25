# Ubiquitous Domain Glossary (QuickLook CAD Viewer)

This document standardizes all technical, mechanical engineering, 3D graphics, and software terminology used across the QuickLook CAD Viewer project.

---

### 1. CAD, Geometry & 3D Graphics Terminology

* **B-Rep (Boundary Representation):** The CAD mathematical method of representing 3D solid models by their limiting topological surfaces: faces, bounding edges, and vertices.
* **STEP / STP (Standard for the Exchange of Product model data):** ISO 10303 standard for 3D engineering data exchange.
  * **AP203:** Configuration controlled 3D designs of mechanical parts and assemblies.
  * **AP214:** Core data for automotive mechanical design processes (colors, layers, tolerances).
  * **AP242:** Managed model-based 3D engineering (combines AP203 and AP214 with semantic Product and Manufacturing Information).
* **IGES (.iges, .igs - Initial Graphics Exchange Specification):** Legacy ANSI standard for vendor-neutral digital exchange of CAD geometry including surface entities and wireframe curves.
* **BREP (.brep):** OpenCASCADE's native boundary representation file format containing exact topological structures and NURBS surface definitions.
* **Closed Manifold Solid:** A topologically watertight, fully enclosed 3D solid body. Characterized by zero open boundary edges and a non-zero signed volume ($|V| \ge 10^{-4}\text{ mm}^3$).
* **Open Surface Sheet:** A non-solid surface model (e.g., zero thickness shell or imported quilt) where outer perimeter edges belong to only a single face (`count === 1`).
* **Tangent Blend / Fillet:** A smooth rounded transition surface tangent to adjacent faces ($G^1$ continuity). Under SolidWorks HLR standards ("Tangent Edges Removed"), seams between tangent blends are suppressed from rendering.
* **Dihedral Angle:** The angle between the surface normals of two adjacent faces sharing a common edge.
* **Mechanical Crease / Sharp Feature Edge:** A high-contrast outline drawn where the dihedral angle between adjacent face normals exceeds $28^\circ$ ($\vec{n}_1 \cdot \vec{n}_2 < 0.88$).
* **Discretization Seam / Pole Artifact:** Triangular mesh edges created artificially when parameterizing curved or spherical topologies ($u, v$ coordinate wraps). Suppressed on closed manifold solids.
* **Multi-Body Part:** A single CAD file containing multiple distinct, disjoint solid bodies (e.g., `Hosieni - Nar.stp` containing two interacting mechanical solids).
* **Delta Distance:** The Cartesian components $(\Delta X, \Delta Y, \Delta Z)$ alongside the 3D Euclidean distance $D = \sqrt{\Delta X^2 + \Delta Y^2 + \Delta Z^2}$ measured between two geometric features.
* **Cylindrical Hole Pitch:** The center-to-center Euclidean distance and Cartesian deltas between the axes of two cylindrical features.
* **Orientation Triad:** The 3D coordinate axis gizmo (Red: X, Green: Y, Blue: Z) tracking camera orientation in real time.
* **Section View (Cross-Section):** A visual cut exposing the internal geometry of a part using a clipping plane defined by normal $\vec{n}$ and scalar constant $d$ ($\vec{n} \cdot \vec{p} + d = 0$).
* **Watertight Stencil Capping:** A GPU multi-pass stencil buffer technique that renders a solid dark planar fill across clipped cavities, preventing the hollow-polygon illusion.
* **3D Arrow Manipulator Gizmo:** An interactive 3D arrow mesh rendered along the section normal that allows raycasted drag-and-drop repositioning of the clipping plane directly in the 3D viewport.
* **Ray-Plane Mathematical Projection:** Projecting mouse rays against an invisible camera-facing planar surface to compute jitter-free 1D displacements along a 3D axis.
* **Exploded Assembly View:** An inspection mode where multi-body parts are displaced outward from their common bounding center along radial trajectory vectors $\vec{v}_i = \text{normalize}(\vec{c}_i - \vec{c}_{\text{assembly}})$.
* **Exploded Guide Trails:** Dynamic 3D dashed line segments connecting each displaced component's centroid back to its original unexploded resting position.
* **PBR Shading (Physically Based Rendering):** Real-time lighting model simulating light interactions via roughness, metalness, and ambient environment maps.

---

### 2. Architecture & Software Stack Terminology

* **QuickLook (QL-Win):** The host open-source Windows application (by Paddy Xu) providing instant spacebar file preview inside Windows Explorer.
* **`QuickLook.Common.dll`:** The host API assembly defining `IViewer`, `ContextObject`, and plugin lifecycle hooks.
* **`.qlplugin`:** The canonical distribution package for QuickLook plugins. A ZIP archive containing `QuickLook.Plugin.Metadata.config`, the .NET assembly DLL, and embedded 3D Web assets.
* **Microsoft Edge WebView2:** The embedded Chromium browser control hosting the HTML5/WebGL canvas inside WPF with hardware-accelerated Direct3D rendering.
* **Virtual Host Mapping (`https://step-viewer.local/`):** A custom virtual HTTPS origin registered with WebView2 that serves local assets without triggering Chromium `file:///` CORS or Web Worker sandbox restrictions.
* **OpenCASCADE.js (OCCT):** The professional C++ boundary representation CAD kernel compiled into a 7.7 MB WebAssembly binary (`occt-import-js.wasm`).
* **Web Worker (`stepWorker.js`):** The dedicated background thread responsible for compiling OpenCASCADE WebAssembly, parsing CAD files, extracting B-Rep topology, and filtering edges without blocking UI rendering.
* **Two-Way Zero-Copy Transfer Lists:** Passing `ArrayBuffer` instances between main thread and Web Worker by transferring ownership rather than duplicating memory in the heap.
* **IndexedDB Geometry Cache:** In-browser persistent key-value storage caching parsed Three.js geometry buffers by hash (`<filename>_<size>_v4`), reducing repeat load times to under 120ms.
* **IndexedDB WASM Bytecode Cache:** Persisting compiled `WebAssembly.Module` binaries in browser storage to bypass expensive JIT compilation on subsequent launches.
* **Autonomous In-App Auto-Updater:** A client subsystem that queries the GitHub Releases API, tracks version updates, displays a non-intrusive progress bar, and triggers an out-of-process PowerShell deployer.
* **Morphing Pill Button:** A compact UI widget that seamlessly transforms its layout and role from an announcement button `[ Update to vX.X ]` into a real-time progress bar, and finally into a restart prompt `[ ↻ Restart QuickLook ]`.
* **Single-Line Highlights Drawer (`[ ⓘ ]`):** A compact UI drawer that toggles a one-line summary extracted from release notes following the format `Highlights: <summary>`.
* **Detached PowerShell Deployer:** A temporary standalone `.ps1` script spawned in a background process with `-WindowStyle Hidden` that shuts down QuickLook, unpacks `.qlplugin` via .NET `ZipFile`, atomically overwrites installation paths, restarts QuickLook, and self-deletes.
* **Unified Engineering Workbench (v2.0):** The target UI architecture featuring a bottom floating Command Dock, right-docked collapsible multi-tab Inspector Drawer, and top-right 3D NavCube.

---

### 3. Persian-English Domain Vocabulary Matrix (واژه‌نامه دامین فارسی-انگلیسی)

| اصطلاح فارسی دامین | معادل دقیق در معماری سیستم (English Domain Symbol) | تعریف و کارکرد در پروژه |
| :--- | :--- | :--- |
| **نمای پیش‌نمایش سریع** | `QuickLook Preview / Spacebar Inspection` | چرخه حیات باز شدن و بررسی آنی مدل با کلید Space در ویندوز اکسپلورر |
| **مدل توپر بسته** | `Closed Manifold Solid` | هندسه سه‌بعدی آب‌بند و دارای حجم جهت محاسبات فیزیکی و مقطع‌زنی |
| **سرکوب لبه‌های مماس** | `SolidWorks HLR Tangent Suppression` | حذف خطوط اتصال فیله‌ها و پخ‌های مماس بر اساس زاویه دوسطحی |
| **درپوش‌گذاری استنسیل** | `Watertight Stencil Capping` | تکنیک دوپاسه بافر استنسیل GPU برای پر کردن توپر مقاطع برش‌خورده |
| **دید انفجاری شعاعی** | `Radial Exploded View` | باز شدن مونتاژ چندقطعه‌ای در راستای بردار مرکز جرم به همراه خطوط راهنما |
| **پایشگر سلامت ادمین** | `Admin Twin Telemetry Panel` | پنل پایش مصرف رم موتور Three.js، هیپ WASM و کش IndexedDB |
| **داک ابزار شناور** | `Floating Command Dock` | نوار ابزار معلق شیشه‌ای پایین بوم با آیکون‌های وکتور استاندارد |
| **کشو بازرسی اطلاعات** | `Collapsible Inspector Drawer` | پنل کشویی راست‌چین برای درخت قطعات، ابعاد و خواص فیزیکی |
| **مکعب ناوبری سه‌بعدی** | `NavCube / ViewCube` | مکعب سه‌بعدی گوشه تصویر جهت چرخش نرم زاویه دید به زوایای استاندارد |
| **قرارداد صلب داده** | `Strict Sealed IPC DTO` | ساختار تایپ‌شده غیرقابل جهش برای تبادل داده امن بین WPF و وب‌ویو |
| **انتقال بدون کپی** | `Zero-Copy Transferable Objects` | واگذاری مستقیم مالکیت ArrayBuffer بین رشته اصلی و وب‌ورکر |
| **اعتبارسنجی هش بسته** | `SHA-256 Checksum Validation` | تضمین اصالت و عدم دستکاری باینری‌های آپدیتر قبل از هرگونه اجرا |

