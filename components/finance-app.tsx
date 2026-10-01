"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Check, CircleDollarSign, LayoutDashboard,
  Menu, Moon, Pencil, Plus, ReceiptText, Settings2, Sun, Tags, Target,
  Trash2, UserRound, UsersRound, WalletCards, X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type View = "dashboard" | "incomes" | "expenses" | "categories" | "people";
type CategoryKind = "fixed" | "variable";
type Income = { id: string; description: string; person: string; amount: number; date: string; createdAt?: string };
type Expense = { id: string; description: string; categoryId: string; subcategory: string | null; amount: number; date: string; createdAt?: string };
type Category = { id: string; name: string; kind: CategoryKind; color: string; subcategories: string[] };

const initialCategories: Category[] = [
  { id: "fixed", name: "Fixos", kind: "fixed", color: "#6657d9", subcategories: ["Casa", "Mercado", "Assinaturas"] },
  { id: "variable", name: "Variáveis", kind: "variable", color: "#ff8a3d", subcategories: ["Transporte", "Lazer", "Outros"] },
];
const initialPeople = ["Carlos", "Mariana"];
const initialIncomes: Income[] = [
  { id: "i1", description: "Salário", person: "Carlos", amount: 6200, date: "2026-10-01", createdAt: "2026-10-01T09:00:00.000Z" },
  { id: "i2", description: "Freelance", person: "Mariana", amount: 1650, date: "2026-09-26", createdAt: "2026-09-26T14:00:00.000Z" },
];
const initialExpenses: Expense[] = [
  { id: "e1", description: "Aluguel", categoryId: "fixed", subcategory: "Casa", amount: 1950, date: "2026-10-01", createdAt: "2026-10-01T08:00:00.000Z" },
  { id: "e2", description: "Supermercado", categoryId: "fixed", subcategory: "Mercado", amount: 870, date: "2026-09-28", createdAt: "2026-09-28T12:00:00.000Z" },
  { id: "e3", description: "Streaming", categoryId: "fixed", subcategory: "Assinaturas", amount: 320, date: "2026-09-25", createdAt: "2026-09-25T12:00:00.000Z" },
  { id: "e4", description: "Combustível", categoryId: "variable", subcategory: "Transporte", amount: 460, date: "2026-09-22", createdAt: "2026-09-22T12:00:00.000Z" },
  { id: "e5", description: "Cinema", categoryId: "variable", subcategory: "Lazer", amount: 180, date: "2026-09-20", createdAt: "2026-09-20T12:00:00.000Z" },
];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const storageKey = "saldo-financeiro-v1";

