#!/usr/bin/env node
/**
 * setup-master.js — cria/corrige o usuário master no Supabase
 * Uso: node setup-master.js <SERVICE_ROLE_KEY>
 */

const SERVICE_KEY = process.argv[2];
if (!SERVICE_KEY || SERVICE_KEY.startsWith('COLE')) {
  console.error('Uso: node setup-master.js <sua-service-role-key>');
  console.error('Encontre a chave em: Supabase Dashboard → Settings → API → service_role');
  process.exit(1);
}

const SUPABASE_URL = 'https://rpavxnjchfmeiacnumpk.supabase.co';
const ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwYXZ4bmpjaGZtZWlhY251bXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Nzg2MjcsImV4cCI6MjA5MDA1NDYyN30.50z2VN6zogv-HWXJHTVXSzAw-xP9mJfodip-iYEhmlA';

const MASTER = {
  email:        'grupomeeteat@gmail.com',
  password:     'Meet287@',
  nome:         'Henrique',
  perfil:       'admin',
  nivel_acesso: 'master',
  casa:         'Todas',
};

// ── fetch com log de URL ─────────────────────────────────────────────
async function doFetch(label, url, options) {
  console.log(`     → ${label}`);
  console.log(`       URL: ${url}`);
  try {
    const resp = await fetch(url, options);
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { _raw: text }; }
    console.log(`       Status: ${resp.status}`);
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    console.error(`       ✗ FALHOU: ${err.message}`);
    console.error(`       Tipo: ${err.name}`);
    if (err.cause) console.error(`       Causa: ${err.cause?.message || err.cause}`);
    process.exit(1);
  }
}

async function adminFetch(method, path, body) {
  return doFetch(`Admin ${method} ${path}`, `${SUPABASE_URL}${path}`, {
    method,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function restFetch(method, path, body) {
  return doFetch(`REST ${method} ${path}`, `${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  HOS Eventos — Setup Usuário Master');
  console.log(`  Node: ${process.version}`);
  console.log(`  Projeto: ${SUPABASE_URL}`);
  console.log('═══════════════════════════════════════════\n');

  // 1. Listar usuários
  console.log('1/4  Buscando usuário no Supabase Auth...');
  const listResult = await adminFetch('GET', '/auth/v1/admin/users?per_page=1000');
  if (!listResult.ok) {
    console.error('     ✗ Erro:', JSON.stringify(listResult.data));
    console.error('     Verifique se a service key está correta.');
    process.exit(1);
  }

  const users    = listResult.data.users || [];
  const existing = users.find(u => u.email === MASTER.email);
  let authId;

  if (existing) {
    authId = existing.id;
    console.log(`     ✓ Usuário encontrado: ${authId}`);

    console.log('2/4  Resetando senha...');
    const resetResult = await adminFetch('PUT', `/auth/v1/admin/users/${authId}`, {
      password:      MASTER.password,
      email_confirm: true,
    });
    if (!resetResult.ok) {
      console.error('     ✗ Erro ao resetar senha:', JSON.stringify(resetResult.data));
      process.exit(1);
    }
    console.log('     ✓ Senha resetada.');
  } else {
    console.log('2/4  Criando usuário no Supabase Auth...');
    const createResult = await adminFetch('POST', '/auth/v1/admin/users', {
      email:         MASTER.email,
      password:      MASTER.password,
      email_confirm: true,
    });
    if (!createResult.ok) {
      console.error('     ✗ Erro ao criar:', JSON.stringify(createResult.data));
      process.exit(1);
    }
    authId = createResult.data.id;
    console.log(`     ✓ Criado: ${authId}`);
  }

  // 3. Sincronizar tabela usuarios
  console.log('3/4  Sincronizando tabela usuarios...');
  const checkResult = await restFetch('GET', `/usuarios?auth_id=eq.${authId}&select=id`);
  const existingRow = Array.isArray(checkResult.data) && checkResult.data.length > 0;

  // Começa com todos os campos; remove colunas inexistentes automaticamente
  let profileData = {
    auth_id:      authId,
    nome:         MASTER.nome,
    email:        MASTER.email,
    perfil:       MASTER.perfil,
    nivel_acesso: MASTER.nivel_acesso,
    casa:         MASTER.casa,
  };

  async function upsertPerfil(method, path, data) {
    let payload = { ...data };
    for (let tentativa = 1; tentativa <= 5; tentativa++) {
      const result = await restFetch(method, path, payload);
      if (result.ok) return result;
      // PGRST204 = coluna não existe no schema cache
      if (result.data?.code === 'PGRST204') {
        const col = result.data.message?.match(/find the '(.+?)' column/)?.[1];
        if (col && payload[col] !== undefined) {
          console.log(`     ⚠ Coluna '${col}' não existe — removendo e tentando novamente...`);
          delete payload[col];
          continue;
        }
      }
      console.error(`     ✗ Erro (tentativa ${tentativa}):`, JSON.stringify(result.data));
      process.exit(1);
    }
  }

  if (existingRow) {
    await upsertPerfil('PATCH', `/usuarios?auth_id=eq.${authId}`, profileData);
    console.log('     ✓ Perfil atualizado.');
  } else {
    await upsertPerfil('POST', '/usuarios', profileData);
    console.log('     ✓ Perfil inserido.');
  }

  // 4. Testar login
  console.log('4/4  Testando login...');
  const loginResult = await doFetch(
    `Auth POST /auth/v1/token`,
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: MASTER.email, password: MASTER.password }),
    }
  );

  if (!loginResult.ok) {
    console.error('     ✗ Login falhou:', JSON.stringify(loginResult.data));
    process.exit(1);
  }

  const tokenPreview = loginResult.data.access_token?.slice(0, 40) + '...';
  console.log(`     ✓ Login OK! Token: ${tokenPreview}`);

  console.log('\n═══════════════════════════════════════════');
  console.log('  Setup completo!');
  console.log(`  Email: ${MASTER.email}`);
  console.log(`  Senha: ${MASTER.password}`);
  console.log('═══════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\nErro inesperado:');
  console.error('  Mensagem:', err.message);
  console.error('  Tipo:', err.name);
  if (err.stack) console.error('  Stack:', err.stack);
  process.exit(1);
});
