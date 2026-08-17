"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypePrism from "rehype-prism-plus";
import rehypeSlug from "rehype-slug";

/**
 * Pipeline order is load-bearing: raw HTML passthrough → sanitize (extended to
 * keep GFM task-list checkboxes) → Prism highlighting → slug heading ids, so
 * Prism classes and heading ids survive sanitization.
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "input"],
  attributes: {
    ...defaultSchema.attributes,
    input: ["type", "checked", "disabled"],
  },
};

export function PostContent({ content }: { content: string }) {
  return (
    // `max-w-none` was here to escape the 65ch cap that `<article>` used to
    // inherit. With the cap now scoped to prose itself, the measure is the
    // point: overriding it would set the body to the full column width, which
    // is well past a readable line length in the table-of-contents layout.
    <div className="markdown mx-auto leading-relaxed [&>*:first-child]:mt-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
          rehypePrism,
          rehypeSlug,
        ]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
