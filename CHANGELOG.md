# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4] - 2024-12-24

### Added

- **Local Mermaid bundling** - Uses local Mermaid.js when available, fallback to CDN
- **Better CSP support** - Added 'unsafe-eval' for Mermaid compatibility

## [0.3.3] - 2024-12-24

### Fixed

- **DOCX export "Invalid array length"** - Fixed paragraph parsing that was incorrectly merging content blocks

## [0.3.2] - 2024-12-24

### Fixed

- **Theme-aware preview** - Preview now correctly uses VS Code's dark/light theme colors
- **CSP for CDN scripts** - Fixed Content Security Policy to allow Mermaid/KaTeX rendering

## [0.3.1] - 2024-12-24

### Fixed

- **Fixed DOCX export hanging** - Resolved infinite loop bug in inline markdown processing

## [0.3.0] - 2024-12-24

### 🎉 New Feature - Custom Preview with Mermaid Support!

#### Added

- **Custom WebView Preview** - Built-in preview panel that supports Mermaid, KaTeX, PlantUML, and emoji
- **Live preview updates** - Preview automatically refreshes when editing Markdown files
- **Fixed Mermaid rendering in PDF/PNG export** - Diagrams now properly render instead of showing raw code

## [0.1.0] - 2024-12-18

### 🚀 Major Update - No External Dependencies Required!

#### Changed

- **Removed Pandoc dependency** - No longer requires installing Pandoc or wkhtmltopdf
- **Built-in PDF generation** - Uses puppeteer-core with system Chrome/Chromium
- **Built-in DOCX generation** - Uses pure JavaScript docx library
- Simplified configuration - removed Pandoc-specific settings

#### Added

- New `pdfPageFormat` setting (A4, Letter, Legal, A3, A5)
- New `pdfMargin` setting for PDF margins
- Beautiful PDF styling with proper typography
- DOCX export with Word-compatible formatting

#### Removed

- `pandocPath` setting (no longer needed)
- `pdfEngine` setting (no longer needed)
- `referenceDocx` setting (will be re-added in future version)

## [0.0.2] - 2024-12-18

### Fixed

- Removed sensitive information from package

## [0.0.1] - 2024-12-18

### Added

- Initial release
- Markdown preview functionality
- Export to PDF using Pandoc
- Export to DOCX using Pandoc
- Configurable Pandoc path and PDF engine
- Context menu integration
- Editor title bar buttons
