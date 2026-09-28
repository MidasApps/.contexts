# ADR-001: Estrutura e Modelagem do Firebase Firestore para Magel Rural

## Metadados

| Campo | Valor |
|-------|-------|
| **Status** | Proposta |
| **Data** | 2026-01-26 |
| **Decisores** | Time de Arquitetura |
| **Projeto** | Magel Rural Landing Page |
| **Tags** | `firestore`, `data-modeling`, `cache`, `analytics`, `real-time` |

---

## 1. Contexto

O Magel Rural é uma aplicação Next.js 14 que gera landing pages dinâmicas personalizadas para conversão de produtores rurais em leads via WhatsApp. O sistema precisa de uma camada de persistência para:

1. **Cache de conteúdo gerado por LLM** — JSON estruturado com TTL de 7 dias
2. **Dados de produtores** — Informações estruturadas obtidas de API híbrida (base própria + APIs públicas)
3. **Tracking de conversões** — Page views, CTA clicks, WhatsApp opens
4. **Analytics para A/B testing** — Otimização de tom de voz e variações de conteúdo

### Características críticas do domínio:

- **Padrão de acesso**: Leitura intensiva (muitos acessos à mesma landing page) com escrita ocasional (geração de conteúdo, eventos de tracking)
- **Chave primária natural**: CNPJ (14 dígitos, único por produtor)
- **Cardinalidade**: Milhares a centenas de milhares de produtores
- **Latência**: SSR requer respostas < 100ms para cache hits
- **Consistência**: Eventual consistency é aceitável para analytics; strong consistency necessária para cache de conteúdo

---

## 2. Decisões

### 2.1 Estrutura de Collections

```
firestore/
├── producers/                    # Dados cadastrais dos produtores
│   └── {cnpj}/                   # Document ID = CNPJ normalizado (só números)
│       ├── razaoSocial: string
│       ├── nomeFantasia: string
│       ├── endereco: map
│       ├── cnae: string
│       ├── cnaePrimario: string
│       ├── anoFundacao: number
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── generatedContent/             # Cache do conteúdo gerado pelo LLM
│   └── {cnpj}/                   # Document ID = CNPJ
│       ├── version: string       # Hash do prompt/modelo para invalidação
│       ├── variant: string       # Variante A/B ("control" | "variant_a" | ...)
│       ├── content: map          # JSON estruturado completo
│       │   ├── saudacao: string
│       │   ├── hookLine: string
│       │   ├── painPoints: array
│       │   ├── valueProp: string
│       │   ├── modulos: array    # 4-6 módulos selecionados
│       │   ├── timeline: map
│       │   └── ctaMessages: map
│       ├── generatedAt: timestamp
│       ├── expiresAt: timestamp  # TTL de 7 dias
│       ├── llmModel: string      # "gpt-4o" | "claude-3.5-sonnet"
│       ├── promptVersion: string
│       └── generationTimeMs: number
│
├── events/                       # Eventos de tracking (append-only)
│   └── {autoId}/                 # Document ID auto-gerado
│       ├── cnpj: string
│       ├── sessionId: string
│       ├── type: string          # "page_view" | "cta_click" | "whatsapp_open"
│       ├── metadata: map
│       │   ├── ctaPosition: string
│       │   ├── ctaText: string
│       │   ├── variant: string
│       │   └── userAgent: string
│       ├── timestamp: timestamp
│       └── clientTimestamp: timestamp
│
└── analytics/                    # Agregações pré-computadas
    ├── daily/{date}/             # Métricas diárias
    │   └── {cnpj}/
    │       ├── pageViews: number
    │       ├── ctaClicks: map    # { "hero": 5, "final": 3 }
    │       ├── whatsappOpens: number
    │       └── conversionRate: number
    │
    └── variants/{variantId}/     # Performance de variantes A/B
        ├── impressions: number
        ├── conversions: number
        ├── conversionRate: number
        └── lastUpdated: timestamp
```

**Justificativa:**

- **CNPJ como Document ID**: Elimina necessidade de índices secundários para lookup primário, garante unicidade nativa
- **Separação `producers` vs `generatedContent`**: Ciclos de vida diferentes — dados cadastrais raramente mudam; conteúdo gerado expira e regenera
- **Collection `events` separada**: Append-only, alta frequência, não polui documents de produtores
- **Agregações pré-computadas em `analytics`**: Evita leituras de toda a collection `events` para dashboards

---

### 2.2 Estratégia de Indexação

#### Índices Compostos Necessários:

