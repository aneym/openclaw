import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Alert, FlatList, PlatformColor, Text, View } from 'react-native'
import { Stack } from 'expo-router/stack'
import { useLocalSearchParams } from 'expo-router'
import { useGateway } from '@/lib/use-gateway'
import { useThreads } from '@/lib/use-threads'
import { useChat } from '@/lib/use-chat'
import { ChatMessageBubble } from '@/components/chat-message'
import { ChatInput } from '@/components/chat-input'
import { StreamingIndicator } from '@/components/streaming-indicator'
import { colors } from '@/lib/colors'
import type { ChatMessage } from '@/lib/gateway-types'

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>()
  const { state } = useGateway()
  const { threads, renameThread, updateActivity } = useThreads()
  const listRef = useRef<FlatList>(null)

  const thread = useMemo(
    () => threads.find((t) => t.id === threadId),
    [threads, threadId],
  )

  const sessionKey = thread?.sessionKey ?? ''
  const chat = useChat(sessionKey)

  // Update thread activity when messages arrive
  useEffect(() => {
    if (threadId && chat.messages.length > 0) {
      updateActivity(threadId)
    }
  }, [threadId, chat.messages.length, updateActivity])

  const handleSend = useCallback(
    (text: string) => {
      chat.send(text)
    },
    [chat.send],
  )

  const handleRename = useCallback(() => {
    if (!thread) {return}
    Alert.prompt(
      'Rename Thread',
      undefined,
      (text) => {
        const trimmed = text?.trim()
        if (trimmed) {renameThread(thread.id, trimmed)}
      },
      'plain-text',
      thread.label,
    )
  }, [thread, renameThread])

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatMessageBubble message={item} />
    ),
    [],
  )

  const keyExtractor = useCallback(
    (item: ChatMessage, index: number) =>
      `${sessionKey}-${item.ts ?? index}-${item.role}-${index}`,
    [sessionKey],
  )

  const hasStream = chat.streamText !== null

  if (!thread) {
    return (
      <>
        <Stack.Screen.Title>Thread</Stack.Screen.Title>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: colors.secondaryText, fontSize: 16 }}>
            Thread not found
          </Text>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen.Title>{thread.label}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        {chat.isStreaming ? (
          <Stack.Toolbar.Button
            icon="stop.circle.fill"
            tintColor={PlatformColor('systemRed')}
            onPress={chat.abort}
          />
        ) : (
          <Stack.Toolbar.Menu icon="ellipsis">
            <Stack.Toolbar.MenuAction
              icon="pencil"
              onPress={handleRename}
            >
              Rename
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        )}
      </Stack.Toolbar>

      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <FlatList
          ref={listRef}
          data={chat.messages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          inverted
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'flex-end',
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 8,
          }}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets
          ListHeaderComponent={
            hasStream ? (
              <StreamingIndicator text={chat.streamText ?? ''} />
            ) : null
          }
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />
        <ChatInput
          onSend={handleSend}
          disabled={state !== 'connected'}
        />
      </View>
    </>
  )
}
