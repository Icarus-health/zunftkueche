import type { Season, Workspace } from '../model';
import { backLink, button, empty, euro, h, moreMenu, ordersTabs } from '../markup.ts';
import { paymentNote } from './bill-suggest.ts';
import { linkedBill } from './bill-accounting.ts';
import { documents } from './model.ts';
import { supportedInboxFile } from './inbox.ts';
import type { InboxFolder, InboxKind } from './inbox';

export interface InboxView {
  season: Season;
  folders: Partial<Record<InboxKind, InboxFolder>>;
  errors: Partial<Record<InboxKind, string>>;
  duplicates: Map<string, string>;
  busy: boolean;
}

/** Unterstützte Dateien im Rechnungsordner, zu denen es noch keine bestätigte Rechnung im aktuellen Dateistand gibt. */
export function openBillFiles(folder: InboxFolder, state: Workspace, seasonId: string): number {
  if (!folder.exists) return 0;
  const records = documents(state.ww, 'bill').filter(doc => doc.scope === seasonId);
  return folder.files.filter(
    file =>
      supportedInboxFile('bill', file) &&
      !records.some(doc => doc.sourceFile?.id === file.id && doc.sourceFile?.version === file.version && doc.confirmed)
  ).length;
}

/** Rechnungen gehören zu den Bestellungen, Kassendateien zur Auswertung. Beide lesen denselben Eingang aus SharePoint. */
export function inboxView(view: InboxView, state: Workspace, stateArea?: string, only: InboxKind = 'bill'): string {
  const sections: Array<[InboxKind, string]> =
    only === 'bill' ? [['bill', 'Neue Dateien im Rechnungsordner']] : [['system', 'Dateien im Kassenordner']];
  const refresh = view.busy ? '' : button('ww-inbox-refresh', 'Dateiliste aktualisieren');
  const top =
    only === 'bill'
      ? `<div class="page-heading"><div><h1>Rechnungen</h1><p>${h(view.season.name)} · ${h(stateArea || '')}</p></div><div class="actions">${moreMenu([refresh, button('ww-open', 'Bestätigte Rechnungen', 'bills')])}</div></div>${ordersTabs('bills')}`
      : `${backLink('nav', 'Auswertung', 'reports')}<div class="page-heading"><div><h1>Kassendateien</h1><p>${h(view.season.name)}</p></div><div class="actions">${refresh}</div></div>`;
  return (
    top +
    (view.busy ? '<p role="status">SharePoint-Dateien werden gelesen …</p>' : '') +
    sections
      .map(([kind, name]) => {
        const folder = view.folders[kind];
        const prefix = '<section class="plain-section"><h2>' + name + '</h2>';
        const error = view.errors[kind];
        if (error) return prefix + '<p role="alert">' + h(error) + '</p></section>';
        if (!folder) return '';
        if (!folder.exists)
          return (
            prefix +
            '<p>' +
            h(folder.path) +
            ' ist noch nicht angelegt.</p>' +
            (!view.season.archived && !view.busy ? button('ww-inbox-create', 'Jahresordner anlegen', kind) : '') +
            '</section>'
          );
        const records = documents(state.ww, kind).filter(doc => doc.scope === view.season.id);
        let openCount = 0,
          confirmedCount = 0,
          confirmedSum = 0,
          firstOpen = '';
        const rows = [...folder.files]
          .sort((a, b) => Number(supportedInboxFile(kind, b)) - Number(supportedInboxFile(kind, a)))
          .map(file => {
            const versions = records.filter(doc => doc.sourceFile?.id === file.id);
            const current =
              versions.find(doc => doc.sourceFile?.version === file.version && doc.confirmed) ??
              versions.find(doc => doc.sourceFile?.version === file.version);
            const duplicate = view.duplicates.get(file.id + ':' + file.version);
            const supported = supportedInboxFile(kind, file);
            const collection = current?.kind === 'bill' && current.needsSeparateFiles;
            const scanNumberOpen = current?.kind === 'bill' && current.scanNumberReview?.status === 'open';
            const costOpen = current?.kind === 'bill' && linkedBill(current, state).costAssignment?.mode === 'open';
            const status = current?.confirmed
              ? 'Übernommen · ' + (costOpen ? 'Kostenstelle offen' : current.area)
              : duplicate
                ? 'Doppelte Datei · ' + duplicate
                : scanNumberOpen
                  ? 'Belegnummern prüfen'
                  : collection
                    ? 'Einzelbelege erforderlich'
                    : current
                      ? 'Prüfung offen · ' + current.area
                      : versions.length
                        ? 'Neuer Dateistand'
                        : supported
                          ? 'Neu'
                          : 'Format oder Größe prüfen';
            const action =
              current?.confirmed && current.kind === 'bill' && !view.busy
                ? button('ww-bill-view', 'Rechnung öffnen', current.id)
                : !view.busy &&
                    !view.season.archived &&
                    supported &&
                    !current?.confirmed &&
                    !duplicate &&
                    (!current || !stateArea || current.area === stateArea)
                  ? button(
                      'ww-inbox-file',
                      collection && !scanNumberOpen ? 'Sammel-PDF ansehen' : current ? 'Prüfung fortsetzen' : 'Prüfen',
                      kind + '|' + file.id
                    )
                  : '';
            const largePdf = kind === 'bill' && /\.pdf$/i.test(file.name) && file.size > 8 * 1024 * 1024;
            const openOriginal = largePdf
              ? '<a href="' +
                h(folder.href + '/' + encodeURIComponent(file.name)) +
                '" target="_blank" rel="noopener">Original in SharePoint öffnen</a>'
              : '';
            // Geprüfte oder begonnene Rechnungen zeigen, was drinsteht: Lieferant, Nummer, Betrag, Zahlungsziel.
            const bill = current?.kind === 'bill' ? current : undefined;
            const supplier = bill ? (state.suppliers || []).find(r => r.value.id === bill.supplierId)?.value.name : '';
            const title =
              bill && (supplier || bill.number) ? [supplier, bill.number].filter(Boolean).join(' · ') : file.name;
            const detail = [
              largePdf ? 'PDF über 8 MB · Einzelbelege prüfen' : status,
              bill?.confirmed ? paymentNote(bill) : '',
              title === file.name ? '' : file.name
            ]
              .filter(Boolean)
              .join(' · ');
            if (bill?.confirmed && bill.gross !== null) confirmedSum += bill.gross;
            if (bill?.confirmed) confirmedCount++;
            else if (action && supported) firstOpen = firstOpen || file.id;
            if (!bill?.confirmed && supported && !duplicate) openCount++;
            return (
              '<div class="listrow' +
              (bill?.confirmed ? ' is-done' : '') +
              '"><div><strong>' +
              h(title) +
              '</strong><small>' +
              h(detail) +
              '</small></div><div class="actions">' +
              (bill && bill.gross !== null ? '<span class="num">' + h(euro(bill.gross)) + '</span>' : '') +
              (action || openOriginal) +
              '</div></div>'
            );
          })
          .join('');
        const overview =
          kind === 'bill' && (openCount || confirmedCount)
            ? '<div class="inbox-summary"><p><strong>' +
              openCount +
              ' offen</strong> · ' +
              confirmedCount +
              ' bestätigt' +
              (confirmedCount ? ' · zusammen ' + h(euro(confirmedSum)) + ' brutto' : '') +
              '</p>' +
              (firstOpen ? button('ww-inbox-file', 'Nächste Rechnung prüfen', 'bill|' + firstOpen, true) : '') +
              '</div>'
            : '';
        return (
          prefix +
          '<p><a href="' +
          h(folder.href) +
          '" target="_blank" rel="noopener">' +
          (kind === 'bill' ? 'Rechnungsordner' : 'Kassenordner') +
          ' in SharePoint öffnen</a></p>' +
          overview +
          (rows || empty('Noch keine Dateien im Jahresordner.')) +
          '</section>'
        );
      })
      .join('')
  );
}
