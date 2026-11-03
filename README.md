# MotoRadar 🏍️🌧️

Uma forma simples de **planejar viagens com várias paradas e consultar radar meteorológico** no mesmo mapa.

Site: https://motoradar-7fbd3.web.app/ · [CI/CD](https://github.com/joaogerd/MotoRadar/actions)

## O que existe na v0.5

- Mapa em tela cheia com painel compacto e recolhível, inspirado na simplicidade dos aplicativos de navegação;
- **Origem manual ou posição atual GPS**, destino e até **8 paradas intermediárias**, reordenáveis;
- Pesquisa de lugares pela API pública **Nominatim** (busca apenas ao tocar em pesquisar, sem autocomplete, respeitando limite de requisições), ou seleção direta de pontos no mapa;
- Traçado sobre as rodovias por **OSRM**, com o perfil de automóvel (não específico de moto);
- Radar histórico **RainViewer** com transparência, animação e máscara de cobertura, em configurações separadas;
- Botões para abrir percurso no **Google Maps** e próximo ponto no **Waze**; itinerário salvo localmente no navegador.
- **Roteiro Brasília** com 8 paradas, saída e retorno ao Dok Hotel (ADE Conjunto 16, Lote 35), acessível pelo link [Abrir o passeio](https://motoradar-7fbd3.web.app/?roteiro=brasilia) ou pelo botão no planejador. Os pontos são previamente georreferenciados, e o traçado por rodovias é calculado ao abrir o link.

**Limites importantes:** a API gratuita de radar tem resolução/tempo limitados e não fornece previsão futura; mosaico e cobertura têm horários diferentes. **O Google Maps URL em navegadores móveis suporta até 3 paradas intermediárias**; a versão atual impede exportação com mais de três para não perder pontos sem avisar. O Waze abre somente o próximo ponto; não reproduz a rota inteira com paradas. A versão 0.5 inclui navegação experimental em primeiro plano, mas não substitui um aplicativo de navegação rodoviária validado.

## Navegação experimental (v0.5)

1. Planeje a saída, até oito paradas e o destino, ou carregue o passeio Brasília.
2. Toque **Mostrar rota no mapa** e depois **Iniciar navegação neste mapa**.
3. Autorize o GPS em HTTPS. O app recalcula o trajeto a partir da posição real, sem mudar o roteiro salvo.
4. Mantenha a página do Chrome aberta e o celular visível: o mapa segue o GPS, informa a próxima manobra, distância e tempo aproximado. A voz usa a síntese de voz disponível no aparelho (pt-BR).
5. Para encerrar toque **Encerrar**. O roteiro planejado é restaurado.

**Restrições de segurança:** o serviço público de demonstração OSRM usa perfil de automóvel, não inclui trânsito, interdições ou condições em tempo real e não garante disponibilidade. O projeto respeita um intervalo mínimo entre requisições e limita recálculos após desvios consecutivos. O radar é histórico e não indica segurança de tráfego. O GPS depende da permissão do navegador; ao bloquear a tela/trocar de aplicativo, o Android pode suspender a localização e a fala. O Wake Lock tenta manter a tela ativa, mas o sistema pode recusá-lo. **Não use como navegador principal pilotando, não interaja com controles em movimento e valide os trajetos antes de sair.**

**Privacidade:** coordenadas enviadas ao roteador público OSRM para cálculo de rota; trajetos planejados são mantidos no armazenamento local do navegador. Não armazenamos histórico de deslocamento em servidor próprio.

## Desenvolvimento

PWA estática em `public/`, sem compilação. Abra `public/index.html` num servidor HTTP local, ou use Hosting para disponibilizar GPS via HTTPS. Não requer conta Firebase no navegador do usuário.

```bash
python -m http.server 8000 --directory public
```

Para testes locais:

```bash
python -m pip install pytest playwright
python -m playwright install chromium
pytest -q
node --check public/app.js
```

## Implantação

GitHub Actions em `.github/workflows/firebase-hosting.yml` roda os testes a cada push em `main`, depois publica `public/` no Firebase Hosting `motoradar-7fbd3`. O segredo criptografado `FIREBASE_SERVICE_ACCOUNT_MOTORADAR_7FBD3` precisa estar configurado no repositório. Não comite chaves privadas.

Serviços externos: [OpenStreetMap](https://www.openstreetmap.org/copyright), [Nominatim](https://operations.osmfoundation.org/policies/nominatim/), [OSRM](https://project-osrm.org/), [RainViewer](https://www.rainviewer.com/api/weather-maps-api.html). Prototipagem pessoal; para uso público em escala, será necessário revisar limites e condições dos serviços.

## Origem das coordenadas do passeio Brasília

- Dok Hotel: https://www.ehotelsreviews.com/dok-brasilia-hotel-unidade-aguas-claras-1468752-en (-15.877349, -48.013305). Verifique acesso e portaria no local.
- Monumentos, Pontão e Ermida: https://programeviagem.com/roteiros-de-viagem-sugeridos/roteiro-de-viagem-brasilia-e-goias/
- Ponte JK: ponto de referência sobre a ponte, conforme https://pt.wikipedia.org/wiki/Ponte_Juscelino_Kubitschek . O roteamento do OSRM poderá diferir das indicações de trânsito e não substitui um navegador GPS.

A posição dos monumentos é uma referência cartográfica, não necessariamente a localização de estacionamento ou entrada. Confira trânsito, acessos e condições meteorológicas antes de sair.
