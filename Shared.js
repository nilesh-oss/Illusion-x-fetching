/* =========================================================
   ILLUSION FETCHING — SHARED STATE (localStorage + Firebase)
   ========================================================= */

const IF_KEYS = {
  STATE: 'if_state_v2',
  SESSION: 'if_session_v2',
  USED_KEYS: 'if_used_keys_v2',
  VISITS: 'if_visits_v2',
  DEMO: 'if_demo_v2',
  ADMIN: 'if_admin_v2',
  FB_CONFIG: 'if_fb_config_v2'
};

const IF_DEFAULT_STATE = {
  branding: {
    title: 'ILLUSION X FETCHING',
    description: 'Advanced multi-source OSINT fetching platform.',
    logo: 'https://api.dicebear.com/7.x/bottts/svg?seed=IllusionFetching&backgroundColor=0f0809',
    favicon: '',
    coreImage: '',
    coreSize: 38,
    loadingLogo: '',
    loadingSize: 90
  },
  socials: [
    { id:'s1', name:'Telegram', url:'https://t.me/', icon:'telegram' },
    { id:'s2', name:'WhatsApp', url:'https://wa.me/', icon:'whatsapp' },
    { id:'s3', name:'YouTube', url:'https://youtube.com/', icon:'youtube' },
    { id:'s4', name:'Instagram', url:'https://instagram.com/', icon:'instagram' }
  ],
  accessKeys: [
    { code:'ILLUSION2025', label:'Default Key', createdAt:Date.now(), expiresAt:0, maxUses:0, used:0, active:true }
  ],
  visitorCount: 0,
  footer: {
    developedBy: 'Mr.Nilesh',
    copyright: '© 2025 ILLUSION X FETCHING — All rights reserved',
    poweredBy: 'POWERED BY ILLUSION'
  }
};

const IF_ADMIN_DEFAULT = { password: 'admin123', lastChanged: 0 };

function ifGet(k, fb){ try{const r=localStorage.getItem(k);return r?JSON.parse(r):fb;}catch{return fb;} }
function ifSet(k, v){ try{localStorage.setItem(k, JSON.stringify(v));}catch{} }

function ifMergeState(s){
  s = s || {};
  return {
    branding: { ...IF_DEFAULT_STATE.branding, ...(s.branding||{}) },
    socials: Array.isArray(s.socials) ? s.socials : IF_DEFAULT_STATE.socials,
    accessKeys: Array.isArray(s.accessKeys) ? s.accessKeys : IF_DEFAULT_STATE.accessKeys,
    visitorCount: s.visitorCount || 0,
    footer: { ...IF_DEFAULT_STATE.footer, ...(s.footer||{}) }
  };
}

function ifLoadStateLocal(){
  const s = ifGet(IF_KEYS.STATE, null);
  if(!s){ ifSet(IF_KEYS.STATE, IF_DEFAULT_STATE); return JSON.parse(JSON.stringify(IF_DEFAULT_STATE)); }
  return ifMergeState(s);
}
function ifSaveStateLocal(s){ ifSet(IF_KEYS.STATE, s); }

function ifLoadAdmin(){ const a=ifGet(IF_KEYS.ADMIN,null); return a?{...IF_ADMIN_DEFAULT,...a}:{...IF_ADMIN_DEFAULT}; }
function ifSaveAdmin(a){ ifSet(IF_KEYS.ADMIN, a); }

function ifGetSession(){
  let sid = sessionStorage.getItem(IF_KEYS.SESSION);
  if(!sid){
    sid = 's_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-6);
    sessionStorage.setItem(IF_KEYS.SESSION, sid);
  }
  return sid;
}

/* ---------- FIREBASE ---------- */
let IF_FB = { ready:false, app:null, db:null, ref:null, unsub:null };

function ifGetFbConfig(){ return ifGet(IF_KEYS.FB_CONFIG, null); }
function ifSetFbConfig(cfg){ ifSet(IF_KEYS.FB_CONFIG, cfg); }
function ifFirebaseAvailable(){ return typeof firebase !== 'undefined' && firebase.firestore; }

