# Saldo

Controle financeiro minimalista para registrar entradas por pessoa, gastos por categoria e subcategoria, acompanhar a meta mensal e visualizar a distribuição dos gastos.

## Rodar localmente

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run dev
```

Defina `DATABASE_URL` com uma conexão PostgreSQL para persistência compartilhada. Sem essa variável, a interface usa armazenamento persistente no navegador, mantendo as alterações no mesmo dispositivo após recarregar a página.

## Banco de dados

O schema Drizzle fica em `db/schema.ts`; a primeira migração está em `drizzle/0000_tense_blade.sql`. Para aplicar a migração em um banco configurado:

```bash
npx drizzle-kit migrate
```

## Verificação

```bash
npm run lint
npm run build
```
