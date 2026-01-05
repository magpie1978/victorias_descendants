/* Supapabase setup */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* loads supabase client library from a CDN */
const SUPABASE_URL = 'https://eukgodthgusongsbhdwg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1a2dvZHRoZ3Vzb25nc2JoZHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NjI1NjAsImV4cCI6MjA2NzEzODU2MH0.e8Gm9utDCQWDjSOJgh-VBioCQFX_aAWXz8rzigFgh4s';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = supabase;

/* constants and constraints */
var CARD_W = 360, CARD_H = 120, PADDING = 200;  /* defines the size of each person card */
const WORLD_SCALE = 0.8; // 80% zoom for the tree canvas

/*const FALLBACK_IMAGE = "https://i.pinimg.com/736x/3f/3c/f8/3f3cf824ceb39fa5dbd00aa986e25f54.jpg";*/
const FALLBACK_IMAGE = "https://st4.depositphotos.com/9998432/22670/v/450/depositphotos_226700318-stock-illustration-person-gray-photo-placeholder-man.jpg";

/* keeps everything in memory - people, parent-child lines, two-parent bus connectors, nextID (used if you ever add nodes) */
function defaultState(){ return { nodes:{}, edges:[], triEdges:[], nextId:1 }; }
var state = defaultState();

/*grabs DOM elements - shortcuts to key elements so JS can interact with them */
var world=document.getElementById('world');
var svg=document.getElementById('connector');
var cards=document.getElementById('cards-root');
var scrollEl = document.getElementById('scroll');
var searchInput = document.getElementById('search');
var suggestBox = document.getElementById('suggest');
var branchSelect = document.getElementById('branchSelect');

/* Remember selection across reloads and default to 1:1 */
const BRANCH_PREF_KEY = 'qv_branch_selected';
let lastSelectedBranch = localStorage.getItem(BRANCH_PREF_KEY) || '1:1';
let didApplyDefault = false;

/* drawer (pop-out) references */
const drawer   = document.getElementById('drawer');
const backdrop = document.getElementById('backdrop');
const drawerBody = () => document.querySelector('.drawer-body');


/* ===== Drawer helpers ===== */

/* looks for the person in state.nodes[id] and builds HTML for their photo, name, titles, birth, death, biography
and inserts that HTML into the drawer */
function openDrawerFor(id) {
  const n = state.nodes[id];
  if (!n) return;

  const imgSrc = n.imgSrc || FALLBACK_IMAGE;
  const safe = (v) => (v == null || v === '') ? '—' : String(v);

  const html = `
    <div class="drawer-header">
      <img class="drawer-photo" alt="${safe(n.name)}" src="${imgSrc}" onerror="this.src='${FALLBACK_IMAGE}'" />
      <div>
        <div class="drawer-name">${safe(n.name)}</div>
        <div class="drawer-title1">${safe(n.title1)}</div>
        <div class="drawer-title2">${safe(n.title2)}</div>
        <div class="drawer-id">ID: ${safe(n.id)}</div>        
      </div>
    </div>

    <hr class="drawer-divider" />

    <div class="drawer-facts">
      <div class="drawer-facts-line">
        <span class="fact-label">born</span>
        <span class="fact-value">${safe(n.dob)}</span>
        <span class="fact-label">died</span>
        <span class="fact-value">${safe(n.dod)}</span>
      </div>
    </div>

    <div class="drawer-bio">${safe(n.biography)}</div>
  `;
  drawerBody().innerHTML = html;

  drawer.setAttribute('open', '');
  drawer.setAttribute('aria-hidden', 'false');
  backdrop.setAttribute('data-show', 'true');
  backdrop.setAttribute('aria-hidden', 'false');
}

/* hides the drawer and the backdrop */
function closeDrawer() {
  drawer.removeAttribute('open');
  drawer.setAttribute('aria-hidden', 'true');
  backdrop.removeAttribute('data-show');
  backdrop.setAttribute('aria-hidden', 'true');
}

/* event listeners for drawer close */
backdrop.addEventListener('click', closeDrawer);
window.addEventListener('keydown', function(e){ if (e.key === 'Escape' && drawer.hasAttribute('open')) closeDrawer(); });


