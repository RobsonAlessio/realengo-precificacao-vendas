# Plano de Melhorias Mobile — Precificação

## 1. Fix SimulatorPage — Scroll no Mobile

**Problema:** Os cards "Custos Fixos" e "Deduções" usam `flex: 1` + `overflow: auto` internamente, o que em mobile cria scrollbars internas em vez de fluir com a página.

### Arquivo: `frontend/src/pages/simulator/SimulatorPage.tsx`

#### Mudança 1 — Coluna esquerda (linha ~431)
```diff
- <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, overflow: 'hidden' }}>
+ <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, overflow: isMobile ? 'visible' : 'hidden' }}>
```

#### Mudança 2 — Card Custos Fixos outer (linha ~434)
```diff
- <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
+ <div style={{ ...card, flex: isMobile ? 'none' : 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
```

#### Mudança 3 — Card Custos Fixos inner content (linha ~436)
```diff
- <div style={{ padding: '10px 14px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
+ <div style={{ padding: '10px 14px', flex: isMobile ? 'none' : 1, display: 'flex', flexDirection: 'column', overflow: isMobile ? 'visible' : 'auto' }}>
```

#### Mudança 4 — Card Deduções outer (linha ~548)
```diff
- <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
+ <div style={{ ...card, flex: isMobile ? 'none' : 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
```

#### Mudança 5 — Card Deduções inner content (linha ~550)
```diff
- <div style={{ padding: '10px 14px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
+ <div style={{ padding: '10px 14px', flex: isMobile ? 'none' : 1, display: 'flex', flexDirection: 'column', overflow: isMobile ? 'visible' : 'auto' }}>
```

#### Mudança 6 — Coluna direita (linha ~646)
```diff
- <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, overflow: 'hidden' }}>
+ <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, overflow: isMobile ? 'visible' : 'hidden' }}>
```

#### Mudança 7 — Container principal do simulador (linha ~393)
```diff
- <div style={{ ...baseFont, flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
+ <div style={{ ...baseFont, flex: 1, width: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', overflow: isMobile ? 'visible' : 'hidden' }}>
```

---

## 2. Badges Colapsáveis no PricesPage (Mobile)

**Problema:** Os badges de referência (MP, Custos prod., Renda, Impostos) ocupam muito espaço vertical em mobile.

### Arquivo: `frontend/src/pages/prices/PricesPage.tsx`

#### Mudança 1 — Adicionar state para controlar expansão dos badges
Após a linha com `const isMobile = useIsMobile()` (linha ~396), adicionar:
```tsx
const [badgesExpanded, setBadgesExpanded] = useState(false)
```

#### Mudança 2 — Reescrever a seção de badges (linhas 450-485)
Substituir o bloco `<div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: isMobile ? 0 : 40 }}>` por:

**No mobile (recolhido):** Mostra apenas o badge de mês + botão "Detalhes ▾"
**No mobile (expandido):** Mostra todos os badges + botão "Fechar ▴"
**No desktop:** Mostra tudo, sem toggle (comportamento atual idêntico)

```tsx
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
        background: 'rgba(100,116,139,0.08)',
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
```

---

## 3. Card View para Tabela de Preços (Mobile)

**Problema:** A `<Table>` com `scroll: { x: 'max-content' }` exige scroll horizontal em mobile, difícil de ler.

### Arquivo: `frontend/src/pages/prices/PricesPage.tsx`

### Estratégia

Quando `isMobile` for true, renderizar cards em vez da `<Table>`. Cada card = 1 representante (linha da tabela).

**Visualização do card mobile:**

```
┌──────────────────────────────────────────┐
│ 123 - Representante Alpha                │
│                                          │
│  ■ Parbo                                │
│    ├ MP Parbo      R$ 45,00             │
│    ├ Embalagem     R$ 2,50              │
│    ├ Energia       R$ 1,80              │
│    ├ Frete         R$ 5,00              │
│    ├ Comissão      5,00%                │
│    ├ Imposto       12,00%               │
│    ├ Margem         8,00%               │
│    ─────────────────────────             │
│    Preço F1  R$ 82,50 ⓘ                │
│    Preço F2  R$ 81,00 ⓘ                │
│                                          │
│  ■ Branco                                │
│    ├ MP Branco     R$ 38,00             │
│    ...                                   │
│    ─────────────────────────             │
│    Preço F1  R$ 72,30 ⓘ                │
└──────────────────────────────────────────┘
```

Os custos detalhados podem ser expandidos (accordion) ou mostrados diretamente.
Como o foco é preço, a versão simplificada mostra APENAS os preços calculados por grupo:

