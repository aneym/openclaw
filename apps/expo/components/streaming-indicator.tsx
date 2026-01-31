import { memo, useEffect } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { bubbleColors, colors } from '@/lib/colors'

export const StreamingIndicator = memo(function StreamingIndicator({
  text,
}: {
  text: string
}) {
  const opacity = useSharedValue(1)

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 600 }),
        withTiming(1, { duration: 600 }),
      ),
      -1,
      true,
    )
  }, [opacity])

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{
        alignSelf: 'flex-start',
        maxWidth: '80%',
        marginVertical: 3,
      }}
    >
      <View
        style={{
          backgroundColor: bubbleColors.assistant,
          borderRadius: 18,
          borderCurve: 'continuous',
          borderBottomLeftRadius: 4,
          paddingHorizontal: 14,
          paddingVertical: 9,
        }}
      >
        {text ? (
          <Text
            style={{
              fontSize: 17,
              lineHeight: 22,
              color: bubbleColors.assistantText,
            }}
          >
            {text}
          </Text>
        ) : (
          <Animated.View
            style={[{ flexDirection: 'row', gap: 4, paddingVertical: 4 }, pulseStyle]}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.secondaryText,
              }}
            />
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.secondaryText,
              }}
            />
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.secondaryText,
              }}
            />
          </Animated.View>
        )}
      </View>
    </Animated.View>
  )
})
