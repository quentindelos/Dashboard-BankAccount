// "Relevé de patrimoine": a PDF statement of the portfolio, laid out like an
// official document (header with reference, summary, accounts, positions,
// allocation, grades and action plan, page numbers). Built with pdfkit and its
// standard Helvetica fonts, so nothing has to be installed on the server.
import { randomBytes } from "crypto";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/db";
import { loadPortfolio } from "@/lib/portfolio";
import { getSettings } from "@/lib/settings";
import { loadAssistantSettings } from "@/lib/assistantSettings";
import { SCORE_LABELS, analyzePortfolio, type Advice } from "@/lib/analysis";
import { computeGains } from "@/lib/gains";
import { accountTypeLabel, accountTypeShort } from "@/lib/accountTypes";
import { findInstrument } from "@/lib/instruments";
import { loadProfile } from "@/lib/profile";
import { RISK_LABEL } from "@/lib/assistantShared";
import { FAMILY_STATUS, JOB_STATUS, ageFrom } from "@/lib/profileShared";
import { formatGrade, riskLabel, scoreLabel, scoreTone } from "@/lib/grades";

// ---------------------------------------------------------------- style

const C = {
  ink: "#0f172a",
  text: "#334155",
  muted: "#64748b",
  line: "#e2e8f0",
  soft: "#f1f5f9",
  accent: "#047857",
  accentSoft: "#ecfdf5",
  good: "#047857",
  mid: "#b45309",
  bad: "#b91c1c",
};
const TONE = { good: C.good, mid: C.mid, bad: C.bad };
const SERIES = ["#047857", "#2563eb", "#7c3aed", "#d97706", "#db2777", "#0891b2", "#64748b", "#65a30d"];

const PAGE = { margin: 50, width: 595.28, height: 841.89 };
const CONTENT_W = PAGE.width - 2 * PAGE.margin;
/** Lowest y for content: below it, the footer. */
const BOTTOM = PAGE.height - 70;

/** The standard PDF fonts only cover Windows-1252: map or drop anything else. */
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
function t(s: string): string {
  return s
    .replace(/[    ]/g, " ")
    .replace(/[−‐‑]/g, "-")
    .replace(/≈/g, "~")
    .replace(/→/g, "->")
    .replace(/[^\n -~ -ÿ]/g, (ch) => (WINANSI_EXTRA.includes(ch) ? ch : ""));
}