/* ===== World sizing & connectors ===== */
function updateWorldSize(){
  var maxX=1200, maxY=800;
  Object.keys(state.nodes).forEach(function(id){
    var n=state.nodes[id];
    if(n.x+CARD_W>maxX) maxX=n.x+CARD_W;
    if(n.y+CARD_H>maxY) maxY=n.y+CARD_H;
  });
  maxX += PADDING; maxY += PADDING;
  world.style.width = Math.max(maxX, world.clientWidth) + 'px';
  world.style.height= Math.max(maxY, world.clientHeight) + 'px';
  svg.setAttribute('viewBox','0 0 '+world.clientWidth+' '+world.clientHeight);
}

function ensureWorldFitsForState(s) {
  var maxX = 1200, maxY = 800;
  Object.keys(s.nodes).forEach(function(id){
    var n = s.nodes[id];
    if (typeof n.x === 'number' && typeof n.y === 'number') {
      if (n.x + CARD_W > maxX) maxX = n.x + CARD_W;
      if (n.y + CARD_H > maxY) maxY = n.y + CARD_H;
    }
  });
  maxX += PADDING; maxY += PADDING;
  world.style.width  = maxX + 'px';
  world.style.height = maxY + 'px';
  svg.setAttribute('viewBox', '0 0 ' + maxX + ' ' + maxY);
}

function clamp0(v){ return Math.max(0, v); }

/* Use world-coordinate data, not DOM geometry */
function cardRect(id){
  const n = state.nodes[id];
  if (!n) return null;
  return {
    el: document.getElementById(id) || null,
    cx: n.x + CARD_W / 2,
    cy: n.y + CARD_H / 2,
    topx: n.x + CARD_W / 2,
    topy: n.y,
    bottomy: n.y + CARD_H
  };
}

function ensureLine(id,cls){
  var l=document.getElementById(id);
  if(!l){
    l=document.createElementNS('http://www.w3.org/2000/svg','line');
    l.id=id;
    l.classList.add(cls);
    l.setAttribute('vector-effect','non-scaling-stroke');
    svg.appendChild(l);
  }
  return l;
}

function removeById(id){ var el=document.getElementById(id); if(el) el.remove(); }


/* ===== Connectors ===== */
function drawEdge(e){
  var a=cardRect(e.from), b=cardRect(e.to); if(!a||!b) return;
  var id='edge-'+e.from+'-'+e.to; var l=ensureLine(id,'edge');
  if(e.dotted) l.classList.add('dotted'); else l.classList.remove('dotted');
  l.setAttribute('x1',a.cx); l.setAttribute('y1',a.cy);
  l.setAttribute('x2',b.cx); l.setAttribute('y2',b.cy);
}

function parentsKey(a,b){ var s=[a,b].sort(); return s[0]+'|'+s[1]; }
function groupTriEdges(){
  var m={};
  state.triEdges.forEach(function(t){
    var k=parentsKey(t.parents[0],t.parents[1]);
    if(!m[k]) m[k]={parents:[].concat(t.parents).sort(), children:{}};
    m[k].children[t.child]=true;
  });
  var out=new Map();
  Object.keys(m).forEach(function(k){
    out.set(k,{parents:m[k].parents, children:Object.keys(m[k].children)});
  });
  return out;
}

function ensureBusElems(k){ return { stem:ensureLine('stem-'+k,'stem'), bus:ensureLine('bus-'+k,'bus') }; }
function ensureDropElem(k,cid){ return ensureLine('drop-'+k+'-'+cid,'drop'); }

