import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Select, Space, Typography, Spin, Tag, Alert,
  InputNumber, Popconfirm, message, Card, Divider, Tooltip,
} from 'antd'
import {
  SaveOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '../../api/client'

const { Text } = Typography

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface RepAtivo {
  codigo: number | null
  fantasia: string
}

interface VigenciaRow {
  key: string
  db_id: number | null
  representante: string
  dia: number
  meta_frete_1: number | null
  meta_frete_2: number | null
  meta_frete_3: number | null
  margem_parbo: number | null
  margem_branco: number | null
  margem_integral: number | null
  isNew: boolean
  isDirty: boolean
}

interface ApiParam {
  id: number
  representante: string
  data_vigencia: string
  meta_frete_1: number | null
  meta_frete_2: number | null
  meta_frete_3: number | null
  margem_parbo: number | null
  margem_branco: number | null
  margem_integral: number | null
}

interface ApiRepresentante {
  codigo: number | null
  representante: string
  parametros: ApiParam[]
  fallback_parquet: Record<string, number> | null
}

interface ApiResponse {
  mes: string
  representantes: ApiRepresentante[]
}

// ── Ícone ──────────────────────────────────────────────────────────────────────

function IconUsers() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4e89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

function diasDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate()
}

function fmtPct(v: number | null): string {
  if (v == null) return '—'
  return (v * 100).toFixed(2) + '%'
}

function buildKey(rep: string, dia: number, suffix: string): string {
  return `${rep}__${dia}__${suffix}`
}

// ── Componente principal ───────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
  overflow: 'hidden'
}

