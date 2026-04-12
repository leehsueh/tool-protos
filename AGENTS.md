# Agent guidelines for tool-protos

This file captures conventions and non-obvious requirements for AI agents
(Claude Code and similar) working in this repository.

---

## Adding a new experiment — required checklist

When creating a new experiment, **both** of these files must be updated:

| File | What to do |
|------|------------|
| `experiments/<name>.html` | Create the experiment (copy from `_template.html`) |
| `index.html` | Add an entry to the `EXPERIMENTS` array |

### Why the index.html step is mandatory

`index.html` renders its experiment cards from a **hardcoded `EXPERIMENTS`
array** — it does **not** auto-discover files in the `experiments/` directory.
A new `.html` file that is not registered in that array will not appear on the
index page, locally or in production.

```js
// In index.html — add your entry here, in alphabetical order:
const EXPERIMENTS = [
  { name: 'my-new-experiment.html', desc: 'One sentence description.' },
  // ...
];
```

---

## Experiment file conventions

- **One file per experiment** — fully self-contained, no external assets or imports
- **Filename**: `kebab-case.html` — shown as "Kebab Case" on the index
- **Required meta tags** in `<head>`:
  ```html
  <meta name="description" content="One sentence about what this does.">
  <title>Human Readable Title</title>
  ```
- **`<details>` documentation block** is required — include About, How to use, and Technical details sections (see `_template.html`)
- **Files starting with `_`** are excluded from the index by convention (use for templates or drafts)
- **No build tools** — vanilla HTML/CSS/JS only; no CDN scripts, no `import`

---

## Deployment

- GitHub Actions (`.github/workflows/deploy.yml`) deploys the repo root to GitHub Pages on every push to `main`
- Experiments on feature branches are accessible by their direct path but do not appear on the deployed index until merged to `main`
- To preview locally, open `index.html` directly in a browser — the static `EXPERIMENTS` array means no server or network access is needed