/*
function updateBusGroup(key, group){
  var p1=group.parents[0], p2=group.parents[1];
  var R1=cardRect(p1), R2=cardRect(p2); if(!R1||!R2) return;
  var mid={ x:(R1.cx+R2.cx)/2, y:(R1.cy+R2.cy)/2 };

  var children=group.children.map(function(id){ return {id:id, r:cardRect(id)}; }).filter(function(o){return !!o.r;});
  if(children.length===0) return;

  if(children.length===1){
    var r=children[0].r;
    var anchorY = (r.topy >= mid.y) ? r.topy : r.bottomy;
    var stem=ensureLine('stem-'+key,'stem');
    stem.classList.remove('dotted');
    stem.setAttribute('x1',mid.x); stem.setAttribute('y1',mid.y);
    stem.setAttribute('x2',r.topx); stem.setAttribute('y2',anchorY);
    removeById('bus-'+key);
    svg.querySelectorAll('[id^="drop-'+key+'-"]').forEach(function(el){el.remove();});
    return;
  }

  var xs=children.map(function(c){return c.r.topx;});
  var topYs=children.map(function(c){return c.r.topy;});
  var botYs=children.map(function(c){return c.r.bottomy;});
  var GAP_ABOVE=24, GAP_BELOW=24, MIN_STEM=24;
  var minTop=Math.min.apply(Math,topYs), maxBot=Math.max.apply(Math,botYs);
  var allBelow = minTop > mid.y, allAbove = maxBot < mid.y;
  var busY;
  if(allBelow){ busY=minTop-GAP_ABOVE; if(busY<mid.y+MIN_STEM) busY=mid.y+MIN_STEM; }
  else if(allAbove){ busY=maxBot+GAP_BELOW; if(busY>mid.y-MIN_STEM) busY=mid.y-MIN_STEM; }
  else{ busY=mid.y+MIN_STEM; }

  var minX=Math.min.apply(Math,xs), maxX=Math.max.apply(Math,xs);
  var elems=ensureBusElems(key), stem=elems.stem, bus=elems.bus;
  stem.setAttribute('x1',mid.x); stem.setAttribute('y1',mid.y);
  stem.setAttribute('x2',mid.x); stem.setAttribute('y2',busY);
  bus.setAttribute('x1',minX); bus.setAttribute('y1',busY);
  bus.setAttribute('x2',maxX); bus.setAttribute('y2',busY);

  var busAbove = busY <= minTop, busBelow = busY >= maxBot;
  var keep={};
  children.forEach(function(c){
    var r=c.r, drop=ensureDropElem(key,c.id);
    var anchorY= busAbove ? r.topy : (busBelow ? r.bottomy : (Math.abs(busY-r.topy)<=Math.abs(busY-r.bottomy)?r.topy:r.bottomy));
    drop.setAttribute('x1',r.topx); drop.setAttribute('y1',busY);
    drop.setAttribute('x2',r.topx); drop.setAttribute('y2',anchorY);
    keep[drop.id]=true;
  });
  svg.querySelectorAll('[id^="drop-'+key+'-"]').forEach(function(d){ if(!keep[d.id]) d.remove(); });
}
*/

function updateBusGroup(key, group){
  var p1 = group.parents[0], p2 = group.parents[1];
  var R1 = cardRect(p1), R2 = cardRect(p2);
  if (!R1 || !R2) return;

  var mid = { x:(R1.cx + R2.cx)/2, y:(R1.cy + R2.cy)/2 };

  // Find all children that currently have cards
  var children = group.children
    .map(id => ({ id:id, r:cardRect(id) }))
    .filter(o => !!o.r);
  if (children.length === 0) return;

  // X positions of children (top centre)
  var xs = children.map(c => c.r.topx);

  // Make sure the bus spans across the midpoint between the parents
  xs.push(mid.x);

  var topYs = children.map(c => c.r.topy);
  var botYs = children.map(c => c.r.bottomy);

  var GAP_ABOVE = 24, GAP_BELOW = 24, MIN_STEM = 24;
  var minTop = Math.min.apply(Math, topYs);
  var maxBot = Math.max.apply(Math, botYs);

  var allBelow = minTop > mid.y;
  var allAbove = maxBot < mid.y;
  var busY;

  if (allBelow) {
    busY = minTop - GAP_ABOVE;
    if (busY < mid.y + MIN_STEM) busY = mid.y + MIN_STEM;
  } else if (allAbove) {
    busY = maxBot + GAP_BELOW;
    if (busY > mid.y - MIN_STEM) busY = mid.y - MIN_STEM;
  } else {
    // children are on both sides or overlapping – just drop below parents
    busY = mid.y + MIN_STEM;
  }

  var minX = Math.min.apply(Math, xs);
  var maxX = Math.max.apply(Math, xs);

  var elems = ensureBusElems(key),
      stem  = elems.stem,
      bus   = elems.bus;

  // Vertical stem from parents' midpoint to the bus
  stem.classList.remove('dotted');
  stem.setAttribute('x1', mid.x);
  stem.setAttribute('y1', mid.y);
  stem.setAttribute('x2', mid.x);
  stem.setAttribute('y2', busY);

  // Horizontal bus (now guaranteed to pass across the midpoint)
  bus.setAttribute('x1', minX);
  bus.setAttribute('y1', busY);
  bus.setAttribute('x2', maxX);
  bus.setAttribute('y2', busY);

  var busAbove = busY <= minTop;
  var busBelow = busY >= maxBot;
  var keep = {};

  children.forEach(function(c){
    var r = c.r;
    var drop = ensureDropElem(key, c.id);

    // Attach to the nearer edge of the child card
    var anchorY;
    if (busAbove) {
      anchorY = r.topy;
    } else if (busBelow) {
      anchorY = r.bottomy;
    } else {
      anchorY = (Math.abs(busY - r.topy) <= Math.abs(busY - r.bottomy))
        ? r.topy
        : r.bottomy;
    }

    drop.setAttribute('x1', r.topx);
    drop.setAttribute('y1', busY);
    drop.setAttribute('x2', r.topx);
    drop.setAttribute('y2', anchorY);

    keep[drop.id] = true;
  });

  // Clean up any old drop lines that no longer belong to this group
  svg.querySelectorAll('[id^="drop-'+key+'-"]').forEach(function(d){
    if (!keep[d.id]) d.remove();
  });
}


