/**
 * MarkdownContent — upgraded markdown renderer
 * Code highlighting (react-syntax-highlighter + Prism),
 * math formulas (remark-math + rehype-katex),
 * local file link click-to-open, copy button, language tag.
 * Adapted from LobsterAI MarkdownContent for ClawX color system.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';
// @ts-ignore
import remarkMath from 'remark-math';
// @ts-ignore
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
// @ts-ignore
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-ignore
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, File, Folder } from 'lucide-react';

const CODE_BLOCK_LINE_LIMIT = 200;
const CODE_BLOCK_CHAR_LIMIT = 20000;
const SYNTAX_HIGHLIGHTER_STYLE = { margin: 0, borderRadius: 0, background: '#282c34' };
const SAFE_URL_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel', 'file']);

// ── URL utilities ────────────────────────────────────────────────

const safeUrlTransform = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const match = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!match) return trimmed;
  return SAFE_URL_PROTOCOLS.has(match[1].toLowerCase()) ? trimmed : '';
};

const getHrefProtocol = (href: string): string | null => {
  const match = href.trim().match(/^([a-z][a-z0-9+.-]*):/i);
  return match ? match[1].toLowerCase() : null;
};

const isExternalHref = (href: string): boolean => {
  const p = getHrefProtocol(href);
  return !!p && p !== 'file';
};

const safeDecodeURIComponent = (value: string): string => {
  try { return decodeURIComponent(value); } catch { return value; }
};

const stripHashAndQuery = (v: string) => v.split('#')[0].split('?')[0];

const stripFileProtocol = (v: string): string => {
  let c = v.replace(/^file:\/\//i, '');
  if (/^\/[A-Za-z]:/.test(c)) c = c.slice(1);
  return c;
};

const hasFileExtension = (v: string) => /\.[A-Za-z0-9]{1,6}$/.test(v);

const looksLikeDirectory = (v: string): boolean => {
  if (!v) return false;
  if (v.endsWith('/') || v.endsWith('\\')) return true;
  return !hasFileExtension(v);
};

const isLikelyLocalFilePath = (href: string): boolean => {
  if (!href) return false;
  if (/^file:\/\//i.test(href)) return true;
  if (/^[A-Za-z]:[\\/]/.test(href)) return true;
  if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  const base = stripHashAndQuery(href);
  if (base.includes('/') || base.includes('\\')) return true;
  const extMatch = base.match(/\.([A-Za-z0-9]{1,6})$/);
  if (!extMatch) return false;
  const commonTlds = new Set(['com', 'net', 'org', 'io', 'cn', 'co', 'ai', 'app', 'dev', 'gov', 'edu']);
  return !commonTlds.has(extMatch[1].toLowerCase());
};

const toFileHref = (filePath: string): string => {
  const n = filePath.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(filePath)) return `file:///${n}`;
  return n.startsWith('/') ? `file://${n}` : `file://${n}`;
};

const normalizeDisplayMath = (content: string): string =>
  content.replace(/\$\$([\s\S]+?)\$\$/g, (match, inner) =>
    inner.includes('\n') ? `$$\n${inner.trim()}\n$$` : match
  );

const encodeFileUrl = (url: string): string =>
  encodeURI(url).replace(/\(/g, '%28').replace(/\)/g, '%29');

const encodeFileUrlDestination = (dest: string): string => {
  const trimmed = dest.trim();
  if (!/^<?file:\/\//i.test(trimmed)) return dest;
  let core = trimmed, prefix = '', suffix = '';
  if (core.startsWith('<') && core.endsWith('>')) {
    prefix = '<'; suffix = '>'; core = core.slice(1, -1);
  }
  return dest.replace(trimmed, `${prefix}${encodeFileUrl(core)}${suffix}`);
};

const findMarkdownLinkEnd = (input: string, start: number): number => {
  let depth = 1;
  for (let i = start; i < input.length; i++) {
    const c = input[i];
    if (c === '\\') { i++; continue; }
    if (c === '(') { depth++; continue; }
    if (c === ')') { if (--depth === 0) return i; }
    if (c === '\n') return -1;
  }
  return -1;
};

const encodeFileUrlsInMarkdown = (content: string): string => {
  if (!content.includes('file://')) return content;
  let result = '', cursor = 0;
  while (cursor < content.length) {
    const openIndex = content.indexOf('](', cursor);
    if (openIndex === -1) { result += content.slice(cursor); break; }
    result += content.slice(cursor, openIndex + 2);
    const destStart = openIndex + 2;
    const destEnd = findMarkdownLinkEnd(content, destStart);
    if (destEnd === -1) { result += content.slice(destStart); break; }
    result += encodeFileUrlDestination(content.slice(destStart, destEnd)) + ')';
    cursor = destEnd + 1;
  }
  return result;
};

// ── Code Block ───────────────────────────────────────────────────

const CodeBlock: React.FC<any> = ({ node, className, children, ...props }) => {
  const normalizedClassName = Array.isArray(className) ? className.join(' ') : className || '';
  const match = /language-([\w-]+)/.exec(normalizedClassName);
  const hasPosition = node?.position?.start?.line != null && node?.position?.end?.line != null;
  const isInline = typeof props.inline === 'boolean'
    ? props.inline
    : hasPosition
      ? node.position.start.line === node.position.end.line
      : !match;
  const codeText = Array.isArray(children) ? children.join('') : String(children);
  const trimmedCode = codeText.replace(/\n$/, '');
  const shouldHighlight = !isInline && match
    && trimmedCode.length <= CODE_BLOCK_CHAR_LIMIT
    && trimmedCode.split('\n').length <= CODE_BLOCK_LINE_LIMIT;
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current != null) clearTimeout(timerRef.current); }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(trimmedCode);
      setIsCopied(true);
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setIsCopied(false), 1500);
    } catch { /* ignore */ }
  }, [trimmedCode]);

  if (!isInline) {
    if (!match) {
      return (
        <div className="my-2 relative group">
          <div className="overflow-x-auto rounded-lg bg-[#282c34] text-[13px] leading-6">
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-gray-700/80 text-gray-300 hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
              title="复制"
            >
              {isCopied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
            <code className="block px-4 py-3 font-mono text-[#abb2bf] whitespace-pre">{trimmedCode}</code>
          </div>
        </div>
      );
    }

    return (
      <div className="my-3 rounded-xl overflow-hidden border border-black/10 relative shadow-sm">
        <div className="bg-[#21252b] px-4 py-2 text-xs text-gray-400 font-medium flex items-center justify-between">
          <span className="font-mono">{match[1]}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            title="复制代码"
          >
            {isCopied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-gray-400" />}
          </button>
        </div>
        {shouldHighlight ? (
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            customStyle={SYNTAX_HIGHLIGHTER_STYLE}
          >
            {trimmedCode}
          </SyntaxHighlighter>
        ) : (
          <div className="overflow-x-auto bg-[#282c34] text-[13px] leading-6">
            <code className="block px-4 py-3 font-mono text-[#abb2bf] whitespace-pre">{trimmedCode}</code>
          </div>
        )}
      </div>
    );
  }

  return (
    <code
      className={`inline bg-black/[0.06] px-1.5 py-0.5 rounded text-[0.9em] font-mono font-medium text-[#c41a16] ${normalizedClassName}`}
      {...props}
    >
      {children}
    </code>
  );
};

// ── Markdown components factory ──────────────────────────────────

const createComponents = (resolveLocalFilePath?: (href: string, text: string) => string | null) => ({
  p: ({ children, ...props }: any) => (
    <p className="my-1 first:mt-0 last:mb-0 leading-6 text-[14px]" {...props}>{children}</p>
  ),
  strong: ({ children, ...props }: any) => (
    <strong className="font-semibold" {...props}>{children}</strong>
  ),
  h1: ({ children, ...props }: any) => (
    <h1 className="text-xl font-semibold mt-5 mb-2" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }: any) => (
    <h2 className="text-lg font-semibold mt-4 mb-2" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3 className="text-base font-semibold mt-3 mb-1.5" {...props}>{children}</h3>
  ),
  ul: ({ children, ...props }: any) => (
    <ul className="list-disc pl-5 my-1.5" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: any) => (
    <ol className="list-decimal pl-6 my-1.5" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: any) => (
    <li className="my-0.5 leading-6" {...props}>{children}</li>
  ),
  blockquote: ({ children, ...props }: any) => (
    <blockquote className="border-l-4 border-[#007aff] pl-4 py-1 my-2 bg-[#007aff]/5 rounded-r-lg" {...props}>
      {children}
    </blockquote>
  ),
  code: CodeBlock,
  table: ({ children, ...props }: any) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-black/10">
      <table className="border-collapse w-full" {...props}>{children}</table>
    </div>
  ),
  thead: ({ children, ...props }: any) => (
    <thead className="bg-[#f2f2f7]" {...props}>{children}</thead>
  ),
  tbody: ({ children, ...props }: any) => (
    <tbody className="divide-y divide-black/[0.06]" {...props}>{children}</tbody>
  ),
  tr: ({ children, ...props }: any) => (
    <tr className="divide-x divide-black/[0.06]" {...props}>{children}</tr>
  ),
  th: ({ children, ...props }: any) => (
    <th className="px-4 py-2 text-left font-semibold text-[13px]" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: any) => (
    <td className="px-4 py-2 text-[13px]" {...props}>{children}</td>
  ),
  img: ({ src, alt, ...props }: any) => {
    const resolvedSrc = typeof src === 'string' && src.startsWith('file://')
      ? src.replace(/^file:\/\//, 'localfile://')
      : src;
    return <img className="max-w-full h-auto rounded-xl my-3" src={resolvedSrc} alt={alt} {...props} />;
  },
  hr: ({ ...props }: any) => (
    <hr className="my-4 border-black/10" {...props} />
  ),
  a: ({ href, children, ...props }: any) => {
    if (typeof href === 'string' && href.startsWith('#artifact-')) return null;
    const hrefValue = typeof href === 'string' ? href.trim() : '';
    const isExternal = !!hrefValue && isExternalHref(hrefValue);
    const linkText = Array.isArray(children) ? children.join('') : String(children ?? '');
    const resolvedPath = hrefValue && !isExternal && resolveLocalFilePath
      ? resolveLocalFilePath(hrefValue, linkText) : null;
    const isLocalFile = !!hrefValue && !isExternal && (resolvedPath || isLikelyLocalFilePath(hrefValue));

    if (isLocalFile) {
      const rawPath = resolvedPath ?? stripFileProtocol(stripHashAndQuery(hrefValue));
      const filePath = safeDecodeURIComponent(rawPath) || rawPath;

      const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        try {
          const result = await (window as any).electron?.shell?.openPath(filePath);
          if (!result?.success) {
            console.error('Failed to open file:', filePath, result?.error);
          }
        } catch (err) {
          console.error('Failed to open file:', filePath, err);
        }
      };

      return (
        <a
          href={toFileHref(filePath)}
          onClick={handleClick}
          className="text-[#007aff] hover:text-[#0056cc] underline decoration-[#007aff]/40 hover:decoration-[#007aff] transition-colors cursor-pointer inline-flex items-center gap-1"
          title={filePath}
          {...props}
        >
          {children}
          {looksLikeDirectory(filePath)
            ? <Folder className="h-3.5 w-3.5 inline" />
            : <File className="h-3.5 w-3.5 inline" />}
        </a>
      );
    }

    if (isExternal) {
      const handleExternal = async (e: React.MouseEvent<HTMLAnchorElement>) => {
        const openExternal = (window as any)?.electron?.shell?.openExternal;
        if (typeof openExternal === 'function') {
          e.preventDefault();
          try { await openExternal(hrefValue); } catch { /* fall through */ }
        }
      };
      return (
        <a
          href={hrefValue}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleExternal}
          className="text-[#007aff] hover:text-[#0056cc] underline decoration-[#007aff]/40 hover:decoration-[#007aff] transition-colors"
          {...props}
        >
          {children}
        </a>
      );
    }

    return (
      <a
        href={hrefValue}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#007aff] hover:text-[#0056cc] underline decoration-[#007aff]/40 hover:decoration-[#007aff] transition-colors"
        {...props}
      >
        {children}
      </a>
    );
  },
});

// ── Public API ───────────────────────────────────────────────────

interface MarkdownContentProps {
  content: string;
  className?: string;
  resolveLocalFilePath?: (href: string, text: string) => string | null;
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  className = '',
  resolveLocalFilePath,
}) => {
  const components = useMemo(
    () => createComponents(resolveLocalFilePath),
    [resolveLocalFilePath],
  );
  const normalizedContent = useMemo(
    () => normalizeDisplayMath(encodeFileUrlsInMarkdown(content)),
    [content],
  );

  return (
    <div className={`markdown-content text-[14px] leading-6 break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={safeUrlTransform}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;
