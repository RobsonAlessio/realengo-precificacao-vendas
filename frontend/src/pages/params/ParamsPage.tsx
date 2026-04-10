import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Select, Space, Typography, Spin, Tag, Alert,
  InputNumber, Popconfirm, message, Card, Tooltip, Tabs,
} from 'antd'
import {
  SaveOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '../../api/client'
import { useAuthStore } from '../../store/authStore'

const { Text } = Typography

// ── Tipos comuns ──────────────────────────────────────────────────────────────

interface RepAtivo {
  codigo: number | null
  fantasia: string
}

// ── Tipos — Parâmetros de Representantes ──────────────────────────────────────

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

// ── Tipos — Parâmetros Gerais ─────────────────────────────────────────────────

interface VigenciaGeralRow {
  key: string
  db_id: number | null
  dia: number
  mp_parbo_saco: number | null
  mp_branco_saco: number | null
  embalagem_parbo: number | null
  embalagem_branco: number | null
  energia_parbo: number | null
  energia_branco: number | null
  renda_parbo: number | null
  renda_branco: number | null
  isNew: boolean
  isDirty: boolean
}

interface ApiVigenciaGeral {
  id: number
  data_vigencia: string
  mp_parbo_saco: number | null
  mp_branco_saco: number | null
  embalagem_parbo: number | null
  embalagem_branco: number | null
  energia_parbo: number | null
  energia_branco: number | null
  renda_parbo: number | null
  renda_branco: number | null
}

interface ApiGeraisResponse {
  mes: string
  vigencias: ApiVigenciaGeral[]
}

// ── Ícones ────────────────────────────────────────────────────────────────────

function IconUsers() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4e89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4e89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
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

function buildKey(prefix: string, dia: number, suffix: string): string {
  return `${prefix}__${dia}__${suffix}`
}

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
  overflow: 'hidden'
}

// ── Aba 1: Parâmetros de Representantes ───────────────────────────────────────

