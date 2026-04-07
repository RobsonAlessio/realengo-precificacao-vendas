import { useEffect, useState, useCallback } from 'react'
import { Table, Select, Switch, Tag, message, Modal, Form, Input, Button } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Typography } from 'antd'
import api from '../../api/client'

const { Text } = Typography

interface UserRow {
  id: number
  username: string
  role: string | null
  auth_provider: string
  is_active: boolean
  created_at: string | null
}

const ROLE_OPTIONS = [
  { value: 'admin',  label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]

function IconShield() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4e89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
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

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState<number | null>(null)

  // Modal: criar usuário local
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createForm] = Form.useForm()

  // Modal: trocar senha
  const [pwModalUser, setPwModalUser] = useState<UserRow | null>(null)
  const [pwLoading, setPwLoading] = useState(false)
  const [pwForm] = Form.useForm()

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

  useEffect(() => { fetchUsers() }, [fetchUsers])

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
      const detail = err?.response?.data?.detail
      message.error(detail ?? 'Erro ao criar usuário')
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
      const detail = err?.response?.data?.detail
      message.error(detail ?? 'Erro ao alterar senha')
    } finally {
      setPwLoading(false)
    }
  }

  const pendingCount = users.filter(u => u.role === null).length

  const columns: ColumnsType<UserRow> = [
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

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 16,
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
      padding: '20px 24px 24px',
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
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
              Gerenciamento de Usuários
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: 40 }}>
            <span style={{ color: '#64748b', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>
              {users.length} usuário(s)
            </span>
            {pendingCount > 0 && (
              <span style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.25)',
                color: '#92400e',
                borderRadius: 8,
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'Inter, sans-serif',
              }}>
                {pendingCount} pendente(s)
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-start' }}>
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

          <button
            onClick={fetchUsers}
            disabled={loading}
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
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.65 : 1,
              transition: 'all 0.2s',
              outline: 'none',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.color = '#1d4e89' } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#475569' }}
          >
            <IconRefresh spinning={loading} />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

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

      {/* Modal: criar usuário local */}
      <Modal
        title="Novo Usuário Local"
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields() }}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateUser} style={{ marginTop: 8 }}>
          <Form.Item
            label="Usuário"
            name="username"
            rules={[{ required: true, message: 'Informe o nome de usuário' }]}
          >
            <Input placeholder="nome.sobrenome" autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="Senha"
            name="password"
            rules={[
              { required: true, message: 'Informe a senha' },
              { min: 6, message: 'Mínimo 6 caracteres' },
            ]}
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

      {/* Modal: trocar senha */}
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
            rules={[
              { required: true, message: 'Informe a nova senha' },
              { min: 6, message: 'Mínimo 6 caracteres' },
            ]}
          >
            <Input.Password placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setPwModalUser(null); pwForm.resetFields() }}>Cancelar</Button>
            <Button type="primary" htmlType="submit" loading={pwLoading}>Salvar</Button>
          </div>
        </Form>
      </Modal>

      {/* Tabela */}
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
      <Table
        className="admin-table"
        columns={columns}
        dataSource={users}
        rowKey="id"
        size="middle"
        pagination={false}
        bordered
        loading={loading}
        locale={{ emptyText: 'Nenhum usuário encontrado' }}
      />
    </div>
  )
}
