import { PlatformColor } from 'react-native'

// Greyscale theme using iOS system colors.
// All colors adapt automatically to light/dark mode.

export const colors = {
  background: PlatformColor('systemGroupedBackground'),
  surface: PlatformColor('secondarySystemGroupedBackground'),
  text: PlatformColor('label'),
  secondaryText: PlatformColor('secondaryLabel'),
  tertiaryText: PlatformColor('tertiaryLabel'),
  separator: PlatformColor('separator'),
  fill: PlatformColor('systemFill'),
  secondaryFill: PlatformColor('secondarySystemFill'),
  tertiaryFill: PlatformColor('tertiarySystemFill'),
  quaternaryFill: PlatformColor('quaternarySystemFill'),
  placeholderText: PlatformColor('placeholderText'),
}

export const bubbleColors = {
  user: PlatformColor('systemGray5'),
  userText: PlatformColor('label'),
  assistant: PlatformColor('systemGray6'),
  assistantText: PlatformColor('label'),
}

export const statusColors = {
  connected: PlatformColor('systemGreen'),
  connecting: PlatformColor('systemOrange'),
  disconnected: PlatformColor('systemRed'),
}

export const accentColor = PlatformColor('systemGray')
