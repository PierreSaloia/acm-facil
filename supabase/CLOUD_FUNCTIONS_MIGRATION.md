# Backend novo do SignEng

O SignEng foi separado do backend anterior. O cliente Firebase agora lê a configuração em `signeng/core/firebase_config.rb` e não aponta para nenhum projeto antigo.

## Funções novas

O novo backend deverá fornecer estas funções:

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

As URLs serão geradas automaticamente pelo cliente:

```text
https://REGION-NOVO_PROJECT_ID.cloudfunctions.net/NOME_DA_FUNCAO
```

## Configurar o novo Firebase

1. Crie um novo projeto no Firebase Console.
2. Ative Authentication com Email/Password.
3. Ative Cloud Functions.
4. Registre um app Web e copie o `projectId` e a API key pública.
5. Preencha `signeng/core/firebase_config.rb`:

```ruby
PROJECT_ID = "seu-novo-project-id".freeze
API_KEY = "sua-nova-api-key-web".freeze
REGION = "us-central1".freeze
```

6. Crie um diretório separado para as funções novas, com `firebase.json` e `functions/`.
7. Instale o Firebase CLI e faça login:

```powershell
npm install -g firebase-tools
firebase login
firebase use seu-novo-project-id
```

8. Dentro de `functions`, instale as dependências e publique:

```powershell
npm install
firebase deploy --only functions
```

## Contrato das funções

Cada função deve aceitar o envelope callable:

```json
{
  "data": {}
}
```

E retornar:

```json
{
  "result": {}
}
```

A função deve validar o Firebase ID token enviado no header `Authorization`.
Os contratos detalhados de `data` e `result` devem ser portados dos algoritmos da versão anterior ou reimplementados para o novo produto.

## Supabase

O Supabase continua responsável por dados novos como perfis, licenças, configurações e presets. Ele não substitui automaticamente os cálculos geométricos das funções. Esses cálculos precisam existir nas novas Cloud Functions ou em novas Supabase Edge Functions.

## Segurança

- Não colocar `service_role` no plugin ou no GitHub.
- Não colocar senhas no código, `.env` ou migrações.
- A API key web do Firebase pode ser pública; as regras e o Firebase Auth protegem os dados.
- Não reutilizar IDs, API keys, regras ou endpoints do backend anterior.
