import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Reserve space for macOS hidden-inset title bar (traffic lights)
if (window.electron?.process?.platform === 'darwin') {
  document.documentElement.style.setProperty('--titlebar-height', '38px')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
