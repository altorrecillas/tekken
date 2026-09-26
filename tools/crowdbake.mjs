// Renders crowdlab.html headless and writes the spectator sprite atlas into the game assets.
import {chromium} from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root=decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.bin':'application/octet-stream'};
const srv=http.createServer((q,r)=>{const p=path.join(root,decodeURIComponent(q.url.split('?')[0]));fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});r.end(d);});}).listen(0,'127.0.0.1');
await new Promise(r=>srv.on('listening',r));
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:2048,height:1024}});
p.on('pageerror',e=>console.log('PAGEERROR: '+e.message));
p.on('console',m=>{ if(m.type()==='error') console.log('console: '+m.text()); });
await p.goto(`http://127.0.0.1:${srv.address().port}/crowdlab.html`);
await p.waitForFunction('window.__ready===true',null,{timeout:1500000, polling: 1000});
const url=await p.evaluate(()=>window.__atlas);
fs.writeFileSync(path.join(root,'assets/stage/crowd_atlas.png'), Buffer.from(url.split(',')[1],'base64'));
console.log('atlas written');
await b.close(); srv.close();
