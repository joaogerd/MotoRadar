# MotoRadar — evolução segura da navegação e meteorologia (2026-11-04)

## Objetivo
Evoluir a PWA existente sem sacrificar a operação de `main`: maior robustez de navegação na estrada, exportação/histórico local, avisos de radar cientificamente defensáveis e condições de manutenção profissional por CI.

## Auditoria de base
- GitHub `joaogerd/MotoRadar`: `main` em `90129efa`, inicialmente única branch; 28 entradas na árvore, sem issues abertas, último Actions em sucesso.
- Front-end HTML/CSS/JS estático + Leaflet 1.9.4 e extensão de rotação; Firebase Hosting; sem bundler ou backend.
- OSRM demo: itinerários de automóvel, instruções, geom. GeoJSON, replanejamento com intervalo de espera; sem trânsito ou SLA.
- RainViewer: mosaico histórico transparente, atualização e máscara de cobertura; zoom nativo 7, sem nowcasting. Ausência de eco ≠ ausência de cobertura.
- Nominatim público: busca manual, sem autocomplete, com intervalo. Serviço de melhor esforço.
- GPS em primeiro plano, Wake Lock, PWA fullscreen, mensagens por voz e câmera seguidora estão implementados, sujeitos às limitações de Chrome Android.
- Testes originais: pytest/Playwright + Node; 14 passaram no espelho local da v0.8. Sem build; `node --check` é a verificação JS disponível.
- O conector do GitHub é o ponto de verdade remoto; o diretório local é um espelho do ZIP de v0.8, não é um clone com `.git`. Não pode comprovar arquivos não commitados nos dispositivos do usuário, portanto nenhum deles será descartado.

## Decisões de arquitetura
1. `main` só recebe integração testada de `develop`, com GitHub Actions implantando exclusivamente `main`.
2. Branches `feature/*`, `fix/*`, `refactor/*` criadas de `develop`, integradas sem `force` e com commits semânticos.
3. Melhorias incrementais em módulos JS sem dependências de build; interfaces exercitáveis via Node e navegador.
4. Geoposicionamento observado é preservado para cálculo de desvio; posição ajustada à rota é apenas representação e exige confiança e proximidade para evitar falsos alinhamentos.
5. Registros de viagem somente com adesão explícita, armazenamento local e exportação GPX; coleta em segundo plano não prometida.
6. Informações meteorológicas derivadas são sinalizadas como indicativas/experimentais; nenhum nowcasting ou alerta de segurança sem validação de dados/licença/cobertura.
7. Não implementar prefetch de `tile.openstreetmap.org` nem afirmar roteamento offline. Estender somente shell PWA e itinerários já salvos.
8. 3D inclinado completo depende de migração de Leaflet para um motor com pitch (MapLibre GL JS), uso de tiles licenciados e testes móveis; não simular 3D com CSS que distorce a geometria. Priorizar protótipo isolado e deixar a migração de produção condicionada a validação.

## Critérios de aceitação
- Suite antiga continua verde; testes novos para confiança GPS, GPX, privacidade, manobras, meteorologia e UI.
- Testes automáticos em develop e feature, Firebase deploy somente após teste de main.
- Falha de provedor externo não bloqueia UI e não inventa medições.
- Sem segredos em arquivos ou commits.
- Roteiro Brasília e 8 paradas existentes mantidos.

## Impedimentos operacionais verificáveis
- APIs demo não fornecem SLA, nem dados meteorológicos quantitativos validados para risco rodoviário.
- PWA pode perder GPS e voz com tela bloqueada.
- OSM raster proíbe pré-download de regiões para offline.
- Hardware Android e serviços remotos não são simulados por testes de integração locais.
