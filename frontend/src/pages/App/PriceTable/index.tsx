import { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Alert, Space, Typography, Spin, Tag,
  Tooltip, Popover, Divider,
} from 'antd'
import { ReloadOutlined, InfoCircleOutlined, WarningOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '../../../api/client'

const { Title, Text } = Typography

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
  custo_mp: { data: string; aviso: string | null }
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

// ── geração de colunas ───────────────────────────────────────────────────────

function buildColumns(
  colDefs: ColDef[],
  calcAtivos: CalcDef[],
  dados: Record<string, unknown>[],
): ColumnsType<Record<string, unknown>> {
  // Detecta quais fretes extras existem nos dados
  const temF2 = dados.some(r => r['meta_frete_2'] != null)
  const temF3 = dados.some(r => r['meta_frete_3'] != null)

  const visiveis = colDefs.filter(c => c.visivel)

  // agrupa por grupo
  const grupos: Record<string, ColDef[]> = {}
  const semGrupo: ColDef[] = []
  for (const col of visiveis) {
    if (!col.grupo) semGrupo.push(col)
    else { if (!grupos[col.grupo]) grupos[col.grupo] = []; grupos[col.grupo].push(col) }
  }

  // colunas calculadas agrupadas
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
          return <Text strong style={{ fontSize: 13 }}>{label}</Text>
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
        return (
          <Text>{fmt(val, col.formato)}</Text>
        )
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
            <Text style={{ color, fontWeight: 700 }}>{fmt(val, calc.formato)}</Text>
            {content && (
              <Popover content={content} title={`${grupo ?? calc.label} — ${freteLabel}`} trigger="click">
                <InfoCircleOutlined style={{ color, cursor: 'pointer', fontSize: 11, opacity: 0.65, marginLeft: 2 }} />
              </Popover>
            )}
          </span>
        )
      },
    })

    const subCols = [makeSubCol('Frete 1', calc.id, null)]
    if (temF2) subCols.push(makeSubCol('Frete 2', calc.id + '_f2', 'meta_frete_2'))
    if (temF3) subCols.push(makeSubCol('Frete 3', calc.id + '_f3', 'meta_frete_3'))

    return {
      title: (
        <Tooltip title={`Fórmula: ${calc.formula}`}>
          {calc.label}
        </Tooltip>
      ),
      key: `${calc.id}__grp__${grupo ?? 'root'}`,
      onHeaderCell: () => ({ style: gs ? { background: gs.subheader, color, fontWeight: 700 } : {} }),
      children: subCols,
    }
  }

  // monta colunas sem grupo
  const result: ColumnsType<Record<string, unknown>> = semGrupo.map(toAntCol)

  // grupos de dados + calculados mesclados por nome de grupo
  const allGroups = Array.from(new Set([
    ...Object.keys(grupos),
    ...Object.keys(calcGrupos),
  ]))

  for (const g of allGroups) {
    const gs = GROUP_STYLE[g]
    const children: ColumnsType<Record<string, unknown>> = [
      ...(grupos[g] ?? []).map(toAntCol),
      ...(calcGrupos[g] ?? []).map(c => toCalcCol(c, g)),
    ]
    result.push({
      title: g,
      children,
      onHeaderCell: () => ({
        style: gs ? { background: gs.header, color: '#fff', fontWeight: 700, textAlign: 'center' as const } : {},
      }),
    })
  }

  // cálculos sem grupo ficam no final
  const calcSemGrupo = calcGrupos['_calc'] ?? []
  result.push(...calcSemGrupo.map(c => toCalcCol(c)))

  return result
}

// ── componente ───────────────────────────────────────────────────────────────

