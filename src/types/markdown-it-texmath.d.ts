declare module 'markdown-it-texmath' {
  import { PluginWithOptions } from 'markdown-it';

  interface TexmathOptions {
    engine?: {
      renderToString: (tex: string, options?: { displayMode?: boolean }) => string;
    };
    delimiters?: 'dollars' | 'brackets' | 'gitlab' | 'julia' | 'kramdown';
    katexOptions?: Record<string, unknown>;
  }

  const texmath: PluginWithOptions<TexmathOptions>;
  export default texmath;
}
