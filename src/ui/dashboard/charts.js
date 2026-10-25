// Grafik garis kanvas sederhana, satu seri per grafik, dengan crosshair dan tooltip saat hover.
// Warna tervalidasi untuk permukaan putih (mode terang): L 0,43–0,77, kontras >= 3:1, aman CVD.
export const CHART_COLORS = { queue: '#0067B3', holding: '#E31E2D', committed: '#4E7A12', exited: '#F07C00' };

export function createLineChart(canvas, { color = '#3987e5', formatX = (x) => String(x), formatY = (y) => String(y), horizonX = null, stepped = false } = {}) {
  const ctx = canvas.getContext('2d');
  let data = []; // [{x, y}]
  let hover = null;
  const pad = { l: 36, r: 10, t: 8, b: 18 };

  function size() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 110;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function draw() {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    if (!data.length) return;
    const xmax = Math.max(horizonX || 0, data[data.length - 1].x, 1);
    const ymaxRaw = Math.max(1, ...data.map((d) => d.y));
    const ymax = niceCeil(ymaxRaw);
    const X = (x) => pad.l + (x / xmax) * iw;
    const Y = (y) => pad.t + ih - (y / ymax) * ih;
    // grid resesif
    ctx.strokeStyle = '#E3E9EF';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#5C6B66';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 2; i++) {
      const y = pad.t + (ih * i) / 2;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.fillText(formatY(ymax - (ymax * i) / 2), pad.l - 4, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
      const x = pad.l + (iw * i) / 4;
      ctx.fillText(formatX((xmax * i) / 4), x, h - pad.b + 4);
    }
    if (horizonX && horizonX < xmax) {
      ctx.strokeStyle = '#8A949E';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(X(horizonX), pad.t);
      ctx.lineTo(X(horizonX), pad.t + ih);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // garis seri 2px
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = X(d.x), y = Y(d.y);
      if (i === 0) ctx.moveTo(x, y);
      else if (stepped) {
        ctx.lineTo(x, Y(data[i - 1].y));
        ctx.lineTo(x, y);
      } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // hover
    if (hover) {
      const d = nearest(hover.x, X);
      if (d) {
        const x = X(d.x), y = Y(d.y);
        ctx.strokeStyle = '#8A949E';
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + ih);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        const label = `${formatX(d.x)} · ${formatY(d.y)}`;
        ctx.font = '11px system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 10;
        const tx = Math.min(w - pad.r - tw, Math.max(pad.l, x - tw / 2));
        ctx.fillStyle = 'rgba(19,38,28,0.92)';
        ctx.fillRect(tx, pad.t, tw, 18);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, tx + 5, pad.t + 9);
      }
    }
  }

  function nearest(px, X) {
    let best = null, bd = Infinity;
    for (const d of data) {
      const dx = Math.abs(X(d.x) - px);
      if (dx < bd) {
        bd = dx;
        best = d;
      }
    }
    return bd < 24 ? best : null;
  }

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    hover = { x: e.clientX - r.left };
    draw();
  });
  canvas.addEventListener('mouseleave', () => {
    hover = null;
    draw();
  });

  return {
    update(points) {
      data = points;
      draw();
    },
    setHorizon(x) {
      horizonX = x;
    },
    redraw: draw,
  };
}

function niceCeil(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return n * p;
}
