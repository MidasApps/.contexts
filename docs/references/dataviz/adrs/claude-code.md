# Guia completo de configuração do Claude Code CLI

**O Claude Code possui um sistema de configuração hierárquico com 5 escopos de prioridade, mais de 50 chaves em `settings.json`, 84+ variáveis de ambiente, e uma arquitetura extensível baseada em arquivos Markdown para rules, skills, agents e output styles.** Este levantamento cobre todas as opções documentadas oficialmente pela Anthropic, organizadas por área funcional. O sistema foi projetado para escalar desde uso individual até deployments enterprise com políticas gerenciadas centralmente.

---

## 1. Estrutura completa de pastas e arquivos

O Claude Code organiza seus arquivos em três níveis: projeto (compartilhado via git), local (pessoal, gitignored) e usuário (global). Abaixo está o mapa completo de todos os arquivos e diretórios reconhecidos.

**Nível de projeto (raiz do repositório):**

```
projeto/
├── CLAUDE.md                        # Instruções do projeto (commitado no git)
├── CLAUDE.local.md                  # Instruções pessoais do projeto (gitignored)
├── .mcp.json                        # Servidores MCP compartilhados (commitado)
├── .claude/
│   ├── CLAUDE.md                    # Alternativa ao CLAUDE.md na raiz
│   ├── settings.json                # Configurações do projeto (compartilhado)
│   ├── settings.local.json          # Configurações locais pessoais (gitignored)
│   ├── rules/                       # Regras modulares condicionais
│   │   ├── code-style.md
│   │   ├── testing.md
│   │   └── frontend/
│   │       └── react.md
│   ├── agents/                      # Subagentes personalizados
│   │   └── code-reviewer.md
│   ├── skills/                      # Skills (substitui commands/)
│   │   └── deploy/
│   │       ├── SKILL.md
│   │       └── scripts/deploy.sh
│   ├── commands/                    # Slash commands (legado, ainda funcional)
│   │   └── review.md
│   └── output-styles/               # Estilos de output personalizados
│       └── meu-estilo.md
├── subpasta/
│   └── CLAUDE.md                    # Instruções de subdiretório (lazy loading)
```

**Nível de usuário (home):**

```
~/.claude/
├── CLAUDE.md                        # Instruções globais para todos os projetos
├── settings.json                    # Configurações globais do usuário
├── commands/                        # Slash commands globais
├── agents/                          # Subagentes globais
├── skills/                          # Skills globais
├── output-styles/                   # Estilos de output globais
└── projects/<projeto>/memory/       # Auto-memory por projeto
    ├── MEMORY.md                    # Índice (200 primeiras linhas carregadas)
    └── api-conventions.md           # Notas por tópico (sob demanda)

~/.claude.json                       # Preferências, OAuth, MCP servers pessoais
```

**Nível gerenciado (enterprise):**

| SO | Caminho |
|---|---|
| macOS | `/Library/Application Support/ClaudeCode/` |
| Linux/WSL | `/etc/claude-code/` |
| Windows | `C:\Program Files\ClaudeCode\` |

Dois arquivos: `managed-settings.json` e `managed-mcp.json`.

**Entradas recomendadas para `.gitignore`:**

```gitignore
# Claude Code - pessoal (NÃO commitar)
.claude/settings.local.json
CLAUDE.local.md