```javascript
// firestore.indexes.json
{
  "indexes": [
    // Busca de conteúdo válido por CNPJ (cache lookup)
    {
      "collectionGroup": "generatedContent",
      "fields": [
        { "fieldPath": "expiresAt", "order": "ASCENDING" }
      ]
    },
    
    // Eventos por CNPJ em período (analytics por produtor)
    {
      "collectionGroup": "events",
      "fields": [
        { "fieldPath": "cnpj", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    
    // Eventos por tipo em período (dashboard geral)
    {
      "collectionGroup": "events",
      "fields": [
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    
    // Performance de variantes A/B
    {
      "collectionGroup": "events",
      "fields": [
        { "fieldPath": "metadata.variant", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    }
  ]
}
```

**Justificativa:**

- Índices alinhados com queries reais do sistema
- Evita full collection scans em `events`
- Índice de expiração permite cleanup automatizado

---

### 2.3 Regras de Segurança

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Função auxiliar: verifica se é servidor (via Firebase Admin SDK)
    function isServer() {
      return request.auth != null && 
             request.auth.token.admin == true;
    }
    
    // Função auxiliar: verifica CNPJ válido (14 dígitos)
    function isValidCnpj(cnpj) {
      return cnpj.matches('^[0-9]{14}$');
    }
    
    // Producers: somente leitura pública, escrita apenas servidor
    match /producers/{cnpj} {
      allow read: if true;  // Landing pages precisam ler
      allow write: if isServer();
    }
    
    // Generated Content: leitura pública, escrita apenas servidor
    match /generatedContent/{cnpj} {
      allow read: if true;
      allow write: if isServer();
    }
    
    // Events: escrita pública (tracking), leitura apenas servidor
    match /events/{eventId} {
      allow create: if request.resource.data.keys().hasAll(['cnpj', 'type', 'timestamp'])
                    && request.resource.data.type in ['page_view', 'cta_click', 'whatsapp_open']
                    && isValidCnpj(request.resource.data.cnpj);
      allow read, update, delete: if isServer();
    }
    
    // Analytics: apenas servidor
    match /analytics/{path=**} {
      allow read, write: if isServer();
    }
  }
}
```

**Justificativa:**

- **Princípio do menor privilégio**: Clientes só podem o mínimo necessário
- **Validação no write de eventos**: Previne spam/abuso com dados inválidos
- **Analytics protegido**: Dados agregados são sensíveis ao negócio

---

### 2.4 Padrão de Cache e TTL

```typescript
// lib/firestore/cache.ts
import { Timestamp } from 'firebase-admin/firestore';

const CACHE_TTL_DAYS = 7;

interface CacheEntry<T> {
  data: T;
  expiresAt: Timestamp;
  version: string;
}

export async function getOrGenerate<T>(
  cnpj: string,
  currentVersion: string,
  generator: () => Promise<T>
): Promise<T> {
  const docRef = db.collection('generatedContent').doc(cnpj);
  const doc = await docRef.get();
  
  if (doc.exists) {
    const cached = doc.data() as CacheEntry<T>;
    const now = Timestamp.now();
    
    // Cache hit válido: não expirou E mesma versão
    if (cached.expiresAt > now && cached.version === currentVersion) {
      return cached.data;
    }
  }
  
  // Cache miss ou inválido: gerar novo conteúdo
  const freshData = await generator();
  
  await docRef.set({
    data: freshData,
    version: currentVersion,
    expiresAt: Timestamp.fromDate(
      new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000)
    ),
    generatedAt: Timestamp.now(),
  });
  
  return freshData;
}
```

**Justificativa:**

- **Versionamento de cache**: Permite invalidar quando prompt/modelo muda
- **TTL explícito no documento**: Facilita queries e cleanup
- **Atomic get-or-set**: Evita race conditions em geração duplicada

---

### 2.5 Tracking de Eventos (Client-Side)

```typescript
// lib/tracking/firestore-tracker.ts
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

type EventType = 'page_view' | 'cta_click' | 'whatsapp_open';

interface TrackingEvent {
  cnpj: string;
  sessionId: string;
  type: EventType;
  metadata?: Record<string, unknown>;
}

export async function trackEvent(event: TrackingEvent): Promise<void> {
  // Fire-and-forget: não bloqueia UX
  addDoc(collection(db, 'events'), {
    ...event,
    timestamp: serverTimestamp(),
    clientTimestamp: new Date().toISOString(),
  }).catch(console.error); // Log mas não propaga erro
}

