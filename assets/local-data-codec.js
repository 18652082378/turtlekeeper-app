(function(root) {
  const format = 'turtlekeeper-local-text-v1';
  function stringify(value) {
    const counts = new Map();
    const visit = item => {
      if (typeof item === 'string' && item.length >= 256) counts.set(item, (counts.get(item) || 0) + 1);
      else if (item && typeof item === 'object') Object.values(item).forEach(visit);
    };
    visit(value);
    const strings = [...counts].filter(([, count]) => count > 1).map(([text]) => text);
    if (!strings.length) return JSON.stringify(value);
    const indices = new Map(strings.map((text, index) => [text, index]));
    const textRefs = [];
    const encode = (item, path) => {
      if (typeof item === 'string' && indices.has(item)) {
        textRefs.push([path, indices.get(item)]);
        return null;
      }
      if (Array.isArray(item)) return item.map((entry, index) => encode(entry, [...path, index]));
      if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, encode(entry, [...path, key])]));
      return item;
    };
    const data = encode(value, []);
    return JSON.stringify({ format, strings, textRefs, data });
  }
  function parse(text) {
    const saved = JSON.parse(typeof text === 'string' ? text.replace(/^\uFEFF/, '') : text);
    if (!saved || saved.format !== format || !Array.isArray(saved.strings) || !Array.isArray(saved.textRefs)) return saved;
    let data = saved.data;
    for (const [path, index] of saved.textRefs) {
      if (!Array.isArray(path) || !Number.isInteger(index) || typeof saved.strings[index] !== 'string') throw new Error('Invalid local data reference');
      if (!path.length) { data = saved.strings[index]; continue; }
      let parent = data;
      for (const key of path.slice(0, -1)) {
        if (!parent || !Object.prototype.hasOwnProperty.call(parent, key)) throw new Error('Invalid local data path');
        parent = parent[key];
      }
      const key = path[path.length - 1];
      if (!parent || !Object.prototype.hasOwnProperty.call(parent, key) || parent[key] !== null) throw new Error('Invalid local data target');
      Object.defineProperty(parent, key, { value: saved.strings[index], writable: true, enumerable: true, configurable: true });
    }
    return data;
  }
  const api = { stringify, parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TurtleLocalData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
