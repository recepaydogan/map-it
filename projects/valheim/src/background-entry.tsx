import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BackgroundController } from './background/background-controller'
import { initAnalytics } from './lib/analytics/analytics'
import './index.css'

initAnalytics('background')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BackgroundController />
  </StrictMode>,
)

