/* KL price list import: reads a PDF or a photo ON THE DEVICE and turns it into price list rows.
   PDFs: pdf.js text layer (falls back to OCR for scanned PDFs). Photos: Tesseract OCR, self-hosted.
   Nothing is uploaded anywhere. */
(function(root){
'use strict';
const PRICE=/[€£]\s?\d[\d,]*(?:\.\d{1,2})?/;
const cleanTxt=s=>s.replace(/[®™©]/g,'').replace(/\s+/g,' ').trim();
const tidy=s=>cleanTxt(s).replace(/(\d)\s?m[|!lI1]?(?=$|[\s,])/g,'$1ml').replace(/[\s.,·:;–\-~|_=]+$/,'').replace(/^[\s.,·:;–\-~|_=]+/,'');

/* words: [{s,x0,x1,y0,y1}] in page pixels. Returns [{n,p,s}] */
function parseWords(words){
  words=words.map(w=>({...w,s:String(w.s).trim()})).filter(w=>w.s);
  if(!words.length)return [];
  const hs=words.map(w=>w.y1-w.y0).sort((a,b)=>a-b);const med=hs[Math.floor(hs.length/2)]||10;
  // 1. rows: words whose vertical centres line up
  words.sort((a,b)=>(a.y0+a.y1)/2-(b.y0+b.y1)/2);
  const rows=[];
  for(const w of words){const yc=(w.y0+w.y1)/2;const r=rows[rows.length-1];
    if(r&&Math.abs(yc-r.yc)<Math.max(med,w.y1-w.y0)*0.55){r.w.push(w);r.yc=(r.yc*(r.w.length-1)+yc)/r.w.length}else rows.push({yc,w:[w]})}
  // 2. segments: split a row where there is a wide gap
  const segs=[];
  rows.forEach((r,ri)=>{r.w.sort((a,b)=>a.x0-b.x0);let cur=null;
    for(const w of r.w){const h=w.y1-w.y0;
      if(cur&&w.x0-cur.x1<Math.max(h,med)*1.6){cur.t+=(w.x0-cur.x1<h*0.12&&!/^[€£]/.test(w.s)?'':' ')+w.s;cur.x1=Math.max(cur.x1,w.x1);cur.y0=Math.min(cur.y0,w.y0);cur.y1=Math.max(cur.y1,w.y1);cur.hs.push(h)}
      else{cur={t:w.s,x0:w.x0,x1:w.x1,y0:w.y0,y1:w.y1,hs:[h],row:ri};segs.push(cur)}}});
  segs.forEach(g=>{g.hs.sort((a,b)=>a-b);g.h=g.hs[0];
    let t=g.t.replace(/\bsave\s+(up\s+to\s+)?[€£]\s?[\d.,]+(\s+or\s+more)?/ig,'').replace(/\s*(to|-|–)\s*[€£]\s?[\d.,]+/ig,'');
    let m=t.match(PRICE);if(!m&&/^\d{1,4}(?:[.,]\d{2})?$/.test(t.trim()))m={0:t.trim(),index:0}; // a lone number in its own column is a price (OCR often drops the €)
    g.price=m?parseFloat(m[0].replace(/[€£\s]/g,'').replace(',','.')):null;
    g.name=tidy(m?t.slice(0,m.index):t);
    g.big=g.h>med*1.3;g.words=g.name?g.name.split(' ').length:0;});
  const overlapX=(a,b)=>Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)>-med;
  // 3. section headings: big text without a price
  const heads=segs.filter(g=>g.big&&g.price==null&&g.words&&g.words<=6&&!/[.!?]$/.test(g.name));
  const out=[];
  segs.forEach(g=>{
    if(g.price==null||!(g.price>0))return;
    let name=g.name,isHead=false,span={x0:g.x0,x1:g.x1};
    if(!name){ // price on its own: name to the left on the same row, else the nearest big line above
      const left=segs.filter(o=>o.row===g.row&&o.x1<=g.x0+2&&o.price==null&&o.name).sort((a,b)=>b.x1-a.x1)[0];
      const rightPrice=left&&segs.some(o=>o.row===g.row&&o.price!=null&&o!==g&&o.x0>left.x1&&o.x0<g.x0);
      if(left&&!rightPrice){name=left.name;span={x0:left.x0,x1:g.x1}}
      else{const up=heads.filter(o=>o.y1<=g.y0+2&&overlapX(o,g)).sort((a,b)=>b.y1-a.y1)[0];if(up){name=up.name;isHead=true}}
    }
    if(!name||name.length<2)return;
    const sec=heads.filter(o=>o.y1<=g.y0+2&&overlapX(o,span)).sort((a,b)=>b.y1-a.y1)[0];
    const section=sec?sec.name:'';
    // generic option names ("One area", "Face, course of three") get their heading in front
    let full=name;const rest=name.split(' ').slice(1).join(' ');
    if(!isHead&&section&&section!==name&&!/[A-Z]/.test(rest)&&name.split(' ').length<=7)full=section+', '+name.charAt(0).toLowerCase()+name.slice(1);
    out.push({n:full,p:Math.round(g.price*100)/100,s:isHead?'':section,x:span.x0,y:g.y0});
  });
  // read column by column, top to bottom
  const maxX=Math.max(...segs.map(g=>g.x1));out.sort((a,b)=>(Math.floor(a.x/(maxX*0.45))-Math.floor(b.x/(maxX*0.45)))||(a.y-b.y));
  out.forEach(x=>{delete x.x;delete x.y});
  // drop exact repeats
  const seen=new Set();return out.filter(x=>{const k=x.n.toLowerCase()+'|'+x.p;if(seen.has(k))return false;seen.add(k);return true});
}

/* guess which group an item belongs to */
function guessGroup(x){
  const t=(x.s+' '+x.n).toLowerCase();
  if(/wrinkle|botox|toxin|migraine|jaw|clench|grind|sweat|hyperhidrosis|filler|lip |lips|cheek|chin|mid-?face|tear trough|profhilo/.test(t))return 'proc';
  if(/skinpen|microneedl|booster|skinvive|polynucleotide|plinest|peel|bundle|reset|refresh|smooth & glow|laser|facial|treatment/.test(t))return 'aes';
  return 'skin';
}

/* plain text (e.g. copied with Live Text): one item per line */
function parseText(text){
  const out=[];let section='';
  String(text).split(/\r?\n/).forEach(l=>{let t=l.replace(/\bsave\s+(up\s+to\s+)?[€£]\s?[\d.,]+(\s+or\s+more)?/ig,'').replace(/\s*(to|-|–)\s*[€£]\s?[\d.,]+/ig,'');
    const m=t.match(PRICE);const name=tidy(m?t.slice(0,m.index):t);
    if(!m){if(name&&name.split(' ').length<=5&&!/[.!?]$/.test(name))section=name;return}
    const p=parseFloat(m[0].replace(/[€£\s,]/g,''));if(!name||!(p>0))return;
    const rest=name.split(' ').slice(1).join(' ');
    const full=section&&!/[A-Z]/.test(rest)&&name.split(' ').length<=7?section+', '+name.charAt(0).toLowerCase()+name.slice(1):name;
    out.push({n:full,p,s:section})});
  return out;
}

/* ---------- browser readers ---------- */
let pdfReady=null,ocrWorker=null;
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Could not load '+src));document.head.appendChild(s)})}
async function pdfjs(){if(!pdfReady)pdfReady=loadScript('inv/pdf/pdf.min.js').then(()=>{root.pdfjsLib.GlobalWorkerOptions.workerSrc='inv/pdf/pdf.worker.min.js';return root.pdfjsLib});return pdfReady}
async function ocr(){if(!ocrWorker){await loadScript('inv/ocr/tesseract.min.js');
  const base=new URL('inv/ocr/',location.href).href;
  ocrWorker=await root.Tesseract.createWorker('eng',1,{workerPath:base+'worker.min.js',corePath:base,langPath:base,gzip:true,workerBlobURL:false,logger:m=>{if(m.status==='recognizing text'&&root.KLImport.onProgress)root.KLImport.onProgress('Reading the photo… '+Math.round(m.progress*100)+'%')}})}
  return ocrWorker}
async function ocrCanvas(cv){const w=await ocr();const {data}=await w.recognize(cv,{},{blocks:true});
  const words=[];(data.blocks||[]).forEach(b=>(b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>(l.words||[]).forEach(x=>{if(x.confidence>30)words.push({s:x.text,x0:x.bbox.x0,x1:x.bbox.x1,y0:x.bbox.y0,y1:x.bbox.y1})}))));
  if(!words.length&&data.words)data.words.forEach(x=>words.push({s:x.text,x0:x.bbox.x0,x1:x.bbox.x1,y0:x.bbox.y0,y1:x.bbox.y1}));
  root.KLImport.lastWords=words;return words}
