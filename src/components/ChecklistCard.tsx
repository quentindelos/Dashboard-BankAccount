import Link from "next/link";
import type { ChecklistItem } from "@/lib/checklist";

const LEVEL_LABEL = { late: "En retard", missing: "Manquant", tip: "Conseil" } as const;

function Item({ item }: { item: ChecklistItem }) {
  return (
    <li className={`checklist-item ${item.level}`}>
      <span className="checklist-dot" aria-hidden="true" />
      <div className="checklist-text">
        <strong>{item.title}</strong>
        <span className="sr-only"> ({LEVEL_LABEL[item.level]})</span>
        <span className="muted">{item.detail}</span>
      </div>
      <Link href={item.href} className="btn">
        {item.action}
      </Link>
    </li>
  );
}

// Reminder of what to update or fill in, at the top of the Synthèse page.
export default function ChecklistCard({ items }: { items: ChecklistItem[] }) {
  const due = items.filter((i) => i.level !== "tip");
  const tips = items.filter((i) => i.level === "tip");
  if (items.length === 0) return null;

  return (
    <section className="card checklist" id="rappels" aria-labelledby="checklist-title">
      <h2 id="checklist-title">
        {due.length > 0 ? (
          <>
            À mettre à jour <span className="checklist-count">{due.length}</span>
          </>
        ) : (
          "Tout est à jour"
        )}
      </h2>
      {due.length > 0 && (
        <ul className="checklist-list">
          {due.map((i) => (
            <Item key={i.id} item={i} />
          ))}
        </ul>
      )}
      {tips.length > 0 && (
        <details className="checklist-tips">
          <summary>Pour des analyses et des conseils plus précis ({tips.length})</summary>
          <ul className="checklist-list">
            {tips.map((i) => (
              <Item key={i.id} item={i} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
