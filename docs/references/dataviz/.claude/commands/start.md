Inicie o projeto local seguindo estes passos na ordem:

1. **Confira a credencial ANTES de renovar.** Renovar abre o navegador três vezes
   e quase sempre é desnecessário:

   ```bash
   gcloud auth application-default print-access-token >/dev/null 2>&1 && echo OK || echo RENOVAR
   ```

   Só se sair `RENOVAR` (ou se o passo 4 devolver `invalid_rapt`), peça ao
   usuário para rodar — são interativos, abrem o navegador e não podem ser
   executados por você:

   ```bash
   gcloud auth login --force
   gcloud auth application-default login
   gcloud auth application-default set-quota-project "$GOOGLE_CLOUD_PROJECT"
   ```

2. **Confira para qual banco o `.env.local` aponta.** `dataviz` é o banco
   canônico (produção); `dataviz-dev` é o espelho de desenvolvimento. Testar
   local contra produção mexe em dado real:

   ```bash
   grep -E "^DATAVIZ_DATABASE_ID" .env.local
   ```

   `DATAVIZ_DATABASE_ID` ausente **não** significa dev: o código cai no default,
   que é produção. Se estiver em produção sem o usuário ter pedido, avise antes
   de subir.

3. Libere a porta 3005 (Windows — `lsof` não existe aqui):

   ```bash
   netstat -ano | grep ":3005" | grep LISTENING | awk '{print $5}' | sort -u \
     | while read pid; do taskkill //PID $pid //F; done
   ```

4. Inicie o servidor dev — em background, senão ele bloqueia o turno:

   ```bash
   pnpm dev
   ```

   A porta é **3005**, fixa em `--port 3005` dentro do script `dev` do
   `package.json`. Prefixar `PORT=` não muda nada: a flag vence a variável, e o
   servidor sobe em 3005 sem avisar que ignorou o pedido.

5. Verifique se a API de clientes está respondendo:

   ```bash
   curl -s http://localhost:3005/api/clients | head -c 100
   ```

   - `{"data":[...]}` — tudo certo.
   - `invalid_rapt` — credencial expirada: volte ao passo 1 e **reinicie o
     servidor** (o Firebase Admin SDK lê a credencial uma vez, na inicialização;
     renovar com ele rodando não tem efeito).

6. Para conferir que a aplicação de fato funciona — e não só que a API responde
   — abra no navegador. Em desenvolvimento o login é dispensado (bypass ativo
   quando não há `FIREBASE_ADMIN_PRIVATE_KEY`), então dá para navegar direto:

   ```
   http://localhost:3005/dashboard
   ```

   `/dashboard` redireciona para a primeira página do cliente. Confira o console
   do navegador: violação de CSP e erro de bloco aparecem lá, não no terminal.

---

## `Jest worker encountered N child process exceptions`

Erro de RUNTIME no navegador, com 500 na página. **Não é bug do produto** — é o
worker de render do dev server que para de servir a rota de relatório.

### O que está medido

- a falha é da ROTA `/g/[groupId]/r/[reportId]` inteira: as 13 páginas passam a
  dar 500 juntas, enquanto `/dashboard` e todas as `/api/*` continuam em 200;
- **reiniciar o dev server resolve**: 13/13 em 200 logo depois, sem tocar em
  código;
- o build de produção serve a mesma página sem falha (15/15 medido).

### O que NÃO está estabelecido

A primeira hipótese aqui foi "falta de memória", e ela não se sustentou: um
crash aconteceu com 4,4 GB livres e outro com 6,6 GB — mais folga, mesma falha.
Memória apertada provavelmente ajuda, mas não explica sozinha.

O que os dois crashes tinham em comum era um servidor vivo há muito tempo,
atravessando muitas recompilações (arquivos sendo editados enquanto ele
rodava). Servidor recém-subido e sem edições serviu as 13 páginas doze vezes
seguidas sem falhar.

### O que fazer

Reinicie o dev server — é determinístico. Se você está editando código em
sequência, espere reiniciar mais de uma vez. Para uma sessão longa só de
TESTAR (sem editar), `pnpm build && pnpm start` não tem esse worker e não
falha; o custo é perder o hot reload e precisar de login real, porque o bypass
de autenticação só existe em desenvolvimento.

### O que NÃO fazer

Procurar o defeito na página que aparece no erro. Ela é a primeira da rota a
ser pedida — a vítima, não a causa.

**O que fazer:** reinicie o dev server. Se repetir, libere memória antes —
fechar abas do Chrome, `wsl --shutdown`, parar o Docker Desktop. Rodar `pnpm
build` com o dev server ligado é o gatilho mais confiável, porque os dois
disputam a mesma memória.

**O que NÃO fazer:** procurar o defeito na página que apareceu no erro. Ela é
só a mais pesada — a vítima, não a causa.
