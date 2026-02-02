import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, SectionList, Text, View } from 'react-native'
import { Stack } from 'expo-router/stack'
import { useRouter } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import { useGateway } from '@/lib/use-gateway'
import { useThreads, groupThreads } from '@/lib/use-threads'
import { ThreadRow } from '@/components/thread-row'
import { ConnectionStatus } from '@/components/connection-status'
import { colors } from '@/lib/colors'
import type { ThreadDescriptor, ThreadSection } from '@/lib/use-threads'

const DEFAULT_COLLAPSED = new Set(['Older', 'Automated', 'Archived'])

export default function ThreadListScreen() {
  const router = useRouter()
  const { state } = useGateway()
  const { threads, loading, createThread, deleteThread, renameThread } =
    useThreads()
  const [search, setSearch] = useState('')
  const [didAutoCreate, setDidAutoCreate] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(DEFAULT_COLLAPSED),
  )

  // Auto-create first thread on connect if none exist (wait for remote load)
  useEffect(() => {
    if (
      state !== 'connected' ||
      loading ||
      threads.length > 0 ||
      didAutoCreate
    )
      {return}
    setDidAutoCreate(true)
    const thread = createThread('New thread')
    router.push(`/thread/${thread.id}`)
  }, [state, loading, threads.length, didAutoCreate, createThread, router])

  const handleNewThread = useCallback(() => {
    const thread = createThread()
    router.push(`/thread/${thread.id}`)
  }, [createThread, router])

  const handleSelect = useCallback(
    (thread: ThreadDescriptor) => {
      router.push(`/thread/${thread.id}`)
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
          if (trimmed) {renameThread(thread.id, trimmed)}
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

  const toggleSection = useCallback((title: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(title)) {next.delete(title)}
      else {next.add(title)}
      return next
    })
  }, [])

  const filtered = search
    ? threads.filter((t) =>
        t.label.toLowerCase().includes(search.toLowerCase()),
      )
    : threads

  // Apply collapsing: collapsed sections get empty data arrays
  const sections = useMemo(() => {
    const raw = groupThreads(filtered)
    return raw.map((s) => ({
      ...s,
      data: collapsed.has(s.title) ? [] : s.data,
      count: s.data.length,
    }))
  }, [filtered, collapsed])

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

  const renderSectionHeader = useCallback(
    ({ section }: { section: ThreadSection & { count?: number } }) => {
      const isCollapsed = collapsed.has(section.title)
      return (
        <Pressable
          onPress={() => toggleSection(section.title)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingTop: 20,
            paddingBottom: 6,
            paddingHorizontal: 4,
          }}
        >
          <SymbolView
            name={isCollapsed ? 'chevron.right' : 'chevron.down'}
            tintColor={colors.secondaryText}
            size={10}
            weight="bold"
          />
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: colors.secondaryText,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {section.title}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.tertiaryText,
            }}
          >
            {section.count ?? section.data.length}
          </Text>
        </Pressable>
      )
    },
    [collapsed, toggleSection],
  )

  return (
    <>
      <Stack.Screen.Title large>Threads</Stack.Screen.Title>
      <Stack.SearchBar
        placeholder="Search threads"
        autoCapitalize="none"
        hideWhenScrolling
        onChangeText={(e) => setSearch(e.nativeEvent.text)}
        onCancelButtonPress={() => setSearch('')}
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
          <SectionList
            sections={sections}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: 32,
            }}
            contentInsetAdjustmentBehavior="automatic"
            keyboardDismissMode="on-drag"
            stickySectionHeadersEnabled={false}
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