function RepresentantesParamsTab() {
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

  const role = useAuthStore(s => s.user?.role)

  const todayYear = now.getFullYear()
  const todayMonth = now.getMonth() + 1
  const todayDay = now.getDate()

  const isViewingPastPeriod = ano < todayYear || (ano === todayYear && mes < todayMonth)
  const isViewingCurrentPeriod = ano === todayYear && mes === todayMonth

  function isRowEditable(row: VigenciaRow): boolean {
    if (role === 'admin') return true
    if (role === 'editor') {
      if (isViewingPastPeriod) return false
      if (isViewingCurrentPeriod) return row.dia >= todayDay || row.isNew
      return true
    }
    return false
  }

  const fetchAtivos = useCallback(async () => {
    try {
      const { data } = await api.get<RepAtivo[]>('/representantes/ativos')
      setAtivos(data)
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => { fetchAtivos() }, [fetchAtivos])

  const fetchParams = useCallback(async () => {
    if (!selectedRep) { setVigencias([]); setFallback(null); return }
    setLoading(true); setError(null)
    try {
      const { data } = await api.get<ApiResponse>('/representantes/parametros', { params: { ano, mes } })
      const found = data.representantes.find(r => r.representante === selectedRep)
      if (!found) { setVigencias([]); setFallback(null); return }
      setFallback(found.fallback_parquet)
      setVigencias(found.parametros.map(p => {
        const dia = parseInt(p.data_vigencia.split('-')[2], 10)
        return {
          key: buildKey(p.representante, dia, String(p.id)),
          db_id: p.id, representante: p.representante, dia,
          meta_frete_1: p.meta_frete_1, meta_frete_2: p.meta_frete_2, meta_frete_3: p.meta_frete_3,
          margem_parbo: p.margem_parbo, margem_branco: p.margem_branco, margem_integral: p.margem_integral,
          isNew: false, isDirty: false,
        }
      }))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Erro ao carregar parâmetros')
    } finally { setLoading(false) }
  }, [selectedRep, ano, mes])

  useEffect(() => { fetchParams() }, [fetchParams])

  function updateField(rowKey: string, field: keyof VigenciaRow, value: unknown) {
    setVigencias(prev => prev.map(v => v.key === rowKey ? { ...v, [field]: value, isDirty: true } : v))
  }

  function addVigencia() {
    if (!selectedRep) return
    const totalDias = diasDoMes(ano, mes)
    const newDia = isViewingCurrentPeriod ? Math.min(todayDay, totalDias) : 1
    const newKey = buildKey(selectedRep, newDia, `new_${Date.now()}`)
    setVigencias(prev => [...prev, {
      key: newKey, db_id: null, representante: selectedRep, dia: newDia,
      meta_frete_1: fallback?.meta_frete ?? null, meta_frete_2: null, meta_frete_3: null,
      margem_parbo: fallback?.margem_parbo ?? null, margem_branco: fallback?.margem_branco ?? null,
      margem_integral: fallback?.margem_integral ?? null,
      isNew: true, isDirty: true,
    }])
  }

  function replicarParaDiasSeguintes(row: VigenciaRow) {
    const totalDias = diasDoMes(ano, mes)
    const diasSeguintes = Array.from({ length: totalDias - row.dia }, (_, i) => row.dia + i + 1)
    if (diasSeguintes.length === 0) { message.info('Não há dias seguintes neste mês.'); return }
    setVigencias(prev => {
      const existingDias = new Set(prev.map(v => v.dia))
      const novas: VigenciaRow[] = diasSeguintes.filter(d => !existingDias.has(d)).map(d => ({
        key: buildKey(selectedRep!, d, `new_${Date.now()}_${d}`),
        db_id: null, representante: selectedRep!, dia: d,
        meta_frete_1: row.meta_frete_1, meta_frete_2: row.meta_frete_2, meta_frete_3: row.meta_frete_3,
        margem_parbo: row.margem_parbo, margem_branco: row.margem_branco, margem_integral: row.margem_integral,
        isNew: true, isDirty: true,
      }))
      const updated = prev.map(v => diasSeguintes.includes(v.dia)
        ? { ...v, meta_frete_1: row.meta_frete_1, meta_frete_2: row.meta_frete_2, meta_frete_3: row.meta_frete_3,
            margem_parbo: row.margem_parbo, margem_branco: row.margem_branco, margem_integral: row.margem_integral, isDirty: true }
        : v)
      return [...updated, ...novas].sort((a, b) => a.dia - b.dia)
    })
    message.success(`Valores replicados para ${diasSeguintes.length} dia(s) seguinte(s).`)
  }

  async function deleteVigencia(row: VigenciaRow) {
    if (row.db_id) {
      try { await api.delete(`/representantes/parametros/${row.db_id}`); message.success('Vigência excluída') }
      catch { message.error('Erro ao excluir vigência'); return }
    }
    setVigencias(prev => prev.filter(v => v.key !== row.key))
  }

  async function handleSave() {
    const dirty = vigencias.filter(v => v.isDirty)
    if (dirty.length === 0) { message.info('Nenhuma alteração pendente.'); return }
    setSaving(true)
    try {
      const payload = dirty.map(v => ({
        representante: v.representante,
        data_vigencia: `${ano}-${String(mes).padStart(2, '0')}-${String(v.dia).padStart(2, '0')}`,
        meta_frete_1: v.meta_frete_1, meta_frete_2: v.meta_frete_2, meta_frete_3: v.meta_frete_3,
        margem_parbo: v.margem_parbo, margem_branco: v.margem_branco, margem_integral: v.margem_integral,
      }))
      const { data } = await api.put('/representantes/parametros', payload)
      message.success(`${data.salvos} registro(s) salvo(s)!`)
      fetchParams()
    } catch { message.error('Erro ao salvar parâmetros') }
    finally { setSaving(false) }
  }

  const totalDias = diasDoMes(ano, mes)
  const diasOptions = Array.from({ length: totalDias }, (_, i) => {
    const d = i + 1
    const disabled = role === 'editor' && isViewingCurrentPeriod && d < todayDay
    return { value: d, label: `Dia ${String(d).padStart(2, '0')}`, disabled }
  })

  const cols: ColumnsType<VigenciaRow> = [
    {
      title: 'Vigência', dataIndex: 'dia', width: 100, fixed: 'left',
      render: (dia: number, row) => row.isNew ? (
        <Select size="small" value={dia} options={diasOptions} style={{ width: 90 }}
          onChange={v => updateField(row.key, 'dia', v)} disabled={!isRowEditable(row)} />
      ) : <Text style={{ paddingLeft: 4, fontSize: 12 }}>Dia {String(dia).padStart(2, '0')}</Text>,
    },
    { title: 'Frete 1', dataIndex: 'meta_frete_1', width: 115,
      render: (v: number | null, row) => <InputNumber size="small" value={v ?? undefined} prefix="R$" min={0} precision={2} decimalSeparator="," style={{ width: 100 }} disabled={!isRowEditable(row)} onChange={val => updateField(row.key, 'meta_frete_1', val ?? null)} /> },
    { title: 'Frete 2', dataIndex: 'meta_frete_2', width: 115,
      render: (v: number | null, row) => <InputNumber size="small" value={v ?? undefined} prefix="R$" min={0} precision={2} decimalSeparator="," style={{ width: 100 }} placeholder="—" disabled={!isRowEditable(row)} onChange={val => updateField(row.key, 'meta_frete_2', val ?? null)} /> },
    { title: 'Frete 3', dataIndex: 'meta_frete_3', width: 115,
      render: (v: number | null, row) => <InputNumber size="small" value={v ?? undefined} prefix="R$" min={0} precision={2} decimalSeparator="," style={{ width: 100 }} placeholder="—" disabled={!isRowEditable(row)} onChange={val => updateField(row.key, 'meta_frete_3', val ?? null)} /> },
    { title: 'Marg P/I', dataIndex: 'margem_parbo', width: 110,
      render: (v: number | null, row) => <InputNumber size="small" value={v != null ? +(v * 100).toFixed(4) : undefined} suffix="%" min={0} max={100} precision={2} decimalSeparator="," style={{ width: 95 }} disabled={!isRowEditable(row)} onChange={val => updateField(row.key, 'margem_parbo', val != null ? val / 100 : null)} /> },
    { title: 'Marg Br', dataIndex: 'margem_branco', width: 105,
      render: (v: number | null, row) => <InputNumber size="small" value={v != null ? +(v * 100).toFixed(4) : undefined} suffix="%" min={0} max={100} precision={2} decimalSeparator="," style={{ width: 90 }} disabled={!isRowEditable(row)} onChange={val => updateField(row.key, 'margem_branco', val != null ? val / 100 : null)} /> },
    { title: 'Marg Int', dataIndex: 'margem_integral', width: 105,
      render: (v: number | null, row) => <InputNumber size="small" value={v != null ? +(v * 100).toFixed(4) : undefined} suffix="%" min={0} max={100} precision={2} decimalSeparator="," style={{ width: 90 }} disabled={!isRowEditable(row)} onChange={val => updateField(row.key, 'margem_integral', val != null ? val / 100 : null)} /> },
    {
      title: '', width: 80, align: 'center',
      render: (_: unknown, row) => {
        const canEdit = isRowEditable(row)
        const canDelete = role === 'admin' || (role === 'editor' && canEdit)
        if (!canEdit && !canDelete) return null
        return (
          <Space size={2}>
            {canEdit && <Tooltip title="Replicar"><Button size="small" icon={<CopyOutlined />} type="text" onClick={() => replicarParaDiasSeguintes(row)} /></Tooltip>}
            {canDelete && <Popconfirm title="Excluir?" onConfirm={() => deleteVigencia(row)} okText="Sim" cancelText="Não"><Button size="small" danger icon={<DeleteOutlined />} type="text" /></Popconfirm>}
          </Space>
        )
      },
    },
  ]

  const repOptions = ativos.map(a => ({ value: a.fantasia, label: a.codigo != null ? `${a.codigo} - ${a.fantasia}` : a.fantasia }))
  const dirtyCount = vigencias.filter(v => v.isDirty).length
  const canAddVigencia = role === 'admin' || (role === 'editor' && !isViewingPastPeriod)
  const canSave = role !== 'viewer'

  return (
    <div style={{ height: 'calc(100vh - 140px)', overflow: 'hidden' }}>
      <Card style={{ ...cardStyle, marginBottom: 16 }} bodyStyle={{ padding: '16px 20px' }}>
        <Space wrap align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap align="center">
            <Select value={mes} options={MESES.map((m, i) => ({ value: i + 1, label: m }))} style={{ width: 130 }} onChange={v => { setMes(v); setVigencias([]) }} />
            <Select value={ano} options={Array.from({ length: 6 }, (_, i) => { const y = now.getFullYear() - 2 + i; return { value: y, label: String(y) } })} style={{ width: 90 }} onChange={v => { setAno(v); setVigencias([]) }} />
            <Select showSearch placeholder="Selecione o representante" value={selectedRep} options={repOptions} style={{ width: 280 }}
              onChange={setSelectedRep} filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())} allowClear />
            {dirtyCount > 0 && <Tag color="orange">{dirtyCount} alteração(ões) pendente(s)</Tag>}
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchParams} loading={loading} disabled={!selectedRep}>Recarregar</Button>
            {canSave && <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} disabled={dirtyCount === 0}>Salvar {dirtyCount > 0 ? `(${dirtyCount})` : ''}</Button>}
          </Space>
        </Space>
      </Card>

      {selectedRep && fallback && vigencias.length === 0 && !loading && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={<span>Valores do parquet para {selectedRep} em {MESES[mes - 1]}/{ano}:&nbsp;<strong>Meta Frete R$ {fallback.meta_frete?.toFixed(2) ?? '—'}</strong>{' | '}Margem Parbo {fmtPct(fallback.margem_parbo ?? null)}{' | '}Margem Branco {fmtPct(fallback.margem_branco ?? null)}{' | '}Margem Integral {fmtPct(fallback.margem_integral ?? null)}</span>}
          description={canAddVigencia ? "Clique em '+ Adicionar vigência' para criar o primeiro registro manual para este mês." : undefined} />
      )}
      {error && <Alert message="Erro ao carregar parâmetros" description={error} type="error" showIcon style={{ marginBottom: 12 }} action={<Button size="small" onClick={fetchParams}>Tentar novamente</Button>} />}
      {!selectedRep && <Alert type="info" showIcon message="Selecione um representante para visualizar e editar seus parâmetros." style={{ marginBottom: 12 }} />}

      <Spin spinning={loading}>
        {selectedRep && (
          <Card style={cardStyle}
            title={<Space style={{ padding: '4px 0' }}>
              <Text strong style={{ color: '#1d4e89', fontSize: 16, fontFamily: 'Outfit, sans-serif' }}>{repOptions.find(o => o.value === selectedRep)?.label ?? selectedRep}</Text>
              <Text type="secondary" style={{ fontSize: 13 }}>— {MESES[mes - 1]} / {ano}</Text>
            </Space>}
            extra={canAddVigencia ? <Button icon={<PlusOutlined />} onClick={addVigencia} size="small">Adicionar vigência</Button> : null}
          >
            <Table columns={cols} dataSource={vigencias} rowKey="key" size="small" pagination={false} bordered
              scroll={{ x: 'max-content', y: 'calc(100vh - 380px)' }}
              locale={{ emptyText: loading ? 'Carregando...' : canAddVigencia ? 'Nenhuma vigência cadastrada para este mês. Clique em "Adicionar vigência".' : 'Nenhuma vigência cadastrada para este mês.' }} />
          </Card>
        )}
      </Spin>
    </div>
  )
}

