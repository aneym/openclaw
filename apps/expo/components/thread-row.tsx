import { memo, useCallback } from 'react'
import { ActionSheetIOS, Platform, Pressable, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import * as Haptics from 'expo-haptics'
import { colors } from '@/lib/colors'
import type { ThreadDescriptor } from '@/lib/use-threads'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 0) {return 'now'}
  const sec = Math.round(diff / 1000)
  if (sec < 60) {return `${sec}s`}
  const min = Math.round(sec / 60)
  if (min < 60) {return `${min}m`}
  const hr = Math.round(min / 60)
  if (hr < 24) {return `${hr}h`}
  const day = Math.round(hr / 24)
  if (day < 30) {return `${day}d`}
  const mo = Math.round(day / 30)
  return `${mo}mo`
}

interface ThreadRowProps {
  thread: ThreadDescriptor
  onPress: (thread: ThreadDescriptor) => void
  onRename: (thread: ThreadDescriptor) => void
  onDelete: (thread: ThreadDescriptor) => void
}

export const ThreadRow = memo(function ThreadRow({
  thread,
  onPress,
  onRename,
  onDelete,
}: ThreadRowProps) {
  const handleLongPress = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Rename', 'Delete', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) {onRename(thread)}
          else if (index === 1) {onDelete(thread)}
        },
      )
    } else {
      // Android fallback — trigger rename directly
      onRename(thread)
    }
  }, [thread, onRename, onDelete])

  return (
    <Pressable
      onPress={() => onPress(thread)}
      onLongPress={handleLongPress}
      style={({ pressed }) => ({
          backgroundColor: pressed ? colors.tertiaryFill : colors.surface,
          borderRadius: 12,
          borderCurve: 'continuous',
          paddingHorizontal: 16,
          paddingVertical: 14,
          marginVertical: 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        })}
      >
        <SymbolView
          name="bubble.left"
          tintColor={colors.secondaryText}
          size={20}
        />
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 17,
              color: colors.text,
              fontWeight: '500',
            }}
          >
            {thread.label}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 13,
            color: colors.tertiaryText,
          }}
        >
          {timeAgo(thread.lastActivityAt)}
        </Text>
        <SymbolView
          name="chevron.right"
          tintColor={colors.tertiaryText}
          size={12}
          weight="semibold"
        />
      </Pressable>
  )
})
