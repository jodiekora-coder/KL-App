// KL App: fill the routine steps from a photo (or pasted text) of a product list.
// The photo is read ON THIS iPAD by Tesseract (files in this folder). Nothing is uploaded anywhere,
// and nothing read from the photo is stored: it only fills the form for you to check.
(function(){
'use strict';
const API=()=>window.KL_ROUTINE_API;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------- text matching (pure, testable) ----------
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[’']/g,'').replace(/[^a-z0-9+]+/g,' ').trim();
const toks=s=>norm(s).split(' ').filter(t=>t.length>1||/\d/.test(t));
function lev(a,b){if(a===b)return 0;const m=a.length,n=b.length;if(!m||!n)return m||n;let p=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
// OCR often confuses these; compare a "squashed" form as well
const squash=t=>t.replace(/0/g,'o').replace(/[1l|]/g,'i').replace(/5/g,'s').replace(/rn/g,'m');
function same(pt,tt){if(pt===tt)return true;if(/^\d+$/.test(pt)||/^\d+$/.test(tt))return pt===tt||(pt.length>=3&&squash(pt)===squash(tt));
  if(squash(pt)===squash(tt))return true;if(pt.length<4)return false;const d=lev(pt,tt);return d<=(pt.length>=8?2:1)}
const FILLER=new Set(['the','and','of','for','with','in','a','an','to','by','ml','g','oz']);
function scoreProduct(p,lineToks){const pt=toks(p.name).filter(t=>!FILLER.has(t));if(!pt.length)return 0;let hit=0;const flat=lineToks.join('');
  for(const t of pt)if(lineToks.some(x=>same(t,x))||(t.length>=3&&flat.includes(t)))hit++;
  if(hit<Math.min(2,pt.length))return 0;return hit/pt.length+hit*0.01}

const RX=/\b(rx|prescri\w*|tretinoin|retin ?a|adapalene|differin|epiduo|treclin|azelaic|skinoren|finacea|metronidazole|rozex|ivermectin|soolantra|clindamycin|dalacin|duac|hydroquinone|isotretinoin|roaccutane|spironolactone|benzoyl|doxycycline|lymecycline|tri ?luma)\b/;
const STEP_RULES=[
 ['Oil cleanse',/\b(cleansing oil|cleansing balm|oil cleans\w*|first cleanse|balm cleans\w*|micellar)\b/],
 ['SPF',/\b(spf\s?\d*|sun ?screen|sun ?cream|sun ?block|sun serum|sun stick|sun|uv)\b/],
 ['Mask',/\b(mask|masque|sleeping pack|sheet mask)\b/],
 ['Eye cream',/\b(eye)\b/],
 ['Exfoliate',/\b(exfoliat\w*|aha|bha|pha|peel\w*|glycolic|salicylic|lactic|mandelic)\b/],
 ['Cleanse',/\b(cleanser|cleansing|cleanse|face ?wash|wash|foam|foaming)\b/],
 ['Toner',/\b(toner|toning|toner pads?|pads?|mist)\b/],
 ['Essence',/\b(essence|first treatment)\b/],
 ['Serum',/\b(serum|ampoule|ampule|booster|concentrate|drops)\b/],
 ['Moisturise',/\b(cream|moistur\w*|lotion|emulsion|gel cream|creme|barrier)\b/]];
function guessStep(text){const n=norm(text);for(const [name,re] of STEP_RULES)if(re.test(n))return name;return ''}
const BOTH=/\b(am ?(and|&|\+|\/)? ?pm|morning (and|&) (evening|night)|twice (a )?da(y|ily)|both)\b/;
function timeMarker(line){const n=norm(line).replace(/\b(routine|skincare|skin|care|step|steps|your|my|the|in|use|time)\b/g,' ').replace(/\s+/g,' ').trim();
  if(BOTH.test(norm(line)))return 'both';
  const am=/\b(am|morning|day|daytime|a m)\b/.test(n),pm=/\b(pm|evening|night|nightime|nighttime|bedtime|p m)\b/.test(n);
  if(am&&!pm)return 'am';if(pm&&!am)return 'pm';return ''}
function isHeader(line){const n=norm(line).replace(/\b(routine|skincare|skin|care|steps?|your|my|the|in|use|time|only)\b/g,' ').replace(/\s+/g,' ').trim();
  return /^(am|pm|morning|evening|night|night ?time|bedtime|daytime|day|a m|p m|am pm|morning and evening)$/.test(n)}
const STEPLABEL=/^\s*(oil cleanse|double cleanse|first cleanse|second cleanse|cleanse|cleanser|toner|essence|serum|treat|treatment|eye cream|moisturiser|moisturizer|moisturise|moisturize|spf|sunscreen|mask|exfoliate|exfoliant)\s*[:\-–—]\s*/i;
function cleanLine(l){return String(l).replace(/^[\s•·*\-–—>▪●○◦☐☑✓✔]+/,'').replace(/^\(?\d{1,2}[.)\]:]\s*/,'').replace(/^step\s*\d+\s*[:.\-–]?\s*/i,'').replace(/\s+/g,' ').trim()}
function stepFromLabel(lbl){const l=lbl.toLowerCase();if(/oil|double|first/.test(l))return 'Oil cleanse';if(/cleans/.test(l))return 'Cleanse';if(/toner/.test(l))return 'Toner';if(/essence/.test(l))return 'Essence';
  if(/serum/.test(l))return 'Serum';if(/treat/.test(l))return 'Treat';if(/eye/.test(l))return 'Eye cream';if(/moist/.test(l))return 'Moisturise';if(/spf|sun/.test(l))return 'SPF';if(/mask/.test(l))return 'Mask';if(/exfol/.test(l))return 'Exfoliate';return ''}
function shortOf(name){const w=String(name||'').split(' ');return w.length>3?w.slice(0,2).join(' '):name}
const RX_STEP={kind:'rx',title:'Treat',product:'Your prescribed treatment',short:'Prescribed step',how:'As we discussed at your consultation. Full directions are in your written plan.'};

function parse(text,products){
  const raw=String(text||'').split(/\r?\n/).map(cleanLine).filter(l=>l.length>1);
  const out=[];let section='';let sawSection=false;const used=new Set();
  const add=(st,time)=>{const times=time==='both'?['am','pm']:[time||''];for(const t of times)out.push({...st,time:t})};
  for(let i=0;i<raw.length;i++){if(used.has(i))continue;let line=raw[i];
    if(isHeader(line)){section=timeMarker(line)||section;sawSection=true;used.add(i);continue}
    let mark=timeMarker(line);
    // "AM: COSRX cleanser" style prefix also starts a section
    const pre=line.match(/^\s*(am|pm|morning|evening|night)\s*[:\-–—]\s*/i);if(pre){section=timeMarker(pre[1]);sawSection=true;line=line.slice(pre[0].length);mark=''}
    let label='';const lm=line.match(STEPLABEL);if(lm){label=stepFromLabel(lm[1]);line=line.slice(lm[0].length)}
    const time=mark||section;
    if(RX.test(norm(line))){add({...RX_STEP,conf:'rx',src:raw[i]},time);used.add(i);continue}
    // try this line, then this line joined with the next (names often wrap)
    const bestFor=txt=>{const lt=toks(txt);let b=null,bsc=0;for(const p of products){const s=scoreProduct(p,lt);if(s>=0.6&&(s>bsc||(s===bsc&&b&&p.name.length>b.name.length))){b=p;bsc=s}}return [b,bsc]};
    let [best,bs]=bestFor(line),span=1;
    if(i+1<raw.length&&!isHeader(raw[i+1])&&!used.has(i+1)){const [b2,s2]=bestFor(line+' '+raw[i+1]);
      // only join with the next line if that clearly improves the match (and the next line isn't its own product)
      if(b2&&s2>bs+0.15&&!bestFor(raw[i+1])[0]){best=b2;bs=s2;span=2}}
    // brand + type: "Biodance mask" -> the one Biodance mask in the list
    if(!best){const lt=toks(line),g=label||guessStep(line);if(g&&lt.length){const brandHit=products.filter(p=>{const b=toks(p.name)[0];return b&&b.length>=3&&lt.some(x=>same(b,x))&&guessStep(p.name)===g});
      if(brandHit.length===1){best=brandHit[0];bs=0.7}}}
    if(best){used.add(i);if(span===2)used.add(i+1);
      add({kind:'new',title:label||guessStep(best.name+' '+line)||'',product:best.name,short:best.short||shortOf(best.name),how:best.how||'',img:best.id||null,conf:bs>=0.95?'match':'close',src:raw[i]},time);continue}
    const g=label||guessStep(line);const words=toks(line).length;
    if(g&&words>=2&&line.length<=80){used.add(i);const nm=line.replace(/\s*[\-–—:]\s*$/,'').trim();
      add({kind:'new',title:g,product:nm,short:shortOf(nm),how:'',img:null,conf:'new',src:raw[i]},time)}}
  // no headings at all: best guess, SPF in the morning, masks/exfoliants/prescribed at night
  for(const s of out)if(!s.time){s.time=(s.title==='Mask'||s.title==='Exfoliate'||s.kind==='rx')?'pm':'am';s.guessTime=true}
  for(const s of out){if(!s.title)s.title='Step';delete s.src}
  return {steps:out,sawSection}}

window.KLFill={parse,guessStep,norm};

// ---------- reading the photo on the iPad ----------
let workerP=null;
const abs=p=>new URL(p,document.baseURI).href;
function loadScript(src){return new Promise((res,rej)=>{if(window.Tesseract)return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('script'));document.head.appendChild(s)})}
async function getWorker(onProgress){if(!workerP){workerP=(async()=>{await loadScript(abs('ocr/tesseract.min.js'));
    const w=await Tesseract.createWorker('eng',1,{workerPath:abs('ocr/worker.min.js'),corePath:abs('ocr/'),langPath:abs('ocr/'),gzip:true,
      logger:m=>{if(window.__klOcrProgress)window.__klOcrProgress(m)}});
    try{await w.setParameters({preserve_interword_spaces:'1'})}catch(e){}return w})();workerP.catch(()=>{workerP=null})}
  window.__klOcrProgress=onProgress;return workerP}
async function prepImage(file){let src;try{src=await createImageBitmap(file)}catch(e){src=await new Promise((res,rej)=>{const u=URL.createObjectURL(file);const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(e);im.src=u})}
  const W=src.width,H=src.height,long=Math.max(W,H);let k=1;if(long>2600)k=2600/long;else if(long<1500)k=1500/long;
  const c=document.createElement('canvas');c.width=Math.round(W*k);c.height=Math.round(H*k);const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(src,0,0,c.width,c.height);
  // greyscale with a little extra contrast helps on glossy labels and screenshots
  const d=g.getImageData(0,0,c.width,c.height),p=d.data;for(let i=0;i<p.length;i+=4){let y=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2];y=Math.max(0,Math.min(255,(y-128)*1.25+128));p[i]=p[i+1]=p[i+2]=y}
  g.putImageData(d,0,0);try{src.close&&src.close()}catch(e){}return c}
async function readPhoto(file,onProgress){const w=await getWorker(onProgress);const c=await prepImage(file);const r=await w.recognize(c);return (r&&r.data&&r.data.text)||''}
window.KLFill.readPhoto=readPhoto;

// ---------- KL product cards (cream card, gold frame, photo on top, text below) ----------
async function loadCanvas(file,maxLong){let src;try{src=await createImageBitmap(file)}catch(e){src=await new Promise((res,rej)=>{const u=URL.createObjectURL(file);const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(e);im.src=u})}
  const k=Math.min(1,maxLong/Math.max(src.width,src.height));const c=document.createElement('canvas');c.width=Math.round(src.width*k);c.height=Math.round(src.height*k);
  c.getContext('2d').drawImage(src,0,0,c.width,c.height);try{src.close&&src.close()}catch(e){}return c}
const near=(p,i,r,g,b,t)=>Math.abs(p[i]-r)<=t&&Math.abs(p[i+1]-g)<=t&&Math.abs(p[i+2]-b)<=t;
function isCard(c){const r=c.width/c.height;if(r<0.76||r>0.84)return false;const g=c.getContext('2d');const px=(x,y)=>g.getImageData(Math.round(x*c.width),Math.round(y*c.height),1,1).data;
  const cream=[[.005,.005],[.995,.005],[.005,.995],[.995,.995],[.5,.01]].every(([x,y])=>near(px(x,y),0,255,251,242,14));
  const fx=24.5/1080;const gold=[.3,.5,.7].filter(y=>{const d=px(fx,y);return d[0]>225&&d[1]>165&&d[1]<225&&d[2]<120}).length>=2;
  return cream&&gold}
function cardThumb(c){const W=c.width,H=c.height,x0=Math.round(.12*W),y0=Math.round(.045*H),w=Math.round(.76*W),h=Math.round(.54*H);
  const g=c.getContext('2d'),d=g.getImageData(x0,y0,w,h),p=d.data;let a=w,b=h,e=0,f=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!near(p,i,255,251,242,16)){if(x<a)a=x;if(x>e)e=x;if(y<b)b=y;if(y>f)f=y}}
  if(e<=a||f<=b)return null;
  // make the cream left in the rounded corners see-through
  const seen=new Uint8Array(w*h),q=[];for(let x=a;x<=e;x++)q.push(x,b,x,f);for(let y=b;y<=f;y++)q.push(a,y,e,y);
  while(q.length){const y=q.pop(),x=q.pop();if(x<a||x>e||y<b||y>f)continue;const n=y*w+x;if(seen[n])continue;seen[n]=1;const i=n*4;if(!near(p,i,255,251,242,22))continue;p[i+3]=0;q.push(x+1,y,x-1,y,x,y+1,x,y-1)}
  g.putImageData(d,x0,y0);const o=document.createElement('canvas');o.width=e-a+1;o.height=f-b+1;o.getContext('2d').drawImage(c,x0+a,y0+b,o.width,o.height,0,0,o.width,o.height);
  return o}
