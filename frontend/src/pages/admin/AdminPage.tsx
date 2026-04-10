import { useEffect, useState, useCallback } from 'react'
import { Table, Select, Switch, Tag, message, Modal, Form, Input, Button, Tabs, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Typography } from 'antd'
import api from '../../api/client'

const { Text } = Typography

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface UserRow {
  id: number
  username: string
  role: string | null
  auth_provider: string
  is_active: boolean
  created_at: string | null
}

interface AuditLogRow {
  id: number
  username: string | null
  action: string
  status: string
  metadata: Record<string, unknown> | null
  created_at: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS:          'Login',
  LOGIN_FAILURE:          'Login falhou',
  LOGIN_PENDING_ROLE:     'Login sem permissão',
  USER_CREATED_LDAP:      'Usuário criado (AD)',
  USER_CREATED_LOCAL:     'Usuário criado (local)',
  USER_UPDATED:           'Usuário editado',
  USER_PASSWORD_CHANGED:  'Senha alterada',
  PARAM_UPDATE:           'Parâmetros editados',
  PARAM_DELETE:           'Parâmetro removido',
  PARQUET_IMPORT:         'Importação parquet',
  CONFIG_UPDATE:          'Configuração atualizada',
}

const STATUS_COLOR: Record<string, string> = {
  success: 'success',
  error:   'error',
  warning: 'warning',
}

const STATUS_LABEL: Record<string, string> = {
  success: 'OK',
  error:   'Erro',
  warning: 'Aviso',
}

function formatMetadata(meta: Record<string, unknown> | null, action?: string): { summary: string; tooltip: string | null } {
  if (!meta || Object.keys(meta).length === 0) return { summary: '—', tooltip: null }

  // PARAM_UPDATE: mostra resumo + tooltip com detalhes de cada registro
  if (action === 'PARAM_UPDATE' && Array.isArray(meta.registros)) {
    const regs = meta.registros as Array<Record<string, unknown>>
    const names = regs.map(r => r.representante as string)
    const summary = `${regs.length} registro(s) — ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`
    const FIELD_LABELS: Record<string, string> = {
      meta_frete_1: 'frete 1', meta_frete_2: 'frete 2', meta_frete_3: 'frete 3',
      margem_parbo: 'parbo', margem_branco: 'branco', margem_integral: 'integral',
    }
    const tooltip = regs.map(r => {
      const vig = (r.vigencia as string) ?? ''
      const campos = Object.entries(FIELD_LABELS)
        .filter(([k]) => r[k] != null)
        .map(([k, label]) => `${label}: ${r[k]}`)
        .join(', ')
      return `${r.representante} (${vig})${campos ? ': ' + campos : ''}`
    }).join('\n')
    return { summary, tooltip }
  }

  // PARAM_DELETE: mostra representante + vigência
  if (action === 'PARAM_DELETE' && meta.representante) {
    const vig = meta.vigencia ? ` (${meta.vigencia})` : ''
    return { summary: `${meta.representante}${vig}`, tooltip: null }
  }

  // Demais ações: key: value genérico
  const skip = new Set(['updated_by', 'deleted_by', 'changed_by', 'created_by', 'count', 'registros'])
  const summary = Object.entries(meta)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ') || '—'
  return { summary, tooltip: null }
}

// ---------------------------------------------------------------------------
// Ícones
// ---------------------------------------------------------------------------

function IconShield() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4e89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}

function IconLog() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4e89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}

