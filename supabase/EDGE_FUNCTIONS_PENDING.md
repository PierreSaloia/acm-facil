# Funções de cálculo pendentes (Supabase Edge Functions)

O SignEng não depende mais de Firebase. As 12 funções de cálculo dos módulos
nunca chegaram a ser escritas no backend antigo (eram Cloud Functions do
Firebase que só existiam no plano, não no código) — seguem pendentes aqui,
agora como Supabase Edge Functions (Deno + TypeScript).

## Funções a implementar

- `autoAcmCompute`
- `autoAcmCurvoCompute`
- `autoSigameCompute`
- `corteEncaixeCompute`
- `geoArt3D`
- `geoArtCompute`
- `logo3dCompute`
- `luminosoCompute`
- `movelParametricoCompute`
- `movelIndustrialCompute`
- `texturaSyncCompute`
- `alinharCompute`

Duas delas já têm um algoritmo de referência funcionando em Ruby, puramente
aritmético (sem depender da API do SketchUp), prontas pra servir de base ao
porte em TypeScript:

- `autoAcmCompute` → `signeng/modules/auto_acm.rb`, método `pecas_locais`
  (atualmente sem uso, mantido como referência).
- `autoSigameCompute` → `signeng/modules/auto_sigame.rb`, método
  `pecas_locais_sigame` (idem).

As outras 10 não têm implementação de referência pronta — precisam ser
escritas do zero a partir da lógica correspondente nos módulos `.rb` (que
hoje fazem a geometria 3D final no SketchUp, mas dependeriam da função remota
pra decidir o layout/quantitativo).

## Cliente já pronto

`signeng/core/supabase_client.rb` já expõe:

```ruby
Core::SupabaseClient.call_function("autoAcmCompute", payload, access_token)
```

que faz `POST https://mxtpmkverfvyucagckey.supabase.co/functions/v1/autoAcmCompute`
com `{ "data": payload }` e espera `{ "result": {...} }` de volta — mesmo
contrato que o antigo callable do Firebase, então nenhum módulo Ruby precisa
mudar quando a função for implantada.

## Como criar cada Edge Function

```powershell
npm install -g supabase
supabase login
supabase functions new auto-acm-compute
# implementar em supabase/functions/auto-acm-compute/index.ts
supabase functions deploy auto-acm-compute --project-ref mxtpmkverfvyucagckey
```

Cada função deve:
1. Ler o JWT do usuário do header `Authorization` (o gateway do Supabase já
   valida a assinatura antes de chamar a função quando `verify_jwt` está
   ativado — comportamento padrão).
2. Ler `{ data: {...} }` do corpo da requisição.
3. Rodar o cálculo e devolver `{ result: {...} }`.
4. Validar módulo/licença se a lógica de negócio exigir verificação adicional
   além do JWT (ex.: checar `public.users`/`public.licenses` via o client
   Supabase server-side dentro da função, usando a service role só ali
   dentro — nunca no plugin).

## Segurança

- Nunca colocar `service_role` no plugin ou no GitHub — só dentro das Edge
  Functions (variável de ambiente do próprio Supabase).
- Nunca colocar senhas no código, `.env` ou migrações.
- A `publishable key` do Supabase é pública por design; quem protege os
  dados são as políticas de RLS + Supabase Auth, não o segredo da chave.
