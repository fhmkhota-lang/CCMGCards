/* ═══════════════════════════════════════════════════════════
   CCMG CARDS — Social Card Studio
   Cape Community Media Group: 14 community titles. Forked from IOL Titles
   (same feed/designer/carousel/infographic/ticks), with its own worker.
   Card themes: 'classic' masthead card for most titles, plus bespoke styles
   for CapeTowner (lifestyle), DFA (broadsheet) and Bolander (magazine).
   ═══════════════════════════════════════════════════════════ */

/* Media/proxy + feed worker.
   For local review this points at the existing proxy worker so /image,
   /shorten, /fullimage and /claude all work. Publication feeds fall back to
   the baked PRELOADED samples until the new worker is deployed.
   Media/feeds served by the dedicated ccmgcards worker.
   AI_WORKER handles /claude (AI infographic) via the ioltester worker, which
   already holds the ANTHROPIC_KEY secret — avoids duplicating the key. */
// On GitHub Pages the feed API lives on the separate, open ccmgcards worker.
// On the Cloudflare Access-protected build the site is served BY the worker,
// so the API is same-origin and the login cookie covers every request.
const WORKER = /github\.io$|^localhost$|^127\./.test(location.hostname)
  ? 'https://ccmgcards.faheem-khota.workers.dev'
  : location.origin;
const AI_WORKER = 'https://ioltester.fhmkhota.workers.dev';
const PAGE_SZ = 12;

/* ── Publication registry (order = picker order) ──
   site  = the title's own domain (shown on the card's bottom bar)
   boxed = masthead is a solid colour box, so it's drawn as-is (no white chip)
   style = card theme: default 'classic'; 'lifestyle' (CapeTowner),
           'broadsheet' (DFA), 'magazine' (Bolander)                         */
const CCMG_BLUE='#007DC5';
const PUBLICATIONS = [
  {key:'athlonenews',           name:'Athlone News',            color:CCMG_BLUE, site:'athlonenews.co.za',            city:'Cape Town', region:'Western Cape', boxed:true, style:'panel'},
  {key:'atlanticsun',           name:'Atlantic Sun',            color:CCMG_BLUE, site:'atlanticsun.co.za',            city:'Cape Town', region:'Western Cape', boxed:true, style:'panel'},
  {key:'bolander',              name:'Bolander',                color:'#B72079', site:'bolanderlifestyle.co.za',      city:'Cape Town', region:'Western Cape', boxed:true, style:'magazine'},
  {key:'capetowner',            name:'CapeTowner',              color:'#F0A830', site:'capetowner.co.za',             city:'Cape Town', region:'Western Cape', style:'lifestyle', ink:'#00183C'},
  {key:'constantiabergbulletin',name:'Constantiaberg Bulletin', color:CCMG_BLUE, site:'constantiabergbulletin.co.za', city:'Cape Town', region:'Western Cape', boxed:true, style:'panel'},
  {key:'dfa',                   name:'DFA',                     color:'#D2232A', site:'dfa.co.za',                    city:'Kimberley', region:'Northern Cape', style:'panel'},
  {key:'falsebayecho',          name:'False Bay Echo',          color:CCMG_BLUE, site:'falsebayecho.co.za',           city:'Cape Town', region:'Western Cape', boxed:true, style:'panel'},
  {key:'isolezwelesixhosa',     name:'Isolezwe lesiXhosa',      color:'#00AEEF', site:'isolezwelesixhosa.co.za',      city:'Cape Town', region:'Western Cape', style:'panel'},
  {key:'plainsman',             name:'Plainsman',               color:CCMG_BLUE, site:'plainsman.co.za',              city:'Cape Town', region:'Western Cape', boxed:true, style:'panel'},
  {key:'sentinelnews',          name:'Sentinel News',           color:CCMG_BLUE, site:'sentinelnews.co.za',           city:'Hout Bay',  region:'Western Cape', boxed:true, style:'panel'},
  {key:'southernmail',          name:'Southern Mail',           color:CCMG_BLUE, site:'southernmail.co.za',           city:'Cape Town', region:'Western Cape', boxed:true, style:'panel'},
  {key:'southernsuburbstatler', name:'Southern Suburbs Tatler', color:CCMG_BLUE, site:'southernsuburbstatler.co.za',  city:'Cape Town', region:'Western Cape', boxed:true, style:'panel'},
  {key:'tabletalk',             name:'Tabletalk',               color:CCMG_BLUE, site:'tabletalk.co.za',              city:'Cape Town', region:'Western Cape', boxed:true, style:'panel'},
  {key:'vukani',                name:'Vukani',                  color:CCMG_BLUE, site:'vukaninews.co.za',             city:'Cape Town', region:'Western Cape', boxed:true, style:'panel'},
];
const PUB = {}; PUBLICATIONS.forEach(p => PUB[p.key] = p);
function pubCfg(key){ return PUB[key] || PUBLICATIONS[0]; }
// Newspaper-style themes default to an uppercase headline; the lifestyle and
// magazine cards read better in sentence case.
function defaultUpper(key){ const st=pubCfg(key).style; return !(st==='lifestyle'||st==='magazine'); }

/* Kicker auto-suggestion from a story's detected category */
const CAT_KICKER = {news:'NEWS',politics:'POLITICS',sport:'SPORT',business:'BUSINESS',crime:'CRIME',opinion:'OPINION',motoring:'MOTORING',travel:'TRAVEL',lifestyle:'LIFESTYLE',entertainment:'ENTERTAINMENT',technology:'TECHNOLOGY'};
function autoKicker(cat){ return CAT_KICKER[(cat||'').toLowerCase()] || 'NEWS'; }

/* ── Supabase (shared done_stories table; ccmg_ prefixed ids so ticks never
   clash with IOL Cards or IOL Titles) ── */
const SUPA_URL = 'https://asipandmcgagpswsgbtr.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzaXBhbmRtY2dhZ3Bzd3NnYnRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNTc0MzEsImV4cCI6MjA5NzgzMzQzMX0.yc6mSP_EXe8g1w61r667SCoQsSeZILSkZ-BfCka6VDI';
const DONE_PREFIX = 'ccmg_';
// Ticks are namespaced per publication so the same wire story ticked under one
// title never shows as done under another title.
function doneKey(pub,id){ return DONE_PREFIX + pub + '__' + id; }
let doneIds = new Set();

