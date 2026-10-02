import { and, eq, gte, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { categories, expenses, incomes, monthlyGoals, people, subcategories } from "@/db/schema";

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ configured: false, error: "A conexão com o PostgreSQL ainda não foi configurada." }, { status: 503 });
  try {
    const db = getDb();
    let categoryRows = await db.select().from(categories);
    if (!categoryRows.length) {
      categoryRows = await db.insert(categories).values([
        { name: "Fixos", kind: "fixed", color: "#6d5dfb" },
        { name: "Variáveis", kind: "variable", color: "#ff8a3d" },
      ]).returning();
      const fixed = categoryRows.find((item) => item.kind === "fixed");
      const variable = categoryRows.find((item) => item.kind === "variable");
      if (fixed && variable) await db.insert(subcategories).values([
        { categoryId: fixed.id, name: "Casa" }, { categoryId: fixed.id, name: "Mercado" }, { categoryId: fixed.id, name: "Assinaturas" },
        { categoryId: variable.id, name: "Transporte" }, { categoryId: variable.id, name: "Lazer" }, { categoryId: variable.id, name: "Outros" },
      ]);
    }
    const { start, end } = currentMonthBounds();
    const [subcategoryRows, peopleRows, incomeRows, expenseRows, goalRows] = await Promise.all([
      db.select().from(subcategories), db.select().from(people),
      db.select({ id: incomes.id, description: incomes.description, amount: incomes.amount, date: incomes.date, createdAt: incomes.createdAt, person: people.name }).from(incomes).innerJoin(people, eq(incomes.personId, people.id)),
      db.select({ id: expenses.id, description: expenses.description, amount: expenses.amount, date: expenses.date, createdAt: expenses.createdAt, categoryId: expenses.categoryId, subcategory: subcategories.name }).from(expenses).leftJoin(subcategories, eq(expenses.subcategoryId, subcategories.id)),
      db.select().from(monthlyGoals).where(and(gte(monthlyGoals.month, start), lt(monthlyGoals.month, end))),
    ]);
    return NextResponse.json({ configured: true, categories: categoryRows.map((category) => ({ ...category, subcategories: subcategoryRows.filter((item) => item.categoryId === category.id && item.active).map((item) => item.name) })), people: peopleRows.filter((item) => item.active).map((item) => item.name), incomes: incomeRows.map((item) => ({ ...item, amount: Number(item.amount) })), expenses: expenseRows.map((item) => ({ ...item, amount: Number(item.amount) })), goal: goalRows[0] ? Number(goalRows[0].amount) : 0 });
  } catch (error) { console.error("Falha ao carregar dados financeiros", error); return NextResponse.json({ error: "Não foi possível acessar o banco de dados." }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ configured: false, error: "A conexão com o PostgreSQL ainda não foi configurada." }, { status: 503 });
  try {
    const db = getDb();
    const body = await request.json() as Record<string, unknown>;
    if (body.type === "income") {
      const personName = String(body.person ?? "").trim();
      const existing = await db.select().from(people).where(eq(people.name, personName)).limit(1);
      const person = existing[0] ?? (await db.insert(people).values({ name: personName }).returning())[0];
      if (!person.active) await db.update(people).set({ active: true }).where(eq(people.id, person.id));
      const [created] = await db.insert(incomes).values({ id: String(body.id), description: String(body.description), personId: person.id, amount: String(body.amount), date: String(body.date) }).returning();
      return NextResponse.json(created, { status: 201 });
    }
    if (body.type === "expense") {
      const category = await db.select().from(categories).where(eq(categories.id, String(body.categoryId))).limit(1);
      if (!category[0]) return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
      const sub = await db.select().from(subcategories).where(and(eq(subcategories.categoryId, category[0].id), eq(subcategories.name, String(body.subcategory)))).limit(1);
      if (!sub[0]) return NextResponse.json({ error: "Subcategoria inválida" }, { status: 400 });
      const [created] = await db.insert(expenses).values({ id: String(body.id), description: String(body.description), categoryId: category[0].id, subcategoryId: sub[0].id, amount: String(body.amount), date: String(body.date) }).returning();
      return NextResponse.json(created, { status: 201 });
    }
    if (body.type === "incomeUpdate") {
      const personName = String(body.person ?? "").trim();
      const existing = await db.select().from(people).where(eq(people.name, personName)).limit(1);
      const person = existing[0] ?? (await db.insert(people).values({ name: personName }).returning())[0];
      if (!person.active) await db.update(people).set({ active: true }).where(eq(people.id, person.id));
      await db.update(incomes).set({ description: String(body.description), personId: person.id, amount: String(body.amount), date: String(body.date) }).where(eq(incomes.id, String(body.id)));
      return NextResponse.json({ status: "updated" });
    }
    if (body.type === "expenseUpdate") {
      const category = await db.select().from(categories).where(eq(categories.id, String(body.categoryId))).limit(1);
      if (!category[0]) return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
      const sub = await db.select().from(subcategories).where(and(eq(subcategories.categoryId, category[0].id), eq(subcategories.name, String(body.subcategory)))).limit(1);
      if (!sub[0]) return NextResponse.json({ error: "Subcategoria inválida" }, { status: 400 });
      await db.update(expenses).set({ description: String(body.description), categoryId: category[0].id, subcategoryId: sub[0].id, amount: String(body.amount), date: String(body.date) }).where(eq(expenses.id, String(body.id)));
      return NextResponse.json({ status: "updated" });
    }
    if (body.type === "incomeDelete") {
      await db.delete(incomes).where(eq(incomes.id, String(body.id)));
      return NextResponse.json({ status: "deleted" });
    }
    if (body.type === "expenseDelete") {
      await db.delete(expenses).where(eq(expenses.id, String(body.id)));
      return NextResponse.json({ status: "deleted" });
    }
    if (body.type === "subcategory") {
      const category = await db.select().from(categories).where(eq(categories.id, String(body.categoryId))).limit(1);
      if (!category[0]) return NextResponse.json({ error: "Categoria não encontrada" }, { status: 400 });
      const existing = await db.select().from(subcategories).where(and(eq(subcategories.categoryId, category[0].id), eq(subcategories.name, String(body.name)))).limit(1);
      const [created] = existing[0] ? await db.update(subcategories).set({ active: true }).where(eq(subcategories.id, existing[0].id)).returning() : await db.insert(subcategories).values({ categoryId: category[0].id, name: String(body.name) }).returning();
      return NextResponse.json(created, { status: 201 });
    }
    if (body.type === "subcategoryDeactivate") {
      await db.update(subcategories).set({ active: false }).where(and(eq(subcategories.categoryId, String(body.categoryId)), eq(subcategories.name, String(body.name))));
      return NextResponse.json({ status: "removed" });
    }
    if (body.type === "person") {
      const name = String(body.name).trim();
      const existing = await db.select().from(people).where(eq(people.name, name)).limit(1);
      const [created] = existing[0] ? await db.update(people).set({ active: true }).where(eq(people.id, existing[0].id)).returning() : await db.insert(people).values({ name }).returning();
      return NextResponse.json(created, { status: 201 });
    }
    if (body.type === "personDeactivate") {
      await db.update(people).set({ active: false }).where(eq(people.name, String(body.name)));
      return NextResponse.json({ status: "removed" });
    }
    if (body.type === "goal") {
      const { start } = currentMonthBounds();
      const existing = await db.select().from(monthlyGoals).where(eq(monthlyGoals.month, start)).limit(1);
      if (existing[0]) await db.update(monthlyGoals).set({ amount: String(body.amount), updatedAt: new Date() }).where(eq(monthlyGoals.id, existing[0].id));
      else await db.insert(monthlyGoals).values({ month: start, amount: String(body.amount) });
      return NextResponse.json({ status: "saved" });
    }
    return NextResponse.json({ error: "Operação inválida" }, { status: 400 });
  } catch (error) { console.error("Falha ao salvar dado financeiro", error); return NextResponse.json({ error: "Não foi possível salvar no banco de dados." }, { status: 500 }); }
}

function currentMonthBounds() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(year, month + 1, 1));
  const end = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}
