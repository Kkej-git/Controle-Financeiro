import { and, eq, gt, gte, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { categories, expenses, incomes, monthlyGoals, people, recurringExpenses, subcategories } from "@/db/schema";

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
    await generateRecurringExpenses(db);
    const { start, end } = currentMonthBounds();
    const [subcategoryRows, peopleRows, incomeRows, expenseRows, goalRows] = await Promise.all([
      db.select().from(subcategories), db.select().from(people),
      db.select({ id: incomes.id, description: incomes.description, amount: incomes.amount, date: incomes.date, createdAt: incomes.createdAt, person: people.name }).from(incomes).innerJoin(people, eq(incomes.personId, people.id)),
      db.select({ id: expenses.id, description: expenses.description, amount: expenses.amount, date: expenses.date, createdAt: expenses.createdAt, categoryId: expenses.categoryId, recurringExpenseId: expenses.recurringExpenseId, subcategory: subcategories.name, recurringUntil: recurringExpenses.endDate, recurringActive: recurringExpenses.active }).from(expenses).leftJoin(subcategories, eq(expenses.subcategoryId, subcategories.id)).leftJoin(recurringExpenses, eq(expenses.recurringExpenseId, recurringExpenses.id)),
      db.select().from(monthlyGoals).where(and(gte(monthlyGoals.month, start), lt(monthlyGoals.month, end))),
    ]);
    return NextResponse.json({ configured: true, categories: categoryRows.map((category) => ({ ...category, subcategories: subcategoryRows.filter((item) => item.categoryId === category.id && item.active).map((item) => item.name) })), people: peopleRows.filter((item) => item.active).map((item) => item.name), incomes: incomeRows.map((item) => ({ ...item, amount: Number(item.amount) })), expenses: expenseRows.map((item) => ({ ...item, amount: Number(item.amount) })), goal: goalRows[0] ? Number(goalRows[0].amount) : 0, goalName: goalRows[0]?.name ?? "Meta mensal de entradas" });
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
      if (body.recurring && category[0].kind !== "fixed") return NextResponse.json({ error: "Somente gastos fixos podem ser recorrentes" }, { status: 400 });
      if (body.recurring && (!body.recurringUntil || String(body.recurringUntil) < String(body.date))) return NextResponse.json({ error: "Data final da recorrência inválida" }, { status: 400 });
      let recurringExpenseId: string | null = null;
      if (body.recurring) {
        const [recurrence] = await db.insert(recurringExpenses).values({ description: String(body.description), categoryId: category[0].id, subcategoryId: sub[0].id, amount: String(body.amount), startDate: String(body.date), endDate: String(body.recurringUntil) }).returning();
        recurringExpenseId = recurrence.id;
      }
      const [created] = await db.insert(expenses).values({ id: String(body.id), description: String(body.description), categoryId: category[0].id, subcategoryId: sub[0].id, recurringExpenseId, amount: String(body.amount), date: String(body.date) }).returning();
      if (recurringExpenseId) await generateRecurringExpenses(db, recurringExpenseId);
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
      if (body.recurring && category[0].kind !== "fixed") return NextResponse.json({ error: "Somente gastos fixos podem ser recorrentes" }, { status: 400 });
      if (body.recurring && (!body.recurringUntil || String(body.recurringUntil) < String(body.date))) return NextResponse.json({ error: "Data final da recorrência inválida" }, { status: 400 });
      let recurringExpenseId = body.recurringExpenseId ? String(body.recurringExpenseId) : null;
      if (recurringExpenseId && !body.recurring) {
        await db.update(expenses).set({ recurringExpenseId: null }).where(eq(expenses.id, String(body.id)));
        await db.delete(expenses).where(eq(expenses.recurringExpenseId, recurringExpenseId));
        await db.delete(recurringExpenses).where(eq(recurringExpenses.id, recurringExpenseId));
        recurringExpenseId = null;
      } else if (recurringExpenseId && body.recurring) {
        await db.update(recurringExpenses).set({ description: String(body.description), categoryId: category[0].id, subcategoryId: sub[0].id, amount: String(body.amount), startDate: String(body.date), endDate: String(body.recurringUntil), active: true }).where(eq(recurringExpenses.id, recurringExpenseId));
        await db.delete(expenses).where(eq(expenses.recurringExpenseId, recurringExpenseId));
        await generateRecurringExpenses(db, recurringExpenseId);
        return NextResponse.json({ status: "updated", recurringExpenseId });
      } else if (!recurringExpenseId && body.recurring) {
        const [recurrence] = await db.insert(recurringExpenses).values({ description: String(body.description), categoryId: category[0].id, subcategoryId: sub[0].id, amount: String(body.amount), startDate: String(body.date), endDate: String(body.recurringUntil) }).returning();
        recurringExpenseId = recurrence.id;
        await db.delete(expenses).where(eq(expenses.id, String(body.id)));
        await generateRecurringExpenses(db, recurringExpenseId);
        return NextResponse.json({ status: "updated", recurringExpenseId });
      }
      await db.update(expenses).set({ description: String(body.description), categoryId: category[0].id, subcategoryId: sub[0].id, recurringExpenseId, amount: String(body.amount), date: String(body.date) }).where(eq(expenses.id, String(body.id)));
      return NextResponse.json({ status: "updated", recurringExpenseId });
    }
    if (body.type === "incomeDelete") {
      await db.delete(incomes).where(eq(incomes.id, String(body.id)));
      return NextResponse.json({ status: "deleted" });
    }
    if (body.type === "expenseDelete") {
      const expense = await db.select({ recurringExpenseId: expenses.recurringExpenseId, recurringActive: recurringExpenses.active }).from(expenses).leftJoin(recurringExpenses, eq(expenses.recurringExpenseId, recurringExpenses.id)).where(eq(expenses.id, String(body.id))).limit(1);
      if (expense[0]?.recurringExpenseId && expense[0]?.recurringActive) {
        const today = new Date().toISOString().slice(0, 10);
        await db.delete(expenses).where(and(eq(expenses.recurringExpenseId, expense[0].recurringExpenseId), gt(expenses.date, today)));
        await db.update(recurringExpenses).set({ active: false }).where(eq(recurringExpenses.id, expense[0].recurringExpenseId));
        return NextResponse.json({ status: "deleted", recurringExpenseId: expense[0].recurringExpenseId });
      }
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
    if (body.type === "goalName") {
      const { start } = currentMonthBounds();
      const name = String(body.name ?? "").trim();
      const existing = await db.select().from(monthlyGoals).where(eq(monthlyGoals.month, start)).limit(1);
      if (existing[0]) await db.update(monthlyGoals).set({ name, updatedAt: new Date() }).where(eq(monthlyGoals.id, existing[0].id));
      else await db.insert(monthlyGoals).values({ month: start, name, amount: "0" });
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

async function generateRecurringExpenses(db: ReturnType<typeof getDb>, recurrenceId?: string) {
  const rows = await db.select().from(recurringExpenses).where(recurrenceId ? and(eq(recurringExpenses.active, true), eq(recurringExpenses.id, recurrenceId)) : eq(recurringExpenses.active, true));
  for (const item of rows) {
    for (let monthOffset = 0; monthOffset < 1200; monthOffset += 1) {
      const occurrenceDate = monthlyOccurrence(item.startDate, monthOffset);
      if (occurrenceDate > item.endDate) break;
      await db.insert(expenses).values({ description: item.description, categoryId: item.categoryId, subcategoryId: item.subcategoryId, recurringExpenseId: item.id, amount: item.amount, date: occurrenceDate }).onConflictDoNothing({ target: [expenses.recurringExpenseId, expenses.date] });
    }
  }
}

function monthlyOccurrence(startDate: string, monthOffset: number) {
  const [year, month, day] = startDate.split("-").map(Number);
  const targetMonth = month - 1 + monthOffset;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(normalizedMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