# Claude Code - compartilhado (commitar)
# .claude/settings.json
# .claude/commands/
# .claude/agents/
# .claude/skills/
# .claude/rules/
# CLAUDE.md
# .mcp.json
```

---

## 2. Hierarquia de 5 escopos do settings.json

O sistema de configuração segue uma hierarquia rígida onde **escopos superiores sempre vencem os inferiores**. Para permissões, a avaliação segue: Deny → Ask → Allow, e o primeiro match vence.

| Prioridade | Escopo | Localização | Quem afeta |
|---|---|---|---|
| 1 (maior) | **Managed** | Diretórios do sistema | Todos os usuários da máquina |
| 2 | **CLI flags** | Argumentos de linha de comando | Sessão atual |
| 3 | **Local** | `.claude/settings.local.json` | Você, neste projeto |
| 4 | **Project** | `.claude/settings.json` | Todos os colaboradores |
| 5 (menor) | **User** | `~/.claude/settings.json` | Você, todos os projetos |

Arrays de permissões fazem **merge** entre escopos (concatenados e deduplicados). Para chaves escalares, o escopo de maior prioridade vence. Todos os arquivos `settings.json` suportam autocompletion via `"$schema": "https://json.schemastore.org/claude-code-settings.json"`.

### Chaves gerais do settings.json

| Chave | Descrição | Default | Exemplo |
|---|---|---|---|
| `model` | Override do modelo padrão | (sistema) | `"claude-sonnet-4-5-20250929"` |
| `language` | Idioma preferido das respostas | English | `"portuguese"` |
| `outputStyle` | Estilo de output ativo | (nenhum) | `"Explanatory"` |
| `cleanupPeriodDays` | Dias para deletar sessões inativas | `30` | `20` |
| `autoUpdatesChannel` | Canal: `"stable"` ou `"latest"` | `"latest"` | `"stable"` |
| `showTurnDuration` | Exibir tempo de resposta | `true` | `false` |
| `alwaysThinkingEnabled` | Extended thinking por padrão | `false` | `true` |
| `plansDirectory` | Onde armazenar planos | `~/.claude/plans` | `"./plans"` |
| `respectGitignore` | File picker respeita .gitignore | `true` | `false` |
| `autoMemoryEnabled` | Toggle auto memory | `true` | `false` |
| `companyAnnouncements` | Mensagens exibidas no startup | (nenhum) | `["Leia docs.acme.com"]` |
| `spinnerVerbs` | Personalizar texto do spinner | (padrão) | `{"mode":"append","verbs":["Pensando"]}` |

### Bloco de permissões

```json
{
  "permissions": {
    "allow": ["Bash(npm run lint)", "Read(~/.zshrc)"],
    "ask": ["Bash(git push *)"],
    "deny": ["WebFetch", "Bash(curl *)", "Read(./.env)"],
    "additionalDirectories": ["../docs/", "../shared/"],
    "defaultMode": "acceptEdits",
    "disableBypassPermissionsMode": "disable"
  }
}
```

**Sintaxe de regras de permissão:** `Bash(npm run *)` usa glob matching. `**` para recursivo, `*` para nível único. Regras suportadas: `Bash`, `Read`, `Edit`, `Write`, `Update`, `WebFetch`, `WebFetch(domain:example.com)`, `MCP(server:tool)`, `Skill(name)`, `Agent(name)`.

### Bloco de sandbox

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["git", "docker"],
    "allowUnsandboxedCommands": false,
    "network": {
      "allowedDomains": ["github.com", "*.npmjs.org"],
      "allowUnixSockets": ["~/.ssh/agent-socket"],
      "allowLocalBinding": false
    }
  }
}
```

Sandbox usa **Seatbelt** no macOS e **bubblewrap** no Linux/WSL2.

### Outros blocos de configuração

**Attribution** (controla Co-Authored-By em commits):
```json
{
  "attribution": {
    "commit": "Generated with Claude Code...",
    "pr": ""
  }
}
```

**Plugins:**
```json
{
  "enabledPlugins": {"formatter@acme-tools": true},
  "extraKnownMarketplaces": {"acme-tools": {"source": "github", "repo": "acme-corp/plugins"}}
}
```

**MCP server toggles:**
```json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["memory", "github"],
  "disabledMcpjsonServers": ["filesystem"]
}
```

**Env vars persistentes no settings:**
```json
{
  "env": {
    "ANTHROPIC_MODEL": "claude-sonnet-4-5-20250929",
    "CLAUDE_CODE_USE_BEDROCK": "1"
  }
}
```

---

## 3. CLAUDE.md — sistema de memória e boas práticas

O CLAUDE.md é carregado no contexto do Claude no **início de cada sessão** como parte do system prompt. Ele sobrevive ao `/compact` (é relido do disco após compactação). Funciona como um guia de onboarding para o Claude sobre seu projeto.

### Ordem de carregamento

1. `~/.claude/CLAUDE.md` — preferências globais do usuário
2. Arquivos CLAUDE.md **ancestrais** — caminhando para cima do CWD até a raiz
3. `./CLAUDE.md` ou `.claude/CLAUDE.md` — nível de projeto
4. `./CLAUDE.local.md` — notas pessoais do projeto (gitignored)
5. `.claude/rules/*.md` — regras modulares (carregadas condicionalmente via frontmatter `paths:`)

