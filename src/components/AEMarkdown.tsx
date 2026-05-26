import Markdown from 'react-markdown';
import { MermaidRenderer } from './MermaidRenderer';

interface AEMarkdownProps {
  children: string;
}

export function AEMarkdown({ children }: AEMarkdownProps) {
  return (
    <Markdown
      components={{
        code(props) {
          const { children: codeChildren, className, ...rest } = props;
          const match = /language-mermaid/.exec(className || '');
          const codeString = String(codeChildren || '').replace(/\n$/, '');
          if (match) {
            return <MermaidRenderer code={codeString} />;
          }
          return (
            <code className={className} {...rest}>
              {codeChildren}
            </code>
          );
        }
      }}
    >
      {children}
    </Markdown>
  );
}
