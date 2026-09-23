const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const APP_START_DATE = '2026-08-12';
function todayISO(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
const ROOT = __dirname;
const DATA_DIR = process.env.KITSW_DATA_DIR ? path.resolve(process.env.KITSW_DATA_DIR) : path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'kitsw_attendance.db');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_ROWS = [
  ['2026','CSE','I-A','GANGA LAXMI',65],
['2026','CSE','I-B','X',36],['2025','CSE','II-A','R HEMLATA',70],['2025','CSE','II-B','K BALAKRISHNA',68],['2024','CSE','III-A','T MOUNIKA',70],['2024','CSE','III-B','P NAGARJUN',69],['2023','CSE','IV-A','B L VINAY KUMAR',64],['2023','CSE','IV-B','B SOUNDHARYA',63],
  ['2026','ECE','I','C. ANUSHA',51],['2025','ECE','II-A','K UMA DEVI',60],['2025','ECE','II-B','SAMREEN SULTANA',60],['2024','ECE','III-A','T. VENKATA RAMANA',67],['2024','ECE','III-B','CH SRIVANI',67],['2023','ECE','IV-A','K SRINIVAS',45],['2023','ECE','IV-B','P. MANASA',48],
  ['2026','AIML','I','M. SUSHMITHA',64],['2025','AIML','II','RAMSHA FATIMA',66],['2024','AIML','III','NEELIMA',68],['2023','CIVIL','IV','D KALYANI',20],['2023','EEE','IV','M SRUJANA',9]
];
const HOD_ACCESS_ID = 'KITSW HOD';
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hod_account (
  id INTEGER PRIMARY KEY CHECK(id=1), access_id TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS structure_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL,
  batch TEXT NOT NULL, branch TEXT NOT NULL, section TEXT NOT NULL,
  incharge TEXT NOT NULL, strength INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS structure_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_from TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS structure_version_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT, version_id INTEGER NOT NULL REFERENCES structure_versions(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL, batch TEXT NOT NULL, branch TEXT NOT NULL, section TEXT NOT NULL,
  incharge TEXT NOT NULL, strength INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attendance_reports (
  report_date TEXT PRIMARY KEY, saved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL REFERENCES attendance_reports(report_date) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  batch TEXT NOT NULL, branch TEXT NOT NULL, section TEXT NOT NULL,
  incharge TEXT NOT NULL, strength INTEGER NOT NULL, present INTEGER,
  absent INTEGER, percentage REAL,
  UNIQUE(report_date, sort_order)
);
`);

function hasAccount(){ return !!db.prepare('SELECT 1 FROM hod_account WHERE id=1').get(); }
function getSetting(k){ const r=db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r?.value ?? null; }
function setSetting(k,v){ db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,String(v)); }
function keyForBranch(v){ return String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
function normalizeRows(rows){
  const groups=[]; 
  const map=new Map();

  for(const raw of rows){
    const row={
      batch:String(raw.batch??'').trim(),
      branch:String(raw.branch??'').trim()||'NEW',
      section:String(raw.section??'').trim(),
      incharge:String(raw.incharge??'').trim(),
      strength:Math.max(0,Number(raw.strength)||0)
    };

    const key=keyForBranch(row.branch);

    if(!map.has(key)){
      map.set(key,{
        key,
        display:row.branch,
        rows:[]
      });
      groups.push(map.get(key));
    }

    row.branch=map.get(key).display;
    map.get(key).rows.push(row);
  }

  return groups.flatMap(g=>{
    return g.rows.sort((a,b)=>{
      const batchDiff=Number(b.batch)-Number(a.batch);

      if(batchDiff!==0)return batchDiff;

      return String(a.section??"").localeCompare(
        String(b.section??""),
        undefined,
        {numeric:true,sensitivity:"base"}
      );
    });
  });
}
function validateStructureRows(rows){
  if(!Array.isArray(rows)) throw new Error('Invalid structure rows');

  const seen=new Set();

  for(const r of rows){
    if(!r || typeof r!=='object') throw new Error('Invalid structure row');

    const batch=String(r.batch??'').trim();
    const branch=String(r.branch??'').trim();
    const section=String(r.section??'').trim();
    const incharge=String(r.incharge??'').trim();
    const strength=Number(r.strength);

    if(!/^\d{4}$/.test(batch)) throw new Error('Batch must be a 4-digit year');
    if(!branch) throw new Error('Branch cannot be empty');
    if(!section) throw new Error('Section cannot be empty');
    if(!incharge) throw new Error('Incharge cannot be empty');
    if(!Number.isFinite(strength) || strength<0) throw new Error('Invalid strength');

    const key=`${batch}|${keyForBranch(branch)}|${section.toUpperCase()}`;
    if(seen.has(key)) throw new Error(`Duplicate section: ${batch} ${branch} ${section}`);
    seen.add(key);
  }
}
function ensureStructure(){
  const versionCount=db.prepare('SELECT COUNT(*) c FROM structure_versions').get().c;
  if(versionCount===0){
    const now=new Date().toISOString();
    db.prepare('INSERT INTO structure_versions(effective_from,created_at) VALUES(?,?)').run('1900-01-01',now);
    const version=db.prepare('SELECT id FROM structure_versions WHERE effective_from=?').get('1900-01-01');
    const ins=db.prepare('INSERT INTO structure_version_rows(version_id,sort_order,batch,branch,section,incharge,strength) VALUES(?,?,?,?,?,?,?)');
    let i=0; for(const r of DEFAULT_ROWS) ins.run(version.id,i++,...r);
  }
  // Keep the old temporary table unused; the final application reads only the versioned structure.
}
ensureStructure();

function structureForDate(date){
  const v=db.prepare('SELECT id,effective_from FROM structure_versions WHERE effective_from<=? ORDER BY effective_from DESC LIMIT 1').get(date);
  if(!v) return [];
  return db.prepare('SELECT id,sort_order,batch,branch,section,incharge,strength FROM structure_version_rows WHERE version_id=? ORDER BY sort_order,id').all(v.id);
}
function saveStructure(rows,effectiveFrom){
  validateStructureRows(rows);
  const normalized=normalizeRows(rows);
  const existing=db.prepare('SELECT id FROM structure_versions WHERE effective_from=?').get(effectiveFrom);
  db.exec('BEGIN');
  try{
    let versionId;
    if(existing){
      versionId=existing.id;
      db.prepare('DELETE FROM structure_version_rows WHERE version_id=?').run(versionId);
      db.prepare('UPDATE structure_versions SET created_at=? WHERE id=?').run(new Date().toISOString(),versionId);
    }else{
      const r=db.prepare('INSERT INTO structure_versions(effective_from,created_at) VALUES(?,?)').run(effectiveFrom,new Date().toISOString());
      versionId=Number(r.lastInsertRowid);
    }
    const tx=db.prepare('INSERT INTO structure_version_rows(version_id,sort_order,batch,branch,section,incharge,strength) VALUES(?,?,?,?,?,?,?)');
    normalized.forEach((r,i)=>tx.run(versionId,i,r.batch,r.branch,r.section,r.incharge,r.strength));
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return structureForDate(effectiveFrom);
}
function getReport(date){
  const report=db.prepare('SELECT report_date,saved_at FROM attendance_reports WHERE report_date=?').get(date);
  if(!report) return null;
  const rows=db.prepare('SELECT batch,branch,section,incharge,strength,present,absent,percentage FROM attendance_entries WHERE report_date=? ORDER BY sort_order').all(date);
  return {date:report.report_date,savedAt:report.saved_at,rows};
}
function validateReportRows(date,rows){
  if(!Array.isArray(rows)) throw new Error('Invalid report rows');

  const structure=structureForDate(date);

  const structureMap=new Map(
    structure.map(r=>[
      `${r.batch}|${keyForBranch(r.branch)}|${r.section.toUpperCase()}`,
      r
    ])
  );

  const seen=new Set();

  for(const r of rows){
    if(!r || typeof r!=='object') throw new Error('Invalid report row');

    const batch=String(r.batch??'').trim();
    const branch=String(r.branch??'').trim();
    const section=String(r.section??'').trim();
    const incharge=String(r.incharge??'').trim();
    const strength=Number(r.strength);

    const key=`${batch}|${keyForBranch(branch)}|${section.toUpperCase()}`;
    const expected=structureMap.get(key);

    if(!expected){
      throw new Error(`Report row does not match the structure for ${date}`);
    }

    if(seen.has(key)){
      throw new Error(`Duplicate attendance row: ${batch} ${branch} ${section}`);
    }

    if(incharge!==String(expected.incharge??'').trim()){
      throw new Error(`Incharge does not match the structure for ${batch} ${branch} ${section}`);
    }

    if(strength!==Number(expected.strength)){
      throw new Error(`Strength does not match the structure for ${batch} ${branch} ${section}`);
    }

    seen.add(key);
  }

  if(seen.size!==structureMap.size){
    throw new Error(`Report rows do not match the complete structure for ${date}`);
  }
}
function saveReport(date, rows){
   validateReportRows(date,rows);
  const clean=rows.map((r,i)=>{
    const strength=Math.max(0,Number(r.strength)||0);
    const present=(r.present===''||r.present==null)?null:Math.min(Math.max(Number(r.present)||0,0),strength);
    const absent=present==null?null:Math.max(strength-present,0);
    const percentage=present==null||strength<=0?null:(present/strength*100);
    return {sort_order:i,batch:String(r.batch??''),branch:String(r.branch??''),section:String(r.section??''),incharge:String(r.incharge??''),strength,present,absent,percentage};
  });
  const now=new Date().toISOString();
  db.exec('BEGIN');
  try{
    db.prepare('INSERT INTO attendance_reports(report_date,saved_at) VALUES(?,?) ON CONFLICT(report_date) DO UPDATE SET saved_at=excluded.saved_at').run(date,now);
    db.prepare('DELETE FROM attendance_entries WHERE report_date=?').run(date);
    const ins=db.prepare(`INSERT INTO attendance_entries(report_date,sort_order,batch,branch,section,incharge,strength,present,absent,percentage) VALUES(?,?,?,?,?,?,?,?,?,?)`);
    for(const r of clean) ins.run(date,r.sort_order,r.batch,r.branch,r.section,r.incharge,r.strength,r.present,r.absent,r.percentage);
    db.exec('COMMIT');
  }catch(e){ db.exec('ROLLBACK'); throw e; }
  return getReport(date);
}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
  return {salt,hash:crypto.scryptSync(password,salt,64).toString('hex')};
}
function verifyPassword(password,salt,hash){
  const candidate=crypto.scryptSync(password,salt,64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(hash,'hex'));
}
function json(res,status,data){ const body=JSON.stringify(data); res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(body); }
function parseBody(req){ return new Promise((resolve,reject)=>{ let raw=''; req.on('data',c=>{raw+=c;if(raw.length>2e6) req.destroy();}); req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch(e){reject(e);}}); req.on('error',reject); }); }
function requireAuth(req,res){ if(getSetting('session_active')!=='1'){ json(res,401,{error:'Unauthorized'}); return false; } return true; }
function sendFile(req,res){
  let p=new URL(req.url,'http://localhost').pathname; if(p==='/'||p==='') p='/index.html';
  const safe=path.normalize(p).replace(/^([.][.][\\/])+/, ''); const file=path.join(ROOT,safe);
  if(!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){res.writeHead(404);res.end('Not found');return;}
  const ext=path.extname(file); const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-cache'}); fs.createReadStream(file).pipe(res);
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')){
      if(req.method==='GET' && url.pathname==='/api/status') return json(res,200,{accountExists:hasAccount(),loggedIn:getSetting('session_active')==='1',appStartDate:APP_START_DATE,serverDate:todayISO()});
      if(req.method==='POST' && url.pathname==='/api/signup'){
        if(hasAccount()) return json(res,409,{error:'HOD account already exists'});
        const b=await parseBody(req); const accessId=String(b.accessId||'').trim().replace(/\s+/g,' '); const password=String(b.password||'');
        if(accessId!==HOD_ACCESS_ID) return json(res,400,{error:'Invalid HOD Access ID'});
        if(password.length<6) return json(res,400,{error:'Password must contain at least 6 characters'});
        const {salt,hash}=hashPassword(password);
        db.prepare('INSERT INTO hod_account(id,access_id,password_salt,password_hash,created_at) VALUES(1,?,?,?,?)').run(HOD_ACCESS_ID,salt,hash,new Date().toISOString());
        setSetting('session_active','0'); return json(res,201,{ok:true});
      }
      if(req.method==='POST' && url.pathname==='/api/login'){
        if(!hasAccount()) return json(res,400,{error:'Please complete first-time HOD sign-up'});
        const b=await parseBody(req); const password=String(b.password||''); const a=db.prepare('SELECT password_salt,password_hash FROM hod_account WHERE id=1').get();
        if(!a || !verifyPassword(password,a.password_salt,a.password_hash)) return json(res,401,{error:'Incorrect password'});
        setSetting('session_active','1'); return json(res,200,{ok:true});
      }
      if(req.method==='POST' && url.pathname==='/api/logout'){
        setSetting('session_active','0'); return json(res,200,{ok:true});
      }
      if(req.method==='GET' && url.pathname==='/api/calendar'){
        if(!requireAuth(req,res)) return;
        const month=String(url.searchParams.get('month')||'').trim();
        if(!/^\d{4}-\d{2}$/.test(month)) return json(res,400,{error:'Invalid month'});
        const lastDay=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
        const first=month+'-01', last=month+'-'+String(lastDay).padStart(2,'0');
        const savedDates=db.prepare('SELECT report_date FROM attendance_reports WHERE report_date BETWEEN ? AND ? ORDER BY report_date').all(first,last).map(r=>r.report_date);
        return json(res,200,{month,startDate:APP_START_DATE,today:todayISO(),savedDates});
      }
      if(req.method==='GET' && url.pathname==='/api/structure'){
        if(!requireAuth(req,res)) return;const date=url.searchParams.get('date')||todayISO(); return json(res,200,{rows:structureForDate(date)});
      }
      if(req.method==='PUT' && url.pathname==='/api/structure'){
        if(!requireAuth(req,res)) return; const b=await parseBody(req); const effectiveFrom=String(b.effectiveFrom||'').trim(); const now=new Date(); const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)||effectiveFrom<APP_START_DATE||effectiveFrom>today||!Array.isArray(b.rows)) return json(res,400,{error:'Structure changes must use a valid date from the application start date through today'}); return json(res,200,{rows:saveStructure(b.rows,effectiveFrom)});
      }
      const reportMatch=url.pathname.match(/^\/api\/reports\/(\d{4}-\d{2}-\d{2})$/);
      if(reportMatch){
        if(!requireAuth(req,res)) return; const date=reportMatch[1];
        if(req.method==='GET') return json(res,200,{report:getReport(date),structure:structureForDate(date)});
        if(req.method==='PUT'){
          const today=todayISO();
if(date<APP_START_DATE) return json(res,400,{error:'Attendance cannot be saved before the application start date'});
if(date>today) return json(res,400,{error:'Future attendance cannot be saved before that date arrives'}); const b=await parseBody(req); if(!Array.isArray(b.rows)) return json(res,400,{error:'Invalid report rows'}); return json(res,200,{report:saveReport(date,b.rows)});
        }
      }
      return json(res,404,{error:'API route not found'});
    }
    sendFile(req,res);
  }catch(e){ console.error(e); json(res,500,{error:'Server error',detail:e.message}); }
});

server.listen(PORT,'127.0.0.1',()=>console.log(`KITSW Attendance App running at http://127.0.0.1:${server.address().port}`));
module.exports = { server, DB_PATH };
