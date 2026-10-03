import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
const port = 5174;
const allowedOrigins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);
const databaseUrl = process.env.DATABASE_URL || readLocalDatabaseUrl();

if (!databaseUrl) process.exit(0);

const pool = new Pool({ connectionString: databaseUrl });

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Vary", "Origin");
  if (request.method === "OPTIONS") return response.writeHead(204).end();
  if (request.url !== "/api/finance") return send(response, 404, { error: "Rota não encontrada." });

  try {
    if (request.method === "GET") return send(response, 200, await loadFinanceData());
    if (request.method === "POST") return send(response, 200, await mutateFinanceData(await readBody(request)));
    return send(response, 405, { error: "Método não permitido." });
  } catch (error) {
    console.error("Falha na ponte local do PostgreSQL", error instanceof Error ? error.message : error);
    return send(response, 500, { error: "Não foi possível acessar o PostgreSQL local." });
  }
});

server.listen(port, "127.0.0.1", async () => {
  try {
    await pool.query("select 1");
    console.log(`PostgreSQL local conectado em http://127.0.0.1:${port}`);
  } catch (error) {
    console.error("Não foi possível conectar ao PostgreSQL local", error instanceof Error ? error.message : error);
  }
});

async function loadFinanceData() {
  await ensureExpensePaidColumn();
  await ensureBaseCategories();
  await generateRecurringExpenses();
  const { start, end } = currentMonthBounds();
  const [categoryRows, subcategoryRows, peopleRows, incomeRows, expenseRows, goalRows] = await Promise.all([
    pool.query("select id, name, kind, color, created_at as \"createdAt\" from categories order by created_at"),
    pool.query("select id, category_id as \"categoryId\", name, active from subcategories order by name"),
    pool.query("select name from people where active = true order by name"),
    pool.query("select i.id, i.description, i.amount::float8 as amount, i.date::text, i.created_at as \"createdAt\", p.name as person from incomes i join people p on p.id = i.person_id order by i.date desc, i.created_at desc"),
    pool.query("select e.id, e.description, e.amount::float8 as amount, e.date::text, e.created_at as \"createdAt\", e.category_id as \"categoryId\", e.paid, e.recurring_expense_id as \"recurringExpenseId\", s.name as subcategory, r.end_date::text as \"recurringUntil\", r.active as \"recurringActive\" from expenses e left join subcategories s on s.id = e.subcategory_id left join recurring_expenses r on r.id = e.recurring_expense_id order by e.date desc, e.created_at desc"),
    pool.query("select name, amount::float8 as amount from monthly_goals where month >= $1 and month < $2 limit 1", [start, end]),
  ]);
  return {
    configured: true,
    categories: categoryRows.rows.map((category) => ({ ...category, subcategories: subcategoryRows.rows.filter((item) => item.categoryId === category.id && item.active).map((item) => item.name) })),
    people: peopleRows.rows.map((item) => item.name),
    incomes: incomeRows.rows,
    expenses: expenseRows.rows,
    goal: goalRows.rows[0]?.amount ?? 0,
    goalName: goalRows.rows[0]?.name ?? "Meta mensal de entradas",
  };
}

