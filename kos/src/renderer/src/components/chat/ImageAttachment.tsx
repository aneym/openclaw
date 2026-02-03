import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ImagePart } from '@/types/message'

interface ImageAttachmentProps {
  part: ImagePart
}

export function ImageAttachment({ part }: ImageAttachmentProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-block max-w-full cursor-pointer rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
        type="button"
      >
        <img
          src={part.url}
          alt={part.alt || 'Attached image'}
          className="max-h-80 w-auto object-contain"
          loading="lazy"
        />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2">
          <img
            src={part.url}
            alt={part.alt || 'Attached image'}
            className="w-full h-full object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
