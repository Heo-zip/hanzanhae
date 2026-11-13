import './styles/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'

// 같은 React 앱에서 창 종류에 따라 배경과 화면을 구분한다.
const isGardenWindow = new URLSearchParams(window.location.search).get('view') === 'garden'
document.documentElement.classList.toggle('garden-window', isGardenWindow)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
