import { toast } from 'sonner'

export const notifications = {
  // Connection events
  connectionLost: () => {
    toast.error('Connection lost', {
      description: 'Lost connection to gateway. Attempting to reconnect...',
      duration: Infinity,
      id: 'connection-lost'
    })
  },

  connectionRestored: () => {
    toast.dismiss('connection-lost')
    toast.success('Connection restored', {
      description: 'Successfully reconnected to gateway',
      duration: 3000
    })
  },

  connectionFailed: (error?: string) => {
    toast.error('Connection failed', {
      description: error || 'Failed to connect to gateway',
      duration: 5000
    })
  },

  // Thread events
  threadCreated: (threadName: string) => {
    toast.success('Thread created', {
      description: threadName,
      duration: 3000
    })
  },

  threadDeleted: (threadName: string) => {
    toast.info('Thread deleted', {
      description: threadName,
      duration: 3000
    })
  },

  // Error events
  error: (title: string, description?: string) => {
    toast.error(title, {
      description,
      duration: 5000
    })
  },

  // Gateway RPC errors
  rpcError: (method: string, error: string) => {
    toast.error(`RPC Error: ${method}`, {
      description: error,
      duration: 5000
    })
  },

  // Message events
  messageSent: () => {
    toast.success('Message sent', {
      duration: 2000
    })
  },

  messageFailed: (error?: string) => {
    toast.error('Failed to send message', {
      description: error || 'Unknown error',
      duration: 5000
    })
  },

  // Panel events
  panelClosed: (panelType: string) => {
    toast.info(`${panelType} panel closed`, {
      duration: 2000
    })
  },

  // Generic success
  success: (message: string, description?: string) => {
    toast.success(message, {
      description,
      duration: 3000
    })
  },

  // Generic info
  info: (message: string, description?: string) => {
    toast.info(message, {
      description,
      duration: 3000
    })
  }
}
