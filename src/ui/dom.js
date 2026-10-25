// Pembantu DOM ringan.
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// Panel yang dapat dilipat: { root, body, setTitle }
export function panel(title, { collapsed = false, id } = {}) {
  const chev = el('span', { class: 'chev', text: '▾' });
  const head = el('div', { class: 'ph' }, el('span', { text: title }), chev);
  const body = el('div', { class: 'pb' });
  const root = el('div', { class: 'panel' + (collapsed ? ' collapsed' : ''), id }, head, body);
  head.addEventListener('click', () => root.classList.toggle('collapsed'));
  return { root, body, head };
}

export function field(label, input) {
  return el('label', { class: 'field' }, el('span', { text: label }), input);
}

export function numberInput(value, { min, max, step = 'any', onChange, width } = {}) {
  const i = el('input', { type: 'number', value: String(value), min, max, step });
  if (width) i.style.width = width;
  if (onChange) {
    i.addEventListener('change', () => {
      const v = parseFloat(i.value);
      if (!isNaN(v)) onChange(v, i);
    });
  }
  return i;
}

export function kv(pairs) {
  const g = el('div', { class: 'kv' });
  for (const [k, v] of pairs) g.append(el('div', { class: 'k muted', text: k }), el('div', { class: 'v', text: v }));
  return g;
}

export function tile(label, value, sub) {
  return el('div', { class: 'tile' }, el('div', { class: 'l', text: label }), el('div', { class: 'v', text: value }), sub != null ? el('div', { class: 's', text: sub }) : null);
}

export function table(headers, rows, numericCols = []) {
  const t = el('table');
  t.append(el('thead', {}, el('tr', {}, ...headers.map((h, i) => el('th', { class: numericCols.includes(i) ? 'num' : '', text: h })))));
  const tb = el('tbody');
  for (const r of rows) tb.append(el('tr', {}, ...r.map((c, i) => el('td', { class: numericCols.includes(i) ? 'num' : '' }, c instanceof Node ? c : String(c)))));
  t.append(tb);
  return t;
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

// Apakah warna latar terang (teks gelap diperlukan agar kontras >= 4,5:1).
export function isLightColor(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
}
