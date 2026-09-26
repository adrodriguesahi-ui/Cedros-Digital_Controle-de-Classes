# App do Clube de Desbravadores

Versão **multi-clube** do [Cedros Digital](https://github.com/adrodriguesahi-ui/cedros-digital). O app é o mesmo, com Classes Regulares, Agenda, Unidades, Especialidades, Tesouraria, Secretaria e os outros módulos, mas foi preparado para que **qualquer clube tenha a sua própria instância**, com banco de dados, nome, logo e unidades próprios.

Cada instância é formada por quatro partes:

| Parte | O que é | Onde fica |
|---|---|---|
| **Banco de dados** | Um projeto Supabase só deste clube | supabase.com |
| **Configuração** | Nome do clube, código, endereço e chaves do Supabase | arquivo [`clube.js`](clube.js) |
| **Site** | O app publicado | Cloudflare Workers |
| **APK Android** | Compilado automaticamente pelo GitHub | aba **Releases** do repositório |

---

## Passo a passo para colocar o app no ar

### 1. Criar o banco de dados (Supabase)

1. Entre em [supabase.com](https://supabase.com) e clique em **New project**. Dê o nome do clube, crie uma senha para o banco e escolha a região **South America (São Paulo)**.
2. Quando o projeto estiver pronto, abra **SQL Editor → New query**. Cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Faça o mesmo com [`supabase/storage.sql`](supabase/storage.sql). Ele cria as pastas de fotos e documentos.
4. Em **Project Settings → API**, copie a **Project URL** e a chave pública (**anon public** ou **publishable key**).

### 2. Configurar o app (`clube.js`)

No GitHub, abra o arquivo [`clube.js`](clube.js), clique no lápis ✏️ e preencha estes campos:

```js
appNome: 'Estrela Digital',             // nome do app
nomeClube: 'Estrela do Norte',          // sem o "Clube de Desbravadores"
codigoClube: '12345',                   // código do clube (aparece nas fichas em PDF)
urlPublica: '',                         // preencha depois do passo 3
supabaseUrl: 'https://xxxx.supabase.co',
supabaseAnonKey: 'sb_publishable_...',
```

Salve com **Commit changes**.

**Logo:** troque o arquivo `logo.png` pelo logo do clube (PNG quadrado, de preferência com fundo transparente). Se quiser, troque também os ícones `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` e `apple-touch-icon.png`. Nos textos do app, o nome aparece sozinho, porque é lido do `clube.js`. Os arquivos `manifest.json` (nome do app instalado) e `wrangler.toml` (nome na Cloudflare) precisam ser editados à mão.

### 3. Publicar o site (Cloudflare)

1. No painel da Cloudflare, abra **Workers & Pages → Create → Import a repository** e escolha este repositório.
2. **Build command:** nenhum. **Deploy command:** `npx wrangler deploy`.
3. Depois do primeiro deploy, abra **Settings → Domains** e ative a URL `*.workers.dev`.
4. Copie o endereço do app e cole em `urlPublica` no `clube.js`. Esse endereço é usado nos links e nos QR Codes.
5. No Supabase, abra **Authentication → URL Configuration** e coloque o mesmo endereço em **Site URL**. Os e-mails de confirmação e de "esqueci minha senha" usam esse endereço.

A partir daí, cada alteração salva no GitHub é publicada automaticamente.

### 4. Criar o primeiro Administrador

1. Abra o app e faça um cadastro normal em **Cadastre-se**. Na unidade, escolha **Diretoria do Clube**.
2. No Supabase, abra o **SQL Editor** e cole o conteúdo de [`supabase/primeiro-admin.sql`](supabase/primeiro-admin.sql). Troque o e-mail pelo que você usou no cadastro e clique em **Run**.
3. Entre no app com esse e-mail. Os próximos cadastros são aprovados pelo próprio app, em **Administração → Aprovações Pendentes**.

### 5. Cadastrar as unidades

No app, abra **Unidades → + Nova unidade**. Só Administrador e Diretoria Executiva veem esse botão. Dentro de cada unidade, em **Configurações**, dá para trocar a cor e marcar a unidade como inativa. As unidades novas aparecem no cadastro de membros, no painel de Administração e no ranking.

Se quiser um brasão no lugar da bolinha de cor, preencha a coluna `emblema` da tabela `unidades` no Supabase (**Table Editor**) com o endereço de uma imagem.

---

## App Android (APK)

O APK é compilado **automaticamente pelo GitHub** sempre que o app muda (arquivo `.github/workflows/android-build.yml`). Para baixar:

- abra a aba **Releases** do repositório → **"App do clube — APK mais recente"** (o link não muda), ou
- abra a aba **Actions** → a execução mais recente de **Build Android APK** → **Artifacts**.

O identificador do app Android é `org.cedrosdolibano.classes`, diferente do Cedros Digital, então os dois podem ficar instalados no mesmo celular. O APK é de **debug**: serve para instalar direto no celular, mas não para publicar na Play Store.

Para gerar localmente (precisa do Node.js e do Android Studio):

```bash
npm install
npm run android:open   # gera www/, sincroniza android/ e abre no Android Studio
```

## iPhone

Sem conta Apple Developer: abra o site no Safari → **Compartilhar → Adicionar à Tela de Início**. O app fica instalado com ícone próprio e tela cheia.

O app nativo para iOS fica em `ios/` (bundle `org.cedrosdolibano.classes`). Compilar e assinar exige um Mac com Xcode e uma conta Apple Developer paga:

```bash
npm install
npm run ios:open
```

---

## Criar mais uma instância para outro clube

1. Crie um repositório novo e copie este código para ele (ou peça ao Claude para fazer isso).
2. Repita os passos 1 a 5 com um **projeto Supabase novo**. Cada clube precisa do seu banco, para que os dados não se misturem.
3. Para ter um APK separado, troque `org.cedrosdolibano.classes` por outro identificador em `capacitor.config.json`, `android/app/build.gradle` e `android/app/src/main/res/values/strings.xml`, e mova a pasta `android/app/src/main/java/org/clubedigital/app/` para o novo caminho.

## Segurança: ponto de atenção

As regras de acesso do banco (RLS em `supabase/schema.sql`) estão como **"acesso público"**, igual no Cedros Digital original. Na prática, quem tiver a chave pública, que fica visível no código do site, consegue ler e alterar os dados diretamente pela API do Supabase, sem passar pelas telas do app. Para uso interno de um clube isso costuma bastar. Se os dados forem sensíveis, vale restringir essas regras para usuários autenticados.

## Estrutura

```
clube.js              configuração do clube (único arquivo a editar)
index.html            o app (login.html é uma cópia idêntica)
logo.png              logo do clube
supabase/schema.sql   estrutura do banco
supabase/storage.sql  pastas de arquivos (fotos, documentos)
supabase/primeiro-admin.sql  libera o primeiro Administrador
android/, ios/        apps nativos (Capacitor)
wrangler.toml         publicação na Cloudflare
```