async function mutateFinanceData(body) {
  await ensureExpensePaidColumn();
  const type = String(body.type || "");
  if (type === "income" || type === "incomeUpdate") {
    const person = await pool.query("insert into people (name, active) values ($1, true) on conflict (name) do update set active = true returning id", [String(body.person || "").trim()]);
    if (type === "income") await pool.query("insert into incomes (id, description, person_id, amount, date) values ($1, $2, $3, $4, $5)", [body.id, body.description, person.rows[0].id, body.amount, body.date]);
    else await pool.query("update incomes set description = $2, person_id = $3, amount = $4, date = $5 where id = $1", [body.id, body.description, person.rows[0].id, body.amount, body.date]);
    return { status: type === "income" ? "created" : "updated" };
  }
  if (type === "expense" || type === "expenseUpdate") {
    const subcategory = await pool.query("select id from subcategories where category_id = $1 and name = $2 limit 1", [body.categoryId, body.subcategory]);
    if (!subcategory.rows[0]) throw new Error("Subcategoria inválida");
    const category = await pool.query("select kind from categories where id = $1 limit 1", [body.categoryId]);
    if (body.recurring && category.rows[0]?.kind !== "fixed") throw new Error("Somente gastos fixos podem ser recorrentes");
    if (body.recurring && (!body.recurringUntil || body.recurringUntil < body.date)) throw new Error("A data final da recorrência é inválida");
    let recurrenceId = body.recurringExpenseId || null;
    if (type === "expense") {
      if (body.recurring) {
        const recurrence = await pool.query("insert into recurring_expenses (description, category_id, subcategory_id, amount, start_date, end_date) values ($1, $2, $3, $4, $5, $6) returning id", [body.description, body.categoryId, subcategory.rows[0].id, body.amount, body.date, body.recurringUntil]);
        recurrenceId = recurrence.rows[0].id;
      }
      await pool.query("insert into expenses (id, description, category_id, subcategory_id, recurring_expense_id, amount, date) values ($1, $2, $3, $4, $5, $6, $7)", [body.id, body.description, body.categoryId, subcategory.rows[0].id, recurrenceId, body.amount, body.date]);
      if (recurrenceId) await generateRecurringExpenses(recurrenceId);
    } else {
      if (recurrenceId && !body.recurring) {
        await pool.query("update expenses set recurring_expense_id = null where id = $1", [body.id]);
        await pool.query("delete from expenses where recurring_expense_id = $1", [recurrenceId]);
        await pool.query("delete from recurring_expenses where id = $1", [recurrenceId]);
        recurrenceId = null;
      } else if (recurrenceId && body.recurring) {
        await pool.query("update recurring_expenses set description = $2, category_id = $3, subcategory_id = $4, amount = $5, start_date = $6, end_date = $7, active = true where id = $1", [recurrenceId, body.description, body.categoryId, subcategory.rows[0].id, body.amount, body.date, body.recurringUntil]);
        await pool.query("delete from expenses where recurring_expense_id = $1", [recurrenceId]);
        await generateRecurringExpenses(recurrenceId);
        return { status: "updated", recurringExpenseId: recurrenceId };
      } else if (!recurrenceId && body.recurring) {
        const recurrence = await pool.query("insert into recurring_expenses (description, category_id, subcategory_id, amount, start_date, end_date) values ($1, $2, $3, $4, $5, $6) returning id", [body.description, body.categoryId, subcategory.rows[0].id, body.amount, body.date, body.recurringUntil]);
        recurrenceId = recurrence.rows[0].id;
        await pool.query("delete from expenses where id = $1", [body.id]);
        await generateRecurringExpenses(recurrenceId);
        return { status: "updated", recurringExpenseId: recurrenceId };
      }
      await pool.query("update expenses set description = $2, category_id = $3, subcategory_id = $4, recurring_expense_id = $5, amount = $6, date = $7 where id = $1", [body.id, body.description, body.categoryId, subcategory.rows[0].id, recurrenceId, body.amount, body.date]);
    }
    return { status: type === "expense" ? "created" : "updated", recurringExpenseId: recurrenceId };
  }
  if (type === "expensePaid") {
    const result = await pool.query("update expenses set paid = $2 where id = $1 returning id, paid", [body.id, Boolean(body.paid)]);
    if (!result.rows[0]) throw new Error("Conta não encontrada");
    return { status: "updated", paid: result.rows[0].paid };
  }
  if (type === "incomeDelete" || type === "expenseDelete") {
    if (type === "expenseDelete") {
      const expense = await pool.query("select e.recurring_expense_id as \"recurringExpenseId\", r.active as \"recurringActive\" from expenses e left join recurring_expenses r on r.id = e.recurring_expense_id where e.id = $1", [body.id]);
      if (expense.rows[0]?.recurringExpenseId && expense.rows[0]?.recurringActive) {
        const today = new Date().toISOString().slice(0, 10);
        await pool.query("delete from expenses where recurring_expense_id = $1 and date > $2", [expense.rows[0].recurringExpenseId, today]);
        await pool.query("update recurring_expenses set active = false where id = $1", [expense.rows[0].recurringExpenseId]);
        return { status: "deleted", recurringExpenseId: expense.rows[0].recurringExpenseId };
      }
    }
    await pool.query(`delete from ${type === "incomeDelete" ? "incomes" : "expenses"} where id = $1`, [body.id]);
    return { status: "deleted" };
  }
  if (type === "subcategory") {
    const existing = await pool.query("select id from subcategories where category_id = $1 and name = $2 limit 1", [body.categoryId, body.name]);
    if (existing.rows[0]) await pool.query("update subcategories set active = true where id = $1", [existing.rows[0].id]);
    else await pool.query("insert into subcategories (category_id, name) values ($1, $2)", [body.categoryId, body.name]);
    return { status: "created" };
  }
  if (type === "subcategoryDeactivate") {
    await pool.query("update subcategories set active = false where category_id = $1 and name = $2", [body.categoryId, body.name]);
    return { status: "removed" };
  }
  if (type === "person") {
    await pool.query("insert into people (name, active) values ($1, true) on conflict (name) do update set active = true", [String(body.name || "").trim()]);
    return { status: "created" };
  }
  if (type === "personDeactivate") {
    await pool.query("update people set active = false where name = $1", [body.name]);
    return { status: "removed" };
  }
  if (type === "goal") {
    const { start } = currentMonthBounds();
    await pool.query("insert into monthly_goals (month, amount) values ($1, $2) on conflict (month) do update set amount = excluded.amount, updated_at = now()", [start, body.amount]);
    return { status: "saved" };
  }
  if (type === "goalName") {
    const { start } = currentMonthBounds();
    await pool.query("insert into monthly_goals (month, name, amount) values ($1, $2, 0) on conflict (month) do update set name = excluded.name, updated_at = now()", [start, String(body.name || "").trim()]);
    return { status: "saved" };
  }
  throw new Error("Operação inválida");
}

