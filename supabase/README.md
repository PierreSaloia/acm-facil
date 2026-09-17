# Banco do SignEng

A migração inicial está em `migrations/001_signeng_initial.sql`.

## Executar pelo Supabase

1. Abra o projeto `mxtpmkverfvyucagckey` no dashboard do Supabase.
2. Acesse **SQL Editor**.
3. Crie uma nova consulta.
4. Cole o conteúdo de `supabase/migrations/001_signeng_initial.sql`.
5. Execute a consulta.

A chave `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` não pode criar tabelas. Ela é usada somente para acesso público permitido pelas políticas RLS.

O login permanece desativado. As tabelas `companies` e `presets` usam `installation_id` temporariamente; quando o login for ativado, as políticas deverão ser trocadas para `auth.uid()`.
