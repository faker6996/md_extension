# Preview Showcase

This file is a playground for checking the custom preview.

---

## Basic Markdown

### Text styles

Normal text, **bold text**, *italic text*, `inline code`, and a [link to VS Code](https://code.visualstudio.com/).

### Lists

- Alpha
- Beta
- Gamma

1. First
2. Second
3. Third

### Blockquote

> A preview is only useful if typography, spacing, colors, and diagrams all hold together.

### Table

| Service | Host | Status |
| --- | --- | ---: |
| API | `10.29.100.2` | 200 |
| Redis | `10.29.100.4` | 6379 |
| NFS | `10.29.100.3` | 2049 |

---

## HTML Blocks

<details open>
<summary><b>Expandable details block</b></summary>

- This checks safe HTML rendering.
- It also checks spacing inside `<details>`.

</details>

<div align="center">

### Centered Content

This paragraph should stay centered.

![Toolkit Icon](./resources/icon.png)

</div>

---

## Math

Inline math: $E = mc^2$

Block math:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

---

## Code Blocks

```ts
export function sum(a: number, b: number): number {
  return a + b;
}
```

```json
{
  "name": "mdx-exporter-lite",
  "preview": true,
  "formats": ["pdf", "docx", "png", "jpeg"]
}
```

---

## Badge Row

[![Version](https://img.shields.io/badge/version-0.3.28-2563eb)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-16a34a)](./LICENSE)
[![VSCode](https://img.shields.io/badge/vscode-1.85+-0ea5e9)](https://code.visualstudio.com/)

---

## Mermaid Flowchart

```mermaid
flowchart TD
    User[User / Browser] --> Gateway{Gateway}
    Gateway -->|active| App1[App 1]
    Gateway -->|standby| App2[App 2]
    App1 --> Redis[(Redis Master)]
    App2 --> Redis
    Redis --> Replica1[(Replica 1)]
    Redis --> Replica2[(Replica 2)]
    App1 --> Storage[(Shared Storage)]
    App2 --> Storage
```

## Mermaid Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Web
    participant API
    participant Redis
    User->>Web: Open dashboard
    Web->>API: Fetch summary
    API->>Redis: Read cached metrics
    Redis-->>API: Cache hit
    API-->>Web: JSON response
    Web-->>User: Render widgets
    Note over API,Redis: Check text color, arrows, labels, and note panel
```

## Mermaid Class Diagram

```mermaid
classDiagram
    class MarkdownPreviewPanel {
        +createOrShow()
        +update()
        -updateContent()
    }
    class PdfViewerProvider {
        +register()
        +resolveCustomEditor()
    }
    class MarkdownConverter {
        +markdownToHtml()
        +encodePlantUml()
    }
    MarkdownPreviewPanel --> MarkdownConverter : uses
    PdfViewerProvider --> MarkdownConverter : shares styles
```

## Mermaid State Diagram

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Rendering : open preview
    Rendering --> Stable : all assets loaded
    Stable --> Rendering : theme changed
    Rendering --> Error : invalid diagram
    Error --> Idle : retry
    Stable --> [*]
```

## Mermaid Gantt

```mermaid
gantt
    title Release Readiness
    dateFormat  YYYY-MM-DD
    section Preview
    Fix flowchart edges     :done,    p1, 2026-03-28, 2d
    Tune sequence colors    :active,  p2, after p1, 2d
    Tune class diagram      :         p3, after p2, 2d
    section Packaging
    Repair lint/build       :crit,    b1, 2026-03-29, 3d
    Publish update          :milestone, m1, 2026-04-02, 0d
```

## Mermaid Pie

```mermaid
pie title Export Formats Used
    "PDF" : 52
    "DOCX" : 24
    "PNG" : 14
    "JPEG" : 10
```

---

## Mixed Layout Stress Test

| Area | What to inspect |
| --- | --- |
| Typography | Headings, paragraph width, code font |
| Components | Tables, details, blockquotes, image alignment |
| Mermaid | Node fill, border contrast, line stroke, labels, arrowheads |
| Theme switch | Preview after toggling light/dark theme |

Final line for checking paragraph spacing after a large mixed document.
