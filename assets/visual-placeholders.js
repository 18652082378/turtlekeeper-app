/* Local, decorative artwork. It never supplies or changes a record's photo. */
(() => {
  'use strict';
  const turtle = `<ellipse cx="32" cy="52" rx="21" ry="3" fill="#d4e4d8" stroke="none"/>
    <path d="M18 42c-8-5-11 4-6 7l9-1m25-6c8-5 11 4 6 7l-9-1" fill="#b4d2ad"/>
    <path d="M16 39c0-12 7-20 16-20s16 8 16 20c0 8-7 12-16 12s-16-4-16-12Z" fill="#a9c59b"/>
    <path d="m24 33 8-5 8 5v9l-8 5-8-5Zm-8 6 8-1m16 0 8 1M32 47v4" fill="#c9dbb5"/>
    <path d="M22 26c-2-9 2-16 10-16s12 7 10 16c-1 6-5 9-10 9s-9-3-10-9Z" fill="#c9dfb9"/>
    <ellipse cx="27" cy="23" rx="1.6" ry="2.2" fill="#315a43" stroke="none"/><ellipse cx="37" cy="23" rx="1.6" ry="2.2" fill="#315a43" stroke="none"/>
    <path d="M28 29q4 3 8 0" fill="none"/><path d="M21 44q-6-3-7 1m29-1q6-3 7 1" fill="none"/>`;
  const pool = `<rect x="10" y="18" width="44" height="34" rx="8" fill="#e1eee3"/><path d="M11 34q7-5 14 0t14 0 14 0v10q0 8-8 8H18q-8 0-8-8Z" fill="#b9d9cf"/><path d="M11 34q7-5 14 0t14 0 14 0M16 24h32" fill="none"/>`;
  const art = {
    turtle,
    pool: pool + `<ellipse cx="32" cy="40" rx="7" ry="5" fill="#aac799"/><circle cx="41" cy="39" r="3" fill="#c9dfb9"/>`,
    hatchling: pool + `<ellipse cx="26" cy="40" rx="4" ry="3" fill="#aac799"/><circle cx="32" cy="39" r="2" fill="#c9dfb9"/><ellipse cx="41" cy="44" rx="4" ry="3" fill="#aac799"/>`,
    juvenile: pool + `<ellipse cx="31" cy="40" rx="6" ry="4" fill="#aac799"/><circle cx="39" cy="39" r="2.5" fill="#c9dfb9"/>`,
    breeder: pool + `<ellipse cx="25" cy="40" rx="6" ry="4" fill="#aac799"/><circle cx="33" cy="39" r="2.5" fill="#c9dfb9"/><ellipse cx="42" cy="43" rx="5" ry="4" fill="#aac799"/>`,
    feed: `<path d="m21 13-3 8-2 29q16 7 32 0l-2-29-3-8Z" fill="#e5d8b8"/><path d="M21 13h22M19 23h26M20 46h24" fill="none"/><ellipse cx="32" cy="34" rx="8" ry="6" fill="#f7f0de"/><path d="M29 34h6m-3-3v6" fill="none"/>`,
    equipment: `<rect x="16" y="13" width="32" height="40" rx="6" fill="#d2e2dd"/><rect x="22" y="19" width="20" height="11" rx="3" fill="#f5f6e9"/><path d="M25 44v-7m7 7v-7m7 7v-7M26 10v3m12-3v3" fill="none"/>`,
    medicine: `<path d="M25 12h14v10l6 5v24H19V27l6-5Z" fill="#e3e9d9"/><rect x="23" y="9" width="18" height="7" rx="2" fill="#a9c9b5"/><rect x="23" y="30" width="18" height="16" rx="3" fill="#faf6e9"/><path d="M32 34v8m-4-4h8" fill="none"/>`,
    water: `<path d="M32 10c-4 9-17 19-17 29a17 17 0 0 0 34 0c0-10-13-20-17-29Z" fill="#c4e1db"/><path d="M23 39q0 9 9 9" fill="none"/>`,
    transport: `<path d="m12 23 20-9 20 9v26L32 57 12 49Z" fill="#e5d8b8"/><path d="m12 23 20 9 20-9M32 32v25M22 18l20 10v10" fill="none"/>`,
    receipt: `<path d="M19 10h26v46l-5-3-5 3-5-3-5 3-6-3Z" fill="#faf5e7"/><path d="M25 21h14m-14 8h14m-14 8h8m-8 8h14" fill="none"/>`,
    growth: `<path d="M15 13v37h37" fill="none"/><path d="m21 40 10-11 8 5 12-17" fill="none" stroke-width="2.6"/><circle cx="31" cy="29" r="3" fill="#bed8ac"/><circle cx="51" cy="17" r="3" fill="#bed8ac"/>`,
    nest: `<ellipse cx="32" cy="48" rx="23" ry="7" fill="#ded9bc"/><path d="M28 34c0 9-4 13-9 13S9 43 9 36c0-8 6-17 10-17s9 7 9 15Z" fill="#faf6e7"/><path d="M51 32c0 9-4 13-9 13s-10-4-10-11c0-8 6-17 10-17s9 7 9 15Z" fill="#fff9e9"/>`,
    search: `<path d="M12 17h28v29H12Z" fill="#e4ebd9"/><path d="M18 24h16m-16 6h9" fill="none"/><circle cx="38" cy="36" r="12" fill="#f4f7ec"/><path d="m47 45 9 9" fill="none" stroke-width="3"/><path d="M33 35q5-5 10 0m-9 6h8" fill="none"/>`,
    market: `<path d="M14 26h36v27H14Z" fill="#e4ebd9"/><path d="m12 26 5-13h30l5 13q-5 7-10 0-5 7-10 0-5 7-10 0-5 7-10 0Z" fill="#b6d3b7"/><path d="M25 53V36h14v17" fill="#faf6e9"/>`
  };
  function svg(kind = 'turtle') {
    const key = Object.hasOwn(art, kind) ? kind : 'turtle';
    return `<svg class="placeholder-art" data-placeholder-art="${key}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="var(--art-ink, #4c715c)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${art[key]}</svg>`;
  }
  function ledgerKind(item = {}) {
    if (item.type !== 'other') return 'turtle';
    return ({ '龟粮': 'feed', '耗材': 'equipment', '设备': 'equipment', '药品': 'medicine', '看病': 'medicine', '检测': 'medicine', '水电': 'water', '运输': 'transport' })[item.category] || 'receipt';
  }
  window.TurtleArtwork = Object.freeze({ svg, ledgerKind });
})();
