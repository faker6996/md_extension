# MDX Exporter Lite

A lightweight VS Code extension for previewing and exporting Markdown files to PDF and DOCX using [Pandoc](https://pandoc.org/).

![VS Code Version](https://img.shields.io/badge/VS%20Code-1.85%2B-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **📖 Markdown Preview**: Open the built-in VS Code Markdown preview side-by-side
- **📄 Export to PDF**: Convert Markdown files to PDF format
- **📝 Export to DOCX**: Convert Markdown files to Word documents
- **🎯 Multiple Access Points**: Use Command Palette, context menu, or editor title buttons
- **⚙️ Customizable**: Configure Pandoc path, output directory, PDF engine, and DOCX templates
- **🔒 Privacy First**: No telemetry or data collection

## Requirements

### Pandoc Installation

This extension requires [Pandoc](https://pandoc.org/) to be installed on your system.

#### Windows

```powershell
# Using Chocolatey
choco install pandoc

# Using Scoop
scoop install pandoc

# Or download from https://pandoc.org/installing.html#windows
```

#### macOS

```bash
# Using Homebrew
brew install pandoc

# Or download from https://pandoc.org/installing.html#macos
```

#### Linux

```bash
# Debian/Ubuntu
sudo apt-get install pandoc

# Fedora
sudo dnf install pandoc

# Arch Linux
sudo pacman -S pandoc

# Or download from https://pandoc.org/installing.html#linux
```

### Optional: PDF Engines

For PDF export, Pandoc may require an additional PDF engine:

- **wkhtmltopdf** (recommended for simple documents): [Download](https://wkhtmltopdf.org/downloads.html)
- **LaTeX** (for complex formatting): Install [TeX Live](https://www.tug.org/texlive/) or [MiKTeX](https://miktex.org/)

## Usage

### Commands

| Command | Description | Shortcut |
|---------|-------------|----------|
| `MDX: Open Preview to Side` | Open Markdown preview in side panel | - |
| `MDX: Export to PDF` | Export current Markdown to PDF | - |
| `MDX: Export to DOCX` | Export current Markdown to DOCX | - |

### Access Methods

1. **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Type "MDX" to see all available commands

2. **Editor Title Button**
   - When viewing a Markdown file, click the icons in the editor title bar

3. **Context Menu**
   - Right-click on a `.md` file in the Explorer sidebar
   - Select "MDX: Export to PDF" or "MDX: Export to DOCX"

### Export Workflow

1. Open a Markdown file
2. Choose an export command
3. If the file has unsaved changes, you'll be prompted to save
4. Select the output location in the save dialog
5. Wait for export to complete
6. Click "Open File" or "Reveal in File Explorer" to access the result

## Extension Settings

Configure the extension in VS Code settings (`Ctrl+,` / `Cmd+,`):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `mdxExporter.pandocPath` | string | `pandoc` | Path to Pandoc executable |
| `mdxExporter.outputDirectory` | string | (empty) | Default output directory |
| `mdxExporter.pdfEngine` | string | (empty) | PDF engine (e.g., `wkhtmltopdf`, `xelatex`) |
| `mdxExporter.referenceDocx` | string | (empty) | Path to reference DOCX template |
| `mdxExporter.openAfterExport` | boolean | `true` | Open file after export |

### Example Configuration

```json
{
  "mdxExporter.pandocPath": "/usr/local/bin/pandoc",
  "mdxExporter.outputDirectory": "~/Documents/exports",
  "mdxExporter.pdfEngine": "wkhtmltopdf",
  "mdxExporter.referenceDocx": "~/templates/my-template.docx",
  "mdxExporter.openAfterExport": true
}
```

## Troubleshooting

### "Pandoc is not found"

1. Verify Pandoc is installed: run `pandoc --version` in terminal
2. If installed in a custom location, set `mdxExporter.pandocPath`
3. Restart VS Code after installing Pandoc

### PDF export fails

1. Check if a PDF engine is required for your content
2. Install `wkhtmltopdf` or a LaTeX distribution
3. Set `mdxExporter.pdfEngine` to your installed engine

### Images not appearing in export

- Use relative paths for images in your Markdown
- The extension sets the working directory to the Markdown file's location

### Export takes too long

- Large documents with many images may take time
- Consider using `wkhtmltopdf` for faster PDF generation compared to LaTeX

## Privacy

**This extension does not collect any telemetry or user data.**

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Pandoc](https://pandoc.org/) - Universal document converter
- [VS Code Extension API](https://code.visualstudio.com/api)
