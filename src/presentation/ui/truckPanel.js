// Antarmuka bab "Truk": panel interaktif di kartu Detail (tiga mode: bagian truk, muat kompartemen, uji dinding
// sekat) dan penanda HTML yang menempel pada truk 3D (nomor bagian, label kompartemen, titik berat muatan).
// Keadaan disimpan di scenes/truckShow.js; panel hanya membaca dan mengirim perintah.
import * as THREE from 'three';
import { el, clear } from '../../ui/dom.js';
import { PARTS, COMPARTMENT_LITRES, POSTER_LOAD } from '../scenes/truckShow.js';

// Pesanan contoh untuk tantangan "penuhi pesanan SPBU" (ilustrasi, bukan data ITJ).
const ORDERS = [
  { pertalite: 16000, pertamax: 8000, pertadex: 8000 },
  { pertalite: 24000, pertamaxTurbo: 8000 },
  { pertamax: 16000, pertamaxTurbo: 8000, pertadex: 8000 },
  { pertalite: 8000, pertamax: 8000, pertamaxTurbo: 8000, pertadex: 8000 },
];
const nf = (lang) => new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US');
const set = (node, text) => {
  if (node.textContent !== text) node.textContent = text;
};

export function orderStatus(order, by) {
  const lines = Object.entries(order).map(([p, need]) => ({ product: p, need, have: by[p] || 0, ok: (by[p] || 0) === need }));
  const extra = Object.keys(by).filter((p) => !(p in order));
  return { lines, extra, done: lines.every((l) => l.ok) && !extra.length };
}

