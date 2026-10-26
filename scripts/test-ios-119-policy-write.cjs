'use strict';
// Exercise the actual writer against an isolated filesystem model. No chmod,
// chown, source writes or service commands are performed on the real machine.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'deploy-ios-119-policy.cjs'),'utf8').replace(/\r\n/g,'\n');
const begin=source.indexOf('function atomicWrite('),end=source.indexOf('\nconst command',begin);
assert.ok(begin>=0&&end>begin,'Find the real atomic policy writer');
const actualWriter=source.slice(begin,end),target='/fixture/server/app-update-policy.js';
const before=Buffer.from('// Original policy\n'),after=Buffer.from('// New policy\n');
function scenario({platform='linux',sameOwner=false,fault=''}={}){
  const owner={uid:1001,gid:1002},current=sameOwner?owner:{uid:2001,gid:2002};
  const files=new Map([[target,{bytes:Buffer.from(before),mode:0o644,...owner}]]),fds=new Map(),events=[];
  let sequence=0;
  const stat=row=>({mode:0o100000|row.mode,uid:row.uid,gid:row.gid});
  const descriptor=fd=>{const row=fds.get(fd);assert.ok(row&&!row.closed,'Open descriptor required');return row;};
  function fail(operation){if(fault===operation)throw Object.assign(Error('Injected '+operation+' failure'),{code:'EPERM'});}
  const model={
    statSync(file){assert.equal(file,target);assert.ok(files.has(file));events.push('stat');return stat(files.get(file));},
    openSync(file,flags,mode){assert.equal(file,target+'.policy-test-id.tmp');assert.equal(flags,'wx');assert.ok(!files.has(file));const row={bytes:Buffer.alloc(0),mode:mode&~0o077,...current};files.set(file,row);const fd=++sequence;fds.set(fd,{file,row,closed:false});events.push('open');return fd;},
    fstatSync(fd){events.push('fstat');return stat(descriptor(fd).row);},
    fchownSync(fd,uid,gid){events.push('chown');fail('chown');const row=descriptor(fd).row;row.uid=uid;row.gid=gid;},
    fchmodSync(fd,mode){events.push('chmod');fail('chmod');descriptor(fd).row.mode=mode;},
    writeFileSync(fd,bytes){events.push('write');fail('write');descriptor(fd).row.bytes=Buffer.from(bytes);},
    fsyncSync(fd){descriptor(fd);events.push('fsync');fail('fsync');},
    closeSync(fd){const row=descriptor(fd);row.closed=true;events.push('close');},
    renameSync(from,to){assert.equal(to,target);assert.ok(files.has(from));assert.ok([...fds.values()].every(row=>row.closed),'Close before replacing target');events.push('rename');files.set(to,files.get(from));files.delete(from);},
    existsSync:file=>files.has(file),
    unlinkSync(file){assert.notEqual(file,target,'Never remove the existing policy during cleanup');assert.ok(files.has(file));events.push('unlink');files.delete(file);}
  };
  const atomicWrite=vm.runInNewContext(actualWriter+'; atomicWrite',{fs:model,crypto:{randomUUID:()=> 'test-id'},process:{platform}});
  if(fault){
    assert.throws(()=>atomicWrite(target,after,0o644),new RegExp('Injected '+fault+' failure'));
    assert.deepEqual(files.get(target).bytes,before);assert.equal(files.get(target).mode,0o644);
    assert.equal(files.get(target).uid,owner.uid);assert.equal(files.get(target).gid,owner.gid);
    assert.equal(files.size,1,'Remove only the unpublished temporary file');assert.ok(events.includes('unlink'));
    assert.ok(!events.includes('rename'),'Do not publish after any pre-publication failure');
  }else{
    atomicWrite(target,after,0o644);
    const result=files.get(target);assert.deepEqual(result.bytes,after);
    assert.equal(result.mode,0o644,'Restore source mode despite the command umask of 077');
    assert.equal(files.size,1,'Only the replaced policy remains');
    assert.ok(events.includes('chmod'));assert.ok(events.indexOf('chmod')<events.indexOf('fsync'));
    assert.ok(events.indexOf('fsync')<events.indexOf('rename'));
    if(platform==='linux'){
      assert.equal(result.uid,owner.uid);assert.equal(result.gid,owner.gid);
      assert.equal(events.includes('chown'),!sameOwner);
      if(!sameOwner)assert.ok(events.indexOf('chown')<events.indexOf('chmod'),'Reapply mode after chown');
    }else assert.equal(events.includes('chown'),false,'Windows must not chown');
  }
  assert.ok([...fds.values()].every(row=>row.closed),'Close all temporary file descriptors');
}
scenario();
scenario({sameOwner:true});
scenario({platform:'win32'});
for(const fault of ['chown','chmod','write','fsync'])scenario({fault});
console.log('PASS: atomic policy writes preserve mode under umask 077 and Linux ownership, avoid Windows chown, and preserve the original plus clean temporary files after chown/chmod/write/fsync failures.');
