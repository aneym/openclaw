import { PlatformColor } from 'react-native'
import { Stack } from 'expo-router/stack'

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerTintColor: PlatformColor('label'),
      }}
    />
  )
}
