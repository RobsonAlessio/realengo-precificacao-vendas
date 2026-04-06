import { useEffect, useState, useMemo, CSSProperties } from 'react'
import { Select, Radio, InputNumber, Spin, Tooltip } from 'antd'
import { SwapOutlined, InfoCircleOutlined } from '@ant-design/icons'
import api from '../../api/client'

// ── tipos ────────────────────────────────────────────────────────────────────
interface VarDef { campo: string; label: string; formato: 'numero' | 'percentual' | 'moeda' }
interface CalcDef { id: string; label: string; formula: string; formato: 'numero' | 'percentual' | 'moeda'; grupo: string | null; ativo: boolean; variaveis?: VarDef[] }
interface TabelaResponse { calculos_ativos: CalcDef[]; dados: Record<string, any>[]; custo_mp: any; custo_producao: any; mes: string | null }
interface RepAtivo { codigo: number | null; fantasia: string; comissao: number | null; imposto: number | null }

function fmt(n: number | null | undefined, type: 'moeda' | 'percentual' = 'moeda'): string {
  if (n == null || isNaN(n)) return '—'
  if (type === 'moeda') return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (type === 'percentual') return (n * 100).toFixed(2) + '%'
  return String(n)
}

// ── estilos ──────────────────────────────────────────────────────────────────
const card: CSSProperties = {
  background: '#ffffff',
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
  overflow: 'hidden',
}
const cardHeader = (color: string): CSSProperties => ({
  padding: '12px 16px',
  borderBottom: '1px solid #f1f5f9',
  fontFamily: 'Outfit, sans-serif',
  fontWeight: 700,
  fontSize: 16,
  color,
})
const subLabel: CSSProperties = {
  display: 'block',
  color: '#64748b',
  fontSize: 12,
  fontFamily: 'Inter, sans-serif',
  marginBottom: 6,
}
// Caixinha de resultado (read-only)
function ReadonlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <span style={subLabel}>{label}</span>
      <div style={{
        flex: 1,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '0 11px',
        display: 'flex',
        alignItems: 'center',
        minHeight: 32,
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', fontFamily: 'Inter, sans-serif', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
    </div>
  )
}

// Par de campos lado a lado
function FieldRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>{children}</div>
}

// Campo percentual
function PctField({ label, value, onChange, isHighlight, status }: {
  label: string; value: number; onChange: (v: number | null) => void
  isHighlight?: boolean; status?: '' | 'warning' | 'error'
}) {
  return (
    <div style={{ flex: 1 }}>
      <span style={{ ...subLabel, color: isHighlight ? '#3b82f6' : '#94a3b8' }}>{label}</span>
      <InputNumber
        addonAfter="%"
        style={{ width: '100%' }}
        value={Number((value * 100).toFixed(2))}
        onChange={v => onChange((v || 0) / 100)}
        precision={2}
        decimalSeparator=","
        step={1}
        status={status}
      />
    </div>
  )
}

// Ícone calculadora
function IconCalc() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4e89" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="12" y2="14" /><line x1="8" y1="18" x2="12" y2="18" />
    </svg>
  )
}

