import { toast } from "sonner";

// Max characters to include in copyable error (avoid clipboard bloat)
const MAX_COPY_LENGTH = 8000;

interface ErrorDetails {
  message?: string;
  stack?: string;
}

function formatErrorForCopy(title: string, description?: string, details?: ErrorDetails): string {
  const parts = [title];
  if (description) parts.push(description);
  if (details?.message && details.message !== description) {
    parts.push(`Error: ${details.message}`);
  }
  if (details?.stack) {
    parts.push(`\nStack trace:\n${details.stack}`);
  }
  const full = parts.join("\n");
  return full.length > MAX_COPY_LENGTH ? full.slice(0, MAX_COPY_LENGTH) + "\n...(truncated)" : full;
}

function copyErrorAction(title: string, description?: string, details?: ErrorDetails) {
  const text = formatErrorForCopy(title, description, details);
  return {
    label: "Copy",
    onClick: () => {
      navigator.clipboard.writeText(text).catch(() => {
        // Clipboard write failed silently
      });
    },
  };
}

export const notifications = {
  // Connection events
  connectionLost: () => {
    toast.error("Connection lost", {
      description: "Lost connection to gateway. Attempting to reconnect...",
      duration: Infinity,
      id: "connection-lost",
      action: copyErrorAction(
        "Connection lost",
        "Lost connection to gateway. Attempting to reconnect...",
      ),
    });
  },

  connectionRestored: () => {
    toast.dismiss("connection-lost");
    toast.success("Connection restored", {
      description: "Successfully reconnected to gateway",
      duration: 3000,
    });
  },

  connectionFailed: (error?: string, details?: ErrorDetails) => {
    const description = error || "Failed to connect to gateway";
    toast.error("Connection failed", {
      description,
      duration: 5000,
      action: copyErrorAction("Connection failed", description, details),
    });
  },

  // Thread events
  threadCreated: (threadName: string) => {
    toast.success("Thread created", {
      description: threadName,
      duration: 3000,
    });
  },

  threadDeleted: (threadName: string) => {
    toast.info("Thread deleted", {
      description: threadName,
      duration: 3000,
    });
  },

  // Error events
  error: (title: string, description?: string, details?: ErrorDetails) => {
    toast.error(title, {
      description,
      duration: 5000,
      action: copyErrorAction(title, description, details),
    });
  },

  // Gateway RPC errors
  rpcError: (method: string, error: string, details?: ErrorDetails) => {
    const title = `RPC Error: ${method}`;
    toast.error(title, {
      description: error,
      duration: 5000,
      action: copyErrorAction(title, error, details),
    });
  },

  // Message events
  messageSent: () => {
    toast.success("Message sent", {
      duration: 2000,
    });
  },

  messageFailed: (error?: string, details?: ErrorDetails) => {
    const title = "Failed to send message";
    const description = error || "Unknown error";
    toast.error(title, {
      description,
      duration: 5000,
      action: copyErrorAction(title, description, details),
    });
  },

  // Panel events
  panelClosed: (panelType: string) => {
    toast.info(`${panelType} panel closed`, {
      duration: 2000,
    });
  },

  // Generic success
  success: (message: string, description?: string) => {
    toast.success(message, {
      description,
      duration: 3000,
    });
  },

  // Generic info
  info: (message: string, description?: string) => {
    toast.info(message, {
      description,
      duration: 3000,
    });
  },
};
