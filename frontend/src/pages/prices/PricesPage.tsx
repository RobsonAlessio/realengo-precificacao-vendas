import { useEffect, useState, useCallback, CSSProperties } from 'react'
import {
  Table, Spin, Tooltip, Popover, Divider,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Typography } from 'antd'
import api from '../../api/client'

const { Text } = Typography

// ── tipos ────────────────────────────────────────────────────────────────────

interface ColDef {
  campo: string
  label: string
  visivel: boolean
  formato: 'texto' | 'numero' | 'percentual' | 'moeda'
  grupo: string | null
}

interface VarDef {
  campo: string
  label: string
  formato: 'numero' | 'percentual' | 'moeda'
  campo_sc?: string
}

interface CalcDef {
  id: string
  label: string
  formula: string
  formato: 'numero' | 'percentual' | 'moeda'
  grupo: string | null
  ativo: boolean
  variaveis?: VarDef[]
}

interface CustoProducaoTipo {
  embalagem_por_fardo: number
  energia_por_fardo: number
  periodo_referencia: string
  meses_usados: number
}

interface TabelaResponse {
  colunas: ColDef[]
  calculos_ativos: CalcDef[]
  dados: Record<string, unknown>[]
  custo_mp: { data: string; aviso: string | null; renda_processo?: { parbo: number; integral: number; branco: number; mes_referencia: string; aviso: string | null } }
  custo_producao: { parbo_integral: CustoProducaoTipo | null; branco: CustoProducaoTipo | null; aviso: string | null }
  mes: string | null
}

// ── formatação ───────────────────────────────────────────────────────────────

function fmt(val: unknown, formato: string): string {
  if (val == null) return '—'
  const n = Number(val)
  if (isNaN(n)) return String(val)
  switch (formato) {
    case 'percentual': return (n * 100).toFixed(2) + '%'
    case 'moeda':      return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case 'numero':     return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    default:           return String(val)
  }
}

// ── cores por grupo ───────────────────────────────────────────────────────────

const GROUP_STYLE: Record<string, { header: string; subheader: string; text: string; calcColor: string }> = {
  Parbo:    { header: '#1d4e89', subheader: '#dbeafe', text: '#1e3a5f', calcColor: '#1d6fa8' },
  Branco:   { header: '#92400e', subheader: '#fef9c3', text: '#78350f', calcColor: '#b45309' },
  Integral: { header: '#166534', subheader: '#dcfce7', text: '#14532d', calcColor: '#15803d' },
}

// ── badge helper ─────────────────────────────────────────────────────────────

function badge(variant: 'blue' | 'amber' | 'cyan' | 'slate'): CSSProperties {
  const map = {
    blue:  { background: 'rgba(59,130,246,0.08)',  border: '1px solid rgba(59,130,246,0.2)',  color: '#1d4e89' },
    amber: { background: 'rgba(245,158,11,0.08)',  border: '1px solid rgba(245,158,11,0.25)', color: '#92400e' },
    cyan:  { background: 'rgba(6,182,212,0.08)',   border: '1px solid rgba(6,182,212,0.22)',  color: '#0e7490' },
    slate: { background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)', color: '#475569' },
  }
  return {
    ...map[variant],
    borderRadius: 8,
    padding: '3px 10px',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'Inter, sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    lineHeight: '1.6',
    cursor: 'default',
  }
}

// ── ícone de grade (SVG inline) ───────────────────────────────────────────────

function IconGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4e89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
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

// ── geração de colunas ───────────────────────────────────────────────────────