const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(".", ",")} %`;
const signedEur = (x: number) => (Math.round(x) === 0 ? "0 €" : `${x > 0 ? "+" : "-"}${eur0.format(Math.abs(x))}`);
const signedPct = (x: number) => `${x >= 0 ? "+" : "-"}${pct(Math.abs(x))}`;

type Doc = PDFKit.PDFDocument;

// ---------------------------------------------------------------- building blocks

function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > BOTTOM) doc.addPage();
}

/** `keepWith`: height of what follows, kept on the same page as the title. */
function sectionTitle(doc: Doc, title: string, subtitle?: string, keepWith = 30) {
  ensureSpace(doc, 50 + keepWith);
  doc.moveDown(0.8);
  const y = doc.y;
  doc.rect(PAGE.margin, y + 2, 3, 13).fill(C.accent);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(C.ink).text(t(title), PAGE.margin + 10, y, { width: CONTENT_W - 10 });
  if (subtitle) doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(t(subtitle), PAGE.margin + 10, doc.y + 1, { width: CONTENT_W - 10 });
  doc.moveDown(0.6);
  doc.x = PAGE.margin;
}

function paragraph(doc: Doc, text: string, opts: { size?: number; color?: string; bold?: boolean } = {}) {
  doc
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts.size ?? 9.5)
    .fillColor(opts.color ?? C.text);
  const s = t(text);
  ensureSpace(doc, doc.heightOfString(s, { width: CONTENT_W }) + 4);
  doc.text(s, PAGE.margin, doc.y, { width: CONTENT_W, lineGap: 1.5 });
}

interface Column {
  label: string;
  width: number; // share of the content width
  align?: "left" | "right" | "center";
}

/** A table that continues on the next page, repeating its header. */
function table(doc: Doc, columns: Column[], rows: string[][], opts: { bold?: (i: number) => boolean } = {}) {
  const widths = columns.map((c) => c.width * CONTENT_W);
  const pad = 5;
  const header = () => {
    const y = doc.y;
    doc.rect(PAGE.margin, y, CONTENT_W, 18).fill(C.soft);
    let x = PAGE.margin;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.muted);
    columns.forEach((c, i) => {
      doc.text(t(c.label.toUpperCase()), x + pad, y + 6, { width: widths[i] - 2 * pad, align: c.align ?? "left", lineBreak: false });
      x += widths[i];
    });
    doc.y = y + 18;
  };
  ensureSpace(doc, 40);
  header();
  rows.forEach((row, r) => {
    doc.font(opts.bold?.(r) ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
    const heights = row.map((cell, i) => doc.heightOfString(t(cell), { width: widths[i] - 2 * pad }));
    const h = Math.max(16, Math.max(...heights) + 8);
    if (doc.y + h > BOTTOM) {
      doc.addPage();
      header();
      doc.font(opts.bold?.(r) ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
    }
    const y = doc.y;
    if (opts.bold?.(r)) doc.rect(PAGE.margin, y, CONTENT_W, h).fill(C.accentSoft);
    let x = PAGE.margin;
    doc.fillColor(C.ink);
    row.forEach((cell, i) => {
      const color = /^[+]/.test(cell) ? C.good : /^-\d/.test(cell) ? C.bad : C.ink;
      doc.fillColor(i === 0 ? C.ink : color).text(t(cell), x + pad, y + 4, { width: widths[i] - 2 * pad, align: columns[i].align ?? "left" });
      x += widths[i];
    });
    doc.moveTo(PAGE.margin, y + h).lineTo(PAGE.margin + CONTENT_W, y + h).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.y = y + h;
  });
  doc.x = PAGE.margin;
  doc.moveDown(0.4);
}

/** Horizontal share bars: label, bar, amount and percentage. */
function shareBars(doc: Doc, x: number, width: number, title: string, slices: { label: string; value: number; pct: number }[]) {
  const startY = doc.y;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(C.ink).text(t(title), x, startY, { width });
  let y = startY + 18;
  const labelW = width * 0.38;
  const valueW = width * 0.3;
  const barW = width - labelW - valueW - 8;
  slices.forEach((s, i) => {
    doc.font("Helvetica").fontSize(8.5).fillColor(C.text).text(t(s.label), x, y, { width: labelW - 4, lineBreak: false, ellipsis: true });
    doc.roundedRect(x + labelW, y + 1, barW, 7, 3.5).fill(C.soft);
    if (s.pct > 0) doc.roundedRect(x + labelW, y + 1, Math.max(barW * s.pct, 3), 7, 3.5).fill(SERIES[i % SERIES.length]);
    doc
      .fillColor(C.ink)
      .text(t(`${eur0.format(s.value)} · ${pct(s.pct, 0)}`), x + labelW + barW + 8, y, { width: valueW, align: "right", lineBreak: false });
    y += 16;
  });
  return y;
}

function kpiBox(doc: Doc, x: number, y: number, w: number, label: string, value: string, hint: string, color = C.ink) {
  doc.roundedRect(x, y, w, 62, 6).lineWidth(0.8).strokeColor(C.line).stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(t(label.toUpperCase()), x + 10, y + 10, { width: w - 20, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(15).fillColor(color).text(t(value), x + 10, y + 23, { width: w - 20, lineBreak: false });
  doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(t(hint), x + 10, y + 44, { width: w - 20, lineBreak: false, ellipsis: true });
}

/** Net worth over time, as a filled line with min/max and date labels. */
function lineChart(doc: Doc, points: { t: number; v: number }[], x: number, y: number, w: number, h: number) {
  if (points.length < 2) return;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const lo = min - (max - min) * 0.1;
  const hi = max + (max - min) * 0.1 || max + 1;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const px = (p: { t: number }) => x + 40 + ((p.t - t0) / (t1 - t0 || 1)) * (w - 40);
  const py = (v: number) => y + h - ((v - lo) / (hi - lo || 1)) * h;

  doc.lineWidth(0.5).strokeColor(C.line);
  for (const v of [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1]) {
    doc.moveTo(x + 40, py(v)).lineTo(x + w, py(v)).stroke();
    doc.font("Helvetica").fontSize(6.5).fillColor(C.muted).text(t(eur0.format(v)), x - 8, py(v) - 3, { width: 44, align: "right", lineBreak: false });
  }
  // Area, then the line on top.
  doc.moveTo(px(points[0]), y + h);
  points.forEach((p) => doc.lineTo(px(p), py(p.v)));
  doc.lineTo(px(points[points.length - 1]), y + h).closePath().fillOpacity(0.12).fill(C.accent).fillOpacity(1);
  doc.moveTo(px(points[0]), py(points[0].v));
  points.slice(1).forEach((p) => doc.lineTo(px(p), py(p.v)));
  doc.lineWidth(1.4).strokeColor(C.accent).stroke();

  const labels = 5;
  for (let i = 0; i < labels; i++) {
    const tt = t0 + ((t1 - t0) * i) / (labels - 1);
    doc
      .font("Helvetica")
      .fontSize(6.5)
      .fillColor(C.muted)
      .text(t(monthShort.format(new Date(tt))), px({ t: tt }) - 25, y + h + 4, { width: 50, align: "center", lineBreak: false });
  }
}

function brandMark(doc: Doc, x: number, y: number, size: number) {
  const s = size / 32;
  doc.roundedRect(x, y, size, size, 6).fill(C.accent);
  doc
    .moveTo(x + 6 * s, y + 21 * s)
    .bezierCurveTo(x + 10 * s, y + 21 * s, x + 11.5 * s, y + 16 * s, x + 15.5 * s, y + 16 * s)
    .bezierCurveTo(x + 19.5 * s, y + 16 * s, x + 20.5 * s, y + 9.5 * s, x + 25 * s, y + 8.5 * s)
    .lineWidth(2.4 * s)
    .lineCap("round")
    .strokeColor("#ffffff")
    .stroke();
  doc.circle(x + 25 * s, y + 8.5 * s, 2.6 * s).fill("#ffffff");
}

// ---------------------------------------------------------------- report

export interface ReportFile {
  pdf: Buffer;
  fileName: string;
}

export async function buildReport(username: string, now = new Date()): Promise<ReportFile> {
  const [data, settings, assistant, profile, accountRows] = await Promise.all([
    loadPortfolio(),
    getSettings(),
    loadAssistantSettings(),
    loadProfile(),
    prisma.account.findMany({
      where: { archived: false, type: { not: "VEHICULE" } },
      select: { id: true, institution: true, entries: { select: { date: true }, orderBy: { date: "desc" }, take: 1 } },
    }),
  ]);
  const analysis = analyzePortfolio(data.holdings, data.otherAssets, settings, assistant.risk);
  const gains = computeGains(data);
  const latest = data.series.at(-1);
  const lastDate = new Map(accountRows.map((a) => [a.id, a.entries[0]?.date ?? null]));
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
  const reference = `PAT-${day.replaceAll("-", "")}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const holder = profile.firstName ? `${profile.firstName} (${username})` : username;

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE.margin,
    bufferPages: true,
    info: {
      Title: t(`Relevé de patrimoine au ${longDate.format(now)}`),
      Author: t(holder),
      Subject: "Relevé de patrimoine",
      Creator: "Patrimoine",
      CreationDate: now,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ---- Header
  brandMark(doc, PAGE.margin, PAGE.margin - 6, 30);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(C.ink).text("Patrimoine", PAGE.margin + 40, PAGE.margin - 2);
  doc.font("Helvetica").fontSize(8).fillColor(C.muted).text("Suivi de patrimoine personnel", PAGE.margin + 40, PAGE.margin + 11);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(C.muted)
    .text(t(`Établi le ${longDate.format(now)}`), PAGE.margin, PAGE.margin - 2, { width: CONTENT_W, align: "right" })
    .text(t(`Référence ${reference}`), PAGE.margin, PAGE.margin + 9, { width: CONTENT_W, align: "right" });
  doc.moveTo(PAGE.margin, PAGE.margin + 34).lineTo(PAGE.margin + CONTENT_W, PAGE.margin + 34).lineWidth(1).strokeColor(C.ink).stroke();

  doc.font("Helvetica-Bold").fontSize(22).fillColor(C.ink).text(t("Relevé de patrimoine"), PAGE.margin, PAGE.margin + 50);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(C.muted)
    .text(t(`Situation arrêtée au ${latest ? longDate.format(new Date(latest.date)) : longDate.format(now)}`));

  // Holder block
  const age = ageFrom(profile.birthDate, now);
  const holderLines = [
    ["Titulaire", holder],
    ...(age !== null ? [["Âge", `${age} ans`]] : []),
    ...(profile.family ? [["Situation familiale", FAMILY_STATUS[profile.family]]] : []),
    ...(profile.job ? [["Situation professionnelle", JOB_STATUS[profile.job] + (profile.occupation ? `, ${profile.occupation}` : "")]] : []),
    ["Profil investisseur", RISK_LABEL[assistant.risk]],
  ];
  doc.moveDown(1);
  const boxY = doc.y;
  const boxH = 14 + holderLines.length * 13;
  doc.roundedRect(PAGE.margin, boxY, CONTENT_W, boxH, 6).fill(C.soft);
  holderLines.forEach(([k, v], i) => {
    const y = boxY + 8 + i * 13;
    doc.font("Helvetica").fontSize(8.5).fillColor(C.muted).text(t(k), PAGE.margin + 12, y, { width: 140, lineBreak: false });
    doc.font("Helvetica-Bold").fillColor(C.ink).text(t(v), PAGE.margin + 150, y, { width: CONTENT_W - 162, lineBreak: false, ellipsis: true });
  });
  doc.y = boxY + boxH + 14;

  // ---- KPIs
  const kpiY = doc.y;
  const gap = 10;
  const kw = (CONTENT_W - 3 * gap) / 4;
  kpiBox(doc, PAGE.margin, kpiY, kw, "Patrimoine total", eur0.format(data.total), `${data.accounts.length} comptes`);
  kpiBox(doc, PAGE.margin + (kw + gap), kpiY, kw, "Placements", eur0.format(analysis.invested), `${data.holdings.length} lignes en portefeuille`);
  kpiBox(
    doc,
    PAGE.margin + 2 * (kw + gap),
    kpiY,
    kw,
    "Plus-values latentes",
    gains.invested > 0 ? signedEur(gains.gain) : "-",
    gains.pct !== null ? `${signedPct(gains.pct)} sur ${eur0.format(gains.invested)} investis` : "Montants investis inconnus",
    gains.gain >= 0 ? C.good : C.bad,
  );
  kpiBox(
    doc,
    PAGE.margin + 3 * (kw + gap),
    kpiY,
    kw,
    "Note du portefeuille",
    `${formatGrade(analysis.scores.overall)}/10`,
    `${scoreLabel(analysis.scores.overall)} · risque ${analysis.riskLevel}/10`,
    TONE[scoreTone(analysis.scores.overall)],
  );
  doc.y = kpiY + 62;
  doc.x = PAGE.margin;

  // ---- Evolution
  if (latest && data.series.length > 1) {
    sectionTitle(doc, "Évolution", "Valeur totale du patrimoine financier sur les 12 derniers mois");
    const end = Date.parse(latest.date);
    const valueAt = (ts: number) => {
      let v: number | null = null;
      for (const p of data.series) {
        if (Date.parse(p.date) <= ts) v = p.total;
        else break;
      }
      return v;
    };
    const periods: [string, number][] = [
      ["1 mois", end - 30 * 86400000],
      ["Depuis le 1er janvier", Date.UTC(new Date(end).getUTCFullYear(), 0, 1)],
      ["1 an", end - 365 * 86400000],
    ];
    const rows = periods
      .map(([label, ts]) => {
        const v = valueAt(ts);
        return v === null || v <= 0 ? null : [label, eur0.format(v), signedEur(latest.total - v), signedPct((latest.total - v) / v)];
      })
      .filter((r): r is string[] => r !== null);
    if (rows.length) {
      table(
        doc,
        [
          { label: "Période", width: 0.4 },
          { label: "Valeur au début", width: 0.2, align: "right" },
          { label: "Variation", width: 0.2, align: "right" },
          { label: "Variation %", width: 0.2, align: "right" },
        ],
        rows,
      );
      paragraph(doc, "La variation inclut l'argent versé ou retiré sur la période, pas seulement la performance des placements.", {
        size: 7.5,
        color: C.muted,
      });
    }
    const points = data.series.filter((p) => Date.parse(p.date) >= end - 365 * 86400000).map((p) => ({ t: Date.parse(p.date), v: p.total }));
    ensureSpace(doc, 150);
    const chartTop = doc.y + 12;
    lineChart(doc, points, PAGE.margin, chartTop, CONTENT_W, 110);
    // The chart's labels move the cursor: put it back right below the chart.
    doc.y = chartTop + 110 + 18;
    doc.x = PAGE.margin;
  }

  // ---- Allocation
  sectionTitle(doc, "Répartition", undefined, 24 + 16 * Math.max(analysis.assetClasses.length, analysis.envelopes.length));
  const allocY = doc.y;
  const half = (CONTENT_W - 24) / 2;
  const leftEnd = shareBars(doc, PAGE.margin, half, "Par classe d'actifs", analysis.assetClasses);
  doc.y = allocY;
  const rightEnd = shareBars(doc, PAGE.margin + half + 24, half, "Par enveloppe", analysis.envelopes);
  doc.y = Math.max(leftEnd, rightEnd) + 6;
  doc.x = PAGE.margin;

  // ---- Accounts
  doc.addPage();
  sectionTitle(doc, "Comptes", "Valeur de chaque compte à la date de son dernier relevé");
  const accounts = data.accounts
    .map((a) => ({ ...a, value: latest?.byAccount[a.id] ?? 0 }))
    .filter((a) => a.value !== 0)
    .sort((x, y) => y.value - x.value);
  const gainOf = new Map(gains.accounts.map((g) => [g.id, g]));
  table(
    doc,
    [
      { label: "Compte", width: 0.25 },
      { label: "Type", width: 0.2 },
      { label: "Établissement", width: 0.17 },
      { label: "Relevé du", width: 0.11, align: "right" },
      { label: "Valeur", width: 0.13, align: "right" },
      { label: "+/- value", width: 0.14, align: "right" },
    ],
    [
      ...accounts.map((a) => {
        const g = gainOf.get(a.id);
        const d = lastDate.get(a.id);
        return [
          a.name,
          accountTypeLabel(a.type),
          a.institution ?? "-",
          d ? shortDate.format(d) : "-",
          eur0.format(a.value),
          g?.gain != null ? signedEur(g.gain) : "-",
        ];
      }),
      ["Total", "", "", "", eur0.format(data.total), gains.invested > 0 ? signedEur(gains.gain) : ""],
    ],
    { bold: (i) => i === accounts.length },
  );

  // ---- Positions
  if (data.holdings.length > 0) {
    sectionTitle(doc, "Positions", `Détail des titres détenus au ${shortDate.format(new Date(data.holdings[0].date))}`);
    table(
      doc,
      [
        { label: "Titre", width: 0.25 },
        { label: "ISIN", width: 0.15 },
        { label: "Env.", width: 0.08 },
        { label: "Qté", width: 0.1, align: "right" },
        { label: "PRU", width: 0.12, align: "right" },
        { label: "Valeur", width: 0.1, align: "right" },
        { label: "+/- value", width: 0.2, align: "right" },
      ],
      data.holdings.map((h) => {
        const cost = h.costBasis !== null ? h.quantity * h.costBasis : null;
        return [
          findInstrument(h.isin, h.name)?.label ?? h.name,
          h.isin ?? "-",
          accountTypeShort(h.accountType),
          num.format(h.quantity),
          h.costBasis !== null ? eur2.format(h.costBasis) : "-",
          eur0.format(h.value),
          cost !== null ? `${signedEur(h.value - cost)} (${signedPct(cost ? (h.value - cost) / cost : 0)})` : "-",
        ];
      }),
    );
  }

  // ---- Grades and action plan
  doc.addPage();
  sectionTitle(doc, "Évaluation du portefeuille", "Notes sur 10 calculées automatiquement à partir des données ci-dessus");
  {
    const y = doc.y;
    const tone = TONE[scoreTone(analysis.scores.overall)];
    doc.circle(PAGE.margin + 38, y + 38, 34).lineWidth(6).strokeColor(C.soft).stroke();
    const angle = (analysis.scores.overall / 10) * 2 * Math.PI;
    if (analysis.scores.overall > 0) {
      const cx = PAGE.margin + 38;
      const cy = y + 38;
      const sx = cx;
      const sy = cy - 34;
      const ex = cx + 34 * Math.sin(angle);
      const ey = cy - 34 * Math.cos(angle);
      const large = angle > Math.PI ? 1 : 0;
      doc.path(`M ${sx} ${sy} A 34 34 0 ${large} 1 ${ex} ${ey}`).lineWidth(6).lineCap("round").strokeColor(tone).stroke();
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor(C.ink)
      .text(t(formatGrade(analysis.scores.overall)), PAGE.margin, y + 28, { width: 76, align: "center" });
    doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text("sur 10", PAGE.margin, y + 48, { width: 76, align: "center" });
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(tone)
      .text(t(scoreLabel(analysis.scores.overall)), PAGE.margin + 96, y + 14);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(C.text)
      .text(
        t(
          `Niveau de risque des placements : ${analysis.riskLevel}/10 (${riskLabel(analysis.riskLevel).toLowerCase()}), ` +
            `volatilité estimée ~${pct(analysis.investedVolatility, 0)} par an. Profil investisseur déclaré : ${RISK_LABEL[assistant.risk].toLowerCase()}.`,
        ),
        PAGE.margin + 96,
        y + 32,
        { width: CONTENT_W - 96 },
      );
    doc.y = y + 86;
    doc.x = PAGE.margin;
  }
  table(
    doc,
    [
      { label: "Critère", width: 0.28 },
      { label: "Note", width: 0.1, align: "right" },
      { label: "Appréciation", width: 0.62 },
    ],
    analysis.scores.criteria.map((c) => [c.label, `${formatGrade(c.score)}/10`, c.summary]),
  );

  sectionTitle(doc, "Plan d'action", "Dans l'ordre, ce qui améliorerait le plus la note");
  if (analysis.plan.length === 0) {
    paragraph(doc, "Rien d'urgent : le portefeuille est en ordre. Poursuivre les versements réguliers.");
  } else {
    analysis.plan.forEach((a: Advice, i) => {
      doc.font("Helvetica-Bold").fontSize(9.5);
      const action = t(a.action ?? a.title);
      doc.font("Helvetica").fontSize(8.5);
      const why = t(`${a.title}. ${a.body}`);
      const h = doc.heightOfString(action, { width: CONTENT_W - 30 }) + doc.heightOfString(why, { width: CONTENT_W - 30 }) + 22;
      ensureSpace(doc, h);
      const y = doc.y;
      doc.circle(PAGE.margin + 9, y + 7, 9).fill(a.level === "important" ? C.bad : a.level === "attention" ? C.mid : C.accent);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff").text(String(i + 1), PAGE.margin, y + 3, { width: 18, align: "center" });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.ink).text(action, PAGE.margin + 28, y, { width: CONTENT_W - 30 });
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(C.text)
        .text(why, PAGE.margin + 28, doc.y + 2, { width: CONTENT_W - 30, lineGap: 1 });
      if (a.criterion) {
        doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(C.muted).text(t(`Améliore : ${SCORE_LABELS[a.criterion]}`), PAGE.margin + 28, doc.y + 2);
      }
      doc.y += 10;
      doc.x = PAGE.margin;
    });
  }

  if (analysis.stress.length) {
    sectionTitle(doc, "Scénarios de crise", "Perte immédiate estimée sur le patrimoine actuel");
    table(
      doc,
      [
        { label: "Scénario", width: 0.3 },
        { label: "Hypothèse", width: 0.44 },
        { label: "Impact", width: 0.13, align: "right" },
        { label: "% du total", width: 0.13, align: "right" },
      ],
      analysis.stress.map((s) => [s.label, s.description, signedEur(s.impact), signedPct(s.pct)]),
    );
  }

  sectionTitle(doc, "Mentions");
  paragraph(
    doc,
    "Ce relevé est établi automatiquement à partir des données saisies ou importées dans l'application Patrimoine (relevés de comptes, " +
      "export Trade Republic, cours de marché publics). Les valeurs des comptes sans détail des positions sont celles du dernier relevé saisi. " +
      "Les véhicules ne sont pas comptés dans le patrimoine financier. Les notes, niveaux de risque, expositions et scénarios sont des estimations " +
      "fondées sur des données de référence approchées : ils sont fournis à titre indicatif et ne constituent ni un conseil en investissement, " +
      "ni un document émis par un établissement financier.",
    { size: 8, color: C.muted },
  );

  // ---- Footer and page numbers on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing below the margin must not add a page
    const y = PAGE.height - 45;
    doc.moveTo(PAGE.margin, y - 8).lineTo(PAGE.margin + CONTENT_W, y - 8).lineWidth(0.5).strokeColor(C.line).stroke();
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(C.muted)
      .text(t(`Relevé de patrimoine · ${holder} · Réf. ${reference}`), PAGE.margin, y, { width: CONTENT_W * 0.75, lineBreak: false })
      .text(t(`Page ${i - range.start + 1} / ${range.count}`), PAGE.margin, y, { width: CONTENT_W, align: "right", lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
  return { pdf: await done, fileName: `releve-patrimoine-${day}.pdf` };
}
