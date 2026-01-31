import * as SecureStore from 'expo-secure-store'
import 'expo-sqlite/localStorage/install'

// Secure storage for credentials

const SECURE_KEYS = {
  token: 'openclaw.token',
  password: 'openclaw.password',
} as const

export function getSecureValue(key: keyof typeof SECURE_KEYS): string | null {
  try {
    return SecureStore.getItem(SECURE_KEYS[key])
  } catch {
    return null
  }
}

export function setSecureValue(key: keyof typeof SECURE_KEYS, value: string): void {
  SecureStore.setItem(SECURE_KEYS[key], value)
}

export function deleteSecureValue(key: keyof typeof SECURE_KEYS): void {
  try {
    SecureStore.deleteItemAsync(SECURE_KEYS[key])
  } catch {
    // ignore
  }
}

// Regular storage for settings via localStorage polyfill

export interface GatewaySettings {
  gatewayUrl: string
  sessionKey: string
  thinkingLevel: string
}

const SETTINGS_KEY = 'openclaw.settings'

const DEFAULT_SETTINGS: GatewaySettings = {
  gatewayUrl: '',
  sessionKey: '',
  thinkingLevel: 'default',
}

export function loadSettings(): GatewaySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: GatewaySettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
