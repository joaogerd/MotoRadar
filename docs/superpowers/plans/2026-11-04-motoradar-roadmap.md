# Plano de execução: MotoRadar 2026-11-04

## Fluxo Git
- `develop` a partir de `main` (SHA preservado).
- `feature/ci-gitflow`: verificações em pushes e PRs para develop, deploy somente main.
- `feature/route-matching`: ajuste visual ao trajeto com confiança, sem alterar GPS para a lógica de desvios.
- `feature/trip-history-gpx`: registro local voluntário e exportação GPX com testes de serialização.
- `feature/voice-guidance`: reforço de avisos e saída de rotatórias, protegendo contra repetições e GPS ruim.
- `feature/weather-corridor`: módulo testável de análise de corredor e limites de cobertura com modo indicativo sem alertas críticos.
- `feature/smart-stops`: pesquisa de serviços opt-in, sem sobrecarga do servidor público, apresentando disponibilidade incerta.
- `feature/offline-readiness`: shell offline e itinerário local, sem violar licenciamento de tiles.
- `feature/map-perspective`: pesquisa técnica isolada de pitch MapLibre e dependências, sem misturar a migração à produção até validação.

## Passos para cada feature
1. Criar testes de aceitação; confirmar que falham no baseline.
2. Fazer mudança mínima; confirmar testes selecionados e suíte integral.
3. Conferir `node --check` para todos os JS e `firebase.json`.
4. Commit em branch própria; verificar diff e escopo.
5. Integrar em develop por fast-forward ou merge commit sem força, preservando histórico.

## Gate de produção
Somente mover `main` após a suíte completa em develop, checagem da árvore e revisão de segurança. O deploy do Firebase, por política atual, é acionado automaticamente por push em main; portanto a promoção é igualmente autorização para deploy. Se riscos residuais afetarem navegação segura, manter main intacta e relatar impeditivos.

## Foco de revisão
Uso de Nominatim/OSRM/OSM dentro de políticas, segurança do piloto, matemática geodésica, falsos positivos de radar, coerência de múltiplas paradas, privacidade de histórico GPX e PWA em background.
