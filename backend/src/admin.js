import express from "express";
import { writeFileSync } from "node:fs";
import { config, reloadConfig } from "./config.js";

export const adminRouter = express.Router();

// --- Autentisering (Basic auth mot ADMIN_PASSWORD i .env) ---
function auth(req, res, next) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    res.status(503).send("Admin är inaktiverat: sätt ADMIN_PASSWORD i backend/.env");
    return;
  }
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString();
    const pass = decoded.slice(decoded.indexOf(":") + 1);
    if (pass === pw) {
      next();
      return;
    }
  }
  res.set("WWW-Authenticate", 'Basic realm="PV Monitor Admin"');
  res.status(401).send("Autentisering krävs");
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

adminRouter.get("/api/config", auth, (_req, res) => {
  res.json({
    co2FactorKgPerKwh: config.co2FactorKgPerKwh,
    sites: config.sites,
    configPath: config.configPath,
    mock: config.mock
  });
});

adminRouter.post("/api/config", auth, express.json({ limit: "1mb" }), (req, res) => {
  const err = validate(req.body);
  if (err) {
    res.status(400).json({ error: err });
    return;
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

adminRouter.get("/", auth, (_req, res) => {
  res.type("html").send(ADMIN_HTML);
});

const ADMIN_HTML = `<!doctype html><html lang="sv"><head><meta charset="utf-8">
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
  button{border:0;border-radius:9px;padding:.55rem 1rem;font-weight:600;cursor:pointer;font-size:.9rem}
  .b-add{background:#243056;color:var(--tx)}
  .b-del{background:transparent;color:var(--red);border:1px solid var(--red);padding:.4rem .7rem}
  .b-save{background:var(--acc);color:#1a1205;font-size:1.05rem;padding:.8rem 1.6rem}
  .bar{display:flex;gap:1rem;align-items:center;margin-top:1.5rem;position:sticky;bottom:0;background:linear-gradient(0deg,var(--bg),transparent);padding:1rem 0}
  .top{display:flex;gap:2rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:1.5rem}
  .fld{display:flex;flex-direction:column;gap:.3rem}
  .fld label{color:var(--dim);font-size:.85rem}
  .msg{padding:.6rem 1rem;border-radius:9px;font-weight:600}
  .msg.ok{background:rgba(52,211,153,.15);color:var(--grn)}
  .msg.err{background:rgba(248,113,113,.15);color:var(--red)}
  .disabled{opacity:.5}
  .hint{color:var(--dim);font-size:.8rem}
</style></head><body>
<h1>PV Monitor – Administration</h1>
<p class="sub">Redigera anläggningar och omformare. Ändringar tillämpas direkt efter Spara (ingen omstart krävs).</p>
<div class="top">
  <div class="fld"><label>CO₂-faktor (kg/kWh)</label><input id="co2" class="num" type="number" step="0.01"></div>
  <div class="fld"><label>Konfigfil</label><input id="cfgpath" disabled></div>
</div>
<div id="sites"></div>
<button class="b-add" onclick="addSite()">+ Lägg till anläggning</button>
<div class="bar">
  <button class="b-save" onclick="save()">Spara ändringar</button>
  <span id="msg"></span>
</div>
<script>
let state={co2FactorKgPerKwh:0.4,sites:[]};
function esc(s){return String(s==null?'':s).replace(/"/g,'&quot;')}
async function load(){
  const r=await fetch('api/config'); const d=await r.json();
  state={co2FactorKgPerKwh:d.co2FactorKgPerKwh,sites:(d.sites||[]).map(s=>({id:s.id,name:s.name,
    inverters:(s.inverters||[]).map(i=>({id:i.id,name:i.name,model:i.model||'',host:i.host||'',
      port:i.port||1502,unitId:i.unitId||71,capacityKw:i.capacityW?i.capacityW/1000:'',enabled:i.enabled!==false}))}))};
  document.getElementById('co2').value=state.co2FactorKgPerKwh;
  document.getElementById('cfgpath').value=d.configPath+(d.mock?'  (simulatorläge)':'');
  render();
}
function render(){
  const c=document.getElementById('sites'); c.innerHTML='';
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
        <input value="\${esc(s.name)}" oninput="updSite(\${si},'name',this.value)">
        <button class="b-del" onclick="delSite(\${si})">Ta bort anläggning</button>
      </div>
      <table><thead><tr><th>Namn</th><th>Modell</th><th>IP-adress</th><th>Port</th><th>Unit-ID</th><th>Kapacitet kW</th><th>I drift</th><th></th></tr></thead>
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
  const msg=document.getElementById('msg'); msg.className=''; msg.textContent='Sparar…';
  const body={co2FactorKgPerKwh:Number(document.getElementById('co2').value)||0.4,
    sites:state.sites.map(s=>({id:s.id,name:s.name,inverters:s.inverters.map(i=>({id:i.id,name:i.name,
      model:i.model,host:i.host,port:Number(i.port),unitId:Number(i.unitId),
      capacityW:i.capacityKw?Math.round(Number(i.capacityKw)*1000):0,enabled:i.enabled}))}))};
  const r=await fetch('api/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json();
  if(r.ok){msg.className='msg ok';msg.textContent='Sparat! Ändringarna tillämpas inom några sekunder.';load()}
  else{msg.className='msg err';msg.textContent='Fel: '+(d.error||r.status)}
}
load();
</script></body></html>`;