export default function RepresentantesParams() {
  const now = new Date()
  const [ano, setAno] = useState(now.getFullYear())
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [selectedRep, setSelectedRep] = useState<string | null>(null)

  const [ativos, setAtivos] = useState<RepAtivo[]>([])
  const [vigencias, setVigencias] = useState<VigenciaRow[]>([])
  const [fallback, setFallback] = useState<Record<string, number> | null>(null)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Fetch lista de representantes ativos ─────────────────────────────────────

  const fetchAtivos = useCallback(async () => {
    try {
      const { data } = await api.get<RepAtivo[]>('/representantes/ativos')
      setAtivos(data)
    } catch {
      // silencioso — tabela de parâmetros mostrará erro próprio
    }
  }, [])

  useEffect(() => { fetchAtivos() }, [fetchAtivos])

  // ── Fetch parâmetros do representante selecionado ─────────────────────────────

  const fetchParams = useCallback(async () => {
    if (!selectedRep) {
      setVigencias([])
      setFallback(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<ApiResponse>('/representantes/parametros', {
        params: { ano, mes },
      })
      const found = data.representantes.find(r => r.representante === selectedRep)
      if (!found) {
        setVigencias([])
        setFallback(null)
        return
      }
      setFallback(found.fallback_parquet)
      setVigencias(found.parametros.map(p => {
        const dia = parseInt(p.data_vigencia.split('-')[2], 10)
        return {
          key: buildKey(p.representante, dia, String(p.id)),
          db_id: p.id,
          representante: p.representante,
          dia,
          meta_frete_1: p.meta_frete_1,
          meta_frete_2: p.meta_frete_2,
          meta_frete_3: p.meta_frete_3,
          margem_parbo: p.margem_parbo,
          margem_branco: p.margem_branco,
          margem_integral: p.margem_integral,
          isNew: false,
          isDirty: false,
        }
      }))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Erro ao carregar parâmetros')
    } finally {
      setLoading(false)
    }
  }, [selectedRep, ano, mes])

  useEffect(() => { fetchParams() }, [fetchParams])

  // ── Edição inline ─────────────────────────────────────────────────────────────

  function updateField(rowKey: string, field: keyof VigenciaRow, value: unknown) {
    setVigencias(prev => prev.map(v =>
      v.key === rowKey ? { ...v, [field]: value, isDirty: true } : v
    ))
  }

  // ── Adicionar vigência ────────────────────────────────────────────────────────

  function addVigencia() {
    if (!selectedRep) return
    const totalDias = diasDoMes(ano, mes)
    const newDia = Math.min(now.getDate(), totalDias)
    const newKey = buildKey(selectedRep, newDia, `new_${Date.now()}`)
    setVigencias(prev => [
      ...prev,
      {
        key: newKey,
        db_id: null,
        representante: selectedRep,
        dia: newDia,
        meta_frete_1: fallback?.meta_frete ?? null,
        meta_frete_2: null,
        meta_frete_3: null,
        margem_parbo: fallback?.margem_parbo ?? null,
        margem_branco: fallback?.margem_branco ?? null,
        margem_integral: fallback?.margem_integral ?? null,
        isNew: true,
        isDirty: true,
      },
    ])
  }

  // ── Replicar para dias seguintes ──────────────────────────────────────────────

  function replicarParaDiasSeguintes(row: VigenciaRow) {
    const totalDias = diasDoMes(ano, mes)
    const diasSeguintes = Array.from(
      { length: totalDias - row.dia },
      (_, i) => row.dia + i + 1
    )
    if (diasSeguintes.length === 0) {
      message.info('Não há dias seguintes neste mês.')
      return
    }
    setVigencias(prev => {
      const existingDias = new Set(prev.map(v => v.dia))
      const novas: VigenciaRow[] = diasSeguintes
        .filter(d => !existingDias.has(d))
        .map(d => ({
          key: buildKey(selectedRep!, d, `new_${Date.now()}_${d}`),
          db_id: null,
          representante: selectedRep!,
          dia: d,
          meta_frete_1: row.meta_frete_1,
          meta_frete_2: row.meta_frete_2,
          meta_frete_3: row.meta_frete_3,
          margem_parbo: row.margem_parbo,
          margem_branco: row.margem_branco,
          margem_integral: row.margem_integral,
          isNew: true,
          isDirty: true,
        }))
      // atualiza os já existentes nos dias seguintes
      const updated = prev.map(v => {
        if (diasSeguintes.includes(v.dia)) {
          return {
            ...v,
            meta_frete_1: row.meta_frete_1,
            meta_frete_2: row.meta_frete_2,
            meta_frete_3: row.meta_frete_3,
            margem_parbo: row.margem_parbo,
            margem_branco: row.margem_branco,
            margem_integral: row.margem_integral,
            isDirty: true,
          }
        }
        return v
      })
      return [...updated, ...novas].sort((a, b) => a.dia - b.dia)
    })
    message.success(`Valores replicados para ${diasSeguintes.length} dia(s) seguinte(s).`)
  }

  // ── Deletar ───────────────────────────────────────────────────────────────────

  async function deleteVigencia(row: VigenciaRow) {
    if (row.db_id) {
      try {
        await api.delete(`/representantes/parametros/${row.db_id}`)
        message.success('Vigência excluída')
      } catch {
        message.error('Erro ao excluir vigência')
        return
      }
    }
    setVigencias(prev => prev.filter(v => v.key !== row.key))
  }

  // ── Salvar ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const dirty = vigencias.filter(v => v.isDirty)
    if (dirty.length === 0) {
      message.info('Nenhuma alteração pendente.')
      return
    }
    setSaving(true)
    try {
      const payload = dirty.map(v => ({
        representante: v.representante,
        data_vigencia: `${ano}-${String(mes).padStart(2, '0')}-${String(v.dia).padStart(2, '0')}`,
        meta_frete_1: v.meta_frete_1,
        meta_frete_2: v.meta_frete_2,
        meta_frete_3: v.meta_frete_3,
        margem_parbo: v.margem_parbo,
        margem_branco: v.margem_branco,
        margem_integral: v.margem_integral,
      }))
      const { data } = await api.put('/representantes/parametros', payload)
      message.success(`${data.salvos} registro(s) salvo(s)!`)
      fetchParams()
    } catch {
      message.error('Erro ao salvar parâmetros')
    } finally {
      setSaving(false)
    }
  }

  // ── Colunas da tabela ─────────────────────────────────────────────────────────

  const totalDias = diasDoMes(ano, mes)
  const diasOptions = Array.from({ length: totalDias }, (_, i) => ({
    value: i + 1,
    label: `Dia ${String(i + 1).padStart(2, '0')}`,
  }))

  const cols: ColumnsType<VigenciaRow> = [
    {
      title: 'Vigência',
      dataIndex: 'dia',
      width: 110,
      fixed: 'left',
      render: (dia: number, row) => row.isNew ? (
        <Select
          size="small"
          value={dia}
          options={diasOptions}
          style={{ width: 100 }}
          onChange={v => updateField(row.key, 'dia', v)}
        />
      ) : (
        <Text style={{ paddingLeft: 4 }}>
          Dia {String(dia).padStart(2, '0')}
        </Text>
      ),
    },
    // ── Fretes ──────────────────────────────────────────────────────────────────
    {
      title: 'Meta Frete 1',
      dataIndex: 'meta_frete_1',
      width: 135,
      render: (v: number | null, row) => (
        <InputNumber
          size="small"
          value={v ?? undefined}
          prefix="R$"
          min={0}
          precision={2}
          decimalSeparator=","
          style={{ width: 120 }}
          onChange={val => updateField(row.key, 'meta_frete_1', val ?? null)}
        />
      ),
    },
    {
      title: 'Meta Frete 2',
      dataIndex: 'meta_frete_2',
      width: 135,
      render: (v: number | null, row) => (
        <InputNumber
          size="small"
          value={v ?? undefined}
          prefix="R$"
          min={0}
          precision={2}
          decimalSeparator=","
          style={{ width: 120 }}
          placeholder="—"
          onChange={val => updateField(row.key, 'meta_frete_2', val ?? null)}
        />
      ),
    },
    {
      title: 'Meta Frete 3',
      dataIndex: 'meta_frete_3',
      width: 135,
      render: (v: number | null, row) => (
        <InputNumber
          size="small"
          value={v ?? undefined}
          prefix="R$"
          min={0}
          precision={2}
          decimalSeparator=","
          style={{ width: 120 }}
          placeholder="—"
          onChange={val => updateField(row.key, 'meta_frete_3', val ?? null)}
        />
      ),
    },
    // ── Margens ─────────────────────────────────────────────────────────────────
    {
      title: 'Margem Parbo',
      dataIndex: 'margem_parbo',
      width: 135,
      render: (v: number | null, row) => (
        <InputNumber
          size="small"
          value={v != null ? +(v * 100).toFixed(4) : undefined}
          suffix="%"
          min={0}
          max={100}
          precision={2}
          decimalSeparator=","
          style={{ width: 120 }}
          onChange={val => updateField(row.key, 'margem_parbo', val != null ? val / 100 : null)}
        />
      ),
    },
    {
      title: 'Margem Branco',
      dataIndex: 'margem_branco',
      width: 135,
      render: (v: number | null, row) => (
        <InputNumber
          size="small"
          value={v != null ? +(v * 100).toFixed(4) : undefined}
          suffix="%"
          min={0}
          max={100}
          precision={2}
          decimalSeparator=","
          style={{ width: 120 }}
          onChange={val => updateField(row.key, 'margem_branco', val != null ? val / 100 : null)}
        />
      ),
    },
    {
      title: 'Margem Integral',
      dataIndex: 'margem_integral',
      width: 145,
      render: (v: number | null, row) => (
        <InputNumber
          size="small"
          value={v != null ? +(v * 100).toFixed(4) : undefined}
          suffix="%"
          min={0}
          max={100}
          precision={2}
          decimalSeparator=","
          style={{ width: 130 }}
          onChange={val => updateField(row.key, 'margem_integral', val != null ? val / 100 : null)}
        />
      ),
    },
    {
      title: '',
      width: 90,
      align: 'center',
      render: (_: unknown, row) => (
        <Space size={4}>
          <Tooltip title="Replicar para dias seguintes">
            <Button
              size="small"
              icon={<CopyOutlined />}
              type="text"
              onClick={() => replicarParaDiasSeguintes(row)}
            />
          </Tooltip>
          <Popconfirm
            title="Excluir esta vigência?"
            onConfirm={() => deleteVigencia(row)}
            okText="Sim"
            cancelText="Não"
          >
            <Button size="small" danger icon={<DeleteOutlined />} type="text" />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // ── Seletor de representante ──────────────────────────────────────────────────

  const repOptions = ativos.map(a => ({
    value: a.fantasia,
    label: a.codigo != null ? `${a.codigo} - ${a.fantasia}` : a.fantasia,
  }))

  const dirtyCount = vigencias.filter(v => v.isDirty).length

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      <Card
        style={{ ...cardStyle, marginBottom: 16 }}
        bodyStyle={{ padding: '16px 20px' }}
      >
        <Space wrap align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          {/* Filtros */}
          <Space wrap align="center">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginRight: 8 }}>
              <div style={{ width: 34, height: 34, background: 'rgba(29,78,137,0.08)', border: '1px solid rgba(29,78,137,0.18)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconUsers />
              </div>
              <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#0f1f3d', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                Parâmetros de Representantes
              </span>
            </div>
            <Divider type="vertical" />
            <Select
              value={mes}
              options={MESES.map((m, i) => ({ value: i + 1, label: m }))}
              style={{ width: 130 }}
              onChange={v => { setMes(v); setVigencias([]) }}
            />
            <Select
              value={ano}
              options={Array.from({ length: 6 }, (_, i) => {
                const y = now.getFullYear() - 2 + i
                return { value: y, label: String(y) }
              })}
              style={{ width: 90 }}
              onChange={v => { setAno(v); setVigencias([]) }}
            />
            <Select
              showSearch
              placeholder="Selecione o representante"
              value={selectedRep}
              options={repOptions}
              style={{ width: 280 }}
              onChange={setSelectedRep}
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              allowClear
            />
            {dirtyCount > 0 && (
              <Tag color="orange">{dirtyCount} alteração(ões) pendente(s)</Tag>
            )}
          </Space>

          {/* Ações */}
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={fetchParams}
              loading={loading}
              disabled={!selectedRep}
            >
              Recarregar
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
              disabled={dirtyCount === 0}
            >
              Salvar {dirtyCount > 0 ? `(${dirtyCount})` : ''}
            </Button>
          </Space>
        </Space>
      </Card>

      {/* Parquet fallback info */}
      {selectedRep && fallback && vigencias.length === 0 && !loading && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            <span>
              Valores do parquet para {selectedRep} em {MESES[mes - 1]}/{ano}:&nbsp;
              <strong>Meta Frete R$ {fallback.meta_frete?.toFixed(2) ?? '—'}</strong>
              {' | '}Margem Parbo {fmtPct(fallback.margem_parbo ?? null)}
              {' | '}Margem Branco {fmtPct(fallback.margem_branco ?? null)}
              {' | '}Margem Integral {fmtPct(fallback.margem_integral ?? null)}
            </span>
          }
          description="Clique em '+ Adicionar vigência' para criar o primeiro registro manual para este mês."
        />
      )}

      {error && (
        <Alert
          message="Erro ao carregar parâmetros"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          action={<Button size="small" onClick={fetchParams}>Tentar novamente</Button>}
        />
      )}

      {!selectedRep && (
        <Alert
          type="info"
          showIcon
          message="Selecione um representante para visualizar e editar seus parâmetros."
          style={{ marginBottom: 12 }}
        />
      )}

      <Spin spinning={loading}>
        {selectedRep && (
          <Card
            style={cardStyle}
            title={
              <Space style={{ padding: '4px 0' }}>
                <Text strong style={{ color: '#1d4e89', fontSize: 16, fontFamily: 'Outfit, sans-serif' }}>
                  {repOptions.find(o => o.value === selectedRep)?.label ?? selectedRep}
                </Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  — {MESES[mes - 1]} / {ano}
                </Text>
              </Space>
            }
            extra={
              <Button
                icon={<PlusOutlined />}
                onClick={addVigencia}
                size="small"
              >
                Adicionar vigência
              </Button>
            }
          >
            <Table
              columns={cols}
              dataSource={vigencias}
              rowKey="key"
              size="small"
              pagination={false}
              bordered
              scroll={{ x: 'max-content' }}
              locale={{
                emptyText: loading
                  ? 'Carregando...'
                  : 'Nenhuma vigência cadastrada para este mês. Clique em "Adicionar vigência".',
              }}
            />
          </Card>
        )}
      </Spin>
    </div>
  )
}
