"use client";

import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

export function MarkdownMessageRenderer({
  text,
  entryId,
  copied,
  dark,
  onCopyText,
}: {
  text: string;
  entryId: string;
  copied: string | null;
  dark: boolean;
  onCopyText: (text: string, id: string) => void;
}) {
  let codeBlockIndex = 0;

  return (
    <ReactMarkdown
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className ?? "");
          const codeText = String(children).replace(/\n$/, "");
          const isBlock = Boolean(match) || codeText.includes("\n");

          if (isBlock) {
            const blockId = `${entryId}-code-${codeBlockIndex++}`;
            return (
              <div className="relative my-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between bg-muted px-3 py-1 text-xs text-muted-foreground">
                  <span>{match?.[1] ?? "code"}</span>
                  <button
                    onClick={() => onCopyText(codeText, blockId)}
                    className="transition-colors hover:text-foreground"
                    aria-label="Copy code block"
                  >
                    {copied === blockId ? "Copied" : "Copy"}
                  </button>
                </div>
                <SyntaxHighlighter style={dark ? oneDark : oneLight} language={match?.[1] ?? "text"} PreTag="div">
                  {codeText}
                </SyntaxHighlighter>
              </div>
            );
          }

          return <code className="rounded bg-muted px-1 text-xs" {...props}>{children}</code>;
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{children}</p>;
        },
        ul({ children }) {
          return <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>;
        },
        blockquote({ children }) {
          return <blockquote className="my-2 border-l-4 border-border pl-3 italic text-muted-foreground">{children}</blockquote>;
        },
        h1({ children }) {
          return <h1 className="mb-2 text-xl font-bold">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="mb-2 text-lg font-bold">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="mb-1 text-base font-bold">{children}</h3>;
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
