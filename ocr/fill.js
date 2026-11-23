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
// Find a KL card inside any photo or screenshot (by its gold frame) and redraw it as a clean 1080x1350 card.
const isGold=(p,i)=>p[i]>190&&p[i+1]>140&&p[i+1]<235&&p[i+2]<160&&p[i]-p[i+2]>80;
function findCard(c){const W=c.width,H=c.height,g=c.getContext('2d');
  const row=y=>g.getImageData(0,Math.round(y),W,1).data,col=x=>g.getImageData(Math.round(x),0,1,H).data;
  const firstGold=(d,n,from,to,step)=>{for(let i=from;step>0?i<to:i>to;i+=step){if(isGold(d,i*4))return i}return -1};
  const lr=[];for(const fy of [.35,.5,.65]){const d=row(H*fy);const l=firstGold(d,W,0,Math.round(W*.45),1),r=firstGold(d,W,W-1,Math.round(W*.55),-1);if(l>=0&&r>l)lr.push([l,r])}
  const tb=[];for(const fx of [.3,.5,.7]){const d=col(W*fx);const t=firstGold(d,H,0,Math.round(H*.45),1),b=firstGold(d,H,H-1,Math.round(H*.55),-1);if(t>=0&&b>t)tb.push([t,b])}
  if(lr.length<2||tb.length<2)return null;const med=a=>a.sort((x,y)=>x-y)[a.length>>1];
  const l=med(lr.map(x=>x[0])),r=med(lr.map(x=>x[1])),t=med(tb.map(x=>x[0])),b=med(tb.map(x=>x[1]));
  const fw=r-l,fh=b-t;if(fw<200)return null;const ar=fw/fh;if(ar<0.74||ar>0.85)return null;
  // inside the frame, near its corners, should be cream
  const inner=g.getImageData(Math.round(l+fw*.03),Math.round(t+fh*.5),1,1).data;if(0.299*inner[0]+0.587*inner[1]+0.114*inner[2]<205)return null;
  const sx=fw/1031,sy=fh/1301;const o=document.createElement('canvas');o.width=1080;o.height=1350;const og=o.getContext('2d');og.fillStyle='#FFFBF2';og.fillRect(0,0,1080,1350);
  og.drawImage(c,l-24*sx,t-24*sy,1080*sx,1350*sy,0,0,1080,1350);return o}
// fingerprint of the product photo on a card: its shape plus a tiny 16x16 colour copy, to recognise our own cards without reading text
function photoBox(card){const x0=130,y0=60,w=820,h=730,d=card.getContext('2d').getImageData(x0,y0,w,h).data;let a=w,b=h,e=0,f=0;
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){if(!near(d,(y*w+x)*4,255,251,242,20)){if(x<a)a=x;if(x>e)e=x;if(y<b)b=y;if(y>f)f=y}}
  return e>a&&f>b?{x:x0+a,y:y0+b,w:e-a,h:f-b}:null}
function cardHash(card){const bx=photoBox(card);if(!bx)return '';const o=document.createElement('canvas');o.width=o.height=64;const g=o.getContext('2d');g.imageSmoothingQuality='high';
  g.drawImage(card,bx.x+bx.w*.06,bx.y+bx.h*.06,bx.w*.88,bx.h*.88,0,0,64,64);const d=g.getImageData(0,0,64,64).data;let hex=('0'+Math.min(255,Math.round(bx.w/bx.h*100)).toString(16)).slice(-2);
  for(let j=0;j<16;j++)for(let i=0;i<16;i++)for(let c=0;c<3;c++){let s=0;for(let y=0;y<4;y++)for(let x=0;x<4;x++)s+=d[((j*4+y)*64+i*4+x)*4+c];hex+=('0'+Math.round(s/16).toString(16)).slice(-2)}return hex}
function hamming(a,b){if(!a||!b||a.length!==b.length)return 999;const ar=Math.abs(parseInt(a.slice(0,2),16)-parseInt(b.slice(0,2),16));let s=0;
  for(let i=2;i<a.length;i+=2)s+=Math.abs(parseInt(a.slice(i,i+2),16)-parseInt(b.slice(i,i+2),16));return s/((a.length-2)/2)+ar*0.6}
