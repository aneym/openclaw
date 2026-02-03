import { PlatformColor } from 'react-native'
import { Stack } from 'expo-router/stack'

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerTitleStyle: { color: PlatformColor('label') as unknown as string },
        headerTintColor: PlatformColor('label') as unknown as string,
        headerLargeTitle: true,
        headerBlurEffect: 'none',
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  )
}
