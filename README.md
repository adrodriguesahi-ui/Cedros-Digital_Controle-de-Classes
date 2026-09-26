# Cedros Digital

App do Clube de Desbravadores Cedros do Líbano — PWA (Progressive Web App).

Publicado em: https://cedros-digital.adrodrigues-ahi.workers.dev

## Como publicar

Hospedado no **Cloudflare Workers** (Workers & Pages → "Connect to Git"), com deploy automático a cada `git push` na branch `main` — configurado via [wrangler.toml](wrangler.toml) (site estático, sem build, servido a partir da raiz do repositório).

Pra publicar do zero:
1. No painel da Cloudflare, vá em **Workers & Pages → Create → Connect to Git** e selecione este repositório.
2. Build command: nenhum. Deploy command: `npx wrangler deploy` (usa o `wrangler.toml` já no repo).
3. Depois do primeiro deploy, em **Domains**, ative o toggle da URL `*.workers.dev` (vem desativado por padrão).

## Como atualizar depois

É só dar `git push` no repositório (branch `main`) — a Cloudflare detecta o commit e publica a nova versão automaticamente.

## Backend (Supabase)

Login, cadastro e o painel de Administração usam o Supabase (Postgres + Auth) — ver [supabase/schema.sql](supabase/schema.sql) para o schema (tabelas, função de permissões padrão e RLS).

## Gerar APK

Duas formas, dependendo do que você precisa:

**PWABuilder (mais simples, sem recursos nativos)** — depois de publicado, use
https://www.pwabuilder.com/ com a URL do site publicado pra gerar o APK.

**App nativo Android via Capacitor (recursos nativos: vibração, câmera, barra
de status)** — o mesmo HTML/CSS/JS é empacotado num app Android de verdade,
usando [Capacitor](https://capacitorjs.com). O site publicado no Cloudflare
não muda em nada — isso só gera o APK.

Pré-requisitos: Node.js, [Android Studio](https://developer.android.com/studio)
(ou Android SDK + Gradle) instalados.

```bash
npm install          # instala o Capacitor e os plugins (uma vez só)
npm run android:open # gera www/, sincroniza o projeto android/ e abre no Android Studio
```

No Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

Sempre que mudar `index.html`/`login.html`/etc., rode `npm run cap:sync`
antes de gerar um novo APK (ou simplesmente `npm run android:open` de novo).

O app nativo já vem com:
- Vibração leve (haptics) ao tocar em botões e na navegação inferior
- Barra de status com a cor do tema do app
- Câmera/galeria nos uploads de foto (já funcionam via `<input type="file">`,
  sem precisar do plugin de câmera nativo)

O projeto Android fica em `android/` (versionado no repositório — só os
diretórios de build/cache são ignorados, ver `.gitignore`). `package.json`,
`android/`, `scripts/` e `capacitor.config.json` ficam de fora do site
publicado (ver `.assetsignore`).

Toda vez que algo em `index.html`/`android/**` muda, o workflow
`.github/workflows/android-build.yml` compila o APK automaticamente e
disponibiliza como artifact na aba **Actions** do repositório — dá pra
baixar e instalar sem precisar rodar nada localmente.

## iOS

**Sem conta Apple Developer (grátis, funciona hoje):** no Safari do iPhone,
abra o site publicado → **Compartilhar → Adicionar à Tela de Início**. Vira
um app instalado de verdade (ícone próprio, tela cheia, funciona offline) —
as meta tags necessárias (`apple-mobile-web-app-capable`, `apple-touch-icon`
etc.) já estão no `index.html`.

**App nativo via Capacitor (recursos nativos, como o Android):** a estrutura
já está pronta em `ios/` — mesmos plugins (haptics, câmera, barra de status).
Mas compilar/assinar um app iOS **só é possível num Mac com Xcode**, e pra
instalar em qualquer iPhone que não seja o seu (ex.: TestFlight) é preciso
uma conta **Apple Developer paga (US$ 99/ano)** — isso eu não posso criar
por você. Com a conta em mãos:

```bash
npm install
npm run ios:open   # gera www/, sincroniza o projeto ios/ e abre no Xcode
```

No Xcode: configure o **Team** (sua conta Apple Developer) em Signing &
Capabilities, e use **Product → Archive** pra gerar o build.

Sem conta paga, ainda dá pra rodar no **seu próprio** iPhone via Xcode
(assinatura pessoal gratuita, válida por 7 dias, só nesse aparelho). O
workflow `.github/workflows/ios-build.yml` compila o projeto pro Simulador
a cada mudança (sem precisar de assinatura), só pra confirmar que nada
quebrou — não gera um `.ipa` instalável num iPhone real.
