import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, Input, Typography, Alert } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import api from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { Token, User } from '../../types'

const { Title, Text } = Typography

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function onFinish(values: { username: string; password: string }) {
    setLoading(true)
    setError(null)
    try {
      const { data: tokenData } = await api.post<Token>('/auth/login', values)
      const { data: userData }  = await api.get<User>('/auth/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      setAuth(tokenData.access_token, userData)
      navigate('/app')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Erro ao conectar ao servidor'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(145deg, #0a1f4a 0%, #1d4e89 55%, #2471b5 100%)',
    }}>
      {/* Card central */}
      <div style={{
        width: 400,
        background: '#ffffff',
        borderRadius: 16,
        boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
        padding: '40px 36px 32px',
      }}>
        {/* Cabeçalho */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #1d4e89, #2471b5)',
            marginBottom: 16,
            boxShadow: '0 4px 12px rgba(29,78,137,0.35)',
          }}>
            <span style={{ fontSize: 26, color: '#fff' }}>R</span>
          </div>
          <Title level={3} style={{ margin: 0, color: '#0f1f3d', fontWeight: 700 }}>
            Precificação de Vendas
          </Title>
          <Text style={{ color: '#8a9ab5', fontSize: 13, marginTop: 4, display: 'block' }}>
            Realengo
          </Text>
        </div>

        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            style={{ marginBottom: 20, borderRadius: 8 }}
          />
        )}

        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="username"
            label={<Text style={{ color: '#374151', fontWeight: 500 }}>Usuário</Text>}
            rules={[{ required: true, message: 'Informe o usuário' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#9ca3af' }} />}
              placeholder="Seu usuário"
              size="large"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={<Text style={{ color: '#374151', fontWeight: 500 }}>Senha</Text>}
            rules={[{ required: true, message: 'Informe a senha' }]}
            style={{ marginBottom: 24 }}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#9ca3af' }} />}
              placeholder="Sua senha"
              size="large"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
              style={{
                background: 'linear-gradient(90deg, #1d4e89, #2471b5)',
                border: 'none',
                borderRadius: 8,
                height: 44,
                fontWeight: 600,
                fontSize: 15,
                boxShadow: '0 4px 14px rgba(29,78,137,0.35)',
              }}
            >
              Entrar
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}
