"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORY_GROUPS,
  CATEGORY_META,
  EXPENSE_CATEGORIES,
  FREQUENCIES,
  FREQUENCY_META,
  categoryMeta,
  monthlyEquivalent,
  occursInMonth,
  totalMonthly,
  totalSavings,
  isSavings,
  isIncome,
  totalIncome,
  type ExpenseRow,
} from "@/lib/expenses";
import { Allocation, eur0, eur2, formatPct } from "@/components/ui";
import CashflowSankey from "@/components/CashflowSankey";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

interface Draft {
  id: string | null;
  name: string;
  amount: string;
  category: string;
  dayOfMonth: string; // "" = no fixed day
  frequency: string;
  startMonth: number;
  note: string;
  accountId: string; // "" = none
}

const emptyDraft = (day?: number, category = "LOGEMENT"): Draft => ({
  id: null,
  name: "",
  amount: "",
  category,
  dayOfMonth: day ? String(day) : "",
  frequency: "MENSUEL",
  startMonth: new Date().getMonth() + 1,
  note: "",
  accountId: "",
});

export default function ExpensesView({
  initialExpenses,
  accounts = [],
  cushion,
}: {
  initialExpenses: ExpenseRow[];
  accounts?: { id: string; name: string }[];
  cushion?: React.ReactNode;
}) {
  const router = useRouter();
  const [expenses, setExpenses] = useState(initialExpenses);
  const today = new Date();
  const todayNum = today.getDate();
  const month = today.getMonth() + 1;
  const daysInMonth = new Date(today.getFullYear(), month, 0).getDate();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const monthly = totalMonthly(expenses);
  const savings = totalSavings(expenses);
  const outflow = monthly + savings;
  const income = totalIncome(expenses);
  // A charge set on the 31st falls on the last day of shorter months.
  const effectiveDay = (e: ExpenseRow) => Math.min(e.dayOfMonth ?? 0, daysInMonth);
  const dueNow = (e: ExpenseRow) => e.active && !isIncome(e) && occursInMonth(e, month);
  const remaining = expenses.filter((e) => dueNow(e) && e.dayOfMonth !== null && effectiveDay(e) > todayNum);
  const remainingTotal = remaining.reduce((s, e) => s + e.amount, 0);
  const paidTotal = expenses
    .filter((e) => dueNow(e) && e.dayOfMonth !== null && effectiveDay(e) <= todayNum)
    .reduce((s, e) => s + e.amount, 0);
  const undated = expenses.filter((e) => e.dayOfMonth === null);

  const byDay = new Map<number, ExpenseRow[]>();
  for (const e of expenses) {
    if (e.dayOfMonth === null) continue;
    byDay.set(e.dayOfMonth, [...(byDay.get(e.dayOfMonth) ?? []), e]);
  }

  const categorySlices = EXPENSE_CATEGORIES.filter((c) => !CATEGORY_META[c].income).map((c) => {
    const value = expenses.filter((e) => e.active && e.category === c).reduce((s, e) => s + monthlyEquivalent(e), 0);
    return { key: c, label: `${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`, value, pct: outflow > 0 ? value / outflow : 0 };
  })
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  function openEdit(e: ExpenseRow) {
    setError("");
    setDraft({
      id: e.id,
      name: e.name,
      amount: String(e.amount).replace(".", ","),
      category: e.category,
      dayOfMonth: e.dayOfMonth ? String(e.dayOfMonth) : "",
      frequency: e.frequency,
      startMonth: e.startMonth,
      note: e.note ?? "",
      accountId: e.accountId ?? "",
    });
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!draft) return;
    setError("");
    const amount = Number(draft.amount.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Montant invalide.");
      return;
    }
    const body = {
      name: draft.name,
      amount,
      category: draft.category,
      dayOfMonth: draft.dayOfMonth ? Number(draft.dayOfMonth) : null,
      frequency: draft.frequency,
      startMonth: draft.startMonth,
      note: draft.note || null,
      accountId: isSavings(draft) && draft.accountId ? draft.accountId : null,
    };
    setSaving(true);
    try {
      const res = await fetch(draft.id ? `/api/expenses/${draft.id}` : "/api/expenses", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'enregistrement.");
        return;
      }
      setExpenses((prev) => (draft.id ? prev.map((e) => (e.id === draft.id ? data.expense : e)) : [...prev, data.expense]));
      setDraft(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(e: ExpenseRow) {
    const res = await fetch(`/api/expenses/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !e.active }),
    });
    if (res.ok) {
      const data = await res.json();
      setExpenses((prev) => prev.map((x) => (x.id === e.id ? data.expense : x)));
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette charge ?")) return;
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.ok) {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      setDraft(null);
      router.refresh();
    }
  }


  return (
    <>
      <div className="page-header">
        <div>
          <h1>Dépenses</h1>
          <p className="muted">Tes revenus et charges du mois, et le matelas de sécurité qui en découle</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={() => setDraft(emptyDraft(undefined, "SALAIRE"))}>
            + Ajouter un revenu
          </button>
          <button className="btn btn-primary" type="button" onClick={() => setDraft(emptyDraft())}>
            + Ajouter une charge
          </button>
        </div>
      </div>

      <div className="grid grid-stats">
        <div className="card stat-tile">
          <span className="kpi-icon" aria-hidden="true">💼</span>
          <span className="label">Revenus par mois</span>
          <span className="value">{eur0.format(income)}</span>
          <span className="hint">
            {income > 0 ? `Taux d'épargne ${formatPct(savings / income, 0)} · reste ${eur0.format(income - outflow)}` : "Ajoute ton salaire pour voir ton cashflow"}
          </span>
        </div>
        <div className="card stat-tile">
          <span className="kpi-icon" aria-hidden="true">💸</span>
          <span className="label">Charges par mois</span>
          <span className="value">{eur0.format(monthly)}</span>
          <span className="hint">Hors épargne · base du matelas de sécurité</span>
        </div>
        <div className="card stat-tile">
          <span className="kpi-icon" aria-hidden="true">🐷</span>
          <span className="label">Épargne par mois</span>
          <span className="value">{eur0.format(savings)}</span>
          <span className="hint">{savings > 0 ? `${formatPct(savings / outflow)} de ce qui sort chaque mois` : "Ajoute tes virements vers livrets, PEA…"}</span>
        </div>
        <div className="card stat-tile">
          <span className="kpi-icon" aria-hidden="true">⏳</span>
          <span className="label">Reste à payer ce mois</span>
          <span className="value">{eur0.format(remainingTotal)}</span>
          <span className="hint">
            {remaining.length} prélèvement{remaining.length > 1 ? "s" : ""} à venir · {eur0.format(paidTotal)} déjà passés
          </span>
        </div>
      </div>

      {/* ---- Calendar: days 1 to 31, no month ---- */}
      <section className="card section">
        <div className="cal-head">
          <h2>Calendrier du mois</h2>
        </div>

        <div className="cal-grid">
          {Array.from({ length: 31 }, (_, i) => {
            const day = i + 1;
            const items = byDay.get(day) ?? [];
            const dayTotal = items.filter(dueNow).reduce((s, e) => s + e.amount, 0);
            const state = day === todayNum ? " today" : day < todayNum ? " past" : "";
            return (
              <div
                className={`cal-day${state}`}
                key={day}
                onDoubleClick={() => setDraft(emptyDraft(day))}
                title="Double-clic pour ajouter une charge ce jour-là"
              >
                <div className="cal-day-top">
                  <span className="cal-day-num">{day}</span>
                  {dayTotal > 0 && <span className="cal-day-total">{eur0.format(dayTotal)}</span>}
                </div>
                {items.map((e) => (
                  <ExpenseChip key={e.id} e={e} offMonth={!occursInMonth(e, month)} onClick={() => openEdit(e)} />
                ))}
              </div>
            );
          })}
        </div>

        {undated.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Sans date fixe</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {undated.map((e) => (
                <ExpenseChip key={e.id} e={e} offMonth={!occursInMonth(e, month)} onClick={() => openEdit(e)} inline />
              ))}
            </div>
          </div>
        )}

        {expenses.length === 0 && (
          <p className="muted" style={{ marginTop: 16 }}>
            Ajoute ta première charge (loyer, crédit, abonnements, épargne, courses…) avec le bouton en haut, ou double-clique sur un jour du calendrier.
          </p>
        )}
      </section>

      <CashflowSankey expenses={expenses} onAddIncome={() => setDraft(emptyDraft(undefined, "SALAIRE"))} />

      {/* ---- Cushion + breakdown ---- */}
      <div className="grid grid-2 section">
        {cushion}
        <section className="card">
          <h2>Où part ton argent</h2>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
            Moyenne par mois, épargne comprise · {eur0.format(outflow)} au total
          </p>
          {categorySlices.length > 0 ? (
            <Allocation slices={categorySlices} colorFor={(k) => categoryMeta(k).color} />
          ) : (
            <p className="muted">Aucune charge pour l'instant.</p>
          )}
        </section>
      </div>

      {/* ---- All charges, as a monthly cashflow ---- */}
      {expenses.length > 0 && (
        <section className="card section">
          <h2>Toutes mes charges</h2>
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
            Ce qui sort chaque mois. Les paiements du même nom sont réunis sur une ligne : clique dessus pour voir le détail.
          </p>
          <CashflowTable expenses={expenses} onEdit={openEdit} onToggle={toggleActive} />
        </section>
      )}

      {/* ---- Add / edit modal ---- */}
      {draft && (
        <div className="modal-backdrop" onClick={() => setDraft(null)}>
          <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <div className="card-title">
              <h2>{isIncome(draft) ? (draft.id ? "Modifier le revenu" : "Nouveau revenu") : draft.id ? "Modifier la charge" : "Nouvelle charge"}</h2>
              <button className="btn btn-ghost" type="button" onClick={() => setDraft(null)} aria-label="Fermer">
                ✕
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="field">
              <label htmlFor="x-name">Nom</label>
              <input id="x-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={isIncome(draft) ? "ex : Salaire, Prime" : "ex : Loyer, Netflix, Courses"} required maxLength={100} autoFocus />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="x-amount">Montant (€)</label>
                <input id="x-amount" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} inputMode="decimal" placeholder="ex : 650" required />
              </div>
              <div className="field">
                <label htmlFor="x-cat">Catégorie</label>
                <select id="x-cat" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {CATEGORY_GROUPS.map((g) => (
                    <optgroup key={g.id} label={g.label}>
                      {EXPENSE_CATEGORIES.filter((c) => CATEGORY_META[c].group === g.id).map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_META[c].emoji} {CATEGORY_META[c].label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="x-day">Jour du mois</label>
                <select id="x-day" value={draft.dayOfMonth} onChange={(e) => setDraft({ ...draft, dayOfMonth: e.target.value })}>
                  <option value="">Pas de date fixe</option>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      le {i + 1}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="x-freq">Fréquence</label>
                <select id="x-freq" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}>
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_META[f].label}
                    </option>
                  ))}
                </select>
              </div>
              {draft.frequency !== "MENSUEL" && (
                <div className="field">
                  <label htmlFor="x-start">{draft.frequency === "ANNUEL" ? "Mois du paiement" : "Premier mois"}</label>
                  <select id="x-start" value={draft.startMonth} onChange={(e) => setDraft({ ...draft, startMonth: Number(e.target.value) })}>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {isSavings(draft) && accounts.length > 0 && (
              <div className="field">
                <label htmlFor="x-account">Vers le compte</label>
                <select id="x-account" value={draft.accountId} onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}>
                  <option value="">Non précisé</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <span className="muted" style={{ fontSize: 12 }}>
                  Un virement vers le livret du matelas sert à calculer quand il sera complet.
                </span>
              </div>
            )}
            <div className="field">
              <label htmlFor="x-note">Note (optionnel)</label>
              <input id="x-note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} maxLength={500} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "..." : draft.id ? "Enregistrer" : "Ajouter"}
              </button>
              {draft.id && (
                <button className="btn btn-danger" type="button" onClick={() => remove(draft.id!)}>
                  Supprimer
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function ExpenseChip({ e, offMonth, onClick, inline }: { e: ExpenseRow; offMonth: boolean; onClick: () => void; inline?: boolean }) {
  const meta = categoryMeta(e.category);
  const freq = FREQUENCY_META[e.frequency as keyof typeof FREQUENCY_META];
  const when = freq && freq.months > 1 ? ` · ${freq.label.toLowerCase()} (dès ${MONTHS[e.startMonth - 1]})` : "";
  return (
    <button
      type="button"
      className={`chip${e.active ? "" : " inactive"}${offMonth ? " off-month" : ""}${isIncome(e) ? " income" : ""}`}
      style={inline ? { width: "auto" } : undefined}
      onClick={onClick}
      title={`${meta.emoji} ${e.name} · ${eur2.format(e.amount)} · ${meta.label}${when}${offMonth ? " · pas ce mois-ci" : ""}`}
    >
      <span className="chip-dot" style={{ background: meta.color }} />
      <span className="chip-name">{e.name}</span>
      {freq?.short && <span className="chip-tag">{freq.short}</span>}
      <span className="chip-amount">{isIncome(e) ? "+" : ""}{eur0.format(e.amount)}</span>
    </button>
  );
}

interface ChargeGroup {
  key: string;
  name: string;
  category: string;
  items: ExpenseRow[];
  monthly: number; // active items only
}

function groupCharges(list: ExpenseRow[]): ChargeGroup[] {
  const map = new Map<string, ChargeGroup>();
  for (const e of list) {
    const key = `${e.name.trim().toLowerCase()}|${e.category}`;
    const g = map.get(key) ?? { key, name: e.name.trim(), category: e.category, items: [], monthly: 0 };
    g.items.push(e);
    if (e.active) g.monthly += monthlyEquivalent(e);
    map.set(key, g);
  }
  for (const g of map.values()) g.items.sort((a, b) => (a.dayOfMonth ?? 99) - (b.dayOfMonth ?? 99));
  return [...map.values()].sort((a, b) => b.monthly - a.monthly || a.name.localeCompare(b.name));
}

function whenLabel(items: ExpenseRow[]): string {
  const days = items.filter((e) => e.dayOfMonth !== null).map((e) => e.dayOfMonth as number);
  const undated = items.length - days.length;
  const freqs = new Set(items.map((e) => e.frequency));
  const parts: string[] = [];
  if (days.length > 0) parts.push(`le ${days.join(", ")}`);
  if (undated > 0) parts.push(undated === items.length ? "sans date" : `+ ${undated} sans date`);
  if (freqs.size === 1) {
    const e = items[0];
    const label = FREQUENCY_META[e.frequency as keyof typeof FREQUENCY_META]?.label.toLowerCase() ?? "";
    parts.push(items.length > 1 && e.frequency === "MENSUEL" ? `${items.length} fois par mois` : label);
    if (e.frequency !== "MENSUEL" && items.length === 1) parts.push(`dès ${MONTHS[e.startMonth - 1]}`);
  } else {
    parts.push("fréquences variées");
  }
  return parts.join(" · ");
}

function CashflowTable({
  expenses,
  onEdit,
  onToggle,
}: {
  expenses: ExpenseRow[];
  onEdit: (e: ExpenseRow) => void;
  onToggle: (e: ExpenseRow) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const incomeGroups = groupCharges(expenses.filter(isIncome));
  const sections = [
    { title: "Charges", groups: groupCharges(expenses.filter((e) => !isSavings(e) && !isIncome(e))) },
    { title: "Épargne & investissement", groups: groupCharges(expenses.filter(isSavings)) },
  ].filter((sec) => sec.groups.length > 0);
  const grandTotal = sections.reduce((s, sec) => s + sec.groups.reduce((t, g) => t + g.monthly, 0), 0);
  const incomeTotal = incomeGroups.reduce((t, g) => t + g.monthly, 0);
  const allSections = incomeGroups.length > 0 ? [{ title: "Revenus", groups: incomeGroups, income: true }, ...sections] : sections;

  return (
    <div className="table-wrap">
      <table className="cashflow">
        <thead>
          <tr>
            <th>Charge</th>
            <th>Catégorie</th>
            <th>Quand</th>
            <th className="num">Par paiement</th>
            <th className="num">Par mois</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {allSections.map((sec) => {
            const subtotal = sec.groups.reduce((t, g) => t + g.monthly, 0);
            const isIncomeSection = "income" in sec;
            return (
              <Fragment key={sec.title}>
                <tr className="cashflow-section">
                  <td colSpan={4}>{sec.title}</td>
                  <td className="num">{eur2.format(subtotal)}</td>
                  <td className="num muted">{!isIncomeSection && grandTotal > 0 ? formatPct(subtotal / grandTotal) : ""}</td>
                </tr>
                {sec.groups.map((g) => {
                  const meta = categoryMeta(g.category);
                  const multi = g.items.length > 1;
                  const isOpen = open.has(g.key);
                  const allPaused = g.items.every((e) => !e.active);
                  const amounts = new Set(g.items.map((e) => e.amount));
                  return (
                    <Fragment key={g.key}>
                      <tr
                        className={multi ? "cashflow-group" : undefined}
                        style={{ opacity: allPaused ? 0.5 : 1 }}
                        onClick={multi ? () => toggleOpen(g.key) : undefined}
                        aria-expanded={multi ? isOpen : undefined}
                      >
                        <td style={{ fontWeight: 500 }}>
                          {multi && <span className={`chevron${isOpen ? " open" : ""}`} aria-hidden="true">›</span>}
                          {g.name}
                          {multi && <span className="pill" style={{ marginLeft: 8 }}>×{g.items.length}</span>}
                          {allPaused && <span className="pill" style={{ marginLeft: 8 }}>En pause</span>}
                        </td>
                        <td>
                          <span className="legend-item" style={{ fontSize: 13 }}>
                            <span className="legend-dot" style={{ background: meta.color }} />
                            {meta.emoji} {meta.label}
                          </span>
                        </td>
                        <td className="secondary">{whenLabel(g.items)}</td>
                        <td className="num">{amounts.size === 1 ? eur2.format(g.items[0].amount) : "variable"}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{eur2.format(g.monthly)}</td>
                        <td className="row-actions" onClick={(ev) => ev.stopPropagation()}>
                          {multi ? (
                            <button className="btn" type="button" onClick={() => toggleOpen(g.key)}>
                              {isOpen ? "Masquer" : "Détail"}
                            </button>
                          ) : (
                            <>
                              <button className="btn" type="button" onClick={() => onEdit(g.items[0])}>
                                Modifier
                              </button>
                              <button className="btn" type="button" onClick={() => onToggle(g.items[0])}>
                                {g.items[0].active ? "Pause" : "Réactiver"}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                      {multi &&
                        isOpen &&
                        g.items.map((e) => (
                          <tr key={e.id} className="cashflow-child" style={{ opacity: e.active ? 1 : 0.5 }}>
                            <td>
                              {e.name}
                              {!e.active && <span className="pill" style={{ marginLeft: 8 }}>En pause</span>}
                            </td>
                            <td></td>
                            <td className="secondary">
                              {e.dayOfMonth ? `le ${e.dayOfMonth}` : "sans date"} ·{" "}
                              {FREQUENCY_META[e.frequency as keyof typeof FREQUENCY_META]?.label.toLowerCase()}
                            </td>
                            <td className="num">{eur2.format(e.amount)}</td>
                            <td className="num secondary">{eur2.format(monthlyEquivalent(e))}</td>
                            <td className="row-actions">
                              <button className="btn" type="button" onClick={() => onEdit(e)}>
                                Modifier
                              </button>
                              <button className="btn" type="button" onClick={() => onToggle(e)}>
                                {e.active ? "Pause" : "Réactiver"}
                              </button>
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
          <tr className="cashflow-total">
            <td colSpan={4}>Total des sorties par mois</td>
            <td className="num">{eur2.format(grandTotal)}</td>
            <td></td>
          </tr>
          {incomeTotal > 0 && (
            <tr className="cashflow-total">
              <td colSpan={4}>Solde (revenus − sorties)</td>
              <td className={`num ${incomeTotal - grandTotal >= 0 ? "pos" : "neg"}`}>
                {incomeTotal - grandTotal >= 0 ? "+" : "−"}
                {eur2.format(Math.abs(incomeTotal - grandTotal))}
              </td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
