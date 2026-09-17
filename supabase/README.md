# Banco do SignEng

O SignEng é 100% Supabase: autenticação, perfis, licenças, máquinas e
(quando existirem) as funções de cálculo dos módulos. Não há mais nenhuma
dependência de Firebase no plugin.

As migrações, em ordem:

1. `migrations/001_signeng_initial.sql` — schema inicial (tabelas + RLS básico).
2. `migrations/002_auth_profiles.sql` — trigger que cria perfil + licença
   automaticamente quando uma conta é criada no Supabase Auth.
3. `migrations/003_hardening.sql` — correções de idempotência, constraint de
   licença única por usuário, e a função `verify_machine_license` (substitui
   a antiga Cloud Function `verifyMachineLicense` do Firebase).

## Executar pelo Supabase

1. Abra o projeto `mxtpmkverfvyucagckey` no dashboard do Supabase.
2. Acesse **SQL Editor**.
3. Rode as três migrações **nessa ordem** (a `003` é idempotente — pode rodar
   de novo sem erro se precisar).

A chave `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` não pode criar tabelas nem
funções. Ela só é usada para o acesso público permitido pelas políticas RLS
(login, leitura da própria linha em `users`/`licenses`, e leitura pública de
`plugin_versions`/`public_settings`).

## Criar o administrador

No Supabase Dashboard, abra **Authentication → Users → Add user** e crie:

- Email: `pierreprincipal@gmail.com`
- Nome/metadata `name`: `Pierre Santos de Aquino`
- Marque confirmação automática do email.
- **Defina uma senha real** — não existe mais fallback local de emergência
  no plugin. Se essa conta não existir no Supabase com uma senha válida,
  não há como logar como admin.

O trigger da migração `002` (mantido pela `003`) cria automaticamente o
perfil admin e a licença vitalícia (`plan: admin`, `max_machines: 999`,
sem verificação de máquina) para esse email.

## Autenticação e licenciamento (arquitetura atual)

```
Login → Supabase Auth (email/senha)
      → SELECT public.users    (identidade, role, modules)
      → SELECT public.licenses (plan, status, paid, expires_at, max_machines)
      → RPC verify_machine_license(...) — gate de máquina, sempre online
```

Sistema **somente online**: não existe modo offline nem fallback local. Toda
ação de "Gerar" nos módulos exige uma sessão Supabase válida; sem ela, o
plugin recusa com uma mensagem clara em vez de qualquer bypass.

## Cálculos dos módulos (pendente)

Os cálculos geométricos de cada módulo (Auto-ACM, Luminoso, Corte & Encaixe
etc.) rodam no servidor por design anti-pirataria — o cliente nunca recebe o
algoritmo, só o resultado. O cliente Ruby (`Core::SupabaseClient.call_function`)
já está pronto para chamar `https://mxtpmkverfvyucagckey.supabase.co/functions/v1/<nome>`,
mas **nenhuma Edge Function foi implantada ainda**. Até lá, os botões
"Gerar" retornam um erro explícito de função não encontrada. Ver
`CLOUD_FUNCTIONS_MIGRATION.md` para a lista completa e o contrato de cada uma.
