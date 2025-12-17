# Changelog

All notable changes to the "MDX Exporter Lite" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2024-12-16

### Added

- Initial release of MDX Exporter Lite
- **Commands**
  - `MDX: Open Preview to Side` - Open built-in Markdown preview
  - `MDX: Export to PDF` - Export Markdown to PDF using Pandoc
  - `MDX: Export to DOCX` - Export Markdown to Word document using Pandoc
- **UI Integration**
  - Command Palette access
  - Explorer context menu for `.md` files
  - Editor title buttons when viewing Markdown
- **Settings**
  - `mdxExporter.pandocPath` - Custom Pandoc executable path
  - `mdxExporter.outputDirectory` - Default output directory
  - `mdxExporter.pdfEngine` - PDF engine selection
  - `mdxExporter.referenceDocx` - DOCX template support
  - `mdxExporter.openAfterExport` - Auto-open after export
- **Features**
  - Progress notification during export
  - "Open File" and "Reveal in Explorer" buttons after export
  - Auto-detection of Pandoc in system PATH
  - Relative image path support (uses markdown file directory as cwd)
  - Cross-platform support (Windows, macOS, Linux)
  - No telemetry collection