/* ===== Partner connectors ===== */
function partnerKey(a,b){ const s = [a,b].sort(); return 'pt-' + s[0] + '-' + s[1]; }
function updatePartner(a,b){
  const A = cardRect(a), B = cardRect(b); if(!A||!B) return;
  const id = partnerKey(a,b);
  const l  = ensureLine(id, 'partner');
  l.setAttribute('x1', A.cx); l.setAttribute('y1', A.cy);
  l.setAttribute('x2', B.cx); l.setAttribute('y2', B.cy);
}
function updateAllPartners(){
  svg.querySelectorAll('.partner').forEach(e => e.remove());
  const seen = {};
  Object.keys(state.nodes).forEach(id => {
    const n = state.nodes[id];
    (n.partners || []).forEach(p => {
      const k = partnerKey(id, p);
      if (seen[k]) return;
      seen[k] = true;
      updatePartner(id, p);
    });
  });
}

function updateAllEdges(){
  svg.querySelectorAll('.edge').forEach(function(e){e.remove();});
  state.edges.forEach(drawEdge);
  svg.querySelectorAll('.stem,.bus,.drop').forEach(function(e){e.remove();});
  const groups=groupTriEdges(); groups.forEach(function(g,k){ updateBusGroup(k,g); });
  updateAllPartners();
}


/* ===== Rendering ===== */
function renderNode(n){
  var el=document.getElementById(n.id);
  if(!el){
    el=document.createElement('div'); el.id=n.id; el.className='person';
    el.setAttribute('role','button'); el.setAttribute('tabindex','0');
    el.dataset.pid = n.id;
    el.innerHTML='<div class="avatar"><img alt="'+(n.name||'photo')+'"></div>\
      <div class="details">\
        <div class="name"></div>\
        <div class="title1"></div>\
        <div class="title"></div>\
      </div>';
    cards.appendChild(el);
    el.addEventListener('click', function(){ openDrawerFor(n.id); });
    el.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openDrawerFor(n.id); }});
  }
  el.querySelector('.name').textContent=n.name||'';
  el.querySelector('.title1').textContent=n.title1||'';
  el.querySelector('.title').textContent=n.title||'';
  var img=el.querySelector('img');
  img.src = n.imgSrc || FALLBACK_IMAGE;
  img.onerror = function(){ img.src = FALLBACK_IMAGE; };
  el.style.transform='translate('+n.x+'px,'+n.y+'px)';
}
function renderAll(){
  cards.innerHTML='';
  Object.keys(state.nodes).forEach(function(id){ renderNode(state.nodes[id]); });
  updateWorldSize();
  updateAllEdges();
  dataReady = true;
}

/* ===== Search ===== */
var dataReady = false;
function norm(s){ return (s||'').toString().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,''); }

