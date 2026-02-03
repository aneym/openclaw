export interface ThemeDefinition {
  id: string
  name: string
  source?: string
  isBuiltIn: boolean
  cssVars: {
    theme?: Record<string, string>
    light: Record<string, string>
    dark: Record<string, string>
  }
  installedAt: number
}
