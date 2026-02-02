import { PlatformColor } from 'react-native'
import { Stack } from 'expo-router/stack'
import { GatewayProvider } from '@/lib/use-gateway'
import { colors } from '@/lib/colors'

export default function RootLayout() {
  return (
    <GatewayProvider>
      <Stack
        screenOptions={{
          headerTransparent: true,
          headerShadowVisible: false,
          headerTitleStyle: { color: PlatformColor('label') as unknown as string },
          headerTintColor: PlatformColor('label') as unknown as string,
          headerBlurEffect: 'none',
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="thread/[threadId]"
          options={{
            headerTransparent: false,
            headerStyle: { backgroundColor: colors.background as unknown as string },
          }}
        />
      </Stack>
    </GatewayProvider>
  )
}
