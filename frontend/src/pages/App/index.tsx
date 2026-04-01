import { useState } from 'react'
import { Layout, Menu, Typography, Button, Avatar, Space, Tooltip } from 'antd'
import {
  TableOutlined,
  BarChartOutlined,
  TeamOutlined,
  LogoutOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../store/authStore'
import { useNavigate } from 'react-router-dom'
import PriceTable from './PriceTable'
import SalesSimulator from './SalesSimulator'
import RepresentantesParams from './RepresentantesParams'

const { Header, Sider, Content } = Layout
const { Text } = Typography

const SIDEBAR_BG     = '#0f1f3d'
const SIDEBAR_HOVER  = 'rgba(255,255,255,0.08)'
const SIDEBAR_ACTIVE = 'rgba(255,255,255,0.15)'

const MENU_ITEMS = [
  { key: 'prices',    icon: <TableOutlined />,   label: 'Tabela de Preços' },
  { key: 'simulator', icon: <BarChartOutlined />, label: 'Simulador de Vendas' },
  { key: 'params',    icon: <TeamOutlined />,     label: 'Parâmetros' },
]

export default function AppLayout() {
  const user     = useAuthStore((s) => s.user)
  const logout   = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [activeKey, setActiveKey] = useState('prices')
  const [collapsed, setCollapsed] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const pageMap: Record<string, JSX.Element> = {
    prices:    <PriceTable />,
    simulator: <SalesSimulator />,
    params:    <RepresentantesParams />,
  }

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : 'U'

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <Sider
        collapsed={collapsed}
        trigger={null}
        width={220}
        collapsedWidth={72}
        style={{
          background: SIDEBAR_BG,
          boxShadow: '2px 0 12px rgba(0,0,0,0.3)',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {/* ── Logo ── */}
        <div style={{
          height: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: collapsed ? '12px 10px' : '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          {collapsed ? (
            <img
              src="/logoRealengoVertical.png"
              alt="R"
              style={{ width: 44, height: 44, objectFit: 'contain' }}
            />
          ) : (
            <img
              src="/LogoRealengoHorizontal.png"
              alt="Realengo"
              style={{ height: 40, objectFit: 'contain', maxWidth: '100%' }}
            />
          )}
        </div>

        {/* ── Menu ── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 8 }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[activeKey]}
            onClick={({ key }) => setActiveKey(key)}
            items={MENU_ITEMS.map(item => ({ key: item.key, icon: item.icon, label: item.label }))}
            style={{
              background: SIDEBAR_BG,
              borderRight: 0,
              fontSize: 15,
            }}
          />
        </div>

        {/* ── Botão colapso — rodapé da sidebar ── */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          padding: '10px 0',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Tooltip title={collapsed ? 'Expandir' : 'Recolher'} placement="right">
            <Button
              type="text"
              icon={collapsed ? <RightOutlined /> : <LeftOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                color: 'rgba(255,255,255,0.45)',
                width: 40,
                height: 40,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
              }}
            />
          </Tooltip>
        </div>

        <style>{`
          /* Sider interno — flex coluna para empurrar botão ao fundo */
          .ant-layout-sider-children {
            display: flex !important;
            flex-direction: column !important;
            height: 100% !important;
          }
          /* hover e seleção */
          .ant-menu-dark .ant-menu-item:hover { background: ${SIDEBAR_HOVER} !important; }
          .ant-menu-dark .ant-menu-item-selected { background: ${SIDEBAR_ACTIVE} !important; }

          /* pill nos itens — apenas no modo expandido */
          .ant-menu-dark.ant-menu-inline .ant-menu-item {
            margin: 3px 8px;
            width: calc(100% - 16px);
            border-radius: 8px;
          }
        `}</style>
      </Sider>

      {/* ── Área principal ── */}
      <Layout style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        <Header style={{
          background: '#ffffff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          height: 60,
          flexShrink: 0,
          zIndex: 100,
        }}>
          <Text strong style={{ fontSize: 16, color: '#0f1f3d' }}>
            {MENU_ITEMS.find(m => m.key === activeKey)?.label}
          </Text>

          <Space size={10}>
            <Avatar style={{ background: '#1d4e89', fontSize: 13, fontWeight: 700, cursor: 'default' }}>
              {initials}
            </Avatar>
            <Text style={{ color: '#555', fontSize: 13 }}>{user?.username}</Text>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              style={{ color: '#999', fontSize: 13 }}
            >
              Sair
            </Button>
          </Space>
        </Header>

        <Content style={{
          flex: 1,
          overflowY: 'auto',
          padding: 24,
          background: '#f5f7fa',
        }}>
          {pageMap[activeKey]}
        </Content>

      </Layout>
    </Layout>
  )
}
