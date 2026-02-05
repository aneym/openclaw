import { useState } from "react";
import type { VideoPart } from "@/types/message";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface VideoAttachmentProps {
  part: VideoPart;
}

export function VideoAttachment({ part }: VideoAttachmentProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-block max-w-full cursor-pointer rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
        type="button"
      >
        <video src={part.url} muted preload="metadata" className="max-h-80 w-auto object-contain" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2">
          <video
            src={part.url}
            controls
            preload="metadata"
            className="w-full h-full object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