export function createTruckPanel({ content, lang, mode, truck, products, onFocus }) {
  const t = content.truck, f = nf(lang), s = truck.state;
  const root = el('div', { class: `truckpanel mode-${mode}` });
  const sync = [];
  const litres = (n) => `${f.format(n)} L`;
  const xrayBtn = el('button', { type: 'button', class: 'tp-toggle', onClick: () => truck.setXray() }, el('i'), t.xray, el('kbd', { text: 'X' }));
  sync.push(() => xrayBtn.classList.toggle('on', s.xray));
  const head = (title) => el('div', { class: 'tp-head' }, el('strong', { text: title }), xrayBtn);

  if (mode === 'parts') {
    const info = el('div', { class: 'tp-info' });
    const list = el('div', { class: 'tp-parts' });
    const btns = PARTS.map((p, i) => {
      const b = el('button', { type: 'button', onClick: () => onFocus(s.part === p.key ? null : p.key) }, el('i', { text: String(i + 1) }), el('span', { text: t.parts[p.key][0] }));
      list.append(b);
      return b;
    });
    root.append(
      head(t.partsTitle),
      el('p', { class: 'tp-hint', text: t.hintParts }),
      list,
      info,
      el('div', { class: 'tp-row' }, el('button', { type: 'button', class: 'tp-btn', onClick: () => onFocus(null), text: t.viewAll })),
      el('p', { class: 'tp-note' }, el('i', { class: 'chk', title: content.ui.checkTitle, text: content.ui.check }), ` ${t.partsStatus}`),
    );
    let shown;
    sync.push(() => {
      btns.forEach((b, i) => b.classList.toggle('on', PARTS[i].key === s.part));
      if (shown === s.part) return;
      shown = s.part;
      clear(info);
      if (s.part) info.append(el('b', { text: `${PARTS.findIndex((p) => p.key === s.part) + 1} · ${t.parts[s.part][0]}` }), el('p', { text: t.parts[s.part][1] }));
      else info.append(el('p', { class: 'muted', text: t.pickPart }));
      info.classList.toggle('empty', !s.part);
    });
  }

  if (mode === 'load') {
    if (s.order == null) s.order = 0;
    // Diagram tangki: kabin di kiri seperti tampilan 3D, kompartemen 4 (depan) → 1 (belakang)
    const cells = [3, 2, 1, 0].map((i) => {
      const fill = el('i', { class: 'fill' }), name = el('b'), vol = el('span');
      const b = el('button', { type: 'button', class: 'tp-cell', onClick: () => truck.select(i) }, fill, el('em', { text: `${t.compShort}${i + 1}` }), name, vol);
      return { i, b, fill, name, vol };
    });
    const diagram = el('div', { class: 'tp-tank' }, el('div', { class: 'tp-cab', title: t.front }), ...cells.map((c) => c.b));
    const selTitle = el('div', { class: 'tp-sub' });
    const chips = Object.values(products).map((p) => {
      const b = el('button', { type: 'button', class: 'tp-chip', onClick: () => truck.setProduct(s.selected, p.id) }, el('i', { style: { background: p.color } }), p.name);
      return { id: p.id, b };
    });
    const emptyChip = el('button', { type: 'button', class: 'tp-chip', onClick: () => truck.setProduct(s.selected, null) }, el('i', { class: 'none' }), t.empty);
    const slider = el('input', { type: 'range', min: '0', max: String(COMPARTMENT_LITRES), step: '1000', 'aria-label': t.level });
    slider.addEventListener('input', () => truck.setLitres(s.selected, +slider.value));
    slider.addEventListener('pointerup', () => slider.blur()); // kembalikan panah/spasi ke navigasi langkah
    const sliderVal = el('b');
    const totalBar = el('div', { class: 'tp-bar' }, el('i'));
    const totalText = el('span');
    const orderLines = el('ul', { class: 'tp-order' });
    const orderState = el('div', { class: 'tp-orderstate' });
    const single = () => truck.loadAll(Array(4).fill(s.comps[Math.max(0, s.selected)]?.product || 'pertalite'));
    root.append(
      head(t.loadTitle),
      el('p', { class: 'tp-hint', text: t.hintLoad }),
      diagram,
      selTitle,
      el('div', { class: 'tp-chips' }, ...chips.map((c) => c.b), emptyChip),
      el('label', { class: 'tp-slider' }, el('span', { text: t.level }), slider, sliderVal),
      el('div', { class: 'tp-row' },
        el('button', { type: 'button', class: 'tp-btn', onClick: () => truck.loadAll(POSTER_LOAD), text: t.presets.poster }),
        el('button', { type: 'button', class: 'tp-btn', onClick: single, text: t.presets.single }),
        el('button', { type: 'button', class: 'tp-btn', onClick: () => truck.loadAll([]), text: t.presets.clear }),
      ),
      el('div', { class: 'tp-total' }, el('span', { class: 'muted', text: t.total }), totalText, totalBar),
      el('div', { class: 'tp-orderbox' },
        el('div', { class: 'tp-orderhead' }, el('strong', { text: t.order }), el('span', { class: 'muted', text: t.orderNote }), el('button', { type: 'button', class: 'tp-btn small', onClick: () => { s.order = (s.order + 1) % ORDERS.length; s.version++; }, text: t.nextOrder })),
        orderLines,
        orderState,
      ),
    );
    sync.push(() => {
      const sel = Math.max(0, s.selected);
      for (const c of cells) {
        const comp = s.comps[c.i], p = products[comp.product];
        c.b.classList.toggle('on', c.i === sel);
        c.fill.style.height = `${(comp.litres / COMPARTMENT_LITRES) * 100}%`;
        c.fill.style.background = p && comp.litres ? p.color : 'transparent';
        set(c.name, p && comp.litres ? p.name : t.empty);
        set(c.vol, litres(comp.litres));
      }
      const cur = s.comps[sel];
      set(selTitle, `${t.comp} ${sel + 1} · ${sel === 3 ? t.front : sel === 0 ? t.rear : t.middle}`);
      for (const c of chips) c.b.classList.toggle('on', cur.litres > 0 && cur.product === c.id);
      emptyChip.classList.toggle('on', !cur.litres);
      if (document.activeElement !== slider) slider.value = String(cur.litres);
      set(sliderVal, litres(cur.litres));
      const tot = truck.totals();
      const n = Object.keys(tot.by).length;
      set(totalText, `${litres(tot.total)} / ${litres(tot.capacity)} · ${n} ${t.products}`);
      totalBar.firstChild.style.width = `${(tot.total / tot.capacity) * 100}%`;
      const st = orderStatus(ORDERS[s.order], tot.by);
      clear(orderLines);
      for (const l of st.lines) orderLines.append(el('li', { class: l.ok ? 'ok' : '' }, el('i', { style: { background: products[l.product].color } }), el('span', { text: products[l.product].name }), el('b', { text: litres(l.need) }), el('em', { text: l.ok ? '✓' : `${litres(l.have)}` })));
      for (const p of st.extra) orderLines.append(el('li', { class: 'extra' }, el('i', { style: { background: products[p].color } }), el('span', { text: products[p].name }), el('b', { text: t.notOrdered }), el('em', { text: litres(tot.by[p]) })));
      set(orderState, st.done ? `✓ ${t.orderDone}` : t.orderOpen);
      orderState.classList.toggle('done', st.done);
    });
  }

  if (mode === 'surge') {
    const seg = { on: el('button', { type: 'button', onClick: () => truck.setBulkheads(true), text: t.withBulk }), off: el('button', { type: 'button', onClick: () => truck.setBulkheads(false), text: t.withoutBulk }) };
    const slider = el('input', { type: 'range', min: '30', max: '100', step: '5', 'aria-label': t.fill });
    slider.addEventListener('input', () => truck.setSurgeFill(+slider.value / 100));
    slider.addEventListener('pointerup', () => slider.blur());
    const sliderVal = el('b');
    const drive = el('button', { type: 'button', class: 'tp-drive', onClick: () => truck.toggleDrive() }, el('span'), el('kbd', { text: 'B' }));
    const speed = el('b'), status = el('span', { class: 'muted' });
    const live = el('div', { class: 'tp-meter' }, el('i'), el('u'));
    const liveVal = el('b');
    const rows = ['with', 'without'].map((k) => {
      const bar = el('i'), val = el('b');
      return { k, bar, val, row: el('div', { class: `tp-peak ${k}` }, el('span', { text: k === 'with' ? t.withBulk : t.withoutBulk }), el('div', { class: 'tp-bar' }, bar), val) };
    });
    const verdict = el('p', { class: 'tp-verdict' });
    const explain = el('p', { class: 'tp-explain' });
    root.append(
      head(t.surgeTitle),
      el('p', { class: 'tp-hint', text: t.hintSurge }),
      el('div', { class: 'tp-seg' }, seg.on, seg.off, el('kbd', { text: 'K' })),
      explain,
      el('label', { class: 'tp-slider' }, el('span', { text: t.fill }), slider, sliderVal),
      el('div', { class: 'tp-driverow' }, drive, el('div', { class: 'tp-speed' }, speed, status)),
      el('div', { class: 'tp-sub', text: t.shift }),
      el('div', { class: 'tp-live' }, live, liveVal),
      el('div', { class: 'tp-sub', text: t.peak }),
      ...rows.map((r) => r.row),
      verdict,
      el('p', { class: 'tp-note', text: t.surgeNote }),
    );
    const cm = (m) => `${f.format(Math.round(m * 100))} cm`;
    sync.push(() => {
      seg.on.classList.toggle('on', s.bulkheads);
      seg.off.classList.toggle('on', !s.bulkheads);
      set(explain, s.bulkheads ? t.separated : t.mixed);
      explain.classList.toggle('bad', !s.bulkheads);
      if (document.activeElement !== slider) slider.value = String(Math.round(s.surgeFill * 100));
      set(sliderVal, `${Math.round(s.surgeFill * 100)}%`);
      const stopped = s.cmd === 'stop';
      set(drive.firstChild, stopped ? t.go : t.brake);
      drive.classList.toggle('brake', !stopped);
      drive.disabled = s.cmd === 'brake';
      set(speed, `${Math.round(s.v * 3.6)} ${t.kmh}`);
      set(status, t.status[s.cmd] || '');
      const scale = Math.max(0.6, s.peak.with, s.peak.without);
      const frac = Math.min(1, Math.abs(s.shift) / scale);
      live.firstChild.style.width = `${frac * 50}%`;
      live.firstChild.style[s.shift >= 0 ? 'right' : 'left'] = '50%';
      live.firstChild.style[s.shift >= 0 ? 'left' : 'right'] = 'auto';
      set(liveVal, `${cm(Math.abs(s.shift))} ${Math.abs(s.shift) < 0.005 ? '' : s.shift > 0 ? t.forward : t.backward}`.trim());
      for (const r of rows) {
        r.bar.style.width = `${Math.min(1, s.peak[r.k] / scale) * 100}%`;
        set(r.val, s.peak[r.k] > 0.004 ? cm(s.peak[r.k]) : '–');
        r.row.classList.toggle('on', (r.k === 'with') === s.bulkheads);
      }
      const both = s.peak.with > 0.004 && s.peak.without > 0.004;
      set(verdict, both ? t.verdict.replace('{n}', f.format(Math.max(1, Math.round(s.peak.without / s.peak.with)))) : t.verdictHint);
      verdict.classList.toggle('done', both);
    });
  }

  let lastAt = 0, lastVersion = -1;
  return {
    root,
    update(force = false) {
      const now = performance.now();
      const live = mode === 'surge';
      if (!force && lastVersion === s.version && !(live && now - lastAt > 80)) return;
      lastAt = now;
      lastVersion = s.version;
      for (const fn of sync) fn();
    },
  };
}

