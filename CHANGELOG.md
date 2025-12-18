# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
