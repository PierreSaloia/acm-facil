# Banco do SignEng

A migração inicial está em `migrations/001_signeng_initial.sql`.

## Executar pelo Supabase

1. Abra o projeto `mxtpmkverfvyucagckey` no dashboard do Supabase.
2. Acesse **SQL Editor**.
3. Crie uma nova consulta.
4. Cole o conteúdo de `supabase/migrations/001_signeng_initial.sql`.
5. Execute a consulta.

A chave `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` não pode criar tabelas. Ela é usada somente para acesso público permitido pelas políticas RLS.

## Criar o administrador

No Supabase Dashboard, abra **Authentication > Users > Add user** e crie:

- Email: `pierreprincipal@gmail.com`
- Nome/metadata `name`: `Pierre Santos de Aquino`
- Marque confirmação automática do email durante os testes.

A senha deve ser digitada diretamente no painel do Supabase e não deve ser salva no repositório, `.env` ou código.

O trigger da migração `002_auth_profiles.sql` cria automaticamente o perfil admin e a licença vitalícia para esse email.

## Cálculos dos módulos

O login novo usa Supabase Auth. Os cálculos ainda mantêm compatibilidade temporária com as Cloud Functions Firebase antigas: quando a mesma conta também existir no Firebase, o plugin salva o token Firebase para os módulos legados. Para migrar totalmente para Supabase, cada Cloud Function de cálculo deverá ser portada para uma Supabase Edge Function mantendo o contrato de cada módulo.
