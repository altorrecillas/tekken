// usage: node shot.mjs "<path?query>" out.png [w] [h] [timeoutMs] [extraWaitMs]
import {chromium} from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root=process.env.GAME_ROOT||decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.bin':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.ttf':'font/ttf','.hdr':'application/octet-stream'};
const srv=http.createServer((q,r)=>{const p=path.join(root,decodeURIComponent(q.url.split('?')[0]));fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});r.end(d);});}).listen(0,'127.0.0.1');
await new Promise(r=>srv.on('listening',r)); const PORT=srv.address().port;
const [url,out,w='960',h='720',to='120000']=process.argv.slice(2);
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage({viewport:{width:+w,height:+h}});
const seen=new Set();
p.on('console',m=>{const t=m.type()+': '+m.text(); if(t.includes('GPU stall')||t.includes('GL Driver')||seen.has(t))return; seen.add(t); console.log(t);});
p.on('pageerror',e=>console.log('PAGEERROR: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,4).join('\n')));
p.on('requestfailed',r=>console.log('REQFAIL: '+r.url()));
p.on('response',r=>{ if(r.status()>=400) console.log('HTTP '+r.status()+' '+r.url()); });
const sep=url.includes('?')?'&':'?';
// generous load timeout: with the CPU shared (software GL, pipeline builds) the page load can exceed 30 s
await p.goto(`http://127.0.0.1:${PORT}/${url}${sep}w=${w}&h=${h}`, { timeout: 240000 });
const t0=Date.now();
try{ await p.waitForFunction('window.__ready===true',null,{timeout:+to, polling: 500}); }catch(e){ console.log('TIMEOUT waiting ready'); }
console.log('ready after', ((Date.now()-t0)/1000).toFixed(1),'s');
try { console.log('DEBUG', await p.evaluate(()=>window.__debug && window.__debug())); } catch(e) { console.log('debug err', e.message); }
await p.evaluate(()=>{ window.__stopAfterNext = true; });
// close-ups of long hair are slow in software GL: SHOT_TIMEOUT (ms) raises the limit for the last frame
const lastTo = +(process.env.SHOT_TIMEOUT || 400000);
await p.waitForFunction('window.__stopped===true || !window.__game',null,{timeout:lastTo, polling: 200}).catch(()=>console.log('no stop ack'));
await p.screenshot({path:out, timeout: lastTo});
await b.close(); srv.close();
