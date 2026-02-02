import { Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useGateway } from '@/lib/use-gateway'
import { colors, statusColors } from '@/lib/colors'

export function ConnectionStatus() {
  const { state } = useGateway()

  if (state === 'connected') {return null}

  const color =
    state === 'connecting' ? statusColors.connecting : statusColors.disconnected
  const label = state === 'connecting' ? 'Connecting...' : 'Disconnected'

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={{
        alignItems: 'center',
        paddingVertical: 4,
        backgroundColor: colors.background,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: colors.surface,
          paddingHorizontal: 12,
          paddingVertical: 4,
          borderRadius: 12,
          borderCurve: 'continuous',
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
        <Text
          style={{
            fontSize: 13,
            color: colors.text,
            fontWeight: '500',
          }}
        >
          {label}
        </Text>
      </View>
    </Animated.View>
  )
}
