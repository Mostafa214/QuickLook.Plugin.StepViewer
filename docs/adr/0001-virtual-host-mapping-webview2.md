# ADR 0001: Virtual Host HTTPS Mapping in WebView2

## Status
Accepted

## Context
QuickLook STEP Viewer uses Microsoft Edge WebView2 (Chromium Embedded) to render 3D CAD models. The viewer relies on a dedicated background Web Worker (`stepWorker.js`) and loads a 7.7 MB WebAssembly binary (`occt-import-js.wasm`).
Under standard Chromium security rules, loading assets from `file:///` URLs triggers strict Cross-Origin Resource Sharing (CORS) blocks, preventing `new Worker('file:///...')` instantiation and WebAssembly `fetch()` requests.

## Decision
Register a virtual host domain mapping in the WPF host control using `CoreWebView2.SetVirtualHostNameToFolderMapping`:
- Virtual Origin: `https://step-viewer.local/`
- Target Folder: Local `Assets/` directory
- Access Kind: `CoreWebView2HostResourceAccessKind.Allow`

All internal HTML, JavaScript, and WebAssembly references load over virtual HTTPS (`https://step-viewer.local/viewer.html`).

## Consequences
### Positive
- Web Workers and WebAssembly load transparently with zero CORS violations.
- Direct streaming compilation of WASM (`WebAssembly.instantiateStreaming`) is fully enabled.
- Avoids fragile base64 inlining of the 7.7 MB WebAssembly binary.

### Negative
- Requires Windows 10/11 with Microsoft Edge WebView2 runtime installed (standard in modern Windows).
