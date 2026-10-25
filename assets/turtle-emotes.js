(function (scope) {
  'use strict';
  // Original artwork. Tokens stay readable on older apps and use existing text APIs.
  const groups = [
    ['faces', '心情', [
      ['smile','微笑'],['pout','撇嘴'],['love-eyes','色'],['stare','发呆'],['cool','得意'],['tear','流泪'],['shy','害羞'],['zip','闭嘴'],
      ['sleep','睡'],['sob','大哭'],['awkward','尴尬'],['angry','发怒'],['tongue','调皮'],['grin','呲牙'],['surprise','惊讶'],['sad','难过'],
      ['distress','囧'],['frantic','抓狂'],['vomit','吐'],['giggle','偷笑'],['pleased','愉快'],['eye-roll','白眼'],['proud','傲慢'],['drowsy','困'],
      ['panic','惊恐'],['sweat','流汗'],['laugh','憨笑'],['relaxed','悠闲'],['fight','奋斗'],['curse','咒骂'],['question','疑问'],['shush','嘘'],
      ['dizzy','晕'],['dejected','衰'],['skull','骷髅'],['knock','敲打'],['bye','再见'],['wipe','擦汗'],['nose','抠鼻'],['clap','鼓掌'],
      ['embarrassed','糗大了'],['sly','坏笑'],['left-hmph','左哼哼'],['right-hmph','右哼哼'],['yawn','哈欠'],['disdain','鄙视'],['wronged','委屈'],['almost-cry','快哭了'],
      ['scheming','阴险'],['kiss','亲亲'],['pitiful','可怜'],['happy','笑脸'],['ill','生病'],['blush','脸红'],['joy-tears','破涕为笑'],['terrified','恐惧'],
      ['disappointed','失望'],['speechless','无语'],['hey-ha','嘿哈'],['facepalm','捂脸'],['snicker','奸笑'],['clever','机智'],['frown','皱眉'],['yeah','耶'],
      ['melon','吃瓜'],['cheer','加油'],['sweat-drop','汗'],['oh-my','天啊'],['emm','Emm'],['respect','社会社会'],['doge','旺柴'],['good','好的'],
      ['slap','打脸'],['wow','哇'],['rolling-eyes','翻白眼'],['awesome','666'],['peek','让我看看'],['sigh','叹气'],['bitter','苦涩'],['split','裂开']
    ]],
    ['gestures', '手势', [
      ['hug','拥抱'],['thumb-up','强'],['thumb-down','弱'],['handshake','握手'],['victory','胜利'],['salute','抱拳'],['come','勾引'],['fist','拳头'],['ok','OK'],['pray','合十']
    ]],
    ['objects', '心意', [
      ['lips','嘴唇'],['heart','爱心'],['broken-heart','心碎'],['beer','啤酒'],['coffee','咖啡'],['cake','蛋糕'],['rose','玫瑰'],['wilted','凋谢'],['cleaver','菜刀'],['bomb','炸弹'],['poop','便便'],['moon','月亮'],['sun','太阳'],['gift','礼物'],['pig','猪头']
    ]],
    ['celebrate', '庆祝', [
      ['party','庆祝'],['red-packet','红包'],['fortune','发'],['blessing','福'],['fireworks','烟花'],['firecracker','爆竹'],['jump','跳跳'],['shake','发抖'],['spin','转圈']
    ]]
  ];
  // A single original outline icon opens the picker; it is separate from sent emotes.
  const entryIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3.5C23.2 3.2 28.5 8.7 28.5 16S23.2 28.8 16 28.5C8.8 28.8 3.5 23.3 3.5 16S8.8 3.2 16 3.5Z"/><path d="M10 12.2v1.1m12-1.1v1.1M10.2 18.3c2.9 4.6 8.7 4.6 11.6 0M7.8 16.4l1.2.3m14-.3-1.2.3"/></svg>';
  const entries = groups.flatMap(([category, , items]) => items.map(([id, label]) => Object.freeze({ id, label, category, token: `[${label}]`, src: `./assets/emotes/${id}.svg` })));
  const byId = new Map(entries.map(item => [item.id, item])), byToken = new Map(entries.map(item => [item.token, item]));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  function parts(value) {
    return String(value ?? '').split(/(\[[^\[\]\r\n]{1,12}\])/g).filter(Boolean).map(text => ({ text, emote: byToken.get(text) || null }));
  }
  function render(value) {
    return parts(value).map(({ text, emote }) => emote
      ? `<img class="turtle-emote" src="${emote.src}" alt="${escape(emote.token)}" title="${escape(emote.label)}" width="24" height="24" draggable="false" decoding="async">`
      : escape(text)).join('');
  }
  function only(value) {
    const pieces = parts(String(value ?? '').trim()).filter(part => part.text.trim());
    return pieces.length > 0 && pieces.length <= 3 && pieces.every(part => part.emote);
  }
  function previous(value, caret) {
    const left = String(value).slice(0, caret), match = left.match(/\[[^\[\]\r\n]{1,12}\]$/);
    if (match && byToken.has(match[0])) return caret - match[0].length;
    if (typeof Intl.Segmenter === 'function') {
      const segments = Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(left));
      return segments.at(-1)?.index ?? caret;
    }
    const last = Array.from(left).at(-1); return caret - (last?.length || 0);
  }
  const api = Object.freeze({ entryIcon, entries: Object.freeze(entries), groups: Object.freeze(groups.map(([id, label]) => Object.freeze({ id, label }))), byId: id => byId.get(id), render, only, previous });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else scope.TurtleEmotes = api;
})(typeof window === 'object' ? window : globalThis);
