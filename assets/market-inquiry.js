(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TurtleMarketInquiry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function code(listing) {
    const suffix = String(listing?.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
    return suffix ? 'KM-' + suffix : '';
  }
  function parse(value) {
    const text = String(value || '').trim();
    const exact = text.match(/^KM-([A-Z0-9]{1,6})$/i);
    if (exact) return 'KM-' + exact[1].toUpperCase();
    const labelled = [...text.matchAll(/商品咨询码\s*[:：]\s*(KM-[A-Z0-9]{1,6})(?![A-Z0-9-])/gi)];
    return labelled.length === 1 ? labelled[0][1].toUpperCase() : '';
  }
  function matches(listing, query) {
    const target = parse(query);
    return Boolean(target && code(listing) === target);
  }
  return { code, parse, matches };
});
