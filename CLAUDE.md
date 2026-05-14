# CLAUDE.md — HOS Eventos: Contexto Completo do Projeto

## 1. Visão Geral

**HOS Eventos** é um sistema interno de gestão de Ordens de Serviço (O.S.) para eventos dos restaurantes do Grupo HOS (Meet & Eat e Madonna Cucina). Permite criar, editar, visualizar e imprimir O.S. de eventos, gerenciar brigada, cardápio, layout e comprovantes de pagamento.

- **Usuários:** equipe interna (operacional, comercial, admin, master)
- **Produção:** https://hos-oseventos.vercel.app
- **Repositório:** https://github.com/grupomeeteat-lang/hos-oseventos
- **Hospedagem:** Vercel (static site, sem build step, auto-deploy no push para `main`)

---

## 2. Stack & Arquitetura

### Estrutura
- **Single HTML file:** todo o sistema está em `index.html` (~2700 linhas). CSS, HTML e JS em um único arquivo.
- **Sem framework, sem bundler, sem build.** Tudo é vanilla JS com `fetch` nativo.
- **Vercel** serve o `index.html` como site estático.

### Cliente Supabase customizado (`SBQuery`)
Substitui o SDK oficial do Supabase. Definido na linha **1553**.

```js
const q = new SBQuery('nome_da_tabela');
q.select('col1,col2')       // opcional, default '*'
 .eq('coluna', valor)        // filtro WHERE col=eq.val (pode encadear)
 .order('col', {ascending: true})
 .limit(n);
const { data, error } = await q.get();      // SELECT
const { data, error } = await q.insert(obj); // INSERT
const { data, error } = await q.update(obj); // UPDATE (requer .eq() antes)
const { data, error } = await q.delete();    // DELETE (requer .eq() antes)
```

- Headers dinâmicos via `_headers()` usando `getAuthToken()` — sempre usa o JWT do usuário logado, não a anon key hardcoded
- Erro 401 → chama `doLogout()` automaticamente
- `Prefer: return=representation` em todas as chamadas

### Chamadas Admin (`sbAdmin`)
Para operações que requerem `service_role` key (bypass de RLS, gerenciar usuários no Auth):

```js
const { data, error, status } = await sbAdmin('GET', '/auth/v1/admin/users/UUID');
const { data, error } = await sbAdmin('POST', '/auth/v1/admin/users', { email, password, email_confirm: true });
const { data, error } = await sbAdmin('PUT', `/auth/v1/admin/users/${authId}`, { password: nova });
const { data, error } = await sbAdmin('DELETE', `/auth/v1/admin/users/${authId}`);
```

---

## 3. Banco de Dados — Supabase

- **Projeto ID:** `rpavxnjchfmeiacnumpk`
- **URL:** `https://rpavxnjchfmeiacnumpk.supabase.co`
- **Dashboard:** https://supabase.com/dashboard/project/rpavxnjchfmeiacnumpk

### Tabela: `eventos`
Principal tabela do sistema. Cada linha = uma O.S.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | int8 (PK, auto) | ID da O.S. |
| `created_at` | timestamptz | Criação automática |
| `updated_at` | timestamptz | Última atualização (preenchida no update) |
| `criado_por` | text | Nome do usuário que criou a O.S. |
| `casa` | text | Unidade ("MEET & EAT" ou "Madonna Cucina") |
| `tipo_evento` | text | Tipo (ex: "Casamento", "Corporativo") |
| `nome_evento` | text | Nome do evento |
| `tema` | text | Tema do evento |
| `data_inicio` | date | Data do evento (formato YYYY-MM-DD) |
| `hora_inicio` | text | Horário de início (ex: "19:00") |
| `hora_termino` | text | Horário de término |
| `num_convidados` | int4 | Número de convidados (PAX) |
| `contato` | text | Contato do cliente/contratante |
| `situacao_pagamento` | text | Situação do pagamento |
| `responsavel_comercial` | text | Responsável comercial pelo evento |
| `responsavel_operacional` | text | Responsável operacional pelo evento |
| `status` | text | Status atual da O.S. |
| `briefing_cliente` | text | Briefing / observações do cliente |
| `espacos` | text | Espaços do local (sem acento, sem ç) |
| `acesso_entrada` | text | Tipo de acesso/entrada |
| `acesso_obs` | text | Observações sobre acesso |
| `mobiliario` | text | Mobiliário necessário |
| `mobiliario_obs` | text | Observações sobre mobiliário |
| `fotografia` | text | Fotografia/vídeo |
| `valet` | text | Valet |
| `artistico` | text | Artístico/entretenimento |
| `gerador` | text | Gerador de energia |
| `ambulancia` | text | Ambulância/suporte médico |
| `menores` | text | Presença de menores de idade |
| `montagem` | text | Montagem/desmontagem |
| `montagem_descricao` | text | Descrição da montagem |
| `brigada` | jsonb | Array de membros da brigada `[{nome, funcao, horario}]` |
| `menu_bar` | jsonb | Array de itens do bar `[{item, categoria, servico, qtd}]` |
| `menu_cozinha` | jsonb | Array de itens da cozinha `[{item, categoria, servico, qtd}]` |
| `campo_livre` | text | Campo de texto livre / observações gerais |
| `tempos_movimentos` | text | Tempos e movimentos do evento |
| `layout_anexos` | text | Anexos de layout em base64 (JSON array) — **adicionado via ALTER TABLE** |
| `comprovantes_pagamento` | text | Comprovantes em base64 (JSON array) — **adicionado via ALTER TABLE** |