function focusPerson(id){
  const el = document.getElementById(id);
  if (!el) return;

  // Let the browser handle all the transforms & scaling:
  // this scrolls the #scroll container so the card is centred in view.
  el.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'center'
  });

  // Highlight flash + keyboard focus
  el.classList.remove('focus-flash');
  void el.offsetWidth;           // restart CSS animation
  el.classList.add('focus-flash');
  el.focus({ preventScroll: true });
}


function scoreMatch(n, q){
  const name = norm(n.name), title = norm(n.title);
  const exact = (name===q || title===q) ? 100 : 0;
  const starts = (name.startsWith(q) || title.startsWith(q)) ? 60 : 0;
  const includes = (name.includes(q) || title.includes(q)) ? 30 : 0;
  const idxName = name.indexOf(q);
  const idxTitle= title.indexOf(q);
  const posBonus = Math.max(0, 20 - Math.min(idxName<0?99:idxName, idxTitle<0?99:idxTitle));
  return exact || (starts + includes + posBonus);
}

function search(query){
  const q = norm(query.trim());
  if(!q) return [];
  return Object.values(state.nodes)
    .map(n=>({id:n.id, name:n.name||'', title:n.title||'', score:scoreMatch(n,q)}))
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score - a.score)
    .slice(0, 10);
}

function renderSuggestions(items){
  suggestBox.innerHTML = '';
  if(!items.length){ suggestBox.classList.remove('show'); return; }
  items.forEach((it, i)=>{
    const div = document.createElement('div');
    div.className = 'sug' + (i===0 ? ' active' : '');
    div.setAttribute('role','option');
    div.dataset.pid = it.id;
    div.innerHTML = `<div class="s-name">${it.name}</div><div class="s-title">${it.title}</div>`;
    div.addEventListener('click', ()=>{
      focusPerson(it.id);
      suggestBox.classList.remove('show');
    });
    suggestBox.appendChild(div);
  });
  suggestBox.classList.add('show');
}

function pickFirstSuggestion(){
  const first = suggestBox.querySelector('.sug');
  if(first){ focusPerson(first.dataset.pid); suggestBox.classList.remove('show'); }
}

searchInput.addEventListener('input', ()=>{
  if(!dataReady) return;
  renderSuggestions( searchInput.value ? search(searchInput.value) : [] );
});

searchInput.addEventListener('keydown', (e)=>{
  if(e.key==='Enter'){
    e.preventDefault();
    pickFirstSuggestion();
  } else if(e.key==='Escape'){
    suggestBox.classList.remove('show');
    searchInput.blur();
  } else if(e.key==='ArrowDown' || e.key==='ArrowUp'){
    const items = Array.from(suggestBox.querySelectorAll('.sug'));
    if(!items.length){ return; }
    e.preventDefault();
    let idx = items.findIndex(x=>x.classList.contains('active'));
    if(e.key==='ArrowDown') idx = (idx+1) % items.length;
    else idx = (idx-1+items.length) % items.length;
    items.forEach(x=>x.classList.remove('active'));
    items[idx].classList.add('active');
    items[idx].scrollIntoView({block:'nearest'});
  } else if (e.key==='Tab'){
    const active = suggestBox.querySelector('.sug.active');
    if(active){
      e.preventDefault();
      focusPerson(active.dataset.pid);
      suggestBox.classList.remove('show');
    }
  }
});


/* ===== Supabase data loading (READ from view) ===== */
function toNum(v){ const n=Number(v); return isFinite(n)?n:null; }
function toBool(v){
  if (typeof v === 'boolean') return v;
  const s=String(v||'').trim().toLowerCase();
  return s==='true'||s==='1'||s==='yes'||s==='y';
}

function normKey(s){
  return (s||'').toString().toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ').trim();
}

function parsePartnerTokens(val){
  if (Array.isArray(val)) {
    return val.map(v=> (typeof v === 'string') ? v : (v && typeof v === 'object' ? (v.id || v.name || '') : '')).filter(Boolean);
  }
  
  if (val === null || val === undefined) return [];
  const s = String(val).trim(); if (!s) return [];
  return s.split(/[;,]/).map(t => t.trim()).filter(Boolean);
}

