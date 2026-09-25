# Cedros Digital · Controle de Classes

Aplicativo web para acompanhar as **classes regulares** do Clube de Desbravadores: quem está em cada classe, quais requisitos cada desbravador já cumpriu e quem está pronto para a investidura.

Ele funciona no celular e no computador e roda no **Cloudflare Workers**, com banco de dados **Cloudflare D1**, na mesma plataforma do Cedros Digital.

## O que o app faz

| Área | O que faz |
|---|---|
| **Painel** | Mostra o total de desbravadores, o progresso médio, quantos estão prontos para a investidura e um resumo por classe |
| **Desbravadores** | Cadastro com classe, unidade e data de nascimento (o app sugere a classe pela idade), com busca e filtros |
| **Checklist** | Marca os requisitos cumpridos, um por um ou por seção inteira, e registra a data e quem marcou |
| **Classes e requisitos** | As 6 classes regulares (Amigo → Guia). A diretoria cadastra os requisitos um a um ou **cola a lista inteira de uma vez** |
| **Unidades** | Agrupa os desbravadores por unidade |
| **Usuários** | Diretoria (acesso total) e conselheiros/instrutores (se tiverem uma unidade, veem só os desbravadores dela) |
| **Relatórios** | Progresso por classe e por unidade, lista de prontos para a investidura, planilha em CSV (abre no Excel) e versão para impressão |

### Cadastrar requisitos em lote

Em **Classes e requisitos → (classe) → Adicionar em lote**, cole o texto do cartão da classe. As linhas que começam com `#` definem a seção:

```
# Gerais
1. Primeiro requisito
2. Segundo requisito
# Descoberta Espiritual
1. ...
```

> Os requisitos **não vêm pré-cadastrados**. Use sempre o cartão/manual oficial mais recente da sua Associação/União, porque os requisitos mudam de tempos em tempos.

## Criar uma instância para um clube (pelo painel da Cloudflare, sem terminal)

Cada clube tem **o próprio banco de dados** e o próprio endereço, e os dados de um não se misturam com os de outro. As tabelas são criadas pelo próprio app no primeiro acesso, então basta criar um banco vazio.

1. **Criar o banco:** em [dash.cloudflare.com](https://dash.cloudflare.com), abra **Storage & Databases → D1 SQL Database → Create Database**. Dê um nome (ex.: `controle-classes-nomedoclube`) e clique em **Create**. Na página do banco, copie o **Database ID**.
2. **Ligar o banco ao app:** no GitHub, edite o arquivo `wrangler.toml`:
   - `database_id` → cole o ID copiado
   - `database_name` → o nome que você deu ao banco
   - `NOME_CLUBE` → o nome do clube que vai aparecer no app
   - `name` → o nome do app na Cloudflare, que vira o endereço (`<name>.<sua-conta>.workers.dev`)
3. **Publicar:** em **Workers & Pages → Create → Import a repository**, conecte o GitHub, escolha este repositório e confirme. O comando de deploy é `npx wrangler deploy`, que já vem preenchido. A partir daí, cada alteração na branch `main` é publicada automaticamente.
4. **Primeiro acesso:** abra o endereço do app. Ele pede para criar a conta da diretoria. Depois disso, cadastre as unidades e os requisitos das classes e crie os usuários dos conselheiros.

**Outro clube?** Faça um *fork* ou uma cópia deste repositório e repita os passos com um banco novo.

### Pelo terminal (alternativa)

```bash
npm install
npx wrangler login
npx wrangler d1 create controle-classes-nomedoclube   # copie o database_id para o wrangler.toml
npm run deploy
```

## Desenvolvimento local

```bash
npm run dev        # usa o wrangler, com banco local em .wrangler/ (tabelas criadas automaticamente)
```

Sem o wrangler (só com Node 22+):

```bash
node dev/servidor-local.mjs   # http://localhost:8787, banco em dev/local.sqlite
npm run teste                 # testes automáticos da API
```

## Estrutura

```
src/index.js          API (Worker): login, desbravadores, classes, requisitos, progresso, relatórios
public/               interface (HTML, CSS e JavaScript, sem dependências)
src/esquema.js        estrutura do banco (criada automaticamente pelo app)
dev/                  servidor local e testes (não vão para produção)
wrangler.toml         configuração do Cloudflare
```

## Segurança

- As senhas são guardadas com hash PBKDF2-SHA256 e salt individual.
- A sessão fica num cookie `HttpOnly`/`Secure` que vale por 30 dias.
- Ao desativar um usuário ou trocar a senha dele, as sessões abertas são encerradas.
- As permissões são verificadas no servidor: um conselheiro de uma unidade não consegue ver nem alterar desbravadores de outra.
