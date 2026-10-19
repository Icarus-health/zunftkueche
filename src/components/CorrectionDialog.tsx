import { useState } from "react";
import { Modal, amount } from "./shared.tsx";
import { parseQuantity } from "../domain/kitchen.ts";
import { parseMoney } from "../ui/facts.ts";
import type { AuditEntry } from "../domain/corrections.ts";
export function AuditStamp({ entry }: { entry: AuditEntry }) {
  return (
    <small style={{ display: "block", overflowWrap: "anywhere", whiteSpace: "normal" }}>
      {entry.actorId && entry.confirmedAt
        ? `Person: ${entry.actorId} · ${new Date(entry.confirmedAt).toLocaleString("de-DE")}`
        : "Person/Zeitpunkt nicht serverbestätigt"}{" "}
      · Revision {entry.revision}
    </small>
  );
}
export function CorrectionDialog({
  title,
  label,
  value,
  money = false,
  busy,
  onSave,
  onClose,
}: {
  title: string;
  label: string;
  value: number | null;
  money?: boolean;
  busy: boolean;
  onSave: (value: number, reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState(
      amount(value === null ? null : money ? value / 100 : value),
    ),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const parsed = money ? parseMoney(raw) : parseQuantity(raw);
            if (parsed === null || !reason.trim())
              throw new Error("Bitte Wert und Korrekturgrund eintragen.");
            if (await onSave(parsed, reason)) onClose();
            else
              setError(
                "Noch nicht gespeichert. Bitte den Hinweis oben beachten.",
              );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <fieldset disabled={busy}>
          <p>Die ursprüngliche Buchung bleibt im Verlauf erhalten.</p>
          <label>
            {label}
            <input
              required
              inputMode="decimal"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          </label>
          <label>
            Korrekturgrund
            <textarea
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button className="button primary" type="submit">
            Berichtigung speichern
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
