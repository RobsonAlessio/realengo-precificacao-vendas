import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'

const SIDEBAR_BG = '#0f1f3d'

// ── Ícones SVG ────────────────────────────────────────────────────────────────
function IconTable({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M3 15h18M9 3v18"/>
    </svg>
  )
}
function IconBarChart({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
function IconUsers({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
function IconLogout({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}
function IconChevronLeft({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}
function IconChevronRight({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}

// ── Menu items ────────────────────────────────────────────────────────────────
const MENU_ITEMS = [
  { key: 'prices',    Icon: IconTable,    label: 'Tabela de Preços' },
  { key: 'simulator', Icon: IconBarChart, label: 'Simulador de Vendas' },
  { key: 'params',    Icon: IconUsers,    label: 'Parâmetros' },
]

function NavBtn({
  isActive, isCollapsed, Icon, label, onClick,
}: {
  isActive: boolean
  isCollapsed: boolean
  Icon: (p: { color?: string }) => JSX.Element
  label: string
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={isCollapsed ? label : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: isCollapsed ? '11px 0' : '10px 12px',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        marginBottom: 2,
        borderRadius: 10,
        border: 'none',
        borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
        background: isActive
          ? 'rgba(59,130,246,0.14)'
          : hover ? 'rgba(255,255,255,0.06)' : 'transparent',
        cursor: 'pointer',
        outline: 'none',
        transition: 'background 0.2s',
      }}
    >
      <Icon color={isActive ? '#60a5fa' : 'rgba(255,255,255,0.45)'} />
      {!isCollapsed && (
        <span style={{
          fontSize: 14,
          color: isActive ? '#e2e8f0' : 'rgba(255,255,255,0.5)',
          fontFamily: 'Inter, sans-serif',
          fontWeight: isActive ? 500 : 400,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}>
          {label}
        </span>
      )}
    </button>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AppLayout() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()
  
  const activeKey = location.pathname.split('/').filter(Boolean).pop() || 'prices'

  const [collapsed, setCollapsed] = useState(false)
  const [hoverLogout, setHoverLogout] = useState(false)
  const [hoverCollapse, setHoverCollapse] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : 'U'

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      background: '#f0f4f8',
      overflow: 'hidden',
    }}>

      {/* ── Sidebar — colada nas bordas esquerda/topo/baixo, arredondada à direita ── */}
      <aside style={{
        width: collapsed ? 68 : 220,
        minWidth: collapsed ? 68 : 220,
        background: SIDEBAR_BG,
        borderRadius: '0 20px 20px 0',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
        transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)',
        flexShrink: 0,
      }}>

        {/* Logo */}
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0' : '0 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          {collapsed ? (
            <div style={{
              width: 36, height: 36,
              borderRadius: 11,
              background: 'rgba(59,130,246,0.12)',
              border: '1px solid rgba(96,165,250,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: '#60a5fa' }}>P</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32,
                borderRadius: 10,
                background: 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(96,165,250,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14, color: '#60a5fa' }}>P</span>
              </div>
              <div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13, color: '#fff', lineHeight: 1.2 }}>Precificação</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', lineHeight: 1.3 }}>Realengo</div>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 8px' }}>
          {MENU_ITEMS.map(({ key, Icon, label }) => (
            <NavBtn
              key={key}
              isActive={key === activeKey}
              isCollapsed={collapsed}
              Icon={Icon}
              label={label}
              onClick={() => navigate(`/app/${key}`)}
            />
          ))}
        </nav>

        {/* Rodapé — usuário + logout + colapso */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          padding: '10px 8px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}>
          {/* Usuário */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: collapsed ? '8px 0' : '8px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            marginBottom: 2,
          }}>
            <div style={{
              width: 28, height: 28,
              borderRadius: 8,
              background: '#1d4e89',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff',
              fontFamily: 'Inter, sans-serif',
              flexShrink: 0,
              letterSpacing: '0.02em',
            }}>
              {initials}
            </div>
            {!collapsed && (
              <span style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.55)',
                fontFamily: 'Inter, sans-serif',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {user?.username}
              </span>
            )}
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            onMouseEnter={() => setHoverLogout(true)}
            onMouseLeave={() => setHoverLogout(false)}
            title={collapsed ? 'Sair' : undefined}
            style={{
              display: 'flex', alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 9,
              width: '100%',
              padding: collapsed ? '9px 0' : '9px 10px',
              borderRadius: 10,
              border: 'none',
              background: hoverLogout ? 'rgba(239,68,68,0.12)' : 'transparent',
              cursor: 'pointer',
              outline: 'none',
              transition: 'background 0.2s',
            }}
          >
            <IconLogout color={hoverLogout ? '#f87171' : 'rgba(255,255,255,0.3)'} />
            {!collapsed && (
              <span style={{
                fontSize: 13,
                color: hoverLogout ? '#f87171' : 'rgba(255,255,255,0.3)',
                fontFamily: 'Inter, sans-serif',
                transition: 'color 0.2s',
              }}>
                Sair
              </span>
            )}
          </button>

          {/* Colapso */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            onMouseEnter={() => setHoverCollapse(true)}
            onMouseLeave={() => setHoverCollapse(false)}
            title={collapsed ? 'Expandir' : 'Recolher'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%',
              padding: '6px 0',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.07)',
              background: hoverCollapse ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
              outline: 'none',
              transition: 'background 0.2s',
            }}
          >
            {collapsed
              ? <IconChevronRight color="rgba(255,255,255,0.35)" />
              : <IconChevronLeft  color="rgba(255,255,255,0.35)" />
            }
          </button>
        </div>
      </aside>

      {/* ── Conteúdo ── */}
      <main style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <Outlet />
      </main>

    </div>
  )
}
