# Export Flow Audit

## Goal

Make exported output, especially `PDF`, `PNG`, and `JPEG`, match the preview layout as closely as possible.

## Current State

### Strengths

- Preview rendering is now visually richer and supports README-style HTML, badge rows, Mermaid, and code-block copy controls.
- PDF and image export now share the same render-profile-aware `markdownToHtml()` renderer, theme model, and width model.
- DOCX export now supports more HTML-style alignment and inline image badge patterns than before.
- PDF/PNG/JPEG export reuses a shared browser instance with idle shutdown, so repeated exports avoid unnecessary browser startup cost.

### Structural Problems

1. Preview remains interactive while exported files are intentionally non-interactive, so parity is high but not a literal DOM clone.
2. DOCX export is semantic, not WYSIWYG, so it should not be treated as the “preview-matching” target.
3. Fidelity tests now cover HTML structure and export smoke paths, but they are not pixel-diff visual regression tests yet.
4. PlantUML export still depends on the public PlantUML server.

## Recommended Phases

### Phase 1

- Introduce a shared render profile for preview and export.
- Let `PDF` and `PNG/JPEG` choose theme from the active VS Code theme.
- Move export closer to preview layout by using the same content-width model.

Status: Implemented in this turn.

### Phase 2

- Unify Mermaid configuration between preview and export so diagram colors and spacing match.
- Keep preview interactivity, but use the same visual theme tokens for export.
- Move export code blocks closer to preview layout without bringing interactive controls into files.

Status: Implemented in this turn.

### Phase 3

- Replace regex-based HTML post-processing with markdown-it renderer rules for badge rows, code cards, and other layout transforms.
- This reduces fragility and makes preview/export parity more reliable.

Status: Implemented in this turn.

### Phase 4

- Add export theme settings and possibly layout settings:
  - `matchPreview`
  - `light`
  - `dark`
- Optionally add `readable` vs `fluid` export width modes.

Status: Implemented in this turn.

### Phase 5

- Add end-to-end export fidelity tests:
  - preview HTML structure tests
  - image export smoke tests
  - PDF export smoke tests

Status: Implemented in this turn.

## Practical Product Direction

- Treat preview as the canonical renderer.
- Treat `PDF`, `PNG`, and `JPEG` as non-interactive renderings of that same visual system.
- Treat `DOCX` as a semantic export format, not a perfect WYSIWYG preview clone.

## Completed In This Round

- Added this audit report.
- Began Phase 1 implementation by moving export onto a render-profile model.
- Matched export theme closer to preview theme.
- Moved export layout toward the same width strategy as preview.
- Added Phase 2 export code-block parity so exported HTML/PDF/PNG/JPEG keep the preview-like card layout without copy controls.
- Added Phase 3 markdown-it token/renderer rules for badge rows and code cards, replacing the most fragile regex HTML rewrites.
- Added Phase 4 export settings for both theme and width mode so PDF/PNG/JPEG can explicitly use `matchPreview`, `fluid`, or `readable` layout behavior.
- Added Phase 5 smoke tests that generate real `PNG` and `PDF` exports from preview-grade HTML and verify the files are produced successfully.
- Added shared browser reuse with idle shutdown for PDF/PNG/JPEG export, reducing repeated Puppeteer startup overhead.
- Added a dedicated export test that verifies consecutive `PNG` and `PDF` exports reuse the same shared browser session before idle shutdown.