export default function FinanceApp() {
  const { resolvedTheme, setTheme } = useTheme();
  const [view, setView] = useState<View>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [incomes, setIncomes] = useState(initialIncomes);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [categories, setCategories] = useState(initialCategories);
  const [people, setPeople] = useState(initialPeople);
  const [goal, setGoal] = useState(10000);
  const [storageReady, setStorageReady] = useState(false);
  const [databaseEnabled, setDatabaseEnabled] = useState(false);
  const [dialog, setDialog] = useState<"income" | "expense" | "subcategory" | "person" | "goal" | null>(null);
  const [editing, setEditing] = useState<{ type: "income"; item: Income } | { type: "expense"; item: Expense } | null>(null);
  const [subcategoryKind, setSubcategoryKind] = useState<CategoryKind>("fixed");

  const totalIncome = incomes.reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = expenses.reduce((sum, item) => sum + item.amount, 0);
  const balance = totalIncome - totalExpense;
  const goalProgress = Math.min((totalIncome / goal) * 100, 100);

  const groupChart = useMemo(() => (["fixed", "variable"] as CategoryKind[]).map((kind) => ({
    name: kind === "fixed" ? "Fixos" : "Variáveis",
    value: expenses.filter((item) => categories.find((category) => category.id === item.categoryId)?.kind === kind).reduce((sum, item) => sum + item.amount, 0),
    color: kind === "fixed" ? "#6d5dfb" : "#ff8a3d",
  })).filter((item) => item.value > 0), [categories, expenses]);

  const fixedSubcategoryChart = useMemo(() => {
    const fixedIds = new Set(categories.filter((category) => category.kind === "fixed").map((category) => category.id));
    return Object.entries(expenses.filter((item) => fixedIds.has(item.categoryId)).reduce<Record<string, number>>((acc, item) => {
      if (item.subcategory) acc[item.subcategory] = (acc[item.subcategory] ?? 0) + item.amount;
      return acc;
    }, {})).map(([name, value], index) => ({ name, value, color: ["#6d5dfb", "#ff8a3d", "#22c55e", "#ef476f", "#118ab2", "#ffd166"][index % 6] }));
  }, [categories, expenses]);

  const variableSubcategoryChart = useMemo(() => {
    const variableIds = new Set(categories.filter((category) => category.kind === "variable").map((category) => category.id));
    return Object.entries(expenses.filter((item) => variableIds.has(item.categoryId)).reduce<Record<string, number>>((acc, item) => {
      if (item.subcategory) acc[item.subcategory] = (acc[item.subcategory] ?? 0) + item.amount;
      return acc;
    }, {})).map(([name, value], index) => ({ name, value, color: ["#00a6a6", "#f94144", "#f9c74f", "#577590", "#9b5de5", "#f3722c"][index % 6] }));
  }, [categories, expenses]);

  useEffect(() => {
    const controller = new AbortController();
    const saved = localStorage.getItem(storageKey);
    queueMicrotask(() => {
      if (saved) {
        try {
          const data = JSON.parse(saved) as { categories?: Category[]; incomes?: Income[]; expenses?: Expense[]; people?: string[]; goal?: number };
          if (data.categories) setCategories(data.categories);
          if (data.incomes) setIncomes(data.incomes);
          if (data.expenses) setExpenses(data.expenses);
          if (data.people) setPeople(data.people);
          if (data.goal) setGoal(data.goal);
        } catch { localStorage.removeItem(storageKey); }
      }
      setStorageReady(true);
    });
    fetch("/api/finance", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { configured: boolean; categories: Category[]; incomes: Income[]; expenses: Expense[]; people: string[]; goal: number };
      if (!data.configured) return;
      setDatabaseEnabled(true);
      setCategories(data.categories);
      setIncomes(data.incomes);
      setExpenses(data.expenses);
      setPeople(data.people);
      setGoal(data.goal);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem(storageKey, JSON.stringify({ categories, incomes, expenses, people, goal }));
  }, [storageReady, categories, incomes, expenses, people, goal]);

  function persist(payload: Record<string, unknown>) {
    if (!databaseEnabled) return;
    void fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((response) => {
      if (!response.ok) toast.error("O dado ficou na tela, mas não foi salvo no PostgreSQL.");
    }).catch(() => toast.error("O dado ficou na tela, mas não foi salvo no PostgreSQL."));
  }

  function addIncome(payload: Omit<Income, "id">) {
    const item = { ...payload, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setIncomes((current) => [item, ...current]);
    persist({ type: "income", ...item });
    toast.success("Entrada adicionada");
  }
  function addExpense(payload: Omit<Expense, "id">) {
    const item = { ...payload, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setExpenses((current) => [item, ...current]);
    persist({ type: "expense", ...item });
    toast.success("Gasto adicionado");
  }
  function updateIncome(payload: Omit<Income, "id">) {
    if (!editing || editing.type !== "income") return;
    const item = { ...editing.item, ...payload };
    setIncomes((current) => current.map((entry) => entry.id === item.id ? item : entry));
    persist({ type: "incomeUpdate", ...item });
    toast.success("Entrada atualizada");
  }
  function updateExpense(payload: Omit<Expense, "id">) {
    if (!editing || editing.type !== "expense") return;
    const item = { ...editing.item, ...payload };
    setExpenses((current) => current.map((entry) => entry.id === item.id ? item : entry));
    persist({ type: "expenseUpdate", ...item });
    toast.success("Gasto atualizado");
  }
  function removeTransaction(type: "income" | "expense", id: string) {
    if (type === "income") setIncomes((current) => current.filter((item) => item.id !== id));
    else setExpenses((current) => current.filter((item) => item.id !== id));
    persist({ type: type === "income" ? "incomeDelete" : "expenseDelete", id });
    toast.success(type === "income" ? "Entrada excluída" : "Gasto excluído");
  }

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: object) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    void register({
      name: "add_income", title: "Adicionar entrada", description: "Registra uma nova entrada e atualiza os totais visíveis.",
      inputSchema: { type: "object", properties: { description: { type: "string" }, person: { type: "string" }, amount: { type: "number", minimum: 0.01 }, date: { type: "string" } }, required: ["description", "person", "amount", "date"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: Omit<Income, "id">) => { addIncome(input); return { status: "created", description: input.description, amount: input.amount }; },
    });
    void register({
      name: "add_expense", title: "Adicionar gasto", description: "Registra um gasto em uma categoria e atualiza o dashboard.",
      inputSchema: { type: "object", properties: { description: { type: "string" }, categoryId: { type: "string", enum: ["fixed", "variable"] }, subcategory: { type: "string" }, amount: { type: "number", minimum: 0.01 }, date: { type: "string" } }, required: ["description", "categoryId", "subcategory", "amount", "date"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: Omit<Expense, "id">) => { const category = categories.find((item) => item.id === input.categoryId); if (!category) throw new Error("Categoria inválida"); if (!input.subcategory || !category.subcategories.includes(input.subcategory)) throw new Error("Subcategoria inválida"); addExpense(input); return { status: "created", description: input.description, amount: input.amount }; },
    });
    return () => lifecycle.abort();
  // As ferramentas usam os mesmos estados e ações da interface.
  // The tools are re-registered when category identifiers change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const nav = [
    { id: "dashboard" as const, label: "Visão geral", icon: LayoutDashboard },
    { id: "incomes" as const, label: "Entradas", icon: ArrowDownLeft },
    { id: "expenses" as const, label: "Gastos", icon: ArrowUpRight },
    { id: "categories" as const, label: "Categorias", icon: Tags },
    { id: "people" as const, label: "Pessoas", icon: UsersRound },
  ];

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-[#181a25]">
      {mobileOpen && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/25 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[244px] flex-col border-r border-[#e8e9f1] bg-white px-5 py-6 transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-10 flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-xl bg-[#6657d9] text-white shadow-[0_8px_20px_rgba(102,87,217,.25)]"><CircleDollarSign className="size-5" /></span>
          <div className="flex-1"><p className="text-base font-bold tracking-[-0.02em]">Saldo</p><p className="text-xs text-[#8a8da0]">Controle financeiro</p></div>
          <button aria-label="Fechar menu" className="lg:hidden" onClick={() => setMobileOpen(false)}><X className="size-5" /></button>
        </div>
        <nav className="space-y-1" aria-label="Navegação principal">{nav.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setView(id); setMobileOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${view === id ? "bg-[#f0eefc] text-[#5d4fd1]" : "text-[#696c7e] hover:bg-[#f7f7fa]"}`}><Icon className="size-[18px]" />{label}</button>)}</nav>
        <button className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#696c7e] hover:bg-[#f7f7fa]" onClick={() => setDialog("goal")}><Settings2 className="size-[18px]" />Configurar meta</button>
      </aside>

      <main className="min-h-screen px-4 pb-12 pt-5 sm:px-7 lg:ml-[244px] lg:px-10 lg:pt-8">
        <header className="mx-auto mb-7 flex max-w-[1280px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3"><button aria-label="Abrir menu" className="grid size-10 shrink-0 place-items-center rounded-xl border bg-white lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="size-5" /></button><div><p className="mb-1 text-sm text-[#85889a]">Outubro de 2026</p><h1 className="truncate text-2xl font-bold tracking-[-0.035em] sm:text-[1.75rem]">{nav.find((item) => item.id === view)?.label}</h1></div></div>
          <div className="flex items-center gap-2">
            <Button suppressHydrationWarning variant="outline" size="icon" className="h-10 rounded-xl bg-white" aria-label={resolvedTheme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}><Moon className="size-[18px] dark:hidden" /><Sun className="hidden size-[18px] dark:block" /></Button>
            <Button variant="outline" className="hidden h-10 rounded-xl bg-white sm:flex" onClick={() => { setEditing(null); setDialog("income"); }}><ArrowDownLeft /> Nova entrada</Button>
            <Button className="h-10 rounded-xl bg-[#6657d9] px-4 text-white hover:bg-[#5849c8]" onClick={() => { setEditing(null); setDialog("expense"); }}><Plus /> <span className="hidden sm:inline">Novo gasto</span><span className="sm:hidden">Gasto</span></Button>
          </div>
        </header>

        <div className="mx-auto max-w-[1280px]">
          {view === "dashboard" && <Dashboard totalIncome={totalIncome} totalExpense={totalExpense} balance={balance} goal={goal} goalProgress={goalProgress} groupChart={groupChart} fixedSubcategoryChart={fixedSubcategoryChart} variableSubcategoryChart={variableSubcategoryChart} incomes={incomes} expenses={expenses} categories={categories} onEditGoal={() => setDialog("goal")} />}
          {view === "incomes" && <ListView type="income" title="Todas as entradas" description="Acompanhe quem depositou e quando o valor entrou." items={incomes} people={people} onAdd={() => { setEditing(null); setDialog("income"); }} onEdit={(item) => { setEditing({ type: "income", item: item as Income }); setDialog("income"); }} onRemove={(id) => removeTransaction("income", id)} />}
          {view === "expenses" && <ListView type="expense" title="Todos os gastos" description="Consulte os gastos por categoria e subcategoria." items={expenses} categories={categories} onAdd={() => { setEditing(null); setDialog("expense"); }} onEdit={(item) => { setEditing({ type: "expense", item: item as Expense }); setDialog("expense"); }} onRemove={(id) => removeTransaction("expense", id)} />}
          {view === "categories" && <CategoriesView categories={categories} expenses={expenses} onAddSubcategory={(kind) => { setSubcategoryKind(kind); setDialog("subcategory"); }} onRemoveSubcategory={(categoryId, name) => { setCategories((current) => current.map((category) => category.id === categoryId ? { ...category, subcategories: category.subcategories.filter((item) => item !== name) } : category)); persist({ type: "subcategoryDeactivate", categoryId, name }); toast.success("Subcategoria removida"); }} />}
          {view === "people" && <PeopleView people={people} onAdd={() => setDialog("person")} onRemove={(name) => { setPeople((current) => current.filter((person) => person !== name)); persist({ type: "personDeactivate", name }); toast.success("Pessoa removida da seleção"); }} />}
        </div>
      </main>

      <IncomeDialog key={`${people.join("|")}-${editing?.type === "income" ? editing.item.id : "new"}`} open={dialog === "income"} people={people} item={editing?.type === "income" ? editing.item : undefined} onOpenChange={(open) => { if (!open) { setDialog(null); setEditing(null); } }} onSave={(item) => { if (editing?.type === "income") updateIncome(item); else addIncome(item); setDialog(null); setEditing(null); }} />
      <ExpenseDialog key={editing?.type === "expense" ? editing.item.id : "new-expense"} open={dialog === "expense"} categories={categories} item={editing?.type === "expense" ? editing.item : undefined} onOpenChange={(open) => { if (!open) { setDialog(null); setEditing(null); } }} onSave={(item) => { if (editing?.type === "expense") updateExpense(item); else addExpense(item); setDialog(null); setEditing(null); }} />
      <SubcategoryDialog open={dialog === "subcategory"} kind={subcategoryKind} existing={categories.find((item) => item.kind === subcategoryKind)?.subcategories ?? []} onOpenChange={(open) => !open && setDialog(null)} onSave={(name) => { const targetCategory = categories.find((category) => category.kind === subcategoryKind); setCategories((current) => current.map((category) => category.kind === subcategoryKind ? { ...category, subcategories: [...category.subcategories, name] } : category)); persist({ type: "subcategory", categoryId: targetCategory?.id, name }); setDialog(null); toast.success("Subcategoria adicionada"); }} />
      <PersonDialog open={dialog === "person"} existing={people} onOpenChange={(open) => !open && setDialog(null)} onSave={(name) => { setPeople((current) => [...current, name]); persist({ type: "person", name }); setDialog(null); toast.success("Pessoa adicionada"); }} />
      <GoalDialog key={goal} open={dialog === "goal"} goal={goal} onOpenChange={(open) => !open && setDialog(null)} onSave={(value) => { setGoal(value); persist({ type: "goal", amount: value }); setDialog(null); toast.success("Meta mensal atualizada"); }} />
      <Toaster position="top-right" richColors />
    </div>
  );
}

type ChartItem = { name: string; value: number; color: string };
function Dashboard({ totalIncome, totalExpense, balance, goal, goalProgress, groupChart, fixedSubcategoryChart, variableSubcategoryChart, incomes, expenses, categories, onEditGoal }: { totalIncome: number; totalExpense: number; balance: number; goal: number; goalProgress: number; groupChart: ChartItem[]; fixedSubcategoryChart: ChartItem[]; variableSubcategoryChart: ChartItem[]; incomes: Income[]; expenses: Expense[]; categories: Category[]; onEditGoal: () => void }) {
  const recent = [...incomes.map((item) => ({ ...item, type: "income" as const })), ...expenses.map((item) => ({ ...item, type: "expense" as const }))].sort(compareTransactions).slice(0, 4);
  return <div className="space-y-5">
    <section className="grid gap-4 md:grid-cols-3"><SummaryCard title="Entradas" value={money.format(totalIncome)} hint={`${Math.round(goalProgress)}% da meta mensal`} icon={<ArrowDownLeft className="size-5" />} tone="green" /><SummaryCard title="Gastos" value={money.format(totalExpense)} hint={`${totalIncome ? Math.round(totalExpense / totalIncome * 100) : 0}% das entradas`} icon={<ArrowUpRight className="size-5" />} tone="red" /><SummaryCard title="Saldo restante" value={money.format(balance)} hint="Disponível no mês" icon={<WalletCards className="size-5" />} tone="purple" /></section>
    <section className="rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:p-6"><div className="mb-4 flex items-center justify-between gap-4"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold">Meta mensal de entradas</p><button aria-label="Editar meta" onClick={onEditGoal} className="text-[#8e91a2] hover:text-[#6657d9]"><Pencil className="size-3.5" /></button></div><p className="mt-1 text-sm text-[#85889a]">{totalIncome >= goal ? "Meta alcançada. Ótimo trabalho!" : `Faltam ${money.format(goal - totalIncome)} para alcançar sua meta`}</p></div><p className="text-right text-sm text-[#85889a]"><strong className="block text-base text-[#252735]">{money.format(totalIncome)}</strong>de {money.format(goal)}</p></div><Progress value={goalProgress} className="h-3 bg-[#eeecfb] [&_[data-slot=progress-indicator]]:bg-[#6657d9]" /></section>
    <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <div className="rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:p-6"><div className="mb-4"><h2 className="font-semibold">Distribuição dos gastos</h2><p className="mt-1 text-sm text-[#85889a]">Categorias e suas subcategorias</p></div><Tabs defaultValue="group"><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="group">Total</TabsTrigger><TabsTrigger value="fixed">Fixas</TabsTrigger><TabsTrigger value="variable">Variáveis</TabsTrigger></TabsList><TabsContent value="group"><ChartBlock data={groupChart} total={totalExpense} /></TabsContent><TabsContent value="fixed"><ChartBlock data={fixedSubcategoryChart} total={fixedSubcategoryChart.reduce((sum, item) => sum + item.value, 0)} empty="Ainda não há gastos fixos." /></TabsContent><TabsContent value="variable"><ChartBlock data={variableSubcategoryChart} total={variableSubcategoryChart.reduce((sum, item) => sum + item.value, 0)} empty="Ainda não há gastos variáveis." /></TabsContent></Tabs></div>
      <div className="rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:p-6"><div className="mb-5 flex items-start justify-between"><div><h2 className="font-semibold">Movimentações recentes</h2><p className="mt-1 text-sm text-[#85889a]">Mais recentes primeiro</p></div><ReceiptText className="size-5 text-[#9b9eae]" /></div><div className="space-y-1">{recent.map((item) => { const isIncome = item.type === "income"; const category = !isIncome ? categories.find((cat) => cat.id === item.categoryId) : null; const expenseLabel = item.subcategory ? `${category?.name} • ${item.subcategory}` : category?.name; return <div key={`${item.type}-${item.id}`} className="flex items-center gap-3 border-b border-[#f0f0f4] py-3 last:border-0"><span className={`grid size-10 place-items-center rounded-xl ${isIncome ? "bg-[#eaf8f1] text-[#16845b]" : "bg-[#fff0f2] text-[#d24d64]"}`}>{isIncome ? <ArrowDownLeft className="size-[18px]" /> : <ArrowUpRight className="size-[18px]" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.description}</p><p className="truncate text-xs text-[#9194a5]">{isIncome ? `Entrada por ${item.person}` : expenseLabel} • {formatDate(item.date)}</p></div><p className={`text-sm font-semibold ${isIncome ? "text-[#16845b]" : "text-[#d24d64]"}`}>{isIncome ? "+ " : "- "}{money.format(item.amount)}</p></div>; })}</div></div>
    </section>
  </div>;
}

function ChartBlock({ data, total, empty = "Nenhum gasto registrado." }: { data: ChartItem[]; total: number; empty?: string }) {
  if (!data.length) return <div className="grid h-[265px] place-items-center text-sm text-[#85889a]">{empty}</div>;
  const stops = data.reduce<{ end: number; parts: string[] }>((acc, item) => {
    const end = acc.end + item.value / total * 100;
    return { end, parts: [...acc.parts, `${item.color} ${acc.end}%`, `${item.color} ${end}%`] };
  }, { end: 0, parts: [] }).parts.join(", ");
  return <div className="grid items-center gap-3 pt-4 sm:grid-cols-[1fr_195px]"><div className="grid h-[245px] place-items-center"><div className="relative grid size-[194px] place-items-center rounded-full" style={{ background: `conic-gradient(${stops})` }} role="img" aria-label={`Gráfico de pizza com total de ${money.format(total)}`}><div className="grid size-[132px] place-items-center rounded-full bg-white text-center shadow-[inset_0_0_0_1px_rgba(0,0,0,.02)]"><div><p className="text-xs text-[#8a8da0]">Total</p><p className="mt-1 whitespace-nowrap text-base font-bold">{money.format(total)}</p></div></div></div></div><div className="space-y-3">{data.map((item) => <div key={item.name} className="flex items-center gap-3"><span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="text-xs text-[#9194a5]">{total ? Math.round(item.value / total * 100) : 0}%</p></div><p className="text-sm font-semibold">{money.format(item.value)}</p></div>)}</div></div>;
}

function SummaryCard({ title, value, hint, icon, tone }: { title: string; value: string; hint: string; icon: ReactNode; tone: "green" | "red" | "purple" }) { const styles = { green: "bg-[#eaf8f1] text-[#16845b]", red: "bg-[#fff0f2] text-[#d24d64]", purple: "bg-[#efedfc] text-[#6657d9]" }; return <article className="rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><p className="text-sm font-medium text-[#747789]">{title}</p><span className={`grid size-10 place-items-center rounded-xl ${styles[tone]}`}>{icon}</span></div><p className="text-2xl font-bold tracking-[-0.035em]">{value}</p><p className="mt-1.5 text-xs text-[#9295a6]">{hint}</p></article>; }

function ListView({ type, title, description, items, categories = [], people = [], onAdd, onEdit, onRemove }: { type: "income" | "expense"; title: string; description: string; items: Income[] | Expense[]; categories?: Category[]; people?: string[]; onAdd: () => void; onEdit: (item: Income | Expense) => void; onRemove: (id: string) => void }) {
  const isIncome = type === "income";
  const [filters, setFilters] = useState({ from: "", to: "", person: "all", categoryId: "all", subcategory: "all" });
  const selectedCategory = categories.find((category) => category.id === filters.categoryId);
  const filtered = [...items].filter((raw) => {
    const item = raw as Income & Expense;
    if (filters.from && item.date < filters.from) return false;
    if (filters.to && item.date > filters.to) return false;
    if (isIncome && filters.person !== "all" && item.person !== filters.person) return false;
    if (!isIncome && filters.categoryId !== "all" && item.categoryId !== filters.categoryId) return false;
    if (!isIncome && filters.subcategory !== "all" && item.subcategory !== filters.subcategory) return false;
    return true;
  }).sort(compareTransactions);
  const hasFilters = Object.values(filters).some((value) => value !== "" && value !== "all");
  return <section className="overflow-hidden rounded-2xl border border-[#e8e9f1] bg-white">
    <div className="flex items-center justify-between border-b border-[#eeeeF3] p-5 sm:p-6"><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-[#85889a]">{description}</p></div><Button onClick={onAdd} className="rounded-xl bg-[#6657d9] hover:bg-[#5849c8]"><Plus /> Adicionar</Button></div>
    <div className="grid gap-3 border-b border-[#eeeeF3] bg-[#fafafd] p-4 sm:grid-cols-2 lg:grid-cols-5 sm:p-5">
      <Field label="De"><Input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></Field>
      <Field label="Até"><Input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></Field>
      {isIncome ? <Field label="Pessoa"><Select value={filters.person} onValueChange={(person) => setFilters({ ...filters, person })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as pessoas</SelectItem>{people.map((person) => <SelectItem key={person} value={person}>{person}</SelectItem>)}</SelectContent></Select></Field> : <>
        <Field label="Categoria"><Select value={filters.categoryId} onValueChange={(categoryId) => setFilters({ ...filters, categoryId, subcategory: "all" })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Subcategoria"><Select value={filters.subcategory} onValueChange={(subcategory) => setFilters({ ...filters, subcategory })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as subcategorias</SelectItem>{[...new Set(selectedCategory ? selectedCategory.subcategories : categories.flatMap((category) => category.subcategories))].map((subcategory) => <SelectItem key={subcategory} value={subcategory}>{subcategory}</SelectItem>)}</SelectContent></Select></Field>
      </>}
      <div className="flex items-end"><Button variant="outline" className="w-full" disabled={!hasFilters} onClick={() => setFilters({ from: "", to: "", person: "all", categoryId: "all", subcategory: "all" })}>Limpar filtros</Button></div>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-[#fafafd] text-xs uppercase tracking-wide text-[#8a8da0]"><tr><th className="px-6 py-3 font-medium">Descrição</th><th className="px-6 py-3 font-medium">{isIncome ? "Pessoa" : "Categoria"}</th><th className="px-6 py-3 font-medium">{isIncome ? "Data" : "Subcategoria"}</th>{!isIncome && <th className="px-6 py-3 font-medium">Data</th>}<th className="px-6 py-3 text-right font-medium">Valor</th><th className="px-6 py-3 text-right font-medium">Ações</th></tr></thead><tbody>{filtered.map((raw) => { const item = raw as Income & Expense; const category = categories.find((cat) => cat.id === item.categoryId); return <tr key={item.id} className="border-t border-[#f0f0f4]"><td className="px-6 py-4 text-sm font-semibold">{item.description}</td><td className="px-6 py-4 text-sm text-[#676a7c]">{isIncome ? <span className="flex items-center gap-2"><UserRound className="size-4" />{item.person}</span> : <span className="inline-flex items-center gap-2"><i className="size-2 rounded-full" style={{ backgroundColor: category?.color }} />{category?.name}</span>}</td><td className="px-6 py-4 text-sm text-[#676a7c]">{isIncome ? formatDate(item.date) : item.subcategory || "—"}</td>{!isIncome && <td className="px-6 py-4 text-sm text-[#676a7c]">{formatDate(item.date)}</td>}<td className={`px-6 py-4 text-right text-sm font-bold ${isIncome ? "text-[#16845b]" : "text-[#d24d64]"}`}>{isIncome ? "+ " : "- "}{money.format(item.amount)}</td><td className="px-6 py-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Editar ${item.description}`} onClick={() => onEdit(raw)}><Pencil /></Button><ConfirmRemove label={item.description} description="Esta movimentação será excluída permanentemente dos totais e gráficos." onRemove={() => onRemove(item.id)} /></div></td></tr>; })}</tbody></table></div>
    {!filtered.length && <p className="border-t border-[#f0f0f4] p-8 text-center text-sm text-[#85889a]">Nenhuma movimentação encontrada com estes filtros.</p>}
  </section>;
}

function CategoriesView({ categories, expenses, onAddSubcategory, onRemoveSubcategory }: { categories: Category[]; expenses: Expense[]; onAddSubcategory: (kind: CategoryKind) => void; onRemoveSubcategory: (categoryId: string, name: string) => void }) { return <div><div className="mb-5"><p className="text-sm text-[#777a8c]">Organize as subcategorias dos gastos fixos e variáveis.</p></div><section className="grid gap-4 md:grid-cols-2">{categories.map((category) => { const total = expenses.filter((item) => item.categoryId === category.id).reduce((sum, item) => sum + item.amount, 0); return <article key={category.id} className="rounded-2xl border border-[#e8e9f1] bg-white p-5"><div className="mb-5 flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="size-11 rounded-xl" style={{ backgroundColor: category.color }} /><div><h2 className="font-semibold">{category.name}</h2><p className="text-xs text-[#8a8da0]">{category.subcategories.length} subcategorias</p></div></div><Button variant="outline" size="sm" onClick={() => onAddSubcategory(category.kind)} className="rounded-lg"><Plus /> Adicionar subcategoria</Button></div><p className="mb-4 text-xl font-bold">{money.format(total)}</p><div className="flex flex-wrap gap-2">{category.subcategories.map((sub) => <RemovableItem key={sub} label={sub} description={`Os gastos já registrados em ${sub} continuarão no histórico.`} onRemove={() => onRemoveSubcategory(category.id, sub)} />)}</div></article>; })}</section></div>; }

function PeopleView({ people, onAdd, onRemove }: { people: string[]; onAdd: () => void; onRemove: (name: string) => void }) { return <section className="rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Pessoas disponíveis</h2><p className="mt-1 text-sm text-[#85889a]">Selecione uma delas ao registrar uma entrada.</p></div><Button onClick={onAdd} className="rounded-xl bg-[#6657d9] hover:bg-[#5849c8]"><Plus /> Nova pessoa</Button></div>{people.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{people.map((person) => <div key={person} className="flex items-center gap-3 rounded-xl border border-[#e8e9f1] p-3"><span className="grid size-10 place-items-center rounded-xl bg-[#efedfc] text-[#6657d9]"><UserRound className="size-5" /></span><p className="flex-1 text-sm font-semibold">{person}</p><ConfirmRemove label={person} description="A pessoa deixará de aparecer nas novas entradas. O histórico existente será mantido." onRemove={() => onRemove(person)} /></div>)}</div> : <p className="rounded-xl border border-dashed border-[#e8e9f1] p-8 text-center text-sm text-[#85889a]">Adicione uma pessoa para registrar novas entradas.</p>}</section>; }

function RemovableItem({ label, description, onRemove }: { label: string; description: string; onRemove: () => void }) { return <span className="inline-flex items-center gap-1 rounded-lg border border-[#e8e9f1] py-1 pl-2.5 pr-1 text-sm text-[#656879]">{label}<ConfirmRemove label={label} description={description} onRemove={onRemove} compact /></span>; }

function ConfirmRemove({ label, description, onRemove, compact = false }: { label: string; description: string; onRemove: () => void; compact?: boolean }) { return <AlertDialog><AlertDialogTrigger asChild><button className={`grid place-items-center rounded-md text-[#a0a3b2] hover:bg-[#fff0f2] hover:text-[#d24d64] ${compact ? "size-7" : "size-8"}`} aria-label={`Remover ${label}`}><Trash2 className="size-4" /></button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Remover {label}?</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onRemove}>Remover</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>; }

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }

function IncomeDialog({ open, people, item, onOpenChange, onSave }: { open: boolean; people: string[]; item?: Income; onOpenChange: (open: boolean) => void; onSave: (item: Omit<Income, "id">) => void }) { const [values, setValues] = useState({ description: item?.description ?? "", person: item?.person ?? people[0] ?? "", amount: item ? String(item.amount) : "", date: item?.date ?? "2026-10-01" }); function submit(event: FormEvent) { event.preventDefault(); const amount = Number(values.amount.replace(",", ".")); if (!values.description || !values.person || amount <= 0) return toast.error("Preencha todos os campos obrigatórios"); onSave({ ...values, amount, createdAt: item?.createdAt }); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>{item ? "Editar entrada" : "Nova entrada"}</DialogTitle><DialogDescription>{item ? "Atualize os dados desta entrada." : "Registre o valor e selecione quem fez o depósito."}</DialogDescription></DialogHeader><div className="grid gap-4 py-5"><Field label="Descrição"><Input value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="Ex.: Salário" /></Field><Field label="Pessoa"><Select value={values.person} onValueChange={(person) => setValues({ ...values, person })}><SelectTrigger className="w-full"><SelectValue placeholder="Selecione uma pessoa" /></SelectTrigger><SelectContent>{!people.includes(values.person) && values.person && <SelectItem value={values.person}>{values.person} (removida)</SelectItem>}{people.map((person) => <SelectItem key={person} value={person}>{person}</SelectItem>)}</SelectContent></Select>{!people.length && !item && <p className="text-xs text-[#d24d64]">Adicione uma pessoa na seção Pessoas antes de registrar a entrada.</p>}</Field><div className="grid grid-cols-2 gap-4"><Field label="Valor"><Input inputMode="decimal" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} placeholder="0,00" /></Field><Field label="Data"><Input type="date" value={values.date} onChange={(e) => setValues({ ...values, date: e.target.value })} /></Field></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={!people.length && !item} className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit"><Check /> {item ? "Salvar alterações" : "Salvar entrada"}</Button></DialogFooter></form></DialogContent></Dialog>; }

function ExpenseDialog({ open, categories, item, onOpenChange, onSave }: { open: boolean; categories: Category[]; item?: Expense; onOpenChange: (open: boolean) => void; onSave: (item: Omit<Expense, "id">) => void }) { const first = categories[0]; const [values, setValues] = useState({ description: item?.description ?? "", categoryId: item?.categoryId ?? first?.id ?? "fixed", subcategory: item?.subcategory ?? first?.subcategories[0] ?? "", amount: item ? String(item.amount) : "", date: item?.date ?? "2026-10-01" }); const selected = categories.find((entry) => entry.id === values.categoryId); function submit(event: FormEvent) { event.preventDefault(); const amount = Number(values.amount.replace(",", ".")); if (!values.description || !values.categoryId || !values.subcategory || amount <= 0) return toast.error("Preencha todos os campos obrigatórios"); onSave({ ...values, amount, createdAt: item?.createdAt }); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>{item ? "Editar gasto" : "Novo gasto"}</DialogTitle><DialogDescription>{item ? "Atualize os dados deste gasto." : "Escolha a categoria e a subcategoria do gasto."}</DialogDescription></DialogHeader><div className="grid gap-4 py-5"><Field label="Descrição"><Input value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="Ex.: Conta de energia" /></Field><div className="grid grid-cols-2 gap-4"><Field label="Categoria"><Select value={values.categoryId} onValueChange={(categoryId) => { const next = categories.find((entry) => entry.id === categoryId); setValues({ ...values, categoryId, subcategory: next?.subcategories[0] ?? "" }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{categories.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Subcategoria"><Select value={values.subcategory ?? ""} onValueChange={(subcategory) => setValues({ ...values, subcategory })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{values.subcategory && !selected?.subcategories.includes(values.subcategory) && <SelectItem value={values.subcategory}>{values.subcategory} (removida)</SelectItem>}{selected?.subcategories.map((entry) => <SelectItem key={entry} value={entry}>{entry}</SelectItem>)}</SelectContent></Select></Field></div><div className="grid grid-cols-2 gap-4"><Field label="Valor"><Input inputMode="decimal" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} placeholder="0,00" /></Field><Field label="Data"><Input type="date" value={values.date} onChange={(e) => setValues({ ...values, date: e.target.value })} /></Field></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit"><Check /> {item ? "Salvar alterações" : "Salvar gasto"}</Button></DialogFooter></form></DialogContent></Dialog>; }

function SubcategoryDialog({ open, kind, existing, onOpenChange, onSave }: { open: boolean; kind: CategoryKind; existing: string[]; onOpenChange: (open: boolean) => void; onSave: (name: string) => void }) { const [name, setName] = useState(""); const label = kind === "fixed" ? "fixa" : "variável"; function submit(event: FormEvent) { event.preventDefault(); const normalized = name.trim(); if (!normalized) return toast.error("Informe o nome da subcategoria"); if (existing.some((item) => item.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"))) return toast.error("Esta subcategoria já existe"); onSave(normalized); setName(""); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Nova subcategoria {label}</DialogTitle><DialogDescription>Ela ficará disponível ao registrar gastos {kind === "fixed" ? "fixos" : "variáveis"}.</DialogDescription></DialogHeader><div className="py-5"><Field label="Nome da subcategoria"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Saúde" /></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit"><Check /> Adicionar</Button></DialogFooter></form></DialogContent></Dialog>; }

function PersonDialog({ open, existing, onOpenChange, onSave }: { open: boolean; existing: string[]; onOpenChange: (open: boolean) => void; onSave: (name: string) => void }) { const [name, setName] = useState(""); function submit(event: FormEvent) { event.preventDefault(); const normalized = name.trim(); if (!normalized) return toast.error("Informe o nome da pessoa"); if (existing.some((item) => item.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"))) return toast.error("Esta pessoa já existe"); onSave(normalized); setName(""); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Nova pessoa</DialogTitle><DialogDescription>Ela ficará disponível para seleção nas novas entradas.</DialogDescription></DialogHeader><div className="py-5"><Field label="Nome"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana" /></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit"><Check /> Adicionar</Button></DialogFooter></form></DialogContent></Dialog>; }

function GoalDialog({ open, goal, onOpenChange, onSave }: { open: boolean; goal: number; onOpenChange: (open: boolean) => void; onSave: (goal: number) => void }) { const [value, setValue] = useState(String(goal)); function submit(event: FormEvent) { event.preventDefault(); const next = Number(value.replace(",", ".")); if (next <= 0) return toast.error("A meta precisa ser maior que zero"); onSave(next); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Meta mensal</DialogTitle><DialogDescription>Defina quanto você pretende receber neste mês.</DialogDescription></DialogHeader><div className="py-5"><Field label="Valor da meta"><div className="relative"><Target className="absolute left-3 top-2.5 size-4 text-[#8a8da0]" /><Input className="pl-9" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></div></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit">Salvar meta</Button></DialogFooter></form></DialogContent></Dialog>; }

function formatDate(value: string) { return shortDate.format(new Date(`${value}T12:00:00`)).replace(".", ""); }
function compareTransactions(a: Income | Expense, b: Income | Expense) { const byDate = b.date.localeCompare(a.date); if (byDate) return byDate; return (b.createdAt ?? "").localeCompare(a.createdAt ?? ""); }
