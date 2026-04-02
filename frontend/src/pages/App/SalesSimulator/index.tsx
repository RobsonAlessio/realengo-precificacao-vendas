import { useEffect, useState, useMemo } from 'react'
import {
  Card, Select, Radio, InputNumber, Row, Col, Typography, Spin, Space, Divider, Alert, Tooltip,
} from 'antd'
import { CalculatorOutlined, InfoCircleOutlined, SwapOutlined } from '@ant-design/icons'
import api from '../../../api/client'

const { Title, Text } = Typography

// --- Tipos
interface VarDef {
  campo: string
  label: string
  formato: 'numero' | 'percentual' | 'moeda'
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
interface TabelaResponse {
  calculos_ativos: CalcDef[]
  dados: Record<string, any>[]
  custo_mp: any
  custo_producao: any
  mes: string | null
}
interface RepAtivo {
  codigo: number | null
  fantasia: string
  comissao: number | null
  imposto: number | null
}

function fmt(n: number | null | undefined, type: 'moeda' | 'percentual' = 'moeda'): string {
  if (n == null || isNaN(n)) return '—'
  if (type === 'moeda') return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (type === 'percentual') return (n * 100).toFixed(2) + '%'
  return String(n)
}

export default function SalesSimulator() {
  const [tabela, setTabela] = useState<TabelaResponse | null>(null)
  const [ativos, setAtivos] = useState<RepAtivo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedRep, setSelectedRep] = useState<string | null>(null)
  const [selectedCalcId, setSelectedCalcId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, number>>({})
  const [custoAdicional, setCustoAdicional] = useState<number>(0)

  // Controla o valor digitado diretamente no preço final.
  const [manualFinalPrice, setManualFinalPrice] = useState<number | null>(null)

  // 1. Fetch
  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<TabelaResponse>('/prices/tabela'),
      api.get<RepAtivo[]>('/representantes/ativos'),
    ])
      .then(([tabelaRes, ativosRes]) => {
        setTabela(tabelaRes.data)
        setAtivos(ativosRes.data || [])
        if (tabelaRes.data.calculos_ativos?.length) {
          setSelectedCalcId(tabelaRes.data.calculos_ativos[0].id)
        }
      })
      .catch(err => setError(err?.response?.data?.detail || err.message))
      .finally(() => setLoading(false))
  }, [])

  // 2. Computed
  const calcDef = useMemo(() => {
    return tabela?.calculos_ativos.find(c => c.id === selectedCalcId)
  }, [tabela, selectedCalcId])

  const repData = useMemo(() => {
    if (!selectedRep || !tabela) return null
    return tabela.dados.find(d => d.representante === selectedRep) || null
  }, [selectedRep, tabela])

  const margemKey = useMemo(() => {
    if (!calcDef?.variaveis) return null
    return calcDef.variaveis.find(v => v.campo.includes('margem'))?.campo || null
  }, [calcDef])

  // Mapas {fantasia: valor} dos representantes ativos (parquet)
  const comissaoByRep = useMemo((): Record<string, number> => {
    const map: Record<string, number> = {}
    ativos.forEach(a => { if (a.comissao != null) map[a.fantasia] = a.comissao })
    return map
  }, [ativos])

  const impostoByRep = useMemo((): Record<string, number> => {
    const map: Record<string, number> = {}
    ativos.forEach(a => { if (a.imposto != null) map[a.fantasia] = a.imposto })
    return map
  }, [ativos])

  // Custos globais (MP, embalagem, energia) derivados diretamente do tabela,
  // usados como baseline quando o representante não tem dados no BD.
  const globalCosts = useMemo((): Record<string, any> => {
    if (!tabela) return {}
    const mp = tabela.custo_mp
    const cp = tabela.custo_producao
    const pi = cp?.parbo_integral || {}
    const br = cp?.branco || {}
    return {
      mp_parbo:           mp?.empresa_08?.parbo,
      mp_parbo_sc:        mp?.empresa_08?.parbo_sc,
      mp_branco:          mp?.empresa_58?.branco,
      mp_branco_sc:       mp?.empresa_58?.branco_sc,
      mp_integral:        mp?.empresa_08?.integral,
      mp_integral_sc:     mp?.empresa_08?.integral_sc,
      embalagem_parbo:    pi?.embalagem_por_fardo,
      energia_parbo:      pi?.energia_por_fardo,
      embalagem_branco:   br?.embalagem_por_fardo,
      energia_branco:     br?.energia_por_fardo,
      embalagem_integral: pi?.embalagem_por_fardo,
      energia_integral:   pi?.energia_por_fardo,
    }
  }, [tabela])

  // 3. Efeitos
  // Quando muda o Representante ou o Cálculo, zera o input manual e repopula as variáveis.
  useEffect(() => {
    if (!calcDef || !tabela) return
    const newValues: Record<string, number> = {}

    calcDef.variaveis?.forEach(v => {
      let val = 0
      if (repData) {
        val = Number(repData[v.campo])
      } else {
        // Sem dados do rep no BD: preenche globais (MP, embalagem, energia) e comissão do cadastro.
        const isGlobal = v.campo.startsWith('mp_') || v.campo.startsWith('embalagem_') || v.campo.startsWith('energia_')
        if (isGlobal) {
          val = Number(globalCosts[v.campo])
        } else if (v.campo === 'comissao' && selectedRep) {
          val = comissaoByRep[selectedRep] ?? 0
        } else if (v.campo === 'imposto' && selectedRep) {
          val = impostoByRep[selectedRep] ?? 0
        }
      }
      if (isNaN(val)) val = 0
      newValues[v.campo] = val
    })

    setFormValues(newValues)
    setManualFinalPrice(null)
    setCustoAdicional(0)
  }, [selectedRep, calcDef, repData, tabela, globalCosts, comissaoByRep, impostoByRep])

  // 4. Lógica de Simulador
  const { somaFixos, somaPcts } = useMemo(() => {
    let f = custoAdicional || 0
    let p = 0
    if (calcDef?.variaveis) {
      calcDef.variaveis.forEach(v => {
        const val = formValues[v.campo] || 0
        if (v.formato === 'percentual') p += val
        else f += val
      })
    }
    return { somaFixos: f, somaPcts: p }
  }, [calcDef, formValues, custoAdicional])

  const divisor = 1 - somaPcts

  const calculatedPrice = useMemo(() => {
    if (divisor <= 0) return 0
    return somaFixos / divisor
  }, [somaFixos, divisor])

  const finalPrice = manualFinalPrice !== null ? manualFinalPrice : calculatedPrice

  // Handlers
  const handleValueChange = (campo: string, val: number | null) => {
    setFormValues(prev => ({ ...prev, [campo]: val || 0 }))
    setManualFinalPrice(null) // se alterar qualquer conta base, quebra o "pino" do final manual
  }

  const handleFinalPriceChange = (val: number | null) => {
    if (!val || !margemKey) return

    // Matemática inversa:
    // finalPrice = somaFixos / (1 - (outrosPcts + novaMargem))
    // 1 - outrosPcts - novaMargem = somaFixos / finalPrice
    // novaMargem = 1 - (somaFixos / val) - outrosPcts

    const margemAtual = formValues[margemKey] || 0
    const outrosPcts = somaPcts - margemAtual
    const novaMargem = 1 - (somaFixos / val) - outrosPcts

    setManualFinalPrice(val)
    setFormValues(prev => ({ ...prev, [margemKey]: novaMargem }))
  }

  // 5. Render
  // Lista de representantes: usa ativos do parquet; fallback para tabela.dados se ativos vazio.
  const reps = useMemo(() => {
    if (ativos.length > 0) {
      return ativos.map(a => ({
        label: a.codigo ? `${a.codigo} - ${a.fantasia}` : a.fantasia,
        value: a.fantasia,
      }))
    }
    return tabela?.dados.map(d => ({
      label: d.codigo_representante ? `${d.codigo_representante} - ${d.representante}` : d.representante,
      value: d.representante,
    })) || []
  }, [ativos, tabela])

  const varsFixais = calcDef?.variaveis?.filter(v => v.formato !== 'percentual') || []
  const varsPcts = calcDef?.variaveis?.filter(v => v.formato === 'percentual') || []

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 40 }}>
      <Space style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}><CalculatorOutlined /> Simulador de Vendas</Title>
        <Text type="secondary">— Simule preços e encontre sua margem ideal.</Text>
      </Space>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      <Spin spinning={loading}>
        {/* PARTE SUPERIOR: SELETORES */}
        <Card style={{ marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <Row gutter={24} align="middle">
            <Col xs={24} md={12} style={{ marginBottom: 12 }}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>Representante (Opcional)</Text>
              <Select
                showSearch
                allowClear
                placeholder="Selecione um representante para preencher os custos"
                style={{ width: '100%' }}
                options={reps}
                value={selectedRep}
                onChange={setSelectedRep}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </Col>
            <Col xs={24} md={12} style={{ marginBottom: 12 }}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>Produto / Fórmula</Text>
              <Radio.Group
                value={selectedCalcId}
                onChange={e => setSelectedCalcId(e.target.value)}
                buttonStyle="solid"
              >
                {tabela?.calculos_ativos.map(c => (
                  <Radio.Button key={c.id} value={c.id}>
                    {c.grupo || c.label}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </Col>
          </Row>
        </Card>

        {/* PARTE CENTRAL: VARIÁVEIS */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card
              title={<span style={{ color: '#0958d9' }}>Custos Fixos (Numerador)</span>}
              style={{ height: '100%', borderRadius: 12 }}
            >
              {varsFixais.map(v => {
                const hasFretesExtras = v.campo === 'meta_frete' && repData && (repData.meta_frete_2 || repData.meta_frete_3);
                const isMP = v.campo.startsWith('mp_');

                // Conversão Saco (50kg) <-> Fardo (30kg) p/ MP
                let renda = 0.73;
                if (isMP) {
                  const rp = tabela?.custo_mp?.renda_processo;
                  if (v.campo.includes('parbo') && rp?.parbo) renda = rp.parbo;
                  else if (v.campo.includes('branco') && rp?.branco) renda = rp.branco;
                  else if (v.campo.includes('integral') && rp?.integral) renda = rp.integral;
                }
                const sackValue = isMP ? ((formValues[v.campo] || 0) * renda) / 0.6 : 0;

                const handleSackChange = (sacoVal: number | null) => {
                  const novoFardo = ((sacoVal || 0) * 0.6) / renda;
                  handleValueChange(v.campo, novoFardo);
                };

                return (
                  <div key={v.campo} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text style={{ color: '#555', fontWeight: 500 }}>{v.label}</Text>
                      {hasFretesExtras && (
                        <Space size="small">
                          {repData.meta_frete_2 && <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer', color: '#1677ff' }} onClick={() => handleValueChange(v.campo, Number(repData.meta_frete_2))}>Usar F2 ({fmt(Number(repData.meta_frete_2))})</Text>}
                          {repData.meta_frete_3 && <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer', color: '#1677ff' }} onClick={() => handleValueChange(v.campo, Number(repData.meta_frete_3))}>Usar F3 ({fmt(Number(repData.meta_frete_3))})</Text>}
                        </Space>
                      )}
                    </div>

                    {isMP ? (
                      <Row gutter={8}>
                        <Col span={12}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>
                            Saco 50kg (renda: {(renda * 100).toFixed(1)}%)
                          </Text>
                          <InputNumber
                            prefix="R$"
                            style={{ width: '100%', fontSize: 16 }}
                            value={Number(sackValue.toFixed(4))}
                            onChange={handleSackChange}
                            precision={2}
                            decimalSeparator=","
                            step={1}
                          />
                        </Col>
                        <Col span={12}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Fardo 30kg (Custo Efetivo)</Text>
                          <InputNumber
                            prefix="R$"
                            style={{ width: '100%', fontSize: 16 }}
                            value={formValues[v.campo] || 0}
                            onChange={val => handleValueChange(v.campo, val)}
                            precision={2}
                            decimalSeparator=","
                            step={0.1}
                          />
                        </Col>
                      </Row>
                    ) : (
                      <InputNumber
                        prefix="R$"
                        style={{ width: '100%', fontSize: 16 }}
                        value={formValues[v.campo] || 0}
                        onChange={val => handleValueChange(v.campo, val)}
                        precision={2}
                        decimalSeparator=","
                        step={0.1}
                      />
                    )}
                  </div>
                )
              })}

              {/* Custos Adicionais */}
              <div style={{ marginBottom: 16 }}>
                <Text style={{ color: '#555', fontWeight: 500 }}>Custos Adicionais (Outros)<Tooltip title="Adicione fretes extras, bonificações físicas limitadas ou qualquer outro custo unitário fixo (em R$) ao numerador."> <InfoCircleOutlined /></Tooltip></Text>
                <InputNumber
                  prefix="R$"
                  style={{ width: '100%', fontSize: 16, borderColor: '#d9d9d9' }}
                  value={custoAdicional || 0}
                  onChange={val => { setCustoAdicional(val || 0); setManualFinalPrice(null); }}
                  precision={2}
                  decimalSeparator=","
                  step={0.5}
                />
              </div>

              <Divider />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong>Subtotal Fixos (=)</Text>
                <Text strong style={{ fontSize: 18, color: '#0958d9' }}>{fmt(somaFixos, 'moeda')}</Text>
              </div>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card
              title={<span style={{ color: '#d4380d' }}>Deduções (Denominador)</span>}
              style={{ height: '100%', borderRadius: 12 }}
            >
              {varsPcts.map(v => {
                const isMargem = v.campo === margemKey;
                return (
                  <div key={v.campo} style={{ marginBottom: 16 }}>
                    <Text style={{ color: '#555', fontWeight: 500 }}>
                      {v.label} {isMargem && <span style={{ color: '#1677ff', fontSize: 13 }}>(Calculado automaticamente) <SwapOutlined /></span>}
                    </Text>
                    <InputNumber
                      addonAfter="%"
                      style={{ width: '100%', fontSize: 16 }}
                      value={Number(((formValues[v.campo] || 0) * 100).toFixed(2))}
                      onChange={val => handleValueChange(v.campo, (val || 0) / 100)}
                      precision={2}
                      decimalSeparator=","
                      step={1}
                      status={isMargem && manualFinalPrice ? 'warning' : ''}
                    />
                  </div>
                )
              })}

              <Divider />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong>Subtotal Deduções</Text>
                <Text strong type="danger" style={{ fontSize: 16 }}>{fmt(somaPcts, 'percentual')}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <Text strong>Divisor Geral (1 - deduções) (=)</Text>
                <Text strong style={{ fontSize: 18, color: '#d4380d' }}>{divisor.toLocaleString('pt-BR', {minimumFractionDigits: 4, maximumFractionDigits: 4})}</Text>
              </div>
            </Card>
          </Col>
        </Row>

        {/* PARTE INFERIOR: CALCULO FINAL */}
        <Card style={{ marginTop: 16, borderRadius: 12, backgroundColor: '#f6ffed', borderColor: '#b7eb8f', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Title level={4} style={{ color: '#389e0d', marginTop: 0 }}>Preço Final por Fardo</Title>
            <InputNumber
              prefix="R$"
              size="large"
              style={{
                width: 250,
                fontSize: 32,
                fontWeight: 600,
                color: '#237804',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
              value={Number(finalPrice.toFixed(2))}
              onChange={handleFinalPriceChange}
              precision={2}
              decimalSeparator=","
              step={1.0}
            />
            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 14 }}>
                <InfoCircleOutlined /> Altere este valor para deduzir qual seria a <strong style={{color: '#1677ff'}}>Margem</strong> resultante da operação.
              </Text>
            </div>

            {!manualFinalPrice && (
              <div style={{ marginTop: 16, borderTop: '1px dashed #b7eb8f', paddingTop: 16, maxWidth: 400, margin: '16px auto 0' }}>
                <Text strong style={{ color: '#52c41a' }}>Prova Real:</Text><br/>
                <Text type="secondary">
                  {fmt(somaFixos, 'moeda')} ÷ {divisor.toLocaleString('pt-BR', {minimumFractionDigits: 4, maximumFractionDigits: 4})} = {fmt(finalPrice, 'moeda')}
                </Text>
              </div>
            )}
          </div>
        </Card>
      </Spin>
    </div>
  )
}
