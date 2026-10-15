export function showBootstrapScreen(root: HTMLElement, failed = false): void {
  const panel = document.createElement("main");
  panel.className = "bootstrap-screen";
  panel.setAttribute("role", failed ? "alert" : "status");
  const title = document.createElement("h1");
  title.textContent = failed ? "Zunftküche konnte nicht starten" : "Zunftküche wird gestartet …";
  const description = document.createElement("p");
  description.textContent = failed
    ? "Bitte die Zunftküche über Microsoft öffnen und die Verbindung prüfen. Danach erneut laden. Deine offenen Änderungen bleiben für diesen Tab erhalten."
    : "Die Verbindung zu Microsoft wird vorbereitet.";
  panel.append(title, description);
  if (failed) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button primary";
    retry.textContent = "Erneut laden";
    retry.addEventListener("click", () => window.location.reload());
    panel.append(retry);
  }
  root.replaceChildren(panel);
}