// ── Aba 2: Parâmetros Gerais (Insumos) ────────────────────────────────────────

function ParametrosGeraisTab() {
  const now = new Date()
  const [ano, setAno] = useState(now.getFullYear())
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [vigencias, setVigencias] = useState<VigenciaGeralRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const role = useAuthStore(s => s.user?.role)
  const todayYear = now.getFullYear()
  const todayMonth = now.getMonth() + 1
  const todayDay = now.getDate()

  const isViewingPastPeriod = ano < todayYear || (ano === todayYear && mes < todayMonth)
  const isViewingCurrentPeriod = ano === todayYear && mes === todayMonth

  function isRowEditable(row: VigenciaGeralRow): boolean {
    if (role === 'admin') return true
    if (role === 'editor') {
      if (isViewingPastPeriod) return false
      if (isViewingCurrentPeriod) return row.dia >= todayDay || row.isNew
      return true
    }
    return false
  }

  const fetchVigencias = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data } = await api.get<ApiGeraisResponse>('/parametros-gerais', { params: { ano, mes } })
      setVigencias(data.vigencias.map(v => {
        const dia = parseInt(v.data_vigencia.split('-')[2], 10)
        return {
          key: buildKey('geral', dia, String(v.id)),
          db_id: v.id, dia,
          mp_parbo_saco: v.mp_parbo_saco, mp_branco_saco: v.mp_branco_saco,
          embalagem_parbo: v.embalagem_parbo, embalagem_branco: v.embalagem_branco,
          energia_parbo: v.energia_parbo, energia_branco: v.energia_branco,
          renda_parbo: v.renda_parbo, renda_branco: v.renda_branco,
          isNew: false, isDirty: false,
        }
      }))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Erro ao carregar parâmetros gerais')
    } finally { setLoading(false) }
  }, [ano, mes])

  useEffect(() => { fetchVigencias() }, [fetchVigencias])

  function updateGeral(rowKey: string, field: keyof VigenciaGeralRow, value: unknown) {
    setVigencias(prev => prev.map(v => v.key === rowKey ? { ...v, [field]: value, isDirty: true } : v))
  }

  function addVigencia() {
    const totalDias = diasDoMes(ano, mes)
    const newDia = isViewingCurrentPeriod ? Math.min(todayDay, totalDias) : 1
    setVigencias(prev => [...prev, {
      key: buildKey('geral', newDia, `new_${Date.now()}`),
      db_id: null, dia: newDia,
      mp_parbo_saco: null, mp_branco_saco: null,
      embalagem_parbo: null, embalagem_branco: null,
      energia_parbo: null, energia_branco: null,
      renda_parbo: null, renda_branco: null,
      isNew: true, isDirty: true,
    }])
  }

  async function deleteVigencia(row: VigenciaGeralRow) {
    if (row.db_id) {
      try { await api.delete(`/parametros-gerais/${row.db_id}`); message.success('Vigência excluída') }
      catch { message.error('Erro ao excluir vigência'); return }
    }
    setVigencias(prev => prev.filter(v => v.key !== row.key))
  }

  async function handleSave() {
    const dirty = vigencias.filter(v => v.isDirty)
    if (dirty.length === 0) { message.info('Nenhuma alteração pendente.'); return }
    setSaving(true)
    try {
      const payload = dirty.map(v => ({
        data_vigencia: `${ano}-${String(mes).padStart(2, '0')}-${String(v.dia).padStart(2, '0')}`,
        mp_parbo_saco: v.mp_parbo_saco, mp_branco_saco: v.mp_branco_saco,
        embalagem_parbo: v.embalagem_parbo, embalagem_branco: v.embalagem_branco,
        energia_parbo: v.energia_parbo, energia_branco: v.energia_branco,
        renda_parbo: v.renda_parbo, renda_branco: v.renda_branco,
      }))
      const { data } = await api.put('/parametros-gerais', payload)
      message.success(`${data.salvos} registro(s) salvo(s)!`)
      fetchVigencias()
    } catch { message.error('Erro ao salvar parâmetros gerais') }
    finally { setSaving(false) }
  }

  const totalDias = diasDoMes(ano, mes)
  const diasOptions = Array.from({ length: totalDias }, (_, i) => {
    const d = i + 1
    const disabled = role === 'editor' && isViewingCurrentPeriod && d < todayDay
    return { value: d, label: `Dia ${String(d).padStart(2, '0')}`, disabled }
  })

  const dirtyCount = vigencias.filter(v => v.isDirty).length
  const canAdd = role === 'admin' || (role === 'editor' && !isViewingPastPeriod)
  const canSave = role !== 'viewer'

  const numInput = (val: number | null, row: VigenciaGeralRow, field: keyof VigenciaGeralRow, prefix = 'R$', precision = 2) => (
    <InputNumber size="small" value={val ?? undefined} prefix={prefix} min={0} precision={precision}
      decimalSeparator="," style={{ width: 95 }} disabled={!isRowEditable(row)}
      onChange={v => updateGeral(row.key, field, v ?? null)} />
  )

  const pctInput = (val: number | null, row: VigenciaGeralRow, field: keyof VigenciaGeralRow) => (
    <InputNumber size="small"
      value={val != null ? +(val * 100).toFixed(4) : undefined}
      suffix="%" min={0} max={100} precision={2} decimalSeparator=","
      style={{ width: 85 }} disabled={!isRowEditable(row)}
      onChange={v => updateGeral(row.key, field, v != null ? v / 100 : null)} />
  )

  const cols: ColumnsType<VigenciaGeralRow> = [
    {
      title: 'Vigência', dataIndex: 'dia', width: 100, fixed: 'left',
      render: (dia: number, row) => row.isNew
        ? <Select size="small" value={dia} options={diasOptions} style={{ width: 90 }} onChange={v => updateGeral(row.key, 'dia', v)} disabled={!isRowEditable(row)} />
        : <Text style={{ paddingLeft: 4, fontSize: 12 }}>Dia {String(dia).padStart(2, '0')}</Text>,
    },
    { title: 'MP P/I', dataIndex: 'mp_parbo_saco', width: 120,
      render: (v, row) => numInput(v, row, 'mp_parbo_saco') },
    { title: 'MP Branco', dataIndex: 'mp_branco_saco', width: 125,
      render: (v, row) => numInput(v, row, 'mp_branco_saco') },
    { title: 'Emb P/I', dataIndex: 'embalagem_parbo', width: 110,
      render: (v, row) => numInput(v, row, 'embalagem_parbo') },
    { title: 'Emb Branco', dataIndex: 'embalagem_branco', width: 120,
      render: (v, row) => numInput(v, row, 'embalagem_branco') },
    { title: 'Ene P/I', dataIndex: 'energia_parbo', width: 110,
      render: (v, row) => numInput(v, row, 'energia_parbo') },
    { title: 'Ene Branco', dataIndex: 'energia_branco', width: 115,
      render: (v, row) => numInput(v, row, 'energia_branco') },
    { title: 'Renda P/I', dataIndex: 'renda_parbo', width: 110,
      render: (v, row) => pctInput(v, row, 'renda_parbo') },
    { title: 'Renda Br', dataIndex: 'renda_branco', width: 105,
      render: (v, row) => pctInput(v, row, 'renda_branco') },
    {
      title: '', width: 50, align: 'center',
      render: (_: unknown, row) => {
        const canEdit = isRowEditable(row)
        const canDelete = role === 'admin' || (role === 'editor' && canEdit)
        if (!canEdit && !canDelete) return null
        return (
          <Popconfirm title="Excluir?" onConfirm={() => deleteVigencia(row)} okText="Sim" cancelText="Não">
            <Button size="small" danger icon={<DeleteOutlined />} type="text" />
          </Popconfirm>
        )
      },
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 140px)', overflow: 'hidden' }}>
      <Card style={{ ...cardStyle, marginBottom: 16 }} bodyStyle={{ padding: '16px 20px' }}>
        <Space wrap align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap align="center">
            <Select value={mes} options={MESES.map((m, i) => ({ value: i + 1, label: m }))} style={{ width: 130 }} onChange={v => { setMes(v); setVigencias([]) }} />
            <Select value={ano} options={Array.from({ length: 6 }, (_, i) => { const y = now.getFullYear() - 2 + i; return { value: y, label: String(y) } })} style={{ width: 90 }} onChange={v => { setAno(v); setVigencias([]) }} />
            {dirtyCount > 0 && <Tag color="orange">{dirtyCount} alteração(ões) pendente(s)</Tag>}
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchVigencias} loading={loading}>Recarregar</Button>
            {canSave && <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} disabled={dirtyCount === 0}>Salvar {dirtyCount > 0 ? `(${dirtyCount})` : ''}</Button>}
          </Space>
        </Space>
      </Card>

      {error && <Alert message="Erro ao carregar parâmetros gerais" description={error} type="error" showIcon style={{ marginBottom: 12 }} action={<Button size="small" onClick={fetchVigencias}>Tentar novamente</Button>} />}

      <Spin spinning={loading}>
        <Card style={cardStyle}
          title={<Space style={{ padding: '4px 0' }}>
            <Text strong style={{ color: '#1d4e89', fontSize: 16, fontFamily: 'Outfit, sans-serif' }}>Insumos</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>— {MESES[mes - 1]} / {ano}</Text>
          </Space>}
          extra={canAdd ? <Button icon={<PlusOutlined />} onClick={addVigencia} size="small">Adicionar vigência</Button> : null}
        >
          <Table columns={cols} dataSource={vigencias} rowKey="key" size="small" pagination={false} bordered
            scroll={{ x: 'max-content', y: 'calc(100vh - 320px)' }}
            locale={{ emptyText: loading ? 'Carregando...' : canAdd ? 'Nenhuma vigência cadastrada. Clique em "Adicionar vigência".' : 'Nenhuma vigência cadastrada para este mês.' }} />
        </Card>
      </Spin>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function RepresentantesParams() {
  const [activeTab, setActiveTab] = useState('representantes')

  const tabItems = [
    {
      key: 'representantes',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
          <IconUsers />
          Parâmetros de Representantes
        </span>
      ),
      children: <RepresentantesParamsTab />,
    },
    {
      key: 'gerais',
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
          <IconSettings />
          Parâmetros de Insumos
        </span>
      ),
      children: <ParametrosGeraisTab />,
    },
  ]

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 16,
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
      padding: '16px 24px 24px',
      height: 'calc(100vh - 32px)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 30, height: 30, background: 'rgba(29,78,137,0.08)', border: '1px solid rgba(29,78,137,0.18)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <IconUsers />
        </div>
        <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 17, color: '#0f1f3d', letterSpacing: '-0.01em' }}>
          Parâmetros
        </span>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="small" style={{ fontFamily: 'Inter, sans-serif' }} />
    </div>
  )
}
