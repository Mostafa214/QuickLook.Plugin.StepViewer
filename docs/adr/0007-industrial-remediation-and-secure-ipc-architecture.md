# ADR 0007: Industrial Remediation, Secure IPC, and Modular Decoupling

## Status
Accepted

## Context
A comprehensive forensic audit of the project against the 10 Industrial AI Dev Engine pillars identified several critical security and architectural risks:
1. **Security Vulnerability (XSS to Host RCE):** Unescaped single quotes (`'`) in `StepViewerControl.xaml.cs` when interpolating file names into `WebViewControl.CoreWebView2.ExecuteScriptAsync` allowed JavaScript injection inside WebView2. This script could send `PERFORM_AUTO_UPDATE` IPC messages to trigger arbitrary binary downloads and execute PowerShell scripts with `-ExecutionPolicy Bypass`.
2. **Monolithic File Ceilings Violation:** `Assets/viewer.html` contained 8,461 lines (17x the 500-line modular ceiling), and `StepViewerControl.xaml.cs` contained 924 lines (2.6x the 350-line adapter ceiling).
3. **Manual JSON Parsing (Buy Over Build Violation):** The C# host was using manual regex and string `IndexOf` parsing for IPC payloads instead of standard JSON serializers.
4. **Environment Portability (Dev-Prod Parity):** 33 test and automation scripts contained hardcoded paths to local developer directories (`C:\Users\Lenovo\...`).
5. **Resource Leaks:** Three.js `requestAnimationFrame` was not cancelled during disposal, and the WPF `DispatcherTimer` was not stopped upon cleanup.

## Decision
1. **Lock Down IPC with System.Text.Json & Typed DTOs:**
   - Add the official `System.Text.Json` package to the project.
   - Replace raw string concatenation and custom regex parsers with sealed DTOs (`IpcContracts.cs`).
   - Replace string-interpolated `ExecuteScriptAsync` with typed `PostWebMessageAsJson` messages.
2. **Mitigate Updater Security Risks:**
   - Enforce cryptographic SHA-256 hash validation before extracting or launching any downloaded update package.
   - Restrict update source URLs strictly to the official GitHub repository releases (`Mostafa214/QuickLook.Plugin.StepViewer`).
   - Require explicit user confirmation before executing any update.
3. **Modularize the Monolithic Front-End and Adapter:**
   - Decompose `viewer.html` into independent modules under 500 lines: `viewer.css`, `measureEngine.js`, `sectionEngine.js`, `assemblyTree.js`, and `adminTwin.js`.
   - Extract updater logic into `PluginUpdateService.cs` and WebView2 environment logic into `WebViewEnvironmentManager.cs`, keeping `StepViewerControl.xaml.cs` under 280 lines.
4. **Introduce Admin Twin:**
   - Implement an in-app telemetry and inspection panel (`adminTwin.js`) to monitor Three.js memory, WASM heap, IndexedDB cache utilization, and provide a 1-click cache purge.
5. **Establish Clean Dev-Prod Parity:**
   - Create a dedicated xUnit test project (`QuickLook.Plugin.StepViewer.Tests.csproj`) executable via `dotnet test`.
   - Remove hardcoded developer paths across all scripts and parameterize with `$PSScriptRoot`.

## Consequences
### Positive
- Fully neutralizes the RCE and Zip Slip attack vectors.
- Brings the codebase into full compliance with Industrial Dev Engine ceilings (<500 lines per source file, <350 lines per adapter).
- Provides deterministic unit testing with `dotnet test`.
- Eliminates memory leaks and runtime silent error suppression.

### Negative
- Requires updating the `.csproj` to include `System.Text.Json` and re-wiring front-end scripts into modular ES modules / script tags.
