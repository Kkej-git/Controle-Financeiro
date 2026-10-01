import { and, eq, gte, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { categories, expenses, incomes, monthlyGoals, people, subcategories } from "@/db/schema";

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ configured: false }, { status: 503 });
  try {
    const db = getDb();
    const [categoryRows, subcategoryRows, incomeRows, expenseRows, goalRows] = await Promise.all([
      db.select().from(categories), db.select().from(subcategories),
      db.select({ id: incomes.id, description: incomes.description, amount: incomes.amount, date: incomes.date, person: people.name }).from(incomes).innerJoin(people, eq(incomes.personId, people.id)),
      db.select({ id: expenses.id, description: expenses.description, amount: expenses.amount, date: expenses.date, categoryId: expenses.categoryId, subcategory: subcategories.name }).from(expenses).leftJoin(subcategories, eq(expenses.subcategoryId, subcategories.id)),
      db.select().from(monthlyGoals).where(and(gte(monthlyGoals.month, "2026-10-01"), lt(monthlyGoals.month, "2026-11-01"))),
    ]);
    return NextResponse.json({ configured: true, categories: categoryRows.map((category) => ({ ...category, subcategories: subcategoryRows.filter((item) => item.categoryId === category.id).map((item) => item.name) })), incomes: incomeRows.map((item) => ({ ...item, amount: Number(item.amount) })), expenses: expenseRows.map((item) => ({ ...item, amount: Number(item.amount) })), goal: goalRows[0] ? Number(goalRows[0].amount) : 10000 });
  } catch (error) { console.error("Falha ao carregar dados financeiros", error); return NextResponse.json({ error: "Não foi possível acessar o banco de dados." }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ configured: false }, { status: 503 });
  try {
    const db = getDb();
    const body = await request.json() as Record<string, unknown>;
    if (body.type === "income") {
      const personName = String(body.person ?? "").trim();
      const existing = await db.select().from(people).where(eq(people.name, personName)).limit(1);
      const person = existing[0] ?? (await db.insert(people).values({ name: personName }).returning())[0];
      const [created] = await db.insert(incomes).values({ description: String(body.description), personId: person.id, amount: String(body.amount), date: String(body.date) }).returning();
      return NextResponse.json(created, { status: 201 });
    }
    if (body.type === "expense") {
      const category = await db.select().from(categories).where(eq(categories.id, String(body.categoryId))).limit(1);
      if (!category[0]) return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
      const sub = category[0].kind === "fixed" ? await db.select().from(subcategories).where(and(eq(subcategories.categoryId, category[0].id), eq(subcategories.name, String(body.subcategory)))).limit(1) : [];
      if (category[0].kind === "fixed" && !sub[0]) return NextResponse.json({ error: "Subcategoria fixa inválida" }, { status: 400 });
      const [created] = await db.insert(expenses).values({ description: String(body.description), categoryId: category[0].id, subcategoryId: sub[0]?.id ?? null, amount: String(body.amount), date: String(body.date) }).returning();
      return NextResponse.json(created, { status: 201 });
    }
    if (body.type === "subcategory") {
      const category = await db.select().from(categories).where(and(eq(categories.id, String(body.categoryId)), eq(categories.kind, "fixed"))).limit(1);
      if (!category[0]) return NextResponse.json({ error: "A categoria fixa não foi encontrada" }, { status: 400 });
      const [created] = await db.insert(subcategories).values({ categoryId: category[0].id, name: String(body.name) }).returning();
      return NextResponse.json(created, { status: 201 });
    }
    if (body.type === "goal") {
      const existing = await db.select().from(monthlyGoals).where(eq(monthlyGoals.month, "2026-10-01")).limit(1);
      if (existing[0]) await db.update(monthlyGoals).set({ amount: String(body.amount), updatedAt: new Date() }).where(eq(monthlyGoals.id, existing[0].id));
      else await db.insert(monthlyGoals).values({ month: "2026-10-01", amount: String(body.amount) });
      return NextResponse.json({ status: "saved" });
    }
    return NextResponse.json({ error: "Operação inválida" }, { status: 400 });
  } catch (error) { console.error("Falha ao salvar dado financeiro", error); return NextResponse.json({ error: "Não foi possível salvar no banco de dados." }, { status: 500 }); }
}
