import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import ptBR from 'antd/locale/pt_BR'
import './index.css'
import './styles/global.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ConfigProvider locale={ptBR} theme={{ token: { colorPrimary: '#1d4e89' } }}>
        <App />
      </ConfigProvider>
    </BrowserRouter>
  </React.StrictMode>
)