function cardTextCanvas(c){const W=c.width,H=c.height,y0=Math.round(.585*H),h=Math.round(.355*H),k=Math.max(1,1600/W);
  const o=document.createElement('canvas');o.width=Math.round(W*k);o.height=Math.round(h*k);const g=o.getContext('2d');g.drawImage(c,0,y0,W,h,0,0,o.width,o.height);
  const d=g.getImageData(0,0,o.width,o.height),p=d.data;for(let i=0;i<p.length;i+=4){const y=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2];const v=y>200?255:Math.max(0,(y-40)*1.1);p[i]=p[i+1]=p[i+2]=v}g.putImageData(d,0,0);return o}
const BRANDS=['Biologique Recherche','Obagi Medical','Obagi','numbuzin','COSRX','haruharu wonder','haruharu','Round Lab','Torriden','Beauty of Joseon','Ma:nyo','Biodance','Laneige','SKIN1004','Anua','Aestura','Medik8','La Roche-Posay','Heliocare','SkinCeuticals','Dr.Jart+','Isntree','Mixsoon','Abib','Skin1004','Purito','Axis-Y','Some By Mi','Innisfree','Klairs','Illiyoon','Bioderma','Avene','CeraVe','Neostrata','ZO Skin Health'];
const CARD_STEP=[['Oil cleanse',/^(oil|double|first) ?cleanse/],['Cleanse',/^cleans/],['Exfoliate',/^exfol/],['Toner',/^ton/],['Essence',/^essence/],['Serum',/^serum/],['Eye cream',/^eye/],['Moisturise',/^moisturi[sz]/],['SPF',/^(protect|spf|sun)/],['Mask',/^mask/],['Treat',/^treat/]];
function cardTime(t){t=norm(t);const am=/\b(am|morning|day)\b/.test(t),pm=/\b(pm|evening|night)\b/.test(t);
  if(/week/.test(t))return 'pm';if(am&&pm)return /\bor\b/.test(t)?'am':'both';if(pm)return 'pm';return 'am'}
