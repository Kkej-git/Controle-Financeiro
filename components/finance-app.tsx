"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Check, CircleDollarSign, LayoutDashboard,
  Menu, Pencil, Plus, ReceiptText, Settings2, Tags, Target, UserRound,
  WalletCards, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";

type View = "dashboard" | "incomes" | "expenses" | "categories";
type CategoryKind = "fixed" | "variable";
type Income = { id: string; description: string; person: string; amount: number; date: string };
type Expense = { id: string; description: string; categoryId: string; subcategory: string | null; amount: number; date: string };
type Category = { id: string; name: string; kind: CategoryKind; color: string; subcategories: string[] };

const initialCategories: Category[] = [
  { id: "fixed", name: "Fixos", kind: "fixed", color: "#6657d9", subcategories: ["Casa", "Mercado", "Assinaturas"] },
  { id: "variable", name: "Variáveis", kind: "variable", color: "#23b0a7", subcategories: [] },
];
const initialIncomes: Income[] = [
  { id: "i1", description: "Salário", person: "Carlos", amount: 6200, date: "2026-10-01" },
  { id: "i2", description: "Freelance", person: "Mariana", amount: 1650, date: "2026-09-26" },
];
const initialExpenses: Expense[] = [
  { id: "e1", description: "Aluguel", categoryId: "fixed", subcategory: "Casa", amount: 1950, date: "2026-10-01" },
  { id: "e2", description: "Supermercado", categoryId: "fixed", subcategory: "Mercado", amount: 870, date: "2026-09-28" },
  { id: "e3", description: "Streaming", categoryId: "fixed", subcategory: "Assinaturas", amount: 320, date: "2026-09-25" },
  { id: "e4", description: "Combustível", categoryId: "variable", subcategory: null, amount: 460, date: "2026-09-22" },
];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

