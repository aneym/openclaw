import { PlatformColor } from 'react-native'
import { NativeTabs } from 'expo-router/unstable-native-tabs'

const { Trigger } = NativeTabs
const { Icon, Label } = Trigger

export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor={PlatformColor('label')}
      minimizeBehavior="onScrollDown"
    >
      <Trigger name="(chat)">
        <Icon sf={{ default: 'message', selected: 'message.fill' }} />
        <Label>Threads</Label>
      </Trigger>
      <Trigger name="(settings)">
        <Icon sf="gearshape.fill" />
        <Label>Settings</Label>
      </Trigger>
    </NativeTabs>
  )
}
