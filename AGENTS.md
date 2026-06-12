# Agent guidelines for tool-protos

This file captures conventions and non-obvious requirements for AI agents
(Claude Code and similar) working in this repository.

---

## Adding a new experiment — checklist

1. Create `experiments/<kebab-case-name>.html` (copy from `experiments/_template.html`)
2. Fill in `<title>` and `<meta name="description">` in `<head>`
3. Write the `<details>` documentation block (About, How to use, Technical details)
4. Build the experiment in `<main>` — vanilla HTML/CSS/JS only, no imports, no CDN
5. Commit and push to `main`

**No manual registration in `index.html` is needed.** The index auto-discovers
all `.html` files in `experiments/` (excluding `_`-prefixed ones) via the
GitHub Contents API and renders them as cards automatically on the next page
load.

> Note: auto-discovery only reflects the **default branch** (`main`). Experiments
> on feature branches are reachable by direct URL but won't appear on the index
> until the branch is merged.

---

## Experiment file conventions

- **One file per experiment** — fully self-contained, no external assets or imports
- **Filename**: `kebab-case.html` — shown as "Kebab Case" on the index
- **Required meta tags** in `<head>`:
  ```html
  <meta name="description" content="One sentence about what this does.">
  <title>Human Readable Title</title>
  ```
- **`<details>` documentation block** is required — include About, How to use,
  and Technical details sections (see `_template.html`)
- **Files starting with `_`** are excluded from the index (use for templates/drafts)
- **No build tools** — vanilla HTML/CSS/JS only; no CDN scripts, no `import`

---

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) deploys the repo root to
GitHub Pages on every push to `main`. No configuration needed.
