# CV Studio development guidelines

- Prefer mature, actively maintained, community-tested open-source components over bespoke infrastructure when they materially improve robustness.
- Keep the dependency set focused. Before adding a package, verify its maintenance status, license, bundle impact, and fit with the existing architecture.
- Bundle browser dependencies locally. Do not require a CDN or send resume content outside the machine unless the user explicitly configures a remote model provider.
- Test editor and layout changes against both the default `workspace/` project and a realistic multi-file LaTeX folder with nested sources and binary assets.
- Preserve keyboard access, `prefers-reduced-motion`, path validation, and content-conflict checks when extending the interface.
- Update `CHANGELOG.md` for every user-visible version.
