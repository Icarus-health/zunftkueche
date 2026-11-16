import type { Order, Supplier } from './model';
import { validateOrder } from './domain.ts';
import { withSchedule } from './supplier-orders.ts';
import { button, h, n } from './markup.ts';
import { dayLabel } from './ww/common.ts';

interface SupplierMail {
  to: string;
  subject: string;
  body: string;
  href: string;
  prefilledBody: boolean;
}

export function supplierOrderText(source: Order, supplier: Supplier, forDispatch = false): string {
  const order = withSchedule(source);
  const text = [
    ...(!forDispatch && order.status === 'Entwurf' ? ['Entwurf zur Prüfung', ''] : []),
    'Guten Tag,',
    '',
    'für ' + (order.occasion || order.area) + ' bestellen wir für die Schelmenzunft Staufen:',
    ...(supplier.customerNumber ? ['Kundennummer ' + supplier.customerNumber] : [])
  ];
  for (const delivery of order.deliveries!) {
    const positions = order.lines.flatMap(line => {
      const quantity = line.schedule?.[delivery.id] ?? null;
      if (quantity === 0) return [];
      const item = line.articleName + (line.code ? ' (' + line.code + ')' : '');
      return [
        '– ' +
          (quantity === null ? 'Menge offen' : n(quantity) + ' Gebinde à ' + n(line.packSize) + ' ' + line.unit) +
          ' · ' +
          item +
          ' · ' +
          line.packName
      ];
    });
    if (positions.length) {
      const date = delivery.date ? dayLabel(delivery.date) : 'Datum offen';
      text.push('', [date, delivery.time, delivery.place || order.area].filter(Boolean).join(' · '), ...positions);
    }
  }
  if (order.supplierNote?.trim()) text.push('', order.supplierNote.trim());
  return [
    ...text,
    '',
    'Bitte bestätigen Sie Mengen, Liefertermine und Preise.',
    '',
    'Viele Grüße',
    'Schelmenzunft Staufen'
  ].join('\n');
}

export function supplierMail(order: Order, supplier: Supplier): SupplierMail {
  validateOrder(withSchedule(order), undefined, true);
  if (order.supplierId !== supplier.id) throw new Error('Lieferant passt nicht zur Bestellung.');
  const recipient = supplier.email.trim();
  // Accept one mailbox. Delimiters must never create additional recipients or headers.
  const to = /^[a-z0-9.!#$%&'*+/=?^_{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(recipient) ? recipient : '';
  const occasion = (order.occasion || order.area).replace(/[\r\n\t]+/g, ' ').trim();
  const subject = 'Schelmenzunft Staufen · Bestellung · ' + occasion;
  const body = supplierOrderText(order, supplier, true);
  const subjectLink = to
    ? 'mailto:' + encodeURIComponent(to).replace('%40', '@') + '?subject=' + encodeURIComponent(subject)
    : '';
  const fullLink = subjectLink + '&body=' + encodeURIComponent(body.replace(/\r?\n/g, '\r\n'));
  const prefilledBody = !!subjectLink && fullLink.length <= 2000;
  return { to, subject, body, href: prefilledBody ? fullLink : subjectLink, prefilledBody };
}

/**
 * Versand vorbereiten. Kann das Gerät Dateien teilen (iPhone, iPad, Android), öffnet „Mit PDF teilen“ das Teilen-Menü
 * mit angehängter PDF und dem Bestelltext. Sonst speichert derselbe Knopf die PDF und öffnet das E-Mail-Programm.
 */
export function orderMailView(order: Order, supplier: Supplier, shareFiles = false): string {
  const mail = supplierMail(order, supplier);
  const fields =
    '<div class="formgrid"><label>Empfänger<input readonly value="' +
    h(mail.to) +
    '" placeholder="Adresse im Lieferantenprofil prüfen"></label>' +
    '<label>Betreff<input readonly value="' +
    h(mail.subject) +
    '"></label></div>';
  const help = shareFiles
    ? 'Teilen öffnet E-Mail oder einen Messenger mit angehängter PDF. Empfänger dort eintragen' +
      (mail.to ? ': ' + mail.to + '.' : '.')
    : !mail.to
      ? 'Adresse im Lieferantenprofil ergänzen oder im E-Mail-Programm eintragen. Bestelltext kopieren und PDF anhängen.'
      : mail.prefilledBody
        ? 'Der Knopf speichert die PDF und öffnet die E-Mail mit Text. PDF dort anhängen.'
        : 'Der Knopf speichert die PDF und öffnet die E-Mail mit Betreff. Bestelltext kopieren, einfügen und PDF anhängen.';
  const primary = shareFiles ? 'Mit PDF teilen' : mail.href ? 'PDF speichern und E-Mail öffnen' : 'PDF für Versand';
  return (
    '<section class="panel order-mail" data-order-mail><div class="calm-heading"><div>' +
    button('order-mail-back', 'Zurück') +
    '<h1 tabindex="-1">Bestellung versenden</h1></div></div>' +
    '<p class="calm-subtitle">' +
    h(order.supplierName) +
    '</p>' +
    fields +
    '<label>Bestelltext<textarea name="orderMailBody" readonly rows="12" tabindex="0">' +
    h(mail.body) +
    '</textarea></label>' +
    '<p class="muted">' +
    h(help) +
    '</p><div class="mail-more">' +
    button('order-dispatch-pdf', 'Nur PDF speichern') +
    button('order-mail-copy', 'Bestelltext kopieren') +
    (mail.href
      ? '<a class="mail-compose" href="' +
        h(mail.href) +
        '">' +
        (mail.prefilledBody ? 'Nur E-Mail öffnen' : 'Nur E-Mail mit Betreff öffnen') +
        '</a>'
      : '') +
    '</div><div class="calm-actions">' +
    button('order-share', primary, '', true) +
    '</div></section>'
  );
}