**RLS:** Desabilitado (`ALTER TABLE eventos DISABLE ROW LEVEL SECURITY`)

**Colunas adicionadas manualmente (não recriar):**
```sql
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS layout_anexos text;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS comprovantes_pagamento text;
```

### Tabela: `usuarios`
Perfis dos usuários. Complementa o Supabase Auth.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | int8 (PK, auto) | ID interno |
| `created_at` | timestamptz | Criação automática |
| `nome` | text | Nome do usuário |
| `email` | text | Email (pode estar vazio; email canônico está no Auth) |
| `perfil` | text | Perfil funcional ("operacional", "comercial", "admin") |
| `nivel_acesso` | text | Nível de permissão (ver seção 5) |
| `casa` | text | Unidade principal ("MEET & EAT", "Madonna Cucina", "Todas") |
| `auth_id` | uuid | UUID do usuário no Supabase Auth — chave de ligação |

**RLS:** Ativo, com políticas:
- SELECT, INSERT, UPDATE: `auth.uid() IS NOT NULL`
- DELETE: `auth.uid() IS NOT NULL` (adicionada via SQL — **não recriar**)

```sql
-- Policy de DELETE adicionada manualmente:
CREATE POLICY "authenticated_delete_usuarios" ON usuarios
FOR DELETE USING (auth.uid() IS NOT NULL);
```

---

## 4. Autenticação

### Fluxo de login
1. Usuário digita email/senha na tela de login
2. POST para `/auth/v1/token?grant_type=password` com `apikey: SUPABASE_KEY`
3. Supabase retorna `access_token`, `refresh_token`, `user.id`
4. Token salvo em `localStorage` com as chaves `hos_token`, `hos_refresh`, `hos_auth_id`
5. `carregarPerfil(authId, token)` busca a linha na tabela `usuarios` onde `auth_id = authId`
6. `currentUser` global é populado com todos os dados do perfil + token

### Verificação de sessão
- `checkSession()` roda no `DOMContentLoaded`
- Lê `hos_token` do localStorage
- Verifica via GET `/auth/v1/user` com o token
- Se inválido → limpa localStorage e mostra tela de login

### Token nas chamadas
- `getAuthToken()` retorna `currentUser?.token || SUPABASE_KEY`
- `SBQuery._headers()` chama `getAuthToken()` dinamicamente em cada request
- Chamadas admin usam `SUPABASE_SERVICE_KEY` diretamente (bypass de RLS)

### Estrutura de `currentUser`
```js
currentUser = {
  id: p.id,              // PK da tabela usuarios
  auth_id: authId,       // UUID do Supabase Auth
  token: access_token,   // JWT para requests autenticados
  nome: p.nome,
  email: p.email,
  perfil: p.perfil,      // 'operacional' | 'comercial' | 'admin'
  nivel_acesso: p.nivel_acesso,  // 'operacional' | 'comercial' | 'admin' | 'master'
  casa: p.casa           // 'MEET & EAT' | 'Madonna Cucina' | 'Todas'
}
```

### Localização das keys no código (`index.html`)

| Constante | Linha | Descrição |
|-----------|-------|-----------|
| `SUPABASE_URL` | ~1512 | URL base do projeto Supabase |
| `SUPABASE_KEY` | ~1513 | Anon key (pública) — usada no login e queries autenticadas |
| `SUPABASE_SERVICE_KEY` | ~1515 | Service role key (admin) — bypass de RLS, gerenciar Auth |

