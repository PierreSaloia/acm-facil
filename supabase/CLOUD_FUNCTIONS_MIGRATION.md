# Conectar as Cloud Functions antigas

## Funcoes usadas pelo SignEng

O cliente Ruby chama estas funcoes no projeto Firebase `signeng-d876c`:

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
- `verifyMachineLicense`

A URL usada pelo plugin e:

```text
https://us-central1-signeng-d876c.cloudfunctions.net/NOME_DA_FUNCAO
```

## O que ja esta conectado

- Login novo: Supabase Auth.
- Perfil e licenca: tabelas `users` e `licenses` do Supabase.
- Compatibilidade legada: depois do login Supabase, o plugin tenta obter tambem um Firebase ID token com as mesmas credenciais.
- Calculo legado: continua usando `FirebaseClient.call_function` quando existe Firebase ID token.

## O que falta

O codigo-fonte das Cloud Functions nao esta neste repositorio. Sem ele nao e possivel fazer deploy ou reconstruir fielmente os calculos.

Tambem e necessario que a conta usada no SignEng exista no Firebase Auth antigo. Um token Supabase nao e aceito automaticamente pelas Cloud Functions Firebase antigas.

## Caminho A: manter as Cloud Functions antigas

1. Recuperar o repositorio ou backup que contem `functions/`, `package.json` e `firebase.json`.
2. Instalar o Firebase CLI.
3. Fazer login:

```powershell
firebase login
```

4. Selecionar o projeto antigo:

```powershell
firebase use signeng-d876c
```

5. Instalar dependencias dentro de `functions`:

```powershell
npm install
```

6. Verificar os nomes exportados no `functions/index.js` ou `functions/src/index.ts`.
7. Fazer deploy apenas das funcoes de calculo:

```powershell
firebase deploy --only functions:autoAcmCompute,functions:autoAcmCurvoCompute,functions:autoSigameCompute,functions:corteEncaixeCompute,functions:geoArt3D,functions:geoArtCompute,functions:logo3dCompute,functions:luminosoCompute,functions:movelParametricoCompute,functions:movelIndustrialCompute,functions:texturaSyncCompute,functions:alinharCompute
```

8. Confirmar que as regras e o `verifyMachineLicense` continuam publicados.

## Caminho B: migrar para Supabase Edge Functions

Cada funcao Firebase deve virar uma Edge Function Supabase com o mesmo contrato de entrada e saida. Os modulos Ruby nao devem receber uma lista vazia como fallback: devem chamar a funcao online e exibir erro quando ela estiver indisponivel.

Exemplo de nomes:

```text
/functions/v1/auto-acm-compute
/functions/v1/auto-acm-curvo-compute
/functions/v1/auto-sigame-compute
```

A migracao exige transportar o algoritmo real de cada Cloud Function. Criar apenas tabelas SQL nao substitui esses calculos.

## Nao fazer

- Nao colocar `service_role` no plugin ou no GitHub.
- Nao tentar criar/deployar funcoes usando a chave `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Nao considerar `server.js` atual como backend de producao: ele ainda contem respostas mock para preview.