export default function PriceTable() {
  const [tabela, setTabela] = useState<TabelaResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const columns = tabela
    ? buildColumns(tabela.colunas, tabela.calculos_ativos, tabela.dados)
    : []

  // Avisos de MP e custo de produção para exibir como ícone inline nas tags
  const avisoMp = tabela?.custo_mp?.aviso ?? null
  const avisoProd = tabela?.custo_producao?.aviso ?? null

  const semDados = tabela !== null && tabela.dados.length === 0

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: 14,
      boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
      padding: '20px 24px 24px',
    }}>
      {/* Header */}
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%', padding: '0 4px' }}>
        <Space wrap align="center">
          <Title level={4} style={{ margin: 0 }}>Tabela de Preços por Representante</Title>
          {tabela?.mes && <Tag color="blue">{tabela.mes}</Tag>}
          {tabela?.custo_mp?.data && (
            <Space size={4}>
              <Tag color="default">MP ref.: {tabela.custo_mp.data}</Tag>
              {avisoMp && (
                <Tooltip title={avisoMp}>
                  <WarningOutlined style={{ color: '#d97706', fontSize: 13, cursor: 'default' }} />
                </Tooltip>
              )}
            </Space>
          )}
          {tabela?.custo_producao?.parbo_integral && (
            <Space size={4}>
              <Tooltip title={`Parbo/Integral: emb R$${tabela.custo_producao.parbo_integral.embalagem_por_fardo.toFixed(4)}/fardo · ene R$${tabela.custo_producao.parbo_integral.energia_por_fardo.toFixed(4)}/fardo | Branco: emb R$${tabela.custo_producao.branco?.embalagem_por_fardo.toFixed(4)}/fardo · ene R$${tabela.custo_producao.branco?.energia_por_fardo.toFixed(4)}/fardo`}>
                <Tag color="cyan">Custos prod.: {tabela.custo_producao.parbo_integral.periodo_referencia}</Tag>
              </Tooltip>
              {avisoProd && (
                <Tooltip title={avisoProd}>
                  <WarningOutlined style={{ color: '#d97706', fontSize: 13, cursor: 'default' }} />
                </Tooltip>
              )}
            </Space>
          )}
          {tabela?.calculos_ativos.length ? (
            <Tag color="green">{tabela.calculos_ativos.length} cálculo(s) ativo(s)</Tag>
          ) : null}
        </Space>
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>
          Atualizar
        </Button>
      </Space>

      {semDados && !error && (
        <Alert
          type="warning"
          showIcon
          message={`Nenhum parâmetro cadastrado para ${tabela?.mes}.`}
          description="Acesse a aba Parâmetros para importar ou cadastrar os representantes do mês atual."
          style={{ marginBottom: 12 }}
        />
      )}
      {error && (
        <Alert message="Erro ao carregar dados" description={error} type="error" showIcon
          style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={fetchData}>Tentar novamente</Button>}
        />
      )}

      {/* Tabela */}
      <Spin spinning={loading}>
        <style>{`
          .price-table .ant-table {
            border-radius: 10px;
            overflow: hidden;
          }
          .price-table .ant-table-container {
            border-start-start-radius: 10px;
            border-start-end-radius: 10px;
          }
          .price-table .ant-table-bordered > .ant-table-container {
            border-inline-start: none;
            border-top: none;
          }
          .price-table .ant-table-bordered .ant-table-cell {
            border-inline-end-color: #e8e8e8;
          }
          .price-table .ant-table-wrapper {
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 1px 6px rgba(0,0,0,0.08);
          }
          .price-table .ant-table-thead > tr:first-child > th:first-child,
          .price-table .ant-table-thead > tr:first-child > td:first-child {
            border-start-start-radius: 10px !important;
          }
          .price-table .ant-table-thead > tr:first-child > th:last-child,
          .price-table .ant-table-thead > tr:first-child > td:last-child {
            border-start-end-radius: 10px !important;
          }
        `}</style>
        <Table
          className="price-table"
          columns={columns}
          dataSource={tabela?.dados ?? []}
          rowKey="representante"
          size="middle"
          pagination={false}
          bordered
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: loading ? 'Carregando...' : 'Nenhum dado encontrado' }}
        />
      </Spin>
    </div>
  )
}