**Subdiretórios** possuem carregamento **lazy** — o CLAUDE.md de uma subpasta só é carregado quando o Claude lê arquivos naquele diretório. CLAUDE.md pode importar outros arquivos usando a sintaxe `@path/to/file`:

```markdown
Veja @README para visão geral e @package.json para comandos npm disponíveis.
Siga as instruções de git em @docs/git-instructions.md
```

### Boas práticas de conteúdo

**Tamanho recomendado: até 200 linhas por arquivo.** Pesquisas indicam que LLMs de fronteira seguem consistentemente ~150-200 instruções; o system prompt do Claude Code já consome ~50. Arquivos mais longos reduzem a aderência.

**O que incluir (framework WHAT/WHY/HOW):**
- **WHAT:** Stack tecnológica, estrutura do projeto, dependências principais, padrões arquiteturais
- **WHY:** Propósito do projeto, o que cada parte faz
- **HOW:** Comandos de build/test/lint, workflows de desenvolvimento, convenções de código

**O que NÃO incluir:**
- Informações sensíveis (API keys, credenciais)
- Snippets de código que ficam desatualizados (use referências `file:line`)
- Instruções que o Claude já segue corretamente sem ser instruído
- Longas listas de style guide (use linters em vez disso)
- Dizer o que NÃO fazer sem fornecer alternativa

**Exemplo eficaz:**
```markdown
# Code style
- Use ES modules (import/export), não CommonJS (require)
- Destructure imports quando possível
- Indentação com 2 espaços

# Workflow
- Rode typecheck após mudanças: npm run typecheck
- Prefira rodar testes individuais: npm test -- --grep "nome"
- Nunca use --force em git push; prefira --force-with-lease
```

### claudeMdExcludes

Para monorepos onde CLAUDE.md ancestrais não são relevantes:
```json
{
  "claudeMdExcludes": ["**/monorepo/CLAUDE.md", "/home/user/monorepo/other-team/.claude/rules/**"]
}
```

### Auto Memory

Sistema separado do CLAUDE.md, armazenado em `~/.claude/projects/<projeto>/memory/`. O Claude salva automaticamente insights de debugging, comandos de build, preferências de estilo. **MEMORY.md** (primeiras 200 linhas) é carregado no início da sessão; outros arquivos são lidos sob demanda. Gerenciado via `/memory` ou `autoMemoryEnabled` no settings.

---

## 4. Rules modulares com .claude/rules/

Rules permitem dividir o CLAUDE.md monolítico em arquivos focados por tópico. Todos os `.md` em `.claude/rules/` são **descobertos recursivamente**.

**Sem frontmatter `paths:`** → carregado incondicionalmente no início da sessão (mesma prioridade do CLAUDE.md).

**Com frontmatter `paths:`** → carregado condicionalmente quando o Claude trabalha com arquivos correspondentes:

```yaml
---
paths:
  - "src/api/**/*.ts"
  - "tests/**/*.test.ts"
---
# Regras de API
- Todos os endpoints devem incluir validação de input
- Use o formato padrão de resposta de erro
- Sempre inclua paginação para endpoints de lista
```

Padrões glob suportados: `*` (nível único), `**` (recursivo), brace expansion `{ts,tsx}`.

---

## 5. Custom slash commands e skills

### Slash commands (legado, ainda funcional)

Arquivos `.md` em `.claude/commands/` (projeto) ou `~/.claude/commands/` (global). O nome do arquivo vira o comando: `review.md` → `/review`. Subdiretórios criam namespaces: `frontend/component.md` → `/frontend:component`.

**Variáveis disponíveis:** `$ARGUMENTS` (todos os argumentos), `$1`, `$2` etc. (posicionais).

```yaml
---
argument-hint: [issue-number] [priority]
description: Corrigir uma issue do GitHub
---
Corrija a issue #$1 com prioridade $2. Verifique a descrição da issue e implemente as mudanças.
```

### Skills (recomendado — substitui commands)

Skills são o sistema moderno que suporta progressive disclosure, arquivos auxiliares e invocação automática pelo Claude. Cada skill é um diretório com `SKILL.md`:

