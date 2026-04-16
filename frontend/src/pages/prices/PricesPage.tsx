import { useEffect, useState, useCallback, useMemo, CSSProperties } from 'react'
import {
  Table, Spin, Tooltip, Popover, Divider, Select,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Typography } from 'antd'
import api from '../../api/client'
import { useIsMobile } from '../../hooks/useIsMobile'

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

interface ParametrosGerais {
  data_vigencia: string
  mp_parbo_saco: number | null
  mp_branco_saco: number | null
  mp_parbo_fardo: number | null
  mp_branco_fardo: number | null
  embalagem_parbo: number | null
  embalagem_branco: number | null
  energia_parbo: number | null
  energia_branco: number | null
  renda_parbo: number | null
  renda_branco: number | null
}

interface TabelaResponse {
  colunas: ColDef[]
  calculos_ativos: CalcDef[]
  dados: Record<string, unknown>[]
  custo_mp: {
    data: string
    aviso: string | null
    renda_processo?: { parbo: number; integral: number; branco: number; mes_referencia: string; aviso: string | null }
    empresa_08?: { parbo?: number; parbo_sc?: number; integral?: number; integral_sc?: number }
    empresa_58?: { branco?: number; branco_sc?: number }
  }
  custo_producao: { parbo_integral: CustoProducaoTipo | null; branco: CustoProducaoTipo | null; aviso: string | null }
  mes: string | null
  impostos?: { periodo: string }
  parametros_gerais: ParametrosGerais | null
  fonte_config: FonteConfig
}

type Fonte = 'realizado' | 'parametrizado'
interface FonteConfig { mp: Fonte; embalagem: Fonte; energia: Fonte; renda: Fonte }

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

// ── recálculo local com fonte parametrizada ───────────────────────────────────

function applyFonte(
  dados: Record<string, unknown>[],
  calcAtivos: CalcDef[],
  fonte: FonteConfig,
  pg: ParametrosGerais | null,
  rendaRealizado: { parbo: number; branco: number } | null,
  mpSc: { parbo: number | null; branco: number | null } | null,
): Record<string, unknown>[] {
  // Nenhuma fonte parametrizada ativa → retorna original
  const anyParam = Object.values(fonte).some(f => f === 'parametrizado')
  if (!anyParam) return dados

  return dados.map(row => {
    const r = { ...row }

    // Determina renda efetiva por grupo
    // Sem pg cadastrado + fonte parametrizada → null (força cadastro)
    const rendaParbo = fonte.renda === 'parametrizado'
      ? (pg?.renda_parbo ?? null)
      : (rendaRealizado?.parbo ?? 0.73)
    const rendaBranco = fonte.renda === 'parametrizado'
      ? (pg?.renda_branco ?? null)
      : (rendaRealizado?.branco ?? 0.73)

    // Determina MP efetiva por grupo (fardo)
    const calcMpFardo = (saco: number | null, renda: number | null) =>
      saco != null && renda != null ? saco * 30 / (renda * 50) : null

    if (fonte.mp === 'parametrizado') {
      const mpPSaco = pg?.mp_parbo_saco ?? null
      const mpBSaco = pg?.mp_branco_saco ?? null
      const effRendaP = rendaParbo ?? (rendaRealizado?.parbo ?? 0.73)
      const effRendaB = rendaBranco ?? (rendaRealizado?.branco ?? 0.73)
      const mpPFardo = calcMpFardo(mpPSaco, effRendaP)
      const mpBFardo = calcMpFardo(mpBSaco, effRendaB)
      // Sem parâmetro → zera (não usa realizado como fallback)
      r['mp_parbo'] = mpPFardo; r['mp_integral'] = mpPFardo
      r['mp_branco'] = mpBFardo
      r['mp_parbo_sc'] = mpPSaco; r['mp_integral_sc'] = mpPSaco
      r['mp_branco_sc'] = mpBSaco
    } else if (fonte.renda === 'parametrizado' && rendaParbo != null) {
      // MP realizado mas renda parametrizada → reconverte usando novo renda
      const mpPSc = mpSc?.parbo
      const mpBSc = mpSc?.branco
      if (mpPSc != null) { const v = calcMpFardo(mpPSc, rendaParbo); if (v != null) { r['mp_parbo'] = v; r['mp_integral'] = v } }
      if (mpBSc != null && rendaBranco != null) { const v = calcMpFardo(mpBSc, rendaBranco); if (v != null) r['mp_branco'] = v }
    }

    if (fonte.embalagem === 'parametrizado') {
      // Sem parâmetro → zera
      r['embalagem_parbo'] = pg?.embalagem_parbo ?? null; r['embalagem_integral'] = pg?.embalagem_parbo ?? null
      r['embalagem_branco'] = pg?.embalagem_branco ?? null
    }
    if (fonte.energia === 'parametrizado') {
      // Sem parâmetro → zera
      r['energia_parbo'] = pg?.energia_parbo ?? null; r['energia_integral'] = pg?.energia_parbo ?? null
      r['energia_branco'] = pg?.energia_branco ?? null
    }

    // Recalcula preços para cada calc ativo
    for (const calc of calcAtivos) {
      if (!calc.variaveis?.length) continue
      const fixos = calc.variaveis.filter(v => v.formato !== 'percentual')
      const pcts  = calc.variaveis.filter(v => v.formato === 'percentual')
      const somaFixos = fixos.reduce((acc, v) => acc + (Number(r[v.campo] ?? 0)), 0)
      const somaPcts  = pcts.reduce((acc, v)  => acc + (Number(r[v.campo] ?? 0)), 0)
      const divisor = 1 - somaPcts
      r[calc.id] = divisor > 0 ? somaFixos / divisor : 0
      // f2 / f3
      for (const suffix of ['_f2', '_f3']) {
        const freteKey = suffix === '_f2' ? 'meta_frete_2' : 'meta_frete_3'
        if (row[freteKey] != null) {
          const somaF = fixos.reduce((acc, v) => {
            const val = v.campo === 'meta_frete' ? Number(row[freteKey] ?? 0) : Number(r[v.campo] ?? 0)
            return acc + val
          }, 0)
          r[calc.id + suffix] = divisor > 0 ? somaF / divisor : 0
        }
      }
    }
    return r
  })
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
  return { ...map[variant], borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 500, fontFamily: 'Inter, sans-serif', display: 'inline-flex', alignItems: 'center', lineHeight: '1.6', cursor: 'default' }
}

function IconGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4e89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  )
}

// ── popover compartilhado (desktop + mobile) ───────────────────────────────

function renderPopoverContent(
  calc: CalcDef,
  rec: Record<string, unknown>,
  preco: unknown,
  title?: string,
) {
  if (!calc.variaveis?.length) return null
  const gs = calc.grupo ? GROUP_STYLE[calc.grupo] : null
  const color = gs?.calcColor ?? '#27ae60'
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
          {fixos.map(v => {
            const fardo = Number(rec[v.campo] ?? 0)
            const saco  = v.campo_sc ? Number(rec[v.campo_sc] ?? 0) : 0
            const renda = fardo > 0 && saco > 0 ? (saco * 30) / (fardo * 50) : null
            return (
              <tr key={v.campo}>
                <td style={{ paddingRight: 12, color: '#555' }}>{v.label}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(rec[v.campo], v.formato)}
                  {v.campo_sc && rec[v.campo_sc] != null && (
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                      ({fmt(rec[v.campo_sc], 'moeda')}/sc{renda != null ? ` · renda: ${(renda * 100).toFixed(1)}%` : ''})
                    </Text>
                  )}
                </td>
              </tr>
            )
          })}
          <tr style={{ borderTop: '1px solid #ddd' }}>
            <td style={{ paddingTop: 2 }}><Text strong>Subtotal</Text></td>
            <td style={{ textAlign: 'right', paddingTop: 2 }}><Text strong>{fmt(somaFixos, 'moeda')}</Text></td>
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
            <td style={{ textAlign: 'right', paddingTop: 2 }}><Text strong>{divisor.toFixed(4)}</Text></td>
          </tr>
        </tbody>
      </table>
      <Divider style={{ margin: '8px 0' }} />
      <div style={{ textAlign: 'right' }}>
        <Text type="secondary" style={{ fontSize: 11 }}>{fmt(somaFixos, 'moeda')} ÷ {divisor.toFixed(4)} =&nbsp;</Text>
        <Text strong style={{ color, fontSize: 14 }}>{fmt(preco, 'moeda')}</Text>
      </div>
    </div>
  )
}

// ── card mobile ──────────────────────────────────────────────────────────────