function ifInitFirebase(){
  if(!ifFirebaseAvailable()) return false;
  const cfg = ifGetFbConfig();
  if(!cfg || !cfg.apiKey || !cfg.projectId){ IF_FB.ready=false; return false; }
  try{
    if(firebase.apps.length) firebase.app().delete().catch(()=>{});
    IF_FB.app = firebase.initializeApp(cfg);
    IF_FB.db = firebase.firestore();
    IF_FB.ref = IF_FB.db.collection('if_global').doc('state');
    IF_FB.ready = true;
    return true;
  }catch(e){ console.warn('FB init fail', e); IF_FB.ready=false; return false; }
}

async function ifSaveStateCloud(state){
  if(!IF_FB.ready) return false;
  try{
    await IF_FB.ref.set({ ...state, _updatedAt: Date.now() }, { merge: true });
    return true;
  }catch(e){ console.warn('FB save fail', e); return false; }
}

async function ifLoadStateCloud(){
  if(!IF_FB.ready) return null;
  try{
    const snap = await IF_FB.ref.get();
    if(!snap.exists) return null;
    const d = snap.data(); delete d._updatedAt;
    return d;
  }catch(e){ return null; }
}

function ifSubscribeState(cb){
  if(!IF_FB.ready) return null;
  if(IF_FB.unsub){ try{IF_FB.unsub();}catch{} }
  IF_FB.unsub = IF_FB.ref.onSnapshot(snap=>{
    if(!snap.exists) return;
    const d = snap.data(); delete d._updatedAt;
    const merged = ifMergeState(d);
    ifSaveStateLocal(merged);
    if(typeof cb==='function') cb(merged);
  }, err=>console.warn('FB listener error', err));
  return IF_FB.unsub;
}

async function ifSaveState(state){
  ifSaveStateLocal(state);
  await ifSaveStateCloud(state);
}

async function ifLoadState(){
  if(IF_FB.ready){
    const c = await ifLoadStateCloud();
    if(c){ const m = ifMergeState(c); ifSaveStateLocal(m); return m; }
  }
  return ifLoadStateLocal();
}

async function ifIncrementVisitCloud(){
  if(!IF_FB.ready) return;
  try{
    await IF_FB.ref.set({
      visitorCount: firebase.firestore.FieldValue.increment(1),
      _updatedAt: Date.now()
    }, { merge: true });
  }catch(e){}
}

/* ---------- ACCESS KEYS ---------- */
function ifFindKey(code){ return ifLoadStateLocal().accessKeys.find(k=>k.code===code); }
function ifKeyIsValid(k){
  if(!k || !k.active) return false;
  if(k.expiresAt && k.expiresAt < Date.now()) return false;
  if(k.maxUses > 0 && k.used >= k.maxUses) return false;
  return true;
}

async function ifConsumeKey(code, sessionId){
  const st = await ifLoadState();
  const k = st.accessKeys.find(x=>x.code===code);
  if(!k) return { ok:false, reason:'Not found' };
  if(!ifKeyIsValid(k)) return { ok:false, reason:'Expired or inactive' };
  k.used = (k.used||0) + 1;
  await ifSaveState(st);

  const used = ifGet(IF_KEYS.USED_KEYS, {});
  used[code] = used[code] || [];
  used[code].push({ sessionId, at:Date.now(), ua:navigator.userAgent.slice(0,120) });
  ifSet(IF_KEYS.USED_KEYS, used);

  if(IF_FB.ready){
    try{ await IF_FB.db.collection('if_key_usage').add({ code, sessionId, at:Date.now() }); }catch{}
  }
  return { ok:true, key:k };
}
function ifUsedKeysList(){ return ifGet(IF_KEYS.USED_KEYS, {}); }
function ifActiveKeyUsers(){
  const used = ifGet(IF_KEYS.USED_KEYS, {});
  const cutoff = Date.now() - 30*60*1000;
  const out = [];
  Object.entries(used).forEach(([code, arr])=>{
    arr.filter(u=>u.at>cutoff).forEach(u=>out.push({code, ...u}));
  });
  return out;
}

