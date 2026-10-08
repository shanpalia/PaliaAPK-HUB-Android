const SUPABASE_URL="https://ralinnuegsbuvlhwpzln.supabase.co";
const SUPABASE_KEY="sb_publishable_pXsTbFOseqm5uuA0hzqSzQ_UJxdvQi9";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const firebaseConfig={apiKey:"AIzaSyCn7GUkOaFO4l0x1zM5mwW4hFkW2ISxR10",authDomain:"shanpalia-apk-hub.firebaseapp.com",projectId:"shanpalia-apk-hub",storageBucket:"shanpalia-apk-hub.firebasestorage.app",messagingSenderId:"270953807883",appId:"1:270953807883:web:c900f4409938f16477870e"};
if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
const auth=firebase.auth();
const $=id=>document.getElementById(id);
let apps=[];
let currentCategory="All";
let speedSample={bytes:0,time:0};
let downloadListener=null;

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function bytes(v){const n=Number(v||0);if(!n)return "";if(n<1024*1024)return Math.round(n/1024)+" KB";return (n/1048576).toFixed(1)+" MB"}
function formatSpeed(v){if(!Number.isFinite(v)||v<=0)return "Starting…";return v>=1048576?(v/1048576).toFixed(1)+" MB/s":Math.max(1,Math.round(v/1024))+" KB/s"}

$("authBtn").onclick=()=>$("authModal").classList.remove("hidden");
$("bottomAuth").onclick=()=>$("authModal").classList.remove("hidden");
$("closeAuth").onclick=()=>$("authModal").classList.add("hidden");
$("login").onclick=async()=>{try{clearErr();await auth.signInWithEmailAndPassword($("email").value.trim(),$("password").value)}catch(e){showErr(e.message)}};
$("signup").onclick=async()=>{try{clearErr();await auth.createUserWithEmailAndPassword($("email").value.trim(),$("password").value)}catch(e){showErr(e.message)}};
$("logout").onclick=()=>auth.signOut();
auth.onAuthStateChanged(u=>{if(u){$("authBtn").textContent=(u.email||"Account").split("@")[0];$("logout").classList.remove("hidden")}else{$("authBtn").textContent="Sign in";$("logout").classList.add("hidden")}});

function showErr(x){$("authError").textContent=x}
function clearErr(){$("authError").textContent=""}

async function loadApps(){
  $("status").textContent="Loading apps…";
  const {data,error}=await db.from("apps").select("*").order("created_at",{ascending:false}).limit(100);
  if(error){$("status").textContent="Unable to load apps: "+error.message;return}
  apps=data||[];
  $("status").textContent=apps.length?apps.length+" apps available":"No apps published yet";
  renderSections();
}

function categoryOf(a){return String(a.category||"Apps").trim().toLowerCase()}
function filtered(list){return currentCategory==="All"?list:list.filter(a=>categoryOf(a)===currentCategory.toLowerCase())}
function searchFiltered(list){
  const q=($("search").value||"").trim().toLowerCase();
  return q?list.filter(a=>[a.name,a.developer,a.category].some(v=>String(v||"").toLowerCase().includes(q))):list
}
function card(a){
  const size=bytes(a.apk_size_bytes||a.size_bytes);
  return '<article class="card"><img src="'+esc(a.icon_url||"assets/icon.png")+'" onerror="this.src=\'assets/icon.png\'" alt=""><div class="card-body"><h3>'+esc(a.name||"Unnamed App")+'</h3><div class="meta">'+esc(a.developer||"PaliaAPK HUB")+' · '+esc(a.version||"Latest")+'</div><div class="card-stats"><span>'+esc(size||"APK")+'</span><span>'+esc(a.category||"Apps")+'</span></div><button class="download" data-id="'+esc(a.id)+'">Download</button></div></article>'
}
function renderList(id,list){
  const el=$(id);if(!el)return;
  el.innerHTML=list.length?list.map(card).join(""):'<div class="empty">No published apps in this section.</div>';
  el.querySelectorAll(".download").forEach(b=>b.onclick=()=>startDownload(apps.find(x=>String(x.id)===String(b.dataset.id))));
}
function renderSections(){
  const base=searchFiltered(filtered(apps));
  renderList("latestGrid",base.slice(0,8));
  renderList("gamesGrid",base.filter(a=>categoryOf(a)==="games").slice(0,8));
  renderList("toolsGrid",base.filter(a=>categoryOf(a)==="tools").slice(0,8));
  $("status").textContent=apps.length?apps.length+" apps available":"No apps published yet";
}
function setCategory(c){
  currentCategory=c;
  document.querySelectorAll(".category").forEach(x=>x.classList.toggle("active",x.dataset.category===c));
  renderSections();
}
document.querySelectorAll(".category").forEach(x=>x.onclick=()=>setCategory(x.dataset.category));
$("search").oninput=renderSections;
$("refresh").onclick=loadApps;

async function startDownload(a){
  if(!a)return;
  if(!auth.currentUser){$("authModal").classList.remove("hidden");return}
  const url=a.apk_url||a.download_url;
  if(!url){alert("No APK download URL is configured for this app.");return}
  const filename=(a.name||"PaliaAPK-HUB-App").replace(/[^a-z0-9._-]+/gi,"_")+".apk";
  $("downloadName").textContent="Downloading "+(a.name||"APK");
  $("downloadToast").classList.remove("hidden");
  $("progressBar").style.width="0%";
  $("progressText").textContent="0%";
  $("speedText").textContent="Starting…";
  speedSample={bytes:0,time:0};
  try{
    const plugin=window.Capacitor?.registerPlugin?.("PaliaDownloader");
    if(!plugin)throw Error("Native downloader is unavailable");
    if(downloadListener){try{await downloadListener.remove()}catch(e){}downloadListener=null}
    downloadListener=await plugin.addListener("downloadProgress",updateProgress);
    await plugin.download({url,filename});
  }catch(e){
    $("downloadToast").classList.add("hidden");
    alert("Download failed: "+e.message);
  }
}
function updateProgress(p){
  const total=Number(p.totalBytes||0),done=Number(p.downloadedBytes||0),now=Number(p.timestampMs||0);
  let speed=0;
  if(now&&speedSample.time&&now>speedSample.time&&done>=speedSample.bytes)speed=(done-speedSample.bytes)/((now-speedSample.time)/1000);
  if(now)speedSample={bytes:done,time:now};
  const pct=total?Math.min(100,done/total*100):0;
  $("progressBar").style.width=pct+"%";
  $("progressText").textContent=Math.round(pct)+"%";
  $("speedText").textContent=formatSpeed(speed)+" • "+(done/1048576).toFixed(1)+" / "+(total?(total/1048576).toFixed(1):"?")+" MB";
}
loadApps();