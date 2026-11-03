# MotoRadar v0.5 — navegação em primeiro plano

- **Problema:** o app exibia a rota meteorológica, mas não acompanhava a moto nem orientava manobras.
- **Escolha:** ampliar o PWA Leaflet + OSRM, sem API proprietária, mantendo GPS, radar e oito pontos intermediários.
- **Alternativas descartadas:** redirecionar ao Waze (perderia a camada de radar); Navigation SDK do Google (exige conta/faturamento e app nativo).
- **Fluxo:** calcular roteiro → iniciar navegação → obter GPS preciso → recalcular rota a partir do local → seguir o traçado com voz pt-BR e instruções de OSRM `steps=true` → reorientar após três desvios consistentes e cooldown de 90s → encerrar e recuperar o roteiro.
- **Segurança:** protótipo auxiliar, requer tela ligada e app em primeiro plano; sem tráfego em tempo real, sem offline, sem alertas de risco de viagem. Nunca interagir com controles em movimento.
- **Testes:** unitários de manobras, desvios/precisão do GPS, múltiplas paradas, Playwright para iniciar/encerrar navegação e regressões do radar e planejamento.
- **Implantação:** commit na `main` aciona GitHub Actions de pytest/Playwright e Firebase Hosting, desde que o segredo configurado permaneça válido.