/*
function buildStateFromRows(rows){
  const nodes={};
  const filtered = rows.filter(r => typeof r.visible === 'boolean'
    ? r.visible
    : String(r.visible||'').trim().toLowerCase() === 'visible');
  for (const r of filtered){
    const id = String(r.id);
    nodes[id] = {
      id,
      name: r.name || id,
      title: r.title || '',
      title1: r.title1 || '',
      title2: r.title2 || '',
      dob: r.dob || '',
      dod: r.dod || '',
      biography: r.biography || '',
      imgSrc: r.img || r.image_url || '',
      x: toNum(r.x)!=null ? toNum(r.x) : 100,
      y: toNum(r.y)!=null ? toNum(r.y) : 100,
      motherId: r.mother_id || null,
      fatherId: r.father_id || null,
      parents: Array.isArray(r.parents) ? r.parents.filter(Boolean).map(String) : [],
      illegitimate: ('illegitimate' in r) ? toBool(r.illegitimate) : false,
      _partnerTokens: parsePartnerTokens(r.partners)
    };
  }
  const idSet = new Set(Object.keys(nodes));
  const nameToId = {};
  for (const id of Object.keys(nodes)){
    const key = normKey(nodes[id].name);
    if (key && !(key in nameToId)) nameToId[key] = id;
  }
  function resolvePartnerToken(tok){
    const s = String(tok||'').trim();
    if (!s) return null;
    if (idSet.has(s)) return s;
    return nameToId[normKey(s)] || null;
  }
  for (const id of Object.keys(nodes)){
    const n = nodes[id];
    const resolved = (n._partnerTokens || []).map(resolvePartnerToken)
      .filter(pid => pid && pid !== id && idSet.has(pid));
    n.partners = Array.from(new Set(resolved));
    delete n._partnerTokens;
  }
  for (const id of Object.keys(nodes)){
    const n = nodes[id];
    (n.partners||[]).forEach(pid=>{
      const other = nodes[pid];
      if (!other) return;
      if (!Array.isArray(other.partners)) other.partners = [];
      if (!other.partners.includes(id)) other.partners.push(id);
    });
  }
  const edges=[], triEdges=[];
  for (const id of Object.keys(nodes)){
    const child = nodes[id];
    let parentIds = Array.isArray(child.parents) ? child.parents.filter(Boolean) : [];
    if (parentIds.length === 0) {
      if (child.motherId) parentIds.push(child.motherId);
      if (child.fatherId) parentIds.push(child.fatherId);
    }
    parentIds = parentIds.filter(p => nodes[p]);
    if (parentIds.length >= 2){
      const p = parentIds.slice(0,2).sort();
      triEdges.push({ parents:[p[0],p[1]], child:id });
    } else if (parentIds.length === 1){
      const p = parentIds[0];
      const dotted = !!child.illegitimate;
      const from = p < id ? p : id;
      const to   = p < id ? id : p;
      if(!edges.some(e=>e.from===from && e.to===to)){ edges.push({from,to,dotted}); }
    }
  }
  let maxN=0;
  Object.keys(nodes).forEach(id=>{
    const m=id.match(/\d+$/); if(m){ const v=parseInt(m[0],10); if(v>maxN) maxN=v; }
  });
  return { nodes, edges, triEdges, nextId:maxN+1 };
}
*/

