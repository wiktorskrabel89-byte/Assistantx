"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

type LazyCodeBlockProps = {
  isDark: boolean;
  language: string;
  code: string;
};

/**
 * Thin wrapper around react-syntax-highlighter/Prism.
 * Kept in its own module so it can be loaded lazily via next/dynamic,
 * keeping the large Prism bundle out of the initial page JS.
 */
export function LazyCodeBlock({ isDark, language, code }: LazyCodeBlockProps) {
  return (
    <SyntaxHighlighter style={isDark ? oneDark : oneLight} language={language} PreTag="div">
      {code}
    </SyntaxHighlighter>
  );
}