// Penanda HTML terproyeksi di atas truk 3D.
export function createTruckTags(root, { truck, onPart, onComp }) {
  const v = new THREE.Vector3();
  const s = truck.state;
  const parts = PARTS.map((p, i) => {
    const label = el('span');
    const b = el('button', { type: 'button', class: 'tt-hot', onClick: () => onPart(p.key) }, el('i', { text: String(i + 1) }), label);
    root.append(b);
    return { key: p.key, b, label };
  });
  const comps = s.comps.map((_, i) => {
    const dot = el('i'), no = el('u'), name = el('b'), vol = el('span');
    const b = el('button', { type: 'button', class: 'tt-comp', onClick: () => onComp(i) }, el('em', {}, dot, no), name, vol);
    root.append(b);
    return { b, dot, no, name, vol };
  });
  const comLabel = el('b');
  const com = el('div', { class: 'tt-com' }, comLabel);
  root.append(com);
  const place = (node, world, camera, w, h) => {
    v.copy(world).project(camera);
    const ok = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
    node.classList.toggle('show', ok);
    if (ok) node.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px,${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
    return ok;
  };
  const hide = (node) => node.classList.remove('show');
  const tmp = new THREE.Vector3();
  return {
    update({ camera, w, h, content, lang, products }) {
      const mode = s.mode, t = content.truck, f = nf(lang);
      root.hidden = !mode;
      if (!mode) return;
      for (const p of parts) {
        if (mode !== 'parts') {
          hide(p.b);
          continue;
        }
        place(p.b, truck.partAnchor(p.key, tmp), camera, w, h);
        p.b.classList.toggle('back', !truck.partFacing(p.key, camera.position));
        p.b.classList.toggle('on', s.part === p.key);
        set(p.label, t.parts[p.key][0]);
      }
      comps.forEach((c, i) => {
        if (mode !== 'load') return hide(c.b);
        place(c.b, truck.compAnchor(i, tmp), camera, w, h);
        const comp = s.comps[i], p = products[comp.product], has = p && comp.litres > 0;
        c.b.classList.toggle('on', i === s.selected);
        c.dot.style.background = has ? p.color : 'transparent';
        set(c.no, `${t.compShort}${i + 1}`);
        set(c.name, has ? p.name : t.empty);
        set(c.vol, has ? `${f.format(comp.litres)} L` : '');
      });
      if (mode === 'surge') {
        place(com, truck.comAnchor(tmp), camera, w, h);
        const cmShift = Math.round(s.shift * 100);
        set(comLabel, `${t.com} ${cmShift > 0 ? '+' : cmShift < 0 ? '−' : ''}${f.format(Math.abs(cmShift))} cm`);
      } else hide(com);
    },
  };
}
