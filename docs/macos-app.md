# macOS app

CV Studio uses Electron as a thin, secure macOS shell around the existing local Node service. This keeps local filesystem access, the bundled Tectonic compiler, CodeMirror, and the AI SDK agent in one offline-capable application without duplicating the product in Swift.

## Development

```bash
npm install
npm run desktop:dev
```

The Electron renderer has `nodeIntegration` disabled, context isolation enabled, and Chromium sandboxing enabled. It only loads the loopback service started inside the app process.

## Build

```bash
npm run dist:mac
```

Ad-hoc signed Apple Silicon `.dmg` and `.zip` artifacts are written to `release/`. Ad-hoc signing lets Electron's helper processes run on current macOS versions without requiring a developer certificate, but it does not replace Developer ID signing and notarization for public distribution. The bundled Tectonic binary and cache are copied outside `app.asar` so macOS can execute them. On first launch, the default project is copied to `~/Library/Application Support/CV Studio/workspace`; later launches preserve the user's files.

For an isolated development launch, set `CV_STUDIO_USER_DATA_DIR` to an empty temporary directory. The seed copy deliberately excludes `.cvstudio.json` and generated LaTeX outputs so a newly installed app never inherits a developer's active project path.

For external distribution, configure an Apple Developer ID certificate and notarization credentials instead of the current ad-hoc identity (`-`).
