export interface DocxOptions {
  baseDir: string;
}

export type HorizontalAlignment = 'left' | 'center' | 'right';

export interface DiagramImage {
  data: Buffer;
  width: number;
  height: number;
}

export interface MarkdownBlock {
  type:
    | 'heading'
    | 'paragraph'
    | 'code'
    | 'diagram'
    | 'list'
    | 'table'
    | 'blockquote'
    | 'hr'
    | 'image';
  level?: number;
  content?: string;
  language?: string;
  diagramType?: 'mermaid' | 'plantuml';
  items?: string[];
  ordered?: boolean;
  rows?: string[][];
  src?: string;
  alt?: string;
  alignment?: HorizontalAlignment;
}

export interface InlineMarkdownSegment {
  type: 'text' | 'bold' | 'italic' | 'code' | 'link' | 'image' | 'imageLink';
  text: string;
  src?: string;
  href?: string;
}
