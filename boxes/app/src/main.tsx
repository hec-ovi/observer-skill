/** The page's entry point. The theme is already on the root, stamped before the first paint. */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './tokens.css'

const root = document.getElementById('root')
if (!root) throw new Error('The page has no #root to mount into')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