function howFrom(desc){const ss=String(desc||'').replace(/\s+/g,' ').trim().split(/(?<=\.)\s+/).filter(Boolean);
  const use=ss.find(x=>/\b(appl|swept|sweep|pat|patted|massag|press|smooth|last step|first step|after|before|leave|left on|rinse)\w*/i.test(x));return (use||ss[0]||'').trim()}
function parseCard(text,products){const L=String(text||'').split(/\r?\n/).map(x=>x.replace(/[|_~]+/g,' ').replace(/\s+/g,' ').trim()).filter(x=>x.length>1&&!/kora\s*lawler/i.test(x));
  let si=-1,title='',time='am';for(let i=0;i<L.length;i++){const n=norm(L[i]);const m=CARD_STEP.find(([,re])=>re.test(n));if(m){si=i;title=m[0];time=cardTime(L[i].replace(/^[^·•\-.:]*[·•\-.:]/,'')+' '+n.replace(/^\S+/,''));break}}
  const rest=L.slice(si+1);if(!rest.length)return null;
  let bi=rest.findIndex(x=>BRANDS.some(b=>norm(x)===norm(b)||(norm(x).length<=norm(b).length+3&&same(norm(b).replace(/ /g,''),norm(x).replace(/ /g,'')))));
  if(bi<1)bi=1;const name=rest.slice(0,bi).join(' ').trim(),brand=(rest[bi]||'').trim(),desc=rest.slice(bi+1).join(' ');
  if(!name)return null;
  const lt=toks(name+' '+brand);let best=null,bs=0;for(const p of products){const sc=scoreProduct(p,lt);if(sc>bs){bs=sc;best=p}}
  if(best&&bs>=0.75)return {title:best.step||title||guessStep(best.name),time,product:best.name,short:best.short||shortOf(best.name),how:best.how||howFrom(desc),conf:'match',img:best.id||null};
  const full=brand&&!norm(name).startsWith(norm(brand))?brand+' '+name:name;
  return {title:title||guessStep(name),time,product:full,short:name.split(' ').length<=3?name:shortOf(name),how:howFrom(desc),conf:'card'}}
