# MotoRadar 🏍️🌧️

Mapa meteorológico com radar de precipitação histórico (RainViewer), GPS e rotas sobre OpenStreetMap.

**Versão:** 0.2 (PWA estática). **Firebase Hosting:** https://motoradar-7fbd3.web.app

## Principais recursos
- Mosaico de radar histórico (não é previsão/nowcasting) e ajuste de opacidade;
- GPS, posicionamento no mapa e indicação de idade do mosaico;
- Busca de destino por nome (Nominatim) e rota estimada por OSRM (perfil de carro);
- Abrir destino no Google Maps/Waze e adicionar o site à tela inicial.

Os recursos de mapas/radar dependem de serviços externos e conexão. Ecos não implicam chuva na superfície; ausência de eco não prova cobertura. Não opere o aplicativo enquanto pilota.

## Desenvolvimento
Este projeto é estático, sem build. Abra `public/index.html` num servidor local com HTTPS/localhost. O Hosting publica a pasta `public/`, conforme `firebase.json`.

## Deploy automático
Push na branch `main` → GitHub Actions → Firebase Hosting (projeto `motoradar-7fbd3`). Requer configuração **única** do segredo de repositório `FIREBASE_SERVICE_ACCOUNT_MOTORADAR_7FBD3`.

Para configurar a credencial pelo Firebase CLI, a partir de um clone do repositório no Cloud Shell:
```bash
firebase init hosting:github --project motoradar-7fbd3
```
Escolha `joaogerd/MotoRadar` e a branch `main` quando solicitado. A CLI cria uma conta de serviço restrita e grava a chave como segredo criptografado no GitHub. **Não comite nenhuma chave JSON.** Após a configuração, um novo commit em `main` disparará a publicação.

Acompanhe em https://github.com/joaogerd/MotoRadar/actions. Projeto para prototipagem pessoal; revise licenças, cotas e privacidade antes de escalar o uso.