export default function FinanceApp() {
  const [view, setView] = useState<View>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [incomes, setIncomes] = useState(initialIncomes);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [categories, setCategories] = useState(initialCategories);
  const [goal, setGoal] = useState(10000);
  const [databaseEnabled, setDatabaseEnabled] = useState(false);
  const [dialog, setDialog] = useState<"income" | "expense" | "subcategory" | "goal" | null>(null);

  const totalIncome = incomes.reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = expenses.reduce((sum, item) => sum + item.amount, 0);
  const balance = totalIncome - totalExpense;
  const goalProgress = Math.min((totalIncome / goal) * 100, 100);

  const groupChart = useMemo(() => (["fixed", "variable"] as CategoryKind[]).map((kind) => ({
    name: kind === "fixed" ? "Fixos" : "Variáveis",
    value: expenses.filter((item) => categories.find((category) => category.id === item.categoryId)?.kind === kind).reduce((sum, item) => sum + item.amount, 0),
    color: kind === "fixed" ? "#6657d9" : "#23b0a7",
  })).filter((item) => item.value > 0), [categories, expenses]);

  const fixedSubcategoryChart = useMemo(() => {
    const fixedIds = new Set(categories.filter((category) => category.kind === "fixed").map((category) => category.id));
    return Object.entries(expenses.filter((item) => fixedIds.has(item.categoryId)).reduce<Record<string, number>>((acc, item) => {
      if (item.subcategory) acc[item.subcategory] = (acc[item.subcategory] ?? 0) + item.amount;
      return acc;
    }, {})).map(([name, value], index) => ({ name, value, color: ["#6657d9", "#9187e8", "#bbb5f1", "#d8d4f8"][index % 4] }));
  }, [categories, expenses]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/finance", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { configured: boolean; categories: Category[]; incomes: Income[]; expenses: Expense[]; goal: number };
      if (!data.configured) return;
      setDatabaseEnabled(true);
      setCategories(data.categories);
      setIncomes(data.incomes);
      setExpenses(data.expenses);
      setGoal(data.goal);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  function persist(payload: Record<string, unknown>) {
    if (!databaseEnabled) return;
    void fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((response) => {
      if (!response.ok) toast.error("O dado ficou na tela, mas não foi salvo no PostgreSQL.");
    }).catch(() => toast.error("O dado ficou na tela, mas não foi salvo no PostgreSQL."));
  }

  function addIncome(payload: Omit<Income, "id">) {
    setIncomes((current) => [{ ...payload, id: crypto.randomUUID() }, ...current]);
    persist({ type: "income", ...payload });
    toast.success("Entrada adicionada");
  }
  function addExpense(payload: Omit<Expense, "id">) {
    setExpenses((current) => [{ ...payload, id: crypto.randomUUID() }, ...current]);
    persist({ type: "expense", ...payload });
    toast.success("Gasto adicionado");
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
      inputSchema: { type: "object", properties: { description: { type: "string" }, categoryId: { type: "string", enum: ["fixed", "variable"] }, subcategory: { type: ["string", "null"] }, amount: { type: "number", minimum: 0.01 }, date: { type: "string" } }, required: ["description", "categoryId", "amount", "date"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: Omit<Expense, "id">) => { const category = categories.find((item) => item.id === input.categoryId); if (!category) throw new Error("Categoria inválida"); if (category.kind === "fixed" && (!input.subcategory || !category.subcategories.includes(input.subcategory))) throw new Error("Subcategoria fixa inválida"); addExpense({ ...input, subcategory: category.kind === "fixed" ? input.subcategory : null }); return { status: "created", description: input.description, amount: input.amount }; },
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
            <Button variant="outline" className="hidden h-10 rounded-xl bg-white sm:flex" onClick={() => setDialog("income")}><ArrowDownLeft /> Nova entrada</Button>
            <Button className="h-10 rounded-xl bg-[#6657d9] px-4 text-white hover:bg-[#5849c8]" onClick={() => setDialog("expense")}><Plus /> <span className="hidden sm:inline">Novo gasto</span><span className="sm:hidden">Gasto</span></Button>
          </div>
        </header>

        <div className="mx-auto max-w-[1280px]">
          {view === "dashboard" && <Dashboard totalIncome={totalIncome} totalExpense={totalExpense} balance={balance} goal={goal} goalProgress={goalProgress} groupChart={groupChart} fixedSubcategoryChart={fixedSubcategoryChart} incomes={incomes} expenses={expenses} categories={categories} onEditGoal={() => setDialog("goal")} />}
          {view === "incomes" && <ListView type="income" title="Todas as entradas" description="Acompanhe quem depositou e quando o valor entrou." items={incomes} onAdd={() => setDialog("income")} />}
          {view === "expenses" && <ListView type="expense" title="Todos os gastos" description="Consulte os gastos por categoria e subcategoria." items={expenses} categories={categories} onAdd={() => setDialog("expense")} />}
          {view === "categories" && <CategoriesView categories={categories} expenses={expenses} onAddSubcategory={() => setDialog("subcategory")} />}
        </div>
      </main>

      <IncomeDialog open={dialog === "income"} onOpenChange={(open) => !open && setDialog(null)} onSave={(item) => { addIncome(item); setDialog(null); }} />
      <ExpenseDialog open={dialog === "expense"} categories={categories} onOpenChange={(open) => !open && setDialog(null)} onSave={(item) => { addExpense(item); setDialog(null); }} />
      <SubcategoryDialog open={dialog === "subcategory"} existing={categories.find((item) => item.kind === "fixed")?.subcategories ?? []} onOpenChange={(open) => !open && setDialog(null)} onSave={(name) => { const fixedCategory = categories.find((category) => category.kind === "fixed"); setCategories((current) => current.map((category) => category.kind === "fixed" ? { ...category, subcategories: [...category.subcategories, name] } : category)); persist({ type: "subcategory", categoryId: fixedCategory?.id, name }); setDialog(null); toast.success("Subcategoria adicionada"); }} />
      <GoalDialog key={goal} open={dialog === "goal"} goal={goal} onOpenChange={(open) => !open && setDialog(null)} onSave={(value) => { setGoal(value); persist({ type: "goal", amount: value }); setDialog(null); toast.success("Meta mensal atualizada"); }} />
      <Toaster position="top-right" richColors />
    </div>
  );
}

type ChartItem = { name: string; value: number; color: string };
function Dashboard({ totalIncome, totalExpense, balance, goal, goalProgress, groupChart, fixedSubcategoryChart, incomes, expenses, categories, onEditGoal }: { totalIncome: number; totalExpense: number; balance: number; goal: number; goalProgress: number; groupChart: ChartItem[]; fixedSubcategoryChart: ChartItem[]; incomes: Income[]; expenses: Expense[]; categories: Category[]; onEditGoal: () => void }) {
  const recent = [...incomes.map((item) => ({ ...item, type: "income" as const })), ...expenses.map((item) => ({ ...item, type: "expense" as const }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  return <div className="space-y-5">
    <section className="grid gap-4 md:grid-cols-3"><SummaryCard title="Entradas" value={money.format(totalIncome)} hint={`${Math.round(goalProgress)}% da meta mensal`} icon={<ArrowDownLeft className="size-5" />} tone="green" /><SummaryCard title="Gastos" value={money.format(totalExpense)} hint={`${totalIncome ? Math.round(totalExpense / totalIncome * 100) : 0}% das entradas`} icon={<ArrowUpRight className="size-5" />} tone="red" /><SummaryCard title="Saldo restante" value={money.format(balance)} hint="Disponível no mês" icon={<WalletCards className="size-5" />} tone="purple" /></section>
    <section className="rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:p-6"><div className="mb-4 flex items-center justify-between gap-4"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold">Meta mensal de entradas</p><button aria-label="Editar meta" onClick={onEditGoal} className="text-[#8e91a2] hover:text-[#6657d9]"><Pencil className="size-3.5" /></button></div><p className="mt-1 text-sm text-[#85889a]">{totalIncome >= goal ? "Meta alcançada. Ótimo trabalho!" : `Faltam ${money.format(goal - totalIncome)} para alcançar sua meta`}</p></div><p className="text-right text-sm text-[#85889a]"><strong className="block text-base text-[#252735]">{money.format(totalIncome)}</strong>de {money.format(goal)}</p></div><Progress value={goalProgress} className="h-3 bg-[#eeecfb] [&_[data-slot=progress-indicator]]:bg-[#6657d9]" /></section>
    <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <div className="rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:p-6"><div className="mb-4"><h2 className="font-semibold">Distribuição dos gastos</h2><p className="mt-1 text-sm text-[#85889a]">Categorias e subcategorias dos gastos fixos</p></div><Tabs defaultValue="group"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="group">Fixos × variáveis</TabsTrigger><TabsTrigger value="fixed">Subcategorias dos fixos</TabsTrigger></TabsList><TabsContent value="group"><ChartBlock data={groupChart} total={totalExpense} /></TabsContent><TabsContent value="fixed"><ChartBlock data={fixedSubcategoryChart} total={fixedSubcategoryChart.reduce((sum, item) => sum + item.value, 0)} empty="Ainda não há gastos fixos." /></TabsContent></Tabs></div>
      <div className="rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:p-6"><div className="mb-5 flex items-start justify-between"><div><h2 className="font-semibold">Movimentações recentes</h2><p className="mt-1 text-sm text-[#85889a]">Últimos registros do mês</p></div><ReceiptText className="size-5 text-[#9b9eae]" /></div><div className="space-y-1">{recent.map((item) => { const isIncome = item.type === "income"; const category = !isIncome ? categories.find((cat) => cat.id === item.categoryId) : null; const expenseLabel = item.subcategory ? `${category?.name} • ${item.subcategory}` : category?.name; return <div key={item.id} className="flex items-center gap-3 border-b border-[#f0f0f4] py-3 last:border-0"><span className={`grid size-10 place-items-center rounded-xl ${isIncome ? "bg-[#eaf8f1] text-[#16845b]" : "bg-[#fff0f2] text-[#d24d64]"}`}>{isIncome ? <ArrowDownLeft className="size-[18px]" /> : <ArrowUpRight className="size-[18px]" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.description}</p><p className="truncate text-xs text-[#9194a5]">{isIncome ? `Entrada por ${item.person}` : expenseLabel} • {formatDate(item.date)}</p></div><p className={`text-sm font-semibold ${isIncome ? "text-[#16845b]" : "text-[#d24d64]"}`}>{isIncome ? "+ " : "- "}{money.format(item.amount)}</p></div>; })}</div></div>
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

function ListView({ type, title, description, items, categories = [], onAdd }: { type: "income" | "expense"; title: string; description: string; items: Income[] | Expense[]; categories?: Category[]; onAdd: () => void }) {
  const isIncome = type === "income";
  return <section className="overflow-hidden rounded-2xl border border-[#e8e9f1] bg-white"><div className="flex items-center justify-between border-b border-[#eeeeF3] p-5 sm:p-6"><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-[#85889a]">{description}</p></div><Button onClick={onAdd} className="rounded-xl bg-[#6657d9] hover:bg-[#5849c8]"><Plus /> Adicionar</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="bg-[#fafafd] text-xs uppercase tracking-wide text-[#8a8da0]"><tr><th className="px-6 py-3 font-medium">Descrição</th><th className="px-6 py-3 font-medium">{isIncome ? "Pessoa" : "Categoria"}</th><th className="px-6 py-3 font-medium">{isIncome ? "Data" : "Subcategoria"}</th><th className="px-6 py-3 text-right font-medium">Valor</th></tr></thead><tbody>{items.map((raw) => { const item = raw as Income & Expense; const category = categories.find((cat) => cat.id === item.categoryId); return <tr key={item.id} className="border-t border-[#f0f0f4]"><td className="px-6 py-4 text-sm font-semibold">{item.description}</td><td className="px-6 py-4 text-sm text-[#676a7c]">{isIncome ? <span className="flex items-center gap-2"><UserRound className="size-4" />{item.person}</span> : <span className="inline-flex items-center gap-2"><i className="size-2 rounded-full" style={{ backgroundColor: category?.color }} />{category?.name}</span>}</td><td className="px-6 py-4 text-sm text-[#676a7c]">{isIncome ? formatDate(item.date) : item.subcategory || "—"}</td><td className={`px-6 py-4 text-right text-sm font-bold ${isIncome ? "text-[#16845b]" : "text-[#d24d64]"}`}>{isIncome ? "+ " : "- "}{money.format(item.amount)}</td></tr>; })}</tbody></table></div></section>;
}

function CategoriesView({ categories, expenses, onAddSubcategory }: { categories: Category[]; expenses: Expense[]; onAddSubcategory: () => void }) { return <div><div className="mb-5"><p className="text-sm text-[#777a8c]">Os gastos são organizados apenas entre Fixos e Variáveis.</p></div><section className="grid gap-4 md:grid-cols-2">{categories.map((category) => { const total = expenses.filter((item) => item.categoryId === category.id).reduce((sum, item) => sum + item.amount, 0); return <article key={category.id} className="rounded-2xl border border-[#e8e9f1] bg-white p-5"><div className="mb-5 flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="size-11 rounded-xl" style={{ backgroundColor: category.color }} /><div><h2 className="font-semibold">{category.name}</h2><p className="text-xs text-[#8a8da0]">{category.kind === "fixed" ? "Com subcategorias" : "Sem subcategorias"}</p></div></div>{category.kind === "fixed" && <Button variant="outline" size="sm" onClick={onAddSubcategory} className="rounded-lg"><Plus /> Adicionar subcategoria</Button>}</div><p className="mb-4 text-xl font-bold">{money.format(total)}</p>{category.kind === "fixed" ? <div className="flex flex-wrap gap-2">{category.subcategories.map((sub) => <span key={sub} className="rounded-lg border border-[#e8e9f1] px-2.5 py-1.5 text-sm text-[#656879]">{sub}</span>)}</div> : <p className="text-sm text-[#8a8da0]">Gastos variáveis são registrados diretamente nesta categoria.</p>}</article>; })}</section></div>; }

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }

function IncomeDialog({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (item: Omit<Income, "id">) => void }) { const [values, setValues] = useState({ description: "", person: "", amount: "", date: "2026-10-01" }); function submit(event: FormEvent) { event.preventDefault(); const amount = Number(values.amount.replace(",", ".")); if (!values.description || !values.person || amount <= 0) return toast.error("Preencha todos os campos obrigatórios"); onSave({ ...values, amount }); setValues({ description: "", person: "", amount: "", date: "2026-10-01" }); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Nova entrada</DialogTitle><DialogDescription>Registre o valor e quem fez o depósito.</DialogDescription></DialogHeader><div className="grid gap-4 py-5"><Field label="Descrição"><Input value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="Ex.: Salário" /></Field><Field label="Pessoa"><Input value={values.person} onChange={(e) => setValues({ ...values, person: e.target.value })} placeholder="Nome de quem depositou" /></Field><div className="grid grid-cols-2 gap-4"><Field label="Valor"><Input inputMode="decimal" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} placeholder="0,00" /></Field><Field label="Data"><Input type="date" value={values.date} onChange={(e) => setValues({ ...values, date: e.target.value })} /></Field></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit"><Check /> Salvar entrada</Button></DialogFooter></form></DialogContent></Dialog>; }

function ExpenseDialog({ open, categories, onOpenChange, onSave }: { open: boolean; categories: Category[]; onOpenChange: (open: boolean) => void; onSave: (item: Omit<Expense, "id">) => void }) { const fixed = categories.find((item) => item.kind === "fixed"); const [values, setValues] = useState({ description: "", categoryId: fixed?.id ?? "fixed", subcategory: fixed?.subcategories[0] ?? "", amount: "", date: "2026-10-01" }); const selected = categories.find((item) => item.id === values.categoryId); const needsSubcategory = selected?.kind === "fixed"; function submit(event: FormEvent) { event.preventDefault(); const amount = Number(values.amount.replace(",", ".")); if (!values.description || !values.categoryId || (needsSubcategory && !values.subcategory) || amount <= 0) return toast.error("Preencha todos os campos obrigatórios"); onSave({ ...values, subcategory: needsSubcategory ? values.subcategory : null, amount }); setValues({ description: "", categoryId: fixed?.id ?? "fixed", subcategory: fixed?.subcategories[0] ?? "", amount: "", date: "2026-10-01" }); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Novo gasto</DialogTitle><DialogDescription>Escolha entre gasto fixo ou variável.</DialogDescription></DialogHeader><div className="grid gap-4 py-5"><Field label="Descrição"><Input value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="Ex.: Conta de energia" /></Field><div className={`grid gap-4 ${needsSubcategory ? "grid-cols-2" : "grid-cols-1"}`}><Field label="Categoria"><Select value={values.categoryId} onValueChange={(categoryId) => { const next = categories.find((item) => item.id === categoryId); setValues({ ...values, categoryId, subcategory: next?.kind === "fixed" ? next.subcategories[0] ?? "" : "" }); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>{needsSubcategory && <Field label="Subcategoria"><Select value={values.subcategory} onValueChange={(subcategory) => setValues({ ...values, subcategory })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{selected?.subcategories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>}</div>{!needsSubcategory && <p className="-mt-2 text-xs text-[#8a8da0]">Gastos variáveis não usam subcategoria.</p>}<div className="grid grid-cols-2 gap-4"><Field label="Valor"><Input inputMode="decimal" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} placeholder="0,00" /></Field><Field label="Data"><Input type="date" value={values.date} onChange={(e) => setValues({ ...values, date: e.target.value })} /></Field></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit"><Check /> Salvar gasto</Button></DialogFooter></form></DialogContent></Dialog>; }

function SubcategoryDialog({ open, existing, onOpenChange, onSave }: { open: boolean; existing: string[]; onOpenChange: (open: boolean) => void; onSave: (name: string) => void }) { const [name, setName] = useState(""); function submit(event: FormEvent) { event.preventDefault(); const normalized = name.trim(); if (!normalized) return toast.error("Informe o nome da subcategoria"); if (existing.some((item) => item.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"))) return toast.error("Esta subcategoria já existe"); onSave(normalized); setName(""); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Nova subcategoria fixa</DialogTitle><DialogDescription>Ela ficará disponível somente ao registrar gastos fixos.</DialogDescription></DialogHeader><div className="py-5"><Field label="Nome da subcategoria"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Saúde" /></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit"><Check /> Adicionar</Button></DialogFooter></form></DialogContent></Dialog>; }

function GoalDialog({ open, goal, onOpenChange, onSave }: { open: boolean; goal: number; onOpenChange: (open: boolean) => void; onSave: (goal: number) => void }) { const [value, setValue] = useState(String(goal)); function submit(event: FormEvent) { event.preventDefault(); const next = Number(value.replace(",", ".")); if (next <= 0) return toast.error("A meta precisa ser maior que zero"); onSave(next); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Meta mensal</DialogTitle><DialogDescription>Defina quanto você pretende receber neste mês.</DialogDescription></DialogHeader><div className="py-5"><Field label="Valor da meta"><div className="relative"><Target className="absolute left-3 top-2.5 size-4 text-[#8a8da0]" /><Input className="pl-9" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></div></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit">Salvar meta</Button></DialogFooter></form></DialogContent></Dialog>; }

function formatDate(value: string) { return shortDate.format(new Date(`${value}T12:00:00`)).replace(".", ""); }