async function imageToCanvas(file){
  const bmp=await createImageBitmap(file);const L=Math.max(bmp.width,bmp.height);const sc=L<1800?2:Math.min(1,3000/L);
  const cv=document.createElement('canvas');cv.width=Math.round(bmp.width*sc);cv.height=Math.round(bmp.height*sc);
  const c=cv.getContext('2d');c.drawImage(bmp,0,0,cv.width,cv.height);
  // greyscale + stretch contrast, and flip light-on-dark areas to dark-on-light so OCR sees them
  const im=c.getImageData(0,0,cv.width,cv.height),d=im.data;
  for(let i=0;i<d.length;i+=4){let g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];d[i]=d[i+1]=d[i+2]=g}
  const W=cv.width,H=cv.height,bs=48;
  for(let by=0;by<H;by+=bs)for(let bx=0;bx<W;bx+=bs){let s=0,n=0;for(let y=by;y<Math.min(H,by+bs);y+=4)for(let x=bx;x<Math.min(W,bx+bs);x+=4){s+=d[(y*W+x)*4];n++}
    if(s/n<110)for(let y=by;y<Math.min(H,by+bs);y++)for(let x=bx;x<Math.min(W,bx+bs);x++){const k=(y*W+x)*4;d[k]=d[k+1]=d[k+2]=255-d[k]}}
  c.putImageData(im,0,0);return cv}
