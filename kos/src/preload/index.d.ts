import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getGatewayConfig: () => Promise<{ url: string; token?: string }>
      openDirectoryDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>
    }
  }
}
