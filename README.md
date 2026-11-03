# MotoRadar 🏍️🌧️

Uma forma simples de **planejar viagens com várias paradas e consultar radar meteorológico** no mesmo mapa.

Site: https://motoradar-7fbd3.web.app/ · [CI/CD](https://github.com/joaogerd/MotoRadar/actions)

## O que existe na v0.3

- Mapa em tela cheia com painel compacto e recolhível, inspirado na simplicidade dos aplicativos de navegação;
- **Origem manual ou posição atual GPS**, destino e até **8 paradas intermediárias**, reordenáveis;
- Pesquisa de lugares pela API pública **Nominatim** (busca apenas ao tocar em pesquisar, sem autocomplete, respeitando limite de requisições), ou seleção direta de pontos no mapa;
- Traçado sobre as rodovias por **OSRM**, com o perfil de automóvel (não específico de moto);
- Radar histórico **RainViewer** com transparência, animação e máscara de cobertura, em configurações separadas;
- Botões para abrir percurso no **Google Maps** e próximo ponto no **Waze**; itinerário salvo localmente no navegador.

**Limites importantes:** a API gratuita de radar tem resolução/tempo limitados e não fornece previsão futura; mosaico e cobertura têm horários diferentes. **O Google Maps URL em navegadores móveis suporta até 3 paradas intermediárias**; a versão atual impede exportação com mais de três para não perder pontos sem avisar. O Waze abre somente o próximo ponto; não reproduz a rota inteira com paradas. O MotoRadar não faz navegação curva a curva nem informa condições seguras de pilotagem.

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