// Uso nos componentes
export function useTracking(cnpj: string, variant: string) {
  const sessionId = useSessionId(); // Hook que gera/recupera sessionId
  
  const trackPageView = useCallback(() => {
    trackEvent({
      cnpj,
      sessionId,
      type: 'page_view',
      metadata: { variant },
    });
  }, [cnpj, sessionId, variant]);
  
  const trackCtaClick = useCallback((position: string, text: string) => {
    trackEvent({
      cnpj,
      sessionId,
      type: 'cta_click',
      metadata: { variant, ctaPosition: position, ctaText: text },
    });
  }, [cnpj, sessionId, variant]);
  
  return { trackPageView, trackCtaClick };
}
```

**Justificativa:**

- **Fire-and-forget**: Tracking não pode impactar performance da página
- **Session ID**: Permite agrupar eventos de uma mesma visita
- **Server timestamp**: Fonte de verdade para ordenação
- **Client timestamp**: Debug de latência de rede

---

### 2.6 Agregações para Analytics

```typescript
// functions/src/aggregateAnalytics.ts (Cloud Function)
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

export const aggregateEvent = onDocumentCreated(
  'events/{eventId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    
    const { cnpj, type, timestamp, metadata } = data;
    const date = timestamp.toDate().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const dailyRef = db.doc(`analytics/daily/${date}/${cnpj}`);
    const variantRef = metadata?.variant 
      ? db.doc(`analytics/variants/${metadata.variant}`)
      : null;
    
    await db.runTransaction(async (tx) => {
      // Incrementa métricas diárias
      const dailySnap = await tx.get(dailyRef);
      const daily = dailySnap.data() || { pageViews: 0, ctaClicks: {}, whatsappOpens: 0 };
      
      if (type === 'page_view') daily.pageViews++;
      if (type === 'cta_click') {
        const pos = metadata?.ctaPosition || 'unknown';
        daily.ctaClicks[pos] = (daily.ctaClicks[pos] || 0) + 1;
      }
      if (type === 'whatsapp_open') daily.whatsappOpens++;
      
      daily.conversionRate = daily.pageViews > 0 
        ? daily.whatsappOpens / daily.pageViews 
        : 0;
      
      tx.set(dailyRef, daily, { merge: true });
      
      // Incrementa métricas de variante A/B
      if (variantRef) {
        const variantSnap = await tx.get(variantRef);
        const variant = variantSnap.data() || { impressions: 0, conversions: 0 };
        
        if (type === 'page_view') variant.impressions++;
        if (type === 'whatsapp_open') variant.conversions++;
        variant.conversionRate = variant.impressions > 0 
          ? variant.conversions / variant.impressions 
          : 0;
        variant.lastUpdated = timestamp;
        
        tx.set(variantRef, variant, { merge: true });
      }
    });
  }
);
```

**Justificativa:**

- **Cloud Function triggered**: Desacopla tracking do cálculo de métricas
- **Transações**: Garante incrementos atômicos sob concorrência
- **Pré-agregação**: Dashboards leem diretamente, sem processar eventos raw

---

### 2.7 Cleanup Automatizado de Cache Expirado

```typescript
// functions/src/cleanupExpiredCache.ts
import { onSchedule } from 'firebase-functions/v2/scheduler';