async function readCard(file,onProgress){const c=await loadCanvas(file,1400);if(!isCard(c))return null;
  const w=await getWorker(onProgress);const r=await w.recognize(cardTextCanvas(c));const text=(r&&r.data&&r.data.text)||'';
  const info=parseCard(text,(API()&&API().products())||[]);if(!info)return null;const th=cardThumb(c);return {...info,thumb:th,text}}
Object.assign(window.KLFill,{readCard,parseCard,isCard,loadCanvas});
const ORDER=['Oil cleanse','Cleanse','Exfoliate','Toner','Essence','Serum','Treat','Eye cream','Moisturise','SPF','Mask'];

// ---------- review dialog ----------
let rows=[];
function dlg(){let d=$('#fill');if(d)return d;d=document.createElement('dialog');d.id='fill';d.setAttribute('aria-labelledby','fill-h');
  d.innerHTML=`<div class="sect-h"><h3 id="fill-h">Fill steps from a photo</h3><button class="icon" id="fill-x" aria-label="Close">✕</button></div>
  <p class="hint" id="fill-msg" style="margin:8px 0 10px">The photo is read on this iPad. It isn’t uploaded or saved anywhere.</p>
  <div class="bar" id="fill-bar" hidden><i></i></div>
  <div id="fill-rows" class="fill-rows"></div>
  <details id="fill-raw" style="margin-top:12px"><summary class="hint" style="cursor:pointer">See or fix the text it read (or paste your own list)</summary>
    <textarea id="fill-text" rows="7" style="width:100%;margin-top:8px" placeholder="Morning&#10;COSRX Snail Mucin Gel Cleanser&#10;Round Lab Dokdo Toner&#10;…&#10;Evening&#10;…"></textarea>
    <div class="tools" style="margin-top:8px"><button class="btn small" id="fill-again">Match this text again</button></div></details>
  <div class="tools" style="margin-top:14px;justify-content:flex-end"><button class="btn small" id="fill-add">Add to my steps</button><button class="btn small primary" id="fill-use">Replace my steps</button></div>`;
  document.body.appendChild(d);
  d.querySelector('#fill-x').onclick=()=>d.close();
  d.querySelector('#fill-again').onclick=()=>show(d.querySelector('#fill-text').value);
  d.querySelector('#fill-use').onclick=()=>apply(true);d.querySelector('#fill-add').onclick=()=>apply(false);
  return d}
