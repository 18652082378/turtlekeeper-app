const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');const ctx={};vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('function forumComposerViewportState('),app.indexOf('function syncMobileKeyboardUI(')),ctx);
const cases=[
 [844,{height:844,offsetTop:0},false,844,0,false],
 [844,{height:510,offsetTop:0},true,844,334,true],
 [844,{height:480,offsetTop:50},true,844,314,true],
 [510,{height:510,offsetTop:0},true,844,0,true],
 [844,{height:844,offsetTop:0},true,844,0,false],
 [844,{height:510,offsetTop:0},false,844,334,true],
 [844,{height:844,offsetTop:0},false,844,0,false]
];
for(const [layout,viewport,focus,baseline,bottom,open] of cases){const result=ctx.forumComposerViewportState(layout,viewport,focus,baseline);assert.equal(result.bottom,bottom);assert.equal(result.keyboardOpen,open);}
const detail=app.slice(app.indexOf('function pageCommunityPostDetail('),app.indexOf('function communityNotificationCopy('));assert.ok(detail.indexOf('</main>')<detail.indexOf('forum-reply-composer'));
console.log('Reply dock checks passed: closed keyboard, overlay keyboard, viewport pan, native resize, hardware keyboard, keyboard dismissal, composer outside animated content.');
