import { memo } from 'react'
import { Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { bubbleColors } from '@/lib/colors'
import type { ChatMessage, ContentBlock } from '@/lib/gateway-types'

function extractText(content: string | ContentBlock[] | undefined): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text') parts.push(block.text)
    else if (block.type === 'tool_use') parts.push(`[Tool: ${block.name}]`)
  }
  return parts.join('\n') || ''
}

export const ChatMessageBubble = memo(function ChatMessageBubble({
  message,
}: {
  message: ChatMessage
}) {
  const isUser = message.role === 'user'
  const text = extractText(message.content)
  if (!text) return null

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        marginVertical: 3,
      }}
    >
      <View
        style={{
          backgroundColor: isUser
            ? bubbleColors.user
            : bubbleColors.assistant,
          borderRadius: 18,
          borderCurve: 'continuous',
          borderBottomRightRadius: isUser ? 4 : 18,
          borderBottomLeftRadius: isUser ? 18 : 4,
          paddingHorizontal: 14,
          paddingVertical: 9,
        }}
      >
        <Text
          selectable
          style={{
            fontSize: 17,
            lineHeight: 22,
            color: isUser ? bubbleColors.userText : bubbleColors.assistantText,
          }}
        >
          {text}
        </Text>
      </View>
    </Animated.View>
  )
})
