import express from "express";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { config, reloadConfig } from "./config.js";
import { getBackupSettings, updateBackupSettings, runBackupNow } from "./backup.js";

export const adminRouter = express.Router();

const COOKIE = "pv_session";
const SESSION_HOURS = 12;
const __dirname = dirname(fileURLToPath(import.meta.url));
const authPath = join(__dirname, "..", "config", "auth.json");

// Lagrade (hashade) lösenord har företräde framför .env. Ändras i admin.
function getStoredAuth() {
  try {
    return JSON.parse(readFileSync(authPath, "utf-8"));
  } catch {
    return {};
  }
}

function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32);
  return `scrypt:${salt.toString("hex")}:${h.toString("hex")}`;
}

function verifyPw(pw, stored) {
  const parts = String(stored).split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const h = crypto.scryptSync(String(pw), Buffer.from(parts[1], "hex"), 32);
  const exp = Buffer.from(parts[2], "hex");
  return h.length === exp.length && crypto.timingSafeEqual(h, exp);
}

function setStoredPassword(role, pw) {
  const cur = getStoredAuth();
  cur[role] = hashPw(pw);
  mkdirSync(dirname(authPath), { recursive: true });
  writeFileSync(authPath, JSON.stringify(cur, null, 2) + "\n");
}

function userForRole(role) {
  return role === "superadmin"
    ? process.env.SUPERADMIN_USER || "superadmin"
    : process.env.ADMIN_USER || "admin";
}

function envPassword(role) {
  return role === "superadmin"
    ? process.env.SUPERADMIN_PASSWORD
    : process.env.ADMIN_PASSWORD;
}

function roleEnabled(role) {
  return !!(getStoredAuth()[role] || envPassword(role));
}

function adminEnabled() {
  return roleEnabled("admin") || roleEnabled("superadmin");
}

// Verifierar inloggning: lagrat hash har företräde, annars .env-lösenord.
function checkLogin(username, password) {
  for (const role of ["superadmin", "admin"]) {
    if (!roleEnabled(role) || username !== userForRole(role)) continue;
    const stored = getStoredAuth()[role];
    if (stored) return verifyPw(password, stored) ? role : null;
    return envPassword(role) && password === envPassword(role) ? role : null;
  }
  return null;
}

function secret() {
  return (
    (process.env.SESSION_SECRET || "") +
    (process.env.ADMIN_PASSWORD || "") +
    (process.env.SUPERADMIN_PASSWORD || "") +
    "pv-monitor-session-v1"
  );
}

function sign(role, exp) {
  const data = `${role}.${exp}`;
  const sig = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [role, exp, sig] = parts;
  const expected = crypto
    .createHmac("sha256", secret())
    .update(`${role}.${exp}`)
    .digest("base64url");
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now()) return null;
  return { role };
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function currentRole(req) {
  return verify(parseCookies(req)[COOKIE])?.role || null;
}

function requireAuth(req, res, next) {
  if (!adminEnabled()) {
    res.status(503).json({ error: "Admin avstängt: sätt ADMIN_PASSWORD/SUPERADMIN_PASSWORD i .env" });
    return;
  }
  const role = currentRole(req);
  if (!role) {
    res.status(401).json({ error: "Ej inloggad" });
    return;
  }
  req.role = role;
  next();
}

function slug(s) {
  return (
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "x"
  );
}

// Städar och kompletterar inkommande konfiguration (id:n, typer, defaults).
function normalize(body) {
  const usedSiteIds = new Set();
  const sites = (body.sites || []).map((site, si) => {
    let id =
      site.id && String(site.id).trim()
        ? String(site.id).trim()
        : slug(site.name) || `anlaggning-${si + 1}`;
    while (usedSiteIds.has(id)) id = `${id}-${si + 1}`;
    usedSiteIds.add(id);

    const usedInvIds = new Set();
    const inverters = (site.inverters || []).map((inv, ii) => {
      let iid =
        inv.id && String(inv.id).trim() ? String(inv.id).trim() : `${id}-${ii + 1}`;
      while (usedInvIds.has(iid)) iid = `${id}-${ii + 1}-${Math.random().toString(36).slice(2, 5)}`;
      usedInvIds.add(iid);

      const out = {
        id: iid,
        name: String(inv.name || "").trim() || `Omformare ${ii + 1}`,
        model: String(inv.model || "").trim(),
        host: String(inv.host || "").trim(),
        port: Number(inv.port) || 1502,
        unitId: Number(inv.unitId) || 71,
        profile: inv.profile || "kostal-ci",
        enabled: inv.enabled !== false
      };
      const capW = Number(inv.capacityW);
      if (capW > 0) out.capacityW = Math.round(capW);
      return out;
    });

    return {
      id,
      name: String(site.name || "").trim() || `Anläggning ${si + 1}`,
      inverters
    };
  });

  return {
    co2FactorKgPerKwh: Number(body.co2FactorKgPerKwh) || 0.4,
    sites
  };
}

