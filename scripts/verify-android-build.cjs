'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),dir='android/app/src/main/assets/public';
const gradle=read('android/app/build.gradle'),version=gradle.match(/versionName\s+"([^"]+)"/)[1],build=Number(gradle.match(/versionCode\s+(\d+)/)[1]),config=read(dir+'/config.js');
assert.equal(Number(config.match(/TURTLE_APP_BUILD\s*=\s*(\d+)/)[1]),build);
assert.equal(config.match(/TURTLE_APP_VERSION\s*=\s*"([^"]+)"/)[1],version);
assert.match(config,/TURTLE_APP_PLATFORM = "android"/);
assert.match(config,/TURTLE_APP_UPDATE_CHANNEL = "(?:store|beta)"/);
assert.doesNotMatch(config,/TURTLE_APP_STORE_URL\s*=/);
assert.match(config,/TURTLE_ANDROID_PUSH_PROVIDER = "aliyun"/);
function files(folder){return fs.readdirSync(path.join(root,folder),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(folder+'/'+e.name):[folder+'/'+e.name]);}
const assets=files('assets');
for(const file of assets)assert.ok(fs.readFileSync(path.join(root,file)).equals(fs.readFileSync(path.join(root,dir,file))),'Stale/missing shared asset '+file);
const index=read(dir+'/index.html');
for(const m of index.matchAll(/(?:href|src)=["'](?:\.\/)?([^"']+)["']/g)){
 const file=m[1].split(/[?#]/)[0];if(/^(?:https?:|data:|#)/.test(file)||!file)continue;
 assert.ok(fs.existsSync(path.join(root,dir,file)),'Missing referenced asset '+file);
}
const app=read(dir+'/app.js');
for(const [start,end]of [['function skipGrowthTask(','function homeTasksMarkup(']]){
 const source=read('assets/workspace-ui.js'),bundled=read(dir+'/assets/workspace-ui.js');
 assert.equal(bundled.slice(bundled.indexOf(start),bundled.indexOf(end)),source.slice(source.indexOf(start),source.indexOf(end)));
}
assert.match(app,/Plugins\?\.TurtleAndroidPush/);
const sdk=JSON.parse(read('keys/android-push.json'));
for(const file of files(dir)) {
 const data=fs.readFileSync(path.join(root,file));
 assert.ok(!data.includes(Buffer.from(sdk.appSecret)),'SDK secret must not enter WebView assets');
}
assert.match(read(dir+'/android-runtime.js'),/backButton/);
assert.ok(read(dir+'/android-layout.css').includes('Turtle Noto Sans SC'));
assert.ok(!files(dir).some(f=>/\.(?:p8|jks|keystore)$/.test(f)),'Never bundle signing secrets');
console.log('Verified Android '+version+' ('+build+'): '+assets.length+' current shared assets, entry references, platform/channel isolation, native Aliyun push and no SDK secret in WebView assets.');
