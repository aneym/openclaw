import { useCallback, useEffect, useState } from 'react'
import { Alert, FlatList, Text, View } from 'react-native'
import { Stack } from 'expo-router/stack'
import { useRouter } from 'expo-router'
import { useGateway } from '@/lib/use-gateway'
import { useThreads } from '@/lib/use-threads'
import { ThreadRow } from '@/components/thread-row'
import { ConnectionStatus } from '@/components/connection-status'
import { colors } from '@/lib/colors'
import type { ThreadDescriptor } from '@/lib/use-threads'

export default function ThreadListScreen() {
  const router = useRouter()
  const { state } = useGateway()
  const { threads, createThread, deleteThread, renameThread } = useThreads()
  const [search, setSearch] = useState('')
  const [didAutoCreate, setDidAutoCreate] = useState(false)

  // Auto-create first thread on connect if none exist
  useEffect(() => {
    if (state !== 'connected' || threads.length > 0 || didAutoCreate) return
    setDidAutoCreate(true)
    const thread = createThread('New thread')
    router.push(`/(chat)/${thread.id}`)
  }, [state, threads.length, didAutoCreate, createThread, router])

  const handleNewThread = useCallback(() => {
    const thread = createThread()
    router.push(`/(chat)/${thread.id}`)
  }, [createThread, router])

  const handleSelect = useCallback(
    (thread: ThreadDescriptor) => {
      router.push(`/(chat)/${thread.id}`)
    },
    [router],
  )

  const handleRename = useCallback(
    (thread: ThreadDescriptor) => {
      Alert.prompt(
        'Rename Thread',
        undefined,
        (text) => {
          const trimmed = text?.trim()
          if (trimmed) renameThread(thread.id, trimmed)
        },
        'plain-text',
        thread.label,
      )
    },
    [renameThread],
  )

  const handleDelete = useCallback(
    (thread: ThreadDescriptor) => {
      Alert.alert('Delete Thread', `Delete "${thread.label}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteThread(thread.id),
        },
      ])
    },
    [deleteThread],
  )

  const filtered = search
    ? threads.filter((t) =>
        t.label.toLowerCase().includes(search.toLowerCase()),
      )
    : threads

  const renderItem = useCallback(
    ({ item }: { item: ThreadDescriptor }) => (
      <ThreadRow
        thread={item}
        onPress={handleSelect}
        onRename={handleRename}
        onDelete={handleDelete}
      />
    ),
    [handleSelect, handleRename, handleDelete],
  )

  const keyExtractor = useCallback(
    (item: ThreadDescriptor) => item.id,
    [],
  )

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Threads',
          headerLargeTitle: true,
          headerSearchBarOptions: {
            placeholder: 'Search threads',
            autoCapitalize: 'none',
            hideWhenScrolling: true,
            onChangeText: (e) => setSearch(e.nativeEvent.text),
            onCancelButtonPress: () => setSearch(''),
          },
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.pencil"
          onPress={handleNewThread}
        />
      </Stack.Toolbar>

      <ConnectionStatus />

      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {state !== 'connected' ? (
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              padding: 32,
            }}
          >
            <Text
              style={{
                color: colors.secondaryText,
                fontSize: 16,
                textAlign: 'center',
              }}
            >
              {state === 'connecting'
                ? 'Connecting to gateway...'
                : 'Not connected. Go to Settings to configure your gateway.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: 32,
            }}
            contentInsetAdjustmentBehavior="automatic"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              <View
                style={{
                  paddingVertical: 64,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: colors.secondaryText,
                    textAlign: 'center',
                  }}
                >
                  {search
                    ? 'No matching threads'
                    : 'No conversations yet.\nTap + to start.'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </>
  )
}
