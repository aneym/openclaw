import { useCallback, useEffect, useRef, useState } from 'react'

export function useScrollToBottom<T extends HTMLElement>() {
  const containerRef = useRef<T>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const userScrolledRef = useRef(false)

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    userScrolledRef.current = false
    el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleScroll = () => {
      const threshold = 60
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      setIsAtBottom(atBottom)
      if (!atBottom) {
        userScrolledRef.current = true
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto-scroll when content changes if user hasn't scrolled up
  const autoScroll = useCallback(() => {
    if (!userScrolledRef.current) {
      scrollToBottom()
    }
  }, [scrollToBottom])

  return { containerRef, isAtBottom, scrollToBottom, autoScroll }
}