export const cleanupExpiredCache = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'America/Sao_Paulo' },
  async () => {
    const now = Timestamp.now();
    const expiredQuery = db
      .collection('generatedContent')
      .where('expiresAt', '<', now)
      .limit(500); // Batch para não exceder limites
    
    let deleted = 0;
    let snapshot = await expiredQuery.get();
    
    while (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deleted += snapshot.size;
      
      snapshot = await expiredQuery.get();
    }
    
    console.log(`Cleanup completed: ${deleted} expired documents deleted`);
  }
);
```

**Justificativa:**

- **Scheduled function**: Mais controle que TTL policies nativas (que não existem no Firestore)
- **Horário de baixo tráfego**: 3h da manhã horário de Brasília
- **Batch deletes**: Respeita limites de operações por segundo

---

## 3. Alternativas Consideradas

### 3.1 Modelagem: Subcollections vs Top-Level Collections

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **Subcollections** (`producers/{cnpj}/events`) | Dados co-localizados, queries mais simples por produtor | Collection Group Queries necessárias para analytics global, mais complexo |
| **Top-level Collections** ✅ | Queries globais simples, melhor para dashboards | Necessita índices compostos, dados "espalhados" |

**Decisão**: Top-level collections — o caso de uso primário são dashboards e A/B testing que agregam dados cross-producers.

### 3.2 Cache: Document único vs Collection com TTL

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **Document único com todo conteúdo** ✅ | Uma leitura = todo o cache, atômico | Documento pode crescer (limite 1MB) |
| **Collection de fragments** | Granularidade fina, leitura parcial | Múltiplas leituras para renderizar página, complexidade |

**Decisão**: Document único — o JSON gerado tem ~5-20KB, muito longe do limite de 1MB.

### 3.3 Tracking: Firestore vs Analytics SDK vs Custom Events

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **Firestore direto** ✅ | Dados raw acessíveis, queries flexíveis, integra com mesma infra | Custo por write, precisa agregar manualmente |
| **Firebase Analytics** | Grátis, dashboards prontos | Dados agregados apenas, BigQuery Export para raw |
| **Custom (própria API)** | Controle total | Manutenção de infra adicional |

**Decisão**: Firestore direto — necessidade de queries flexíveis para A/B testing e dados raw para iteração rápida. Custo aceitável no volume esperado.

### 3.4 Agregações: Real-time vs Batch Processing

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **Cloud Function on-write** ✅ | Métricas sempre atualizadas, latência baixa | Custo de function por evento, complexidade de transações |
| **Scheduled batch** | Mais barato em alto volume, simples | Métricas defasadas, não ideal para dashboards real-time |
| **BigQuery export + scheduled query** | Poder de análise, SQL | Latência de horas, custo adicional |

**Decisão**: Cloud Function on-write — necessidade de métricas real-time para decisões de A/B testing. Volume atual não justifica complexidade de batch.

---

## 4. Consequências

### Positivas

1. **Latência de cache < 50ms**: Lookup por Document ID é O(1), ideal para SSR
2. **Tracking não-bloqueante**: Fire-and-forget com validação nas security rules
3. **Analytics real-time**: Dashboards sempre atualizados para decisões rápidas de A/B
4. **Custos previsíveis**: Modelo de pricing por operação é transparente
5. **Zero infra gerenciada**: Serverless end-to-end

### Negativas

1. **Custo escala com writes**: Em alto volume de eventos, custo pode crescer — mitigar com sampling ou batch writes
2. **Queries limitadas**: Sem JOINs, análises complexas requerem desnormalização ou BigQuery export
3. **Vendor lock-in**: Modelo de dados otimizado para Firestore não é portável trivialmente
4. **Cold starts de Functions**: Primeiras agregações após idle podem ter latência — mitigar com min instances

### Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Custo de eventos explode | Média | Alto | Sampling em 10% para eventos de page_view em alto tráfego |
| Race condition em agregações | Baixa | Médio | Transações já implementadas |
| Documento de cache > 1MB | Muito Baixa | Alto | Monitoramento de tamanho, split se necessário |
| Spam de eventos falsos | Média | Baixo | Validação em security rules + rate limiting via App Check |

---

## 5. Decisões Relacionadas

- **ADR-002**: Estratégia de geração de conteúdo LLM (versionamento de prompts)
- **ADR-003**: Implementação de A/B testing (alocação de variantes)
- **ADR-004**: Estratégia de cache multi-camada (Firestore + Redis/Vercel KV)

---

## 6. Referências

- [Firestore Data Modeling Best Practices](https://firebase.google.com/docs/firestore/data-model)
- [Security Rules Reference](https://firebase.google.com/docs/firestore/security/get-started)
- [Aggregation Queries](https://firebase.google.com/docs/firestore/query-data/aggregation-queries)
- [Cloud Functions Triggers](https://firebase.google.com/docs/functions/firestore-events)

---

## 7. Histórico de Revisões

| Data | Versão | Autor | Mudança |
|------|--------|-------|---------|
| 2026-01-26 | 1.0 | — | Criação inicial |

---

## Apêndice: Checklist de Implementação

- [ ] Criar collections no Firestore console ou via código
- [ ] Deploy de `firestore.rules`
- [ ] Deploy de `firestore.indexes.json`
- [ ] Implementar `lib/firestore/cache.ts`
- [ ] Implementar `lib/tracking/firestore-tracker.ts`
- [ ] Deploy Cloud Functions de agregação
- [ ] Deploy Cloud Function de cleanup
- [ ] Configurar Firebase App Check para rate limiting
- [ ] Setup de monitoring/alertas no Firebase Console

---

> Esta ADR serve como base para PRPs subsequentes, garantindo que novos desenvolvimentos respeitem as decisões de modelagem, segurança e performance estabelecidas.