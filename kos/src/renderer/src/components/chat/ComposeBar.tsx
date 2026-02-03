import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react'
import { Send, X } from 'lucide-react'
import { useGatewayStore } from '../../stores/gateway-store'
import { useMessageQueueStore } from '../../stores/message-queue-store'
import { useStreaming } from '../../hooks/use-streaming'
import { MessageQueue } from './MessageQueue'
import { cn } from '../../lib/utils'

interface ImageAttachment {
  id: string
  dataUrl: string
  size: number
  width: number
  height: number
}

interface ComposeBarProps {
  sessionKey: string
  threadId: string
  disabled?: boolean
}

export function ComposeBar({ sessionKey, threadId, disabled = false }: ComposeBarProps) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { request, connected } = useGatewayStore()
  const { isStreaming } = useStreaming(sessionKey)
  const addToQueue = useMessageQueueStore((state) => state.addToQueue)
  const dequeue = useMessageQueueStore((state) => state.dequeue)

  // Compress image with quality stepping until under 4MB
  const compressImage = async (
    file: File | Blob
  ): Promise<{ dataUrl: string; size: number; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const reader = new FileReader()

      reader.onload = (e) => {
        img.src = e.target?.result as string
      }

      img.onload = () => {
        // Calculate resize dimensions (max 1568px on longest side)
        const maxDim = 1568
        let width = img.width
        let height = img.height

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)

        // Quality stepping: try 0.9, 0.8, 0.7, 0.6, 0.5, 0.4
        const qualities = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]
        const maxSize = 4 * 1024 * 1024 // 4MB

        const tryQuality = (qualityIndex: number) => {
          if (qualityIndex >= qualities.length) {
            reject(new Error('Could not compress image to under 4MB'))
            return
          }

          const quality = qualities[qualityIndex]
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob'))
                return
              }

              if (blob.size <= maxSize) {
                // Success! Convert to data URL
                const blobReader = new FileReader()
                blobReader.onload = (e) => {
                  resolve({
                    dataUrl: e.target?.result as string,
                    size: blob.size,
                    width,
                    height
                  })
                }
                blobReader.readAsDataURL(blob)
              } else {
                // Try next quality
                tryQuality(qualityIndex + 1)
              }
            },
            'image/jpeg',
            quality
          )
        }

        tryQuality(0)
      }

      img.onerror = () => {
        reject(new Error('Failed to load image'))
      }

      reader.readAsDataURL(file)
    })
  }

  // Handle clipboard paste
  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageItems: DataTransferItem[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageItems.push(items[i])
      }
    }

    if (imageItems.length === 0) return

    e.preventDefault()

    // Process all pasted images
    for (const item of imageItems) {
      const file = item.getAsFile()
      if (!file) continue

      try {
        const compressed = await compressImage(file)
        const newImage: ImageAttachment = {
          id: Math.random().toString(36).substring(7),
          ...compressed
        }
        setImages((prev) => [...prev, newImage])
      } catch (err) {
        console.error('[compose] image compression failed:', err)
        // TODO: Show error toast
      }
    }
  }

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto'

    // Set height based on content, max 200px
    const newHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${newHeight}px`
  }, [text])

  const canSend = connected && !disabled && (text.trim().length > 0 || images.length > 0)

  const handleSend = async (immediate = false) => {
    if (!canSend) return

    const messageText = text.trim()
    // const messageImages = [...images] // TODO: Use when image support is added
    setText('')
    setImages([])

    // If agent is streaming and not immediate, queue the message
    if (isStreaming && !immediate) {
      addToQueue(threadId, messageText)
      // Note: images are not queued, only text messages
      return
    }

    // If immediate and streaming, abort current run first
    if (immediate && isStreaming) {
      try {
        await request('session.abort', { sessionKey })
      } catch (err) {
        console.error('[compose] abort failed:', err)
      }
    }

    try {
      // TODO: Update session.sendMessage to support image attachments
      // For now, just send text
      await request('session.sendMessage', {
        sessionKey,
        message: messageText
        // images: messageImages.map(img => img.dataUrl) // Future: add image support
      })
    } catch (err) {
      console.error('[compose] send failed:', err)
      // TODO: Show error toast
    }
  }

  const handleSendNow = async () => {
    // Abort current run and send the first queued message
    try {
      await request('session.abort', { sessionKey })
    } catch (err) {
      console.error('[compose] abort failed:', err)
    }

    const firstMessage = dequeue(threadId)
    if (firstMessage) {
      try {
        await request('session.sendMessage', {
          sessionKey,
          message: firstMessage.text
        })
      } catch (err) {
        console.error('[compose] send queued message failed:', err)
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter = send (unless Shift is held)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
    // Cmd+Shift+Enter = send immediately (abort + send)
    if (e.key === 'Enter' && e.metaKey && e.shiftKey) {
      e.preventDefault()
      void handleSend(true)
    }
  }

  // Auto-send queued messages when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      const firstMessage = dequeue(threadId)
      if (firstMessage) {
        request('session.sendMessage', {
          sessionKey,
          message: firstMessage.text
        }).catch((err) => {
          console.error('[compose] auto-send queued message failed:', err)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming])

  return (
    <>
      <MessageQueue threadId={threadId} onSendNow={handleSendNow} />
      <div className="border-t border-border bg-background p-3">
        <div className="space-y-2">
          {/* Image preview thumbnails */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="group relative h-20 w-20 overflow-hidden rounded-md border border-border"
                >
                  <img
                    src={img.dataUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    onClick={() => removeImage(img.id)}
                    className={cn(
                      'absolute right-1 top-1 rounded-full bg-background/80 p-1',
                      'opacity-0 transition-opacity group-hover:opacity-100',
                      'hover:bg-background'
                    )}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-1 py-0.5 text-[10px] text-muted-foreground">
                    {Math.round(img.size / 1024)}KB
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Text input */}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                !connected
                  ? 'Disconnected...'
                  : disabled
                    ? 'Waiting...'
                    : isStreaming
                      ? 'Message will be queued...'
                      : 'Type a message...'
              }
              disabled={!connected || disabled}
              rows={1}
              className={cn(
                'flex-1 resize-none rounded-md border border-input bg-background px-3 py-2',
                'text-sm placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'min-h-[40px] max-h-[200px]'
              )}
            />
            <button
              onClick={() => handleSend()}
              disabled={!canSend}
              className={cn(
                'inline-flex h-10 items-center justify-center rounded-md px-4',
                'text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                'disabled:pointer-events-none disabled:opacity-50',
                canSend
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
