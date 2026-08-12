# Open-source foundations

CV Studio prefers small, composable open-source foundations over a large application framework. Browser dependencies are bundled locally with esbuild, so the editor remains usable without a CDN.

## Current components

- **CodeMirror 6** (`codemirror` 6.0.2 and official `@codemirror/*` packages, MIT): code editing, LaTeX syntax mode, search, history, selection, line numbers and keyboard behavior.
- **interact.js** 1.10.28 (MIT): pointer normalization, inertial dragging, resizing, movement restrictions and Agent snap interactions.
- **jsdiff** 8.0.3 (BSD-3-Clause): structured patch generation and validation for Agent-proposed file edits.
- **AI SDK** 7.0.55 with OpenAI / Anthropic providers (Apache-2.0): bounded server-side tool loop, provider adapters, step control and test models.
- **Zod** 4.4.3 (MIT): validates every Agent tool input before project code sees it.
- **esbuild** 0.28.1 (MIT, development dependency): creates the local browser bundle used by the static Node service.
- **PDF.js** (`pdfjs-dist` 5.4.624, Apache-2.0): renders compiled PDFs inside an application-owned canvas viewer with local page, zoom, fit, rotate, and download controls. This maintained release matches the Chromium runtime in Electron 38; only the renderer and worker are bundled, and resume content is never sent to a PDF service.
- **geekplux/cv_resume** (MIT): visual and structural basis for the material-bank CV generator. CV Studio includes the required copyright/license notice and generates a portable blue edition that avoids the original template's unavailable offline `moderncv` dependency and machine-specific font assumptions.

Browser assets use only local packages and system font stacks. CV Studio does not load fonts, scripts, or styles from a CDN.

## Selection rules

1. Prefer a focused library with a stable API and permissive license.
2. Keep user data local by default; package assets into the application rather than loading a remote runtime.
3. Avoid framework migrations unless a concrete feature cannot be delivered cleanly within the current native Node architecture.
4. Add tests around the integration boundary instead of assuming the dependency alone makes the feature robust.