async function ensureExpensePaidColumn() {
  await pool.query('alter table expenses add column if not exists paid boolean not null default false');
}

async function ensureBaseCategories() {
  const count = await pool.query("select count(*)::int as count from categories");
  if (count.rows[0].count > 0) return;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const fixed = await client.query("insert into categories (name, kind, color) values ('Fixos', 'fixed', '#6d5dfb') returning id");
    const variable = await client.query("insert into categories (name, kind, color) values ('Variáveis', 'variable', '#ff8a3d') returning id");
    await client.query("insert into subcategories (category_id, name) values ($1, 'Casa'), ($1, 'Mercado'), ($1, 'Assinaturas'), ($2, 'Transporte'), ($2, 'Lazer'), ($2, 'Outros')", [fixed.rows[0].id, variable.rows[0].id]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function generateRecurringExpenses(recurrenceId = null) {
  const recurring = recurrenceId
    ? await pool.query("select id, description, category_id as \"categoryId\", subcategory_id as \"subcategoryId\", amount, start_date::text as \"startDate\", end_date::text as \"endDate\" from recurring_expenses where active = true and id = $1 and end_date >= start_date", [recurrenceId])
    : await pool.query("select id, description, category_id as \"categoryId\", subcategory_id as \"subcategoryId\", amount, start_date::text as \"startDate\", end_date::text as \"endDate\" from recurring_expenses where active = true and end_date >= start_date");
  for (const item of recurring.rows) {
    for (let monthOffset = 0; monthOffset < 1200; monthOffset += 1) {
      const occurrenceDate = monthlyOccurrence(item.startDate, monthOffset);
      if (occurrenceDate > item.endDate) break;
      await pool.query("insert into expenses (description, category_id, subcategory_id, recurring_expense_id, amount, date) values ($1, $2, $3, $4, $5, $6) on conflict (recurring_expense_id, date) do nothing", [item.description, item.categoryId, item.subcategoryId, item.id, item.amount, occurrenceDate]);
    }
  }
}

function monthlyOccurrence(startDate, monthOffset) {
  const [year, month, day] = startDate.split("-").map(Number);
  const targetMonth = month - 1 + monthOffset;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function currentMonthBounds() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(year, month + 1, 1));
  return { start, end: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01` };
}

function readLocalDatabaseUrl() {
  try {
    const contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const match = contents.match(/^DATABASE_URL=(.*)$/m);
    return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") || "";
  } catch { return ""; }
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { data += chunk; if (data.length > 1_000_000) request.destroy(); });
    request.on("end", () => { try { resolveBody(JSON.parse(data || "{}")); } catch (error) { reject(error); } });
    request.on("error", reject);
  });
}

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

const shutdown = () => server.close(() => pool.end().finally(() => process.exit(0)));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
