import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Stack } from 'expo-router/stack'
import { useGateway } from '@/lib/use-gateway'
import { accentColor, colors, statusColors } from '@/lib/colors'
import {
  getSecureValue,
  loadSettings,
  saveSettings,
  setSecureValue,
} from '@/lib/storage'

const THINKING_LEVELS = ['default', 'none', 'low', 'medium', 'high'] as const

export default function SettingsScreen() {
  const gateway = useGateway()

  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [thinkingLevel, setThinkingLevel] = useState<string>('default')

  useEffect(() => {
    const settings = loadSettings()
    setUrl(settings.gatewayUrl)
    setThinkingLevel(settings.thinkingLevel || 'default')
    setToken(getSecureValue('token') ?? '')
    setPassword(getSecureValue('password') ?? '')
  }, [])

  const handleConnect = useCallback(() => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      Alert.alert('Error', 'Gateway URL is required')
      return
    }

    let wsUrl = trimmedUrl
    if (wsUrl.startsWith('http://')) {wsUrl = wsUrl.replace('http://', 'ws://')}
    else if (wsUrl.startsWith('https://')) {wsUrl = wsUrl.replace('https://', 'wss://')}
    else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {wsUrl = `ws://${wsUrl}`}

    saveSettings({ gatewayUrl: wsUrl, sessionKey: '', thinkingLevel })
    if (token.trim()) {setSecureValue('token', token.trim())}
    if (password.trim()) {setSecureValue('password', password.trim())}

    gateway.connect(wsUrl, token.trim() || undefined, password.trim() || undefined)
  }, [url, token, password, thinkingLevel, gateway])

  const handleDisconnect = useCallback(() => {
    gateway.disconnect()
  }, [gateway])

  const statusColor =
    gateway.state === 'connected' ? statusColors.connected
    : gateway.state === 'connecting' ? statusColors.connecting
    : statusColors.disconnected

  const statusLabel =
    gateway.state === 'connected' ? 'Connected'
    : gateway.state === 'connecting' ? 'Connecting...'
    : 'Disconnected'

  return (
    <>
      <Stack.Screen.Title large>Settings</Stack.Screen.Title>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, gap: 24 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
      >
        {/* Status */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderCurve: 'continuous',
            padding: 16,
            gap: 8,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: colors.secondaryText,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Status
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: statusColor,
              }}
            />
            <Text style={{ fontSize: 17, color: colors.text }}>
              {statusLabel}
            </Text>
          </View>
          {gateway.lastError && (
            <Text
              selectable
              style={{ fontSize: 13, color: statusColors.disconnected }}
            >
              {gateway.lastError}
            </Text>
          )}
        </View>

        {/* Gateway */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderCurve: 'continuous',
            padding: 16,
            gap: 12,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: colors.secondaryText,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Gateway
          </Text>
          <TextInput
            style={{
              fontSize: 17,
              padding: 12,
              backgroundColor: colors.background,
              borderRadius: 8,
              borderCurve: 'continuous',
              color: colors.text,
            }}
            value={url}
            onChangeText={setUrl}
            placeholder="ws://192.168.1.100:18789"
            placeholderTextColor={colors.placeholderText}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TextInput
            style={{
              fontSize: 17,
              padding: 12,
              backgroundColor: colors.background,
              borderRadius: 8,
              borderCurve: 'continuous',
              color: colors.text,
            }}
            value={token}
            onChangeText={setToken}
            placeholder="Token (optional)"
            placeholderTextColor={colors.placeholderText}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <TextInput
            style={{
              fontSize: 17,
              padding: 12,
              backgroundColor: colors.background,
              borderRadius: 8,
              borderCurve: 'continuous',
              color: colors.text,
            }}
            value={password}
            onChangeText={setPassword}
            placeholder="Password (optional)"
            placeholderTextColor={colors.placeholderText}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
        </View>

        {/* Thinking Level */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderCurve: 'continuous',
            padding: 16,
            gap: 12,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: colors.secondaryText,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Thinking Level
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {THINKING_LEVELS.map((level) => (
              <Pressable
                key={level}
                onPress={() => setThinkingLevel(level)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor:
                    thinkingLevel === level ? accentColor : colors.fill,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    color:
                      thinkingLevel === level ? 'white' : colors.text,
                    fontWeight: thinkingLevel === level ? '600' : '400',
                  }}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Connect/Disconnect */}
        <Pressable
          onPress={
            gateway.state === 'connected' ? handleDisconnect : handleConnect
          }
          style={({ pressed }) => ({
            backgroundColor:
              gateway.state === 'connected'
                ? statusColors.disconnected
                : accentColor,
            borderRadius: 12,
            borderCurve: 'continuous',
            padding: 16,
            alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: 17, fontWeight: '600', color: 'white' }}>
            {gateway.state === 'connected' ? 'Disconnect' : 'Connect'}
          </Text>
        </Pressable>

        {/* Session Key */}
        {gateway.sessionKey ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              borderCurve: 'continuous',
              padding: 16,
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: colors.secondaryText,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Active Session
            </Text>
            <Text
              selectable
              style={{
                fontSize: 15,
                color: colors.text,
                fontFamily: 'Menlo',
              }}
            >
              {gateway.sessionKey}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </>
  )
}
