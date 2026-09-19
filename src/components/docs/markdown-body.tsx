import ReactMarkdown from "react-markdown";

/**
 * Shared markdown renderer for the knowledge base (/docs) and the blog.
 * One place to tune typography, link behaviour and code styling so articles
 * and posts render identically.
 */
export function MarkdownBody({ children }: { children: string }) {
  return (
    <div className="docurama-prose max-w-none text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        components={{
          h1: (p) => <h1 className="mt-10 scroll-mt-24 text-2xl font-bold tracking-tight sm:text-3xl" {...p} />,
          h2: (p) => <h2 className="mt-8 scroll-mt-24 border-b pb-2 text-xl font-semibold tracking-tight" {...p} />,
          h3: (p) => <h3 className="mt-6 scroll-mt-24 text-base font-semibold" {...p} />,
          p: (p) => <p className="mt-4 leading-7 text-muted-foreground" {...p} />,
          ul: (p) => <ul className="mt-4 list-disc space-y-1.5 pl-6 text-muted-foreground" {...p} />,
          ol: (p) => <ol className="mt-4 list-decimal space-y-1.5 pl-6 text-muted-foreground" {...p} />,
          li: (p) => <li className="leading-6" {...p} />,
          a: (p) => <a className="font-medium text-primary underline underline-offset-4 hover:opacity-80" {...p} />,
          strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
          blockquote: (p) => (
            <blockquote className="mt-4 rounded-r-lg border-l-4 border-primary/60 bg-muted/50 py-2 pl-4 pr-3 text-muted-foreground" {...p} />
          ),
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return <code className="block overflow-x-auto rounded-lg border bg-muted/60 p-4 font-mono text-xs leading-relaxed" {...rest}>{children}</code>;
            }
            return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs" {...rest}>{children}</code>;
          },
          pre: (p) => <pre className="mt-4" {...p} />,
          table: (p) => (
            <div className="docurama-scroll mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...p} />
            </div>
          ),
          th: (p) => <th className="border bg-muted/60 px-3 py-2 text-left font-semibold" {...p} />,
          td: (p) => <td className="border px-3 py-2 align-top" {...p} />,
          hr: () => <hr className="my-8 border" />,
          img: (p) => <img className="mt-4 rounded-lg border" alt="" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
