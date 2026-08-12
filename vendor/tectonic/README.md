# Bundled Tectonic

The editor ships a platform-specific Tectonic binary and a local resource cache so the default resume template can render without a separate MacTeX installation or a network connection.

Current bundle:

- `darwin-arm64/tectonic`: Tectonic 0.15.0 for Apple Silicon macOS.
- `cache/`: resource cache used with `--only-cached`.

Tectonic is distributed under the MIT License. Source and release information: <https://github.com/tectonic-typesetting/tectonic>.

To add another release target, add a sibling directory named `<platform>-<arch>` (for example `win32-x64`) containing an executable named `tectonic`. The server selects the matching directory at runtime. Set `USE_BUNDLED_TECTONIC=1` to force the bundled binary when a system Tectonic is also installed.
