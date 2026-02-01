import { PlatformColor } from 'react-native'
import { Stack } from 'expo-router/stack'
import { GatewayProvider } from '@/lib/use-gateway'

export default function RootLayout() {
  return (
    <GatewayProvider>
      <Stack
        screenOptions={{
          headerTintColor: PlatformColor('label'),
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="thread/[threadId]"
          options={{ headerBackButtonDisplayMode: 'minimal' }}
        />
      </Stack>
    </GatewayProvider>
  )
}
