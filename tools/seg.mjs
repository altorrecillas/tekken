// usage: node lm2.mjs out.json img1.png img2.jpg ...  (paths relative to the current directory)
import {chromium} from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root=process.cwd();
const srv=http.createServer((q,r)=>{const p=path.join(root,decodeURIComponent(q.url.split('?')[0]));fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);return r.end();}const ext=path.extname(p);r.writeHead(200,{'Content-Type':{'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.wasm':'application/wasm','.jpg':'image/jpeg','.png':'image/png'}[ext]||'application/octet-stream'});r.end(d);});}).listen(0,'127.0.0.1');
await new Promise(r=>srv.on('listening',r)); const PORT=srv.address().port;
const b=await chromium.launch(); const p=await b.newPage();
await p.goto(`http://127.0.0.1:${PORT}/seg.html`); await p.waitForFunction('window.ready');
const [out,...files]=process.argv.slice(2);
const res=await p.evaluate(f=>window.run(f),files);
fs.writeFileSync(out,JSON.stringify(res));
for(const f in res) console.log(f,res[f].faces.length);
await b.close(); srv.close();
