# MotoRadar: CI/CD GitHub → Firebase Hosting

Repositório: https://github.com/joaogerd/MotoRadar
Site: https://motoradar-7fbd3.web.app

O workflow `.github/workflows/firebase-hosting.yml` executa testes
com pytest/Playwright e depois publica `public/` no Firebase Hosting.
Dispara a cada push em `main` ou manualmente.

## Habilitar credencial (uma vez)

É necessário o segredo `FIREBASE_SERVICE_ACCOUNT_MOTORADAR_7FBD3`.
No Google Cloud Shell, execute:

```bash
git clone https://github.com/joaogerd/MotoRadar.git
cd MotoRadar
firebase init hosting:github --project motoradar-7fbd3
```

Siga o assistente, autorize GitHub e selecione `joaogerd/MotoRadar`.
O Firebase CLI cria uma conta de serviço e grava a chave em um
secret criptografado no repositório. Não coloque a chave no código.

O assistente pode gerar outros workflows locais no Cloud Shell.
Não é necessário publicá-los: o repositório já possui seu workflow.

Depois de configurar, reexecute o workflow (botão Run workflow)
em https://github.com/joaogerd/MotoRadar/actions.

As configurações da conta de serviço precisam de permissão
adequada no projeto Firebase. Uma alternativa futura é OIDC
Workload Identity Federation, sem chave privada de longa duração.