> ⚠️ `SUPABASE_SERVICE_KEY` está hardcoded no HTML público. Qualquer pessoa com acesso ao source consegue ver. Aceitável para sistema interno, mas não para produção pública.

### Usuário master
- **Email:** `grupomeeteat@gmail.com`
- **Perfil:** `admin`, **Nível:** `master`, **Casa:** `Todas`
- Criado/resetado via `node setup-master.js <SERVICE_ROLE_KEY>`

---

## 5. Níveis de Acesso

| Nível | Ver eventos | Criar/Editar O.S. | Excluir O.S. | Gerenciar Usuários | Nav "Nova O.S." |
|-------|-------------|-------------------|--------------|-------------------|-----------------|
| `master` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `comercial` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `operacional` | ✅ | ❌ | ❌ | ❌ | ❌ |

- `podeEditar()` → `['master','admin','comercial'].includes(nivel_acesso)`
- `podeExcluir()` → `['master','admin'].includes(nivel_acesso)`
- Nav "Usuários" visível apenas para `master` e `admin`
- Usuário `master` não pode ser excluído; usuário logado não pode excluir a si mesmo

---

## 6. Telas e Funcionalidades

| ID da página | Nav | Descrição | Funções JS principais |
|-------------|-----|-----------|----------------------|
| `page-dashboard` | Dashboard | Cards de resumo: total de eventos, próximos eventos | `loadDashboard()` |
| `page-eventos` | Eventos | Tabela de todas as O.S. com filtros por casa e status; botões Ver, Editar, Excluir | `loadEventos()`, `aplicarFiltros()`, `renderEventosTable()`, `excluirOS()` |
| `page-nova-os` | Nova O.S. | Formulário completo de criação/edição de O.S.; inclui widget de resumo lateral | `salvarOS()`, `editarOS()`, `resetForm()`, `atualizarResumo()`, `addBrigadaRow()`, `addMenuBarRow()`, `addMenuCozinhaRow()`, `handleLayoutFile()`, `handleComprovanteFile()` |
| `page-view-os` | — | Visualização de uma O.S. para leitura e impressão | `verOS()`, `salvarStatusView()`, `abrirArquivo()`, `viewSection()` |
| `page-usuarios` | Usuários | Painel admin de gerenciamento de usuários | `loadUsuarios()`, `abrirModalUsuario()`, `salvarUsuario()`, `excluirUsuario()`, `toggleRedefSenha()`, `salvarRedefSenha()` |
| `page-senha` | Minha Senha | Formulário para o usuário logado trocar sua própria senha | `trocarSenha()` |

### Modais
| ID | Função de abertura | Descrição |
|----|-------------------|-----------|
| `modal-usuario` | `abrirModalUsuario(id?, nome?, perfil?, casa?, email?, nivel?, authId?)` | Criar/editar usuário; quando editando, exibe seção "Redefinir Senha" inline |
| `modal-reset-senha` | `abrirModalResetSenha(authId, nome)` | Reset de senha via botão 🔑 na tabela de usuários (ainda existe, mas raramente usado) |

### Fluxo de navegação
```
Login → Dashboard
Dashboard → Eventos (lista)
Eventos → Nova O.S. (criar)
Eventos → Ver O.S. (visualizar/imprimir)
Eventos → Editar O.S. (formulário preenchido)
Qualquer tela → Usuários (só master/admin)
Qualquer tela → Minha Senha
```

---

## 7. Funcionalidades Implementadas (ordem cronológica)

