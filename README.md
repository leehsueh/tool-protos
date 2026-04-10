# tool-protos

A sandbox of small browser experiments — each one a single self-contained HTML file. No build step, no frameworks, no dependencies.

Live site: **https://leehsueh.github.io/tool-protos/**

## Purpose

A playground for Claude Code and other AI agents to quickly prototype ideas that run directly in the browser. Each experiment is independent, self-documenting, and immediately shareable via its GitHub Pages URL.

## Structure

```
tool-protos/
├── index.html                        # Landing page (auto-lists experiments)
├── experiments/
│   ├── _template.html                # Copy this to start a new experiment
│   └── text-case-converter.html      # Example experiment
└── .github/workflows/deploy.yml      # Auto-deploys to GitHub Pages on push to main
```

## How to add a new experiment

1. **Copy the template**
   ```
   cp experiments/_template.html experiments/your-experiment-name.html
   ```
   Use `kebab-case` for the filename — it becomes the display name on the index.

2. **Fill in the metadata** (in `<head>`)
   ```html
   <meta name="description" content="One sentence about what this does.">
   <meta name="date" content="2026-04-10">
   <meta name="tags" content="tag1, tag2">
   <title>Your Experiment Title</title>
   ```

3. **Write the docs** in the `<details>` section:
   - **About** — what the experiment does and why it's interesting
   - **How to use** — interaction instructions
   - **Technical details** — implementation notes, APIs used, key algorithms

4. **Build the experiment** in `<main>` using vanilla HTML + JS only. No `import`, no CDN scripts — everything inline.

5. **Commit and push to `main`**. GitHub Actions deploys automatically. The experiment appears on the index on the next page load.

## Rules / conventions

- **One file per experiment** — fully self-contained, no external assets
- **No build tools** — pure HTML, CSS, and vanilla JS only
- **Document it** — the `<details>` section is required; a future reader (or agent) should be able to understand what the experiment does without running it
- **Files starting with `_`** are excluded from the index (use for templates/drafts)

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) deploys the repo root as a static site to GitHub Pages on every push to `main`. No configuration needed beyond enabling GitHub Pages in the repo settings (source: GitHub Actions).
