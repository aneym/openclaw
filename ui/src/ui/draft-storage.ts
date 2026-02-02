/**
 * Persist chat input drafts and attachments across Vite HMR reloads.
 *
 * Uses sessionStorage (scoped to the browser tab) so drafts survive module
 * replacement but are cleaned up when the tab closes.
 */

import type { ChatAttachment, ChatQueueItem } from './ui-types'

const DRAFT_PREFIX = 'openclaw.draft.'
const ATTACH_PREFIX = 'openclaw.attachments.'
const QUEUE_PREFIX = 'openclaw.queue.'

// -- Text drafts --

export function saveDraft(sessionKey: string, text: string): void {
  try {
    const key = DRAFT_PREFIX + sessionKey
    if (text) {
      sessionStorage.setItem(key, text)
    } else {
      sessionStorage.removeItem(key)
    }
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function loadDraft(sessionKey: string): string {
  try {
    return sessionStorage.getItem(DRAFT_PREFIX + sessionKey) ?? ''
  } catch {
    return ''
  }
}

export function clearDraft(sessionKey: string): void {
  try {
    sessionStorage.removeItem(DRAFT_PREFIX + sessionKey)
  } catch {
    // ignore
  }
}

// -- Image attachments --

export function saveAttachments(sessionKey: string, attachments: ChatAttachment[]): void {
  try {
    const key = ATTACH_PREFIX + sessionKey
    if (attachments.length > 0) {
      sessionStorage.setItem(key, JSON.stringify(attachments))
    } else {
      sessionStorage.removeItem(key)
    }
  } catch {
    // Storage full (images are large) — silently ignore
  }
}

export function loadAttachments(sessionKey: string): ChatAttachment[] {
  try {
    const raw = sessionStorage.getItem(ATTACH_PREFIX + sessionKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (a: unknown): a is ChatAttachment =>
        a != null &&
        typeof a === 'object' &&
        typeof (a as Record<string, unknown>).id === 'string' &&
        typeof (a as Record<string, unknown>).dataUrl === 'string' &&
        typeof (a as Record<string, unknown>).mimeType === 'string',
    )
  } catch {
    return []
  }
}

export function clearAttachments(sessionKey: string): void {
  try {
    sessionStorage.removeItem(ATTACH_PREFIX + sessionKey)
  } catch {
    // ignore
  }
}

// -- Chat queue --

export function saveQueue(sessionKey: string, queue: ChatQueueItem[]): void {
  try {
    const key = QUEUE_PREFIX + sessionKey
    if (queue.length > 0) {
      // Strip attachment dataUrls to keep storage small — queued attachments
      // are large base64 blobs and the queue is transient.  We keep the
      // metadata so the UI can still render the pill; the dataUrl is only
      // needed at send-time and will be gone after a full reload anyway.
      const slim = queue.map((item) => ({
        ...item,
        attachments: item.attachments?.map((a) => ({
          id: a.id,
          mimeType: a.mimeType,
          dataUrl: a.dataUrl,
        })),
      }))
      sessionStorage.setItem(key, JSON.stringify(slim))
    } else {
      sessionStorage.removeItem(key)
    }
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function loadQueue(sessionKey: string): ChatQueueItem[] {
  try {
    const raw = sessionStorage.getItem(QUEUE_PREFIX + sessionKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item: unknown): item is ChatQueueItem =>
        item != null &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).id === 'string' &&
        typeof (item as Record<string, unknown>).text === 'string' &&
        typeof (item as Record<string, unknown>).createdAt === 'number',
    )
  } catch {
    return []
  }
}

export function clearQueue(sessionKey: string): void {
  try {
    sessionStorage.removeItem(QUEUE_PREFIX + sessionKey)
  } catch {
    // ignore
  }
}