async function loadDoneFromSupabase() {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/done_stories?select=id&id=like.${DONE_PREFIX}*`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
    });
    const rows = await res.json();
    if (Array.isArray(rows)) { doneIds = new Set(rows.map(r => r.id)); renderFeed(); }
  } catch(e) { console.warn('Supabase load:', e); }
}
async function markDoneInSupabase(id, headline) {
  doneIds.add(id);
  const name = localStorage.getItem('ccmg_cards_user') || 'Team';
  try {
    await fetch(`${SUPA_URL}/rest/v1/done_stories`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ id, headline, marked_by: name })
    });
  } catch(e) { console.warn('Supabase mark:', e); }
}

/* ── Small helpers ── */
function relTime(s){if(!s)return'Today';try{const m=Math.floor((Date.now()-new Date(s))/60000);if(m<1)return'Just now';if(m<60)return m+'m ago';if(m<1440)return Math.floor(m/60)+'h ago';return'Today';}catch{return'Today';}}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
function $id(id){return document.getElementById(id);}
function gv(id){const e=$id(id);return e?e.value:'';}
function sv(id,v){const e=$id(id);if(e)e.value=v||'';}

/* ── Canvas sizes ── */
const SQ = 1080;             // square 1080x1080
const RW = 1080, RH = 1920;  // reel/story 1080x1920

/* ── Logo image cache ── */
const LOGO_CACHE = {};
// variant: 'colour' -> logos/<key>.png, 'white' -> logos/<key>-white.png.
// CapeTowner: 'colour' is its round lifestyle logo, 'white' its blue CCMG
// masthead. A missing variant quietly falls back to the other.
function logoFile(key,variant){ return 'logos/'+key+(variant==='white'?'-white':'')+'.png'; }
function loadLogo(key,variant){
  variant = variant==='white' ? 'white' : 'colour';
  const id = key+':'+variant;
  return new Promise(res=>{
    if(LOGO_CACHE[id]!==undefined) return res(LOGO_CACHE[id]);
    const img=new Image();
    img.onload=()=>{LOGO_CACHE[id]=img;res(img);};
    img.onerror=()=>{
      const other = variant==='white' ? 'colour' : 'white';
      const oid = key+':'+other;
      if(LOGO_CACHE[oid]){ LOGO_CACHE[id]=LOGO_CACHE[oid]; return res(LOGO_CACHE[id]); }
      const alt=new Image();
      alt.onload=()=>{LOGO_CACHE[id]=alt;LOGO_CACHE[oid]=alt;res(alt);};
      alt.onerror=()=>{LOGO_CACHE[id]=null;res(null);};
      alt.src=logoFile(key,other);
    };
    img.src=logoFile(key,variant);
  });
}
function preloadAllLogos(){ PUBLICATIONS.forEach(p=>{loadLogo(p.key,'colour');loadLogo(p.key,'white');}); }

/* ── State ── */
let allStories = [], curPub = PUBLICATIONS[0].key, curSearch = '', visible = PAGE_SZ;

/* ── Designer state ── */
let d = {
  type:'single', pub:PUBLICATIONS[0].key, kicker:'', headline:'',
  headlineColor:'#FFFFFF', kickerColor:'#FFFFFF', upper:true,
  imgUrl:'', imgEl:null, textPos:'bot', reelTextPos:'bot', logoVariant:'colour',
  storyUrl:'', shortUrl:'', breaking:false, excerpt:'', source:'',
  slides:[], slide:0, points:[],
  sqImgX:0, sqImgY:0, sqImgScale:1,
  reelImgX:0, reelImgY:0, reelImgScale:1,
  draggingTarget:'sq', dragging:false, dsx:0, dsy:0, dox:0, doy:0,
  storyId:null,
};

/* ════════════════════════════════════════════
   PUBLICATION PICKER
   ════════════════════════════════════════════ */
function buildPubPills(){
  const wrap=$id('pub-pills'); if(!wrap)return;
  wrap.innerHTML=PUBLICATIONS.map(p=>`
    <button class="pub-pill${p.key===curPub?' active':''}" data-pub="${p.key}" style="${p.key===curPub?`background:${p.color};`:''}">
      <span class="pp-dot" style="background:${p.color}"></span>${esc(p.name)}
    </button>`).join('');
  wrap.querySelectorAll('.pub-pill').forEach(b=>b.addEventListener('click',()=>selectPub(b.dataset.pub)));
}
function selectPub(key){
  if(!PUB[key]) return;
  curPub=key; curSearch=''; visible=PAGE_SZ;
  const si=$id('search-input'); if(si) si.value='';
  document.documentElement.style.setProperty('--pub', pubCfg(key).color);
  buildPubPills();
  loadStories(true);
}

/* ════════════════════════════════════════════
   FEED
   ════════════════════════════════════════════ */
async function loadStories(refresh){
  const grid=$id('stories-grid'), status=$id('feed-status'), btn=$id('refresh-btn');
  if(btn)btn.classList.add('spin');
  if(refresh)visible=PAGE_SZ;
  const p=pubCfg(curPub);
  if(grid)grid.innerHTML=`<div class="grid-loading"><div class="spinner"></div><p>Loading latest ${esc(p.name)} stories…</p></div>`;
  try{
    const res=await fetch(WORKER+'/'+curPub+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(12000)});
    const data=await res.json();
    if(!data.ok||!data.stories||data.stories.length<2)throw new Error('empty');
    allStories=data.stories.map((s,i)=>({id:s.url||(curPub+'-'+i),cat:s.category||'news',headline:s.headline,excerpt:s.excerpt||'',source:s.source||p.name,time:relTime(s.pubDate),url:s.url||'',image:s.image||''}));
    if(status){status.textContent=allStories.length+' stories · live';}
  }catch(_){
    const pre=(window.PRELOADED&&window.PRELOADED[curPub])||[];
    allStories=pre.map((s,i)=>({id:s.url||(curPub+'-'+i),cat:'news',headline:s.headline,excerpt:s.excerpt||'',source:p.name,time:'',url:s.url||'',image:s.image||''}));
    if(status){status.textContent=allStories.length?(allStories.length+' stories · sample'):'Feed live after deploy';}
  }
  renderFeed();
  loadDoneFromSupabase();
  if(btn)btn.classList.remove('spin');
}

function renderFeed(){
  const grid=$id('stories-grid'); if(!grid)return;
  const q=curSearch.toLowerCase().trim();
  const filt=q?allStories.filter(s=>(s.headline||'').toLowerCase().includes(q)||(s.excerpt||'').toLowerCase().includes(q)):allStories;
  const vis=filt.slice(0,visible);
  if(!vis.length){grid.innerHTML=`<div class="grid-loading"><p>${q?'No stories match "'+esc(q)+'".':'No stories yet — hit refresh, or the live feed activates after deploy.'}</p></div>`;if($id('load-more-row'))$id('load-more-row').style.display='none';return;}
  grid.innerHTML=vis.map(s=>`
    <div class="scard${doneIds.has(doneKey(curPub,s.id))?' done':''}" data-id="${esc(s.id)}">
      <div class="scard-cat">${esc(autoKicker(s.cat))}</div>
      <div class="scard-hl">${esc(s.headline)}</div>
      ${s.excerpt?`<div class="scard-ex">${esc(s.excerpt)}</div>`:''}
      <div class="scard-meta">
        <span class="scard-src">${esc(s.source)}</span><span>·</span><span>${esc(s.time||'Today')}</span>
        <span class="scard-cta">Make card →</span>
      </div>
    </div>`).join('');
  grid.querySelectorAll('.scard').forEach(c=>{c.addEventListener('click',()=>{const s=allStories.find(x=>x.id===c.dataset.id);if(s)openDesigner(s);});});
  const lmr=$id('load-more-row');if(lmr)lmr.style.display=filt.length>visible?'block':'none';
}

let _searchTimer=null;
$id('search-input')?.addEventListener('input',function(){
  clearTimeout(_searchTimer);
  _searchTimer=setTimeout(()=>{curSearch=this.value;visible=PAGE_SZ;renderFeed();},220);
});
$id('search-clear')?.addEventListener('click',()=>{curSearch='';const si=$id('search-input');if(si)si.value='';visible=PAGE_SZ;renderFeed();});
$id('load-more-btn')?.addEventListener('click',()=>{visible+=PAGE_SZ;renderFeed();});
$id('refresh-btn')?.addEventListener('click',()=>loadStories(true));

/* From URL builder */
$id('from-url-toggle')?.addEventListener('click',()=>{
  const panel=$id('from-url-panel'); if(!panel)return;
  const open=panel.style.display==='none';
  panel.style.display=open?'block':'none';
  if(open) setTimeout(()=>$id('from-url-input')?.focus(),50);
});
$id('from-url-go')?.addEventListener('click', buildCardFromUrl);
$id('from-url-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')buildCardFromUrl();});
async function buildCardFromUrl(){
  const urlVal=($id('from-url-input')?.value||'').trim();
  const status=$id('from-url-status'), btn=$id('from-url-go');
  if(!urlVal){if(status)status.textContent='Paste an article URL first.';return;}
  if(btn){btn.disabled=true;btn.textContent='Fetching…';}
  if(status)status.textContent='';
  try{
    const r=await fetch(WORKER+'/fullimage?url='+encodeURIComponent(urlVal),{cache:'no-store'});
    const data=await r.json();
    let cat='news';
    if(/\/sport\//.test(urlVal))cat='sport';
    else if(/\/business\//.test(urlVal)||/business-report/.test(urlVal))cat='business';
    else if(/\/politics\//.test(urlVal))cat='politics';
    else if(/\/opinion\//.test(urlVal))cat='opinion';
    else if(/\/motoring\//.test(urlVal))cat='motoring';
    else if(/\/travel\//.test(urlVal))cat='travel';
    else if(/\/lifestyle\//.test(urlVal))cat='lifestyle';
    else if(/\/entertainment\//.test(urlVal))cat='entertainment';
    const story={id:'url-'+Date.now(),cat,headline:(data&&data.title)||'Headline not found — edit it',excerpt:(data&&data.desc)||'',source:pubCfg(curPub).name,image:(data&&data.url)||'',url:urlVal,time:''};
    const panel=$id('from-url-panel');if(panel)panel.style.display='none';
    const inp=$id('from-url-input');if(inp)inp.value='';
    if(status)status.textContent='';
    openDesigner(story);
  }catch(e){ if(status)status.textContent='Error: '+(e.message||'Could not load'); }
  finally{ if(btn){btn.disabled=false;btn.textContent='Build Card';} }
}

/* ════════════════════════════════════════════
   DESIGNER OPEN / CLOSE
   ════════════════════════════════════════════ */
function buildPubSelect(){
  const sel=$id('ctrl-pub'); if(!sel)return;
  sel.innerHTML=PUBLICATIONS.map(p=>`<option value="${p.key}">${esc(p.name)}</option>`).join('');
}
async function openDesigner(story){
  d.pub=curPub;
  d.kicker=story.kicker||autoKicker(story.cat);
  d.headline=story.headline||''; d.imgUrl=story.image||''; d.excerpt=story.excerpt||'';
  d.storyUrl=story.url||''; d.shortUrl=''; d.source=story.source||pubCfg(d.pub).name;
  d.sqImgX=0;d.sqImgY=0;d.sqImgScale=1; d.reelImgX=0;d.reelImgY=0;d.reelImgScale=1;
  d.textPos='bot'; d.reelTextPos='bot'; d.type='single'; d.slides=[]; d.slide=0;
  d.imgEl=null; d.storyId=story.id; d.headlineColor='#FFFFFF'; d.kickerColor='#FFFFFF';
  d.breaking=false; d.upper=defaultUpper(d.pub); d.points=[];

  buildPubSelect();
  sv('ctrl-pub',d.pub); sv('ctrl-kicker',d.kicker); sv('ctrl-headline',d.headline); sv('ctrl-imgurl',d.imgUrl);
  sv('ctrl-hl-color','#FFFFFF'); sv('ctrl-kicker-color','#FFFFFF');
  const uc=$id('ctrl-upper'); if(uc) uc.checked=d.upper;
  const bkt=$id('ctrl-breaking'); if(bkt) bkt.checked=false;
  const ie=$id('info-editor'); if(ie) ie.style.display='none';
  const ipt=$id('info-points'); if(ipt) ipt.value='';
  const isrc=$id('info-source'); if(isrc) isrc.value=d.source;
  document.querySelectorAll('.tt-btn').forEach(b=>b.classList.toggle('active',b.dataset.type==='single'));
  document.querySelectorAll('#pos-grid .pos-btn').forEach(b=>b.classList.toggle('active',b.dataset.pos==='bot'));
  document.querySelectorAll('#reel-pos-grid .pos-btn').forEach(b=>b.classList.toggle('active',b.dataset.pos==='bot'));
  if($id('dnav-title'))$id('dnav-title').textContent=pubCfg(d.pub).name+' — '+(story.headline||'');
  $id('btn-dl-all').style.display='none';
  updateCarouselUI(); buildShareText();

  $id('designer').classList.add('open');
  document.body.style.overflow='hidden';

  await Promise.all([document.fonts?.ready, loadLogo(d.pub)].filter(Boolean));
  renderBoth();

  if(d.imgUrl){
    let best=d.imgUrl;
    if(d.storyUrl){
      try{const fr=await fetch(WORKER+'/fullimage?url='+encodeURIComponent(d.storyUrl));const frj=await fr.json();if(frj.ok&&frj.url)best=frj.url;}catch(e){}
    }
    d.imgEl=await loadImgCORS(WORKER+'/image?url='+encodeURIComponent(best));
    if(!d.imgEl)d.imgEl=await loadImgDirect(best);
    renderBoth();
  }
  if(d.storyUrl){
    try{const r=await fetch(WORKER+'/shorten?url='+encodeURIComponent(d.storyUrl));const j=await r.json();if(j.ok&&j.short){d.shortUrl=j.short;buildShareText();}}catch(_){}
  }
}
$id('back-btn')?.addEventListener('click',()=>{$id('designer').classList.remove('open');document.body.style.overflow='';renderFeed();});

/* ════════════════════════════════════════════
   DESIGNER CONTROLS
   ════════════════════════════════════════════ */
function curSlide(){return d.type==='carousel'&&d.slides.length>0?d.slides[d.slide]:d;}

$id('ctrl-pub')?.addEventListener('change',function(){
  d.pub=this.value; d.upper=defaultUpper(d.pub); const uc=$id('ctrl-upper'); if(uc) uc.checked=d.upper;
  loadLogo(d.pub,d.logoVariant).then(renderBoth); buildShareText();
  if($id('dnav-title'))$id('dnav-title').textContent=pubCfg(d.pub).name+' — '+(d.headline||'');
});
['ctrl-kicker','ctrl-headline'].forEach(id=>{
  $id(id)?.addEventListener('input',function(){
    const sl=curSlide();
    if(id==='ctrl-kicker'){sl.kicker=this.value;if(sl===d)d.kicker=this.value;}
    if(id==='ctrl-headline'){sl.headline=this.value;if(sl===d)d.headline=this.value;buildShareText();}
    renderBoth();
    if(d.type==='carousel')renderCarouselPages();
  });
});
$id('ctrl-hl-color')?.addEventListener('input',function(){
  const sw=$id('hl-swatch');if(sw)sw.style.background=this.value;
  const sl=curSlide();sl.headlineColor=this.value;if(sl===d)d.headlineColor=this.value;renderBoth();
});
$id('ctrl-kicker-color')?.addEventListener('input',function(){
  const sw=$id('kicker-swatch');if(sw)sw.style.background=this.value;
  const sl=curSlide();sl.kickerColor=this.value;if(sl===d)d.kickerColor=this.value;renderBoth();
});
$id('ctrl-upper')?.addEventListener('change',function(){d.upper=this.checked;renderBoth();});
$id('ctrl-breaking')?.addEventListener('change',function(){d.breaking=this.checked;renderBoth();});
$id('ctrl-imgurl')?.addEventListener('change',reloadImg);
$id('ctrl-reload')?.addEventListener('click',reloadImg);
$id('ctrl-imgfile')?.addEventListener('change',function(){
  const f=this.files&&this.files[0]; if(!f)return;
  const fr=new FileReader();
  fr.onload=()=>{const img=new Image();img.onload=()=>{
    d.imgEl=img; d.imgUrl='';
    const sl=curSlide();
    if(sl!==d){sl.imgEl=img;sl.imgUrl='';sl.sqImgX=0;sl.sqImgY=0;sl.sqImgScale=1;sl.reelImgX=0;sl.reelImgY=0;sl.reelImgScale=1;}
    else{d.sqImgX=0;d.sqImgY=0;d.sqImgScale=1;d.reelImgX=0;d.reelImgY=0;d.reelImgScale=1;}
    sv('ctrl-imgurl','');renderBoth();if(d.type==='carousel')renderCarouselPages();
  };img.src=fr.result;};
  fr.readAsDataURL(f); this.value='';
});
async function reloadImg(){
  const url=gv('ctrl-imgurl').trim();d.imgUrl=url;d.imgEl=null;
  d.sqImgX=0;d.sqImgY=0;d.sqImgScale=1;d.reelImgX=0;d.reelImgY=0;d.reelImgScale=1;
  if(url){d.imgEl=await loadImgCORS(WORKER+'/image?url='+encodeURIComponent(url));if(!d.imgEl)d.imgEl=await loadImgDirect(url);}
  const sl=curSlide();if(sl!==d){sl.imgUrl=url;sl.imgEl=d.imgEl;sl.sqImgX=0;sl.sqImgY=0;sl.sqImgScale=1;sl.reelImgX=0;sl.reelImgY=0;sl.reelImgScale=1;}
  renderBoth();if(d.type==='carousel')renderCarouselPages();
}
$id('pos-grid')?.addEventListener('click',e=>{const b=e.target.closest('.pos-btn');if(!b)return;$id('pos-grid').querySelectorAll('.pos-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');d.textPos=b.dataset.pos;renderBoth();});
$id('reel-pos-grid')?.addEventListener('click',e=>{const b=e.target.closest('.pos-btn');if(!b)return;$id('reel-pos-grid').querySelectorAll('.pos-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');d.reelTextPos=b.dataset.pos;renderBoth();});
$id('logo-variant-grid')?.addEventListener('click',e=>{const b=e.target.closest('.pos-btn');if(!b)return;$id('logo-variant-grid').querySelectorAll('.pos-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');d.logoVariant=b.dataset.logo;loadLogo(d.pub,d.logoVariant).then(renderBoth);});

/* Card type toggle */
$id('type-toggle')?.addEventListener('click',e=>{
  const b=e.target.closest('.tt-btn');if(!b)return;
  document.querySelectorAll('.tt-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  d.type=b.dataset.type;
  if(d.type==='carousel'&&d.slides.length===0)addSlide();
  const ie=$id('info-editor'); if(ie) ie.style.display=d.type==='infographic'?'block':'none';
  if(d.type==='infographic') seedInfographic();
  $id('btn-dl-all').style.display=d.type==='carousel'?'inline-block':'none';
  updateCarouselUI();renderBoth();
});
function addSlide(){d.slides.push({kicker:d.kicker,headline:d.headline,headlineColor:d.headlineColor,kickerColor:d.kickerColor,imgUrl:d.imgUrl,imgEl:d.imgEl,sqImgX:0,sqImgY:0,sqImgScale:1,reelImgX:0,reelImgY:0,reelImgScale:1});d.slide=d.slides.length-1;}
function syncSlideUI(){const sl=d.slides[d.slide];if(!sl)return;sv('ctrl-kicker',sl.kicker);sv('ctrl-headline',sl.headline);sv('ctrl-imgurl',sl.imgUrl||'');sv('ctrl-hl-color',sl.headlineColor||'#FFFFFF');sv('ctrl-kicker-color',sl.kickerColor||'#FFFFFF');const hs=$id('hl-swatch');if(hs)hs.style.background=sl.headlineColor||'#FFFFFF';const ks=$id('kicker-swatch');if(ks)ks.style.background=sl.kickerColor||'#FFFFFF';}
function updateCarouselUI(){const bar=$id('carousel-bar'),ind=$id('c-indicator'),isC=d.type==='carousel';if(bar)bar.style.display=isC?'flex':'none';if(ind)ind.textContent=isC?`${d.slides.length} page${d.slides.length===1?'':'s'} — editing page ${d.slide+1}`:'';renderCarouselPages();}
function renderCarouselPages(){
  const wrap=$id('carousel-pages');if(!wrap)return;
  if(d.type!=='carousel'||!d.slides.length){wrap.style.display='none';wrap.innerHTML='';return;}
  wrap.style.display='flex';
  wrap.innerHTML=d.slides.map((sl,i)=>{
    const hl=(sl.headline||'').trim()||'(no headline)';
    const hasImg=!!(sl.imgUrl||sl.imgEl);
    return `<div class="cpage${i===d.slide?' active':''}" data-i="${i}"><div class="cpage-num">${i+1}</div><div class="cpage-body"><div class="cpage-hl">${esc(hl.slice(0,90))}</div><div class="cpage-meta">${esc(sl.kicker||'')}${hasImg?' · has image':' · no image'}</div></div></div>`;
  }).join('');
}
$id('carousel-pages')?.addEventListener('click',e=>{const p=e.target.closest('.cpage');if(!p)return;const i=+p.dataset.i;if(isNaN(i)||i===d.slide)return;d.slide=i;syncSlideUI();updateCarouselUI();renderBoth();});
$id('c-add')?.addEventListener('click',()=>{addSlide();syncSlideUI();updateCarouselUI();renderBoth();});
$id('c-del')?.addEventListener('click',()=>{if(d.slides.length<=1)return;d.slides.splice(d.slide,1);d.slide=Math.min(d.slide,d.slides.length-1);syncSlideUI();updateCarouselUI();renderBoth();});

/* Infographic */
function seedInfographic(){const ta=$id('info-points'),src=$id('info-source');if(ta)ta.value=(d.points||[]).join('\n');if(src)src.value=d.source||pubCfg(d.pub).name;}
$id('info-points')?.addEventListener('input',function(){d.points=this.value.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,4);renderBoth();});
$id('info-source')?.addEventListener('input',function(){d.source=this.value;renderBoth();});
$id('info-gen')?.addEventListener('click',genInfographicPoints);
async function genInfographicPoints(){
  const btn=$id('info-gen'),hint=$id('info-hint'),ta=$id('info-points');if(!btn)return;
  const orig=btn.textContent;btn.disabled=true;btn.textContent='✨ Generating…';
  if(hint)hint.textContent='Asking AI to summarise the story…';
  try{
    const prompt='You are a South African news editor. From the headline and summary below, write the 4 most important factual key points for a social-media infographic. Each point: one short punchy sentence, max 14 words, no numbering, plain text. Return ONLY a JSON array of 4 strings.\n\nHeadline: '+(d.headline||'')+'\nSummary: '+(d.excerpt||'');
    const res=await fetch(AI_WORKER+'/claude',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:400,messages:[{role:'user',content:prompt}]})});
    const data=await res.json();
    let txt='';if(data&&data.content)txt=data.content.filter(b=>b.type==='text').map(b=>b.text).join('');
    txt=txt.replace(/```json|```/g,'').trim();
    const arr=JSON.parse(txt);
    if(Array.isArray(arr)&&arr.length){d.points=arr.map(s=>String(s).trim()).filter(Boolean).slice(0,4);if(ta)ta.value=d.points.join('\n');if(hint)hint.textContent='AI draft ready — edit freely above.';renderBoth();}
    else throw new Error('bad shape');
  }catch(e){if(hint)hint.textContent='AI generation failed — type points manually, or try again.';}
  finally{btn.disabled=false;btn.textContent=orig;}
}

/* Image toolbar + drag/zoom */
$id('itb-zoom-in')?.addEventListener('click',()=>{const sl=curSlide();sl.sqImgScale=Math.min(3,(sl.sqImgScale||1)+0.1);sl.reelImgScale=Math.min(3,(sl.reelImgScale||1)+0.1);renderBoth();});
$id('itb-zoom-out')?.addEventListener('click',()=>{const sl=curSlide();sl.sqImgScale=Math.max(0.2,(sl.sqImgScale||1)-0.1);sl.reelImgScale=Math.max(0.2,(sl.reelImgScale||1)-0.1);renderBoth();});
$id('itb-reset')?.addEventListener('click',()=>{const sl=curSlide();sl.sqImgX=0;sl.sqImgY=0;sl.sqImgScale=1;sl.reelImgX=0;sl.reelImgY=0;sl.reelImgScale=1;renderBoth();});
const _csq=$id('card-canvas-sq');
if(_csq){
  _csq.addEventListener('mousedown',e=>{d.dragging=true;d.draggingTarget='sq';d.dsx=e.clientX;d.dsy=e.clientY;const sl=curSlide();d.dox=sl.sqImgX||0;d.doy=sl.sqImgY||0;e.preventDefault();});
  _csq.addEventListener('wheel',e=>{e.preventDefault();const sl=curSlide();sl.sqImgScale=Math.max(0.2,Math.min(3,(sl.sqImgScale||1)-e.deltaY*0.001));renderBoth();},{passive:false});
}
const _crl=$id('card-canvas-reel');
if(_crl){
  _crl.addEventListener('mousedown',e=>{d.dragging=true;d.draggingTarget='reel';d.dsx=e.clientX;d.dsy=e.clientY;const sl=curSlide();d.dox=sl.reelImgX||0;d.doy=sl.reelImgY||0;e.preventDefault();});
  _crl.addEventListener('wheel',e=>{e.preventDefault();const sl=curSlide();sl.reelImgScale=Math.max(0.2,Math.min(3,(sl.reelImgScale||1)-e.deltaY*0.001));renderBoth();},{passive:false});
}
window.addEventListener('mousemove',e=>{
  if(!d.dragging)return;const sl=curSlide();
  if(d.draggingTarget==='sq'&&_csq){const r=_csq.getBoundingClientRect(),k=SQ/r.width;sl.sqImgX=d.dox+(e.clientX-d.dsx)*k;sl.sqImgY=d.doy+(e.clientY-d.dsy)*k;}
  else if(d.draggingTarget==='reel'&&_crl){const r=_crl.getBoundingClientRect(),k=RW/r.width;sl.reelImgX=d.dox+(e.clientX-d.dsx)*k;sl.reelImgY=d.doy+(e.clientY-d.dsy)*k;}
  renderBoth();
});
window.addEventListener('mouseup',()=>{d.dragging=false;});

/* Share text */
$id('copy-share-btn')?.addEventListener('click',function(){const t=gv('ctrl-share');if(!t)return;navigator.clipboard.writeText(t).then(()=>{const o=this.textContent;this.textContent='Copied!';setTimeout(()=>this.textContent=o,1600);});});
function firstSentence(txt){if(!txt)return'';const t=txt.trim().replace(/\s+/g,' ');const m=t.match(/^.*?[.!?](?=\s|$)/);let s=(m?m[0]:t).trim();const MAX=140;if(s.length>MAX){let cut=s.slice(0,MAX);const sp=cut.lastIndexOf(' ');if(sp>60)cut=cut.slice(0,sp);s=cut.replace(/[\s.,;:!?-]+$/,'')+'…';}return s;}
function buildShareText(){
  const p=pubCfg(d.pub);
  const tag='#'+p.city.replace(/\s+/g,'')+' #'+p.name.replace(/[^A-Za-z]/g,'')+' #CCMG';
  const url=d.shortUrl||d.storyUrl;
  const urlLine=url?'\n\n🔗 '+url:'';
  const hl=stripStars(d.headline||'');
  const intro=firstSentence(d.excerpt);
  const body=intro&&intro.toLowerCase()!==hl.toLowerCase()?hl+'\n\n'+intro:hl;
  sv('ctrl-share',body+urlLine+'\n\n'+tag);
}

/* Downloads */
function dlCanvas(id,fn){const c=$id(id);if(!c)return;try{const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download=fn;a.click();}catch(e){alert('Right-click the card and choose "Save image as".');}}
function markDone(){if(d.storyId){markDoneInSupabase(doneKey(d.pub,d.storyId),stripStars(d.headline));renderFeed();}}
$id('btn-dl-sq')?.addEventListener('click',()=>{markDone();dlCanvas('card-canvas-sq',d.pub+'-square.png');});
$id('btn-dl-reel')?.addEventListener('click',()=>{markDone();dlCanvas('card-canvas-reel',d.pub+'-reel.png');});
$id('btn-dl-all')?.addEventListener('click',async()=>{
  markDone();
  if(d.type!=='carousel'||!d.slides.length){dlCanvas('card-canvas-sq',d.pub+'-square.png');dlCanvas('card-canvas-reel',d.pub+'-reel.png');return;}
  for(let i=0;i<d.slides.length;i++){d.slide=i;syncSlideUI();updateCarouselUI();await renderBoth();dlCanvas('card-canvas-sq',d.pub+'-sq-'+String(i+1).padStart(2,'0')+'.png');dlCanvas('card-canvas-reel',d.pub+'-reel-'+String(i+1).padStart(2,'0')+'.png');await new Promise(r=>setTimeout(r,220));}
});

/* ════════════════════════════════════════════
   RENDER PIPELINE
   ════════════════════════════════════════════ */
function stripStars(s){return String(s||'').replace(/\*/g,'');}
function parseHi(text,upper){
  text=text||''; if(upper)text=text.toUpperCase();
  const words=[]; let cur='', hi=false;
  const flush=()=>{ if(cur){words.push({text:cur,hi});cur='';} };
  for(const ch of text){ if(ch==='*'){flush();hi=!hi;} else if(ch===' '||ch==='\n'){flush();} else cur+=ch; }
  flush(); return words;
}
function wrapWords(ctx,words,maxW){
  const spaceW=ctx.measureText(' ').width;
  const lines=[]; let line=[], w=0;
  for(const word of words){
    const ww=ctx.measureText(word.text).width;
    const add=(line.length?spaceW:0)+ww;
    if(line.length && w+add>maxW){lines.push(line);line=[word];w=ww;}
    else{line.push(word);w+=add;}
  }
  if(line.length)lines.push(line);
  return lines;
}
function roundRect(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function drawTracked(ctx,text,x,y,tr){let cx=x;for(const ch of text){ctx.fillText(ch,cx,y);cx+=ctx.measureText(ch).width+tr;}}
function measTracked(ctx,text,tr){let w=0;for(const ch of text)w+=ctx.measureText(ch).width+tr;return w-tr;}

function drawPhoto(ctx,p,W,H,imgX,imgY,scale){
  if(!p.imgEl)return;
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();
  const sc=Math.max(W/p.imgEl.width,H/p.imgEl.height)*(scale||1);
  ctx.drawImage(p.imgEl,(W-p.imgEl.width*sc)/2+(imgX||0),(H-p.imgEl.height*sc)/2+(imgY||0),p.imgEl.width*sc,p.imgEl.height*sc);
  ctx.restore();
}
function drawPhotoAndOverlay(ctx,p,W,H,imgX,imgY,scale){
  ctx.fillStyle='#111';ctx.fillRect(0,0,W,H);
  drawPhoto(ctx,p,W,H,imgX,imgY,scale);
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'rgba(0,0,0,0.34)');g.addColorStop(0.34,'rgba(0,0,0,0.12)');
  g.addColorStop(0.60,'rgba(0,0,0,0.44)');g.addColorStop(1,'rgba(0,0,0,0.90)');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}

function drawBottomBar(ctx,p,W,H,isReel){
  const pub=pubCfg(p.pub), barH=isReel?98:82;
  ctx.fillStyle=pub.color;ctx.fillRect(0,H-barH,W,barH);
  ctx.fillStyle='rgba(255,255,255,0.18)';ctx.fillRect(0,H-barH,W,3);
  const text=(pub.site||'').toUpperCase();
  ctx.save();ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='middle';
  const pad=isReel?64:52, tr=isReel?1.4:1.1;
  let fs=isReel?31:26;ctx.font=`600 ${fs}px Oswald,Poppins,sans-serif`;
  while(measTracked(ctx,text,tr)>W-2*pad && fs>13){fs-=1;ctx.font=`600 ${fs}px Oswald,Poppins,sans-serif`;}
  drawTracked(ctx,text,pad,H-barH/2+1,tr);
  ctx.restore();
  return barH;
}

function drawLogoChip(ctx,p,x,y,isReel){
  const pub=pubCfg(p.pub), white=p.logoVariant==='white', logo=LOGO_CACHE[p.pub+':'+(white?'white':'colour')];
  const pad=isReel?18:15, maxH=isReel?112:94, maxW=(isReel?RW:SQ)*0.58;
  let lw=maxW,lh=maxH;
  if(logo){const sc=Math.min(maxW/logo.width,maxH/logo.height);lw=logo.width*sc;lh=logo.height*sc;}
  // Boxed mastheads (solid colour box with white type) already are their own
  // chip, so draw them straight onto the photo with a soft shadow.
  if(logo && pub.boxed && !white){
    const bh=isReel?140:118, bw=Math.min(maxW*1.05,logo.width*(bh/logo.height)), bhh=logo.height*(bw/logo.width);
    ctx.save();ctx.shadowColor='rgba(0,0,0,0.4)';ctx.shadowBlur=isReel?18:12;ctx.shadowOffsetY=3;
    ctx.imageSmoothingQuality='high';ctx.drawImage(logo,x,y,bw,bhh);ctx.restore();
    return {w:bw,h:bhh,bottom:y+bhh};
  }
  const chipW=lw+2*pad, chipH=lh+2*pad, r=Math.min(12,chipH/4);
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.35)';ctx.shadowBlur=isReel?18:12;ctx.shadowOffsetY=3;
  // A white logo would vanish on a white chip, so back it with the brand colour.
  ctx.fillStyle=(white||pub.logoBox==='brand')?pub.color:'#FFFFFF';
  roundRect(ctx,x,y,chipW,chipH,r);ctx.fill();
  ctx.restore();
  if(logo){ctx.save();ctx.imageSmoothingQuality='high';ctx.drawImage(logo,x+pad,y+pad,lw,lh);ctx.restore();}
  return {w:chipW,h:chipH,bottom:y+chipH};
}

function drawKickerPill(ctx,p,text,x,y,isReel){
  const pub=pubCfg(p.pub), fs=isReel?34:30, tr=isReel?2:1.5, padX=isReel?26:22, h=isReel?60:52;
  const t=(text||'').toUpperCase();
  ctx.save();ctx.font=`800 ${fs}px Poppins,sans-serif`;ctx.textBaseline='middle';
  const tw=measTracked(ctx,t,tr), w=tw+2*padX;
  ctx.fillStyle=pub.color;roundRect(ctx,x,y,w,h,isReel?8:6);ctx.fill();
  ctx.fillStyle=p.kickerColor||'#FFFFFF';ctx.textAlign='left';
  drawTracked(ctx,t,x+padX,y+h/2+1,tr);
  ctx.restore();
  return h;
}

function drawBreakingBanner(ctx,p,W,isReel){
  const brand=pubCfg(p.pub).color, barH=isReel?120:96, cy=barH/2;
  const dotR=isReel?16:13, dotX=isReel?64:52, fs=isReel?52:42, tr=isReel?5:4, label='BREAKING NEWS';
  ctx.save();ctx.font=`900 ${fs}px Poppins,sans-serif`;
  const lw=measTracked(ctx,label,tr), tx=dotX+dotR+(isReel?26:20), padR=isReel?42:32;
  const barW=Math.min(W,tx+lw+padR);
  ctx.fillStyle=brand;ctx.fillRect(0,0,barW,barH);
  ctx.fillStyle='rgba(0,0,0,0.28)';ctx.fillRect(0,barH,barW,isReel?7:5);
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(dotX,cy,dotR,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=brand;ctx.beginPath();ctx.arc(dotX,cy,dotR*0.45,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='middle';
  drawTracked(ctx,label,tx,cy+2,tr);
  ctx.restore();
  return barH;
}

function drawTextBlock(ctx,p,W,H,isReel,areaTop,areaBottom){
  const brand=pubCfg(p.pub).color, M=isReel?64:56, maxW=W-2*M;
  const words=parseHi(p.headline,p.upper);
  const showKicker=!p.breaking && (p.kicker||'').trim().length>0;
  const kickerH=showKicker?(isReel?60:52):0, kickerGap=showKicker?(isReel?24:20):0;
  let fs=isReel?86:74; const minFs=isReel?46:38;
  let lines,lineH,blockH;
  while(true){
    ctx.font=`800 ${fs}px Poppins,sans-serif`;
    lines=wrapWords(ctx,words,maxW);
    lineH=Math.round(fs*1.06);
    blockH=kickerH+kickerGap+lines.length*lineH;
    if(blockH<=(areaBottom-areaTop)||fs<=minFs)break;
    fs-=2;
  }
  let top=p.textPos==='top'?areaTop:p.textPos==='mid'?areaTop+((areaBottom-areaTop)-blockH)/2:areaBottom-blockH;
  if(top<areaTop)top=areaTop;
  let y=top;
  if(showKicker){drawKickerPill(ctx,p,p.kicker,M,y,isReel);y+=kickerH+kickerGap;}
  ctx.save();ctx.font=`800 ${fs}px Poppins,sans-serif`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
  ctx.shadowColor='rgba(0,0,0,0.55)';ctx.shadowBlur=isReel?14:10;ctx.shadowOffsetY=2;
  const spaceW=ctx.measureText(' ').width;
  lines.forEach(line=>{let cx=M;const by=y+fs;line.forEach(word=>{ctx.fillStyle=word.hi?brand:(p.headlineColor||'#FFFFFF');ctx.fillText(word.text,cx,by);cx+=ctx.measureText(word.text).width+spaceW;});y+=lineH;});
  ctx.restore();
}

/* ── Panel card ───────────────────────────────────────────────────────────
   The Athlone News layout, now the house style for the CCMG titles: photo on
   top, solid brand panel beneath carrying the headline, a white READ MORE
   button and the site address, with two darker diagonal wedges bottom-right.
   Logo sits top-left on the photo via the usual chip logic, so boxed
   mastheads draw as-is and the rest get a chip.                            */
function shade(hex,f){
  const m=/^#?([0-9a-f]{6})$/i.exec(String(hex||'').trim());
  if(!m) return hex;
  const n=parseInt(m[1],16);
  const r=Math.round(((n>>16)&255)*f), g=Math.round(((n>>8)&255)*f), b=Math.round((n&255)*f);
  return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
}
function drawPanelCard(ctx,p,W,H,isReel){
  const cfg=pubCfg(p.pub);
  const brand=cfg.color||CCMG_BLUE;
  const dark=cfg.dark||shade(brand,0.78), darker=cfg.darker||shade(brand,0.55);
  const M=isReel?70:58;

  const panelTop=Math.round(H*(isReel?0.70:0.675));
  const panelH=H-panelTop;

  ctx.fillStyle='#111';ctx.fillRect(0,0,W,H);
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,panelTop);ctx.clip();
  drawPhoto(ctx,p,W,panelTop,isReel?p.reelImgX:p.sqImgX,isReel?p.reelImgY:p.sqImgY,(isReel?p.reelImgScale:p.sqImgScale)||1);
  ctx.restore();

  ctx.fillStyle=brand;ctx.fillRect(0,panelTop,W,panelH);
  ctx.save();ctx.beginPath();ctx.rect(0,panelTop,W,panelH);ctx.clip();
  ctx.fillStyle=dark;
  ctx.beginPath();ctx.moveTo(W*0.74,H);ctx.lineTo(W,panelTop+panelH*0.18);ctx.lineTo(W,H);ctx.closePath();ctx.fill();
  ctx.fillStyle=darker;
  ctx.beginPath();ctx.moveTo(W*0.88,H);ctx.lineTo(W,panelTop+panelH*0.52);ctx.lineTo(W,H);ctx.closePath();ctx.fill();
  ctx.restore();

  let bannerH=0; if(p.breaking) bannerH=drawBreakingBanner(ctx,p,W,isReel);
  drawLogoChip(ctx,p,M,(isReel?54:44)+bannerH,isReel);

  const innerW=W-M*2;
  const btnH=isReel?72:60, btnGap=isReel?28:22;
  const urlFs=isReel?28:24, urlGap=isReel?20:16;
  const padTop=isReel?44:34, padBot=isReel?36:30;
  const avail=panelH-padTop-padBot-btnH-btnGap-urlFs-urlGap;

  let fs=isReel?74:66, lines, lineH;
  while(true){
    ctx.font=`800 ${fs}px Poppins,sans-serif`;
    lines=wrapWords(ctx,parseHi(p.headline||'',false),innerW);
    lineH=Math.round(fs*1.12);
    if(lines.length*lineH<=avail||fs<=30)break;
    fs-=2;
  }

  let y=panelTop+padTop;
  ctx.save();
  ctx.font=`800 ${fs}px Poppins,sans-serif`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
  ctx.fillStyle='#FFFFFF';
  const spaceW=ctx.measureText(' ').width;
  lines.forEach(line=>{
    let cx=M;
    line.forEach(word=>{ctx.fillText(word.text,cx,y+fs);cx+=ctx.measureText(word.text).width+spaceW;});
    y+=lineH;
  });
  ctx.restore();

  // READ MORE button
  y+=btnGap;
  const label='READ MORE', bfs=isReel?30:26, btr=isReel?3:2.5;
  ctx.save();
  ctx.font=`800 ${bfs}px Poppins,sans-serif`;
  const tw=measTracked(ctx,label,btr);
  const arrowW=isReel?54:46, arrowGap=isReel?30:26, bpad=isReel?34:28;
  ctx.fillStyle='#FFFFFF';roundRect(ctx,M,y,tw+arrowW+arrowGap+bpad*2,btnH,isReel?8:6);ctx.fill();
  ctx.fillStyle=brand;ctx.textBaseline='middle';ctx.textAlign='left';
  const cy=y+btnH/2+1;
  drawTracked(ctx,label,M+bpad,cy,btr);
  const ax=M+bpad+tw+arrowGap;
  ctx.strokeStyle=brand;ctx.lineWidth=isReel?5:4;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(ax,cy);ctx.lineTo(ax+arrowW,cy);ctx.stroke();
  ctx.beginPath();ctx.moveTo(ax+arrowW-(isReel?18:15),cy-(isReel?14:12));ctx.lineTo(ax+arrowW,cy);
  ctx.lineTo(ax+arrowW-(isReel?18:15),cy+(isReel?14:12));ctx.stroke();
  ctx.restore();

  y+=btnH+urlGap;
  ctx.save();
  ctx.font=`500 ${urlFs}px Poppins,sans-serif`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
  ctx.fillStyle='rgba(255,255,255,0.95)';
  ctx.fillText((cfg.site||'').toLowerCase(),M,y+urlFs);
  ctx.restore();
}

function drawTitleCard(ctx,p,W,H,isReel){
  // Lifestyle titles get a softer, cleaner card of their own.
  const st=pubCfg(p.pub).style;
  if(st==='lifestyle') return drawLifestyleCard(ctx,p,W,H,isReel);
  if(st==='broadsheet') return drawBroadsheetCard(ctx,p,W,H,isReel);
  if(st==='magazine') return drawMagazineCard(ctx,p,W,H,isReel);
  if(st==='panel') return drawPanelCard(ctx,p,W,H,isReel);
  const imgX=isReel?p.reelImgX:p.sqImgX, imgY=isReel?p.reelImgY:p.sqImgY, sc=(isReel?p.reelImgScale:p.sqImgScale)||1;
  drawPhotoAndOverlay(ctx,p,W,H,imgX,imgY,sc);
  const barH=drawBottomBar(ctx,p,W,H,isReel);
  let bannerH=0; if(p.breaking) bannerH=drawBreakingBanner(ctx,p,W,isReel);
  const chip=drawLogoChip(ctx,p,isReel?64:56,(isReel?52:44)+bannerH,isReel);
  const areaTop=chip.bottom+(isReel?36:26);
  const areaBottom=H-barH-(isReel?40:30);
  const tp=isReel?p.reelTextPos:p.textPos;
  drawTextBlock(ctx,{...p,textPos:tp},W,H,isReel,areaTop,areaBottom);
}

/* ── Lifestyle card (CapeTowner) ──────────────────────────────────────────
   Deliberately softer than the newspaper mastheads: full-bleed photo, the
   round logo sitting top-left with no chip behind it, and a warm amber wash
   rising from the bottom that the headline sits on in navy. Sentence case,
   no heavy bottom bar — just the domain.                                   */
// Round logo keeps its original size; the wide CCMG masthead (the 'White'
// option) is sized by height so it doesn't shrink to a sliver.
function lifestyleLogoSize(logo,isReel){
  const s=isReel?200:172, ar=logo.width/logo.height;
  if(ar>2){ const h=isReel?104:88; return {w:h*ar,h}; }
  return {w:ar>=1?s:s*ar, h:ar>=1?s/ar:s};
}
function drawLifestyleCard(ctx,p,W,H,isReel){
  const cfg=pubCfg(p.pub), ink=cfg.ink||'#00183C';
  const M=isReel?74:62, RGB='240,168,48';

  // Photo, full bleed
  ctx.fillStyle='#111';ctx.fillRect(0,0,W,H);
  drawPhoto(ctx,p,W,H,isReel?p.reelImgX:p.sqImgX,isReel?p.reelImgY:p.sqImgY,(isReel?p.reelImgScale:p.sqImgScale)||1);

  // Breaking banner, same as the newspaper titles
  let bannerH=0; if(p.breaking) bannerH=drawBreakingBanner(ctx,p,W,isReel);

  // Logo, top-left, no chip
  const logo=LOGO_CACHE[p.pub+':'+(p.logoVariant==='white'?'white':'colour')];
  const logoTop=(isReel?58:48)+bannerH;
  let logoBottom=logoTop;
  if(logo){ logoBottom=logoTop+lifestyleLogoSize(logo,isReel).h; }

  // ── Lay the text out first, so the wash can follow it ──
  const footY=H-(isReel?76:60);
  const areaTop=logoBottom+(isReel?52:40);
  const areaBottom=footY-(isReel?58:44);
  const maxW=W-M*2;

  const showKicker=!p.breaking && (p.kicker||'').trim().length>0;
  const kfs=isReel?27:24, ktr=isReel?2.8:2.4;
  const kickerH=showKicker?kfs*2.05:0, kickerGap=showKicker?(isReel?40:32):0;

  let fs=isReel?74:64, lines, lineH, blockH;
  const minFs=isReel?38:34;
  while(true){
    ctx.font=`700 ${fs}px Poppins,sans-serif`;
    lines=wrapWords(ctx,(p.headline||'').split(/\s+/).filter(Boolean).map(t=>({text:t})),maxW);
    lineH=Math.round(fs*1.18);
    blockH=kickerH+kickerGap+lines.length*lineH;
    if(blockH<=(areaBottom-areaTop)||fs<=minFs)break;
    fs-=2;
  }
  const tp=isReel?p.reelTextPos:p.textPos;
  let top=tp==='top'?areaTop:tp==='mid'?areaTop+((areaBottom-areaTop)-blockH)/2:areaBottom-blockH;
  if(top<areaTop)top=areaTop;

  // ── Amber wash: fixed at the bottom of the card, regardless of where the
  //    text sits. ──
  const g=ctx.createLinearGradient(0,H*0.34,0,H);
  g.addColorStop(0,   `rgba(${RGB},0)`);
  g.addColorStop(0.42,`rgba(${RGB},0.52)`);
  g.addColorStop(0.72,`rgba(${RGB},0.88)`);
  g.addColorStop(1,   `rgba(${RGB},0.97)`);
  ctx.fillStyle=g;ctx.fillRect(0,H*0.34,W,H*0.66);

  // Logo drawn after the wash so it stays crisp
  if(logo){
    const {w:lw,h:lh}=lifestyleLogoSize(logo,isReel);
    ctx.save();ctx.shadowColor='rgba(0,0,0,0.28)';ctx.shadowBlur=isReel?22:16;ctx.shadowOffsetY=3;
    ctx.drawImage(logo,M,logoTop,lw,lh);ctx.restore();
  }

  // Footer domain
  ctx.save();
  ctx.font=`600 ${isReel?27:23}px Poppins,sans-serif`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
  ctx.fillStyle='rgba(0,24,60,0.62)';
  drawTracked(ctx,(cfg.site||'').toUpperCase(),M,footY,isReel?2.8:2.4);
  ctx.restore();

  // Kicker pill, navy on amber
  let y=top;
  if(showKicker){
    const kick=p.kicker.trim().toUpperCase();
    ctx.font=`700 ${kfs}px Poppins,sans-serif`;
    const tw=measTracked(ctx,kick,ktr), padX=kfs*0.95;
    ctx.fillStyle=ink;ctx.beginPath();ctx.roundRect(M,y,tw+padX*2,kickerH,kickerH/2);ctx.fill();
    ctx.fillStyle='#FFFFFF';ctx.textBaseline='middle';ctx.textAlign='left';
    drawTracked(ctx,kick,M+padX,y+kickerH/2+1,ktr);
    ctx.textBaseline='alphabetic';
    y+=kickerH+kickerGap;
  }

  // Headline — sentence case, navy
  ctx.save();
  ctx.font=`700 ${fs}px Poppins,sans-serif`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
  ctx.fillStyle=ink;
  const spaceW=ctx.measureText(' ').width;
  lines.forEach(line=>{
    let cx=M;const by=y+fs;
    line.forEach(word=>{ctx.fillText(word.text,cx,by);cx+=ctx.measureText(word.text).width+spaceW;});
    y+=lineH;
  });
  ctx.restore();
}

/* ── Broadsheet card (DFA) ────────────────────────────────────────────────
   A hard-news, newspaper-page look for the Diamond Fields Advertiser: clean
   photo, and a white "page" panel carrying the red DFA masthead, a red
   kicker, a heavy condensed black headline and a red-ruled footer with the
   domain. Text Position moves the panel: Bottom = flush to the foot of the
   card, Top = flush to the top, Middle = a floating inset panel.           */
function drawBroadsheetCard(ctx,p,W,H,isReel){
  const cfg=pubCfg(p.pub), RED=cfg.color, INK='#141414';
  const tp=isReel?p.reelTextPos:p.textPos;
  const floating=tp==='mid';
  const inset=floating?(isReel?56:44):0;
  const PX=(isReel?62:52)+(floating?8:0);     // panel inner padding (x)
  const PY=isReel?44:36;                      // panel inner padding (y)
  const panelW=W-inset*2, innerW=panelW-PX*2;

  // Photo, full bleed, with a light vignette only (the panel carries the text)
  ctx.fillStyle='#111';ctx.fillRect(0,0,W,H);
  drawPhoto(ctx,p,W,H,isReel?p.reelImgX:p.sqImgX,isReel?p.reelImgY:p.sqImgY,(isReel?p.reelImgScale:p.sqImgScale)||1);
  const vg=ctx.createLinearGradient(0,0,0,H);
  vg.addColorStop(0,'rgba(0,0,0,0.18)');vg.addColorStop(0.5,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.18)');
  ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);

  let bannerH=0; if(p.breaking) bannerH=drawBreakingBanner(ctx,p,W,isReel);

  // ── Measure: masthead row, headline, footer ──
  const logo=LOGO_CACHE[p.pub+':colour'];              // always the red DFA on white
  const logoH=isReel?76:64;
  const logoW=logo?logo.width*(logoH/logo.height):logoH*2.7;
  const showKicker=!p.breaking && (p.kicker||'').trim().length>0;
  const kfs=isReel?30:26;
  const rowH=logoH;
  const gapRow=isReel?30:24;
  const footH=isReel?64:54;
  const words=parseHi(p.headline,p.upper);
  const maxPanelH=H*(isReel?0.5:0.62)-bannerH*(tp==='top'?1:0);
  let fs=isReel?94:80; const minFs=isReel?48:40;
  let lines,lineH,panelH;
  while(true){
    ctx.font=`700 ${fs}px Oswald,Poppins,sans-serif`;
    lines=wrapWords(ctx,words,innerW);
    lineH=Math.round(fs*1.1);
    panelH=PY+rowH+gapRow+lines.length*lineH+(isReel?22:16)+footH;
    if(panelH<=maxPanelH||fs<=minFs)break;
    fs-=2;
  }
  const px=inset;
  let py = tp==='top' ? bannerH : floating ? Math.round((H-panelH)/2) : H-panelH;

  // ── Panel ──
  ctx.save();
  if(floating){ctx.shadowColor='rgba(0,0,0,0.45)';ctx.shadowBlur=isReel?40:30;ctx.shadowOffsetY=6;}
  ctx.fillStyle='#FFFFFF';ctx.fillRect(px,py,panelW,panelH);
  ctx.restore();
  const ruleH=isReel?12:10;
  // Red rule on the edge facing the photo
  ctx.fillStyle=RED;
  if(tp==='top') ctx.fillRect(px,py+panelH-ruleH,panelW,ruleH);
  else ctx.fillRect(px,py,panelW,ruleH);

  // Masthead row: DFA logo left, kicker right
  let y=py+PY;
  if(logo){ctx.save();ctx.imageSmoothingQuality='high';ctx.drawImage(logo,px+PX,y,logoW,logoH);ctx.restore();}
  if(showKicker){
    const kick=p.kicker.trim().toUpperCase(), ktr=isReel?3:2.5;
    ctx.save();ctx.font=`700 ${kfs}px Oswald,Poppins,sans-serif`;ctx.textBaseline='middle';
    const kw=measTracked(ctx,kick,ktr), sq=isReel?16:14;
    const kx=px+panelW-PX-kw, ky=y+rowH/2;
    ctx.fillStyle=RED;ctx.fillRect(kx-sq-(isReel?16:12),ky-sq/2,sq,sq);
    ctx.fillStyle=(p.kickerColor&&p.kickerColor.toUpperCase()!=='#FFFFFF')?p.kickerColor:RED;
    drawTracked(ctx,kick,kx,ky+1,ktr);
    ctx.restore();
  }
  y+=rowH+gapRow;

  // Headline — heavy condensed, black, *words* in DFA red
  const hlCol=(p.headlineColor&&p.headlineColor.toUpperCase()!=='#FFFFFF')?p.headlineColor:INK;
  ctx.save();ctx.font=`700 ${fs}px Oswald,Poppins,sans-serif`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
  const spaceW=ctx.measureText(' ').width;
  lines.forEach(line=>{let cx=px+PX;const by=y+fs*0.98;line.forEach(w=>{ctx.fillStyle=w.hi?RED:hlCol;ctx.fillText(w.text,cx,by);cx+=ctx.measureText(w.text).width+spaceW;});y+=lineH;});
  ctx.restore();
  y+=isReel?22:16;

  // Footer: hairline, domain in red, place in grey
  ctx.fillStyle='#DADADA';ctx.fillRect(px+PX,y,innerW,2);
  ctx.save();ctx.textBaseline='middle';
  const fy=y+footH/2+(tp==='top'?-ruleH/2:0);
  ctx.font=`600 ${isReel?28:24}px Oswald,Poppins,sans-serif`;ctx.fillStyle=RED;ctx.textAlign='left';
  drawTracked(ctx,(cfg.site||'').toUpperCase(),px+PX,fy,isReel?2.4:2);
  ctx.font=`500 ${isReel?24:20}px Poppins,sans-serif`;ctx.fillStyle='#777';
  const place=(cfg.city+' · '+cfg.region).toUpperCase(), ptr=isReel?2:1.6;
  drawTracked(ctx,place,px+panelW-PX-measTracked(ctx,place,ptr),fy,ptr);
  ctx.restore();
}

/* ── Magazine card (Bolander Lifestyle) ───────────────────────────────────
   Glossy-magazine feel: full-bleed photo inside a thin white frame, the
   magenta Bolander masthead top-left, a magenta wash that follows the text
   block (so Top / Middle / Bottom all read), a white kicker pill in magenta
   and a white sentence-case headline with *words* picked out in soft pink. */
function drawMagazineCard(ctx,p,W,H,isReel){
  const cfg=pubCfg(p.pub), MAG=cfg.color, RGB='183,32,121', PINK='#FFC6E4';
  const F=isReel?34:28;                 // frame inset
  const M=F+(isReel?48:40);             // content margin
  const tp=isReel?p.reelTextPos:p.textPos;

  ctx.fillStyle='#111';ctx.fillRect(0,0,W,H);
  drawPhoto(ctx,p,W,H,isReel?p.reelImgX:p.sqImgX,isReel?p.reelImgY:p.sqImgY,(isReel?p.reelImgScale:p.sqImgScale)||1);

  let bannerH=0; if(p.breaking) bannerH=drawBreakingBanner(ctx,p,W,isReel);

  // Masthead: colour = magenta box as-is; white = white type, no box
  const white=p.logoVariant==='white';
  const logo=LOGO_CACHE[p.pub+':'+(white?'white':'colour')];
  const logoTop=F+(isReel?40:32)+bannerH;
  const logoH=isReel?108:90;
  const logoW=logo?Math.min(W*0.62,logo.width*(logoH/logo.height)):0;
  const logoHH=logo?logo.height*(logoW/logo.width):0;

  const footY=H-F-(isReel?46:38);
  const areaTop=logoTop+logoHH+(isReel?56:44);
  const areaBottom=footY-(isReel?56:44);
  const maxW=W-M*2;

  const showKicker=!p.breaking && (p.kicker||'').trim().length>0;
  const kfs=isReel?27:24, ktr=isReel?3:2.6;
  const kickerH=showKicker?kfs*2.1:0, kickerGap=showKicker?(isReel?34:28):0;
  const words=parseHi(p.headline,p.upper);
  let fs=isReel?82:70, lines, lineH, blockH; const minFs=isReel?40:34;
  while(true){
    ctx.font=`700 ${fs}px Poppins,sans-serif`;
    lines=wrapWords(ctx,words,maxW);
    lineH=Math.round(fs*1.14);
    blockH=kickerH+kickerGap+lines.length*lineH;
    if(blockH<=(areaBottom-areaTop)||fs<=minFs)break;
    fs-=2;
  }
  let top=tp==='top'?areaTop:tp==='mid'?areaTop+((areaBottom-areaTop)-blockH)/2:areaBottom-blockH;
  if(top<areaTop)top=areaTop;

  // Magenta wash following the text block, always reaching the footer so
  // the domain stays legible.
  const wTop=Math.max(0,top-H*0.30), wBot=H;
  const g=ctx.createLinearGradient(0,wTop,0,wBot);
  const at=v=>Math.min(1,Math.max(0,(v-wTop)/(wBot-wTop)));
  g.addColorStop(0,`rgba(${RGB},0)`);
  g.addColorStop(at(top),`rgba(${RGB},0.72)`);
  g.addColorStop(at(top+blockH),`rgba(${RGB},0.90)`);
  g.addColorStop(1,`rgba(${RGB},0.94)`);
  ctx.fillStyle=g;ctx.fillRect(0,wTop,W,wBot-wTop);
  // Soft top shade so the masthead sits cleanly on busy photos
  const tg=ctx.createLinearGradient(0,0,0,H*0.28);
  tg.addColorStop(0,'rgba(0,0,0,0.30)');tg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=tg;ctx.fillRect(0,0,W,H*0.28);

  // Frame
  ctx.save();ctx.strokeStyle='rgba(255,255,255,0.92)';ctx.lineWidth=isReel?5:4;
  ctx.strokeRect(F,F+bannerH,W-2*F,H-2*F-bannerH);ctx.restore();

  // Masthead
  if(logo){ctx.save();ctx.shadowColor='rgba(0,0,0,0.35)';ctx.shadowBlur=isReel?20:14;ctx.shadowOffsetY=3;
    ctx.imageSmoothingQuality='high';ctx.drawImage(logo,M,logoTop,logoW,logoHH);ctx.restore();}

  // Kicker pill — white with magenta type
  let y=top;
  if(showKicker){
    const kick=p.kicker.trim().toUpperCase();
    ctx.save();ctx.font=`700 ${kfs}px Poppins,sans-serif`;
    const tw=measTracked(ctx,kick,ktr), padX=kfs*1.0;
    ctx.fillStyle='#FFFFFF';ctx.beginPath();ctx.roundRect(M,y,tw+padX*2,kickerH,kickerH/2);ctx.fill();
    ctx.fillStyle=(p.kickerColor&&p.kickerColor.toUpperCase()!=='#FFFFFF')?p.kickerColor:MAG;
    ctx.textBaseline='middle';ctx.textAlign='left';
    drawTracked(ctx,kick,M+padX,y+kickerH/2+1,ktr);
    ctx.restore();
    y+=kickerH+kickerGap;
  }

  // Headline
  ctx.save();ctx.font=`700 ${fs}px Poppins,sans-serif`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
  ctx.shadowColor='rgba(60,0,30,0.35)';ctx.shadowBlur=isReel?12:8;ctx.shadowOffsetY=2;
  const spaceW=ctx.measureText(' ').width;
  lines.forEach(line=>{let cx=M;const by=y+fs;line.forEach(w=>{ctx.fillStyle=w.hi?PINK:(p.headlineColor||'#FFFFFF');ctx.fillText(w.text,cx,by);cx+=ctx.measureText(w.text).width+spaceW;});y+=lineH;});
  ctx.restore();

  // Footer: short rule + domain
  ctx.save();
  ctx.fillStyle='#FFFFFF';ctx.fillRect(M,footY-(isReel?14:12),isReel?56:48,isReel?4:3);
  ctx.font=`600 ${isReel?26:22}px Poppins,sans-serif`;ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.fillStyle='rgba(255,255,255,0.95)';
  drawTracked(ctx,(cfg.site||'').toUpperCase(),M+(isReel?74:64),footY-(isReel?12:10),isReel?3:2.4);
  ctx.restore();
}

function drawInfographic(ctx,p,W,H,isReel){
  const brand=pubCfg(p.pub).color, M=isReel?70:56;
  ctx.fillStyle='#0E1114';ctx.fillRect(0,0,W,H);
  const photoH=Math.round(H*0.34);
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,photoH);ctx.clip();
  drawPhoto(ctx,p,W,photoH,isReel?p.reelImgX:p.sqImgX,isReel?p.reelImgY:p.sqImgY,(isReel?p.reelImgScale:p.sqImgScale)||1);
  const g=ctx.createLinearGradient(0,0,0,photoH);g.addColorStop(0,'rgba(0,0,0,0.15)');g.addColorStop(1,'rgba(14,17,20,0.96)');ctx.fillStyle=g;ctx.fillRect(0,0,W,photoH);
  ctx.restore();
  drawLogoChip(ctx,p,M,isReel?46:38,isReel);
  let y=photoH+(isReel?42:32);
  if((p.kicker||'').trim()){const kh=drawKickerPill(ctx,p,p.kicker,M,y,isReel);y+=kh+(isReel?26:20);}
  const hfs=isReel?64:52;
  ctx.font=`800 ${hfs}px Poppins,sans-serif`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
  const lines=wrapWords(ctx,parseHi(p.headline,p.upper),W-2*M).slice(0,3), lh=Math.round(hfs*1.08), spaceW=ctx.measureText(' ').width;
  lines.forEach(line=>{let cx=M;const by=y+hfs;line.forEach(w=>{ctx.fillStyle=w.hi?brand:'#fff';ctx.fillText(w.text,cx,by);cx+=ctx.measureText(w.text).width+spaceW;});y+=lh;});
  y+=isReel?30:20;
  const pfs=isReel?36:30, step=isReel?42:36;
  ctx.font=`500 ${pfs}px Poppins,sans-serif`;ctx.textAlign='left';
  (p.points||[]).slice(0,4).forEach(pt=>{
    const pl=wrapWords(ctx,parseHi(pt,false),W-2*M-40);
    ctx.fillStyle=brand;ctx.beginPath();ctx.arc(M+9,y+(isReel?18:15),isReel?9:7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#E8E8E8';
    pl.forEach((line,li)=>{let cx=M+34;const yy=y+(isReel?28:24)+li*step;line.forEach(w=>{ctx.fillText(w.text,cx,yy);cx+=ctx.measureText(w.text).width+ctx.measureText(' ').width;});});
    y+=(isReel?28:24)+pl.length*step+(isReel?18:14);
  });
  const barH=drawBottomBar(ctx,p,W,H,isReel);
  if((p.source||'').trim()){ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font=`500 ${isReel?26:22}px Poppins,sans-serif`;ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText('Source: '+p.source,M,H-barH-(isReel?24:18));}
}

async function renderBoth(){
  await loadLogo(d.pub,d.logoVariant);
  const sl=curSlide(), isSlide=sl!==d;
  const p={
    pub:d.pub,
    logoVariant:d.logoVariant||'colour',
    kicker: isSlide?(sl.kicker??''):(sl.kicker||d.kicker||''),
    headline: isSlide?(sl.headline??''):(sl.headline||d.headline||''),
    headlineColor: (isSlide?sl.headlineColor:(sl.headlineColor||d.headlineColor))||'#FFFFFF',
    kickerColor: (isSlide?sl.kickerColor:(sl.kickerColor||d.kickerColor))||'#FFFFFF',
    imgEl: isSlide?sl.imgEl:(sl.imgEl||d.imgEl),
    sqImgX:sl.sqImgX||0, sqImgY:sl.sqImgY||0, sqImgScale:sl.sqImgScale||1,
    reelImgX:sl.reelImgX||0, reelImgY:sl.reelImgY||0, reelImgScale:sl.reelImgScale||1,
    textPos:d.textPos||'bot', reelTextPos:d.reelTextPos||'bot',
    breaking:!!d.breaking, upper:!!d.upper, points:d.points||[], source:d.source||pubCfg(d.pub).name,
  };
  const csq=$id('card-canvas-sq');
  if(csq){csq.width=SQ;csq.height=SQ;const ctx=csq.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';if(d.type==='infographic')drawInfographic(ctx,p,SQ,SQ,false);else drawTitleCard(ctx,p,SQ,SQ,false);}
  const crl=$id('card-canvas-reel');
  if(crl){crl.width=RW;crl.height=RH;const ctx=crl.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';if(d.type==='infographic')drawInfographic(ctx,p,RW,RH,true);else drawTitleCard(ctx,p,RW,RH,true);}
}

/* ── Image loaders ── */
function loadImgCORS(src){return new Promise(res=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src;setTimeout(()=>res(null),10000);});}
function loadImgDirect(src){return new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src;setTimeout(()=>res(null),8000);});}

/* ════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════ */
if(!localStorage.getItem('ccmg_cards_user')){
  const name=prompt('Enter your name or initials (shown on team done-list):')||'Team';
  localStorage.setItem('ccmg_cards_user',name);
}
document.documentElement.style.setProperty('--pub', pubCfg(curPub).color);
preloadAllLogos();
buildPubPills();
buildPubSelect();
loadStories(false);
setInterval(loadDoneFromSupabase, 30000);
