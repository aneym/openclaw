import { PlatformColor } from 'react-native'
import { Stack } from 'expo-router/stack'

export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: PlatformColor('label'),
      }}
    />
  )
}
