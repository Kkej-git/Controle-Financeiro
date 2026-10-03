"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Check, CircleDollarSign, LayoutDashboard,
  CalendarRange, ChevronLeft, ChevronRight, Database, Menu, Moon, Pencil, Plus, ReceiptText, Repeat2, Settings2, Sun, Tags, Target,
  Trash2, Undo2, UserRound, UsersRound, WalletCards, X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type View = "dashboard" | "incomes" | "expenses" | "categories" | "people";
type CategoryKind = "fixed" | "variable";
type Income = { id: string; description: string; person: string; amount: number; date: string; createdAt?: string };
type Expense = { id: string; description: string; categoryId: string; subcategory: string | null; amount: number; date: string; paid: boolean; createdAt?: string; recurringExpenseId?: string | null; recurringUntil?: string | null; recurringActive?: boolean | null; recurring?: boolean };
type Category = { id: string; name: string; kind: CategoryKind; color: string; subcategories: string[] };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const todayIso = new Date().toLocaleDateString("en-CA");
const financeApiUrl = typeof window !== "undefined" && ["127.0.0.1", "localhost"].includes(window.location.hostname) ? "http://127.0.0.1:5174/api/finance" : "/api/finance";

export default function FinanceApp() {
  const { resolvedTheme, setTheme } = useTheme();
  const [view, setView] = useState<View>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [goal, setGoal] = useState(0);
  const [goalName, setGoalName] = useState("Meta mensal de entradas");
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [databaseEnabled, setDatabaseEnabled] = useState(false);
  const [dialog, setDialog] = useState<"income" | "expense" | "subcategory" | "person" | "goal" | "goalName" | null>(null);
  const [editing, setEditing] = useState<{ type: "income"; item: Income } | { type: "expense"; item: Expense } | null>(null);
  const [subcategoryKind, setSubcategoryKind] = useState<CategoryKind>("fixed");

  useEffect(() => {
    const controller = new AbortController();
    fetch(financeApiUrl, { signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { configured?: boolean; categories?: Category[]; incomes?: Income[]; expenses?: Expense[]; people?: string[]; goal?: number; goalName?: string; error?: string };
      if (!response.ok || !data.configured) throw new Error(data.error || "Não foi possível conectar ao PostgreSQL.");
      setDatabaseEnabled(true);
      setCategories(data.categories ?? []);
      setIncomes(data.incomes ?? []);
      setExpenses(data.expenses ?? []);
      setPeople(data.people ?? []);
      setGoal(data.goal ?? 0);
      setGoalName(data.goalName || "Meta mensal de entradas");
      setDatabaseError(null);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setDatabaseError(error instanceof Error ? error.message : "Não foi possível conectar ao PostgreSQL.");
    }).finally(() => { if (!controller.signal.aborted) setDatabaseLoading(false); });
    return () => controller.abort();
  }, []);

  async function persist(payload: Record<string, unknown>) {
    if (!databaseEnabled) { toast.error("Conecte o PostgreSQL para salvar dados."); return false; }
    try {
      const response = await fetch(financeApiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar no PostgreSQL.");
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar no PostgreSQL.");
      return false;
    }
  }

  async function refreshFinanceData() {
    const response = await fetch(financeApiUrl);
    const data = await response.json() as { configured?: boolean; categories?: Category[]; incomes?: Income[]; expenses?: Expense[]; people?: string[]; goal?: number; goalName?: string; error?: string };
    if (!response.ok || !data.configured) throw new Error(data.error || "Não foi possível atualizar os dados.");
    setCategories(data.categories ?? []);
    setIncomes(data.incomes ?? []);
    setExpenses(data.expenses ?? []);
    setPeople(data.people ?? []);
    setGoal(data.goal ?? 0);
    setGoalName(data.goalName || "Meta mensal de entradas");
  }

  async function addIncome(payload: Omit<Income, "id">) {
    const item = { ...payload, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    if (!await persist({ type: "income", ...item })) return false;
    setIncomes((current) => [item, ...current]);
    toast.success("Entrada adicionada");
    return true;
  }
  async function addExpense(payload: Omit<Expense, "id">) {
    const draft = { ...payload, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    const result = await persist({ type: "expense", ...draft });
    if (!result) return false;
    const item = { ...draft, paid: false, recurringExpenseId: typeof result.recurringExpenseId === "string" ? result.recurringExpenseId : null, recurringUntil: payload.recurring ? payload.recurringUntil : null, recurringActive: Boolean(payload.recurring) };
    if (payload.recurring) await refreshFinanceData();
    else setExpenses((current) => [item, ...current]);
    toast.success("Gasto adicionado");
    return true;
  }
  async function updateIncome(payload: Omit<Income, "id">) {
    if (!editing || editing.type !== "income") return false;
    const item = { ...editing.item, ...payload };
    if (!await persist({ type: "incomeUpdate", ...item })) return false;
    setIncomes((current) => current.map((entry) => entry.id === item.id ? item : entry));
    toast.success("Entrada atualizada");
    return true;
  }
  async function updateExpense(payload: Omit<Expense, "id">) {
    if (!editing || editing.type !== "expense") return false;
    const draft = { ...editing.item, ...payload };
    const result = await persist({ type: "expenseUpdate", ...draft });
    if (!result) return false;
    const item = { ...draft, recurringExpenseId: typeof result.recurringExpenseId === "string" ? result.recurringExpenseId : null, recurringUntil: payload.recurring ? payload.recurringUntil : null, recurringActive: Boolean(payload.recurring) };
    if (editing.item.recurringExpenseId || payload.recurring) await refreshFinanceData();
    else setExpenses((current) => current.map((entry) => entry.id === item.id ? item : entry));
    toast.success("Gasto atualizado");
    return true;
  }
  async function setExpensePaid(id: string, paid: boolean) {
    const result = await persist({ type: "expensePaid", id, paid });
    if (!result) return false;
    setExpenses((current) => current.map((item) => item.id === id ? { ...item, paid } : item));
    toast.success(paid ? "Conta marcada como paga" : "Pagamento desfeito");
    return true;
  }

  async function removeTransaction(type: "income" | "expense", id: string) {
    const expense = type === "expense" ? expenses.find((item) => item.id === id) : null;
    const recurrenceId = expense?.recurringActive ? expense.recurringExpenseId : null;
    if (!await persist({ type: type === "income" ? "incomeDelete" : "expenseDelete", id })) return;
    if (type === "income") setIncomes((current) => current.filter((item) => item.id !== id));
    else if (recurrenceId) await refreshFinanceData();
    else setExpenses((current) => current.filter((item) => item.id !== id));
    toast.success(type === "income" ? "Entrada excluída" : recurrenceId ? "Recorrência cancelada; histórico preservado" : "Gasto excluído");
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
      execute: async (input: Omit<Income, "id">) => { if (!await addIncome(input)) throw new Error("Não foi possível salvar a entrada no PostgreSQL."); return { status: "created", description: input.description, amount: input.amount }; },
    });
    void register({
      name: "add_expense", title: "Adicionar gasto", description: "Registra um gasto em uma categoria e atualiza o dashboard.",
      inputSchema: { type: "object", properties: { description: { type: "string" }, categoryId: { type: "string" }, subcategory: { type: "string" }, amount: { type: "number", minimum: 0.01 }, date: { type: "string" }, recurring: { type: "boolean" }, recurringUntil: { type: "string" } }, required: ["description", "categoryId", "subcategory", "amount", "date"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: Omit<Expense, "id">) => { const category = categories.find((item) => item.id === input.categoryId); if (!category) throw new Error("Categoria inválida"); if (!input.subcategory || !category.subcategories.includes(input.subcategory)) throw new Error("Subcategoria inválida"); if (!await addExpense(input)) throw new Error("Não foi possível salvar o gasto no PostgreSQL."); return { status: "created", description: input.description, amount: input.amount }; },
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
          {(databaseLoading || databaseError) && <div className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 text-sm ${databaseError ? "border-[#f2c8cf] bg-[#fff5f6] text-[#9f3043]" : "border-[#dedbea] bg-white text-[#676a7c]"}`}><Database className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">{databaseError ? "PostgreSQL indisponível" : "Carregando dados do PostgreSQL"}</p><p className="mt-1">{databaseError ?? "Aguarde enquanto os dados são carregados."}</p></div></div>}
          {view === "dashboard" && <Dashboard goal={goal} goalName={goalName} incomes={incomes} expenses={expenses} categories={categories} onEditGoalName={() => setDialog("goalName")} onSetExpensePaid={setExpensePaid} />}
          {view === "incomes" && <ListView type="income" title="Todas as entradas" description="Acompanhe quem depositou e quando o valor entrou." items={incomes} people={people} onAdd={() => { setEditing(null); setDialog("income"); }} onEdit={(item) => { setEditing({ type: "income", item: item as Income }); setDialog("income"); }} onRemove={(id) => removeTransaction("income", id)} />}
          {view === "expenses" && <ListView type="expense" title="Todos os gastos" description="Consulte os gastos por categoria e subcategoria." items={expenses} categories={categories} onAdd={() => { setEditing(null); setDialog("expense"); }} onEdit={(item) => { setEditing({ type: "expense", item: item as Expense }); setDialog("expense"); }} onRemove={(id) => removeTransaction("expense", id)} />}
          {view === "categories" && <CategoriesView categories={categories} expenses={expenses} onAddSubcategory={(kind) => { setSubcategoryKind(kind); setDialog("subcategory"); }} onRemoveSubcategory={async (categoryId, name) => { if (!await persist({ type: "subcategoryDeactivate", categoryId, name })) return; setCategories((current) => current.map((category) => category.id === categoryId ? { ...category, subcategories: category.subcategories.filter((item) => item !== name) } : category)); toast.success("Subcategoria removida"); }} />}
          {view === "people" && <PeopleView people={people} onAdd={() => setDialog("person")} onRemove={async (name) => { if (!await persist({ type: "personDeactivate", name })) return; setPeople((current) => current.filter((person) => person !== name)); toast.success("Pessoa removida da seleção"); }} />}
        </div>
      </main>

      <IncomeDialog key={`${people.join("|")}-${editing?.type === "income" ? editing.item.id : "new"}`} open={dialog === "income"} people={people} item={editing?.type === "income" ? editing.item : undefined} onOpenChange={(open) => { if (!open) { setDialog(null); setEditing(null); } }} onSave={async (item) => { const saved = editing?.type === "income" ? await updateIncome(item) : await addIncome(item); if (saved) { setDialog(null); setEditing(null); } return saved; }} />
      <ExpenseDialog key={editing?.type === "expense" ? editing.item.id : "new-expense"} open={dialog === "expense"} categories={categories} item={editing?.type === "expense" ? editing.item : undefined} onOpenChange={(open) => { if (!open) { setDialog(null); setEditing(null); } }} onSave={async (item) => { const saved = editing?.type === "expense" ? await updateExpense(item) : await addExpense(item); if (saved) { setDialog(null); setEditing(null); } return saved; }} />
      <SubcategoryDialog open={dialog === "subcategory"} kind={subcategoryKind} existing={categories.find((item) => item.kind === subcategoryKind)?.subcategories ?? []} onOpenChange={(open) => !open && setDialog(null)} onSave={async (name) => { const targetCategory = categories.find((category) => category.kind === subcategoryKind); if (!targetCategory || !await persist({ type: "subcategory", categoryId: targetCategory.id, name })) return false; setCategories((current) => current.map((category) => category.kind === subcategoryKind ? { ...category, subcategories: [...category.subcategories, name] } : category)); setDialog(null); toast.success("Subcategoria adicionada"); return true; }} />
      <PersonDialog open={dialog === "person"} existing={people} onOpenChange={(open) => !open && setDialog(null)} onSave={async (name) => { if (!await persist({ type: "person", name })) return false; setPeople((current) => [...current, name]); setDialog(null); toast.success("Pessoa adicionada"); return true; }} />
      <GoalDialog key={goal} open={dialog === "goal"} goal={goal} onOpenChange={(open) => !open && setDialog(null)} onSave={async (value) => { if (!await persist({ type: "goal", amount: value })) return false; setGoal(value); setDialog(null); toast.success("Meta mensal atualizada"); return true; }} />
      <GoalNameDialog key={goalName} open={dialog === "goalName"} name={goalName} onOpenChange={(open) => !open && setDialog(null)} onSave={async (name) => { if (!await persist({ type: "goalName", name })) return false; setGoalName(name); setDialog(null); toast.success("Nome da meta atualizado"); return true; }} />
      <Toaster position="top-right" richColors />
    </div>
  );
}

type ChartItem = { name: string; value: number; color: string };
type DashboardPeriod = "month" | "last7" | "custom";
function Dashboard({ goal, goalName, incomes, expenses, categories, onEditGoalName, onSetExpensePaid }: { goal: number; goalName: string; incomes: Income[]; expenses: Expense[]; categories: Category[]; onEditGoalName: () => void; onSetExpensePaid: (id: string, paid: boolean) => Promise<boolean> }) {
  const currentMonth = todayIso.slice(0, 7);
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [customRange, setCustomRange] = useState(() => ({ from: `${currentMonth}-01`, to: todayIso }));
  const bounds = useMemo(() => dashboardPeriodBounds(period, selectedMonth, customRange), [period, selectedMonth, customRange]);
  const periodIncomes = useMemo(() => incomes.filter((item) => item.date >= bounds.from && item.date <= bounds.to), [bounds, incomes]);
  const periodExpenses = useMemo(() => expenses.filter((item) => item.date >= bounds.from && item.date <= bounds.to), [bounds, expenses]);
  const totalIncome = periodIncomes.reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = periodExpenses.reduce((sum, item) => sum + item.amount, 0);
  const cashBalance = incomes.filter((item) => item.date <= bounds.to).reduce((sum, item) => sum + item.amount, 0) - expenses.filter((item) => item.date <= bounds.to).reduce((sum, item) => sum + item.amount, 0);
  const goalProgress = goal > 0 ? Math.min((totalIncome / goal) * 100, 100) : 0;
  const periodLabel = formatPeriodLabel(bounds.from, bounds.to);
  const groupChart = useMemo(() => (["fixed", "variable"] as CategoryKind[]).map((kind) => ({
    name: kind === "fixed" ? "Fixos" : "Variáveis",
    value: periodExpenses.filter((item) => categories.find((category) => category.id === item.categoryId)?.kind === kind).reduce((sum, item) => sum + item.amount, 0),
    color: kind === "fixed" ? "#6d5dfb" : "#ff8a3d",
  })).filter((item) => item.value > 0), [categories, periodExpenses]);
  const fixedSubcategoryChart = useMemo(() => subcategoryChart(periodExpenses, categories, "fixed", ["#6d5dfb", "#ff8a3d", "#22c55e", "#ef476f", "#118ab2", "#ffd166"]), [categories, periodExpenses]);
  const variableSubcategoryChart = useMemo(() => subcategoryChart(periodExpenses, categories, "variable", ["#00a6a6", "#f94144", "#f9c74f", "#577590", "#9b5de5", "#f3722c"]), [categories, periodExpenses]);
  const pendingExpenses = useMemo(() => periodExpenses.filter((item) => !item.paid).sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description)), [periodExpenses]);
  const paidExpenses = useMemo(() => periodExpenses.filter((item) => item.paid).sort((a, b) => b.date.localeCompare(a.date) || b.description.localeCompare(a.description)), [periodExpenses]);
  const paidTotal = paidExpenses.reduce((sum, item) => sum + item.amount, 0);
  const remainingTotal = totalExpense - paidTotal;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-[#e8e9f1] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#efedfc] text-[#6657d9]"><CalendarRange className="size-5" /></span><div><p className="text-sm font-semibold">Período da visão geral</p><p className="text-xs text-[#85889a]">{periodLabel}</p></div></div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Período"><Select value={period} onValueChange={(value) => setPeriod(value as DashboardPeriod)}><SelectTrigger className="w-full sm:w-[190px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">Mês</SelectItem><SelectItem value="last7">Últimos 7 dias</SelectItem><SelectItem value="custom">Personalizado</SelectItem></SelectContent></Select></Field>
          {period === "month" && <div className="flex items-center gap-2"><Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}><ChevronLeft /></Button><Button variant="outline" className="min-w-[150px] capitalize" onClick={() => setSelectedMonth(currentMonth)}>{formatMonth(selectedMonth)}</Button><Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}><ChevronRight /></Button></div>}
          {period === "custom" && <div className="grid grid-cols-2 gap-3"><Field label="De"><Input type="date" value={customRange.from} max={customRange.to} onChange={(event) => setCustomRange({ ...customRange, from: event.target.value })} /></Field><Field label="Até"><Input type="date" value={customRange.to} min={customRange.from} onChange={(event) => setCustomRange({ ...customRange, to: event.target.value })} /></Field></div>}
        </div>
      </div>
    </section>
    <section className="grid gap-4 md:grid-cols-3"><SummaryCard title="Entradas" value={money.format(totalIncome)} hint={goal > 0 ? `${Math.round(goalProgress)}% da meta mensal` : periodLabel} icon={<ArrowDownLeft className="size-5" />} tone="green" /><SummaryCard title="Gastos" value={money.format(totalExpense)} hint={`${totalIncome ? Math.round(totalExpense / totalIncome * 100) : 0}% das entradas no período`} icon={<ArrowUpRight className="size-5" />} tone="red" /><SummaryCard title="Caixa" value={money.format(cashBalance)} hint={`Acumulado até ${formatDateLong(bounds.to)}`} icon={<WalletCards className="size-5" />} tone="purple" /></section>
    <section className="rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:p-6"><div className="mb-4 flex items-center justify-between gap-4"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold">{goalName}</p><button aria-label="Renomear meta" onClick={onEditGoalName} className="text-[#8e91a2] hover:text-[#6657d9]"><Pencil className="size-3.5" /></button></div><p className="mt-1 text-sm text-[#85889a]">{goal <= 0 ? "Defina uma meta para acompanhar seu progresso." : totalIncome >= goal ? "Meta alcançada. Ótimo trabalho!" : `Faltam ${money.format(goal - totalIncome)} para alcançar sua meta`}</p></div><p className="text-right text-sm text-[#85889a]"><strong className="block text-base text-[#252735]">{money.format(totalIncome)}</strong>{goal > 0 ? <>de {money.format(goal)}</> : "Meta não definida"}</p></div><Progress value={goalProgress} className="h-3 bg-[#eeecfb] [&_[data-slot=progress-indicator]]:bg-[#6657d9]" /></section>
    <section className="grid items-stretch gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <div className="h-[430px] overflow-hidden rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:h-[450px] sm:p-6 xl:h-[580px]"><div className="mb-4"><h2 className="font-semibold">Distribuição dos gastos</h2><p className="mt-1 text-sm text-[#85889a]">Categorias e suas subcategorias</p></div><Tabs defaultValue="group"><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="group">Total</TabsTrigger><TabsTrigger value="fixed">Fixas</TabsTrigger><TabsTrigger value="variable">Variáveis</TabsTrigger></TabsList><TabsContent value="group"><ChartBlock data={groupChart} total={totalExpense} /></TabsContent><TabsContent value="fixed"><ChartBlock data={fixedSubcategoryChart} total={fixedSubcategoryChart.reduce((sum, item) => sum + item.value, 0)} empty="Ainda não há gastos fixos." /></TabsContent><TabsContent value="variable"><ChartBlock data={variableSubcategoryChart} total={variableSubcategoryChart.reduce((sum, item) => sum + item.value, 0)} empty="Ainda não há gastos variáveis." /></TabsContent></Tabs></div>
      <BillsPanel
        pendingExpenses={pendingExpenses}
        paidExpenses={paidExpenses}
        categories={categories}
        expenseTotal={totalExpense}
        paidTotal={paidTotal}
        remainingTotal={remainingTotal}
        onSetExpensePaid={onSetExpensePaid}
      />
    </section>
  </div>;
}

function BillsPanel({ pendingExpenses, paidExpenses, categories, expenseTotal, paidTotal, remainingTotal, onSetExpensePaid }: {
  pendingExpenses: Expense[];
  paidExpenses: Expense[];
  categories: Category[];
  expenseTotal: number;
  paidTotal: number;
  remainingTotal: number;
  onSetExpensePaid: (id: string, paid: boolean) => Promise<boolean>;
}) {
  const expenseMeta = (item: Expense) => {
    const category = categories.find((entry) => entry.id === item.categoryId);
    return item.subcategory ? `${category?.name ?? "Categoria"} • ${item.subcategory}` : category?.name ?? "Sem categoria";
  };

  return <div className="flex h-[760px] flex-col overflow-hidden rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:h-[680px] sm:p-6 xl:h-[580px]">
    <div className="mb-4 flex items-start justify-between">
      <div><h2 className="font-semibold">Contas do período</h2><p className="mt-1 text-sm text-[#85889a]">Acompanhe os pagamentos e desfaça uma baixa quando precisar.</p></div>
      <ReceiptText className="size-5 text-[#9b9eae]" />
    </div>
    <div className="mb-5 rounded-xl bg-[#fafafd] p-4">
      <div className="flex items-end justify-between gap-4">
        <div><p className="text-xs font-medium text-[#85889a]">Total de gastos do período</p><p className="mt-1 text-lg font-bold text-[#252735]">{money.format(expenseTotal)}</p></div>
        <div className="text-right"><p className="text-xs font-medium text-[#85889a]">Restante a pagar</p><p className={`mt-1 text-lg font-bold ${remainingTotal > 0 ? "text-[#d24d64]" : "text-[#16845b]"}`}>{money.format(remainingTotal)}</p></div>
      </div>
      <p className="mt-2 text-xs text-[#9295a6]">Já pago: {money.format(paidTotal)}</p>
    </div>
    <div className="grid min-h-0 flex-1 grid-rows-2 gap-5 lg:grid-cols-2 lg:grid-rows-1 lg:gap-0">
      <section className="flex min-h-0 min-w-0 flex-col lg:pr-5">
        <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Para pagar</h3><span className="rounded-full bg-[#fff0f2] px-2 py-0.5 text-xs font-semibold text-[#d24d64]">{pendingExpenses.length}</span></div>
        <p className="mb-2 text-xs text-[#9295a6]">Do vencimento mais próximo ao mais distante</p>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {pendingExpenses.map((item) => {
            const overdue = item.date < todayIso;
            return <div key={item.id} className="flex items-center gap-3 border-b border-[#f0f0f4] py-3 last:border-0">
              <Checkbox checked={false} aria-label={`Marcar ${item.description} como paga`} onCheckedChange={async (checked) => { if (checked === true) await onSetExpensePaid(item.id, true); }} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.description}</p><p className="truncate text-xs text-[#9194a5]">{expenseMeta(item)} • {overdue ? `Venceu ${formatDate(item.date)}` : `Vence ${formatDate(item.date)}`}</p></div>
              <p className="text-sm font-semibold text-[#d24d64]">{money.format(item.amount)}</p>
            </div>;
          })}
          {!pendingExpenses.length && <div className="py-8 text-center"><p className="text-sm font-semibold text-[#16845b]">Tudo pago!</p><p className="mt-1 text-xs text-[#85889a]">Não há contas pendentes neste período.</p></div>}
        </div>
      </section>
      <section className="flex min-h-0 min-w-0 flex-col border-t border-[#ececf2] pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
        <div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Pagas recentemente</h3><span className="rounded-full bg-[#eaf8f1] px-2 py-0.5 text-xs font-semibold text-[#16845b]">{paidExpenses.length}</span></div>
        <p className="mb-2 text-xs text-[#9295a6]">Pagamentos do período, dos mais recentes aos mais antigos</p>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {paidExpenses.map((item) => <div key={item.id} className="flex items-center gap-3 border-b border-[#f0f0f4] py-3 last:border-0">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#eaf8f1] text-[#16845b]"><Check className="size-3.5" /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.description}</p><p className="truncate text-xs text-[#9194a5]">{expenseMeta(item)} • {formatDate(item.date)}</p></div>
            <div className="flex shrink-0 flex-col items-end gap-1"><p className="text-sm font-semibold text-[#16845b]">{money.format(item.amount)}</p><Button variant="ghost" size="xs" className="text-[#696c7e]" onClick={() => void onSetExpensePaid(item.id, false)}><Undo2 />Desfazer</Button></div>
          </div>)}
          {!paidExpenses.length && <div className="py-8 text-center"><p className="text-sm font-semibold text-[#696c7e]">Nenhuma conta paga</p><p className="mt-1 text-xs text-[#85889a]">Os pagamentos aparecerão aqui.</p></div>}
        </div>
      </section>
    </div>
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

function SummaryCard({ title, value, hint, icon, tone }: { title: string; value: string; hint: string; icon: ReactNode; tone: "green" | "red" | "purple" }) { const styles = { green: "bg-[#eaf8f1] text-[#16845b]", red: "bg-[#fff0f2] text-[#d24d64]", purple: "bg-[#efedfc] text-[#6657d9]" }; return <article className="rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><p className="text-sm font-medium text-[#747789]">{title}</p><span className={`grid size-10 place-items-center rounded-xl ${styles[tone]}`}>{icon}</span></div><p className={`text-2xl font-bold tracking-[-0.035em] ${title === "Caixa" ? (value.startsWith("-") ? "text-[#d24d64]" : "text-[#16845b]") : ""}`}>{value}</p><p className="mt-1.5 text-xs text-[#9295a6]">{hint}</p></article>; }

function ListView({ type, title, description, items, categories = [], people = [], onAdd, onEdit, onRemove }: { type: "income" | "expense"; title: string; description: string; items: Income[] | Expense[]; categories?: Category[]; people?: string[]; onAdd: () => void; onEdit: (item: Income | Expense) => void; onRemove: (id: string) => void }) {
  const isIncome = type === "income";
  const currentMonthRange = dashboardPeriodBounds("month", todayIso.slice(0, 7), { from: "", to: "" });
  const [filters, setFilters] = useState({ from: currentMonthRange.from, to: currentMonthRange.to, person: "all", categoryId: "all", subcategory: "all" });
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
  const filteredTotal = filtered.reduce((sum, item) => sum + item.amount, 0);
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead className="bg-[#fafafd] text-xs uppercase tracking-wide text-[#8a8da0]"><tr><th className="px-6 py-3 font-medium">Descrição</th><th className="px-6 py-3 font-medium">{isIncome ? "Pessoa" : "Categoria"}</th><th className="px-6 py-3 font-medium">{isIncome ? "Data" : "Subcategoria"}</th>{!isIncome && <th className="px-6 py-3 font-medium">Data</th>}<th className="px-6 py-3 text-right font-medium">Valor</th><th className="px-6 py-3 text-right font-medium">Ações</th></tr></thead>
        <tbody>{filtered.map((raw) => {
          const item = raw as Income & Expense;
          const category = categories.find((cat) => cat.id === item.categoryId);
          const isRecurring = !isIncome && Boolean(item.recurringExpenseId && item.recurringActive);
          const removeDescription = isRecurring ? "A recorrência será cancelada e somente os lançamentos futuros serão removidos. Os valores de hoje e do histórico permanecerão salvos." : "Esta movimentação será excluída permanentemente dos totais e gráficos.";
          return <tr key={item.id} className="border-t border-[#f0f0f4]"><td className="px-6 py-4 text-sm font-semibold"><span>{item.description}</span>{isRecurring && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#efedfc] px-2 py-0.5 text-xs font-medium text-[#6657d9]"><Repeat2 className="size-3" /> Recorrente</span>}</td><td className="px-6 py-4 text-sm text-[#676a7c]">{isIncome ? <span className="flex items-center gap-2"><UserRound className="size-4" />{item.person}</span> : <span className="inline-flex items-center gap-2"><i className="size-2 rounded-full" style={{ backgroundColor: category?.color }} />{category?.name}</span>}</td><td className="px-6 py-4 text-sm text-[#676a7c]">{isIncome ? formatDate(item.date) : item.subcategory || "—"}</td>{!isIncome && <td className="px-6 py-4 text-sm text-[#676a7c]">{formatDate(item.date)}</td>}<td className={`px-6 py-4 text-right text-sm font-bold ${isIncome ? "text-[#16845b]" : "text-[#d24d64]"}`}>{isIncome ? "+ " : "- "}{money.format(item.amount)}</td><td className="px-6 py-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Editar ${item.description}`} onClick={() => onEdit(raw)}><Pencil /></Button><ConfirmRemove label={item.description} description={removeDescription} onRemove={() => onRemove(item.id)} /></div></td></tr>;
        })}</tbody>
      </table>
    </div>
    {!filtered.length && <p className="border-t border-[#f0f0f4] p-8 text-center text-sm text-[#85889a]">Nenhuma movimentação encontrada com estes filtros.</p>}
    {<div className="flex items-center justify-between gap-4 border-t border-[#eeeeF3] bg-[#fafafd] px-5 py-4 sm:px-6"><div><p className="text-sm font-medium text-[#747789]">Resultado dos filtros</p><p className="mt-0.5 text-xs text-[#9295a6]">{filtered.length} {filtered.length === 1 ? (isIncome ? "entrada encontrada" : "gasto encontrado") : (isIncome ? "entradas encontradas" : "gastos encontrados")}</p></div><p className={`text-xl font-bold ${isIncome ? "text-[#16845b]" : "text-[#d24d64]"}`}>{money.format(filteredTotal)}</p></div>}
  </section>;
}

function CategoriesView({ categories, expenses, onAddSubcategory, onRemoveSubcategory }: { categories: Category[]; expenses: Expense[]; onAddSubcategory: (kind: CategoryKind) => void; onRemoveSubcategory: (categoryId: string, name: string) => void }) { return <div><div className="mb-5"><p className="text-sm text-[#777a8c]">Organize as subcategorias dos gastos fixos e variáveis.</p></div><section className="grid gap-4 md:grid-cols-2">{categories.map((category) => { const total = expenses.filter((item) => item.categoryId === category.id).reduce((sum, item) => sum + item.amount, 0); return <article key={category.id} className="rounded-2xl border border-[#e8e9f1] bg-white p-5"><div className="mb-5 flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="size-11 rounded-xl" style={{ backgroundColor: category.color }} /><div><h2 className="font-semibold">{category.name}</h2><p className="text-xs text-[#8a8da0]">{category.subcategories.length} subcategorias</p></div></div><Button variant="outline" size="sm" onClick={() => onAddSubcategory(category.kind)} className="rounded-lg"><Plus /> Adicionar subcategoria</Button></div><p className="mb-4 text-xl font-bold">{money.format(total)}</p><div className="flex flex-wrap gap-2">{category.subcategories.map((sub) => <RemovableItem key={sub} label={sub} description={`Os gastos já registrados em ${sub} continuarão no histórico.`} onRemove={() => onRemoveSubcategory(category.id, sub)} />)}</div></article>; })}</section></div>; }

function PeopleView({ people, onAdd, onRemove }: { people: string[]; onAdd: () => void; onRemove: (name: string) => void }) { return <section className="rounded-2xl border border-[#e8e9f1] bg-white p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Pessoas disponíveis</h2><p className="mt-1 text-sm text-[#85889a]">Selecione uma delas ao registrar uma entrada.</p></div><Button onClick={onAdd} className="rounded-xl bg-[#6657d9] hover:bg-[#5849c8]"><Plus /> Nova pessoa</Button></div>{people.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{people.map((person) => <div key={person} className="flex items-center gap-3 rounded-xl border border-[#e8e9f1] p-3"><span className="grid size-10 place-items-center rounded-xl bg-[#efedfc] text-[#6657d9]"><UserRound className="size-5" /></span><p className="flex-1 text-sm font-semibold">{person}</p><ConfirmRemove label={person} description="A pessoa deixará de aparecer nas novas entradas. O histórico existente será mantido." onRemove={() => onRemove(person)} /></div>)}</div> : <p className="rounded-xl border border-dashed border-[#e8e9f1] p-8 text-center text-sm text-[#85889a]">Adicione uma pessoa para registrar novas entradas.</p>}</section>; }

function RemovableItem({ label, description, onRemove }: { label: string; description: string; onRemove: () => void }) { return <span className="inline-flex items-center gap-1 rounded-lg border border-[#e8e9f1] py-1 pl-2.5 pr-1 text-sm text-[#656879]">{label}<ConfirmRemove label={label} description={description} onRemove={onRemove} compact /></span>; }

function ConfirmRemove({ label, description, onRemove, compact = false }: { label: string; description: string; onRemove: () => void; compact?: boolean }) { return <AlertDialog><AlertDialogTrigger asChild><button className={`grid place-items-center rounded-md text-[#a0a3b2] hover:bg-[#fff0f2] hover:text-[#d24d64] ${compact ? "size-7" : "size-8"}`} aria-label={`Remover ${label}`}><Trash2 className="size-4" /></button></AlertDialogTrigger><AlertDialogContent size="sm"><AlertDialogHeader><AlertDialogTitle>Remover {label}?</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onRemove}>Remover</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>; }

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div>; }

function IncomeDialog({ open, people, item, onOpenChange, onSave }: { open: boolean; people: string[]; item?: Income; onOpenChange: (open: boolean) => void; onSave: (item: Omit<Income, "id">) => Promise<boolean> }) { const [values, setValues] = useState({ description: item?.description ?? "", person: item?.person ?? people[0] ?? "", amount: item ? String(item.amount) : "", date: item?.date ?? todayIso }); const [saving, setSaving] = useState(false); async function submit(event: FormEvent) { event.preventDefault(); const amount = Number(values.amount.replace(",", ".")); if (!values.description || !values.person || amount <= 0) return toast.error("Preencha todos os campos obrigatórios"); setSaving(true); await onSave({ ...values, amount, createdAt: item?.createdAt }); setSaving(false); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>{item ? "Editar entrada" : "Nova entrada"}</DialogTitle><DialogDescription>{item ? "Atualize os dados desta entrada." : "Registre o valor e selecione quem fez o depósito."}</DialogDescription></DialogHeader><div className="grid gap-4 py-5"><Field label="Descrição"><Input value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="Ex.: Salário" /></Field><Field label="Pessoa"><Select value={values.person} onValueChange={(person) => setValues({ ...values, person })}><SelectTrigger className="w-full"><SelectValue placeholder="Selecione uma pessoa" /></SelectTrigger><SelectContent>{!people.includes(values.person) && values.person && <SelectItem value={values.person}>{values.person} (removida)</SelectItem>}{people.map((person) => <SelectItem key={person} value={person}>{person}</SelectItem>)}</SelectContent></Select>{!people.length && !item && <p className="text-xs text-[#d24d64]">Adicione uma pessoa na seção Pessoas antes de registrar a entrada.</p>}</Field><div className="grid grid-cols-2 gap-4"><Field label="Valor"><Input inputMode="decimal" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} placeholder="0,00" /></Field><Field label="Data"><Input type="date" value={values.date} onChange={(e) => setValues({ ...values, date: e.target.value })} /></Field></div></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving || (!people.length && !item)} className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit"><Check /> {saving ? "Salvando..." : item ? "Salvar alterações" : "Salvar entrada"}</Button></DialogFooter></form></DialogContent></Dialog>; }

function ExpenseDialog({ open, categories, item, onOpenChange, onSave }: { open: boolean; categories: Category[]; item?: Expense; onOpenChange: (open: boolean) => void; onSave: (item: Omit<Expense, "id">) => Promise<boolean> }) {
  const first = categories[0];
  const [values, setValues] = useState({ description: item?.description ?? "", categoryId: item?.categoryId ?? first?.id ?? "", subcategory: item?.subcategory ?? first?.subcategories[0] ?? "", amount: item ? String(item.amount) : "", date: item?.date ?? todayIso, recurring: Boolean(item?.recurringExpenseId && item?.recurringActive), recurringUntil: item?.recurringUntil ?? "" });
  const [saving, setSaving] = useState(false);
  const selected = categories.find((entry) => entry.id === values.categoryId);
  const canRepeat = selected?.kind === "fixed";
  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(values.amount.replace(",", "."));
    if (!values.description || !values.categoryId || !values.subcategory || amount <= 0) return toast.error("Preencha todos os campos obrigatórios");
    if (values.recurring && (!values.recurringUntil || values.recurringUntil < values.date)) return toast.error("Informe uma data final igual ou posterior à primeira cobrança");
    setSaving(true);
    await onSave({ ...values, recurring: canRepeat && values.recurring, amount, createdAt: item?.createdAt, recurringExpenseId: item?.recurringExpenseId });
    setSaving(false);
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>{item ? "Editar gasto" : "Novo gasto"}</DialogTitle><DialogDescription>{item ? "Atualize os dados deste gasto." : "Escolha a categoria e a subcategoria do gasto."}</DialogDescription></DialogHeader><div className="grid gap-4 py-5"><Field label="Descrição"><Input value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="Ex.: Conta de energia" /></Field><div className="grid grid-cols-2 gap-4"><Field label="Categoria"><Select value={values.categoryId} onValueChange={(categoryId) => { const next = categories.find((entry) => entry.id === categoryId); setValues({ ...values, categoryId, subcategory: next?.subcategories[0] ?? "", recurring: next?.kind === "fixed" ? values.recurring : false, recurringUntil: next?.kind === "fixed" ? values.recurringUntil : "" }); }}><SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{categories.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Subcategoria"><Select value={values.subcategory ?? ""} onValueChange={(subcategory) => setValues({ ...values, subcategory })}><SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{values.subcategory && !selected?.subcategories.includes(values.subcategory) && <SelectItem value={values.subcategory}>{values.subcategory} (removida)</SelectItem>}{selected?.subcategories.map((entry) => <SelectItem key={entry} value={entry}>{entry}</SelectItem>)}</SelectContent></Select></Field></div><div className="grid grid-cols-2 gap-4"><Field label="Valor"><Input inputMode="decimal" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value })} placeholder="0,00" /></Field><Field label="Data da primeira cobrança"><Input type="date" value={values.date} onChange={(e) => setValues({ ...values, date: e.target.value, recurringUntil: values.recurringUntil && values.recurringUntil < e.target.value ? "" : values.recurringUntil })} /></Field></div>{canRepeat && <div className="rounded-xl border border-[#e8e9f1] bg-[#fafafd] p-4"><div className="flex items-center justify-between gap-4"><div><Label htmlFor="recurring-expense">Gasto recorrente</Label><p className="mt-1 text-xs text-[#85889a]">Repete mensalmente no mesmo dia.</p></div><Switch id="recurring-expense" checked={values.recurring} onCheckedChange={(recurring) => setValues({ ...values, recurring, recurringUntil: recurring ? values.recurringUntil : "" })} /></div>{values.recurring && <div className="mt-4"><Field label="Repetir até"><Input type="date" min={values.date} value={values.recurringUntil} onChange={(e) => setValues({ ...values, recurringUntil: e.target.value })} /></Field></div>}</div>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving || !categories.length} className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit"><Check /> {saving ? "Salvando..." : item ? "Salvar alterações" : "Salvar gasto"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function SubcategoryDialog({ open, kind, existing, onOpenChange, onSave }: { open: boolean; kind: CategoryKind; existing: string[]; onOpenChange: (open: boolean) => void; onSave: (name: string) => Promise<boolean> }) { const [name, setName] = useState(""); const [saving, setSaving] = useState(false); const label = kind === "fixed" ? "fixa" : "variável"; async function submit(event: FormEvent) { event.preventDefault(); const normalized = name.trim(); if (!normalized) return toast.error("Informe o nome da subcategoria"); if (existing.some((item) => item.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"))) return toast.error("Esta subcategoria já existe"); setSaving(true); if (await onSave(normalized)) setName(""); setSaving(false); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Nova subcategoria {label}</DialogTitle><DialogDescription>Ela ficará disponível ao registrar gastos {kind === "fixed" ? "fixos" : "variáveis"}.</DialogDescription></DialogHeader><div className="py-5"><Field label="Nome da subcategoria"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Saúde" /></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit"><Check /> {saving ? "Salvando..." : "Adicionar"}</Button></DialogFooter></form></DialogContent></Dialog>; }

function PersonDialog({ open, existing, onOpenChange, onSave }: { open: boolean; existing: string[]; onOpenChange: (open: boolean) => void; onSave: (name: string) => Promise<boolean> }) { const [name, setName] = useState(""); const [saving, setSaving] = useState(false); async function submit(event: FormEvent) { event.preventDefault(); const normalized = name.trim(); if (!normalized) return toast.error("Informe o nome da pessoa"); if (existing.some((item) => item.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"))) return toast.error("Esta pessoa já existe"); setSaving(true); if (await onSave(normalized)) setName(""); setSaving(false); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Nova pessoa</DialogTitle><DialogDescription>Ela ficará disponível para seleção nas novas entradas.</DialogDescription></DialogHeader><div className="py-5"><Field label="Nome"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana" /></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit"><Check /> {saving ? "Salvando..." : "Adicionar"}</Button></DialogFooter></form></DialogContent></Dialog>; }

function GoalDialog({ open, goal, onOpenChange, onSave }: { open: boolean; goal: number; onOpenChange: (open: boolean) => void; onSave: (goal: number) => Promise<boolean> }) { const [value, setValue] = useState(goal > 0 ? String(goal) : ""); const [saving, setSaving] = useState(false); async function submit(event: FormEvent) { event.preventDefault(); const next = Number(value.replace(",", ".")); if (next <= 0) return toast.error("A meta precisa ser maior que zero"); setSaving(true); await onSave(next); setSaving(false); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Meta mensal</DialogTitle><DialogDescription>Defina quanto você pretende receber neste mês.</DialogDescription></DialogHeader><div className="py-5"><Field label="Valor da meta"><div className="relative"><Target className="absolute left-3 top-2.5 size-4 text-[#8a8da0]" /><Input className="pl-9" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></div></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit">{saving ? "Salvando..." : "Salvar meta"}</Button></DialogFooter></form></DialogContent></Dialog>; }

function GoalNameDialog({ open, name, onOpenChange, onSave }: { open: boolean; name: string; onOpenChange: (open: boolean) => void; onSave: (name: string) => Promise<boolean> }) { const [value, setValue] = useState(name); const [saving, setSaving] = useState(false); async function submit(event: FormEvent) { event.preventDefault(); const next = value.trim(); if (!next) return toast.error("Informe um nome para a meta"); setSaving(true); await onSave(next); setSaving(false); } return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={submit}><DialogHeader><DialogTitle>Nome da meta</DialogTitle><DialogDescription>Escolha como esta meta mensal será identificada na visão geral.</DialogDescription></DialogHeader><div className="py-5"><Field label="Nome"><Input autoFocus maxLength={60} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ex.: Meta de faturamento" /></Field></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={saving} className="bg-[#6657d9] hover:bg-[#5849c8]" type="submit">{saving ? "Salvando..." : "Salvar nome"}</Button></DialogFooter></form></DialogContent></Dialog>; }

function dashboardPeriodBounds(period: DashboardPeriod, selectedMonth: string, customRange: { from: string; to: string }) {
  if (period === "last7") return { from: shiftDay(todayIso, -6), to: todayIso };
  if (period === "custom") return customRange;
  const [year, month] = selectedMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${selectedMonth}-01`, to: `${selectedMonth}-${String(lastDay).padStart(2, "0")}` };
}

function shiftDay(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`)).replace(".", "");
}

function formatPeriodLabel(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  return `${formatter.format(new Date(`${from}T12:00:00Z`)).replace(".", "")} – ${formatter.format(new Date(`${to}T12:00:00Z`)).replace(".", "")}`;
}

function subcategoryChart(expenseItems: Expense[], categories: Category[], kind: CategoryKind, colors: string[]) {
  const categoryIds = new Set(categories.filter((category) => category.kind === kind).map((category) => category.id));
  return Object.entries(expenseItems.filter((item) => categoryIds.has(item.categoryId)).reduce<Record<string, number>>((acc, item) => {
    if (item.subcategory) acc[item.subcategory] = (acc[item.subcategory] ?? 0) + item.amount;
    return acc;
  }, {})).map(([name, value], index) => ({ name, value, color: colors[index % colors.length] }));
}

function formatDate(value: string) { return shortDate.format(new Date(`${value}T12:00:00`)).replace(".", ""); }
function formatDateLong(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)).replace(".", ""); }
function compareTransactions(a: Income | Expense, b: Income | Expense) { const byDate = b.date.localeCompare(a.date); if (byDate) return byDate; return (b.createdAt ?? "").localeCompare(a.createdAt ?? ""); }