// Our own cards (made 22 Nov 2026). name must match a product in the app's list.
const KL_CARDS=[
 {name:"Biologique Recherche Lotion P50",time:'am',hash:'2ac6c2b9c7c3b9c9c5bacbc6bbccc8bdcecbbfd0cdc1cfccc0d1cfc3d8d5cadddacfdfddd2d9d7ccc9c6bd66645e333230cbc6bbd1cbc1d3cfc4d6d2c8d9d6cbe0ddd4e2e0d8dedbd4d7d7d0d2d2cdcccbc5c8c8bfc8c5bcbdbab1aeaa9e57554fb7b0a5b5afa5b5b0a5b6b2a8b8b3abb9b6adbbb8b1bdbab3bdbdb5bebeb7bfbeb8c0c0b8c7c5bdc0bdb4b1ada1a29d8db9b1a7b6afa5b6b0a6b6b1a8b7b3abb8b6acbbb8b1bcbab3bdbdb5bfbfb7bfbfb7c1c1b9c7c5bdc4c1b8b1afa4b3ad9bbbb2a8b8b0a6b7b0a6b6b2a7b7b3aab9b6adbbb8afbdbab3bfbcb5c0bfb8c1c0bac0c0b9c1bfb5b9b29fa29c8bb2ad9cafa38baaa08ba299889d97879c96879c96889c978aa09b8da7a394a8a597a8a496a7a394b2ad9ebcb8adb1ada1b1ab9bb5ada1b6afa4b5b0a4b5b0a5b6b1a8bab6adbfbcb3bbb6aeb5b1a9b4b1a6bab7acbcb8adbfbcb0c1bdb1bab7aeaeaa9ab2a894b9b0a1b8b2a2b8b1a4b8b3a6bab5aabeb9aec2beb5c5c2bac6c4bdc7c5bfc8c7c1c7c7c0c7c7c0bebcb4afaa9cb3a897beb5aac0b9aec2bcb1bdb8adbab4a9b9b5abb9b3aab2aea1b0ac9fc1c0b8b4b0a3a6a397969697919192b0ab9eb2a89689878581808283828585828385838482828586858a9191968d8e948f90978c8d93a1a2a4b6b6b4c1c0bbaea99dafa593bab4a9b9b3abb4b0aab7b4afbcbab5aeadabb2b2b1b5b5b3b6b7b5afb0afb1b2b2bebfbcc3c2bec4c3beb4afa4aca493b8b2a8beb7aebebab1b7b4aebbb9b3b2b1aeb1b1afb3b3b1acacabbcbdbbb1b1b2c1c0bec2c2bec5c4bfb7b3aaaca594b8b0a4bbb5adb7b4acb7b4aebebbb5b5b5b1b5b4b1bbbab6c4c3bfc1c0bcc6c6c1cdccc7cfcec9cccbc5bcb9b0aea699b6ad9fbeb7aec1bab0c3bfb5c6c2bac4beb3c5bfb1c4bbabc3b8a5c4bdb0bbb4a7c3c2bcd0cfcacfcec9c3c0b8afa89cb4ac9cbfb8aec1bcb2c4c0b7c8c4bbb4b2aeadaaa4afaca7aba9a3b2b0aabdbbb9c7c7c3d0cdc8c6c2b9c5c1b7afa89db3ab9ab5ada1b7b1a7c2bdb2c6c2b6c7c3b9c9c4b9cac6bbccc7bbcbc7bbcbc7bccac6bbc6c4bbc7c5bfdcd8d2'},
 {name:"Biologique Recherche Lotion P50W",time:'am',hash:'2fcac5b7d2cec2d2cdc1d1cdc1d0ccc1d1cdc2d3cfc4d4d0c5d4d0c5d5d1c6d4d0c6d1cdc3d1cec5d6d3cad6d3cbc1bdb5b1ab9db3aea2b8b2a6bbb5a9bfbaadc5bfb4ccc7bcd3cfc3dcd8cee1dfd6e2e0d8dddbd3dbdad6d5d4d0ceccc8c5c2bdb1ab9dafab9eaca89daaa69aaca89ba7a398a7a398aaa69baeaa9fb3afa6b8b4abbbb8b0bdb9b4bcbab5bab9b4bbb8b3ada89cb1ada1ada99eaba79baca99ca6a297a6a297a8a499aca89db0aca3b5b1a9b9b7afbcb9b2bab9b3bab8b4bab8b4a09984ada797aba69ba9a59aaba79ca5a196a5a196a7a398aba79daeaba1b3b0a8b7b4adbab8b2b9b8b4b7b6b3bbb9b5a5a295aaa590aaa38aa69f88a7a0899893828f8c7e8d8a7d8f8b7f938f839b968aa39e92a7a499a4a298a5a398b5b1a8a5a296a8a495a7a495a8a597a9a698a8a69aadaaa1b3b0a8b9b6aebcbbb3bebdb6bebeb7bdbdb7babbb6babab5c0c0bda29e92a9a69aaba99eabaa9eaeaca0aeaba0adaaa0adaaa1aeaba3b0afa7b4b3acb9b8b1bdbeb8c1c2beb9b6b3c0c0bea19d919a988e9f9e97aba695a9a491a9a598a19d93a29f94b3b0a9a9a79faeaba5a8a69fbfc0bac2c3beb8b6b1c1c1be9f9c8fa19e948b8b887a7a7c89898a7f7f8185858785868984868981838784868b8d909385888f86898eb5b5b1c2c2bf9e9a8daba79ba7a69da1a09b9c9c989897959d9d9b9e9e9ca5a5a2a7a7a5a4a6a5a4a6a5b3b5b2bebebbb5b5b0c0c1bf9d9a8daba79bb0ada5a19f9aa1a09b9897949d9c9b9f9e9da0a09f9c9d9da3a4a4afafaebbbbb8bebdbab3b3aebcbdbba09c90aca99eb4b1a8b5b2a9b5b2a9b2b0a8b1afa7adaba5afafa8b2b1acb1b1adb5b6b2bbbcb8bcbcbab1b0acb6b6b4a9a59ab3afa4b9b7acb9b7abafaca1a9a496aaa593ada898afab9fb3b1a8b8b7b2b9bab5bbbcb7bbbbb9b0afabbbb9b6aaa69bb6b1a3b6b4a7bdbab0b5b2aaacaaa3a2a19ba19f9a9c9b979d9d9ab2b2adbabab5babbb7b8b8b6b0aeabc5c3beb4b0a6adaba1b4b2a6bebaacbdbaacbebaadbebaafbab6aab5b2a8b1afa8b2b0a9b3b1acafaea9b0b0abbfbeb9e2dfd9'},
 {name:"Biologique Recherche Lotion P50 PIGM 400",time:'am',hash:'2f6d6965afb2b1dae1e2d6dddfd2dadbcad2d3d0d7d7d0d7d8cdd3d4cbd2d3ced5d7ccd4d6d3dbddd7dee0dbe3e6c8ced0a9afaea5acae92999b868c907e86897f858983878b82888b82878b81868a82878a84888c8186897b7f8374797c74787ba9aeae8c91926f72745e60635455585051554f50545051554f50545151554f4f524d4d4f4e4e4f4f4f50504f50504e4eacb2b0898d8c6c6e6e5b5c5e5252544f4e4f504f5052515154525253525151504e514f4e52514e54514e55514e534f4bb1b4b2838584676866575858504f4f4e4d4b504e4d52504e54514f54504e534f4d54504d56524e57534e56524c534e496d665c615f5b5a595753514f4f4c4a4d4a484f4b49524d4b524e4b534f4c534f4b54504b56514b58544c58534a5450474b433e4e49434d48404f49404a443b47413b4b443e4e48414c453e4c463f4b463d4f483e534a3e53493c4f453b4e473d4840394e4741504944524c46534c484f4a454f4a45504a46504b46544e48564e475a514961574d62574b5e53446458494e453d5048404e463c534c45544b45534a44554c44574e465a50475c52485f5346645746685b4a675a47675a486d604d52493f5148404d443b534a44544c45564d4552493e514539574b3d5e4f3d66553f6c5b456c5b43695741685b4862564452483f50473e494138312d2c312d2c36312f3a353238322e39322c40372e463e354b42374940354f463a584d3f63534051483f4e453c4a413850474049433c48413c48413b4a433d4f473f544b42564d435c52455c524363574674654f5e4d374f463c4b4339483f374e453e4a423c49413b4d453e433c37484139524940554c405a5042695b4970614c76654e5f4c334e453c483f364a42394e453d4f463f514840534a41554c435d5246635748685b4a6e5f4c72634e74644e816f538b77574940374239304940394b423c4d443d4f463d484037473e334d423451453555483861544370614c73624d9d8a6ba693713a302a3b332d3c352f3e3631483f394b433b48413a49423a4d453b51473d584e3f60534365574575654da8977ab3a384'},
 {name:"Biologique Recherche Lait VIP O2",time:'both',hash:'41282d302a2f322a2f3231363880807bb3afa1b8b5a8bdbdb2bdbdb29d9d952e32342b2f312a2e302a2d302a2d2d292d2c4d4f4d4f514f525352545553636360b1aea2d1cdc2e1dfd7d8d8d163645e5e5e5a5f5e5a5f5f5b5f5f5b5f5f5a61605b7f7c767e7c777c7b757a79737a7974bcb8addbd7cbe8e5dce3e2da85847f73726d71706b6f6e696d6c676c6b666c6b6687847e86837d85827c94928aaaa99fd7d3c8e7e3d7eeece3eeede5d6d6cfc1c1ba82817c76757075746e73726c73726c8d8b848c8a83898781a7a69bc3c0b1d1cec1dad6cadfddd3e4e2dae4e4dddadad3a9a8a1817f777a7a7274756e79797296949094938f91908a9f9f95bbb7aacdc9bdd6d4c8dedcd3e2e2dae4e5deddded5b7b7ae9b988c8381773a41465054549b999598979495958f9e9e95b8b5a8cdc9bdd7d5c9dfddd3e4e4dce7e7dfe0e1d9babab49591868e897d57524f282f39a6a59fa3a29ca2a199aaa99fbdb8abc9c5b7d0cdbfd4d0c4d7d4c8d7d5cad6d5c9c8c7bba09f958d897e806258422e34b8b5adafada2c2bfb0d2cfbfddd7c7e3ddcde6e3d5e9e6d6eeeadeede9ddeae8dae7e5d6e2e0d1c7c4ba958a81804c4bb2b1a5c4c1b1d2cebedbd6c6e1dccbe3e0cfe7e4d5eae7d9f0ede0efede0ebe9dceae8dae7e5d8e4e2d5d8d6c9a5958dc3c0afd2ccbcdbd5c5e0dbcae3dfcfe4e1d0e8e5d5ebe9dbf3f1e4f5f3e7f0eee1edebdfece9dde9e7dae5e3d5dcdacdaca99bbab5a6c4beafcac5b6cfcbbbd3d0c0d6d3c4dbd8cbe1ded2e5e2d5e4e2d6e5e3d7e0ded1d9d8ccd3d1c5cac8bd9f9d8faaa798b3b0a1bbb7a7c1bdabc6c0aec8c3b2ccc9b9d0cebedcd9cce4e1d4e6e5d7e6e4d6e5e3d5e0ded1dad9cb9d9a8aa8a493b4ad9cbdb7a6c3bdabc7c0afc6c0aecbc5b1ccc6b2b0aea0c1bdb0ccc9bcd1cec1d5d3c7dad8cedcdcd29c9889a7a393b3ad9cb1ab9eb6b0a3b6b0a3beb6a9c4bdacc0b9a89f9d90a8a498b9b5a9c3c0b1cac8bcd1cfc6d6d6cc9c9989a7a494b2ae9dbeb8a8c6bfaccac3b1cdc6b4c6bfadaaa5959c998ca5a295b8b4a8c2bfb1cac6bbd1cfc4d6d6cb'},
 {name:"Biologique Recherche Lait S.R.",time:'both',hash:'402b2f2f2d30312c2f314b4d4b969487bcbaaeb9b7a9c1bfb0dbd9cde2e0d5c2c2bb909088b0ada2ababa19795889b978b68655e5d5a554544404e4d4767665fa5a397b0ae9fd0cdc0deddd0e5e3d7e4e2d3dbd9cbcbc9bdc3c3ba9896899c988c6c6963605e594b4a4651504a686861a8a79bc7c5b6dad7cbe3e2d6e7e5dbd7d5c8a3a195b5b2a7ababa19795889b978b716e6865635f51504c565550959489bebbadd3cfc1dcd8cee1e0d7e5e4dde1e1dbbdbdb78e8c819391859795899a978b77746d6b696355545061605aa5a498bebbacc9c6b7d1cec3d9d8cfdfded7dfdfdac8c9c58c8a8192908496948799978a79766f6e6c6659585364635da7a79bbdbaaec9c5b8d1cec3d7d6cddddcd4dfdfd8cecfcc8b8980908e829593879796897b7871706e6759595464645dabaa9fbfbcb0c9c7bad0cdc2d5d4cad8d7cfd6d7d0c6c8c28a89818d8a809290849593877b7870555652595b569f9e91c2beafcecabad4d1c1dad7c8e2dfd1e5e3d6e6e4d7e4e2d5d4d3c6a6a59b8c8c819392855b5c58777770bfbaaacec9b7d8d3c2ded9c7e2decbe4e1ceebe8d9efebdfeae8dbe9e7dae8e6d9e3e1d4c0bfb5949388919187c3beacd0cab8d8d2c2ddd7c6e0dccae3e0cee7e4d3ebe9d9efede0eceaddebe9dcebe9dde8e7dbe5e4d8d4d3c8b0af9fc0bca9c8c4b1cdc8b6d0ccbbd4d1c1d8d5c6dcd9cae4e2d4eae8dbe6e4d8e2e0d5e0e0d4deded3dbdbd1d5d5cba2a092a8a697afac9db3afa0b7b3a4bab6a8bdb9acc0beb0c3c2b4c8c6b9cbc9bccccac1cdcdc3d1cfc6cecec4cdccc29f9d8da7a594afab98b1ad9bb5b09fb8b3a3bbb6a6bfbbaac1beaec6c2b4c9c6b7cbc9bccfcdc1d2d0c4d1cfc3cdcbc09b998b9c998da3a095a9a599b4afa1b1aba0b6b2a7b9b5aabfbbb1c0beb4c1bfb5c0beb5c7c4bdd3d1c5d1cfc3cdcac09b998ba5a395adaa9cb2b0a2b8b4a5bab6a7bcb9aac1beafc5c2b6c8c6bacccabfd0cec3d4d2c7d4d2c6d1cfc3cccbc0989689a2a093acaa9bafac9eb1aea2b1aea2bfbcadc1beb1c0bdb4cfcdc1d3d1c4d6d4c8d9d7cbd7d5c9d2d0c4cccbc0'},
 {name:"Biologique Recherche Emulsion Gel Biosensible",time:'both',hash:'1fa09d90afab9fbbb7aac3c0b1c8c6bacfccc2d3d2c8d7d7cedbdbd1dadad1d5d6cf9e9c91807a6e7672687573688f8b7f9e9c8fa9a69ab8b5a9c1beafc8c4b8cdcbbfd2d1c6d6d6ccdadad0dcdcd4d9d9d1bdbcb4817d7175736a706960756b629a978da7a599b5b1a6bfbcadc5c1b5cbc8bed1cec5d5d4cad9d9cfdbdad2dadbd3d7d8d0e5e5dae6e5dbe4e3d9e2e0d7908d82a4a296b3afa3bdbaacc4c0b3c9c7baceccc2d3d1c8d3d3c9cccbc2c4c2b6cbc7b5e0dccbeeebdff0ede2eeebe18380749a957faca58ab7af95a6a38fa1a091a5a394aba99ab3b1a1c0bfb0d1d0c3d4d4c7d6d4c6dcd9c9e3e0d2e6e4d7858273949182a29f8eb0ad9bbcb6a4c1bca9c5c2aec9c6b4cccab9cfcdbed2d0c2d6d4c7babbb5afafa9c9c7bcd6d4c886837386837581817b8c8b85999790aaa79fa9a7a1c4c2b4cdcbbcd1d0c2d5d3c6d7d5c8c2c4bb9fa29fb1b1a8c5c3b78b867883806f8883728e897998927f9e9985a49d87bab094c1b79bc9c2aad4d2c4d7d6c8d4d4c89fa2a0989991b5b3a87f796d8781738a877a878680a0a098ababa2b5b4aabab9aec1bfb1ceccbdd3d2c3d6d4c6d7d5c7afb1ae7f807da0a0983e3c39857f72878273959386a19f93a6a498aeab9fbab6a9c7c2b4cecbbcd0d0c0d4d2c3d7d4c5c3c2bb8183809c9b9131312f5b5850898375948f80a6a393b8b3a1c4bdabcac3b2cdc6b6d0cabad1cfc0d5d2c3d8d5c6dad8c8c1beb47a796f2f2f2d393633807a6d827d6ea4a190b5b09ec3bcaacbc3b2cec7b6d1cbbbd2d0c0d6d3c4dad7c9dedbcadbd7c771706b343230333230817c718e887aa09b8db1ac9dc1baa8cbc4b2d0c9b8d3cebed6d2c2dad5c7dddac9e0ddcbe1ddcb98968c3432313331306462598d897b918d81b0ab9dc0b9a8ccc4b2d3ccbad7d2c0dad4c4ded8c8e1dccce3e0cee1decca6a59d3e3c3a34333144433f8f8b807f7c72a19d8fa69f8daca493bbb6a7d4cfc1ddd7c7e1dbcbe3e0cfe6e3d2e5e2d2bdbbb356555032312f3534327c797078756d9a958bc1b9a8c8c1afd0cbb9d5d0bfd9d2c4ded8cae4e0d1ebe8d8ede9d9dfdbca'},
 {name:"Biologique Recherche Masque Biofixine",time:'pm',hash:'36f4f2e8efece2e8e7dde4e4dae5e5dbe2e0d4d9d6c9d4d2c5d5d2c5d8d5c8dddacde3e1d3e9e7daedebdeeeebdfebeadfeae7dae9e6dae6e6dbd7d8d2d4d5d0d5d4cecccac3d6d4cac6c4bebab9b3cac9c1c2bfbabcbdb8d4d2c6e7e4d6e7e5d9dcd9cce6e4d7d9d9d29a9daa9094a2999ca5999ba29b9da39fa1a5a5a7aba9a9aca3a4a795949b93939ac2beb6c9c1b0c7c5bad9d7cae2e1d4e2e2d9e6e6dee6e6ddd9d9d3d8d7cfd1d0c7d0cec6cdcbc3dbd9cbdfdbcae1dbc8d9d3c09f9888b5b5aacdcbbfd9d7cbe1e0d4e3e3d8d8d8cfd9d8cfd9d8ced8d7cdd7d5cad6d4c8d3d1c3d1cec0dbd5c5cdc8b59d9789a1a299c3bfb3d2d0c3dcdacce2e0d3e4e2d5e5e3d6e3e1d4e0ded1dddbccdcd9cadbd7c8dbd5c4d9d3c2c8c2b09792858e8f89b7b5aacac7bad3d2c5dcd9cce1dfd1e4e2d5e6e4d7e4e2d5e1ded0dfdccddddacaddd8c7d8d3c1c5c0ae95948a83837facaba0c3c0b1ccc9bcd4d2c6dcdacde0ded2e4e2d5e4e2d5e3e0d2e2dfd0e0ddcedbd8cad5d1c0c1bbab95958d8a8b86b3b0a3bebbacc6c2b3cccabdd2d0c3d9d6cadfdcd0e2dfd2e1decfdedbccdbd8cbd9d5c9d4cebeb7b2a392928ca1a096aeaa99c0bcaac5c0b0cac6b9cfccc0d5d2c6d9d5c8dad6c9d7d1c0d8d3c5dad5c8d8d4c9d0cbbcaaa699918f8ac3c0b3918f82c1bba9c4beaec9c4b5cdcabed3d1c4cecabec1bbadc2bdb0c1bbafbebbafd8d4c8cec9ba9f9c928f8e88d7d3c279786fbeb9a6bfb9a9c5bfafccc6b7d2cec1d1cec2d0ccc2d5d1c5d8d5c9dad8cdd9d6cbccc8bb95938b90908adedac96e6e68ada89abfb8a9c4beaebfbbb0c9c5bad3cfc2d8d3c7ddd9cdddd9cddbd8ccd2d0c6c0beb58485818a8b86d5d3c572726d76756cb0a994bcb49ebdb6a6c0bbadc4c0b5c8c4b9c9c6bbc4c2b7bab7aabcb7a6a5a29676787585857fe4e0d2898a837d7c74c2beb1c8c3b1c9c1abc8c0abc0bcaabebbadbdbbafc4c3b7d4d3cae0ded7c3c1ba7c7b7687857dede9d8bfbbaa807e73c2beafc9c6b7cdc9bbd7d3c7dcd9cfe1ded7e1ded7e2e0d7dfded6d6d3cbcecbc0aca89d928f86'},
 {name:"Obagi Hydrate Luxe",time:'pm',hash:'5d29211b2d2620403b376766647b7b7b8787878d8e90929497999b9e989a9d96999b9395979090918b8b8b7e7d7a554d453b352e8081809b9ea1919395a1a4a8b2b5bab4b8bdb7babfb8bbc0babec1bec2c5bec3c6bdc2c5b7bbbd9a9a9b9f9f9ea6a9ab8a8d90b2b6bab9bec2bbbfc3bbbfc3bdc1c5bec2c7c1c5c9c2c6cbc4c9cdc7ccd0c6cbcec5c9ccc9cccfaeafaf878a8db9bec2bdc2c6bec3c7bfc4c8c0c5c9c2c7cbc2c7cbc4c9cdc8cdd1c7ccd0c8cdd1c8cdd1c9cdd0ccd0d4c1c4c695999dc1c6cac1c6cac2c7cbc2c8cbc4c9cdc5cacec5cacec7cdd0c6cdd0c6ccd0c9cfd3cad0d4cdd2d6d1d6d9b8bab8b2b6b9bcc2c5ccd3d8c8cfd3c8cfd3c8d0d4c3cbd0c8d0d5cad2d8ccd3d9d1d7dddce2e7d4dadebdc1c390919098999985827ca0a1a0b4b8bbcfd5d9dbe0e4d7dfe3e5eaeee2e7ebdbe0e4cdd1d4bbbec19d9fa0797a7a5d5c5d5c5b5a9b9c9b8e8b837f776e7d766e7d7a768482808684838382818482827c7a797270706663635c5a5b5957585857566e6e6da4a6a49d9e9a8b89837b766e7b736c77706b746d68726c68726b686d686568636264605f5e5d5e656567757678848381786e6260574b8b8984929190807f7e787775767372757271747271737172737375797b7c7d7d7e73716f65605b6a61588c7d696e604a6d5e497365537c746b84817c83807e817f7e7f7c7b7b78766e6966564f4c48403d463e39453e397e7970968b798271576b5d4b73604673635061584d5b534b574e4a544b485148464e454249423f443d3a3c37335f5851837f7a5b575386745a726c637266557569594b4540453e3c453f3e4540403f3a3a3e39383832303e352e55483e645b5357524e433c3b806f57665e5367645e6c69644f4b4836302e2e28262c26232a242128211e3129253e363159535077747183807e76726e7a6c564f493f83827fa9abaa9e9f9f89888683827f716f6e6e6a67696461736f6d7876748e8d8c98969287827d4f4437766b594e453a4c473f7a7b7bbfc3c4a8aaac7a7c7e6665664a46463e36313e36314239334a423a453c33372d224d4234'},
 {name:"Obagi Hydrate",time:'both',hash:'28849099888c9190939793989da2a8acbdc4c7cad0d3d0d7d9d3dadccdd4d6ccd2d4ccd2d4bbc0c19b9d9c8d90929ba4a87d86907b7f847b7c80818386adb0b3bfc2c4b3b7b8a2a4a59799998e90908e9191989c9ca0a4a4969996919495b4bcbe72757a75797e7a7b7f8e8f919ea09f8e908e85858381817d7f7e7a7d7c787f807c929593a7abac95999b959a9da9b2b66d696875787b757678989a9993959480817e7e7d7a807f7d7f7e7c7a7a767676728385839ca0a1a5aaaa989fa2a1abaf69615a83878977787982848282838172726f716f6b75727072706d6f6b676d6965757674959c9d9ca1a2a1a8abafb8b95c4f47a3a8abb0b3b3acaead898a87767470726f69726d67726c65716c65716d6577756f9ca1a1babebdc1c6c7bbc3c4726a64898b87949592989a98898c8b858786868783858480807d777e7b757c79727c7b768a8d8a979a9893938f8180785c5149726f6c66615e665e58645c56615954615953615a546159546058525f57515e564f5e554d61574d645a505f554b4d463f80807d706c686a625c5f57515f57505e554f5c534e5b524d5a514b5b524c544c465e544a64594e675a505d5349736f688b8b8877736e6f675f5f58505f574e58504a514a45534a45534b45534b44564e45685c4e6f61516f6151655849bcbebe8d8e8b7570696f685d645d536b60536c6152685d50695d50685c4f6d605164584c756655786956766754695c4aa5a6a4807e796960576b61566b6052665c4e655a4d695e506b5f516a5d4e695c4c6d5f4f776855796a56776853685c48c4c5c48d8b866e665b6b61566b5f51574f464f48415b5249554d45554d44695d4d6e604f776855786954756652675a476b6156685c50695e526a5e51695e5061574b585147584f4564594b63574965594b70625074655275665270624f6256457b6c59685c4f655a4d675c4e675b4d61564a5e54485e54476056495f55485f54476c5e4c6e604d6d5f4c685b49594e3f3c3836695d525d54495f564b60564a584f445a50445e53465e54465c52445c52445a50426559486459475e5343534838'},
 {name:"numbuzin No.2 Rose PDRN Collagen 2X Plumping Serum",time:'both',hash:'75c5baa9c2b2a2a57f7498635a9c615aa86d66b1766faf756fad746fae746cb0756caa7069a06861a3766dc1ae9ec8beadbba999a17169aa726ea66b6aa86a69ac6967b8716cc98079ce847dd38a84c07471bb716fb6706fae716db5877fc8b9a9ab84799e6968995a5f9e5a60ab6367b5696bca7c78e49a8fe9a095efa89fcf7c79c67170c06d6db76969b87c76c5a89a9f6f6a8d565d8f4f5994525ba25c61b16669ca7c78eaa295f1ab9ef8b4a9d0807cc46f6ec06c6bb66566b97270c4a09397676488525a8d4f5894525ba25c61b16767c97b77e8a094f0aa9cf6b1a6d4847fc6716fc26e6db86666b9706fc09a8e996a678951598e50579453599f5d61a66564af6e6ab3766eb0746bb0746ca1625c9d5b58a15e5ca66161aa6966b88f83865b5a6b3a3e612d305621234b1415450d0e49121058231e6b312b713931501c19470d0d490b0a560d0b5418177d5b54472320570f0d570908450808420a0a4a13115a24216d272286342e8b3e365a221d53110f590e0b75120e6317187d463e59251f6c19196d2828632f2f5f34345e312f61302d64221f822f2a9149418050477d423b78342e80241f6a1d1e87443d5b26206e18176c1e1f6127265720205b2a28632f2c581715792a258a41397a403887504983433b801d196a1a1b843f395b2722701a196f26266324245a21215c27266524226513127b28238f4038824c4571221c7a2c2587312c7121217e39335a28236d17156d1d1d612323500b0b500d0e5e12116111117324208d4b43926e647e463f6f28237f3330721e2079332f582824691512651e1f501c1e5220204b12114d0f0e480c0c5d1d1a854239672b2558130d4a0c0a620d0d711619792f2e562b266613115e0e12350a113103043408083708072d03033908075217143e0f0e380a08370a096614138d1d1c8135305d3d36681816680f0f3204062d03072402022401012101012302012802022c020333050439090869191687302a8e72676d5d545b36305f1e1b390d0d3008092c06062d06072f0808330c0b3612113b17154826225637326f50498d796fbdb0a3'},
 {name:"COSRX Ultra-Light Invisible Sunscreen SPF50",time:'am',hash:'24767a847f838981858883868983858884868984878a8386898385898184888084878083868083868083868386898385866e7279747b88797d8475787c77797c7576787a7b7d7677796d6e7078797b83868782858783868785898a868a8c8687857e7b7b677081757b85797c828787878e8b88928f8c94928e92908c92908d93908d94928e95928d93918c908e8c908c878f8a85646c7c6e76847b7f89aca49ab2a79a9790899b938c9e968c9a92899c948ca69e909d958ba1988eaea292a79e8fa099916f737e666f81747a86a29c96afa596857d73847c718b83768e8578887f73887f72988e80a69b8b9d9483a59d8da9a1977f7e825f697d6d7481989490aea5989e9588a39a8baa9e8fa39989a79c8ca99e8cb0a491aa9f8e958a7cafa695aaa2988a87845c6479646b7b8d8b89a59c90827d7c807c7c837f7da39a8e98928b958e88a9a090b5a895ab9f8eb4a99ba8a1978d88835d64765d657871757d89898791908a96938c96928a95928b96938c97948c97948c9390898e8a83b1a99a8680797976735b626f5862766269786d727a777b7d7d80817f82838083848082838082827c8081787b7e717477aca6977f7c76686766575c66545f735d6475656b766f737876797c7b7f807f82838083827c7f80787c7d74787a6f7375a9a39679767166656455585f515b715861735f6673676c736f737675797a7e7f7e81817f797c7c7577796f72766d7072a69f9374716c6462605354584e586e525d725860715559625a5d605f61616868666869656265646b6e706c6f726d7072a19b8d706c6863605f5252544c54654f5a72535d725a606d63656c686a6e7274747b7b7a7074746c6f716a6c706e6f719c9788706a666763605654554f5058585f715e647564666e6d6c6e7572707e7b7686827c86827b86827b8681798a857b9b94846e686366615e585555514f526b6b7478777f807b7c8c827c96897e9a8d7e9c8e809c8f80a39686a79a8a9b9082958a7d6d675f66605b595451514d4e67666f74737e7a76798a7f79a09383a59786a89989a69888a59787a49787998e80897e75'},
 {name:"haruharu wonder Black Rice Probiotics Barrier Essence",time:'both',hash:'1ba8a08fa49b8b9f95888c82788a7a729c897baa9681b59f84bea488bfa589bca286b39c7fb2a28cb6ac9ab5ab9ab5ab9a9f978893887c83796f82776d928175a18d7bad977fb69f81bea485bfa584bca381b69d7eb29f86b5aa96b5ab98b6ac98988f82887b6f8c7c6c9684719f8d76a69379ac997cb39f7ebaa481bda784bba581b8a37fb6a17eb19d7cb09d7fb6a99481786e83776a8576648b7a678e7f6b9887719c8b71ac9a7cbba886bfab8ab5a17eb39f7cb29e7bae9a79ac9878b4a7907d7469807569877a688777678f7f6c93846e9d8c72ae9b7bbdaa87c0ac8ab6a280b29e7cb19c7cad997aaa977ab6aa937f766d7d72688376688677678e7e6b97866fa08f75b1a083b9a989bead8eb6a383ad9879ae997aab9778a89579bbad937d746c796e648072658778698f7e6c9784709f8c73a99479b39d80bba585b49e7eac9677ab9575a89173a59075baac9379706973655e79685f806e618875658f7b6a98816ea28b74ae947cb59b80af9579a78c71a48970a1876e9e8670b2a18c6c615e6957566e5956755d587c625a83685e8c6f62967768a28270ab8c79a685729c79679a7765977563977766aa94835d4f515c464c61474b674b4e6d50507555547c5b5683605a906b639e796f9973698e685e8d665c8a645a89665c9c847756484d533e48563e485c414860444966494c6c4e4e7151517c5c588d6b6488655e805d58805c587e5b577f5d588f756d50434a4f3b454f3b44543e46563e445f4549664c4d6449496e524f83645e82645e7958557a5856795857795a58866d665043494b39444e3a45523b47553c455c404561454962444967494a7556537556537353517555537656547657558067617269616c625c685e5a695d5a6a5d5a6d5f5a70625c74655f7c6c6682726b87766f8978718e7d74908179968a81a0968a7f766c7e756c7f766c80776d81786d81796e827b70847d72887e758f837a93877c978b7f998d819a8f829a91839c93847c73697c74697d756a7e756b7f766c80776d82786e837a71857c73877e758a80778f847a94877c968a7d988c7e988e7f'}];
