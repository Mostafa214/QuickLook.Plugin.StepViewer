# Deep Technical Research: SolidWorks Native Formats (`.SLDPRT` & `.SLDASM`)

> **Purpose:** Reference dossier for adding native SolidWorks Part (`.sldprt`) and Assembly (`.sldasm`) support to `QuickLook.Plugin.StepViewer` without requiring a local SolidWorks installation, COM Interop, or proprietary Siemens Parasolid SDK.
> **Host License:** MIT — therefore only clean-room implementations and **MIT / Apache-2.0 / MPL-2.0** compatible libraries/specs may be used.

---

## 1. Executive Summary

SolidWorks files are **not** single-format documents. Across SolidWorks versions, `.SLDPRT` and `.SLDASM` use **two distinct outer container formats** and store **two independent representations of 3D geometry**:

1. **Pre-computed Tessellation (`Contents/DisplayLists`)**: Triangle strips + face/body colors saved by SolidWorks for fast display. Decodable directly in pure C# or JS/WASM with zero CAD kernel.
2. **Exact B-Rep (`Contents/Config-N-Partition` / `LocalBodies`)**: Compressed **Parasolid XT** transmit streams (`PS 00 00`). Note that **OpenCASCADE (`occt-import-js`) does NOT read Parasolid natively** — supporting exact B-Rep requires a Parasolid XT parser that translates analytic/NURBS entities into STEP or OCCT B-Rep.

