import Markdown from 'react-markdown'
import { cn } from '@/lib/utils'

interface ResponseProps {
  content: string
  className?: string
}

export function Response({ content, className }: ResponseProps) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <Markdown
        components={{
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-sm">
              {children}
            </pre>
          ),
          code: ({ children, className: codeClassName }) => {
            const isInline = !codeClassName
            if (isInline) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">
                  {children}
                </code>
              )
            }
            return <code className={codeClassName}>{children}</code>
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}

interface StreamingResponseProps {
  content: string
  className?: string
}

export function StreamingResponse({ content, className }: StreamingResponseProps) {
  return (
    <div className={cn('relative', className)}>
      <Response content={content} />
      <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/60 align-text-bottom" />
    </div>
  )
}
