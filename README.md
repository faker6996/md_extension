# MDX Exporter Lite

A lightweight VS Code extension for previewing and exporting Markdown files to PDF and DOCX. **No external dependencies required** - works right out of the box!

![VS Code Version](https://img.shields.io/badge/VS%20Code-1.85%2B-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **📖 Markdown Preview**: Open the built-in VS Code Markdown preview side-by-side
- **📄 Export to PDF**: Convert Markdown files to PDF format
- **📝 Export to DOCX**: Convert Markdown files to Word documents
- **🖼️ Export to PNG/JPEG**: Export Markdown as images
- **📊 Mermaid Diagrams**: Render flowcharts and diagrams
- **🔬 PlantUML**: Create UML diagrams (`@startuml...@enduml`)
- **➗ Math/KaTeX**: Render LaTeX equations (`$...$`, `$$...$$`)
- **😊 Emoji Support**: Use emoji shortcodes (`:smile:` → 😄)
- **🎨 Custom CSS**: Apply your own styles to exports
- **📃 PDF Header/Footer**: Add page numbers and dates
- **🔍 PDF Viewer**: Built-in PDF viewer with search and copy
- **📁 DOCX Conversion**: Convert DOCX to PDF or Markdown
- **⚡ Quick Export**: Export without save dialog
- **🎯 Multiple Access Points**: Command Palette, context menu, editor title
- **⚙️ Customizable**: Configure output directory, PDF format, margins
- **🔒 Privacy First**: No telemetry or data collection
- **🚀 Zero External Dependencies**: No Pandoc needed

## Requirements

### For PDF/PNG/JPEG Export

- **Google Chrome**, **Chromium**, or **Microsoft Edge** (most systems already have one installed)

### For DOCX Export

- No additional requirements - works immediately!

## Usage

### Commands

| Command                         | Description                             |
| ------------------------------- | --------------------------------------- |
| `MDX: Open Preview to Side`     | Open Markdown preview in side panel     |
| `MDX: Export to PDF`            | Export current Markdown to PDF          |
| `MDX: Quick Export to PDF`      | Export to default PDF path (no dialog)  |
| `MDX: Export to DOCX`           | Export current Markdown to DOCX         |
| `MDX: Quick Export to DOCX`     | Export to default DOCX path (no dialog) |
| `MDX: Export to PNG`            | Export Markdown as PNG image            |
| `MDX: Export to JPEG`           | Export Markdown as JPEG image           |
| `MDX: Convert DOCX to PDF`      | Convert Word document to PDF            |
| `MDX: Convert DOCX to Markdown` | Convert Word document to Markdown       |

### Access Methods

1. **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Type "MDX" to see all available commands

2. **Editor Title Button**
   - When viewing a Markdown file, click the icons in the editor title bar

3. **Context Menu**
   - Right-click on a `.md` or `.docx` file in the Explorer sidebar

### Export Workflow

1. Open a Markdown file
2. Choose an export command
3. Select the output location in the save dialog
4. Wait for export to complete
5. Click "Open File" or "Reveal in File Explorer" to access the result

> Note: PDF files opened via "Open File" will use the built-in **MDX PDF Viewer** inside VS Code.

## Extension Settings

Configure the extension in VS Code settings (`Ctrl+,` / `Cmd+,`):

| Setting                            | Type    | Default | Description                                 |
| ---------------------------------- | ------- | ------- | ------------------------------------------- |
| `mdxExporter.outputDirectory`      | string  | (empty) | Default output directory                    |
| `mdxExporter.openAfterExport`      | boolean | `true`  | Open file after export                      |
| `mdxExporter.saveBeforeExport`     | boolean | `true`  | Auto-save before export                     |
| `mdxExporter.formatBeforeExport`   | boolean | `true`  | Auto-format before export                   |
| `mdxExporter.quickExportOverwrite` | boolean | `false` | Quick export overwrites without prompting   |
| `mdxExporter.pdfPageFormat`        | string  | `A4`    | PDF page format (A4, Letter, Legal, A3, A5) |
| `mdxExporter.pdfMargin`            | string  | `20mm`  | PDF page margin                             |
| `mdxExporter.autoWidePageForCodeBlocks` | boolean | `true`  | Auto switch to wide PDF page when code lines are long |
| `mdxExporter.wideLineThreshold`    | number  | `140`   | Line length that triggers wide page for code blocks |
| `mdxExporter.widePageFormat`       | string  | `A3`    | Page format when wide mode is triggered     |
| `mdxExporter.widePageMargin`       | string  | `10mm`  | Page margin when wide mode is triggered     |
| `mdxExporter.displayHeaderFooter`  | boolean | `false` | Show header/footer in PDF                   |
| `mdxExporter.headerTemplate`       | string  | (empty) | PDF header template                         |
| `mdxExporter.footerTemplate`       | string  | ...     | PDF footer template                         |
| `mdxExporter.styles`               | array   | `[]`    | Custom CSS file paths                       |
| `mdxExporter.allowRawHtmlInPreview` | boolean | `false` | Allow raw HTML in custom preview            |
| `mdxExporter.allowUnsafeEvalInPreview` | boolean | `false` | Enable `unsafe-eval` in preview CSP         |
| `mdxExporter.jpegQuality`          | number  | `90`    | JPEG export quality (0-100)                 |

## Supported Markdown Features

### PDF/PNG/JPEG Export

- Headings (h1-h6)
- Bold, italic, inline code
- Code blocks with syntax highlighting
- Tables
- Blockquotes
- Lists (ordered and unordered)
- Links and Images
- Horizontal rules
- **Mermaid diagrams** (flowcharts, sequence diagrams, etc.)
- **PlantUML diagrams** (`@startuml...@enduml`)
- **Math equations** (inline `$x^2$`, display `$$\int f(x)dx$$`)
- **Emoji** (`:smile:` → 😄)

### DOCX Export

- Headings with proper Word styles
- Bold, italic, inline code
- Code blocks
- Tables with formatting
- Blockquotes with indentation
- Lists
- Images (local files)

## Troubleshooting

### PDF export fails with "Chrome not found"

The extension uses Chrome/Chromium for PDF generation. Install one of:

- [Google Chrome](https://www.google.com/chrome/)
- [Chromium](https://www.chromium.org/)
- Microsoft Edge (pre-installed on Windows 10/11)

### Images not appearing in export

- Use relative paths for images in your Markdown
- Ensure images exist in the specified location

### Export takes too long

- Large documents with many images may take time
- Complex tables may increase processing time

## Privacy

**This extension does not collect any telemetry or user data.**

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.
