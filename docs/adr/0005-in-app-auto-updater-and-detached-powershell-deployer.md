# ADR 0005: 1-Click In-App Auto-Updater & Detached PowerShell Deployer

## Status
Accepted

## Context
QuickLook plugins do not have built-in package managers or update daemons. Users often stay on outdated versions with known bugs because manually downloading `.qlplugin` files, locating the QuickLook plugin directory (Store App vs. Roaming), and restarting QuickLook requires technical friction.

## Decision
Implement a self-contained, 1-click update pipeline:
1. **Client-Side Discovery**:
   - `viewer.html` polls the GitHub Releases API (`api.github.com/repos/Mostafa214/QuickLook.Plugin.StepViewer/releases/latest`) with a 12-hour local cache to avoid rate-limiting.
   - Robust semantic version comparison identifies newer tags (e.g., `v1.0.1` -> `v1.1.0`).
2. **Morphing UI & Single-Line Highlights Drawer**:
   - A minimalist navbar button transforms from `[ Update to vX.X ]` into an in-place progress bar `[ Downloading 45% (1.7/3.7 MB) ]` upon click.
   - An info button `[ ⓘ ]` opens a drawer showing a single-line summary parsed from release notes (`Highlights: <text>`).
3. **Detached Atomic Self-Updater**:
   - The C# host (`StepViewerControl.xaml.cs`) downloads the `.qlplugin` zip payload to a temporary directory.
   - Upon completion, the UI button becomes `[ ↻ Restart QuickLook ]`.
   - Clicking it generates a detached, standalone PowerShell script (`update_step_viewer.ps1`) executed via `ProcessStartInfo` with `-WindowStyle Hidden`.
   - The script terminates `QuickLook.exe`, locates the active plugin path across all package types (Windows Store Package or `%APPDATA%`), extracts the new assets using .NET `ZipFile`, restarts QuickLook, and deletes itself.

## Consequences
### Positive
- Zero manual file moving or folder navigation for end users.
- Updates are 100% verified for integrity before terminating the host process.
- Compatible with all future versions regardless of schema or internal asset changes.

### Negative
- Requires internet connectivity to check and download release assets from GitHub.