async function readPdf(file){
  const lib=await pdfjs();const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  let items=[];
  for(let i=1;i<=doc.numPages;i++){
    const page=await doc.getPage(i);const vp=page.getViewport({scale:1});const tc=await page.getTextContent();
    const words=[];const off=(i-1)*(vp.height+50);
    tc.items.forEach(it=>{if(!it.str||!it.str.trim())return;const t=it.transform;const h=Math.hypot(t[2],t[3])||10;const x=t[4],y=vp.height-t[5]+off;
      words.push({s:it.str,x0:x,x1:x+(it.width||h*it.str.length*0.5),y0:y-h,y1:y})});
    if(words.length<5){ // scanned PDF: read it like a photo
      if(root.KLImport.onProgress)root.KLImport.onProgress('This PDF is a scan, reading it like a photo…');
      const v2=page.getViewport({scale:2.5});const cv=document.createElement('canvas');cv.width=v2.width;cv.height=v2.height;
      await page.render({canvasContext:cv.getContext('2d'),viewport:v2}).promise;
      const blob=await new Promise(r=>cv.toBlob(r,'image/png'));const cv2=await imageToCanvas(blob);
      items=items.concat(parseWords(await ocrCanvas(cv2)));
    }else items=items.concat(parseWords(words));
  }
  return items}
async function readFile(file){
  if(file.type==='application/pdf'||/\.pdf$/i.test(file.name))return readPdf(file);
  if(root.KLImport.onProgress)root.KLImport.onProgress('Getting the photo ready…');
  const cv=await imageToCanvas(file);return parseWords(await ocrCanvas(cv))}

root.KLImport={parseWords,parseText,guessGroup,readFile,onProgress:null};
})(typeof window!=='undefined'?window:globalThis);
if(typeof module!=='undefined')module.exports=globalThis.KLImport;