**Key takeaway for QuickLook:**
- A **Tier-1 Implementation (DisplayLists + Assembly Tree + Metadata + Preview)** gives instant (<100ms) 3D preview of parts and assemblies, unit-accurate dimensions (stored in metres), colors, BOM/custom properties, and mass properties stored in XML — all without SolidWorks or Parasolid SDK.
- A **Tier-2 Implementation (Parasolid XT → STEP/B-Rep)** can later be layered on top using MIT/Apache-2.0 clean-room Parasolid parsers (such as `schwitters/openswx`'s `libopenparasolid` / `libopenswstep` or `cadmpeg`) for parts that lack display tessellation (e.g., some imported STEP bodies) or when exact B-Rep face topology is needed.

---

## 2. Container Architecture (Two Generations)

### 2.1 Generation 1: SolidWorks 2014 and Earlier — OLE2 / Compound File Binary (MS-CFB)
- **Detection:** First 8 bytes match OLE2 magic: `D0 CF 11 E0 A1 B1 1A E1`.
- **Structure:** Standard Microsoft CFB v3 (512-byte sectors) or v4 (4096-byte sectors), mini-stream cutoff 4096 bytes (64-byte mini-sectors).
- **Stream Paths:** UTF-16LE directory entries forming paths such as:
  - `ISolidWorksInformation`
  - `PreviewPNG` / `Config-N-PreviewPNG`
  - `Contents/DisplayLists__ZLB`
  - `Contents/Config-0-Partition__ZLB`
  - `docProps/custom.xml`, `docProps/ISolidWorksInformation.xml`
  - `swXmlContents/COMPINSTANCETREE`
- **Nested `__ZLB` Wrapper:** Streams ending in `__ZLB` start with a 16-byte magic:
  `23 1d d5 71 da 81 48 a2 a8 58 98 b2 1b 89 ef 99`
  followed by `uncompressed_size` (`u32 LE`), `zlib_member_size` (`u32 LE`), a complete zlib stream, and an 8-byte trailer.
- **C# Reader Option:** `OpenMcdf` NuGet package (**MPL-2.0**, supports `net48`) can read CFB containers directly in C#.

### 2.2 Generation 2: SolidWorks 2015 and Later — Flat Compressed Block Container
Modern `.SLDPRT` / `.SLDASM` files are **NOT** OLE2 files (`olefile` / CFB readers reject them). Instead, they are a flat sequence of ZIP-local-header-like blocks:
- **Outer Header (8 bytes):** `file_id` (`u32`) + `version` (`u32 BE`, observed `0x00000004`).
- **Block Signature / Marker:** `14 00 06 00 08 00` (4 bytes after a substituted 4-byte local signature token; corresponds to ZIP `version_needed=20`, `flags=6`, `method=8` raw DEFLATE).
- **Block Header Layout (starting at `14 00 06 00 08 00`):**
  ```text
  +0   marker      bytes[6]   14 00 06 00 08 00
  +6   type_id     u32 LE     (packed MS-DOS time/date, NOT payload type)
  +10  crc32       u32 LE     CRC-32 of the DECOMPRESSED payload
  +14  comp_sz     u32 LE     compressed payload size
  +18  uncomp_sz   u32 LE     uncompressed payload size
  +22  name_len    u16 LE     (plus u16 extra_len at +24; together u32 pre_sz when extra_len==0)
  +26  encoded_name[name_len] (+ extra[extra_len]) -> raw-DEFLATE[comp_sz]
  ```
- **Critical Obfuscation — Nibble-Swapped Member Names:**
  Every byte of the member name has its high and low 4-bit nibbles swapped:
  `decoded_byte = ((b & 0x0F) << 4) | ((b & 0xF0) >> 4)`.
  Reversing the nibble swap reveals clean UTF-8/ASCII paths:
  `Contents/DisplayLists`, `Contents/Config-0-Partition`, `PreviewPNG`, `swXmlContents/COMPINSTANCETREE`, `docProps/custom.xml`, etc.
- **Cache-Cell Grid:** Gaps between real blocks contain a fixed-cell index grid reusing the `14 00 06 00 08 00` marker where `field@+10 == 2*L`, `field@+14 == L//2`, `field@+18 == L`. Validating CRC-32 + raw-DEFLATE end-of-stream cleanly distinguishes real blocks from index cache cells.

---

## 3. Internal Stream Payloads & Geometry Extraction

### 3.1 Payload Family Identification (by Decompressed Bytes)
| Signature / Token | Family | Content |
|---|---|---|
| `89 50 4E 47` | PNG Preview | Rendered thumbnail (`PreviewPNG`, `Config-N-PreviewPNG`) |
| `BITMAPINFOHEADER` (size 40) | BMP Thumbnail | Legacy preview image |
| `D0 CF 11 E0 A1 B1 1A E1` | Nested OLE2 | Embedded legacy storage |
| `uoTempBodyTessData_c` / `uoTempFaceTessData_c` | DisplayLists | Pre-tessellated triangle-strip display mesh |
| `PS 00 00` or chained `23 1d d5 71 ...` | Parasolid XT | Exact B-Rep solid/sheet geometry |
| `<?xml` / UTF-16 BOM `FF FE` | XML Metadata | `COMPINSTANCETREE`, `custom.xml`, `ISolidWorksInformation.xml` |

### 3.2 `Contents/DisplayLists` — Triangle-Strip Display Mesh
- SolidWorks saves display tessellation in **triangle strips** inside tables of descriptors (marked by `uoTempBodyTessData_c` and `uoTempFaceTessData_c`), **not** plain triangle triples.
- Each descriptor header has: `(item_size u32 LE, kind u32 LE, version u32 LE = 2, count u32 LE, data...)`.
- A triangle strip of $n$ vertices decodes to $n - 2$ triangles (alternating winding order on odd triangles to preserve outward face normals).
- **Units:** Coordinates in `DisplayLists` are stored in **metres** (multiply by `1000.0` to match `StepViewer`'s millimetre world space).
- **Colors & Appearances:** Body default colors, feature appearances (`VisualStates`), and face-local appearances are stored alongside or in associated streams.
- **Known Edge Case:** Parts created purely by importing `.step`/`.iges` without SolidWorks display tessellation cached may have empty `DisplayLists`, with geometry present only in `Config-N-FeatureBodies/LocalBodies` (Parasolid XT).

### 3.3 `.SLDASM` Assemblies (`swXmlContents/COMPINSTANCETREE`)
- Assembly structure and component placements are stored in the XML stream `swXmlContents/COMPINSTANCETREE` (root `<swSolidWorks>`):
  - `swHeader/swFile`: lists the assembly and every referenced part/sub-assembly file path.
  - `swModelList/swModel`: represents `(document, configuration)` pairs as a DAG (supporting multi-instance sub-assemblies).
  - `swReference`: child instances inside an assembly model, carrying:
    - `swModelRef` (target part/subassembly configuration)
    - `swTransform`: **4×4 row-vector transformation matrix** (`p' = p * M`) with translation in **metres** (scale translation by `1000.0` for mm).
    - `suppressed` / `hidden` / `excluded from BOM` flags.
    - Virtual components: stem formatted as `<name>^<assembly>`, stored internally in section `<name>-sldprt`.
- **Important `.SLDASM` Behavior:**
  - `.SLDASM` often caches component display meshes inside itself, **or** omits uncached parts and expects them to be read from external `.SLDPRT` files referenced in `swHeader/swFile` (typically located in the same folder or relative subdirectories).
  - In `QuickLook.Plugin.StepViewer`, because `WebViewEnvironmentManager.cs` intercepts virtual host requests in the **C# host process**, C# has direct read-only disk access to resolve sibling `.SLDPRT` files in the same directory as the `.SLDASM`!

### 3.4 Embedded Metadata & Mass Properties
- `docProps/custom.xml` & `docProps/Config-N-Properties.xml`: Author, PartNo, Description, Material, custom properties.
- `docProps/ISolidWorksInformation.xml`: SolidWorks-saved mass, volume, surface area, center of mass, inertia tensor (when saved with the file).
- `PreviewPNG`: Instant fallback preview image if a file contains no cached tessellation.

---

## 4. Existing Open-Source Projects & Compatibility Audit

| Project | Language | License | What It Parses | Key Notes for `StepViewer` |
|---|---|---|---|---|
| **[schwitters/openswx](https://github.com/schwitters/openswx)** | C++20 (zero-dep) | **MIT** | Both OLE2 (≤2014) & Modern (2015+), `docProps/*.xml`, `PreviewPNG`, `COMPINSTANCETREE`, `libopenparasolid`, `libopenswstep` (STEP export!) | **Best MIT-compatible reference/library.** Can be compiled to WebAssembly (loaded lazily in a worker) or native `x64` DLL P/Invoked from C#. |
| **[XRTC5/sldprt-export](https://github.com/XRTC5/sldprt-export)** | Python + JS | **MIT** | Modern block container (CRC-32, nibble-swap), `DisplayLists` triangle strips, `.SLDASM` `COMPINSTANCETREE` + sibling `.SLDPRT` resolution, STL/3MF export | Clean-room, concise, directly demonstrates exact `DisplayLists` descriptor-table decoding and triangle strip unwinding. |
| **[cadmpeg/cadmpeg](https://github.com/cadmpeg/cadmpeg)** | Rust + Spec | **Apache-2.0** (code) / **CC-BY-4.0** (spec) | Exhaustive `docs/formats/sldprt.md` spec, OLE2 + Modern blocks, `DisplayLists`, `COMPINSTANCETREE`, Parasolid XT B-Rep & NURBS | Authoritative format specification; machine-verified layout tables (`docs/layouts/sldprt.toml`). |
| **[BlinkingSun/sldprt2step](https://github.com/BlinkingSun/sldprt2step)** | Pure Python | **Apache-2.0** | OLE2 + Parasolid XT (`SCH_13006`) → STEP AP214 (parts only) | Useful reference for Parasolid XT → STEP AP214 mapping. |
| **[OpenMcdf](https://www.nuget.org/packages/OpenMcdf/)** | C# (`net48`) | **MPL-2.0** | OLE2 MS-CFB container reader | Production-ready NuGet package for C# `StepMetadataParser` and pre-2015 `.sldprt`/`.sldasm` unpacking. |
| **[cehaho/OpenSW](https://github.com/cehaho/OpenSW)** | JS / WASM | **AGPL-3.0-only** | `.SLDPRT` → Parasolid/STEP, `.SLDASM` → STL | **DO NOT COPY CODE** (AGPL-3.0 is incompatible with our MIT license). |
| **[dsandall/sld2step](https://github.com/dsandall/sld2step)** | Python (`sldprt2xt` + `OCP`) | **AGPL-3.0-only** | `.SLDPRT`/`.SLDASM` → STEP AP214 | **DO NOT COPY CODE** (AGPL-3.0). |

---

## 5. Recommended Integration Architecture for `QuickLook.Plugin.StepViewer`

1. **C# Host (`StepMetadataParser.cs` + `WebViewEnvironmentManager.cs`):**
   - Register `.sldprt`, `.sldasm` in `Plugin.cs`.
   - Validate magic bytes in `< 2ms`: either OLE2 (`D0 CF 11 E0 A1 B1 1A E1`) + SolidWorks stream check, OR modern SW header/block marker (`14 00 06 00 08 00`) with nibble-swapped directory name check.
   - Extract `docProps/ISolidWorksInformation.xml` / `custom.xml` for QuickLook window title (`PartName — [SolidWorks 2024]`).
   - Add a C# Virtual Host endpoint `https://cad-stream.local/cad-sibling?name=<encodedFileName>` (strictly confined to the parent directory of `_currentFilePath` + extension `.sldprt`/`.sldasm`, no `..` traversal) so `.SLDASM` can fetch referenced local `.SLDPRT` files safely without exposing arbitrary filesystem paths to WebView2.

2. **Tier A (Phase 6A — Fast Display Mesh Engine, MIT Clean-Room):**
   - Implement `Assets/js/solidworksLoader.js` (or WASM module) inside a Web Worker:
     - Unpack Modern (`14 00 06 00 08 00` + nibble-swap + `fflate` raw DEFLATE + CRC-32 check) and OLE2 (via C# `OpenMcdf` or JS CFB reader + `__ZLB` zlib inflate).
     - Parse `Contents/DisplayLists` (`uoTempBodyTessData_c` / `uoTempFaceTessData_c`) triangle strips into `Float32Array` positions/normals/colors scaled from metres → millimetres (`× 1000`).
     - For `.SLDASM`: parse `swXmlContents/COMPINSTANCETREE`, apply `swTransform` 4×4 row-vector matrices (`× 1000` on translation), skip suppressed instances, resolve virtual `<name>^<assembly>` sections, and fetch external sibling `.SLDPRT` files if uncached.
     - Feed output directly into existing `onTessellationComplete()` + `MeshFeatureDetector.detectFeatures()` so Measure, Section, Explode (automatically enabled for multi-body `.SLDASM`!), Blueprint, and 3D Print Estimator all work out of the box.
     - Fallback: if a part has zero tessellation (e.g., imported STEP with no DisplayLists), display embedded `PreviewPNG` with an informative banner rather than a blank error.

3. **Tier B (Phase 6B — Exact B-Rep / Parasolid XT Upgrade):**
   - Integrate `schwitters/openswx` (`libopenswx` + `libopenparasolid` + `libopenswstep`, MIT) compiled to WebAssembly (`openswx.wasm`) or native `win-x64` DLL to convert embedded Parasolid XT streams to STEP/B-Rep on demand when `DisplayLists` is absent or when user requests exact B-Rep face topology.