1. **CRUD de O.S.** — criação, edição, listagem e visualização de ordens de serviço
2. **Fix `[object Object]` no SBQuery** — função `sbError()` para extrair mensagem legível de erros do PostgREST
3. **Cabeçalhos cinza nas seções** — `.section-head { background: #e8e8e8 }` no formulário e na visualização
4. **Print backgrounds** — `print-color-adjust: exact` para forçar fundos cinza na impressão
5. **Sidebar oculta na impressão** — `@media print { .sidebar, .page-header { display: none !important } }`
6. **Comprovantes de pagamento** — upload de PDF/PNG/JPG, armazenado em base64 no campo `comprovantes_pagamento`, exibido na visualização e impresso em página adicional com `page-break-before: always`
7. **Fix Blob URL** — `abrirArquivo()` usa `URL.createObjectURL()` para abrir base64 em nova aba (Chrome bloqueia `data:` URLs via `<a target="_blank">`)
8. **Brigada em grid 3 colunas** — visualização da brigada em flex-wrap, igual ao formulário
9. **Fix timezone** — `T12:00:00Z` + `timeZone: 'America/Sao_Paulo'` em todas as formatações de `data_inicio` para evitar off-by-one
10. **Melhorias de impressão** — `font-weight: bold !important` em todo `@media print`
11. **Status dropdown no reader** — dropdown de status na visualização com save inline via `salvarStatusView()`
12. **Campo "Espaços" no formulário** — campo de texto adicional
13. **Padding do os-view-header** — `padding: 40px` para mais altura
14. **Botão excluir na lista** — DELETE com confirmação em `excluirOS()`
15. **Autenticação real com Supabase Auth** — login com email/senha, JWT, `checkSession()`, `doLogout()`, `carregarPerfil()`
16. **Níveis de acesso** — `podeEditar()`, `podeExcluir()`, nav dinâmica por nível
17. **Painel admin de usuários** — CRUD completo de usuários com modal, `sbAdmin()` para criar no Auth
18. **Setup-master.js** — script Node.js para criar/resetar usuário master no Supabase Auth
19. **Fix `auth_id` no SELECT de usuários** — `.select('id,nome,email,perfil,nivel_acesso,casa,auth_id')` explícito em `loadUsuarios()`
20. **Fix RLS na exclusão de usuários** — policy DELETE adicionada na tabela `usuarios`
21. **Redefinir Senha no modal de edição** — botão inline que expande campos Nova Senha + Confirmar, valida e salva via `sbAdmin PUT`
22. **Email do Auth no modal de edição** — busca email via `sbAdmin GET /auth/v1/admin/users/{authId}` em background ao abrir modal

---

## 8. Bugs Conhecidos & Dívida Técnica

### Problemas pendentes
- **Email na tabela `usuarios`** — a coluna `email` existe mas pode estar vazia (não foi preenchida na criação de alguns usuários). O email canônico está no Supabase Auth. O modal de edição busca do Auth, mas a coluna da tabela não é atualizada automaticamente.
- **Delete de usuário sem `auth_id`** — se um usuário existe na tabela `usuarios` sem `auth_id` (criado fora do app), o botão excluir consegue deletar da tabela mas não do Auth (sem o UUID para chamar a API).
- **Logs de debug na `excluirUsuario`** — ainda existem `console.log('[1]...[5]')` de debug que não foram removidos.

### Workarounds ativos
- **`SUPABASE_SERVICE_KEY` no HTML** — chave de serviço hardcoded no frontend. Deveria ser uma variável de ambiente em um backend/edge function. Workaround aceitável para sistema interno.
- **RLS desabilitado em `eventos`** — desabilitado com `DISABLE ROW LEVEL SECURITY` para simplificar. Deveria ter policies adequadas.
- **`data_inicio` como `date` + `T12:00:00Z`** — workaround de timezone: armazena como date no Postgres, mas no JS concatena `T12:00:00Z` antes de formatar para evitar off-by-one causado por UTC midnight.

### Alertas de segurança
- `SUPABASE_SERVICE_KEY` visível no source da página (bypassa RLS, acesso admin total)
- RLS desabilitado em `eventos` (qualquer usuário autenticado lê/escreve tudo)
- Sem rate limiting no login

---

## 9. Padrões de Código

### Adicionar nova tela
1. Adicionar `<div id="page-nova-tela" style="display:none">` no HTML (entre as outras páginas)
2. Adicionar item no nav: `<div class="nav-item" id="nav-nova-tela" onclick="showPage('nova-tela')">Nome</div>`
3. Em `setupUI()` (linha 1707): controlar visibilidade do nav-item por nível de acesso
4. Em `showPage()` (linha 1725): **obrigatório** adicionar `'nova-tela'` ao array hardcoded na linha 1726:
   ```js
   ['dashboard', 'eventos', 'nova-os', 'view-os', 'usuarios', 'senha', 'nova-tela'].forEach(...)
   ```
   E adicionar `'nav-nova-tela'` ao array de nav na linha 1730.
   A função **não** usa `querySelectorAll` — a lista de páginas é explícita.

