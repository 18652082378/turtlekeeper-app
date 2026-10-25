'use strict';
// Deterministic original SVG drawings: no platform emoji glyphs or copied image files.
const fs = require('node:fs'), path = require('node:path');
const { entries, entryIcon } = require('../assets/turtle-emotes.js');
const root = path.resolve(__dirname, '..'), folder = path.join(root, 'assets/emotes');
const ink = '#474337', gold = '#f5bb50', mint = '#51a48b', pink = '#ed8d8a', blue = '#66b7d5';
const p = (d, fill = 'none', more = '') => `<path d="${d}" fill="${fill}" ${more}/>`;
const c = (x,y,r,fill=ink,more='') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${more}/>`;
const e = (x,y,rx,ry,fill=ink,more='') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${more}/>`;
const line = d => p(d, 'none', `stroke="${ink}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"`);
const stroke = (d, color, width=3) => p(d,'none',`stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`);
const group = (body, transform='') => `<g${transform ? ` transform="${transform}"` : ''}>${body}</g>`;
const heart = (x,y,s=1,color=pink) => group(p('M0 6C-17-9-28 9-15 20L0 33 15 20C28 9 17-9 0 6Z',color),`translate(${x} ${y}) scale(${s})`);
const star = (x,y,r=10,color=gold) => p(Array.from({length:10},(_,i)=>{const a=Math.PI*i/5-Math.PI/2,s=i%2?r*.45:r;return `${i?'L':'M'}${x+Math.cos(a)*s} ${y+Math.sin(a)*s}`;}).join('')+'Z',color);
const drop = (x,y,s=1) => group(p('M0-12C-1-6-8 2-8 7A8 8 0 0 0 8 7C8 2 1-6 0-12Z',blue)+stroke('M-4 5Q-6 10-1 11','#d5f2f5',2),`translate(${x} ${y}) scale(${s})`);
const palm = (x,y,s=1,rotation=0) => group(p('M-11 17C-18 4-21-2-16-4Q-12-6-8 4V-16Q-8-23-3-21L0-4V-23Q2-29 6-24L7-5 10-19Q14-24 17-18L14 2 18-8Q22-13 25-7L21 14Q15 32-1 29Q-8 28-11 17Z','url(#warm)',`stroke="${ink}" stroke-width="2.4"`)+stroke('M-8 5Q4 2 7 10', '#bb7f3a',2),`translate(${x} ${y}) rotate(${rotation}) scale(${s})`);
const fist = (x,y,s=1) => group(p('M-18 0Q-18-7-12-7L-6-7Q-4-12 2-10L8-9Q13-12 18-7L22 2 20 17Q13 26-3 22L-15 15Z','url(#warm)',`stroke="${ink}" stroke-width="2.5"`)+line('M-8-5V3M2-7V2M11-6V2M-11 9Q3 3 8 11'),`translate(${x} ${y}) scale(${s})`);
const thumb = (down=false) => group(p('M28 40H39L49 23Q55 11 60 19L58 36H73Q82 36 79 45L73 68Q72 74 63 74H41L28 67Z','url(#warm)',`stroke="${ink}" stroke-width="2.8"`)+p('M15 39H31V75H15Z',mint)+stroke('M40 42V65','#c2833e',2),down?'translate(96 96) rotate(180)':'');
const head = color => p('M48 11C72 10 85 26 84 49C83 73 68 85 46 84C23 84 10 69 11 46C12 24 25 11 48 11Z',color||'url(#warm)')+p('M23 29Q31 17 45 18','none','stroke="#fff6d5" stroke-width="4" stroke-linecap="round" opacity=".65"')+e(25,57,8,4,pink,'opacity=".3"')+e(71,57,8,4,pink,'opacity=".3"');
const eyes = (type='normal') => {
  if(type==='happy') return line('M27 43Q33 34 39 43M57 43Q63 34 69 43');
  if(type==='closed') return line('M27 43L39 44M57 44L69 43');
  if(type==='sad') return line('M27 37Q32 42 39 35M57 35Q64 42 69 37')+e(33,47,3,5)+e(63,47,3,5);
  if(type==='angry') return line('M25 31L40 37M56 37L71 31')+e(34,45,3,5)+e(62,45,3,5);
  if(type==='wide') return e(32,42,10,13,'#fffdf1')+e(64,42,10,13,'#fffdf1')+e(34,43,4,7)+e(62,43,4,7);
  if(type==='up') return e(32,42,10,12,'#fffdf1')+e(64,42,10,12,'#fffdf1')+e(34,34,4,5)+e(62,34,4,5);
  if(type==='side') return e(32,42,10,10,'#fffdf1')+e(64,42,10,10,'#fffdf1')+e(37,43,4,6)+e(69,43,4,6);
  if(type==='wink') return e(33,43,3.4,6)+line('M57 43Q64 38 70 43');
  return e(33,43,3.4,6)+e(63,43,3.4,6);
};
const mouths = {
  smile:()=>line('M34 60Q48 73 62 60'), sad:()=>line('M34 69Q48 57 62 69'), flat:()=>line('M35 64H61'),
  open:()=>e(48,64,8,11), grin:()=>p('M29 56Q48 63 68 56L64 70Q48 81 32 69Z','#fffdf1',`stroke="${ink}" stroke-width="2.6"`)+stroke('M31 64H65M40 61V73M50 62V75M59 61V72','#ad8c59',1.5),
  laugh:()=>p('M29 55Q48 65 68 55Q65 80 48 79Q32 78 29 55Z',ink)+e(48,73,11,5,pink),
  kiss:()=>line('M43 58L53 62 45 65 53 68 43 72'), tongue:()=>line('M31 58Q46 70 65 57')+p('M45 65H60V73Q52 83 45 73Z',pink)+stroke('M52 69V75','#bd6374',1.5)
};
function face(id) {
  let eye='normal', mouth='smile', extra='', color='';
  const set=(a,b)=>{eye=a;mouth=b;};
  switch(id) {
    case 'pout': set('normal','sad'); extra=line('M30 29L39 32'); break;
    case 'love-eyes': eye='none'; mouth='laugh'; extra=heart(32,32,.55)+heart(64,32,.55); break;
    case 'stare': set('wide','flat'); break;
    case 'cool': eye='none'; extra=p('M21 34H43L41 49Q29 57 24 45ZM53 34H75L72 45Q67 57 55 49Z',ink)+line('M43 38H53')+stroke('M27 38L34 43M59 38L66 43','#a8e2ce',2); break;
    case 'tear': set('sad','sad'); extra=drop(71,62,.7); break;
    case 'shy': set('closed','smile'); extra=e(27,56,12,8,pink)+e(70,56,12,8,pink); break;
    case 'zip': mouth='none'; extra=stroke('M30 63H66',ink,4)+line('M36 58V68M44 58V68M52 58V68M60 58V68'); break;
    case 'sleep': set('closed','open'); extra=p('M62 11H76L63 25H78','none',`stroke="${mint}" stroke-width="3"`); break;
    case 'sob': set('sad','laugh'); extra=p('M26 48H36V79L26 73ZM60 48H70V74L60 80Z',blue); break;
    case 'awkward': set('happy','grin'); extra=drop(77,37,.7); break;
    case 'angry': set('angry','sad'); color='#ef9271'; extra=stroke('M67 20V26M63 23H70','#ac5443'); break;
    case 'tongue': set('wink','tongue'); break;
    case 'grin': mouth='grin'; break;
    case 'surprise': set('wide','open'); break;
    case 'sad': set('sad','sad'); break;
    case 'distress': eye='none'; mouth='none'; extra=line('M25 38L35 32 42 39M55 39L62 32 72 39')+p('M33 56H64V75H33Z','none',`stroke="${ink}" stroke-width="3"`)+line('M35 68L47 60 62 68'); break;
    case 'frantic': set('angry','open'); extra=palm(10,53,.6,-30)+palm(81,44,.6,30)+stroke('M16 15L10 8M78 14L85 6',pink); break;
    case 'vomit': set('closed','open'); extra=p('M40 63H58V82Q49 91 35 83L42 79Z',mint); break;
    case 'giggle': set('happy','smile'); extra=palm(46,64,.55,75); break;
    case 'pleased': set('happy','smile'); extra=star(78,18,8,mint); break;
    case 'eye-roll': set('up','flat'); break;
    case 'proud': set('closed','smile'); extra=line('M22 32L37 27M57 27L72 32')+p('M43 48L51 44 54 52Z',gold); break;
    case 'drowsy': set('closed','open'); extra=palm(53,69,.5,55)+c(75,21,3,mint)+c(83,13,2,mint); break;
    case 'panic': set('wide','open'); extra=drop(14,60,.7)+drop(82,60,.7); break;
    case 'sweat': set('normal','flat'); extra=drop(77,31,.9); break;
    case 'laugh': set('happy','laugh'); break;
    case 'relaxed': set('happy','smile'); extra=p('M12 42Q48 11 84 42L76 25Q48 3 21 25Z',mint)+line('M15 41H82'); break;
    case 'fight': set('angry','grin'); extra=p('M13 23Q49 8 83 23L83 31Q48 16 13 31Z',pink)+p('M79 24L93 29 84 36Z',pink); break;
    case 'curse': set('angry','none'); extra=p('M23 51H74V71H23Z',ink)+stroke('M30 57L37 65M37 57L30 65M45 57V65M51 57H59M55 53V69M65 57V65','#fff7dc',2); break;
    case 'question': set('wide','flat'); extra=p('M71 13Q78 3 85 12Q90 19 81 23V29','none',`stroke="${mint}" stroke-width="4"`)+c(81,36,2,mint); break;
    case 'shush': set('wide','open'); extra=p('M46 85V58Q47 48 52 53L55 86Z','url(#warm)',`stroke="${ink}" stroke-width="2"`); break;
    case 'dizzy': eye='none'; mouth='open'; extra=stroke('M28 37C39 27 45 43 35 47C27 51 24 39 32 38M59 37C70 27 76 43 66 47C58 51 55 39 63 38',ink,3); break;
    case 'dejected': set('sad','flat'); color='#decda5'; extra=p('M19 9Q7 28 24 47L33 39Z',ink); break;
    case 'skull': return head('#d5ddd8')+e(31,43,11,13,ink)+e(65,43,11,13,ink)+p('M48 50L40 63H56Z',ink)+p('M29 68H67V79H29Z','#fff')+line('M39 69V79M48 69V79M57 69V79');
    case 'knock': set('closed','sad'); extra=fist(58,16,.65)+star(21,27,7,pink); break;
    case 'bye': set('happy','smile'); extra=palm(77,63,.55,20)+stroke('M86 29L92 24M87 39H94',mint,2); break;
    case 'wipe': set('closed','smile'); extra=drop(78,30,.7)+palm(27,24,.5,80); break;
    case 'nose': set('side','flat'); extra=p('M45 83V56Q46 50 51 54L54 80Z','url(#warm)',`stroke="${ink}" stroke-width="2"`); break;
    case 'clap': set('happy','laugh'); extra=palm(37,75,.5,-35)+palm(59,72,.5,35)+stroke('M34 60V54M60 60L64 54',mint,2); break;
    case 'embarrassed': set('sad','grin'); extra=drop(17,40,.65)+e(48,54,31,21,pink,'opacity=".25"'); break;
    case 'sly': set('side','grin'); extra=line('M25 29L40 35M58 35L73 29'); break;
    case 'left-hmph': set('closed','sad'); extra=drop(16,48,.45)+p('M25 52L16 57 28 59Z',gold); break;
    case 'right-hmph': set('closed','sad'); extra=drop(80,48,.45)+p('M69 52L80 57 68 59Z',gold); break;
    case 'yawn': set('sad','open'); extra=palm(60,67,.6,25); break;
    case 'disdain': set('side','flat'); extra=group(thumb(true),'translate(5 45) scale(.5)'); break;
    case 'wronged': set('sad','sad'); extra=drop(28,61,.35); break;
    case 'almost-cry': set('wide','sad'); extra=e(32,49,9,4,blue,'opacity=".7"')+e(64,49,9,4,blue,'opacity=".7"'); break;
    case 'scheming': set('side','smile'); extra=line('M26 30L42 35M55 35L71 30')+palm(44,72,.5,65); break;
    case 'kiss': set('closed','kiss'); extra=heart(78,44,.3); break;
    case 'pitiful': set('wide','sad'); extra=c(29,38,3,'white')+c(61,38,3,'white')+fist(32,79,.5)+fist(64,79,.5); break;
    case 'happy': set('happy','grin'); break;
    case 'ill': mouth='none'; extra=p('M26 53Q48 48 70 53V72Q48 81 26 72Z','#f3f7f0',`stroke="${mint}" stroke-width="2"`)+stroke('M34 58H62M34 65H62',mint,1.5)+stroke('M26 56L16 49M70 56L80 49',mint,2); break;
    case 'blush': set('wide','flat'); extra=e(26,55,10,7,pink)+e(71,55,10,7,pink); break;
    case 'joy-tears': set('happy','laugh'); extra=drop(18,61,.8)+drop(78,61,.8); break;
    case 'terrified': set('wide','open'); color='#c3d9cd'; extra=palm(13,67,.55,-25)+palm(83,65,.55,25); break;
    case 'disappointed': set('closed','sad'); extra=line('M25 30L40 33M56 33L71 30'); break;
    case 'speechless': set('closed','flat'); extra=c(76,24,2,mint)+c(83,24,2,mint)+c(90,24,2,mint); break;
    case 'hey-ha': set('wink','laugh'); extra=fist(17,72,.5)+fist(77,69,.6); break;
    case 'facepalm': set('closed','smile'); extra=palm(41,31,.9,-20); break;
    case 'snicker': set('side','laugh'); extra=line('M24 27L41 33M56 33L72 27'); break;
    case 'clever': set('side','smile'); extra=star(79,15,12,mint)+line('M25 29Q32 23 40 28'); break;
    case 'frown': set('sad','sad'); extra=line('M42 29L47 33 52 29'); break;
    case 'yeah': set('wink','grin'); extra=group(handObject('victory'),'translate(52 44) scale(.5)'); break;
    case 'melon': set('side','smile'); extra=p('M21 66H77Q49 101 21 66Z',mint)+p('M27 67H71Q49 91 27 67Z',pink)+c(41,72,2)+c(54,74,2)+c(63,70,2); break;
    case 'cheer': set('angry','smile'); extra=p('M13 23H82V31H13Z',pink)+fist(76,74,.6); break;
    case 'sweat-drop': set('closed','flat'); extra=drop(77,27,1.1)+line('M23 30H37'); break;
    case 'oh-my': set('wide','open'); extra=star(76,16,12,pink); break;
    case 'emm': set('closed','open'); extra=p('M34 53Q48 46 62 53V69H34Z', '#aa9468')+c(74,17,2,mint)+c(82,17,2,mint); break;
    case 'respect': set('side','smile'); extra=fist(30,75,.6)+palm(60,69,.6,80); break;
    case 'doge': return p('M15 34L11 6 36 21H62L85 6 82 37Q91 76 49 85Q5 81 15 34Z','url(#warm)')+p('M20 31L17 16 29 25M69 24L80 16 76 32',pink)+p('M20 58Q48 42 77 58L69 77Q47 91 25 76Z','#fff3d5')+eyes('side')+p('M41 56H55L48 64Z',ink)+line('M48 64V69Q57 76 66 67');
    case 'good': set('wink','smile'); extra=group(handObject('ok'),'translate(47 47) scale(.48)'); break;
    case 'slap': set('wide','kiss'); extra=palm(72,55,.65,65)+stroke('M16 22L21 30M8 37H18',pink); break;
    case 'wow': eye='none'; mouth='laugh'; extra=star(32,41,12,mint)+star(65,41,12,mint); break;
    case 'rolling-eyes': set('up','flat'); extra=line('M22 31H42M54 31H74'); break;
    case 'awesome': set('side','smile'); extra='<text x="48" y="21" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="900" fill="#2b8268">666</text>'; break;
    case 'peek': set('wide','flat'); extra=palm(48,20,.75,65); break;
    case 'sigh': set('closed','sad'); extra=p('M70 62Q96 53 89 67Q96 83 75 78Z','#d4dfd5'); break;
    case 'bitter': set('sad','smile'); extra=p('M25 49H34V74H25ZM62 49H71V74H62Z',blue); break;
    case 'split': set('wide','flat'); extra=stroke('M49 12L42 31 54 44 43 60 51 82','#f9f5e9',5)+line('M49 12L42 31 54 44 43 60 51 82'); break;
  }
  return head(color)+(eye==='none'?'':eyes(eye))+(mouth==='none'?'':mouths[mouth]())+extra;
}
function handObject(id) {
  switch(id) {
    case 'hug': return head('url(#cool)')+eyes('happy')+mouths.smile()+palm(19,64,.8,-55)+palm(71,63,.8,55);
    case 'thumb-up': return thumb();
    case 'thumb-down': return thumb(true);
    case 'handshake': return p('M8 31L23 24 43 36 54 32 86 49 75 72 63 79 33 68 16 53Z','url(#warm)',`stroke="${ink}" stroke-width="3"`)+p('M5 29L17 23 30 48 17 57 5 38ZM77 35L91 43 82 63 69 56Z',mint)+line('M43 36L33 47Q31 55 41 53L51 46 72 62M43 61L60 73M51 55L68 68');
    case 'victory': return p('M30 77L22 59Q15 47 24 44L34 53 29 18Q29 9 37 12L47 44 53 13Q57 4 63 11L61 51 68 47Q76 46 78 57L72 77Q51 93 30 77Z','url(#warm)',`stroke="${ink}" stroke-width="3"`)+line('M34 53Q49 43 62 58M44 60L48 70');
    case 'salute': return fist(41,51,1.4)+palm(65,48,1,-20)+p('M6 69L26 66 31 85H10ZM65 72H89V85H67Z',mint);
    case 'come': return p('M23 77V55Q23 45 32 43L42 46 42 23Q39 13 33 23L28 25Q25 9 40 10Q57 10 56 34V49L64 45Q78 44 78 61L72 79Q46 93 23 77Z','url(#warm)',`stroke="${ink}" stroke-width="3"`)+stroke('M65 16Q81 25 69 34',mint,3);
    case 'fist': return fist(45,45,1.65);
    case 'ok': return p('M31 75Q17 54 27 43Q35 33 45 42L51 51Q60 50 56 41L47 26Q44 19 51 17L63 36 58 16Q59 8 65 13L73 37 74 20Q78 13 82 20L84 57Q83 79 65 84H40Z','url(#warm)',`stroke="${ink}" stroke-width="3"`)+e(37,51,8,7,'#fff9ec',`stroke="${ink}" stroke-width="2"`);
    case 'pray': return p('M47 15Q39 9 37 20L29 53 15 71 31 85 46 65 48 35 50 65 65 85 82 71 66 53 59 20Q56 9 49 15Z','url(#warm)',`stroke="${ink}" stroke-width="3"`)+line('M48 18V61')+p('M11 68L25 74 32 86 23 91 5 76ZM69 74L84 67 92 77 73 91 64 86Z',mint);
  }
  return '';
}
function object(id) {
  switch(id) {
    case 'lips': return p('M8 50L30 31Q40 28 48 37Q56 28 67 31L89 50Q68 75 48 73Q26 75 8 50Z',pink)+p('M14 50Q48 40 82 50Q48 59 14 50Z','#963e51')+stroke('M27 58Q48 67 66 58','#f5b2a6',3);
    case 'heart': return heart(48,19,1.6);
    case 'broken-heart': return heart(48,19,1.6,'#9aa9a0')+stroke('M50 20L43 36 55 46 43 62 51 76','#fffaf0',5);
    case 'beer': return p('M19 25H63V78Q42 88 19 78Z','url(#warm)',`stroke="${ink}" stroke-width="3"`)+p('M63 37H79V64Q73 73 63 69','none',`stroke="${ink}" stroke-width="6"`)+p('M15 26Q12 15 25 15Q29 2 43 13Q58 2 66 15Q77 19 66 30L56 27Q48 39 37 28Q23 35 15 26Z','#f5fbec')+stroke('M30 39V70M47 39V70','#ffe8ac',4);
    case 'coffee': return e(45,78,35,9,'#d7e9dc')+p('M18 35H71L66 66Q46 85 23 66Z','#fffaf0',`stroke="${mint}" stroke-width="3"`)+p('M71 39H83Q92 62 66 62','none',`stroke="${mint}" stroke-width="5"`)+e(44,35,25,7,'#8a624a')+stroke('M32 25Q23 17 32 8M50 25Q41 17 50 8',mint,3);
    case 'cake': return e(48,77,36,10,mint)+p('M15 44H81V75Q49 94 15 75Z','url(#warm)')+p('M15 44Q48 22 81 44V58Q70 71 62 55Q48 70 39 55Q24 69 15 56Z','#fff8e9')+stroke('M32 40V24M48 37V20M65 40V24',pink,4)+drop(32,15,.45)+drop(48,11,.45)+drop(65,15,.45);
    case 'rose': return stroke('M49 79L48 40',mint,5)+p('M47 65Q21 60 24 45Q45 45 47 65M49 71Q72 68 76 52Q53 50 49 71Z',mint)+p('M29 31Q19 16 36 10Q48 2 58 12Q78 9 71 31Q63 47 48 47Q33 47 29 31Z',pink)+stroke('M36 17Q54 7 61 25Q43 40 35 24Q43 17 54 23','#a84e62',3);
    case 'wilted': return stroke('M40 84L46 36Q60 17 72 39',mint,5)+p('M42 65Q16 61 22 44Q41 45 42 65Z',mint)+p('M62 38L81 34 88 55Q81 72 70 61Z',pink)+p('M72 78L81 75 77 87Z',pink);
    case 'cleaver': return p('M17 16L65 25 56 68 10 48Z','#c7d7cd',`stroke="${ink}" stroke-width="3"`)+p('M58 58L84 78Q88 88 77 88L52 67Z','#8c7355')+c(24,27,3,'#f8fbef')+stroke('M14 46L55 64','#fff',4);
    case 'bomb': return c(43,58,29,ink)+e(33,46,8,4,'#7c8170','transform="rotate(-35 33 46)"')+p('M50 29L58 20 65 25 57 36Z',mint)+stroke('M62 25Q74 8 84 21','#ad8d55',4)+star(82,17,13,gold)+star(83,17,7,pink);
    case 'poop': return p('M18 73Q7 61 25 53Q13 40 34 35Q24 23 43 22Q49 18 47 10Q68 15 61 32Q82 34 72 48Q94 54 79 72Z','#b38c65')+e(48,75,34,9,'#b38c65')+e(35,52,7,9,'#fff')+e(60,52,7,9,'#fff')+c(36,54,3)+c(59,54,3)+line('M34 69Q48 77 62 68');
    case 'moon': return p('M62 12Q27 27 40 59Q49 76 73 73Q52 97 28 75Q2 46 28 21Q45 9 62 12Z','url(#warm)')+eyes('closed')+star(74,31,8,mint)+star(83,52,5,mint);
    case 'sun': return star(48,48,43,gold)+c(48,48,27,'#ffda77')+eyes('happy')+mouths.smile();
    case 'gift': return p('M17 41H79V83H17Z',mint)+p('M12 30H84V47H12Z','#78b69f')+p('M42 30H54V83H42Z',gold)+stroke('M47 30Q9 29 25 13Q40 6 47 30Q59 1 74 14Q86 32 47 30',pink,6);
    case 'pig': return p('M18 36L12 10Q32 8 38 24H60Q68 8 85 12L80 38Z',pink)+e(48,51,36,31,'#f3b2a1')+e(48,62,19,12,pink)+e(41,62,3,5,'#a66764')+e(55,62,3,5,'#a66764')+e(31,42,3,5)+e(65,42,3,5);
    case 'party': return p('M12 85L27 34 65 69Z',mint)+stroke('M19 64L44 76M24 48L58 67',gold,5)+stroke('M41 16Q27 27 43 37M63 15L56 37M79 31Q59 30 68 46',pink,4)+star(74,61,9,gold)+c(23,16,4,gold)+c(84,15,3,mint);
    case 'red-packet': return p('M18 14H78V84H18Z',pink)+p('M18 14L48 47 78 14Z','#cf6774')+c(48,56,12,gold)+p('M48 48L55 55 48 64 41 55Z', '#fff1b8');
    case 'fortune': case 'blessing': return p(id==='fortune'?'M17 9H79V87H17Z':'M48 5L91 48 48 91 5 48Z',id==='fortune'?'#e1ead8':pink)+`<text x="48" y="65" text-anchor="middle" font-size="45" font-weight="800" font-family="sans-serif" fill="${id==='fortune'?mint:'#ffe6a1'}">${id==='fortune'?'发':'福'}</text>`;
    case 'fireworks': return Array.from({length:10},(_,i)=>{const a=i*Math.PI/5,x=48+Math.cos(a)*31,y=43+Math.sin(a)*31;return stroke(`M${48+Math.cos(a)*13} ${43+Math.sin(a)*13}L${x} ${y}`,i%2?pink:gold,4)+c(x+Math.cos(a)*8,y+Math.sin(a)*8,2,mint);}).join('')+stroke('M48 64V87',mint,3);
    case 'firecracker': return group(p('M25 25H62V80H25Z',pink)+p('M25 25H62V34H25ZM25 70H62V80H25Z',gold)+stroke('M43 25V13Q57 7 62 17',ink,3)+star(66,14,12,gold)+star(66,14,5,pink),'rotate(20 48 48)');
    case 'jump': case 'shake': case 'spin': {
      const turtle=e(48,56,22,25,mint)+p('M48 37L62 46V64L48 74 34 64V46Z','#9cc39d',`stroke="#d5e3ba" stroke-width="2"`)+e(48,24,15,14,'url(#warm)')+c(43,22,2)+c(53,22,2)+line('M43 29Q48 33 53 29')+e(24,51,6,13,gold,'transform="rotate(45 24 51)"')+e(72,51,6,13,gold,'transform="rotate(-45 72 51)"')+e(33,80,7,5,gold)+e(63,80,7,5,gold);
      if(id==='jump')return turtle+stroke('M14 78L9 88M82 78L88 88M37 93H59',pink,3);
      if(id==='shake')return turtle+stroke('M12 22L7 32 12 42 7 52M84 22L89 32 84 42 89 52',pink,3);
      return group(turtle,'rotate(-18 48 48)')+stroke('M15 73Q7 87 33 90M77 13Q92 17 88 36',pink,3)+p('M28 84L36 90 25 94M83 32L88 40 94 31',pink);
    }
  }
  return '';
}
const defs='<defs><linearGradient id="warm" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="#ffe5a0"/><stop offset="1" stop-color="#edb34a"/></linearGradient><linearGradient id="cool" x2="0" y2="1"><stop stop-color="#c6e5c2"/><stop offset="1" stop-color="#78b79e"/></linearGradient></defs>';
fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(root,'assets/comment-smile-entry.svg'),entryIcon+'\n');
for(const item of entries){
  const art=item.category==='faces'?face(item.id):item.category==='gestures'?handObject(item.id):object(item.id);
  if(!art)throw Error('Missing original artwork: '+item.id);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img"><title>${item.label}</title>${defs}${art}</svg>\n`;
  fs.writeFileSync(path.join(folder,item.id+'.svg'),svg);
}
console.log(`Created ${entries.length} original turtle-friends SVG emotes.`);