function buildColumns(
  colDefs: ColDef[],
  calcAtivos: CalcDef[],
  dados: Record<string, unknown>[],
): ColumnsType<Record<string, unknown>> {
  const temF2 = dados?.some(r => r['meta_frete_2'] != null) ?? false
  const temF3 = dados?.some(r => r['meta_frete_3'] != null) ?? false

  const visiveis = colDefs.filter(c => c.visivel)

  const grupos: Record<string, ColDef[]> = {}
  const semGrupo: ColDef[] = []
  for (const col of visiveis) {
    if (!col.grupo) semGrupo.push(col)
    else { if (!grupos[col.grupo]) grupos[col.grupo] = []; grupos[col.grupo].push(col) }
  }

  const calcGrupos: Record<string, CalcDef[]> = {}
  for (const calc of calcAtivos) {
    const g = calc.grupo ?? '_calc'
    if (!calcGrupos[g]) calcGrupos[g] = []
    calcGrupos[g].push(calc)
  }

  let _colIdx = 0
  const toAntCol = (col: ColDef) => {
    const gs = col.grupo ? GROUP_STYLE[col.grupo] : null
    return {
      title: col.label,
      dataIndex: col.campo,
      key: `${col.campo}_${col.grupo ?? 'root'}_${_colIdx++}`,
      width: col.campo === 'representante' ? 180 : undefined,
      align: col.formato === 'texto' ? 'left' as const : 'right' as const,
      onHeaderCell: () => ({ style: gs ? { background: gs.subheader, color: gs.text, fontWeight: 600 } : {} }),
      sorter: col.formato === 'texto'
        ? (a: Record<string, unknown>, b: Record<string, unknown>) =>
            String(a[col.campo] ?? '').localeCompare(String(b[col.campo] ?? ''))
        : (a: Record<string, unknown>, b: Record<string, unknown>) =>
            (Number(a[col.campo] ?? 0)) - (Number(b[col.campo] ?? 0)),
      render: (val: unknown, record: Record<string, unknown>) => {
        if (col.campo === 'representante') {
          const codigo = record['codigo_representante']
          const label = codigo != null ? `${codigo} - ${String(val ?? '')}` : String(val ?? '')
          return <Text strong style={{ fontSize: 13, color: '#1e293b' }}>{label}</Text>
        }
        if (col.campo === 'meta_frete') {
          const parts = [val, record['meta_frete_2'], record['meta_frete_3']]
            .filter(v => v != null)
            .map(v => fmt(v, col.formato))
          return (
            <Text style={{ color: '#1d4e89', fontWeight: 600 }}>
              {parts.join(' | ')}
            </Text>
          )
        }
        return <Text>{fmt(val, col.formato)}</Text>
      },
    }
  }

  const toCalcCol = (calc: CalcDef, grupo?: string) => {
    const gs = grupo ? GROUP_STYLE[grupo] : null
    const color = gs?.calcColor ?? '#27ae60'

    const renderPopover = (rec: Record<string, unknown>, preco: unknown, title?: string) => {
      if (!calc.variaveis?.length) return null
      const fixos = calc.variaveis.filter(v => v.formato !== 'percentual')
      const pcts  = calc.variaveis.filter(v => v.formato === 'percentual')
      const somaFixos = fixos.reduce((acc, v) => acc + (Number(rec[v.campo] ?? 0)), 0)
      const somaPcts  = pcts.reduce((acc, v) => acc + (Number(rec[v.campo] ?? 0)), 0)
      const divisor   = 1 - somaPcts

      return (
        <div style={{ minWidth: 240, fontSize: 13 }}>
          {title && <div style={{ fontWeight: 600, color, marginBottom: 6 }}>{title}</div>}
          <Text strong style={{ color }}>Custos fixos (R$/fardo)</Text>
          <table style={{ width: '100%', marginTop: 4 }}>
            <tbody>
              {fixos.map(v => (
                <tr key={v.campo}>
                  <td style={{ paddingRight: 12, color: '#555' }}>{v.label}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(rec[v.campo], v.formato)}
                    {v.campo_sc && rec[v.campo_sc] != null && (
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                        ({fmt(rec[v.campo_sc], 'moeda')}/sc)
                      </Text>
                    )}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid #ddd' }}>
                <td style={{ paddingTop: 2 }}><Text strong>Subtotal</Text></td>
                <td style={{ textAlign: 'right', paddingTop: 2 }}>
                  <Text strong>{fmt(somaFixos, 'moeda')}</Text>
                </td>
              </tr>
            </tbody>
          </table>
          <Divider style={{ margin: '8px 0' }} />
          <Text strong style={{ color }}>Deduções do preço (%)</Text>
          <table style={{ width: '100%', marginTop: 4 }}>
            <tbody>
              {pcts.map(v => (
                <tr key={v.campo}>
                  <td style={{ paddingRight: 12, color: '#555' }}>{v.label}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(rec[v.campo], 'percentual')}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid #ddd' }}>
                <td style={{ paddingTop: 2 }}><Text strong>Divisor</Text></td>
                <td style={{ textAlign: 'right', paddingTop: 2 }}>
                  <Text strong>{divisor.toFixed(4)}</Text>
                </td>
              </tr>
            </tbody>
          </table>
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ textAlign: 'right' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {fmt(somaFixos, 'moeda')} ÷ {divisor.toFixed(4)} =&nbsp;
            </Text>
            <Text strong style={{ color, fontSize: 14 }}>{fmt(preco, 'moeda')}</Text>
          </div>
        </div>
      )
    }

    const makeSubCol = (freteLabel: string, dataIdx: string, metaFreteKey: string | null) => ({
      title: freteLabel,
      dataIndex: dataIdx,
      key: `${dataIdx}__${grupo ?? 'root'}`,
      align: 'right' as const,
      width: 110,
      onHeaderCell: () => ({ style: gs ? { background: gs.subheader, color, fontWeight: 600, fontSize: 12 } : {} }),
      sorter: (a: Record<string, unknown>, b: Record<string, unknown>) =>
        (Number(a[dataIdx] ?? 0)) - (Number(b[dataIdx] ?? 0)),
      render: (val: unknown, record: Record<string, unknown>) => {
        if (val == null) return null
        const rec = metaFreteKey != null
          ? { ...record, meta_frete: record[metaFreteKey] }
          : record
        const content = renderPopover(rec, val, freteLabel)
        return (
          <span style={{ whiteSpace: 'nowrap' }}>
            <Text style={{ color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(val, calc.formato)}</Text>
            {content && (
              <Popover content={content} title={`${grupo ?? calc.label} — ${freteLabel}`} trigger="click">
                <span style={{ color, cursor: 'pointer', fontSize: 11, opacity: 0.6, marginLeft: 3 }}>ⓘ</span>
              </Popover>
            )}
          </span>
        )
      },
    })

    const subCols = [makeSubCol('Frete 1', calc.id, null)]
    if (temF2) subCols.push(makeSubCol('Frete 2', calc.id + '_f2', 'meta_frete_2'))
    if (temF3) subCols.push(makeSubCol('Frete 3', calc.id + '_f3', 'meta_frete_3'))

    return subCols
  }

  const result: ColumnsType<Record<string, unknown>> = semGrupo.map(toAntCol)

  const allGroups = Array.from(new Set([
    ...Object.keys(grupos),
    ...Object.keys(calcGrupos),
  ]))

  for (const g of allGroups) {
    const gs = GROUP_STYLE[g]
    const children: ColumnsType<Record<string, unknown>> = [
      ...(grupos[g] ?? []).map(toAntCol),
      ...(calcGrupos[g] ?? []).flatMap(c => toCalcCol(c, g)),
    ]
    result.push({
      title: g,
      children,
      onHeaderCell: () => ({
        style: gs ? { background: gs.header, color: '#fff', fontWeight: 700, textAlign: 'center' as const, letterSpacing: '0.05em', fontSize: 12 } : {},
      }),
    })
  }

  const calcSemGrupo = calcGrupos['_calc'] ?? []
  result.push(...calcSemGrupo.flatMap(c => toCalcCol(c)))

  return result
}

// ── componente ───────────────────────────────────────────────────────────────

export default function PriceTable() {
  const [tabela, setTabela] = useState<TabelaResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<TabelaResponse>('/prices/tabela')
      setTabela(data)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Erro ao carregar dados'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const columns  = tabela ? buildColumns(tabela.colunas, tabela.calculos_ativos, tabela.dados) : []
  const avisoMp  = tabela?.custo_mp?.aviso ?? null
  const avisoProd = tabela?.custo_producao?.aviso ?? null
  const semDados = tabela !== null && tabela?.dados?.length === 0

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

      {/* ── Header modernizado ── */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>

        <div>
          {/* Título com ícone */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 30, height: 30,
              background: 'rgba(29,78,137,0.08)',
              border: '1px solid rgba(29,78,137,0.18)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <IconGrid />
            </div>
            <span style={{
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              fontSize: 17,
              color: '#0f1f3d',
              letterSpacing: '-0.01em',
            }}>
              Tabela de Preços por Representante
            </span>
          </div>

          {/* Badges de metadata */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: 40 }}>
            {tabela?.calculos_ativos.length ? (
              <span style={{ color: '#64748b', fontSize: 12, fontFamily: 'Inter, sans-serif', marginRight: 4 }}>
                {tabela.calculos_ativos.length} cálculo(s) ativo(s)
              </span>
            ) : null}

            {tabela?.mes && (
              <span style={badge('blue')}>{tabela.mes}</span>
            )}

            {tabela?.custo_mp?.data && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={badge(avisoMp ? 'amber' : 'slate')}>
                  MP ref.: {tabela.custo_mp.data}
                </span>
                {avisoMp && (
                  <Tooltip title={avisoMp}>
                    <span style={{ color: '#d97706', fontSize: 13, cursor: 'default', lineHeight: 1 }}>⚠</span>
                  </Tooltip>
                )}
              </span>
            )}

            {tabela?.custo_producao?.parbo_integral && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Tooltip title={`Parbo/Integral: emb R$${tabela.custo_producao.parbo_integral.embalagem_por_fardo.toFixed(4)}/fardo · ene R$${tabela.custo_producao.parbo_integral.energia_por_fardo.toFixed(4)}/fardo | Branco: emb R$${tabela.custo_producao.branco?.embalagem_por_fardo.toFixed(4)}/fardo · ene R$${tabela.custo_producao.branco?.energia_por_fardo.toFixed(4)}/fardo`}>
                  <span style={{ ...badge('cyan'), cursor: 'help' }}>
                    Custos prod.: {tabela.custo_producao.parbo_integral.periodo_referencia}
                  </span>
                </Tooltip>
                {avisoProd && (
                  <Tooltip title={avisoProd}>
                    <span style={{ color: '#d97706', fontSize: 13, cursor: 'default', lineHeight: 1 }}>⚠</span>
                  </Tooltip>
                )}
              </span>
            )}

            {tabela?.custo_mp?.renda_processo?.parbo != null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Tooltip title={`Parbo/Integral: ${(tabela.custo_mp.renda_processo.parbo * 100).toFixed(2)}% · Branco: ${(tabela.custo_mp.renda_processo.branco * 100).toFixed(2)}%`}>
                  <span style={{ ...badge('slate'), cursor: 'help' }}>
                    Renda: P/I {(tabela.custo_mp.renda_processo.parbo * 100).toFixed(1)}% · B {(tabela.custo_mp.renda_processo.branco * 100).toFixed(1)}% ({tabela.custo_mp.renda_processo.mes_referencia})
                  </span>
                </Tooltip>
              </span>
            )}
          </div>
        </div>

        {/* Botão Atualizar */}
        <button
          onClick={fetchData}
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
            alignSelf: 'flex-start',
          }}
          onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.color = '#1d4e89' } }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#475569' }}
        >
          <IconRefresh spinning={loading} />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {/* ── Alertas ── */}
      {semDados && !error && (
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
          <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 600, color: '#92400e', fontSize: 13, fontFamily: 'Inter, sans-serif', marginBottom: 2 }}>
              Nenhum parâmetro cadastrado para {tabela?.mes}.
            </div>
            <div style={{ color: '#b45309', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>
              Acesse a aba Parâmetros para importar ou cadastrar os representantes do mês atual.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>🚨</span>
            <div>
              <div style={{ fontWeight: 600, color: '#991b1b', fontSize: 13, fontFamily: 'Inter, sans-serif', marginBottom: 2 }}>
                Erro ao carregar dados
              </div>
              <div style={{ color: '#b91c1c', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>{error}</div>
            </div>
          </div>
          <button
            onClick={fetchData}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #fecaca',
              background: '#fff',
              color: '#991b1b',
              fontSize: 12,
              fontFamily: 'Inter, sans-serif',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Tabela ── */}
      <Spin spinning={loading}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .price-table .ant-table { border-radius: 10px; overflow: hidden; }
          .price-table .ant-table-container {
            border-start-start-radius: 10px;
            border-start-end-radius: 10px;
          }
          .price-table .ant-table-bordered > .ant-table-container {
            border-inline-start: none;
            border-top: none;
          }
          .price-table .ant-table-bordered .ant-table-cell { border-inline-end-color: #e8e8e8; }
          .price-table .ant-table-wrapper {
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          }
          .price-table .ant-table-thead > tr:first-child > th:first-child,
          .price-table .ant-table-thead > tr:first-child > td:first-child {
            border-start-start-radius: 10px !important;
          }
          .price-table .ant-table-thead > tr:first-child > th:last-child,
          .price-table .ant-table-thead > tr:first-child > td:last-child {
            border-start-end-radius: 10px !important;
          }
          .price-table .ant-table-tbody > tr:nth-child(even) > td { background: #f8fafc; }
          .price-table .ant-table-tbody > tr:hover > td { background: #eff6ff !important; }
        `}</style>
        <Table
          className="price-table"
          columns={columns}
          dataSource={tabela?.dados ?? []}
          rowKey="representante"
          size="middle"
          pagination={false}
          bordered
          scroll={{ x: 'max-content', y: 'calc(100vh - 240px)' }}
          locale={{ emptyText: loading ? 'Carregando...' : 'Nenhum dado encontrado' }}
        />
      </Spin>
    </div>
  )
}