function buildStateFromRows(rows){
  const nodes = {};

  // 1) Build nodes
  const filtered = rows.filter(r =>
    typeof r.visible === 'boolean'
      ? r.visible
      : String(r.visible || '').trim().toLowerCase() === 'visible'
  );

  for (const r of filtered){
    const id = String(r.id);
    nodes[id] = {
      id,
      name: r.name || id,
      title: r.title || '',
      title1: r.title1 || '',
      title2: r.title2 || '',
      dob: r.dob || '',
      dod: r.dod || '',
      biography: r.biography || '',
      imgSrc: r.img || r.image_url || '',
      x: toNum(r.x) != null ? toNum(r.x) : 100,
      y: toNum(r.y) != null ? toNum(r.y) : 100,
      motherId: r.mother_id || null,
      fatherId: r.father_id || null,
      // keep whatever is in the parents array for now
      parents: Array.isArray(r.parents) ? r.parents.filter(Boolean).map(String) : [],
      illegitimate: ('illegitimate' in r) ? toBool(r.illegitimate) : false,
      _partnerTokens: parsePartnerTokens(r.partners)
    };
  }

  // 2) Build lookup helpers (for partner resolution)
  const idSet   = new Set(Object.keys(nodes));
  const nameToId = {};
  for (const id of Object.keys(nodes)){
    const key = normKey(nodes[id].name);
    if (key && !(key in nameToId)) nameToId[key] = id;
  }

  function resolvePartnerToken(tok){
    const s = String(tok || '').trim();
    if (!s) return null;
    if (idSet.has(s)) return s;       // matches an id directly
    return nameToId[normKey(s)] || null; // fall back to name
  }

  // 3) Resolve partners
  for (const id of Object.keys(nodes)){
    const n = nodes[id];
    const resolved = (n._partnerTokens || [])
      .map(resolvePartnerToken)
      .filter(pid => pid && pid !== id && idSet.has(pid));
    n.partners = Array.from(new Set(resolved));
    delete n._partnerTokens;
  }

  // Ensure partner arrays are symmetric
  for (const id of Object.keys(nodes)){
    const n = nodes[id];
    (n.partners || []).forEach(pid => {
      const other = nodes[pid];
      if (!other) return;
      if (!Array.isArray(other.partners)) other.partners = [];
      if (!other.partners.includes(id)) other.partners.push(id);
    });
  }

  // 4) Build edges (single-parent) and triEdges (two-parent bus groups)
  const edges    = [];
  const triEdges = [];

  for (const id of Object.keys(nodes)){
    const child = nodes[id];

    // NEW: merge *all* possible parent sources
    let parentIds = [];

    if (Array.isArray(child.parents)) {
      parentIds.push(...child.parents.filter(Boolean));
    }
    if (child.motherId) parentIds.push(child.motherId);
    if (child.fatherId) parentIds.push(child.fatherId);

    // Remove duplicates, and only keep parents that exist as nodes
    parentIds = Array.from(new Set(parentIds.map(String)))
                     .filter(p => nodes[p]);

    if (parentIds.length >= 2){
      // use first two parents for the bus connector
      const p = parentIds.slice(0, 2).sort();
      triEdges.push({ parents: [p[0], p[1]], child: id });
    } else if (parentIds.length === 1){
      const p = parentIds[0];
      const dotted = !!child.illegitimate;
      const from = p < id ? p : id;
      const to   = p < id ? id : p;

      if (!edges.some(e => e.from === from && e.to === to)) {
        edges.push({ from, to, dotted });
      }
    }
  }

  // 5) Work out nextId (for future node-adding features)
  let maxN = 0;
  Object.keys(nodes).forEach(id => {
    const m = id.match(/\d+$/);
    if (m) {
      const v = parseInt(m[0], 10);
      if (v > maxN) maxN = v;
    }
  });

  return { nodes, edges, triEdges, nextId: maxN + 1 };
}



