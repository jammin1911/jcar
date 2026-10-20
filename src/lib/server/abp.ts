import { inflateRawSync } from 'node:zlib';

// aCar backup (.abp) reader, dependency free on purpose (the speed
// rules say no zip or XML libraries for one import format).
//
// An .abp file is a ZIP of XML files and everything lives in
// vehicles.xml, <vehicle> elements with their profile fields plus
// <fillup-records> and <event-records>. Event types are service,
// expense, purchased and sold, the last two map onto the vehicles
// Purchased and Sold sections. Dates look like "MM/DD/YYYY - HH:MM".
// Units are per vehicle and values get converted to kilometres and
// litres on import.

// ZIP

export function unzipEntry(buf: Buffer, wanted: string): Buffer | null {
  // End Of Central Directory record: scan the tail for its signature.
  let eocd = -1;
  const tailStart = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= tailStart; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    if (name === wanted) {
      if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('Bad local header');
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`Unsupported ZIP compression method ${method}`);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// Minimal XML parser, machine generated documents only

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseXml(xml: string): XmlNode {
  let i = 0;
  const len = xml.length;

  function skipMisc() {
    for (;;) {
      while (i < len && /\s/.test(xml[i])) i++;
      if (xml.startsWith('<?', i)) {
        const end = xml.indexOf('?>', i);
        i = end < 0 ? len : end + 2;
      } else if (xml.startsWith('<!--', i)) {
        const end = xml.indexOf('-->', i);
        i = end < 0 ? len : end + 3;
      } else if (xml.startsWith('<!', i)) {
        const end = xml.indexOf('>', i);
        i = end < 0 ? len : end + 1;
      } else {
        return;
      }
    }
  }

  function parseElement(): XmlNode {
    // assumes xml[i] === '<' and this is a start tag
    i++;
    const nameStart = i;
    while (i < len && !/[\s/>]/.test(xml[i])) i++;
    const tag = xml.slice(nameStart, i);
    const attrs: Record<string, string> = {};
    for (;;) {
      while (i < len && /\s/.test(xml[i])) i++;
      if (xml.startsWith('/>', i)) {
        i += 2;
        return { tag, attrs, children: [], text: '' };
      }
      if (xml[i] === '>') {
        i++;
        break;
      }
      const aStart = i;
      while (i < len && xml[i] !== '=' && !/[\s/>]/.test(xml[i])) i++;
      const aName = xml.slice(aStart, i);
      while (i < len && /\s/.test(xml[i])) i++;
      let aVal = '';
      if (xml[i] === '=') {
        i++;
        while (i < len && /\s/.test(xml[i])) i++;
        const quote = xml[i];
        if (quote === '"' || quote === "'") {
          const end = xml.indexOf(quote, i + 1);
          aVal = xml.slice(i + 1, end < 0 ? len : end);
          i = end < 0 ? len : end + 1;
        }
      }
      if (aName) attrs[aName] = decodeEntities(aVal);
    }

    const children: XmlNode[] = [];
    let text = '';
    for (;;) {
      const lt = xml.indexOf('<', i);
      if (lt < 0) {
        text += xml.slice(i);
        i = len;
        break;
      }
      text += xml.slice(i, lt);
      i = lt;
      if (xml.startsWith('</', i)) {
        const end = xml.indexOf('>', i);
        i = end < 0 ? len : end + 1;
        break;
      }
      if (xml.startsWith('<!--', i) || xml.startsWith('<?', i) || xml.startsWith('<!', i)) {
        skipMisc();
        continue;
      }
      if (xml.startsWith('<![CDATA[', i)) {
        const end = xml.indexOf(']]>', i);
        text += xml.slice(i + 9, end < 0 ? len : end);
        i = end < 0 ? len : end + 3;
        continue;
      }
      children.push(parseElement());
    }
    return { tag, attrs, children, text: decodeEntities(text) };
  }

  skipMisc();
  return parseElement();
}

export function childText(node: XmlNode, tag: string): string {
  const c = node.children.find((k) => k.tag === tag);
  return c ? c.text.trim() : '';
}

export function childNodes(node: XmlNode, containerTag: string): XmlNode[] {
  const c = node.children.find((k) => k.tag === containerTag);
  return c ? c.children : [];
}

// aCar mapping

export interface AbpRecord {
  type: 'fuel' | 'service' | 'expense';
  /** aCar event subtype name (e.g. "Insurance") for service/expense records */
  title: string;
  datetime: string; // ISO local "YYYY-MM-DDTHH:MM:00"
  odometer: number | null;
  pricePerUnit: number | null;
  volume: number | null;
  totalCost: number | null;
  partial: boolean;
  missed: boolean;
  notes: string;
  place: { street: string; city: string; province: string; postalCode: string; country: string } | null;
}

export interface AbpVehicle {
  name: string;
  year: string;
  make: string;
  model: string;
  submodel: string;
  engine: string;
  transmission: string;
  driveType: string;
  bodyType: string;
  distanceUnit: 'Kilometers' | 'Miles';
  volumeUnit: 'Liters' | 'Gallons';
  licensePlate: string;
  vin: string;
  tankCapacity: number | null;
  notes: string;
  /** aCar's <active> flag - inactive vehicles import as disabled */
  active: boolean;
  purchased: { odometer: number | null; price: number | null; date: string; notes: string } | null;
  sold: { odometer: number | null; price: number | null; date: string; notes: string } | null;
  records: AbpRecord[];
  parts: {
    name: string;
    partNumber: string;
    type: string;
    brand: string;
    size: string;
    volume: string;
    pressure: string;
    quantity: number | null;
    notes: string;
  }[];
}

const num = (s: string): number | null => {
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
};

/** "MM/DD/YYYY - HH:MM" -> ISO local datetime, or null when unparseable. */
function acarDate(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*-\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, mo, d, y, hh = '00', mm = '00'] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm}:00`;
}

function placeOf(node: XmlNode) {
  const street = childText(node, 'place-street') || childText(node, 'place-name');
  const city = childText(node, 'place-city');
  const province = childText(node, 'place-state');
  const postalCode = childText(node, 'place-postal-code');
  const country = childText(node, 'place-country');
  if (!street && !city) return null;
  return { street, city, province, postalCode, country };
}

/** event-subtypes.xml: <event-subtype id="55" type="expense"><name>Insurance</name>... */
function parseSubtypeNames(buf: Buffer): Map<string, string> {
  const map = new Map<string, string>();
  const xmlBuf = unzipEntry(buf, 'event-subtypes.xml');
  if (!xmlBuf) return map;
  const root = parseXml(xmlBuf.toString('utf8'));
  for (const st of root.children) {
    if (st.tag !== 'event-subtype') continue;
    const id = st.attrs.id;
    const name = childText(st, 'name');
    if (id && name) map.set(id, name);
  }
  return map;
}

/** Backup creation day (YYYY-MM-DD) from metadata.inf, or null. */
function parseBackupDate(buf: Buffer): string | null {
  const meta = unzipEntry(buf, 'metadata.inf');
  if (!meta) return null;
  const m = meta.toString('utf8').match(/acar\.backup\.datetime=(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

export function parseAbp(buf: Buffer): { vehicles: AbpVehicle[]; skipped: number } {
  const xmlBuf = unzipEntry(buf, 'vehicles.xml');
  if (!xmlBuf) throw new Error('vehicles.xml not found in backup');
  const backupDate = parseBackupDate(buf);
  const subtypeNames = parseSubtypeNames(buf);
  const root = parseXml(xmlBuf.toString('utf8'));
  const vehicleNodes = root.tag === 'vehicles' ? root.children.filter((c) => c.tag === 'vehicle') : [];
  if (vehicleNodes.length === 0) throw new Error('No vehicles found in backup');

  let skipped = 0;
  const out: AbpVehicle[] = [];

  for (const v of vehicleNodes) {
    const distUnitRaw = childText(v, 'distance-unit').toLowerCase();
    const volUnitRaw = childText(v, 'volume-unit').toLowerCase();
    const isMiles = distUnitRaw.startsWith('mile');
    const isGallons = volUnitRaw.includes('gallon');
    const distFactor = isMiles ? 1.60934 : 1; // -> km
    const volFactor = isGallons ? 3.78541 : 1; // -> litres

    const veh: AbpVehicle = {
      name: childText(v, 'name') || 'Vehicle',
      year: childText(v, 'year'),
      make: childText(v, 'make'),
      model: childText(v, 'model'),
      submodel: childText(v, 'sub-model'),
      engine: childText(v, 'engine'),
      transmission: childText(v, 'transmission'),
      driveType: childText(v, 'drive-type'),
      bodyType: childText(v, 'body-type'),
      distanceUnit: isMiles ? 'Miles' : 'Kilometers',
      volumeUnit: isGallons ? 'Gallons' : 'Liters',
      licensePlate: childText(v, 'license-plate'),
      vin: childText(v, 'vin'),
      tankCapacity: num(childText(v, 'fuel-tank-capacity')) || null,
      notes: childText(v, 'notes'),
      active: childText(v, 'active') !== 'false',
      purchased: null,
      sold: null,
      records: [],
      parts: []
    };

    for (const f of childNodes(v, 'fillup-records')) {
      const dt = acarDate(childText(f, 'date'));
      if (!dt) {
        skipped++;
        continue;
      }
      const volume = num(childText(f, 'volume'));
      const price = num(childText(f, 'price-per-volume-unit'));
      const odo = num(childText(f, 'odometer-reading'));
      veh.records.push({
        type: 'fuel',
        title: '',
        datetime: dt,
        odometer: odo !== null ? odo * distFactor : null,
        pricePerUnit: price !== null ? price / volFactor : null,
        volume: volume !== null ? volume * volFactor : null,
        totalCost: num(childText(f, 'total-cost')),
        partial: childText(f, 'partial') === 'true',
        missed: childText(f, 'previous-missed-fillups') === 'true',
        notes: childText(f, 'notes'),
        place: null // fuel records have no location in jCar
      });
    }

    const purchasedEvents: { dt: string; odo: number | null; price: number | null; notes: string }[] = [];
    const soldEvents: typeof purchasedEvents = [];
    for (const e of childNodes(v, 'event-records')) {
      const type = childText(e, 'type').toLowerCase();
      const dt = acarDate(childText(e, 'date'));
      if (!dt) {
        skipped++;
        continue;
      }
      const odo = num(childText(e, 'odometer-reading'));
      const entry = {
        dt,
        odo: odo !== null ? odo * distFactor : null,
        price: num(childText(e, 'total-cost')),
        notes: childText(e, 'notes')
      };
      if (type === 'purchased') {
        purchasedEvents.push(entry);
      } else if (type === 'sold') {
        soldEvents.push(entry);
      } else if (type === 'service' || type === 'expense') {
        const subtypeNode = e.children
          .find((k) => k.tag === 'subtypes')
          ?.children.find((k) => k.tag === 'subtype');
        const title = subtypeNode?.attrs.id ? (subtypeNames.get(subtypeNode.attrs.id) ?? '') : '';
        veh.records.push({
          type,
          title,
          datetime: dt,
          odometer: entry.odo,
          pricePerUnit: null,
          volume: null,
          totalCost: entry.price,
          partial: false,
          missed: false,
          notes: entry.notes,
          place: placeOf(e)
        });
      } else {
        skipped++; // reminders-as-events, trips, anything unknown
      }
    }
    // aCar placeholder guard: when purchase info was never entered,
    // aCar stamps a purchased event dated the day the backup was made,
    // priced $0, at the vehicles current max odometer. That is not
    // real purchase data, so skip it when all three marks match.
    const maxOdo = veh.records.reduce<number | null>(
      (acc, r) => (r.odometer !== null && (acc === null || r.odometer > acc) ? r.odometer : acc),
      null
    );
    const isPlaceholder = (e: { dt: string; odo: number | null; price: number | null }) =>
      backupDate !== null &&
      e.dt.slice(0, 10) === backupDate &&
      (e.price ?? 0) === 0 &&
      maxOdo !== null &&
      e.odo === maxOdo;
    const realPurchased = purchasedEvents.filter((e) => !isPlaceholder(e));
    const realSold = soldEvents.filter((e) => !isPlaceholder(e));
    if (realPurchased.length) {
      realPurchased.sort((a, b) => a.dt.localeCompare(b.dt));
      const p = realPurchased[0];
      veh.purchased = { odometer: p.odo, price: p.price, date: p.dt.slice(0, 10), notes: p.notes };
    }
    if (realSold.length) {
      realSold.sort((a, b) => a.dt.localeCompare(b.dt));
      const s = realSold[realSold.length - 1];
      veh.sold = { odometer: s.odo, price: s.price, date: s.dt.slice(0, 10), notes: s.notes };
    }

    for (const p of childNodes(v, 'vehicle-parts')) {
      const name = childText(p, 'name');
      if (!name) continue;
      veh.parts.push({
        name,
        partNumber: childText(p, 'part-number'),
        type: childText(p, 'type'),
        brand: childText(p, 'brand'),
        size: childText(p, 'size'),
        volume: childText(p, 'volume'),
        pressure: childText(p, 'pressure'),
        quantity: num(childText(p, 'quantity')),
        notes: childText(p, 'notes')
      });
    }

    out.push(veh);
  }

  return { vehicles: out, skipped };
}