// ── componente ───────────────────────────────────────────────────────────────
export default function SalesSimulator() {
  const [tabela, setTabela] = useState<TabelaResponse | null>(null)
  const [ativos, setAtivos] = useState<RepAtivo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRep, setSelectedRep] = useState<string | null>(null)
  const [selectedCalcId, setSelectedCalcId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, number>>({})
  const [custoAdicional, setCustoAdicional] = useState<number>(0)
  const [manualFinalPrice, setManualFinalPrice] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([api.get<TabelaResponse>('/prices/tabela'), api.get<RepAtivo[]>('/representantes/ativos')])
      .then(([t, a]) => {
        setTabela(t.data); setAtivos(a.data || [])
        if (t.data.calculos_ativos?.length) setSelectedCalcId(t.data.calculos_ativos[0].id)
      })
      .catch(err => setError(err?.response?.data?.detail || err.message))
      .finally(() => setLoading(false))
  }, [])

  const calcDef = useMemo(() => tabela?.calculos_ativos.find(c => c.id === selectedCalcId), [tabela, selectedCalcId])
  const repData = useMemo(() => (!selectedRep || !tabela) ? null : tabela.dados.find(d => d.representante === selectedRep) || null, [selectedRep, tabela])
  const margemKey = useMemo(() => calcDef?.variaveis?.find(v => v.campo.includes('margem'))?.campo || null, [calcDef])

  const comissaoByRep = useMemo(() => { const m: Record<string, number> = {}; ativos.forEach(a => { if (a.comissao != null) m[a.fantasia] = a.comissao }); return m }, [ativos])
  const impostoByRep = useMemo(() => { const m: Record<string, number> = {}; ativos.forEach(a => { if (a.imposto != null) m[a.fantasia] = a.imposto }); return m }, [ativos])

  const globalCosts = useMemo((): Record<string, any> => {
    if (!tabela) return {}
    const mp = tabela.custo_mp; const pi = tabela.custo_producao?.parbo_integral || {}; const br = tabela.custo_producao?.branco || {}
    return { mp_parbo: mp?.empresa_08?.parbo, mp_parbo_sc: mp?.empresa_08?.parbo_sc, mp_branco: mp?.empresa_58?.branco, mp_branco_sc: mp?.empresa_58?.branco_sc, mp_integral: mp?.empresa_08?.integral, mp_integral_sc: mp?.empresa_08?.integral_sc, embalagem_parbo: pi?.embalagem_por_fardo, energia_parbo: pi?.energia_por_fardo, embalagem_branco: br?.embalagem_por_fardo, energia_branco: br?.energia_por_fardo, embalagem_integral: pi?.embalagem_por_fardo, energia_integral: pi?.energia_por_fardo }
  }, [tabela])

  useEffect(() => {
    if (!calcDef || !tabela) return
    const nv: Record<string, number> = {}
    calcDef.variaveis?.forEach(v => {
      let val = 0
      if (repData) { val = Number(repData[v.campo]) }
      else {
        const isG = v.campo.startsWith('mp_') || v.campo.startsWith('embalagem_') || v.campo.startsWith('energia_')
        if (isG) val = Number(globalCosts[v.campo])
        else if (v.campo === 'comissao' && selectedRep) val = comissaoByRep[selectedRep] ?? 0
        else if (v.campo === 'imposto' && selectedRep) val = impostoByRep[selectedRep] ?? 0
      }
      nv[v.campo] = isNaN(val) ? 0 : val
    })
    setFormValues(nv); setManualFinalPrice(null); setCustoAdicional(0)
  }, [selectedRep, calcDef, repData, tabela, globalCosts, comissaoByRep, impostoByRep])

  const { somaFixos, somaPcts } = useMemo(() => {
    let f = custoAdicional || 0, p = 0
    calcDef?.variaveis?.forEach(v => { const val = formValues[v.campo] || 0; if (v.formato === 'percentual') p += val; else f += val })
    return { somaFixos: f, somaPcts: p }
  }, [calcDef, formValues, custoAdicional])

  const divisor = 1 - somaPcts
  const calculatedPrice = useMemo(() => divisor <= 0 ? 0 : somaFixos / divisor, [somaFixos, divisor])
  const finalPrice = manualFinalPrice !== null ? manualFinalPrice : calculatedPrice

  const handleValueChange = (campo: string, val: number | null) => { setFormValues(p => ({ ...p, [campo]: val || 0 })); setManualFinalPrice(null) }
  const handleFinalPriceChange = (val: number | null) => {
    if (!val || !margemKey) return
    const margemAtual = formValues[margemKey] || 0; const outrosPcts = somaPcts - margemAtual
    setManualFinalPrice(val); setFormValues(p => ({ ...p, [margemKey]: 1 - (somaFixos / val) - outrosPcts }))
  }

  const reps = useMemo(() => {
    if (ativos.length > 0) return ativos.map(a => ({ label: a.codigo ? `${a.codigo} - ${a.fantasia}` : a.fantasia, value: a.fantasia }))
    return tabela?.dados.map(d => ({ label: d.codigo_representante ? `${d.codigo_representante} - ${d.representante}` : d.representante, value: d.representante })) || []
  }, [ativos, tabela])

  // Separação das variáveis por tipo
  const mpVar = calcDef?.variaveis?.find(v => v.campo.startsWith('mp_'))
  const embalagemVar = calcDef?.variaveis?.find(v => v.campo.startsWith('embalagem_'))
  const energiaVar = calcDef?.variaveis?.find(v => v.campo.startsWith('energia_'))
  const freteVar = calcDef?.variaveis?.find(v => v.campo === 'meta_frete')
  const comissaoVar = calcDef?.variaveis?.find(v => v.campo === 'comissao')
  const impostoVar = calcDef?.variaveis?.find(v => v.campo === 'imposto')
  const margemVar = calcDef?.variaveis?.find(v => v.campo === margemKey)

  // campos fixos já alocados acima (não repetir na listagem geral)
  const fixosAlocados = new Set(['mp_parbo', 'mp_branco', 'mp_integral', 'embalagem_parbo', 'embalagem_branco', 'embalagem_integral', 'energia_parbo', 'energia_branco', 'energia_integral', 'meta_frete'])
  const pctAlocados = new Set(['comissao', 'imposto', margemKey])

  const varsFixaisExtras = calcDef?.variaveis?.filter(v => v.formato !== 'percentual' && !fixosAlocados.has(v.campo)) || []
  const varsPctsExtras = calcDef?.variaveis?.filter(v => v.formato === 'percentual' && !pctAlocados.has(v.campo)) || []

  // Renda para conversão Saco 50kg → Fardo 30kg
  const getRenda = () => {
    const rp = tabela?.custo_mp?.renda_processo
    if (!mpVar) return 0.73
    if (mpVar.campo.includes('parbo') && rp?.parbo) return rp.parbo
    if (mpVar.campo.includes('branco') && rp?.branco) return rp.branco
    if (mpVar.campo.includes('integral') && rp?.integral) return rp.integral
    return 0.73
  }
  const renda = getRenda()
  const sacoVal = mpVar ? ((formValues[mpVar.campo] || 0) * renda) / 0.6 : 0
  const fardoVal = mpVar ? formValues[mpVar.campo] || 0 : 0

  return (
    <div style={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>

      {/* loading overlay */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, borderRadius: 14 }}>
          <Spin />
        </div>
      )}

      {/* ── Cabeçalho + Seletores ── */}
      <div style={{ ...card, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, background: 'rgba(29,78,137,0.08)', border: '1px solid rgba(29,78,137,0.18)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconCalc />
            </div>
            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#0f1f3d', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
              Simulador de Vendas
            </span>
          </div>

          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 12px', color: '#991b1b', fontSize: 13, fontFamily: 'Inter,sans-serif' }}>{error}</div>}

          <div style={{ flex: 1, minWidth: 200 }}>
            <Select showSearch allowClear placeholder="Selecione um representante..." style={{ width: '100%' }} options={reps} value={selectedRep} onChange={setSelectedRep} filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())} size="small" />
          </div>
          <div style={{ flexShrink: 0 }}>
            <Radio.Group value={selectedCalcId} onChange={e => setSelectedCalcId(e.target.value)} buttonStyle="solid" size="small">
              {tabela?.calculos_ativos.map(c => <Radio.Button key={c.id} value={c.id}>{c.grupo || c.label}</Radio.Button>)}
            </Radio.Group>
          </div>
        </div>
      </div>

      {/* ── Corpo principal ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 10, alignItems: 'stretch' }}>

        {/* ── Custos Fixos ── */}
        <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={cardHeader('#1d4e89')}>Custos Fixos (Numerador)</div>
          <div style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>

            {/* MP: Saco 50kg (editável) | Fardo 30kg (resultado) */}
            {mpVar && (
              <div style={{ marginBottom: 12 }}>
                <span style={{ ...subLabel, color: '#374151', fontWeight: 500, fontSize: 14, marginBottom: 8 }}>{mpVar.label}</span>
                <FieldRow>
                  <div style={{ flex: 1 }}>
                    <span style={subLabel}>Saco 50kg (renda: {(renda * 100).toFixed(1)}%)</span>
                    <InputNumber prefix="R$" style={{ width: '100%' }} value={Number(sacoVal.toFixed(4))} onChange={v2 => handleValueChange(mpVar.campo, ((v2 || 0) * 0.6) / renda)} precision={2} decimalSeparator="," step={1} />
                  </div>
                  <ReadonlyValue label="Fardo 30kg (Custo Efetivo)" value={fmt(fardoVal)} />
                </FieldRow>
              </div>
            )}

            {/* Embalagem | Energia */}
            {(embalagemVar || energiaVar) && (
              <FieldRow>
                {embalagemVar && (
                  <div style={{ flex: 1 }}>
                    <span style={subLabel}>{embalagemVar.label}</span>
                    <InputNumber prefix="R$" style={{ width: '100%' }} value={formValues[embalagemVar.campo] || 0} onChange={v => handleValueChange(embalagemVar.campo, v)} precision={2} decimalSeparator="," step={0.1} />
                  </div>
                )}
                {energiaVar && (
                  <div style={{ flex: 1 }}>
                    <span style={subLabel}>{energiaVar.label}</span>
                    <InputNumber prefix="R$" style={{ width: '100%' }} value={formValues[energiaVar.campo] || 0} onChange={v => handleValueChange(energiaVar.campo, v)} precision={2} decimalSeparator="," step={0.1} />
                  </div>
                )}
              </FieldRow>
            )}

            {/* Frete */}
            {freteVar && (
              <FieldRow>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={subLabel}>{freteVar.label}</span>
                    {repData && (repData.meta_frete_2 || repData.meta_frete_3) && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {repData.meta_frete_2 && <span style={{ fontSize: 12, color: '#3b82f6', cursor: 'pointer' }} onClick={() => handleValueChange(freteVar.campo, Number(repData.meta_frete_2))}>F2 ({fmt(Number(repData.meta_frete_2))})</span>}
                        {repData.meta_frete_3 && <span style={{ fontSize: 12, color: '#3b82f6', cursor: 'pointer' }} onClick={() => handleValueChange(freteVar.campo, Number(repData.meta_frete_3))}>F3 ({fmt(Number(repData.meta_frete_3))})</span>}
                      </div>
                    )}
                  </div>
                  <InputNumber prefix="R$" style={{ width: '100%' }} value={formValues[freteVar.campo] || 0} onChange={v => handleValueChange(freteVar.campo, v)} precision={2} decimalSeparator="," step={0.1} />
                </div>
                <div style={{ flex: 1 }} />
              </FieldRow>
            )}

            {/* Custos Adicionais */}
            <FieldRow>
              <div style={{ flex: 1 }}>
                <span style={subLabel}>
                  Custos Adicionais&nbsp;
                  <Tooltip title="Fretes extras, bonificações ou outros custos fixos (R$)">
                    <InfoCircleOutlined style={{ fontSize: 12, color: '#94a3b8', cursor: 'default' }} />
                  </Tooltip>
                </span>
                <InputNumber prefix="R$" style={{ width: '100%' }} value={custoAdicional || 0} onChange={v => { setCustoAdicional(v || 0); setManualFinalPrice(null) }} precision={2} decimalSeparator="," step={0.5} />
              </div>
              <div style={{ flex: 1 }} />
            </FieldRow>

            {/* Extras não alocados */}
            {varsFixaisExtras.map(v => (
              <div key={v.campo} style={{ marginBottom: 12 }}>
                <span style={subLabel}>{v.label}</span>
                <InputNumber prefix="R$" style={{ width: '100%' }} value={formValues[v.campo] || 0} onChange={val => handleValueChange(v.campo, val)} precision={2} decimalSeparator="," step={0.1} />
              </div>
            ))}

            {/* Subtotal */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 14, color: '#374151' }}>Subtotal Fixos (=)</span>
              <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 22, color: '#1d4e89' }}>{fmt(somaFixos)}</span>
            </div>
          </div>
        </div>

        {/* ── Coluna direita: Deduções + Preço Final ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

          {/* Deduções */}
          <div style={{ ...card }}>
            <div style={cardHeader('#d4380d')}>Deduções (Denominador)</div>
            <div style={{ padding: '12px 16px' }}>

              {/* Comissão | Imposto */}
              {(comissaoVar || impostoVar) && (
                <FieldRow>
                  {comissaoVar && <PctField label={comissaoVar.label} value={formValues[comissaoVar.campo] || 0} onChange={v => handleValueChange(comissaoVar.campo, v)} />}
                  {impostoVar && <PctField label={impostoVar.label} value={formValues[impostoVar.campo] || 0} onChange={v => handleValueChange(impostoVar.campo, v)} />}
                </FieldRow>
              )}

              {/* Margem — linha única */}
              {margemVar && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={subLabel}>{margemVar.label}</span>
                    <span style={{ fontSize: 12, color: '#3b82f6', fontFamily: 'Inter,sans-serif' }}>(Calculado automaticamente) <SwapOutlined /></span>
                  </div>
                  <InputNumber addonAfter="%" style={{ width: '100%' }} value={Number(((formValues[margemVar.campo] || 0) * 100).toFixed(2))} onChange={v => handleValueChange(margemVar.campo, (v || 0) / 100)} precision={2} decimalSeparator="," step={1} status={manualFinalPrice ? 'warning' : ''} />
                </div>
              )}

              {/* Extras */}
              {varsPctsExtras.map(v => (
                <div key={v.campo} style={{ marginBottom: 12 }}>
                  <span style={subLabel}>{v.label}</span>
                  <InputNumber addonAfter="%" style={{ width: '100%' }} value={Number(((formValues[v.campo] || 0) * 100).toFixed(2))} onChange={val => handleValueChange(v.campo, (val || 0) / 100)} precision={2} decimalSeparator="," step={1} />
                </div>
              ))}

              {/* Subtotal + Divisor */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 14, color: '#374151' }}>Subtotal Deduções</span>
                  <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 18, color: '#dc2626' }}>{fmt(somaPcts, 'percentual')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 14, color: '#374151' }}>Divisor Geral (1 - deduções) (=)</span>
                  <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 22, color: '#d4380d' }}>{divisor.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Preço Final */}
          <div style={{ ...card, flex: 1, background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column' }}>
            <div style={{ ...cardHeader('#166534'), borderBottom: '1px solid #bbf7d0' }}>Preço Final por Fardo</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 24px', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 700, fontSize: 30, color: '#166534', lineHeight: 1 }}>R$</span>
                <InputNumber
                  size="large"
                  style={{ width: 170, fontWeight: 700, color: '#166534', fontSize: 30 }}
                  value={Number(finalPrice.toFixed(2))}
                  onChange={handleFinalPriceChange}
                  precision={2}
                  decimalSeparator=","
                  step={1.0}
                  variant="borderless"
                />
              </div>
              <span style={{ color: '#64748b', fontSize: 13, fontFamily: 'Inter,sans-serif', textAlign: 'center', maxWidth: 280 }}>
                <InfoCircleOutlined style={{ marginRight: 4 }} />
                Altere para calcular qual seria a <strong style={{ color: '#1d4e89' }}>Margem</strong> resultante
              </span>
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}