/* Read from VIEW */
async function fetchRowsFromView({ onlyVisible = true } = {}){
  let query = supabase.from('qvd_website').select('*');
  if (onlyVisible) query = query.eq('visible', 'visible');
  query = query.order('gen', { ascending: true }).order('id', { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}


/* Load + build + render. Populate dropdown from ALL rows (view) */
async function loadFromSupabase(){
  const [rowsVisible, rowsAll] = await Promise.all([
    fetchRowsFromView({ onlyVisible:true }),
    fetchRowsFromView({ onlyVisible:false })
  ]);

  let newState = buildStateFromRows(rowsVisible);
  ensureWorldFitsForState(newState);
  state = newState;
  renderAll();

  populateBranchSelect(rowsAll, lastSelectedBranch);

  if (!didApplyDefault) {
    didApplyDefault = true;
    const choice = branchSelect.value || '1:1';
    if (choice) {
      await applyBranchVisibility(choice);
    }
  }
}


/* Populate branch dropdown with exactly 1:1 .. 1:9 */
function populateBranchSelect(allRows, selectedValue = ''){
  const CHILD_REGEX = /^1:[1-9]$/;
  const kids = (allRows || [])
    .map(r => ({ id: String(r.id).trim(), name: r.name || String(r.id).trim() }))
    .filter(r => CHILD_REGEX.test(r.id))
    .sort((a,b) => parseInt(a.id.split(':')[1],10) - parseInt(b.id.split(':')[1],10));

  branchSelect.innerHTML = '<option value="">— Select a branch —</option>';
  for (const k of kids){
    const opt = document.createElement('option');
    opt.value = k.id;
    opt.textContent = `${k.id} — ${k.name}`;
    branchSelect.appendChild(opt);
  }

  const desired = selectedValue || '1:1';
  if (desired && kids.some(k => k.id === desired)) {
    branchSelect.value = desired;
  }
}


/* ===== Apply branch visibility (WRITE to TABLE qvd_tree_positions) ===== */
async function applyBranchVisibility(selectedId){
  if (!selectedId) return;

  lastSelectedBranch = selectedId;
  localStorage.setItem(BRANCH_PREF_KEY, lastSelectedBranch);

  const tablePositions = supabase.from('qvd_tree_positions');

  branchSelect.disabled = true;
  try {
    {
      const { error } = await tablePositions
        .update({ visible: null })
        .neq('id', '1')
        .neq('id', '1a');
      if (error) throw new Error('Failed to clear (NULL) visibility: ' + error.message);
    }

    {
      const { error } = await tablePositions
        .update({ visible: 'visible' })
        .like('id', `${selectedId}%`);
      if (error) throw new Error('Failed to set branch visible: ' + error.message);
    }

    {
      const { error } = await tablePositions
        .update({ visible: 'visible' })
        .in('id', ['1','1a']);
      if (error) console.warn('Could not force 1/1a visible:', error);
    }

    await loadFromSupabase();
  } catch (err) {
    alert(err.message || String(err));
  } finally {
    branchSelect.disabled = false;
    branchSelect.value = lastSelectedBranch;
  }
}

/*
async function applyBranchVisibility(selectedId){
  if (!selectedId) return;

  lastSelectedBranch = selectedId;
  localStorage.setItem(BRANCH_PREF_KEY, lastSelectedBranch);

  const tablePositions = supabase.from('qvd_tree_positions');

  branchSelect.disabled = true;
  try {
    // 1) Clear visibility for everyone except 1 and 1a
    {
      const { error } = await tablePositions
        .update({ visible: null })
        .neq('id', '1')
        .neq('id', '1a');

      if (error) {
        console.error('Supabase error while clearing visibility:', error);
        const detail =
          (typeof error === 'string')
            ? error
            : (error.message || error.details || JSON.stringify(error));
        throw new Error('Failed to clear (NULL) visibility: ' + detail);
      }
    }

    // 2) Mark the selected branch as visible
    {
      const { error } = await tablePositions
        .update({ visible: 'visible' })
        .like('id', `${selectedId}%`);

      if (error) {
        console.error('Supabase error while setting branch visible:', error);
        const detail =
          (typeof error === 'string')
            ? error
            : (error.message || error.details || JSON.stringify(error));
        throw new Error('Failed to set branch visible: ' + detail);
      }
    }

    // 3) Always keep 1 and 1a visible (best-effort only)
    {
      const { error } = await tablePositions
        .update({ visible: 'visible' })
        .in('id', ['1','1a']);

      if (error) {
        console.warn('Could not force 1/1a visible:', error);
      }
    }

    await loadFromSupabase();
  } catch (err) {
    console.error('applyBranchVisibility failed:', err);
    alert(err.message || String(err));
  } finally {
    branchSelect.disabled = false;
    branchSelect.value = lastSelectedBranch;
  }
}
*/


/* ===== Init ===== */
function init(){
  world.classList.add('grid');
  world.style.setProperty('--gs', '40px');

  /* Apply the global scale so cards + connectors are zoomed as one */
  world.style.transform = `scale(${WORLD_SCALE})`;
  world.style.transformOrigin = 'top left';

  updateWorldSize();
  renderAll();
  loadFromSupabase().catch(err=>{ console.error(err); alert('Load failed: ' + err.message); });
}

window.addEventListener('resize', function(){ updateWorldSize(); updateAllEdges(); });
document.getElementById('scroll').addEventListener('scroll', function(){ updateAllEdges(); });
branchSelect.addEventListener('change', (e)=>{
  const sel = e.target.value;
  if (sel) {
    applyBranchVisibility(sel);
  }
});

init();
