import { useCallback, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import * as Haptics from 'expo-haptics'
import { accentColor, colors } from '@/lib/colors'

interface ChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('')
  const insets = useSafeAreaInsets()

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
  }, [text, disabled, onSend])

  const canSend = text.trim().length > 0 && !disabled

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 8),
        backgroundColor: colors.background,
        gap: 8,
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface,
          borderRadius: 20,
          borderCurve: 'continuous',
          borderWidth: 0.5,
          borderColor: colors.separator,
          paddingHorizontal: 14,
          paddingVertical: 8,
          minHeight: 36,
          maxHeight: 120,
        }}
      >
        <TextInput
          style={{
            fontSize: 17,
            color: colors.text,
            maxHeight: 100,
          }}
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={colors.placeholderText}
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSend}
          editable={!disabled}
        />
      </View>
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        hitSlop={8}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: canSend ? accentColor : colors.quaternaryFill,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 1,
        }}
      >
        <SymbolView
          name="arrow.up"
          tintColor="white"
          size={18}
          weight="bold"
        />
      </Pressable>
    </View>
  )
}
