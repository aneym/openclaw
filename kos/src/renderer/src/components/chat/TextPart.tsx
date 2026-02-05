import { Streamdown } from "streamdown";

interface TextPartProps {
  text: string;
  isStreaming?: boolean;
}

export function TextPart({ text, isStreaming }: TextPartProps) {
  return (
    <Streamdown
      className="size-full break-words overflow-hidden [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto"
      isAnimating={isStreaming}
    >
      {text}
    </Streamdown>
  );
}
