const HOD_ACCESS_ID="KITSW HOD", APP_START_DATE="2026-08-12";
let currentRows=[],structure=[],currentDate="",isEditing=true,currentStatus="",calendarMonth="",savedDates=new Set(),pendingConfirmAction=null;
const $=id=>document.getElementById(id), todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};function toast(m){const t=$("toast");t.textContent=m;t.classList.add("show");clearTimeout(window.__t);window.__t=setTimeout(()=>t.classList.remove("show"),2600)}
function fmtDate(x){const[y,m,d]=x.split("-");return`${d}-${m}-${y}`} function dayName(x){return new Date(x+"T12:00:00").toLocaleDateString("en-US",{weekday:"long"}).toUpperCase()} function shortDay(x){return new Date(x+"T12:00:00").toLocaleDateString("en-US",{weekday:"long"})}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))} function escAttr(v){return esc(v)}
function keyForBranch(v){return String(v??"").toUpperCase().replace(/[^A-Z0-9]/g,"")}
function normalizeStructure(rows){
  const order=[],groups=new Map();

  (Array.isArray(rows)?rows:[]).forEach(row=>{
    const r={
      ...row,
      branch:String(row.branch??"").trim()||"NEW"
    };

    const k=keyForBranch(r.branch);

    if(!groups.has(k)){
      groups.set(k,[]);
      order.push({k,display:r.branch});
    }

    r.branch=order.find(x=>x.k===k).display;
    groups.get(k).push(r);
  });

  return order.flatMap(x=>{
    return groups.get(x.k).sort((a,b)=>{
      const batchDiff=Number(b.batch)-Number(a.batch);

      if(batchDiff!==0)return batchDiff;

      return String(a.section??"").localeCompare(
        String(b.section??""),
        undefined,
        {numeric:true,sensitivity:"base"}
      );
    });
  });
}function beforeStart(d){return false} function future(d){return d>todayISO()} function today(d){return d===todayISO()}
function status(d,saved){if(beforeStart(d))return"before-start";if(saved)return"saved";if(today(d))return"today";if(future(d))return"future";return"pending"}
async function api(url,o={}){const r=await fetch(url,{...o,headers:{"Content-Type":"application/json",...(o.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}
async function init(){bind();try{const s=await api("/api/status");if(s.loggedIn){showApp()}else if(s.accountExists){showLogin();showAuth()}else{showSignup();showAuth()}}catch(e){toast("Unable to connect to the local application database");console.error(e)}}
function showAuth(){$("authScreen").classList.remove("hidden");$("appScreen").classList.add("hidden")} function showSignup(){$("signupTab").classList.add("active");$("loginTab").classList.remove("active");$("signupForm").classList.remove("hidden");$("loginForm").classList.add("hidden")} function showLogin(){$("signupTab").classList.remove("active");$("loginTab").classList.add("active");$("signupForm").classList.add("hidden");$("loginForm").classList.remove("hidden")}
async function signup(e){e.preventDefault();const id=$("signupId").value.trim().replace(/\s+/g," "),p=$("signupPassword").value,c=$("signupConfirm").value;if(id!==HOD_ACCESS_ID)return toast("Invalid HOD Access ID");if(p.length<6)return toast("Password must contain at least 6 characters");if(p!==c)return toast("Passwords do not match");try{await api("/api/signup",{method:"POST",body:JSON.stringify({accessId:id,password:p})});$("signupForm").reset();showLogin();toast("HOD account created. Please login for the first time.")}catch(e){toast(e.message)}}
async function login(e){e.preventDefault();try{await api("/api/login",{method:"POST",body:JSON.stringify({password:$("loginPassword").value})});$("loginForm").reset();showApp();toast("HOD login successful")}catch(e){toast(e.message)}}
function openConfirm(title,msg,ok,fn){$("confirmTitle").textContent=title;$("confirmMessage").textContent=msg;$("confirmOk").textContent=ok;pendingConfirmAction=fn;$("confirmModal").classList.remove("hidden")}
function closeConfirm(){$("confirmModal").classList.add("hidden");pendingConfirmAction=null}
function logout(){openConfirm("Logout?","Are you sure you want to log out of the KITSW Attendance application?","Logout",async()=>{try{await api("/api/logout",{method:"POST"});showAuth();showLogin();toast("You have been logged out")}catch(e){toast(e.message)}})}
async function showApp(){$("authScreen").classList.add("hidden");$("appScreen").classList.remove("hidden");$("userName").textContent="HOD Madam";await loadDate(todayISO())}
function bind(){
 $("signupTab").addEventListener("click",async()=>{const s=await api("/api/status");if(!s.accountExists)showSignup();else toast("HOD account is already created. Please use Login.")});$("loginTab").addEventListener("click",showLogin);$("signupForm").addEventListener("submit",signup);$("loginForm").addEventListener("submit",login);$("logoutBtn").addEventListener("click",logout);
 $("calendarBtn").addEventListener("click",openCalendar);$("prevDay").addEventListener("click",()=>shiftDate(-1));$("nextDay").addEventListener("click",()=>shiftDate(1));$("saveBtn").addEventListener("click",()=>openConfirm("Save Attendance?",`Save attendance for ${fmtDate(currentDate)}?`,"Save Attendance",saveAttendance));$("modifyBtn").addEventListener("click",()=>{isEditing=true;renderTable();setStatus(false,null,"editing");toast("Editing enabled")});$("structureBtn").addEventListener("click",openStructure);$("applyStructureBtn").addEventListener("click",applyStructure);$("addRowBtn").addEventListener("click",addStructureRow);$("printBtn").addEventListener("click",async()=>{
  try{
    if(window.kitswPrint){
      await window.kitswPrint.printToPDF();
    }else{
      window.print();
    }
  }catch(e){
    console.error(e);
    window.print();
  }
});$("calPrevMonth").addEventListener("click",()=>changeMonth(-1));$("calNextMonth").addEventListener("click",()=>changeMonth(1));$("confirmCancel").addEventListener("click",closeConfirm);$("confirmOk").addEventListener("click",async()=>{const f=pendingConfirmAction;closeConfirm();if(f)await f()});document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).classList.add("hidden")))}
async function shiftDate(delta){
  const d=new Date((currentDate||todayISO())+"T12:00:00");
  d.setDate(d.getDate()+delta);
  const n=d.toISOString().slice(0,10);

  if(future(n)){
    return toast("Future attendance is locked until that date arrives.");
  }

  if(isEditing && currentRows.some(r=>r.present!==""&&r.present!=null)){
    return openConfirm(
      "Unsaved Attendance",
      `Attendance for ${fmtDate(currentDate)} has not been saved. Leave this date without saving?`,
      "Leave Without Saving",
      async()=>{await loadDate(n)}
    );
  }

  await loadDate(n);
}async function loadDate(date){try{const d=await api(`/api/reports/${date}`);currentDate=date;structure=normalizeStructure(d.structure);if(d.report){currentRows=normalizeStructure(d.report.rows);isEditing=false;currentStatus="saved"}else{currentRows=structure.map(r=>({...r,present:""}));isEditing=!future(date);currentStatus=status(date,false)}updateDateLabels(date);renderTable();setStatus(!!d.report,d.report?.savedAt,currentStatus);if(!$("calendarModal").classList.contains("hidden"))renderCalendar()}catch(e){toast(e.message)}}
function updateDateLabels(d){$("selectedDateLabel").textContent=fmtDate(d);$("dayLabel").textContent=dayName(d);$("reportDateLabel").textContent=`${fmtDate(d)} • ${dayName(d)}`;$("footerDate").textContent=fmtDate(d);$("printReportDate").textContent=fmtDate(d);$("printDayLabel").textContent=dayName(d);$("printSummaryDate").textContent=fmtDate(d)}function renderTable(){
  const tb=$("attendanceTable").querySelector("tbody");
  tb.innerHTML="";
  const editable=isEditing&&!future(currentDate);

  currentRows.forEach((r,i)=>{
    const raw=r.present===""||r.present==null?"":Number(r.present);
    const valid=raw!==""&&Number.isFinite(raw);
    const p=valid?Math.min(Math.max(raw,0),Number(r.strength)||0):0;
    const a=valid?Math.max(Number(r.strength)-p,0):0;
    const pc=valid&&Number(r.strength)>0?p/Number(r.strength)*100:0;

    const tr=document.createElement("tr");

    /* BRANCH GROUP */
    let branchCell="";
    if(i===0||currentRows[i-1].branch!==r.branch){
      let branchSpan=1;
      while(
        i+branchSpan<currentRows.length &&
        currentRows[i+branchSpan].branch===r.branch
      ){
        branchSpan++;
      }

      branchCell=`<td rowspan="${branchSpan}" class="branch-group">${esc(r.branch)}</td>`;
    }

    /* BATCH GROUP — grouped only inside the same branch */
    let batchCell="";
    if(
      i===0 ||
      currentRows[i-1].branch!==r.branch ||
      currentRows[i-1].batch!==r.batch
    ){
      let batchSpan=1;

      while(
        i+batchSpan<currentRows.length &&
        currentRows[i+batchSpan].branch===r.branch &&
        currentRows[i+batchSpan].batch===r.batch
      ){
        batchSpan++;
      }

      batchCell=`<td rowspan="${batchSpan}" class="batch-group">${esc(r.batch)}</td>`;
    }

    tr.innerHTML=`
      <td>${i+1}</td>
      ${batchCell}
      ${branchCell}
      <td>${esc(r.section)}</td>
      <td>${esc(r.incharge)}</td>
      <td>${Number(r.strength)||0}</td>
      <td>
        ${
          editable
          ? `<input class="present-input" type="text" inputmode="numeric" dir="ltr" autocomplete="off" value="${valid ? p : ""}" data-i="${i}" placeholder="0">`
          : `<span class="present-value">${valid ? p : "—"}</span>`
        }
      </td>
      <td>
        <span class="absent-value">${valid ? a : "—"}</span>
      </td>
      <td>
        <span class="percent-value">${valid ? pc.toFixed(2)+"%" : "—"}</span>
      </td>
    `;

    tb.appendChild(tr);
  });

  const inputs=[...tb.querySelectorAll(".present-input")];

  inputs.forEach(inp=>{
    inp.addEventListener("keydown",e=>{
      if(e.key==="Enter"){
        e.preventDefault();
        const n=inputs[inputs.indexOf(e.target)+1];
        if(n){
          n.focus();
          n.select();
        }
      }
    });

    inp.addEventListener("input",e=>{
      const i=+e.target.dataset.i;
      const max=+currentRows[i].strength||0;

      let raw=e.target.value.replace(/\D/g,"");

      if(raw!==""){
        raw=String(Math.min(+raw,max));
      }

      e.target.value=raw;
      currentRows[i].present=raw;

      const row=e.target.closest("tr");

      row.querySelector(".absent-value").textContent=
        raw===""?"—":Math.max(max-+raw,0);

      row.querySelector(".percent-value").textContent=
        raw===""
        ?"—"
        :(max>0?(+raw/max*100).toFixed(2)+"%":"—");

      updateSummary();
    });
  });

  updateSummary();
}
function updateSummary(){let st=0,p=0,any=false;currentRows.forEach(r=>{st+=+r.strength||0;if(r.present!==""&&r.present!=null){p+=+r.present||0;any=true}});const a=Math.max(st-p,0),pc=st?p/st*100:0;$("totalStrength").textContent=st;$("totalPresent").textContent=p;$("totalAbsent").textContent=a;$("overallPercentage").textContent=(any?pc:0).toFixed(2)+"%";$("footStrength").textContent=st;$("footPresent").textContent=p;$("footAbsent").textContent=a;$("footPercentage").textContent=(any?pc:0).toFixed(2)+"%";$("printTotalStrength").textContent=st;$("printTotalPresent").textContent=p;$("printTotalAbsent").textContent=a;$("printOverallPercentage").textContent=(any?pc:0).toFixed(2)+"%"}function setStatus(saved,savedAt,state){const b=$("saveStatus");let c="draft",t="● Draft — Not Saved";if(state==="future"){c="future";t="● Future — Locked"}else if(saved){c="saved";t="● Saved"}else if(state==="pending"){c="pending";t="● Attendance Pending"}else if(state==="today"){c="today";t="● Today — Not Saved"}else if(state==="editing"){c="editing";t="● Editing — Unsaved Changes"}b.className="status-badge "+c;b.textContent=t;$("lastSaved").textContent=savedAt?`Last saved ${new Date(savedAt).toLocaleString()}`:"";const editable=!future(currentDate);$("saveBtn").classList.toggle("hidden",!isEditing||!editable);$("modifyBtn").classList.toggle("hidden",isEditing||!saved||!editable);$("structureBtn").classList.toggle("hidden",!isEditing||!editable||!today(currentDate))}
async function saveAttendance(){if(!isEditing||future(currentDate))return;try{const d=await api(`/api/reports/${currentDate}`,{method:"PUT",body:JSON.stringify({rows:currentRows})});currentRows=normalizeStructure(d.report.rows);isEditing=false;renderTable();setStatus(true,d.report.savedAt,"saved");toast(`Attendance for ${fmtDate(currentDate)} has been saved successfully`);if(!$("calendarModal").classList.contains("hidden"))renderCalendar()}catch(e){toast(e.message)}}
async function openStructure(){try{const d=await api(`/api/structure?date=${currentDate}`);const oldRows=normalizeStructure(currentRows);
const presentMap=new Map(
  oldRows.map(r=>[
    `${r.batch}|${keyForBranch(r.branch)}|${String(r.section??"").trim().toUpperCase()}`,
    r.present
  ])
);

currentRows=normalizeStructure(d.rows).map(r=>({
  ...r,
  present:presentMap.get(`${r.batch}|${keyForBranch(r.branch)}|${String(r.section??"").trim().toUpperCase()}`) ?? ""
}));renderStructureRows();$("structureModal").classList.remove("hidden")}catch(e){toast(e.message)}}
function renderStructureRows(){const b=$("structureBody");b.innerHTML="";currentRows.forEach((r,i)=>{const tr=document.createElement("tr");tr.innerHTML=`<td><input data-s="batch" data-i="${i}" value="${escAttr(r.batch)}"></td><td><input data-s="branch" data-i="${i}" value="${escAttr(r.branch)}"></td><td><input data-s="section" data-i="${i}" value="${escAttr(r.section)}"></td><td><input data-s="incharge" data-i="${i}" value="${escAttr(r.incharge)}"></td><td><input data-s="strength" data-i="${i}" type="number" min="0" value="${+r.strength||0}"></td><td><button class="delete-row" data-delete="${i}" type="button">Delete</button></td>`;b.appendChild(tr)});const f=[...b.querySelectorAll("input")];f.forEach(x=>x.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const n=f[f.indexOf(e.target)+1];if(n){n.focus();n.select()}}}));b.querySelectorAll("[data-delete]").forEach(x=>x.addEventListener("click",()=>{currentRows.splice(+x.dataset.delete,1);renderStructureRows()}))}
function addStructureRow(){currentRows.push({batch:"2026",branch:"CSE",section:"NEW",incharge:"",strength:0,present:""});currentRows=normalizeStructure(currentRows);renderStructureRows();const w=document.querySelector(".structure-table-wrap");setTimeout(()=>{w.scrollTop=w.scrollHeight;const i=w.querySelectorAll("input");i[i.length-1]?.focus()},50)}
async function applyStructure(){
  const inputs=[...document.querySelectorAll("#structureBody input")];
  inputs.forEach(x=>{
    const i=+x.dataset.i,f=x.dataset.s;
    if(!currentRows[i])return;
    currentRows[i][f]=f==="strength"?Math.max(0,+x.value||0):x.value.trim()
  });

  currentRows=normalizeStructure(currentRows);
  const effectiveFrom=todayISO();

  try{
    const d=await api("/api/structure",{
      method:"PUT",
      body:JSON.stringify({effectiveFrom,rows:currentRows})
    });

    const newStructure=normalizeStructure(d.rows);

    currentRows=currentRows.map((r,i)=>({
      ...r,
      strength:newStructure[i]?.strength ?? r.strength
    }));

    $("structureModal").classList.add("hidden");
isEditing=true;
currentStatus="editing";
renderTable();
setStatus(false,null,"editing");
toast(`Structure updated from ${fmtDate(effectiveFrom)}. Save Attendance to save the updated report.`);
  }catch(e){
    toast(e.message)
  }
}
async function openCalendar(){calendarMonth=(currentDate||todayISO()).slice(0,7);await renderCalendar();$("calendarModal").classList.remove("hidden")}
function changeMonth(delta){const[y,m]=calendarMonth.split("-").map(Number),d=new Date(y,m-1+delta,1),n=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;calendarMonth=n;renderCalendar()}
async function renderCalendar(){const d=await api(`/api/calendar?month=${calendarMonth}`);savedDates=new Set(d.savedDates||[]);const[y,m]=calendarMonth.split("-").map(Number);$("calendarMonthLabel").textContent=new Date(y,m-1,1).toLocaleDateString("en-US",{month:"long",year:"numeric"});const g=$("calendarGrid");g.innerHTML="";const first=new Date(y,m-1,1).getDay(),days=new Date(y,m,0).getDate();for(let i=0;i<first;i++){const x=document.createElement("div");x.className="calendar-day blank";g.appendChild(x)}for(let n=1;n<=days;n++){const date=`${calendarMonth}-${String(n).padStart(2,"0")}`,x=document.createElement("button");x.type="button";const st=status(date,savedDates.has(date));x.className=`calendar-day ${st}${date===currentDate?" selected":""}`;x.innerHTML=`<strong>${n}</strong><span>${st==="saved"?"Saved":st==="today"?"Today":st==="pending"?"Pending":st==="future"?"Future":""}</span>`;if(st==="future")x.disabled=true;else x.addEventListener("click",async()=>{$("calendarModal").classList.add("hidden");await loadDate(date)});g.appendChild(x)}$("calPrevMonth").disabled=false;$("calNextMonth").disabled=false}
init();