function validate(body) {
  if (!body || !Array.isArray(body.sites)) return "Saknar 'sites'.";
  for (const site of body.sites) {
    if (!Array.isArray(site.inverters)) return "En anläggning saknar 'inverters'.";
    for (const inv of site.inverters) {
      if (!String(inv.host || "").trim()) {
        return `Omformaren "${inv.name || "?"}" saknar IP-adress.`;
      }
      const port = Number(inv.port);
      if (!port || port < 1 || port > 65535) {
        return `Omformaren "${inv.name || "?"}" har ogiltig port.`;
      }
    }
  }
  return null;
}

adminRouter.post("/login", express.json(), (req, res) => {
  const { username, password } = req.body || {};
  const role = checkLogin(username, password);
  if (!role) {
    res.status(401).json({ error: "Fel användarnamn eller lösenord" });
    return;
  }
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  res.set(
    "Set-Cookie",
    `${COOKIE}=${sign(role, exp)}; HttpOnly; Path=/admin; Max-Age=${SESSION_HOURS * 3600}; SameSite=Lax`
  );
  res.json({ ok: true, role });
});

adminRouter.post("/logout", (_req, res) => {
  res.set("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/admin; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

adminRouter.get("/api/me", (req, res) => {
  res.json({ role: currentRole(req), enabled: adminEnabled() });
});

// Byt lösenord (endast superadmin). Lagras hashat i config/auth.json.
adminRouter.post("/api/password", requireAuth, express.json(), (req, res) => {
  if (req.role !== "superadmin") {
    res.status(403).json({ error: "Kräver superadmin" });
    return;
  }
  const { role, password } = req.body || {};
  if (!["admin", "superadmin"].includes(role)) {
    res.status(400).json({ error: "Ogiltig roll" });
    return;
  }
  if (!password || String(password).length < 4) {
    res.status(400).json({ error: "Lösenordet måste vara minst 4 tecken" });
    return;
  }
  setStoredPassword(role, String(password));
  res.json({ ok: true });
});

adminRouter.get("/api/config", requireAuth, (_req, res) => {
  res.json({
    co2FactorKgPerKwh: config.co2FactorKgPerKwh,
    sites: config.sites,
    configPath: config.configPath,
    mock: config.mock
  });
});

adminRouter.post("/api/config", requireAuth, express.json({ limit: "1mb" }), (req, res) => {
  const err = validate(req.body);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  // admin får inte ändra CO2-faktor eller anläggningsstruktur (namn/antal) –
  // det kräver superadmin.
  if (req.role !== "superadmin") {
    const curIds = config.sites.map((s) => s.id).sort().join(",");
    const newIds = (req.body.sites || [])
      .map((s) => String(s.id || "").trim())
      .sort()
      .join(",");
    const curNames = new Map(config.sites.map((s) => [s.id, s.name]));
    let structuralChange =
      curIds !== newIds ||
      Number(req.body.co2FactorKgPerKwh) !== Number(config.co2FactorKgPerKwh);
    if (!structuralChange) {
      for (const s of req.body.sites || []) {
        if (curNames.get(String(s.id || "").trim()) !== String(s.name || "").trim()) {
          structuralChange = true;
          break;
        }
      }
    }
    if (structuralChange) {
      res.status(403).json({
        error: "Endast superadmin kan ändra CO₂-faktor eller lägga till/ta bort/döpa om anläggningar."
      });
      return;
    }
  }

  try {
    const normalized = normalize(req.body);
    writeFileSync(config.configPath, JSON.stringify(normalized, null, 2) + "\n");
    reloadConfig();
    res.json({ ok: true, sites: normalized.sites });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Databasbackup-inställningar (endast superadmin).
function requireSuper(req, res) {
  if (req.role !== "superadmin") {
    res.status(403).json({ error: "Kräver superadmin" });
    return false;
  }
  return true;
}

adminRouter.get("/api/backup", requireAuth, (req, res) => {
  if (!requireSuper(req, res)) return;
  res.json(getBackupSettings());
});

adminRouter.post("/api/backup", requireAuth, express.json(), (req, res) => {
  if (!requireSuper(req, res)) return;
  res.json(updateBackupSettings(req.body));
});

adminRouter.post("/api/backup/run", requireAuth, express.json(), async (req, res) => {
  if (!requireSuper(req, res)) return;
  try {
    const r = await runBackupNow();
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.get("/", (_req, res) => {
  res.type("html").send(ADMIN_HTML);
});

const ADMIN_HTML = `<!doctype html><html lang="sv"><head><meta charset="utf-8">
<base href="/admin/">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PV Monitor – Admin</title>
<style>
  :root{--bg:#0a0f1e;--card:rgba(255,255,255,.05);--bd:rgba(255,255,255,.12);--tx:#eef2fb;--dim:#93a0bd;--acc:#ffb300;--red:#f87171;--grn:#34d399}
  *{box-sizing:border-box}
  body{font-family:Segoe UI,system-ui,sans-serif;background:var(--bg);color:var(--tx);margin:0;padding:2rem;max-width:1100px;margin:0 auto}
  h1{font-size:1.6rem;margin:0 0 .2rem}
  .sub{color:var(--dim);margin:0 0 1.5rem}
  .site{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:1.2rem;margin-bottom:1.2rem}
  .site-head{display:flex;align-items:center;gap:1rem;margin-bottom:1rem}
  .site-head input{font-size:1.2rem;font-weight:700}
  table{width:100%;border-collapse:collapse}
  th{color:var(--dim);text-align:left;font-size:.8rem;text-transform:uppercase;letter-spacing:.5px;padding:.3rem .5rem}
  td{padding:.35rem .5rem}
  input,select{background:#111a33;border:1px solid var(--bd);color:var(--tx);border-radius:8px;padding:.5rem .6rem;font-size:.95rem;width:100%}
  input[type=checkbox]{width:auto;transform:scale(1.3)}
  .num{width:90px}
  .num[type=time]{width:130px}
  button{border:0;border-radius:9px;padding:.55rem 1rem;font-weight:600;cursor:pointer;font-size:.9rem}
  .b-add{background:#243056;color:var(--tx)}
  .b-del{background:transparent;color:var(--red);border:1px solid var(--red);padding:.4rem .7rem}
  .b-save{background:var(--acc);color:#1a1205;font-size:1.05rem;padding:.8rem 1.6rem}
  .bar{display:flex;gap:1rem;align-items:center;margin-top:1.5rem;padding:1rem 0}
  .top{display:flex;gap:2rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:1.5rem}
  .fld{display:flex;flex-direction:column;gap:.3rem}
  .fld label{color:var(--dim);font-size:.85rem}
  .msg{padding:.6rem 1rem;border-radius:9px;font-weight:600}
  .msg.ok{background:rgba(52,211,153,.15);color:var(--grn)}
  .msg.err{background:rgba(248,113,113,.15);color:var(--red)}
  .disabled{opacity:.5}
  .hint{color:var(--dim);font-size:.8rem}
  .login{max-width:360px;margin:6rem auto;background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:2rem}
  .login h2{margin:0 0 1.2rem}
  .login input{margin-bottom:1rem}
  .login button{width:100%;background:var(--acc);color:#1a1205;font-size:1rem;padding:.8rem}
  .badge{display:inline-block;padding:.2rem .7rem;border-radius:999px;font-size:.8rem;font-weight:700}
  .badge.super{background:rgba(255,179,0,.2);color:var(--acc)}
  .badge.admin{background:rgba(52,211,153,.2);color:var(--grn)}
  .hdr{display:flex;align-items:center;gap:1rem;justify-content:space-between;margin-bottom:.4rem}
  .b-out{background:#243056;color:var(--tx)}
</style></head><body>
<div id="login" class="login" style="display:none">
  <h2>PV Monitor – Logga in</h2>
  <input id="lu" placeholder="Användarnamn" autocomplete="username">
  <input id="lp" type="password" placeholder="Lösenord" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()">
  <button onclick="doLogin()">Logga in</button>
  <div id="lmsg" class="msg" style="margin-top:1rem"></div>
</div>
<div id="app" style="display:none">
  <div class="hdr">
    <h1>PV Monitor – Administration</h1>
    <div><span id="rolebadge" class="badge"></span> <button class="b-out" onclick="doLogout()">Logga ut</button></div>
  </div>
  <p class="sub">Redigera anläggningar och omformare. Ändringar tillämpas direkt efter Spara (ingen omstart krävs).</p>
  <div class="top">
    <div class="fld"><label>CO₂-faktor (kg/kWh)</label><input id="co2" class="num" type="number" step="0.01"></div>
    <div class="fld"><label>Konfigfil</label><input id="cfgpath" disabled></div>
  </div>
  <div id="sites"></div>
  <button id="addSiteBtn" class="b-add" onclick="addSite()">+ Lägg till anläggning</button>
  <div id="backupSection" style="display:none;margin-top:2rem">
    <h2 style="font-size:1.2rem;margin-bottom:.2rem">Databasbackup (extern kopia)</h2>
    <p class="hint">Schemalagd kopia till lokal/monterad mapp eller <code>user@server:/sökväg</code> (scp, kräver SSH-nyckel).</p>
    <div class="site">
      <div class="top">
        <div class="fld"><label>Aktiverad</label><input id="bk_en" type="checkbox"></div>
        <div class="fld"><label>Var N:e timme (0 = daglig)</label><input id="bk_int" class="num" type="number" min="0"></div>
        <div class="fld"><label>Tid (daglig)</label><input id="bk_time" class="num" type="time"></div>
        <div class="fld"><label>Behåll antal kopior</label><input id="bk_keep" class="num" type="number" min="1"></div>
        <div class="fld"><label>Komprimering</label><select id="bk_comp"><option value="gzip">Gzip (.gz)</option><option value="brotli">Brotli (.br – bäst)</option><option value="none">Ingen (.sqlite)</option></select></div>
      </div>
      <div class="fld" style="margin-bottom:1rem"><label>Målplats (mapp eller user@server:/sökväg)</label><input id="bk_dest" placeholder="/mnt/nas/pvbackup   eller   backup@nas:/pv"></div>
      <div class="bar" style="position:static;padding:0">
        <button class="b-save" onclick="saveBackup()">Spara backup-inställningar</button>
        <button class="b-add" onclick="runBackup()">Kör backup nu</button>
        <span id="bk_msg"></span>
      </div>
      <p class="hint" id="bk_status"></p>
    </div>
  </div>
  <div id="acctSection" style="display:none;margin-top:2rem">
    <h2 style="font-size:1.2rem;margin-bottom:.2rem">Konton &amp; lösenord</h2>
    <p class="hint">Byt inloggningslösenord (lagras hashat, inte i klartext). Gäller direkt.</p>
    <div class="site">
      <div class="top">
        <div class="fld"><label>Nytt admin-lösenord</label><input id="pw_admin" type="password" placeholder="lämna tomt = oförändrat"></div>
        <div class="fld"><label>Nytt superadmin-lösenord</label><input id="pw_super" type="password" placeholder="lämna tomt = oförändrat"></div>
      </div>
      <div class="bar" style="position:static;padding:0">
        <button class="b-save" onclick="savePasswords()">Spara lösenord</button>
        <span id="pw_msg"></span>
      </div>
    </div>
  </div>
  <div class="bar">
    <button class="b-save" onclick="save()">Spara ändringar</button>
    <span id="msg"></span>
  </div>
</div>
<script>
let state={co2FactorKgPerKwh:0.4,sites:[]}; let role=null;
const $=id=>document.getElementById(id);
function esc(s){return String(s==null?'':s).replace(/"/g,'&quot;')}
function show(v){ $('login').style.display=v==='login'?'block':'none'; $('app').style.display=v==='app'?'block':'none'; }
async function init(){
  const me=await (await fetch('api/me')).json();
  if(!me.enabled){ $('login').style.display='block'; $('lmsg').className='msg err'; $('lmsg').textContent='Admin är avstängt (sätt lösenord i .env).'; return; }
  if(me.role){ role=me.role; startApp(); } else { show('login'); }
}
async function doLogin(){
  const r=await fetch('login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:$('lu').value,password:$('lp').value})});
  const d=await r.json();
  if(r.ok){ role=d.role; startApp(); } else { $('lmsg').className='msg err'; $('lmsg').textContent=d.error||'Inloggning misslyckades'; }
}
async function doLogout(){ await fetch('logout',{method:'POST'}); role=null; location.reload(); }
function startApp(){
  show('app');
  const sup=role==='superadmin';
  $('rolebadge').textContent=sup?'Superadmin':'Admin';
  $('rolebadge').className='badge '+(sup?'super':'admin');
  $('co2').disabled=!sup;
  $('addSiteBtn').style.display=sup?'inline-block':'none';
  $('backupSection').style.display=sup?'block':'none';
  $('acctSection').style.display=sup?'block':'none';
  if(sup) loadBackup();
  load();
}
async function load(){
  const d=await (await fetch('api/config')).json();
  state={co2FactorKgPerKwh:d.co2FactorKgPerKwh,sites:(d.sites||[]).map(s=>({id:s.id,name:s.name,
    inverters:(s.inverters||[]).map(i=>({id:i.id,name:i.name,model:i.model||'',host:i.host||'',
      port:i.port||1502,unitId:i.unitId||71,capacityKw:i.capacityW?i.capacityW/1000:'',enabled:i.enabled!==false}))}))};
  $('co2').value=state.co2FactorKgPerKwh;
  $('cfgpath').value=d.configPath+(d.mock?'  (simulatorläge)':'');
  render();
}
function render(){
  const sup=role==='superadmin';
  const c=$('sites'); c.innerHTML='';
  state.sites.forEach((s,si)=>{
    const rows=s.inverters.map((inv,ii)=>\`<tr class="\${inv.enabled?'':'disabled'}">
      <td><input value="\${esc(inv.name)}" oninput="upd(\${si},\${ii},'name',this.value)"></td>
      <td><input value="\${esc(inv.model)}" placeholder="KOSTAL CI 30" oninput="upd(\${si},\${ii},'model',this.value)"></td>
      <td><input value="\${esc(inv.host)}" placeholder="192.168.1.50" oninput="upd(\${si},\${ii},'host',this.value)"></td>
      <td><input class="num" type="number" value="\${esc(inv.port)}" oninput="upd(\${si},\${ii},'port',this.value)"></td>
      <td><input class="num" type="number" value="\${esc(inv.unitId)}" oninput="upd(\${si},\${ii},'unitId',this.value)"></td>
      <td><input class="num" type="number" value="\${esc(inv.capacityKw)}" placeholder="auto" oninput="upd(\${si},\${ii},'capacityKw',this.value)"></td>
      <td style="text-align:center"><input type="checkbox" \${inv.enabled?'checked':''} onchange="upd(\${si},\${ii},'enabled',this.checked);render()"></td>
      <td><button class="b-del" onclick="delInv(\${si},\${ii})">Ta bort</button></td>
    </tr>\`).join('');
    const div=document.createElement('div'); div.className='site';
    div.innerHTML=\`<div class="site-head">
        <input value="\${esc(s.name)}" \${sup?'':'disabled'} oninput="updSite(\${si},'name',this.value)">
        \${sup?\`<button class="b-del" onclick="delSite(\${si})">Ta bort anläggning</button>\`:''}
      </div>
      <table><thead><tr><th>Namn</th><th>Modell</th><th>IP-adress</th><th>Port</th><th title="Modbus enhets-adress. På Modbus TCP identifieras varje omformare av sin egen IP-adress, så alla kan ha samma unit-ID (KOSTAL standard: 71). Unit-ID skiljer bara enheter åt när flera omformare sitter bakom en gemensam Modbus-gateway på samma IP.">Unit-ID&nbsp;&#9432;</th><th>Kapacitet kW</th><th>I drift</th><th></th></tr></thead>
      <tbody>\${rows}</tbody></table>
      <div style="margin-top:.8rem"><button class="b-add" onclick="addInv(\${si})">+ Lägg till omformare</button></div>\`;
    c.appendChild(div);
  });
}
function upd(si,ii,f,v){state.sites[si].inverters[ii][f]=v}
function updSite(si,f,v){state.sites[si][f]=v}
function addInv(si){state.sites[si].inverters.push({name:'Ny omformare',model:'',host:'',port:1502,unitId:71,capacityKw:'',enabled:true});render()}
function delInv(si,ii){state.sites[si].inverters.splice(ii,1);render()}
function addSite(){state.sites.push({name:'Ny anläggning',inverters:[]});render()}
function delSite(si){if(confirm('Ta bort hela anläggningen?')){state.sites.splice(si,1);render()}}
async function save(){
  const msg=$('msg'); msg.className=''; msg.textContent='Sparar…';
  const body={co2FactorKgPerKwh:Number($('co2').value)||0.4,
    sites:state.sites.map(s=>({id:s.id,name:s.name,inverters:s.inverters.map(i=>({id:i.id,name:i.name,
      model:i.model,host:i.host,port:Number(i.port),unitId:Number(i.unitId),
      capacityW:i.capacityKw?Math.round(Number(i.capacityKw)*1000):0,enabled:i.enabled}))}))};
  const r=await fetch('api/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json();
  if(r.ok){msg.className='msg ok';msg.textContent='Sparat! Ändringarna tillämpas inom några sekunder.';load()}
  else{msg.className='msg err';msg.textContent='Fel: '+(d.error||r.status)}
}
async function loadBackup(){
  const b=await (await fetch('api/backup')).json();
  $('bk_en').checked=!!b.enabled; $('bk_int').value=b.intervalHours; $('bk_time').value=b.time; $('bk_keep').value=b.keep; $('bk_dest').value=b.destination||''; $('bk_comp').value=b.compression||'gzip';
  $('bk_status').textContent=b.lastRun?('Senaste körning: '+new Date(b.lastRun).toLocaleString('sv-SE')+' – '+(b.lastStatus||'')):'Ingen körning ännu.';
}
function bkBody(){return {enabled:$('bk_en').checked,intervalHours:Number($('bk_int').value)||0,time:$('bk_time').value||'03:00',keep:Number($('bk_keep').value)||14,destination:$('bk_dest').value.trim(),compression:$('bk_comp').value}}
async function saveBackup(){const m=$('bk_msg');m.className='';m.textContent='Sparar…';const r=await fetch('api/backup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(bkBody())});if(r.ok){m.className='msg ok';m.textContent='Sparat.';loadBackup()}else{const d=await r.json();m.className='msg err';m.textContent='Fel: '+(d.error||r.status)}}
async function runBackup(){const m=$('bk_msg');m.className='';m.textContent='Kör…';await fetch('api/backup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(bkBody())});const r=await fetch('api/backup/run',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const d=await r.json();if(r.ok){m.className='msg ok';m.textContent='Backup klar';loadBackup()}else{m.className='msg err';m.textContent='Fel: '+(d.error||r.status)}}
async function savePasswords(){
  const m=$('pw_msg');m.className='';m.textContent='Sparar…';
  const jobs=[];
  if($('pw_admin').value) jobs.push(['admin',$('pw_admin').value]);
  if($('pw_super').value) jobs.push(['superadmin',$('pw_super').value]);
  if(!jobs.length){m.className='msg err';m.textContent='Inget lösenord angivet.';return}
  for(const [role,password] of jobs){
    const r=await fetch('api/password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role,password})});
    if(!r.ok){const d=await r.json();m.className='msg err';m.textContent='Fel: '+(d.error||r.status);return}
  }
  $('pw_admin').value='';$('pw_super').value='';
  m.className='msg ok';m.textContent='Lösenord uppdaterat';
}
init();
</script></body></html>`;
