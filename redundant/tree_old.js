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

const COUNTRY_PAGES = {
  'greece.html': {
    country: 'Greece',
    view: 'qvd_vw_greece'
  },
  
  'norway.html': {
    country: 'Norway',
    view: 'qvd_vw_norway'
  },
  
  'sweden.html': {
    country: 'Sweden',
    view: 'qvd_vw_sweden'
  },
  
  'denmark.html': {
    country: 'Denmark',
    view: 'qvd_vw_denmark'
  },
  
  'spain.html': {
    country: 'Spain',
    view: 'qvd_vw_spain'
  }
};

/*
 * Work out which HTML page is currently open.
 */
const CURRENT_PAGE =
  window.location.pathname.split('/').pop().toLowerCase();

/*
 * Will contain the country configuration on a country page,
 * or undefined on pages such as united_kingdom.html.
 */
const CURRENT_COUNTRY = COUNTRY_PAGES[CURRENT_PAGE];

/* Remember selection across reloads and default to 1:1 */
const BRANCH_PREF_KEY = 'qv_branch_selected';

let lastSelectedBranch =
  localStorage.getItem(BRANCH_PREF_KEY) || '1:1';

let allTreeRows = [];

let editMode = false;
let ignoreNextCardClick = false;


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

    ${editMode ? `
      <div class="drawer-editor-actions">
        <button
          type="button"
          class="make-space-left-btn"
          data-person-id="${safe(n.id)}"
        >
          Make space to left
        </button>
      </div>
    ` : ''}
      `;
      drawerBody().innerHTML = html;

  const makeSpaceButton =
  drawerBody().querySelector('.make-space-left-btn');

if (makeSpaceButton) {
  makeSpaceButton.addEventListener('click', async () => {
    const personId = makeSpaceButton.dataset.personId;

    const confirmed = window.confirm(
      'Move this person and every card to their right to create space for one additional card?'
    );

    if (!confirmed) return;

    makeSpaceButton.disabled = true;
    makeSpaceButton.textContent = 'Moving cards…';

    try {
      await makeSpaceToLeftOfPerson(personId);

      makeSpaceButton.textContent = 'Space created';

      closeDrawer();
    } catch (error) {
      console.error(error);

      alert(
        `The cards could not be moved: ${error.message}`
      );

      makeSpaceButton.disabled = false;
      makeSpaceButton.textContent = 'Make space to left';
    }
  });
}

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
function groupTriEdges() {
  const m = {};

  state.triEdges.forEach(function(t) {
    const k = parentsKey(t.parents[0], t.parents[1]);

    if (!m[k]) {
      m[k] = {
        parents: [].concat(t.parents).sort(),
        children: {},
        illegitimate: false
      };
    }

    m[k].children[t.child] = true;

    /*
     * If any child belonging to these parents is marked
     * illegitimate, make this family connector group dotted.
     */
    if (t.illegitimate) {
      m[k].illegitimate = true;
    }
  });

  const out = new Map();

  Object.keys(m).forEach(function(k) {
    out.set(k, {
      parents: m[k].parents,
      children: Object.keys(m[k].children),
      illegitimate: m[k].illegitimate
    });
  });

  return out;
}

function ensureBusElems(k){ return { stem:ensureLine('stem-'+k,'stem'), bus:ensureLine('bus-'+k,'bus') }; }
function ensureDropElem(k,cid){ return ensureLine('drop-'+k+'-'+cid,'drop'); }


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

/*
 * Illegitimate family groups use dotted descent lines.
 */
if (group.illegitimate) {
  stem.classList.add('dotted');
  bus.classList.add('dotted');
} else {
  stem.classList.remove('dotted');
  bus.classList.remove('dotted');
}
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

  if (group.illegitimate) {
  drop.classList.add('dotted');
} else {
  drop.classList.remove('dotted');
}

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

function updatePartner(a, b, illegitimate = false) {
  const A = cardRect(a);
  const B = cardRect(b);

  if (!A || !B) return;

  const id = partnerKey(a, b);
  const l = ensureLine(id, 'partner');

  if (illegitimate) {
    l.classList.add('dotted');
  } else {
    l.classList.remove('dotted');
  }

  l.setAttribute('x1', A.cx);
  l.setAttribute('y1', A.cy);
  l.setAttribute('x2', B.cx);
  l.setAttribute('y2', B.cy);
}

function updateAllPartners() {

  /*
   * Remove all currently drawn parent/partner lines.
   */
  svg.querySelectorAll('.partner').forEach(e => e.remove());

  const seen = {};

  /*
   * ---------------------------------------------------
   * FIRST: draw relationships implied by shared children
   * ---------------------------------------------------
   *
   * This ensures that two known parents get a horizontal
   * connecting line even if they are not listed as partners.
   */
  const parentGroups = groupTriEdges();

  parentGroups.forEach(function(group) {

    const a = group.parents[0];
    const b = group.parents[1];

    if (!a || !b) return;

    const k = partnerKey(a, b);

    seen[k] = true;

    updatePartner(
      a,
      b,
      !!group.illegitimate
    );
  });


  /*
   * ---------------------------------------------------
   * SECOND: ordinary partners
   * ---------------------------------------------------
   *
   * Draw any remaining relationships from the partners
   * database field.
   */
  Object.keys(state.nodes).forEach(function(id) {

    const n = state.nodes[id];

    (n.partners || []).forEach(function(p) {

      const k = partnerKey(id, p);

      /*
       * Don't redraw a relationship already created above.
       */
      if (seen[k]) return;

      seen[k] = true;

      updatePartner(id, p, false);
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
function renderNode(n) {
  let el = document.getElementById(n.id);

  if (!el) {
    el = document.createElement('div');
    el.id = n.id;
    el.className = 'person';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.dataset.pid = n.id;

    el.innerHTML = `
      <div class="avatar">
        <img alt="${n.name || 'photo'}">
      </div>

      <div class="details">
        <div class="name"></div>
        <div class="title1"></div>
        <div class="title"></div>
      </div>

      <div class="previous-titles-tooltip" role="tooltip">
        <div class="previous-titles-heading">Previous titles</div>
        <div class="previous-titles-text"></div>
      </div>
    `;

    cards.appendChild(el);

    el.addEventListener('pointerdown', event => {
      if (editMode) {
        startCardDrag(event, n.id);
      }
    });

    el.addEventListener('click', event => {
      if (ignoreNextCardClick) {
        ignoreNextCardClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      openDrawerFor(n.id);
    });

    el.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDrawerFor(n.id);
      }
    });
  }

 el.querySelector('.name').textContent = n.name || '';
 el.querySelector('.title1').textContent = n.title1 || '';
 el.querySelector('.title').textContent = n.title || '';

 const previousTitlesTooltip =
  el.querySelector('.previous-titles-tooltip');

 const previousTitlesText =
  el.querySelector('.previous-titles-text');

 if (n.previousTitles && String(n.previousTitles).trim() !== '') {
   previousTitlesText.textContent = n.previousTitles;
   previousTitlesTooltip.classList.add('has-content');
 } else {
   previousTitlesText.textContent = '';
   previousTitlesTooltip.classList.remove('has-content');
 }

 const img = el.querySelector('img');

  img.src = n.imgSrc || FALLBACK_IMAGE;
  img.onerror = function () {
    img.src = FALLBACK_IMAGE;
  };


  // Apply different styling depending on whether the person is living
  if (n.dod && String(n.dod).trim() !== "") {
    el.classList.add("deceased");
    el.classList.remove("living");
  } else {
    el.classList.add("living");
    el.classList.remove("deceased");
  }
  
  el.style.transform = `translate(${n.x}px, ${n.y}px)`;
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


function buildStateFromRows(rows) {
  const nodes = {};

  /*
   * Rows have already been filtered to the selected branch.
   * Do not use the database visible field here.
   */
  const filtered = rows;

  for (const r of filtered) {
    const id = String(r.id);

    nodes[id] = {
      id,
      name: r.name || id,
      title: r.title || '',
      title1: r.title1 || '',
      title2: r.title2 || '',
      previousTitles: r.previous_titles || '',
      dob: r.dob || '',
      dod: r.dod || '',
      biography: r.biography || '',
      imgSrc: r.img || r.image_url || '',
      x: toNum(r.x) != null ? toNum(r.x) : 100,
      y: toNum(r.y) != null ? toNum(r.y) : 100,
      motherId: r.mother_id || null,
      fatherId: r.father_id || null,

      parents: Array.isArray(r.parents)
        ? r.parents.filter(Boolean).map(String)
        : [],

      illegitimate:
        ('illegitimate' in r)
          ? toBool(r.illegitimate)
          : false,

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
  const p = parentIds.slice(0, 2).sort();

  triEdges.push({
    parents: [p[0], p[1]],
    child: id,
    illegitimate: !!child.illegitimate
  });

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


/* ===== Supabase tree loading ===== */

/*
 * Retrieve all people from the materialized view.
 *
 * Replace YOUR_ACTUAL_VIEW_NAME with the real name
 * of the materialized view in Supabase.
 */
/*
 * Retrieve every row from the materialized view.
 * Supabase normally returns no more than 1,000 rows per request,
 * so the records are loaded in batches.
 */
async function fetchRowsFromView() {
  const PAGE_SIZE = 1000;
  const allRows = [];

  /*
   * Country pages use their own Supabase view.
   * All other pages use qvd_website.
   */
  const sourceView = CURRENT_COUNTRY
    ? CURRENT_COUNTRY.view
    : 'qvd_website';

  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from(sourceView)
      .select('*')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw error;
    }

    const rows = data ?? [];

    allRows.push(...rows);

    if (rows.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  console.log(
    `Loaded ${allRows.length} tree records from ${sourceView}.`
  );

  return allRows;
}

/*
 * Load all rows and populate the branch dropdown.
 */
async function loadFromSupabase() {
  allTreeRows = await fetchRowsFromView();

  /*
   * NORWAY
   * -------
   * Display every row returned by vw_qvd_norway_4.
   * There is no Queen Victoria branch selector.
   */
 if (CURRENT_COUNTRY) {
    console.log(
      `Norway: displaying ${allTreeRows.length} people`
    );

    const newState = buildStateFromRows(allTreeRows);

    ensureWorldFitsForState(newState);

    state = newState;

    renderAll();

    return;
  }

  /*
   * UNITED KINGDOM
   * --------------
   * Continue using the existing Queen Victoria
   * branch-selection system.
   */
  populateBranchSelect(
    allTreeRows,
    lastSelectedBranch
  );

  const selectedBranch =
    branchSelect.value ||
    lastSelectedBranch ||
    '1:1';

  applyBranchSelection(selectedBranch);
}



/*
 * Populate the branch dropdown with Queen Victoria's
 * nine children: 1:1 through 1:9.
 */
function populateBranchSelect(allRows, selectedValue = '') {
  const CHILD_REGEX = /^1:[1-9]$/;

  const kids = (allRows || [])
    .map(row => {
      const id = String(row.id || '').trim();

      return {
        id,
        name: row.name || id
      };
    })
    .filter(person => CHILD_REGEX.test(person.id))
    .sort((a, b) => {
      const aNumber = Number(a.id.split(':')[1]);
      const bNumber = Number(b.id.split(':')[1]);

      return aNumber - bNumber;
    });

  branchSelect.innerHTML =
    '<option value="">— Select a branch —</option>';

  for (const child of kids) {
    const option = document.createElement('option');

    option.value = child.id;
    option.textContent = `${child.id} — ${child.name}`;

    branchSelect.appendChild(option);
  }

  const desired = selectedValue || '1:1';

  if (kids.some(child => child.id === desired)) {
    branchSelect.value = desired;
  }
}


/*
 * Display the selected branch locally.
 *
 * In addition to descendants within the selected ID prefix,
 * include their parents and partners. These supporting people
 * are needed so two-parent family-tree connectors can be drawn.
 *
 * This function does not update Supabase.
 */
function applyBranchSelection(selectedId) {
  if (!selectedId) return;

  lastSelectedBranch = selectedId;
  localStorage.setItem(BRANCH_PREF_KEY, selectedId);

  /*
   * Create lookups for resolving references either by ID
   * or by the person's name.
   */
  const rowById = new Map();
  const rowByName = new Map();

  allTreeRows.forEach(row => {
    const id = String(row.id || '').trim();

    if (!id) return;

    rowById.set(id, row);

    const nameKey = normKey(row.name);

    if (nameKey && !rowByName.has(nameKey)) {
      rowByName.set(nameKey, row);
    }
  });

  /*
   * Start with Queen Victoria, Prince Albert and everyone
   * whose ID belongs to the selected branch.
   */
  const includedIds = new Set();

  allTreeRows.forEach(row => {
    const id = String(row.id || '').trim();

    if (
      id === '1' ||
      id === '1a' ||
      id === selectedId ||
      id.startsWith(`${selectedId}:`)
    ) {
      includedIds.add(id);
    }
  });

  /*
   * Resolve a reference that might contain either an ID
   * or a person's name.
   */
  function resolveReference(reference) {
    const value = String(reference || '').trim();

    if (!value) return null;

    if (rowById.has(value)) {
      return rowById.get(value);
    }

    return rowByName.get(normKey(value)) || null;
  }

  /*
   * Include the parents and partners of every selected person.
   *
   * Repeat until nothing else needs to be added. This ensures,
   * for example, that a selected child brings in both parents,
   * and that a selected parent brings in their spouse.
   */
  let rowsAdded = true;

  while (rowsAdded) {
    rowsAdded = false;

    const idsToCheck = Array.from(includedIds);

    idsToCheck.forEach(id => {
      const row = rowById.get(id);

      if (!row) return;

      const relationshipReferences = [];

      /*
       * Parent fields.
       */
      if (row.mother_id) {
        relationshipReferences.push(row.mother_id);
      }

      if (row.father_id) {
        relationshipReferences.push(row.father_id);
      }

      if (Array.isArray(row.parents)) {
        relationshipReferences.push(...row.parents);
      }

      /*
       * Partner field. This handles arrays and text separated
       * by commas or semicolons through parsePartnerTokens().
       */
      relationshipReferences.push(
        ...parsePartnerTokens(row.partners)
      );

      relationshipReferences.forEach(reference => {
        const relatedRow = resolveReference(reference);

        if (!relatedRow) return;

        const relatedId = String(relatedRow.id || '').trim();

        if (relatedId && !includedIds.has(relatedId)) {
          includedIds.add(relatedId);
          rowsAdded = true;
        }
      });
    });
  }

  /*
   * Build the final set of rows in the original database order.
   */
  const branchRows = allTreeRows.filter(row => {
    const id = String(row.id || '').trim();

    return includedIds.has(id);
  });

  console.log(
    `Branch ${selectedId}: displaying ${branchRows.length} people`
  );

  const newState = buildStateFromRows(branchRows);

  ensureWorldFitsForState(newState);

  state = newState;

  renderAll();

  branchSelect.value = selectedId;
}










/* ===== Init ===== */
async function init() {
  world.classList.add('grid');
  world.style.setProperty('--gs', '40px');

  world.style.transform = `scale(${WORLD_SCALE})`;
  world.style.transformOrigin = 'top left';

  updateWorldSize();
  renderAll();

  try {
    //await initialiseEditorAuthentication();
    await loadFromSupabase();
  } catch (error) {
    console.error(error);
    alert(`Load failed: ${error.message}`);
  }
}

window.addEventListener('resize', function(){ updateWorldSize(); updateAllEdges(); });
document.getElementById('scroll').addEventListener('scroll', function(){ updateAllEdges(); });

if (branchSelect) {
  branchSelect.addEventListener('change', event => {
    const selectedId = event.target.value;

    if (selectedId) {
      applyBranchSelection(selectedId);
    }
  });
}

init();