function IconRefresh({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: spinning ? 'spin 0.8s linear infinite' : 'none', transformOrigin: 'center' }}
    >
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AdminPage() {
  // — Usuários —
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState<number | null>(null)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createForm] = Form.useForm()

  const [pwModalUser, setPwModalUser] = useState<UserRow | null>(null)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwForm] = Form.useForm()

  // — Logs —
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsFetched, setLogsFetched] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // — Aba ativa —
  const [activeTab, setActiveTab] = useState('usuarios')

  // ---------------------------------------------------------------------------
  // Dados
  // ---------------------------------------------------------------------------

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<UserRow[]>('/admin/usuarios')
      setUsers(data)
    } catch {
      message.error('Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLogs = useCallback(async (from = dateFrom, to = dateTo) => {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) { params.set('date_from', from); params.set('limit', '200') }
      else        { params.set('limit', '10') }
      if (to)   params.set('date_to', to)
      const { data } = await api.get<AuditLogRow[]>(`/admin/audit-logs?${params}`)
      setLogs(data)
    } catch {
      message.error('Erro ao carregar logs')
    } finally {
      setLogsLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  function handleTabChange(key: string) {
    setActiveTab(key)
    if (key === 'logs' && !logsFetched) {
      fetchLogs()
      setLogsFetched(true)
    }
  }

  // ---------------------------------------------------------------------------
  // Ações de usuários
  // ---------------------------------------------------------------------------

  async function handleRoleChange(userId: number, role: string) {
    setUpdating(userId)
    try {
      await api.put(`/admin/usuarios/${userId}?role=${role}`)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
      message.success('Permissão atualizada')
    } catch {
      message.error('Erro ao atualizar permissão')
    } finally {
      setUpdating(null)
    }
  }

  async function handleActiveChange(userId: number, is_active: boolean) {
    setUpdating(userId)
    try {
      await api.put(`/admin/usuarios/${userId}?is_active=${is_active}`)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active } : u))
      message.success(is_active ? 'Usuário ativado' : 'Usuário desativado')
    } catch {
      message.error('Erro ao atualizar status')
    } finally {
      setUpdating(null)
    }
  }

  async function handleCreateUser(values: { username: string; password: string; role?: string }) {
    setCreateLoading(true)
    try {
      const { data } = await api.post<UserRow>('/admin/usuarios', values)
      setUsers(prev => [...prev, data])
      message.success(`Usuário "${data.username}" criado`)
      setCreateModalOpen(false)
      createForm.resetFields()
    } catch (err: any) {
      message.error(err?.response?.data?.detail ?? 'Erro ao criar usuário')
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleChangePassword(values: { new_password: string }) {
    if (!pwModalUser) return
    setPwLoading(true)
    try {
      await api.put(`/admin/usuarios/${pwModalUser.id}/senha`, values)
      message.success('Senha alterada com sucesso')
      setPwModalUser(null)
      pwForm.resetFields()
    } catch (err: any) {
      message.error(err?.response?.data?.detail ?? 'Erro ao alterar senha')
    } finally {
      setPwLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Colunas — Usuários
  // ---------------------------------------------------------------------------

  const ROLE_OPTIONS = [
    { value: 'admin',  label: 'Admin' },
    { value: 'editor', label: 'Editor' },
    { value: 'viewer', label: 'Viewer' },
  ]

  const userColumns: ColumnsType<UserRow> = [
    {
      title: 'Usuário',
      dataIndex: 'username',
      key: 'username',
      width: 200,
      render: (val: string, record: UserRow) => (
        <div>
          <Text strong style={{ fontSize: 13, color: '#1e293b' }}>{val}</Text>
          {record.role === null && (
            <Tag color="warning" style={{ marginLeft: 8, fontSize: 11 }}>Pendente</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Origem',
      dataIndex: 'auth_provider',
      key: 'auth_provider',
      width: 100,
      render: (val: string) => (
        <Tag color={val === 'ldap' ? 'purple' : 'cyan'} style={{ fontSize: 12 }}>
          {val === 'ldap' ? 'AD / LDAP' : 'Local'}
        </Tag>
      ),
    },
    {
      title: 'Permissão',
      dataIndex: 'role',
      key: 'role',
      width: 160,
      render: (val: string | null, record: UserRow) => (
        <Select
          value={val ?? undefined}
          placeholder="Selecionar..."
          options={ROLE_OPTIONS}
          onChange={(role) => handleRoleChange(record.id, role)}
          loading={updating === record.id}
          size="small"
          style={{ width: 130 }}
          variant="outlined"
        />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      align: 'center',
      render: (val: boolean, record: UserRow) => (
        <Switch
          checked={val}
          onChange={(checked) => handleActiveChange(record.id, checked)}
          loading={updating === record.id}
          size="small"
          checkedChildren="Ativo"
          unCheckedChildren="Inativo"
        />
      ),
    },
    {
      title: 'Criado em',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val: string | null) => {
        if (!val) return <Text type="secondary">—</Text>
        const d = new Date(val)
        return (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {d.toLocaleDateString('pt-BR')} {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )
      },
    },
    {
      title: 'Ações',
      key: 'acoes',
      width: 130,
      align: 'center',
      render: (_: unknown, record: UserRow) => {
        if (record.auth_provider === 'ldap') return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        return (
          <button
            onClick={() => { setPwModalUser(record); pwForm.resetFields() }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#fff',
              color: '#475569',
              fontSize: 12,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              outline: 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.color = '#1d4e89' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#475569' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Trocar senha
          </button>
        )
      },
    },
  ]

  // ---------------------------------------------------------------------------
  // Colunas — Logs
  // ---------------------------------------------------------------------------

  const logColumns: ColumnsType<AuditLogRow> = [
    {
      title: 'Data / Hora',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (val: string | null) => {
        if (!val) return <Text type="secondary">—</Text>
        const d = new Date(val)
        return (
          <Text style={{ fontSize: 12, color: '#475569', fontFamily: 'Inter, sans-serif' }}>
            {d.toLocaleDateString('pt-BR')}{' '}
            {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
        )
      },
    },
    {
      title: 'Usuário',
      dataIndex: 'username',
      key: 'username',
      width: 150,
      render: (val: string | null) => (
        <Text style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>
          {val ?? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>sistema</span>}
        </Text>
      ),
    },
    {
      title: 'Ação',
      dataIndex: 'action',
      key: 'action',
      width: 180,
      render: (val: string) => (
        <Text style={{ fontSize: 12, color: '#334155', fontFamily: 'Inter, sans-serif' }}>
          {ACTION_LABELS[val] ?? val}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      align: 'center',
      render: (val: string) => (
        <Tag color={STATUS_COLOR[val] ?? 'default'} style={{ fontSize: 11 }}>
          {STATUS_LABEL[val] ?? val}
        </Tag>
      ),
    },
    {
      title: 'Detalhes',
      dataIndex: 'metadata',
      key: 'metadata',
      render: (val: Record<string, unknown> | null, record: AuditLogRow) => {
        const { summary, tooltip } = formatMetadata(val, record.action)
        const text = (
          <Text type="secondary" style={{
            fontSize: 12,
            fontFamily: 'Inter, sans-serif',
            ...(tooltip ? { borderBottom: '1px dashed #94a3b8', cursor: 'help' } : {}),
          }}>
            {summary}
          </Text>
        )
        if (!tooltip) return text
        return (
          <Tooltip title={<span style={{ whiteSpace: 'pre-line', fontSize: 12 }}>{tooltip}</span>} placement="topLeft">
            {text}
          </Tooltip>
        )
      },
    },
  ]

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const pendingCount = users.filter(u => u.role === null).length

  const tabItems = [
    {
      key: 'usuarios',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
          <IconShield />
          Usuários
          {pendingCount > 0 && (
            <span style={{
              background: '#f59e0b',
              color: '#fff',
              borderRadius: 10,
              padding: '1px 7px',
              fontSize: 11,
              fontWeight: 600,
              lineHeight: '16px',
            }}>{pendingCount}</span>
          )}
        </span>
      ),
      children: (
        <>
          {/* Alerta de pendentes */}
          {pendingCount > 0 && (
            <div style={{
              background: '#fefce8',
              border: '1px solid #fde68a',
              borderRadius: 12,
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}>
              <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>&#9888;&#65039;</span>
              <div>
                <div style={{ fontWeight: 600, color: '#92400e', fontSize: 13, fontFamily: 'Inter, sans-serif', marginBottom: 2 }}>
                  {pendingCount} usuário(s) aguardando aprovação
                </div>
                <div style={{ color: '#b45309', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>
                  Selecione uma permissão para liberar o acesso ao sistema.
                </div>
              </div>
            </div>
          )}

          <Table
            className="admin-table"
            columns={userColumns}
            dataSource={users}
            rowKey="id"
            size="middle"
            pagination={false}
            bordered
            loading={loading}
            scroll={{ x: 'max-content', y: 'calc(100vh - 220px)' }}
            locale={{ emptyText: 'Nenhum usuário encontrado' }}
          />
        </>
      ),
    },
    {
      key: 'logs',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
          <IconLog />
          Logs de Auditoria
        </span>
      ),
      children: (
        <>
          {/* Filtro de data */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
              Período:
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{
                fontSize: 12, padding: '4px 8px', borderRadius: 8,
                border: '1px solid #e2e8f0', color: '#334155', outline: 'none',
                fontFamily: 'Inter, sans-serif',
              }}
            />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>até</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{
                fontSize: 12, padding: '4px 8px', borderRadius: 8,
                border: '1px solid #e2e8f0', color: '#334155', outline: 'none',
                fontFamily: 'Inter, sans-serif',
              }}
            />
            <button
              onClick={() => fetchLogs(dateFrom, dateTo)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 8,
                border: '1px solid #bfdbfe', background: '#eff6ff',
                color: '#1d4e89', fontSize: 12, fontFamily: 'Inter, sans-serif',
                fontWeight: 500, cursor: 'pointer', outline: 'none',
              }}
            >
              Buscar
            </button>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); fetchLogs('', '') }}
                style={{
                  fontSize: 12, padding: '5px 10px', borderRadius: 8,
                  border: '1px solid #e2e8f0', background: '#fff',
                  color: '#64748b', cursor: 'pointer', outline: 'none',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Limpar
              </button>
            )}
            {!dateFrom && (
              <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>
                (sem filtro: exibe os 10 últimos registros)
              </span>
            )}
          </div>

          <Table
            className="admin-table"
            columns={logColumns}
            dataSource={logs}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (t) => `${t} registros` }}
            bordered
            loading={logsLoading}
            scroll={{ x: 'max-content', y: 'calc(100vh - 310px)' }}
            locale={{ emptyText: 'Nenhum registro encontrado' }}
          />
        </>
      ),
    },
  ]

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 16,
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
      padding: '20px 24px 24px',
      height: 'calc(100vh - 32px)',
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30,
            background: 'rgba(29,78,137,0.08)',
            border: '1px solid rgba(29,78,137,0.18)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <IconShield />
          </div>
          <span style={{
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 700,
            fontSize: 17,
            color: '#0f1f3d',
            letterSpacing: '-0.01em',
          }}>
            Administração
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-start' }}>
          {activeTab === 'usuarios' && (
            <button
              onClick={() => { setCreateModalOpen(true); createForm.resetFields() }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                borderRadius: 10,
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                color: '#1d4e89',
                fontSize: 13,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Novo Usuário
            </button>
          )}

          <button
            onClick={activeTab === 'usuarios' ? fetchUsers : () => fetchLogs()}
            disabled={activeTab === 'usuarios' ? loading : logsLoading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              background: '#fff',
              color: '#475569',
              fontSize: 13,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
              cursor: (activeTab === 'usuarios' ? loading : logsLoading) ? 'not-allowed' : 'pointer',
              opacity: (activeTab === 'usuarios' ? loading : logsLoading) ? 0.65 : 1,
              transition: 'all 0.2s',
              outline: 'none',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.color = '#1d4e89' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#475569' }}
          >
            <IconRefresh spinning={activeTab === 'usuarios' ? loading : logsLoading} />
            {(activeTab === 'usuarios' ? loading : logsLoading) ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Modais */}
      <Modal
        title="Novo Usuário Local"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields() }}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateUser} style={{ marginTop: 8 }}>
          <Form.Item label="Usuário" name="username" rules={[{ required: true, message: 'Informe o nome de usuário' }]}>
            <Input placeholder="nome.sobrenome" autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="Senha"
            name="password"
            rules={[{ required: true, message: 'Informe a senha' }, { min: 6, message: 'Mínimo 6 caracteres' }]}
          >
            <Input.Password placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="Permissão" name="role">
            <Select placeholder="Selecionar (opcional)" options={ROLE_OPTIONS} allowClear />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setCreateModalOpen(false); createForm.resetFields() }}>Cancelar</Button>
            <Button type="primary" htmlType="submit" loading={createLoading}>Criar</Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={`Trocar senha — ${pwModalUser?.username ?? ''}`}
        open={!!pwModalUser}
        onCancel={() => { setPwModalUser(null); pwForm.resetFields() }}
        footer={null}
        destroyOnClose
      >
        <Form form={pwForm} layout="vertical" onFinish={handleChangePassword} style={{ marginTop: 8 }}>
          <Form.Item
            label="Nova senha"
            name="new_password"
            rules={[{ required: true, message: 'Informe a nova senha' }, { min: 6, message: 'Mínimo 6 caracteres' }]}
          >
            <Input.Password placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setPwModalUser(null); pwForm.resetFields() }}>Cancelar</Button>
            <Button type="primary" htmlType="submit" loading={pwLoading}>Salvar</Button>
          </div>
        </Form>
      </Modal>

      {/* Abas */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .admin-table .ant-table { border-radius: 10px; overflow: hidden; }
        .admin-table .ant-table-wrapper {
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        .admin-table .ant-table-tbody > tr:nth-child(even) > td { background: #f8fafc; }
        .admin-table .ant-table-tbody > tr:hover > td { background: #eff6ff !important; }
      `}</style>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems}
        size="small"
        style={{ fontFamily: 'Inter, sans-serif' }}
      />
    </div>
  )
}
