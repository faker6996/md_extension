<div align="center">

# 📄 MD & PDF Toolkit

### _Your All-in-One Markdown Powerhouse for VS Code_

A lightweight VS Code extension for previewing, exporting, and converting Markdown files — **no external dependencies** needed.

[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.3.24-8b5cf6?style=for-the-badge)](CHANGELOG.md)

**Export to PDF** · **Export to DOCX** · **Export to PNG/JPEG** · **Built-in PDF Viewer** · **Live Preview**

---

</div>

## ✨ Highlights

|     | Feature                 | Description                                             |
| --- | ----------------------- | ------------------------------------------------------- |
| ⚡  | **Zero Setup**          | No Pandoc, no wkhtmltopdf — works right out of the box  |
| 📊  | **Mermaid & PlantUML**  | Render flowcharts, sequence diagrams, and UML natively  |
| ➗  | **LaTeX / KaTeX**       | Beautiful math equations with `$...$` and `$$...$$`     |
| 🔍  | **Built-in PDF Viewer** | Search, copy, and navigate PDFs without leaving VS Code |
| 🎨  | **Custom CSS**          | Style your exports exactly the way you want             |
| 🔒  | **Privacy First**       | Zero telemetry, zero data collection                    |

---

## 🚀 Quick Start

```
1. Install the extension from VS Code Marketplace
2. Open any .md file
3. Use Ctrl+Shift+P → type "MDX" → pick a command
4. Done! 🎉
```

---

## 📦 Export Formats

<table>
<tr>
<td width="50%" valign="top">

### 📕 PDF Export

- Full Markdown rendering
- Syntax-highlighted code blocks
- Mermaid & PlantUML diagrams
- Math equations (KaTeX)
- Emoji support
- Custom headers & footers
- Auto wide-page for long code lines
- Page formats: A3, A4, A5, Letter, Legal

</td>
<td width="50%" valign="top">

### 📘 DOCX Export

- Proper Word heading styles
- Bold, italic, inline code
- Formatted tables
- Blockquotes with indentation
- Ordered & unordered lists
- Embedded images
- **No Chrome needed!**

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🖼️ Image Export (PNG / JPEG)

- Full-page screenshot of rendered Markdown
- Configurable JPEG quality (0–100)
- Same rendering engine as PDF
- Perfect for sharing on social media

</td>
<td width="50%" valign="top">

### 🔄 DOCX Conversion

- **DOCX → PDF** — convert Word docs to PDF
- **DOCX → Markdown** — extract content as `.md`
- Right-click any `.docx` in Explorer

</td>
</tr>
</table>

---

## 🎯 Commands

| Command                         | Description                      | Shortcut |
| ------------------------------- | -------------------------------- | -------- |
| `MDX: Open Preview to Side`     | Live Markdown preview panel      | —        |
| `MDX: Export to PDF`            | Export with save dialog          | —        |
| `MDX: Quick Export to PDF`      | Export to default path instantly | —        |
| `MDX: Export to DOCX`           | Export as Word document          | —        |
| `MDX: Quick Export to DOCX`     | Quick export Word doc            | —        |
| `MDX: Export to PNG`            | Export as PNG image              | —        |
| `MDX: Export to JPEG`           | Export as JPEG image             | —        |
| `MDX: Convert DOCX to PDF`      | Convert `.docx` → `.pdf`         | —        |
| `MDX: Convert DOCX to Markdown` | Convert `.docx` → `.md`          | —        |

> 💡 **Tip:** Access commands via **Command Palette** (`Ctrl+Shift+P`), **editor title bar icons**, **right-click context menu**, or **Explorer sidebar context menu**.

---

## ⚙️ Configuration

Configure in VS Code Settings (`Ctrl+,` / `Cmd+,`) under **MDX Exporter Lite**.

<details>
<summary><b>🗂️ General Settings</b></summary>

| Setting                | Type      | Default | Description                                       |
| ---------------------- | --------- | ------- | ------------------------------------------------- |
| `outputDirectory`      | `string`  | `""`    | Default output directory (empty = same as source) |
| `openAfterExport`      | `boolean` | `true`  | Auto-open file after export                       |
| `saveBeforeExport`     | `boolean` | `true`  | Auto-save before export                           |
| `formatBeforeExport`   | `boolean` | `true`  | Auto-format before export                         |
| `quickExportOverwrite` | `boolean` | `false` | Overwrite without prompting on quick export       |

</details>

<details>
<summary><b>📄 PDF Settings</b></summary>

