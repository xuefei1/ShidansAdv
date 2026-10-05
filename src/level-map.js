import { WALLS, ROOMS, LANDMARKS, DEN, RAMPS, HOUSE, BOUNDS, FLOOR_HEIGHT } from './layout.js';

export function drawLevelMap(ctx, width, height, player, floor, discovered, large = false) {
  const lotWidth = BOUNDS.maxX - BOUNDS.minX, lotDepth = BOUNDS.maxZ - BOUNDS.minZ;
  const scale = Math.min((width - 28) / (lotWidth + 2), (height - 28) / (lotDepth + 2));
  const tx = x => width / 2 + (x - (BOUNDS.minX + BOUNDS.maxX) / 2) * scale;
  const tz = z => height / 2 + (z - (BOUNDS.minZ + BOUNDS.maxZ) / 2) * scale;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#e7ebd5'; ctx.fillRect(tx(BOUNDS.minX), tz(BOUNDS.minZ), lotWidth * scale, lotDepth * scale);
  ctx.strokeStyle = '#bbc49e'; ctx.lineWidth = 1; ctx.strokeRect(tx(BOUNDS.minX), tz(BOUNDS.minZ), lotWidth * scale, lotDepth * scale);
  for (const r of ROOMS.filter(r => r.floor === floor || r.id === 'yard' || r.id === 'front-yard')) {
    ctx.fillStyle = r.color; ctx.fillRect(tx(r.minX), tz(r.minZ), (r.maxX - r.minX) * scale, (r.maxZ - r.minZ) * scale);
  }
  if (floor) { ctx.fillStyle = '#eadcc966'; ctx.fillRect(tx(HOUSE.minX), tz(2), 48 * scale, 18 * scale); }
  const segment = (w, a, b, color) => {
    ctx.strokeStyle = color; ctx.beginPath();
    ctx.moveTo(tx(w.axis === 'x' ? a : w.fixed), tz(w.axis === 'x' ? w.fixed : a));
    ctx.lineTo(tx(w.axis === 'x' ? b : w.fixed), tz(w.axis === 'x' ? w.fixed : b)); ctx.stroke();
  };
  ctx.lineCap = 'butt'; ctx.lineWidth = large ? 3 : 1.8;
  for (const w of WALLS.filter(w => w.floor === floor)) {
    let cursor = w.start;
    for (const o of w.openings) {
      segment(w, cursor, o.at - o.width / 2, '#8e947f');
      if (o.kind !== 'door') segment(w, o.at - o.width / 2, o.at + o.width / 2, o.kind === 'window' ? '#69a5ae' : o.kind === 'glazed-window' ? '#acbdc3' : '#ba875f');
      cursor = o.at + o.width / 2;
    }
    segment(w, cursor, w.end, '#8e947f');
  }
  ctx.strokeStyle = '#a39778'; ctx.lineWidth = 1;
  for (const r of RAMPS) {
    ctx.strokeRect(tx(r.minX), tz(Math.min(r.startZ, r.endZ)), (r.maxX - r.minX) * scale, Math.abs(r.endZ - r.startZ) * scale);
    for (let i = 0; i <= 12; i++) {
      const z = r.startZ + (r.endZ - r.startZ) * i / 12;
      ctx.beginPath(); ctx.moveTo(tx(r.minX), tz(z)); ctx.lineTo(tx(r.maxX), tz(z)); ctx.stroke();
    }
  }
  if (!floor) {
    ctx.beginPath(); ctx.arc(tx(DEN.x), tz(DEN.z), DEN.radius * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#f4e8c3'; ctx.fill(); ctx.strokeStyle = '#fffdf1'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#7e9d66'; ctx.fillRect(tx(-20), tz(-35), 8 * scale, 4 * scale);
    ctx.fillStyle = '#bfd3a0'; ctx.fillRect(tx(-20), tz(-33.5), 8 * scale, scale);
  }
  if (large) {
    ctx.font = '12px Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#5d6d55';
    for (const r of ROOMS.filter(r => r.floor === floor)) {
      const text = { 'living': 'LOUNGE', 'foyer': 'HALL', 'kitchen': 'KITCHEN / DINING', 'hall': 'LONG HALLWAY', 'library': 'LIBRARY', 'garden-room': 'GARDEN ROOM', 'utility': 'CRAFT ROOM', 'bedroom': 'BEDROOM', 'reading': 'READING ROOM', 'study': 'STUDIO', 'gallery': 'GALLERY', 'balcony': 'BALCONY', 'yard': 'BACKYARD' }[r.id];
      ctx.fillText(r.id === 'front-yard' ? 'FRONT YARD' : text, tx((r.minX + r.maxX) / 2), tz(r.minZ + (r.id === 'yard' ? 9 : 1.8)));
    }
  }
  LANDMARKS.forEach((l, index) => {
    if ((l.y >= FLOOR_HEIGHT ? 1 : 0) !== floor) return;
    ctx.beginPath(); ctx.arc(tx(l.x), tz(l.z), large ? 9 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = discovered.has(l.id) ? '#728b55' : '#be9a56'; ctx.fill();
    if (large) { ctx.fillStyle = '#fffbed'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(discovered.has(l.id) ? '✓' : String(index + 1), tx(l.x), tz(l.z) + 4); }
  });
  if ((player.y >= FLOOR_HEIGHT - .25 ? 1 : 0) === floor) {
    ctx.save(); ctx.translate(tx(player.x), tz(player.z)); ctx.rotate(-player.facing + Math.PI);
    ctx.fillStyle = '#3d5742'; ctx.strokeStyle = '#fff7db'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(-4.5, 5); ctx.lineTo(4.5, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
}
