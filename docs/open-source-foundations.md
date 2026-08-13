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
- **geekplux/cv_resume** (MIT): visual and structural basis for the classic blue timeline generator. CV Studio includes the required copyright/license notice.
- **Awesome-CV** (LPPL-1.3c): visual reference for the compact single-column template with a centered header and red section rules.
- **AltaCV** (LPPL-1.3+): visual and semantic reference for the photo-capable main-column/sidebar template.
- **moderncv** banking style (LPPL-1.3c): visual reference for the restrained, linear ATS-oriented template.
- **Fandol** (GPL; TeX Live distribution): offline Chinese Song regular/bold fallback for generated XeLaTeX/xeCJK projects. macOS uses PingFang SC when installed. The required Fandol files and `xeCJK`/`fontspec` are verified against the bundled Tectonic manifest in tests.

The four CV outputs are original portable implementations built from the existing verified base packages; they do not copy or ship the upstream class files, icons, or assets. Every generated project records source URLs, license identifiers, template capabilities and its content-slot contract in `TEMPLATE-SOURCES.md` and `source-data.json`.

Browser assets use only local packages and system font stacks. CV Studio does not load fonts, scripts, or styles from a CDN.

## Selection rules

1. Prefer a focused library with a stable API and permissive license.
2. Keep user data local by default; package assets into the application rather than loading a remote runtime.
3. Avoid framework migrations unless a concrete feature cannot be delivered cleanly within the current native Node architecture.
4. Add tests around the integration boundary instead of assuming the dependency alone makes the feature robust.
