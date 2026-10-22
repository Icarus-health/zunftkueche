import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { SPHttpClient } from '@microsoft/sp-http';
import { ProbeStore, type Snapshot } from '../../probe-store';
import { parseQuantity } from '../../quantity';
import styles from './KitchenProbeWebPart.module.scss';

interface Props { siteUrl: string }

export default class KitchenProbeWebPart extends BaseClientSideWebPart<Props> {
  private store!: ProbeStore;
  private current?: Snapshot;
  private busy = false;
  private host = 'SharePoint';

  protected async onInit(): Promise<void> {
    if (this.context.sdks.microsoftTeams) {
      const context = await this.context.sdks.microsoftTeams.teamsJs.app.getContext();
      this.host = `${context.app.host.name} · ${context.app.host.clientType}`;
    }
    const site = this.properties.siteUrl;
    if (!site || new URL(site).hostname !== new URL(this.context.pageContext.web.absoluteUrl).hostname) throw new Error('Testziel muss im selben SharePoint-Mandanten liegen.');
    this.store = new ProbeStore(site, async (url, options) => this.context.spHttpClient.fetch(url, SPHttpClient.configurations.v1, options));
  }

  public render(): void {
    this.domElement.innerHTML = `<section class="${styles.probe}">
      <header><span class="${styles.tag}">ZUNFTKÜCHE · VERBINDUNGSTEST</span><h1>Bestand auf einen Blick</h1><p>Ein künstlicher Artikel. Gemeinsam gespeichert in SharePoint.</p></header>
      <div class="${styles.context}"><span data-user></span><span data-host></span><span>Testversion 1.0.0</span></div>
      <article><span class="${styles.tag}">TESTARTIKEL</span><h2>Wasser</h2><p>Flaschen · ausschließlich künstliche Testdaten</p>
        <div class="${styles.amount}" data-amount>—</div>
        <label for="probe-quantity">Gezählter Bestand in Flaschen</label>
        <input id="probe-quantity" data-quantity type="text" inputmode="decimal" autocomplete="off" placeholder="z. B. 9" />
        <div class="${styles.actions}"><button data-save disabled>Bestand speichern</button><button data-reload class="${styles.secondary}">Neu laden</button></div>
        <p class="${styles.status}" role="status" aria-live="polite" data-status>Verbindung wird geprüft …</p>
        <p class="${styles.detail}" data-detail></p>
        <button data-prepare class="${styles.secondary}" hidden>Testliste und Testartikel einrichten</button>
      </article>
      <footer>Dieser Test verändert ausschließlich die eigene Testliste. Bestehende Küchendaten werden nicht übernommen.</footer>
    </section>`;
    this.text('[data-user]', this.context.pageContext.user.displayName);
    this.text('[data-host]', this.host);
    this.button('[data-save]').onclick = async () => { await this.save(); };
    this.button('[data-reload]').onclick = async () => { await this.reload(); };
    this.button('[data-prepare]').onclick = async () => { await this.prepare(); };
    this.reload().catch(error => this.status(this.message(error), true));
  }

  private text(selector: string, value: string): void { const element = this.domElement.querySelector(selector); if (element) element.textContent = value; }
  private button(selector: string): HTMLButtonElement { return this.domElement.querySelector(selector) as HTMLButtonElement; }
  private status(message: string, error = false): void {
    this.text('[data-status]', message);
    this.domElement.querySelector('[data-status]')?.setAttribute('data-error', String(error));
  }
  private lock(value: boolean): void {
    this.busy = value;
    this.button('[data-save]').disabled = value || !this.current;
    this.button('[data-reload]').disabled = value;
    this.button('[data-prepare]').disabled = value;
    (this.domElement.querySelector('[data-quantity]') as HTMLInputElement).disabled = value;
  }
  private show(snapshot: Snapshot): void {
    this.current = snapshot;
    const amount = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4, useGrouping: false }).format(snapshot.quantity);
    this.text('[data-amount]', `${amount} Flaschen`);
    (this.domElement.querySelector('[data-quantity]') as HTMLInputElement).value = amount;
    this.text('[data-detail]', snapshot.modified ? `Zuletzt gespeichert: ${new Date(snapshot.modified).toLocaleString('de-DE')}${snapshot.editor ? ` · ${snapshot.editor}` : ''}` : '');
    this.button('[data-prepare]').hidden = true;
  }
  private async reload(): Promise<void> {
    if (this.busy) return;
    this.lock(true);
    this.status('Aktueller Bestand wird aus SharePoint geladen …');
    try { this.show(await this.store.load()); this.status('Aktueller Bestand aus SharePoint geladen.'); }
    catch (error) { this.current = undefined; this.status(this.message(error), true); this.button('[data-prepare]').hidden = false; }
    finally { this.lock(false); }
  }
  private async prepare(): Promise<void> {
    if (this.busy) return;
    this.lock(true);
    this.status('Eigene Testliste wird eingerichtet …');
    try { this.show(await this.store.prepare()); this.status('Testdaten eingerichtet und aus SharePoint gelesen.'); }
    catch (error) { this.status(this.message(error), true); }
    finally { this.lock(false); }
  }
  private async save(): Promise<void> {
    if (this.busy || !this.current) return;
    const input = this.domElement.querySelector('[data-quantity]') as HTMLInputElement;
    let quantity: number | null;
    try { quantity = parseQuantity(input.value); if (quantity === null) throw new Error('Bitte eine Menge eingeben.'); }
    catch (error) { this.status(this.message(error), true); return; }
    this.lock(true);
    this.status('Wird gespeichert und anschließend aus SharePoint nachgelesen …');
    try { this.show(await this.store.save(this.current, quantity)); this.status('Gespeichert und durch erneutes Lesen bestätigt.'); }
    catch (error) { this.current = undefined; this.status(this.message(error), true); }
    finally { this.lock(false); }
  }
  private message(error: unknown): string { return error instanceof Error ? error.message : 'Verbindung fehlgeschlagen. Bitte neu laden.'; }
}
