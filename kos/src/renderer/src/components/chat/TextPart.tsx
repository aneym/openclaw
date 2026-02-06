import { Streamdown } from "streamdown";

interface TextPartProps {
  text: string;
  isStreaming?: boolean;
}

export function TextPart({ text, isStreaming }: TextPartProps) {
  return (
    <Streamdown
      className="size-full break-words overflow-hidden [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_img]:max-w-full [&_img]:max-h-96 [&_img]:rounded-md [&_img]:my-2 [&_img]:object-contain"
      isAnimating={isStreaming}
    >
      {text}
    </Streamdown>
  );
}