/* ---------- VISITS ---------- */
async function ifRecordVisit(){
  const sid = ifGetSession();
  const v = ifGet(IF_KEYS.VISITS, {count:0, list:[]});
  v.count += 1;
  v.list.push({ sid, at:Date.now(), ua:navigator.userAgent.slice(0,120) });
  if(v.list.length>500) v.list = v.list.slice(-500);
  ifSet(IF_KEYS.VISITS, v);

  await ifIncrementVisitCloud();
  if(IF_FB.ready){ try{ await IF_FB.db.collection('if_visits').add({ sid, at:Date.now() }); }catch{} }
}
function ifVisits(){ return ifGet(IF_KEYS.VISITS, {count:0, list:[]}); }

/* ---------- DEMO ---------- */
function ifDemoInfo(){ return ifGet(IF_KEYS.DEMO, {usedSessions:[], records:[]}); }
function ifHasUsedDemo(){
  const sid = ifGetSession();
  return ifDemoInfo().usedSessions.includes(sid);
}
async function ifConsumeDemo(){
  const sid = ifGetSession();
  const d = ifDemoInfo();
  if(d.usedSessions.includes(sid)) return { ok:false, reason:'Already used' };
  d.usedSessions.push(sid);
  d.records.push({ sid, at:Date.now(), ua:navigator.userAgent.slice(0,120) });
  ifSet(IF_KEYS.DEMO, d);
  if(IF_FB.ready){ try{ await IF_FB.db.collection('if_demo').add({ sid, at:Date.now() }); }catch{} }
  return { ok:true };
}

/* ---------- CLOUD LISTS ---------- */
async function ifLoadVisitsCloud(){
  if(!IF_FB.ready) return [];
  try{
    const snap = await IF_FB.db.collection('if_visits').orderBy('at','desc').limit(300).get();
    const out=[]; snap.forEach(d=>out.push({id:d.id, ...d.data()}));
    return out;
  }catch{return[];}
}
async function ifLoadKeyUsageCloud(){
  if(!IF_FB.ready) return [];
  try{
    const snap = await IF_FB.db.collection('if_key_usage').orderBy('at','desc').limit(300).get();
    const out=[]; snap.forEach(d=>out.push({id:d.id, ...d.data()}));
    return out;
  }catch{return[];}
}
async function ifLoadDemoCloud(){
  if(!IF_FB.ready) return [];
  try{
    const snap = await IF_FB.db.collection('if_demo').orderBy('at','desc').limit(300).get();
    const out=[]; snap.forEach(d=>out.push({id:d.id, ...d.data()}));
    return out;
  }catch{return[];}
}

window.IF = {
  KEYS: IF_KEYS,
  DEFAULT: IF_DEFAULT_STATE,
  loadState: ifLoadState,
  loadStateLocal: ifLoadStateLocal,
  saveState: ifSaveState,
  saveStateLocal: ifSaveStateLocal,
  subscribeState: ifSubscribeState,
  initFirebase: ifInitFirebase,
  getFbConfig: ifGetFbConfig,
  setFbConfig: ifSetFbConfig,
  fbReady: ()=>IF_FB.ready,
  loadAdmin: ifLoadAdmin,
  saveAdmin: ifSaveAdmin,
  getSession: ifGetSession,
  findKey: ifFindKey,
  keyIsValid: ifKeyIsValid,
  consumeKey: ifConsumeKey,
  usedKeysList: ifUsedKeysList,
  activeKeyUsers: ifActiveKeyUsers,
  loadKeyUsageCloud: ifLoadKeyUsageCloud,
  recordVisit: ifRecordVisit,
  visits: ifVisits,
  loadVisitsCloud: ifLoadVisitsCloud,
  demoInfo: ifDemoInfo,
  hasUsedDemo: ifHasUsedDemo,
  consumeDemo: ifConsumeDemo,
  loadDemoCloud: ifLoadDemoCloud
};