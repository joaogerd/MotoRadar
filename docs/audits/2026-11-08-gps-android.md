# Auditoria técnica do GPS do MotoRadar — 08/11/2026

## Evidência observada em dispositivo Android

O usuário informou deslocamento sem movimentação da motocicleta no mapa; o painel de navegação permanecia em “Localizando sua posição...” e a velocidade/distância/ETA estavam sem informação. O diagnóstico v21 apresentou:

- `Estado: planejamento` (momento da cópia, não necessariamente o estado do print anterior);
- `Monitor GPS: ativo` e `aquisição avulsa: não`;
- `Última leitura: sem leitura` e `precisão: indisponível`;
- `Erro GPS: nenhum`;
- `Erro de roteamento: nenhum`.

**Interpretação:** um ID de `watchPosition` existente significa apenas que foi solicitada uma assinatura. Não demonstra que o navegador produziu posições. No instante do diagnóstico, o aplicativo não registrara nenhuma posição nem erro no ciclo atual. Não há prova de defeito no hardware ou de ausência de permissão; o problema pode ser navegador/Android, mas também foi identificado bloqueio interno de recuperação.

## Fluxo de dados auditado

1. `enableGPS(false)` chama `navigator.geolocation.watchPosition`.
2. `requestFreshNavigationGPS()` chama `getCurrentPosition` como fonte complementar.
3. `updateGPS(pos,source)` valida latitude/longitude, idade do fix, registra `gpsPoint`, `lastFixAt`, `accuracy`, `source`.
4. A etapa de renderização desenha marcador, câmera, precisão e pins, com falhas isoladas.
5. `handleNavPosition` conduz a máquina de estados: `waiting` → `building` (OSRM) → `active`; instruções dependem de `MotoNavigation.createSession`.
6. `gpsHealthTick` fiscaliza falta da primeira leitura e perda de atualizações; recuperação para watch e consulta avulsa.
7. `gpsDiagnosticsText` apresenta estado/contadores sem latitude/longitude.

## Defeitos identificados e tratamento

| Defeito anterior | Consequência | Tratamento na branch de correção |
|---|---|---|
| `const stalled=nav.lastFixAt && age>GPS_STALL_MS` | Quando `lastFixAt=0`, nunca detectava primeira leitura ausente | Comparar `now` com início do monitor e última leitura: `gpsWatchStalled()` |
| `gpsRequestPending` dependia exclusivamente do callback da API | `getCurrentPosition` silencioso bloqueava consultas futuras | Watchdog JS de 15s com resposta idempotente e serial de invalidação |
| Fallback avulso só era usado no estado `waiting` | No planejamento, monitor sem leituras não tinha recuperação autônoma | Fiscalização também em planejamento quando o usuário ativou GPS |
| `lastFixAt` atualizado após renderização e pins | Exceção de mapa podia transformar callback válido em “sem leitura” | Registrar posição antes da renderização; erros de mapa e navegação isolados |
| Retorno tardio e coordenadas em cache | Posição antiga poderia parecer atual | Rejeitar fix com timestamp superior a 60s e coordenadas inválidas |
| Diagnóstico apenas “ativo/inativo” | Não distinguia assinatura de GPS efetivo | Tempo de monitor, permissões, fonte, contagem, reinícios e erros separados |
| Mensagem de navegação persistia após encerrar | Estado `planejamento` com instrução “Localizando...” confundia o diagnóstico | Restaurar texto de planejamento ao encerrar |
| Navegador não respondeu em primeiro plano | Reabertura do aplicativo não necessariamente reiniciava aquisição | Fiscalizar ao retornar à página visível e em verificações periódicas |

## Limiar de precisão e segurança

- Leituras com precisão acima de 300 m não iniciam recalculo inicial de rota; mostram estado impreciso.
- Entre 100 e 300 m, a partida pode iniciar com indicação de precisão aproximada; instruções precisam melhorar de precisão para serem consideradas confiáveis.
- Uma leitura mais precisa ancora novamente a rota.
- Fix inválido ou antigo não deve atualizar localização.
- Nunca inferir velocidade de mudança de pontos GPS ruidosos; velocidade real é mostrada somente quando fornecida pelo navegador e com precisão suficiente.
- **Nenhuma correção web garante GPS contínuo com Android em segundo plano ou tela apagada.** Isso exigiria avaliação de aplicativo Android nativo com serviço de localização foreground e permissão apropriada.

## Testes previstos e critérios de aceitação

1. Nenhum callback do `watchPosition` após ser criado: em primeiro plano, consultar `getCurrentPosition` e reiniciar watch.
2. Callback da API avulsa nunca ocorre: liberar pendência por timeout próprio e permitir nova consulta.
3. Callback avulso após timeout: descartar resultado atrasado, evitando estado duplicado.
4. Exceção do marcador: manter leitura registrada e executar o cálculo de navegação.
5. Posição com timestamp antigo: não utilizá-la como atual.
6. Watch com posição recente: não fazer reinícios nem consultas extras desnecessárias.
7. Permissão negada: não repetir solicitação em loop.
8. Estado oculto: não tentar aquisição em background.
9. Retorno ao primeiro plano: retomar watchdog.
10. Verificação manual no **Chrome e Brave Android**, parado em local aberto, com zoom, acompanhamento, velocidade, pausa e retomada; isso ainda não é substituído pelo CI simulado.

## Próxima coleta necessária no dispositivo

Em `Configurações → Diagnóstico de localização`, comparar:
- permissão e visibilidade da página;
- idade do monitor e da última leitura;
- total de callbacks versus consultas avulsas;
- ocorrência de reinícios e erros do mapa/navegação;
- mensagem de estado.

O painel não inclui coordenadas precisas. Se os dois métodos de localização continuarem sem callbacks, investigar Android, serviços de localização e permissões do navegador; JavaScript não tem acesso direto ao chip GNSS e não pode substituir um provedor bloqueado.

## Implantação

Esta auditoria e correção são para `develop` e prévia Firebase. Não promover a `main` sem teste real em Android, verificação de CI e confirmação do fluxo ao percorrer uma rota com segurança. Não usar esta PWA como único navegador na motocicleta.