```
.claude/skills/
├── deploy/
│   ├── SKILL.md
│   ├── reference.md          # Arquivos auxiliares
│   └── scripts/deploy.sh     # Scripts determinísticos
└── api-conventions/
    └── SKILL.md
```

**Frontmatter completo do SKILL.md:**

| Campo | Descrição |
|---|---|
| `name` | Nome e slash command (max 64 chars, lowercase/números/hífens) |
| `description` | Quando invocar (max 1024 chars; carregado no contexto) |
| `argument-hint` | Hint de autocompletion (ex: `[issue-number]`) |
| `disable-model-invocation` | `true` = só o usuário pode invocar |
| `user-invocable` | `false` = só o Claude pode invocar (conhecimento de background) |
| `allowed-tools` | Tools permitidas sem prompt de permissão |
| `context` | `fork` = executa em context window separado |
| `agent` | Subagente: `Explore`, `Plan`, `general-purpose` ou nome customizado |

**Exemplo completo:**
```yaml
---
name: deep-research
description: Pesquisar um tópico em profundidade no codebase
context: fork
agent: Explore
---
Pesquise $ARGUMENTS em profundidade:
1. Use Glob e Grep para encontrar arquivos relevantes
2. Leia e analise o código
3. Resuma descobertas com referências específicas de arquivo
```

**Skills bundled:** `/simplify` (review paralelo com 3 agentes), `/batch <instrução>` (mudanças em larga escala), `/debug`, `/loop`, `/claude-api`, `/security-review`.

---

## 6. Sistema de hooks

Hooks são comandos shell (ou requisições HTTP) que executam em pontos específicos do ciclo de vida. Provêm **controle determinístico** sobre o comportamento do Claude Code.

### Eventos de hook disponíveis

`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PermissionRequest`, `Setup`, `TaskCompleted`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`

### Formato de configuração

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$CLAUDE_TOOL_INPUT_FILE_PATH\"",
            "timeout": 60
          }
        ]
      }
    ],
    "PostToolUse": [...],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'Claude Code' 'Aguardando input'"
          }
        ]
      }
    ]
  }
}
```

**Matchers:** string exata (`"Write"`), pipe-separated (`"Edit|MultiEdit|Write"`), `"*"` para todos, MCP tools usam `mcp__<server>__<tool>`. O matcher só se aplica a PreToolUse, PostToolUse e PermissionRequest.

**Protocolo de comunicação:** Hooks recebem JSON via **stdin** com `session_id`, `transcript_path`, `cwd`, `tool_name`, `tool_input`. O output é controlado por exit codes:
- **Exit 0:** Sucesso — stdout processado como JSON ou adicionado ao contexto
- **Exit 2:** Erro bloqueante — ação é impedida (apenas PreToolUse); stderr vira mensagem de erro
- **Outros non-zero:** Erro não-bloqueante

**Output JSON avançado para PreToolUse:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Use rg em vez de grep para melhor performance"
  }
}
```

Hooks são configurados no `settings.json` (qualquer escopo), no `settings.local.json`, ou interativamente via `/hooks`. Variável `CLAUDE_PROJECT_DIR` disponível em todos os hooks. Modificações diretas em hooks **requerem reinício da sessão** por segurança.

---

## 7. Configuração de MCP servers

### Três métodos de transporte

**stdio** (padrão): processo local via stdin/stdout. **http** (recomendado para remoto): Streamable HTTP. **sse** (legado): Server-Sent Events.

### Localizações de configuração

| Escopo | Localização | Compartilhado |
|---|---|---|
| **Pessoal (user)** | `~/.claude.json` → `mcpServers` | Não |
| **Projeto (team)** | `.mcp.json` na raiz do projeto | Sim (git) |
| **Local (pessoal por projeto)** | `~/.claude.json` → `projects/<path>/mcpServers` | Não |
| **Enterprise** | `managed-mcp.json` no diretório de sistema | Sim (IT) |

### Exemplos de configuração

**`.mcp.json` (compartilhado com o time):**
```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "api-server": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

Expansão de variáveis de ambiente: `${VAR}` ou `${VAR:-default}` em URLs, headers, env e args.