function MobilePriceCard({ row, calcAtivos, dados }: {
  row: Record<string, unknown>
  calcAtivos: CalcDef[]
  dados: Record<string, unknown>[]
}) {
  const calcGrupos: Record<string, CalcDef[]> = {}
  for (const c of calcAtivos) {
    const g = c.grupo ?? '_calc'
    if (!calcGrupos[g]) calcGrupos[g] = []
    calcGrupos[g].push(c)
  }
  const temF2 = dados?.some(r => r['meta_frete_2'] != null) ?? false
  const temF3 = dados?.some(r => r['meta_frete_3'] != null) ?? false

  const repName = row['codigo_representante'] != null
    ? `${row['codigo_representante']} - ${row['representante']}`
    : String(row['representante'] ?? '')

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      marginBottom: 10,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
          {repName}
        </span>
      </div>
      {Object.entries(calcGrupos).map(([grupo, calcs]) => {
        const gs = GROUP_STYLE[grupo]
        return (
          <div key={grupo} style={{ borderBottom: '1px solid #f1f5f9' }}>
            <div style={{
              padding: '6px 14px',
              background: gs ? gs.subheader : '#f8fafc',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 700,
              fontSize: 12,
              color: gs ? gs.text : '#374151',
              letterSpacing: '0.04em',
              textTransform: 'uppercase' as const,
            }}>
              {grupo}
            </div>
            <div style={{ padding: '6px 14px 10px' }}>
              {calcs.map(calc => {
                const freteCols: { label: string; key: string; metaKey: string | null }[] = [
                  { label: 'Frete 1', key: calc.id, metaKey: null },
                ]
                if (temF2) freteCols.push({ label: 'Frete 2', key: calc.id + '_f2', metaKey: 'meta_frete_2' })
                if (temF3) freteCols.push({ label: 'Frete 3', key: calc.id + '_f3', metaKey: 'meta_frete_3' })
                return (
                  <div key={calc.id} style={{ marginBottom: 2 }}>
                    {freteCols.map(fc => {
                      const val = row[fc.key]
                      if (val == null) return null
                      const rec = fc.metaKey ? { ...row, meta_frete: row[fc.metaKey] } : row
                      const popoverContent = renderPopoverContent(calc, rec, val, `${grupo ?? calc.label} — ${fc.label}`)
                      return (
                        <div key={fc.key} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '4px 0',
                        }}>
                          <span style={{ fontSize: 13, color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                            {calc.label} — {fc.label}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, color: gs?.calcColor ?? '#27ae60', fontVariantNumeric: 'tabular-nums' }}>
                              {fmt(val, calc.formato)}
                            </span>
                            {popoverContent && (
                              <Popover content={popoverContent} title={`${grupo ?? calc.label} — ${fc.label}`} trigger="click">
                                <span style={{ color: gs?.calcColor ?? '#27ae60', cursor: 'pointer', fontSize: 11, opacity: 0.7 }}>ⓘ</span>
                              </Popover>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
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
        ? (a: Record<string, unknown>, b: Record<string, unknown>) => String(a[col.campo] ?? '').localeCompare(String(b[col.campo] ?? ''))
        : (a: Record<string, unknown>, b: Record<string, unknown>) => (Number(a[col.campo] ?? 0)) - (Number(b[col.campo] ?? 0)),
      render: (val: unknown, record: Record<string, unknown>) => {
        if (col.campo === 'representante') {
          const codigo = record['codigo_representante']
          const label = codigo != null ? `${codigo} - ${String(val ?? '')}` : String(val ?? '')
          return <Text strong style={{ fontSize: 13, color: '#1e293b' }}>{label}</Text>
        }
        if (col.campo === 'meta_frete') {
          const parts = [val, record['meta_frete_2'], record['meta_frete_3']].filter(v => v != null).map(v => fmt(v, col.formato))
          return <Text style={{ color: '#1d4e89', fontWeight: 600 }}>{parts.join(' | ')}</Text>
        }
        return <Text>{fmt(val, col.formato)}</Text>
      },
    }
  }

  const toCalcCol = (calc: CalcDef, grupo?: string) => {
    const gs = grupo ? GROUP_STYLE[grupo] : null
    const color = gs?.calcColor ?? '#27ae60'

    const renderPopover = (rec: Record<string, unknown>, preco: unknown, title?: string) => {
      return renderPopoverContent(calc, rec, preco, title)
    }

    const makeSubCol = (freteLabel: string, dataIdx: string, metaFreteKey: string | null) => ({
      title: freteLabel,
      dataIndex: dataIdx,
      key: `${dataIdx}__${grupo ?? 'root'}`,
      align: 'right' as const,
      width: 110,
      onHeaderCell: () => ({ style: gs ? { background: gs.subheader, color, fontWeight: 600, fontSize: 12 } : {} }),
      sorter: (a: Record<string, unknown>, b: Record<string, unknown>) => (Number(a[dataIdx] ?? 0)) - (Number(b[dataIdx] ?? 0)),
      render: (val: unknown, record: Record<string, unknown>) => {
        if (val == null) return null
        const rec = metaFreteKey != null ? { ...record, meta_frete: record[metaFreteKey] } : record
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
  const allGroups = Array.from(new Set([...Object.keys(grupos), ...Object.keys(calcGrupos)]))

  for (const g of allGroups) {
    const gs = GROUP_STYLE[g]
    const children: ColumnsType<Record<string, unknown>> = [
      ...(grupos[g] ?? []).map(toAntCol),
      ...(calcGrupos[g] ?? []).flatMap(c => toCalcCol(c, g)),
    ]
    result.push({
      title: g, children,
      onHeaderCell: () => ({ style: gs ? { background: gs.header, color: '#fff', fontWeight: 700, textAlign: 'center' as const, letterSpacing: '0.05em', fontSize: 12 } : {} }),
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
  const isMobile = useIsMobile()
  const [badgesExpanded, setBadgesExpanded] = useState(false)
  const [mobileRepFilter, setMobileRepFilter] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { data } = await api.get<TabelaResponse>('/prices/tabela')
      setTabela(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Erro ao carregar dados'
      setError(msg)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const fonte = tabela?.fonte_config ?? { mp: 'realizado', embalagem: 'realizado', energia: 'realizado', renda: 'realizado' } as FonteConfig

  const rendaRealizado = tabela?.custo_mp?.renda_processo
    ? { parbo: tabela.custo_mp.renda_processo.parbo, branco: tabela.custo_mp.renda_processo.branco }
    : null

  const mpSc = tabela?.custo_mp
    ? { parbo: tabela.custo_mp.empresa_08?.parbo_sc ?? null, branco: tabela.custo_mp.empresa_58?.branco_sc ?? null }
    : null

  const transformedData = useMemo(() => {
    if (!tabela) return []
    return applyFonte(tabela.dados, tabela.calculos_ativos, fonte, tabela.parametros_gerais ?? null, rendaRealizado, mpSc)
  }, [tabela, fonte])

  const columns  = tabela ? buildColumns(tabela.colunas, tabela.calculos_ativos, transformedData) : []
  const avisoMp  = tabela?.custo_mp?.aviso ?? null
  const avisoProd = tabela?.custo_producao?.aviso ?? null
  const semDados = tabela !== null && tabela?.dados?.length === 0

  return (
    <div style={{ background: '#ffffff', borderRadius: isMobile ? 12 : 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)', padding: isMobile ? '14px 10px 16px' : '20px 24px 24px', height: isMobile ? 'auto' : 'calc(100vh - 32px)', overflow: isMobile ? 'visible' : 'hidden', minHeight: isMobile ? 'calc(100vh - 72px)' : undefined }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 30, height: 30, background: 'rgba(29,78,137,0.08)', border: '1px solid rgba(29,78,137,0.18)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <IconGrid />
            </div>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: isMobile ? 15 : 17, color: '#0f1f3d', letterSpacing: '-0.01em' }}>
              Tabela de Preços por Representante
            </span>
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: isMobile ? 0 : 40 }}>
            {tabela?.calculos_ativos.length ? (
              <span style={{ color: '#64748b', fontSize: 12, fontFamily: 'Inter, sans-serif', marginRight: 4 }}>
                {tabela.calculos_ativos.length} cálculo(s) ativo(s)
              </span>
            ) : null}
            {tabela?.mes && <span style={badge('blue')}>{tabela.mes}</span>}
            {isMobile && (
              <button
                onClick={() => setBadgesExpanded(!badgesExpanded)}
                style={{
                  background: badgesExpanded ? 'rgba(100,116,139,0.12)' : 'rgba(100,116,139,0.08)',
                  border: '1px solid rgba(100,116,139,0.2)',
                  borderRadius: 8,
                  padding: '3px 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: 'Inter, sans-serif',
                  color: '#475569',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {badgesExpanded ? 'Fechar ▴' : 'Detalhes ▾'}
              </button>
            )}
            {(!isMobile || badgesExpanded) && (
              <>
                {tabela?.custo_mp?.data && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={badge(avisoMp ? 'amber' : 'slate')}>MP ref.: {tabela.custo_mp.data}</span>
                    {avisoMp && <Tooltip title={avisoMp}><span style={{ color: '#d97706', fontSize: 13, cursor: 'default', lineHeight: 1 }}>⚠</span></Tooltip>}
                  </span>
                )}
                {tabela?.custo_producao?.parbo_integral && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Tooltip title={`Parbo/Integral: emb R$${tabela.custo_producao.parbo_integral.embalagem_por_fardo.toFixed(4)}/fardo · ene R$${tabela.custo_producao.parbo_integral.energia_por_fardo.toFixed(4)}/fardo | Branco: emb R$${tabela.custo_producao.branco?.embalagem_por_fardo.toFixed(4)}/fardo · ene R$${tabela.custo_producao.branco?.energia_por_fardo.toFixed(4)}/fardo`}>
                      <span style={{ ...badge('cyan'), cursor: 'help' }}>Custos prod.: {tabela.custo_producao.parbo_integral.periodo_referencia}</span>
                    </Tooltip>
                    {avisoProd && <Tooltip title={avisoProd}><span style={{ color: '#d97706', fontSize: 13, cursor: 'default', lineHeight: 1 }}>⚠</span></Tooltip>}
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
                {tabela?.impostos?.periodo && (
                  <Tooltip title="Média ponderada dos 3 meses anteriores ao mês atual">
                    <span style={{ ...badge('slate'), cursor: 'help' }}>Impostos ref.: {tabela.impostos.periodo}</span>
                  </Tooltip>
                )}
              </>
            )}
          </div>
        </div>

      </div>

      {/* ── Filtro de representante (mobile) ── */}
      {isMobile && transformedData.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Select
            showSearch
            allowClear
            placeholder="Filtrar representante..."
            style={{ width: '100%', fontFamily: 'Inter, sans-serif' }}
            value={mobileRepFilter}
            onChange={setMobileRepFilter}
            options={transformedData.map(r => {
              const cod = r['codigo_representante']
              const nome = String(r['representante'] ?? '')
              return { value: nome, label: cod != null ? `${cod} - ${nome}` : nome }
            })}
            filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            size="middle"
          />
        </div>
      )}

      {/* ── Alertas ── */}
      {semDados && !error && (
        <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
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
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>🚨</span>
            <div>
              <div style={{ fontWeight: 600, color: '#991b1b', fontSize: 13, fontFamily: 'Inter, sans-serif', marginBottom: 2 }}>Erro ao carregar dados</div>
              <div style={{ color: '#b91c1c', fontSize: 12, fontFamily: 'Inter, sans-serif' }}>{error}</div>
            </div>
          </div>
          <button onClick={fetchData} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#991b1b', fontSize: 12, fontFamily: 'Inter, sans-serif', cursor: 'pointer', flexShrink: 0 }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Tabela ── */}
      <Spin spinning={loading}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .price-table .ant-table { border-radius: 10px; overflow: hidden; }
          .price-table .ant-table-container { border-start-start-radius: 10px; border-start-end-radius: 10px; }
          .price-table .ant-table-bordered > .ant-table-container { border-inline-start: none; border-top: none; }
          .price-table .ant-table-bordered .ant-table-cell { border-inline-end-color: #e8e8e8; }
          .price-table .ant-table-wrapper { border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
          .price-table .ant-table-thead > tr:first-child > th:first-child,
          .price-table .ant-table-thead > tr:first-child > td:first-child { border-start-start-radius: 10px !important; }
          .price-table .ant-table-thead > tr:first-child > th:last-child,
          .price-table .ant-table-thead > tr:first-child > td:last-child { border-start-end-radius: 10px !important; }
          .price-table .ant-table-tbody > tr:nth-child(even) > td { background: #f8fafc; }
          .price-table .ant-table-tbody > tr:hover > td { background: #eff6ff !important; }
        `}</style>
        {isMobile ? (
          <div style={{ overflow: 'visible' }}>
            {!loading && transformedData.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>
                Nenhum dado encontrado
              </div>
            )}
            {transformedData
              .filter(row => !mobileRepFilter || row['representante'] === mobileRepFilter)
              .map(row => (
              <MobilePriceCard
                key={String(row['representante'])}
                row={row}
                calcAtivos={tabela?.calculos_ativos ?? []}
                dados={transformedData}
              />
            ))}
          </div>
        ) : (
          <Table
            className="price-table"
            columns={columns}
            dataSource={transformedData}
            rowKey="representante"
            size="middle"
            pagination={false}
            bordered
            scroll={{ x: 'max-content', y: 'calc(100vh - 240px)' }}
            locale={{ emptyText: 'Nenhum dado encontrado' }}
          />
        )}
      </Spin>
    </div>
  )
}
