import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { GatewayProvider } from '@/lib/use-gateway'

const { Trigger } = NativeTabs
const { Icon, Label } = Trigger

export default function RootLayout() {
  return (
    <GatewayProvider>
      <NativeTabs minimizeBehavior="onScrollDown">
        <Trigger name="(chat)">
          <Icon sf={{ default: 'message', selected: 'message.fill' }} />
          <Label>Threads</Label>
        </Trigger>
        <Trigger name="(settings)">
          <Icon sf="gearshape.fill" />
          <Label>Settings</Label>
        </Trigger>
      </NativeTabs>
    </GatewayProvider>
  )
}