**CLI para gerenciamento:**
```bash
claude mcp add --transport stdio github -- npx -y @modelcontextprotocol/server-github
claude mcp add --transport http notion https://mcp.notion.com/mcp
claude mcp add --scope project api -- npx api-server     # Salva em .mcp.json
claude mcp add --scope user github -- npx github-server   # Salva em ~/.claude.json
claude mcp add-from-claude-desktop                        # Importa do Claude Desktop
claude mcp list / get <name> / remove <name>
```

MCP tools seguem o padrão de nomenclatura `mcp__<server-name>__<tool-name>` para uso em permissões e matchers de hooks.

**Variáveis de ambiente para MCP:** `MCP_TIMEOUT` (timeout de startup), `MCP_TOOL_TIMEOUT` (timeout de execução de tool), `MAX_MCP_OUTPUT_TOKENS`, `MCP_OAUTH_CALLBACK_PORT`.

---

## 8. Agents e subagentes personalizados

### Built-in subagents

**Explore:** agente rápido, read-only para buscas e análise de código. **Plan:** agente de planejamento estruturado. **general-purpose:** agente padrão para tarefas gerais.

### Criando subagentes customizados

Arquivos `.md` em `.claude/agents/` (projeto) ou `~/.claude/agents/` (global), com YAML frontmatter:

```yaml
---
name: code-reviewer
description: Revisa código para qualidade e boas práticas. Use PROATIVAMENTE após mudanças.
tools: Read, Glob, Grep, Bash
model: sonnet
color: blue
skills: ["api-conventions"]
mcpServers: ["github"]
maxTurns: 10
disallowedTools: ["Write"]
---
Você é um revisor de código sênior. Analise código e forneça feedback 
específico e acionável sobre qualidade, segurança e boas práticas.
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `name` | Sim | Identificador único |
| `description` | Sim | Quando delegar — guia auto-dispatch |
| `tools` | Não | Tools permitidas (omitir = herdar todas) |
| `model` | Não | `sonnet`, `opus`, `haiku`, `inherit` |
| `skills` | Não | Array de skills para precarregar |
| `mcpServers` | Não | Array de MCP servers disponíveis |
| `maxTurns` | Não | Máximo de turnos agentic |
| `disallowedTools` | Não | Tools explicitamente negadas |

**Modos de execução:** Foreground (bloqueia conversa principal) ou Background (Ctrl+B, executa concorrentemente; auto-nega permissões não aprovadas). Para restringir subagentes, use `Agent(nome)` em arrays de deny.

---

## 9. Output styles personalizados

Output styles **substituem completamente** o system prompt de engenharia de software do Claude Code (diferente do CLAUDE.md que adiciona contexto ao prompt existente).

### Estilos built-in

**Default:** comportamento padrão conciso. **Explanatory:** adiciona "Insights" educacionais entre tarefas. **Learning:** modo colaborativo com marcadores `TODO(human)`.

### Criando estilos customizados

Arquivos `.md` em `~/.claude/output-styles/` (global) ou `.claude/output-styles/` (projeto):

```yaml
---
name: Meu Estilo Personalizado
description: Respostas detalhadas em português com explicações
keep-coding-instructions: true
---
# Instruções de Estilo
Você é um engenheiro sênior que explica cada decisão em português...
```

`keep-coding-instructions: false` (default para custom) **exclui** as instruções de codificação do system prompt. Setando `true`, as instruções de coding são mantidas. A seleção persiste em `.claude/settings.local.json` via chave `outputStyle`.

---

## 10. Variáveis de ambiente — referência completa

### Autenticação e API

| Variável | Descrição |
|---|---|
| `ANTHROPIC_API_KEY` | Chave de API primária |
| `ANTHROPIC_AUTH_TOKEN` | Token de autenticação alternativo |
| `ANTHROPIC_BASE_URL` | URL base customizada para API |
| `ANTHROPIC_CUSTOM_HEADERS` | Headers HTTP customizados (formato JSON) |
| `CLAUDE_CODE_OAUTH_TOKEN` | Token OAuth |

### Modelo e tokens

| Variável | Descrição |
|---|---|
| `ANTHROPIC_MODEL` | Modelo padrão (ex: `claude-sonnet-4-5-20250929`) |
| `ANTHROPIC_SMALL_FAST_MODEL` | Modelo menor para operações rápidas |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Pin do alias "sonnet" |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Pin do alias "opus" |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Pin do alias "haiku" |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Modelo para subagentes |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | Max tokens de output (default: 32K, max: 64K) |
| `MAX_THINKING_TOKENS` | Budget de extended thinking (default: 31999, 0 = desabilitar) |

### Provedores cloud

| Variável | Descrição |
|---|---|
| `CLAUDE_CODE_USE_BEDROCK` | `1` para usar AWS Bedrock |
| `CLAUDE_CODE_USE_VERTEX` | `1` para usar Google Vertex AI |
| `CLAUDE_CODE_USE_FOUNDRY` | `1` para usar Azure AI Foundry |
| `ANTHROPIC_VERTEX_PROJECT_ID` | Project ID do Google Cloud |
| `CLOUD_ML_REGION` | Região do Google Cloud ML |
| `AWS_PROFILE` | Perfil AWS |
| `AWS_REGION` / `AWS_DEFAULT_REGION` | Região AWS |
| `ANTHROPIC_BEDROCK_BASE_URL` | URL proxy para Bedrock |

### Comportamento e feature flags

| Variável | Descrição |
|---|---|
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | Desabilita updates, telemetria, error reporting |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | Desabilita tarefas em background |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | Desabilita auto memory |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | % de contexto (1-100) para trigger de auto-compaction |
| `BASH_DEFAULT_TIMEOUT_MS` | Timeout padrão de comandos bash |
| `BASH_MAX_TIMEOUT_MS` | Timeout máximo de bash |
| `CLAUDE_CODE_SHELL` | Override de detecção de shell |
| `CLAUDE_CONFIG_DIR` | Diretório customizado para config/data |
| `DISABLE_AUTOUPDATER` | Desabilita atualizações automáticas |
| `DISABLE_TELEMETRY` | Opt-out de telemetria |
| `DISABLE_PROMPT_CACHING` | Desabilita prompt caching |

### Rede e segurança

| Variável | Descrição |
|---|---|
| `HTTP_PROXY` / `HTTPS_PROXY` | Servidores proxy |
| `NO_PROXY` | Domínios excluídos do proxy |
| `CLAUDE_CODE_CLIENT_CERT` | Certificado TLS do cliente |
| `CLAUDE_CODE_CLIENT_KEY` | Chave privada TLS |
| `NODE_EXTRA_CA_CERTS` | Certificados CA adicionais |

Todas as variáveis de ambiente podem ser persistidas no `settings.json` dentro do bloco `"env"`. Variáveis do shell **sempre** têm precedência sobre o bloco `env` do settings.

---

## 11. Sobre o .claudeignore

Até março de 2026, o `.claudeignore` **não é uma feature oficialmente implementada** de forma confiável. Múltiplas issues no GitHub solicitam sua implementação (#1304, #2305, #4160, #5105). O Claude Code respeita `.gitignore` para o file picker `@` (controlado pela config `respectGitignore`), mas para restrições de acesso a arquivos, o mecanismo oficial é usar **`permissions.deny`** no `settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)", "Read(*.pem)", "Read(*.key)"
    ]
  }
}
```

---

## Conclusão e recomendações práticas

O ecossistema de configuração do Claude Code é surpreendentemente profundo. Quatro padrões se destacam como fundamentais para uso produtivo. **Primeiro**, mantenha o CLAUDE.md enxuto (até 200 linhas) e use `.claude/rules/` com frontmatter `paths:` para regras condicionais — isso preserva context window e melhora aderência. **Segundo**, adote skills em vez de commands legados: skills suportam progressive disclosure, invocação automática e execução isolada via `context: fork`. **Terceiro**, configure subagentes especializados com tools restritas (um reviewer read-only com `tools: Read, Glob, Grep` e `disallowedTools: ["Write"]`, por exemplo) para manter o contexto principal limpo. **Quarto**, use `.claude/settings.json` commitado no git para padronizar permissões do time e `.claude/settings.local.json` para overrides pessoais. O bloco `"env"` no settings permite persistir variáveis de ambiente sem depender do shell profile, o que simplifica significativamente o onboarding de novos desenvolvedores.