const KL_CARD_MAX=10,KL_CARD_GAP=6;
function knownCard(card,products){const h=cardHash(card);let best=null,bd=999,second=999;for(const k of KL_CARDS){const d=hamming(h,k.hash);if(d<bd){second=bd;bd=d;best=k}else if(d<second)second=d}
  if(!best||bd>KL_CARD_MAX||second-bd<KL_CARD_GAP)return null;const p=products.find(x=>x.name===best.name);if(!p)return null;
  return {title:p.step||best.step||guessStep(p.name),time:best.time,product:p.name,short:p.short||shortOf(p.name),how:p.how||'',conf:'match',img:p.id||null}}
async function readCard(file,onProgress){const raw=await loadCanvas(file,2200);const c=findCard(raw);if(!c)return null;
  const products=(API()&&API().products())||[];let info=knownCard(c,products),text='';
  if(!info){const w=await getWorker(onProgress);const r=await w.recognize(cardTextCanvas(c));text=(r&&r.data&&r.data.text)||'';info=parseCard(text,products)}
  if(!info)return null;const th=cardThumb(c);return {...info,thumb:th,text}}
// a plain photo of one product: match all the label text at once against the product list
async function matchPhoto(file,products){const text=await readPhoto(file,()=>{});const lt=toks(text);let best=null,bs=0;
  for(const p of products){if(/^My product \d+$/.test(p.name))continue;const sc=scoreProduct(p,lt);if(sc>bs+0.001||(Math.abs(sc-bs)<=0.001&&best&&p.name.length>best.name.length)){bs=sc;best=p}}
  if(!best||bs<0.6)return null;return {product:best.name,short:best.short||shortOf(best.name),how:best.how||'',title:best.step||guessStep(best.name),img:best.id||null,conf:bs>=0.95?'match':'close'}}
Object.assign(window.KLFill,{readCard,matchPhoto,parseCard,isCard,loadCanvas,findCard,cardHash});
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