### Query no Supabase (SBQuery)
```js
// SELECT com filtro e ordem
const q = new SBQuery('eventos');
q.select('id,nome_evento,status_os')
 .eq('casa', 'MEET & EAT')
 .order('data_inicio', { ascending: false })
 .limit(10);
const { data, error } = await q.get();
if (error) { /* tratar */ }

// INSERT
const q2 = new SBQuery('eventos');
const { data, error } = await q2.insert({ nome_evento: 'Festa', casa: 'MEET & EAT' });

// UPDATE
const q3 = new SBQuery('eventos');
q3.eq('id', 42);
const { error } = await q3.update({ status_os: 'Confirmado' });

// DELETE
const q4 = new SBQuery('eventos');
q4.eq('id', 42);
const { error } = await q4.delete();
```

### Chamada Admin (Auth API)
```js
// Criar usuário
const { data, error } = await sbAdmin('POST', '/auth/v1/admin/users', {
  email: 'user@email.com',
  password: 'senha123',
  email_confirm: true
});
const authId = data.id; // UUID do novo usuário

// Alterar senha
const { error } = await sbAdmin('PUT', `/auth/v1/admin/users/${authId}`, {
  password: 'novaSenha123'
});

// Deletar do Auth
const { error } = await sbAdmin('DELETE', `/auth/v1/admin/users/${authId}`);
```

### Padrão de modal
```html
<!-- HTML: overlay + card -->
<div id="modal-X" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;align-items:center;justify-content:center">
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:32px;width:460px;max-width:95vw;max-height:90vh;overflow-y:auto">
    <div id="modal-X-alert" style="display:none;margin-bottom:16px"></div>
    <!-- campos -->
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" style="flex:1" onclick="fecharModalX()">Cancelar</button>
      <button class="btn btn-gold" style="flex:1" onclick="salvarX()">Salvar</button>
    </div>
  </div>
</div>
```

```js
// JS: abrir / fechar / alerta
function abrirModalX() {
  document.getElementById('modal-X-alert').style.display = 'none';
  document.getElementById('modal-X').style.display = 'flex';
}
function fecharModalX() {
  document.getElementById('modal-X').style.display = 'none';
}
function showModalXAlert(msg, type) { // type: 'error' | 'success'
  const el = document.getElementById('modal-X-alert');
  el.style.display = 'block';
  el.className = 'alert alert-' + type;
  el.textContent = msg;
}
// Fechar ao clicar fora (no DOMContentLoaded):
document.getElementById('modal-X').addEventListener('click', function(e) {
  if (e.target === this) fecharModalX();
});
```

### Formatar data (evitar bug de timezone)
```js
// CORRETO — sempre usar T12:00:00Z e timeZone explícito
const d = new Date(evento.data_inicio + 'T12:00:00Z');
const fmt = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

// ERRADO — new Date('2025-05-14') interpreta como UTC midnight → dia anterior em UTC-3
```

---

## 10. Histórico de Sessão

### Últimas alterações (2026-05-14)

| Commit | O que foi feito |
|--------|----------------|
| `bad1cab` | Corrige SUPABASE_SERVICE_KEY (placeholder colado junto com a chave real) |
| `3063493` | `abrirModalUsuario` volta a ser síncrono — modal abre antes do fetch de email |
| `106e783` | Fix campos de senha expandem inline; email buscado do Auth em background |
| `d5fae59` | Botão "Redefinir Senha" no modal de edição com validação e confirmação |
| `bb621e6` | Fix exclusão de usuário bloqueada por RLS (adicionada policy DELETE) |
| `07f3ce7` | `loadUsuarios` seleciona `auth_id` explicitamente |
| `59975e7` | `excluirUsuario` com try/catch, logs, ordem correta (Auth → tabela) |
| `31b905d` | Autenticação real com Supabase Auth, níveis de acesso, painel admin |

### Estado atual
- Sistema em produção em https://hos-oseventos.vercel.app
- `SUPABASE_SERVICE_KEY` preenchida e funcionando
- Exclusão de usuários funcionando (pending: testar após policy RLS adicionada)
- Modal de edição de usuário: redefinição de senha inline implementada

### Próximos passos pendentes
- Remover logs de debug `[1]...[5]` da função `excluirUsuario()`
- Testar fluxo completo de criação de usuário com service key correta
- Testar redefinição de senha via modal de edição
- Considerar sincronizar coluna `email` da tabela `usuarios` ao criar/editar usuários
- Considerar reativar RLS em `eventos` com policies adequadas