function open(){const d=dlg();if(!d.open){if(d.showModal)d.showModal();else d.setAttribute('open','')}return d}
const BADGE={match:['Matched','ok'],close:['Close match, check','chk'],new:['Not in my list, check spelling','chk'],rx:['Prescribed, kept unnamed','ok'],card:['Read from your card, check','chk']};
function show(text,cardRows){const d=open();d.querySelector('#fill-text').value=text||'';const api=API();const {steps,sawSection}=text&&text.trim()?parse(text,api.products()):{steps:[],sawSection:true};rows=[...(cardRows||[]),...steps.map(s=>({...s,on:true}))];
  const box=d.querySelector('#fill-rows');box.innerHTML='';
  if(!rows.length){box.innerHTML=`<p class="warn">I couldn’t spot any products in that. Try a straighter, closer photo in good light, or open “See or fix the text” below and type or paste the list.</p>`;d.querySelector('#fill-msg').textContent='Nothing matched yet.';return}
  d.querySelector('#fill-msg').textContent=`Found ${rows.length} step${rows.length>1?'s':''}. Untick anything wrong, fix names, then tap Replace or Add.`+(sawSection?'':' No Morning or Evening headings were found, so check the times.');
  rows.forEach((r,i)=>{const n=document.createElement('div');n.className='fill-row';const [bt,bc]=BADGE[r.conf]||['',''];
    n.innerHTML=`<label class="fill-on"><input type="checkbox" checked aria-label="Use this step">${r.thumbURL?`<img alt="" src="${r.thumbURL}">`:''}</label>
     <div class="fill-f"><div class="tools"><div class="seg" role="group" aria-label="Time"><button data-t="am" aria-pressed="${r.time==='am'}">Morning</button><button data-t="pm" aria-pressed="${r.time==='pm'}">Evening</button></div>
       <span class="fill-b ${bc}">${bt}</span></div>
     <div class="row"><label class="f">Step<input data-k="title" list="dl-steps" value="${esc(r.title)}"></label>
       <label class="f">Product<input data-k="product" list="dl-products" value="${esc(r.product)}" ${r.kind==='rx'?'readonly':''}></label></div></div>`;
    n.querySelector('input[type=checkbox]').onchange=e=>{r.on=e.target.checked;n.classList.toggle('off',!r.on)};
    n.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{r.time=b.dataset.t;n.querySelectorAll('[data-t]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.t===r.time))});
    n.querySelectorAll('input[data-k]').forEach(inp=>inp.oninput=()=>{r[inp.dataset.k]=inp.value;if(inp.dataset.k==='product'){const p=api.products().find(x=>x.name.toLowerCase()===inp.value.trim().toLowerCase());
      if(p){r.short=p.short||shortOf(p.name);r.how=p.how||'';r.img=p.id||null;r.conf='match'}else{r.short=shortOf(inp.value);r.img=null}}});
    box.appendChild(n)})}
async function apply(replace){const api=API();const plan=api.getPlan();const pick=rows.filter(r=>r.on&&r.product.trim());if(!pick.length){$('#fill').close();return}
  const saved={};for(const r of pick)if(r.thumbData&&!r.img){const key=r.product.trim().toLowerCase();if(!saved[key])saved[key]=await api.addLib(r.product.trim(),r.short||shortOf(r.product),r.how||'',r.thumbData);r.img=saved[key]}
  const steps=pick.map(r=>{const s={time:r.time,title:r.title||'Step',kind:r.kind||'new',product:r.product.trim(),short:(r.short||shortOf(r.product)).trim(),how:r.how||''};if(r.img&&s.kind!=='rx')s.img=r.img;if(s.kind==='swap')s.now='';return s});
  if(replace)plan.steps=steps;else plan.steps.push(...steps);
  $('#fill').close();api.changed(true);api.status(`Added ${steps.length} step${steps.length>1?'s':''} from your photo${pick.length>1?'s':''}. Check each one, and fill in any how-to lines that are blank.`)}

async function fromFiles(files){const d=open();const bar=d.querySelector('#fill-bar'),msg=d.querySelector('#fill-msg');d.querySelector('#fill-rows').innerHTML='';
  bar.hidden=false;bar.querySelector('i').style.width='3%';msg.textContent=workerP?'Reading your photos…':'Getting the reader ready. The first time takes a little while (about 6 MB, then it works offline).';
  const cards=[],lists=[];
  try{for(let k=0;k<files.length;k++){msg.textContent=`Reading photo ${k+1} of ${files.length}…`;bar.querySelector('i').style.width=(5+90*k/files.length)+'%';
      const c=await readCard(files[k],()=>{});if(c)cards.push(c);else lists.push(files[k])}
    let text='';for(const f of lists)text+=(text?'\n':'')+await readPhoto(f,()=>{});
    cards.sort((a,b)=>ORDER.indexOf(a.title)-ORDER.indexOf(b.title));
    const cr=[];for(const tm of ['am','pm'])for(const c of cards)if(c.time===tm||c.time==='both'){const th=c.thumb?c.thumb.toDataURL('image/png'):null;
      cr.push({kind:'new',title:c.title,product:c.product,short:c.short,how:c.how,img:c.img||null,conf:c.conf,time:tm,on:true,thumbURL:th,thumbData:c.img?null:th})}
    bar.hidden=true;show(text,cr);
    if(cards.length)msg.textContent=`Read ${cards.length} product card${cards.length>1?'s':''}`+(lists.length?' and your list':'')+'. Cards marked “AM and PM” appear in both. Untick anything you don’t want, then tap Replace or Add.'}
  catch(e){bar.hidden=true;msg.textContent='That photo couldn’t be read. Check you’re online the first time, or open “See or fix the text” below and paste the list instead.'}}
async function fromFile(file){const d=open();const bar=d.querySelector('#fill-bar'),msg=d.querySelector('#fill-msg');d.querySelector('#fill-rows').innerHTML='';
  bar.hidden=false;bar.querySelector('i').style.width='3%';msg.textContent=workerP?'Reading the photo…':'Getting the reader ready. The first time takes a little while (about 6 MB, then it works offline).';
  try{const text=await readPhoto(file,m=>{if(!m)return;if(m.status==='recognizing text'){msg.textContent='Reading the photo…';bar.querySelector('i').style.width=(10+90*(m.progress||0))+'%'}
      else if(/load|initializ/.test(m.status||'')){bar.querySelector('i').style.width=(3+7*(m.progress||0))+'%'}});
    bar.hidden=true;show(text)}
  catch(e){bar.hidden=true;msg.textContent='That photo couldn’t be read. Check you’re online the first time, or open “See or fix the text” below and paste the list instead.';}}

function init(){const tools=document.querySelector('#add-am')&&document.querySelector('#add-am').parentElement;if(!tools||$('#fill-photo-btn'))return;
  const lab=document.createElement('label');lab.className='btn small primary';lab.id='fill-photo-btn';lab.htmlFor='fill-photo';lab.textContent='Fill from photo';lab.style.display='inline-block';
  const inp=document.createElement('input');inp.type='file';inp.id='fill-photo';inp.accept='image/*';inp.multiple=true;inp.hidden=true;
  inp.addEventListener('change',e=>{const fs=[...(e.target.files||[])];e.target.value='';if(fs.length)fromFiles(fs)});
  const paste=document.createElement('button');paste.className='btn small';paste.textContent='Paste a list';paste.onclick=()=>{const d=open();d.querySelector('#fill-rows').innerHTML='';
    d.querySelector('#fill-msg').textContent='Paste or type the products below, one per line, with Morning and Evening headings if you have them.';const r=d.querySelector('#fill-raw');r.open=true;d.querySelector('#fill-text').focus()};
  tools.prepend(lab,inp,paste);
  const st=document.createElement('style');st.textContent=`
#fill{width:min(640px,calc(100vw - 32px))}#fill textarea{font:inherit;border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--field);color:var(--ink);box-sizing:border-box}
.fill-rows{display:flex;flex-direction:column;gap:10px;max-height:52vh;overflow:auto}
.fill-row{display:grid;grid-template-columns:48px minmax(0,1fr);gap:8px;border:1px solid var(--line);border-radius:14px;padding:10px}
.fill-row.off{opacity:.45}.fill-on{display:flex;flex-direction:column;gap:6px;align-items:center;padding-top:6px}.fill-on img{width:44px;height:56px;object-fit:contain}.fill-on input{width:20px;height:20px}
.fill-f{display:flex;flex-direction:column;gap:8px}.fill-b{font:600 11px var(--sans);border-radius:999px;padding:3px 9px;background:var(--chip)}
.fill-b.chk{background:#FFC83C;color:#0B1240}`;document.head.appendChild(st)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