```
┌──────────────────────────────────────────┐
│ 123 - Representante Alpha                │
│                                          │
│  ■ Parbo                                │
│    Frete 1   R$ 82,50 ⓘ                │
│    Frete 2   R$ 81,00 ⓘ                │
│                                          │
│  ■ Branco                                │
│    Frete 1   R$ 72,30 ⓘ                │
└──────────────────────────────────────────┘
```

### Implementação Detalhada

Adicionar uma função auxiliar `renderMobileCards` e um componente `MobilePriceCard`.

```tsx
function MobilePriceCard({ row, calcAtivos, tabela, fonte, rendaRealizado, mpSc }: {
  row: Record<string, unknown>
  calcAtivos: CalcDef[]
  tabela: TabelaResponse
  fonte: FonteConfig
  rendaRealizado: { parbo: number; branco: number } | null
  mpSc: { parbo: number | null; branco: number | null } | null
}) {
  // Agrupa cálculos por grupo
  const calcGrupos: Record<string, CalcDef[]> = {}
  for (const c of calcAtivos) {
    const g = c.grupo ?? '_calc'
    if (!calcGrupos[g]) calcGrupos[g] = []
    calcGrupos[g].push(c)
  }

  const hasF2 = tabela.dados?.some(r => r['meta_frete_2'] != null) ?? false
  const hasF3 = tabela.dados?.some(r => r['meta_frete_3'] != null) ?? false

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
      {/* Header com nome do representante */}
      <div style={{
        padding: '12px 14px 8px',
        borderBottom: '1px solid #f1f5f9',
      }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
          {repName}
        </span>
      </div>

      {/* Grupos de preço */}
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
              textTransform: 'uppercase',
            }}>
              {grupo}
            </div>
            <div style={{ padding: '8px 14px' }}>
              {calcs.map(calc => {
                const freteCols: { label: string; key: string; metaKey: string | null }[] = [
                  { label: 'Frete 1', key: calc.id, metaKey: null },
                ]
                if (hasF2) freteCols.push({ label: 'Frete 2', key: calc.id + '_f2', metaKey: 'meta_frete_2' })
                if (hasF3) freteCols.push({ label: 'Frete 3', key: calc.id + '_f3', metaKey: 'meta_frete_3' })
                return (
                  <div key={calc.id} style={{ marginBottom: 4 }}>
                    {freteCols.map(fc => {
                      const val = row[fc.key]
                      if (val == null) return null
                      const rec = fc.metaKey ? { ...row, meta_frete: row[fc.metaKey] } : row
                      // Reutiliza o Popover do desktop
                      const content = renderMobilePopover(calc, rec, val, grupo, gs?.calcColor)
                      return (
                        <div key={fc.key} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '3px 0',
                        }}>
                          <span style={{ fontSize: 13, color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
                            {calc.label} — {fc.label}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 14, color: gs?.calcColor ?? '#27ae60', fontVariantNumeric: 'tabular-nums' }}>
                              {fmt(val, calc.formato)}
                            </span>
                            {content && (
                              <Popover content={content} title={`${grupo ?? calc.label} — ${fc.label}`} trigger="click">
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
```

**Nota importante:** A função `renderMobilePopover` reutiliza a lógica de `renderPopover` que já existe em `buildColumns` (linhas 271-331). Para evitar duplicação, extrair essa lógica para uma função compartilhada, ou reutilizá-la diretamente.

### Alteração na renderização (linha ~583-593)

Substituir:
```tsx
<Table
  className="price-table"
  columns={columns}
  dataSource={transformedData}
  rowKey="representante"
  size="middle"
  pagination={false}
  bordered
  scroll={{ x: 'max-content', y: isMobile ? 'calc(100vh - 220px)' : 'calc(100vh - 290px)' }}
  locale={{ emptyText: loading ? 'Carregando...' : 'Nenhum dado encontrado' }}
/>
```

Por:
```tsx
{isMobile ? (
  <div style={{ overflow: 'visible' }}>
    {transformedData.map(row => (
      <MobilePriceCard
        key={String(row['representante'])}
        row={row}
        calcAtivos={tabela?.calculos_ativos ?? []}
        tabela={tabela!}
        fonte={fonte}
        rendaRealizado={rendaRealizado}
        mpSc={mpSc}
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
    scroll={{ x: 'max-content', y: 'calc(100vh - 290px)' }}
    locale={{ emptyText: loading ? 'Carregando...' : 'Nenhum dado encontrado' }}
  />
)}
```

### Import necessário
Adicionar `Popover` aos imports de `antd` (já está importado).

---

## Notas Finais

- **Desktop permanece 100% inalterado** — Todas as mudanças usam `isMobile` como condição
- **Card view é incremental** — Se necessário, pode-se expandir para incluir custos detalhados no futuro
- **A função `renderPopover` em `buildColumns`** (linhas 271-331) precisa ser extraída para fora de `buildColumns` para ser reutilizada no card mobile, ou duplicada como `renderMobilePopover`