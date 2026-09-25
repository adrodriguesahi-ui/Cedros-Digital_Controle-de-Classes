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

## Publicar no Cloudflare (primeira vez)

Você precisa do [Node.js](https://nodejs.org) instalado e de uma conta Cloudflare (a mesma do Cedros Digital).

```bash
git clone https://github.com/adrodriguesahi-ui/Cedros-Digital_Controle-de-Classes.git
cd Cedros-Digital_Controle-de-Classes
npm install
npx wrangler login

# 1. Criar o banco de dados
npx wrangler d1 create cedros-controle-classes
#    → copie o "database_id" mostrado e cole no arquivo wrangler.toml

# 2. Criar as tabelas e publicar
npm run deploy
```

Ao final, o wrangler mostra o endereço do app (algo como `https://cedros-controle-classes.<sua-conta>.workers.dev`).

**Primeiro acesso:** ao abrir o endereço pela primeira vez, o app pede para criar a conta da diretoria. Depois disso, cadastre as unidades e os requisitos, e crie os usuários dos conselheiros em **Usuários**.

### Atualizações

Depois de alterar o código, rode `npm run deploy` de novo. Esse comando aplica as migrações novas do banco (se houver) e publica a nova versão.

### Publicar automaticamente pelo GitHub (opcional)

No painel da Cloudflare, abra **Workers & Pages → Create → Import a repository**, escolha este repositório e use `npx wrangler deploy` como comando de deploy. Assim, cada push na branch `main` publica o app sozinho. Rode `npm run db:migrar` sempre que uma migração nova for adicionada.

## Desenvolvimento local

```bash
npm run dev        # usa o wrangler, com banco local em .wrangler/
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
migrations/           estrutura do banco D1
dev/                  servidor local e testes (não vão para produção)
wrangler.toml         configuração do Cloudflare
```

## Segurança

- As senhas são guardadas com hash PBKDF2-SHA256 e salt individual.
- A sessão fica num cookie `HttpOnly`/`Secure` que vale por 30 dias.
- Ao desativar um usuário ou trocar a senha dele, as sessões abertas são encerradas.
- As permissões são verificadas no servidor: um conselheiro de uma unidade não consegue ver nem alterar desbravadores de outra.
