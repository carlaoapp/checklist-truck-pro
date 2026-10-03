# Checklist Truck Pro - Bitrem & Frotas Rodoviárias

Aplicativo Web Progressivo (PWA) de alta eficiência e ergonomia mobile, desenvolvido especialmente para motoristas rodoviários, caminhoneiros e gestores de frota.

## Principais Funcionalidades

- **100% Offline-First:** Funciona perfeitamente em trechos de estrada sem qualquer sinal de internet celular ou Wi-Fi. Todas as vistorias, notas, fotos e vídeos são salvos instantaneamente no armazenamento seguro local do celular (IndexedDB).
- **Mídias Integradas por Item:** Cada caixinha de verificação (Freios, Pneus, Suspensão, etc.) possui botões dedicados para capturar fotos e gravar vídeos diretamente pela câmera do aparelho ou anexar da galeria, com download automático para o telefone.
- **Gestão de Vistorias:** Aba dedicada para gerenciar vistorias **Pendentes** e **Concluídas**, com ações rápidas para Editar, Concluir/Reabrir, excluir e exportar relatórios diretos para o WhatsApp.
- **Identidade e Temas:** Foto oficial do caminhão Scania na tela de entrada e nos ícones de instalação PWA; seletor com 7 paletas de cores corporativas (Preto, Azul, Verde, Roxo, Cinza, Rosa, Claro).
- **Padrão Profissional:** Interface sóbria e focada em produtividade com ícones vetoriais SVG e sem excesso de emojis.

## Como Executar Localmente

```bash
npm start
```
O servidor iniciará em `http://localhost:3000` (ou na porta definida pela variável `PORT`).

## Deploy no Render

1. Crie um **Web Service** ou **Static Site** no painel do [Render](https://dashboard.render.com).
2. Conecte ao repositório GitHub `checklist-truck-pro`.
3. Se Web Service:
   - **Build Command:** `npm install` (ou deixe em branco)
   - **Start Command:** `node server.js`
4. Se Static Site:
   - **Publish Directory:** `public`