| Setting                     | Type      | Default      | Description                                  |
| --------------------------- | --------- | ------------ | -------------------------------------------- |
| `pdfPageFormat`             | `string`  | `A4`         | Page format (A4, Letter, Legal, A3, A5)      |
| `pdfMargin`                 | `string`  | `20mm`       | Page margin (e.g. `20mm`, `1in`)             |
| `displayHeaderFooter`       | `boolean` | `false`      | Show header/footer in PDF                    |
| `headerTemplate`            | `string`  | `""`         | HTML template for PDF header                 |
| `footerTemplate`            | `string`  | _page/total_ | HTML template for PDF footer                 |
| `autoWidePageForCodeBlocks` | `boolean` | `true`       | Auto switch to wide page for long code lines |
| `wideLineThreshold`         | `number`  | `140`        | Character threshold for wide-page trigger    |
| `widePageFormat`            | `string`  | `A3`         | Page format in wide mode                     |
| `widePageMargin`            | `string`  | `10mm`       | Page margin in wide mode                     |

</details>

<details>
<summary><b>🎨 Styling & Preview</b></summary>

| Setting                    | Type      | Default | Description                         |
| -------------------------- | --------- | ------- | ----------------------------------- |
| `styles`                   | `array`   | `[]`    | Custom CSS file paths for exports   |
| `allowRawHtmlInPreview`    | `boolean` | `false` | Allow raw HTML in preview           |
| `allowUnsafeEvalInPreview` | `boolean` | `false` | Enable `unsafe-eval` in preview CSP |
| `jpegQuality`              | `number`  | `90`    | JPEG export quality (0–100)         |

</details>

---

## 📝 Supported Markdown Features

<table>
<tr>
<td width="50%" valign="top">

**Standard Markdown**

- Headings (`h1`–`h6`)
- **Bold**, _italic_, `inline code`
- Code blocks with syntax highlighting
- Tables, blockquotes, lists
- Links, images, horizontal rules

</td>
<td width="50%" valign="top">

**Extended Features**

- 📊 Mermaid diagrams (flowchart, sequence, etc.)
- 🔬 PlantUML diagrams (`@startuml...@enduml`)
- ➗ Math equations (`$x^2$`, `$$\int f(x)dx$$`)
- 😄 Emoji shortcodes (`:smile:` → 😄)

</td>
</tr>
</table>

---

## 📋 Requirements

| Export Type          | Requires                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| **PDF / PNG / JPEG** | [Google Chrome](https://www.google.com/chrome/), [Chromium](https://www.chromium.org/), or Microsoft Edge |
| **DOCX**             | ✅ Nothing — works immediately!                                                                           |

> 📌 Most systems already have Chrome or Edge installed. The extension auto-detects installed browsers.

---

## 🔧 Troubleshooting

<details>
<summary><b>❌ PDF export fails — "Chrome not found"</b></summary>

The extension uses Chrome/Chromium/Edge for PDF generation. Install one of:

- [Google Chrome](https://www.google.com/chrome/)
- [Chromium](https://www.chromium.org/)
- Microsoft Edge (pre-installed on Windows 10/11)

</details>

<details>
<summary><b>❌ Images not appearing in export</b></summary>

- Use **relative paths** for images in your Markdown
- Ensure image files exist at the specified location
- Check that image file extensions match (case-sensitive on Linux)

</details>

<details>
<summary><b>❌ Export takes too long</b></summary>

- Large documents with many images may take extra time
- Complex tables or diagrams increase processing time
- Try breaking very large documents into smaller files

</details>

<details>
<summary><b>❌ Mermaid diagrams show as raw code</b></summary>

- Make sure you're using fenced code blocks with the `mermaid` language tag
- If using the preview, you may need to enable `allowUnsafeEvalInPreview`
- In exports, Mermaid rendering is automatic

</details>

---

## 🏗️ Architecture

```
src/
├── extension.ts          # Extension entry point & command registration
├── logging.ts            # Logging utilities
├── commands/             # Command handlers (export, preview, convert)
├── converters/           # Core conversion engines (MD→PDF, MD→DOCX, etc.)
├── preview/              # Custom WebView preview panel
├── pdf-viewer/           # Built-in PDF viewer implementation
└── types/                # TypeScript type definitions
```

---

## 🔐 Privacy

**This extension does not collect any telemetry or user data.** All processing happens locally on your machine.

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. 🐛 [Report bugs](https://github.com/bachtv/mdx-exporter-lite/issues)
2. 💡 [Request features](https://github.com/bachtv/mdx-exporter-lite/issues)
3. 🔀 [Submit pull requests](https://github.com/bachtv/mdx-exporter-lite/pulls)

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 📌 Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

---

<div align="center">

Made with ❤️ by [bachtv](https://github.com/bachtv)

</div>
