// Local compatibility evidence; generated fixture is never included in browser or plugin packages.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { applyOperation } from "../src/domain/state.ts";
let state = {
  ...JSON.parse(readFileSync("import/2026.json")),
  schemaVersion: 2,
  revision: 0,
  operationIds: [],
  operationRequests: {},
};
const states = [structuredClone(state)];
function apply(type, payload) {
  state = applyOperation(state, {
    id: `corpus-${states.length}`,
    baseRevision: state.revision,
    type,
    payload,
  }).state;
  states.push(structuredClone(state));
}
apply("article.price", { articleId: "a-1", priceCents: 123.45 });
apply("order.prepare", { supplierId: "s-wiggenhauser", day: "Mittwoch" });
apply("article.price", { articleId: "a-1", priceCents: 234.56 });
apply("sales.quantity", { menuId: "m-1", day: "Freitag", quantity: 10 });
apply("menu.price", { menuId: "m-1", priceCents: 900 });
apply("invoice.link", { reason: "Testkorrektur laut Beleg",
  id: state.invoices[0].id,
  url: "https://example.sharepoint.com/doc.pdf",
});
const missing = state.invoices.find((r) => r.status === "Original fehlt");
apply("invoice.update", { reason: "Testkorrektur laut Beleg",  ...missing, grossCents: 99999, netCents: 90000 });
const old = state.event.id;
apply("event.create", {
  name: "Synthetic next event",
  year: 2027,
  copyPlan: true,
});
apply("event.switch", { id: old });
apply("event.dates", { dates: { Mittwoch: "2026-02-11" } });
apply("supplier.save", {
  id: "s-wiggenhauser",
  name: "Synthetic renamed supplier",
  email: null,
});
apply("order.prepare", { supplierId: "s-wiggenhauser", day: "Mittwoch" });
mkdirSync("server/Tests/obj", { recursive: true });
writeFileSync("server/Tests/obj/reducer-corpus.json", JSON.stringify(states));
console.log(
  `Created ${states.length} sequential reducer states for C# compatibility tests.`,
);
