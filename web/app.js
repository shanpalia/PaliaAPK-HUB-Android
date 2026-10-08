const SUPABASE_URL="https://ralinnuegsbuvlhwpzln.supabase.co";
const SUPABASE_KEY="sb_publishable_pXsTbFOseqm5uuA0hzqSzQ_UJxdvQi9";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const firebaseConfig={
 apiKey:"AIzaSyCn7GUkOaFO4l0x1zM5mwW4hFkW2ISxR10",
 authDomain:"shanpalia-apk-hub.firebaseapp.com",
 projectId:"shanpalia-apk-hub",
 storageBucket:"shanpalia-apk-hub.firebasestorage.app",
 messagingSenderId:"270953807883",
 appId:"1:270953807883:web:c900f4409938f16477870e"
};
if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth=firebase.auth();

const $=id=>document.getElementById(id);
let allApps=[];
let activeCategory="All";
let progressListener=null;
let speedSample={bytes:0,time:0};

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function size(v){if(!v)return"Unknown Size";const n=Number(v);if(!Number.isNaN(n))return n>1048576?(n/1048576).toFixed(1)+" MB":Math.round(n/1024)+" KB";return String(v);}
function showAuth(){ $("authModal").classList.remove("hidden"); }
function hideAuth(){ $("authModal").classList.add("hidden"); }

async function loadApps(){
 $("status").textContent="Loading apps...";
 let q=db.from("apps").select("*").order("created_at",{ascending:false});
 if(activeCategory!=="All") q=q.eq("category",activeCategory);
 const {data,error}=await q;
 if(error){console.error(error);$("status").textContent="Unable to load apps.";return;}
 allApps=data||[];
 renderApps();
}
function renderApps(){
 const term=($("search").value||"").trim().toLowerCase();
 const list=allApps.filter(a=>{
   if(!term)return true;
   return [a.name,a.developer,a.category,a.description].some(v=>String(v||"").toLowerCase().includes(term));
 });
 $("status").textContent=list.length+" apps available";
 $("appGrid").innerHTML=list.map(a=>{
   const url=a.icon_url||"assets/header-android-12-visible.svg";
   return `<article class="app-card">
     <img class="app-icon" src="${esc(url)}" alt="${esc(a.name)}">
     <div class="app-body">
       <h3 class="app-name">${esc(a.name||"Unnamed App")}</h3>
       <div class="meta">${esc(a.developer||"ShanPalia")} • v${esc(a.version||"1.0")}</div>
       <div class="badges"><span class="badge">⭐ ${esc(a.rating||"0.0")}</span><span class="badge">↓ ${esc(a.downloads||"0")}</span><span class="badge">📦 ${esc(size(a.apk_size_bytes||a.size_bytes||a.apk_size))}</span></div>
       <button class="download-btn" data-id="${esc(a.id)}">Download APK</button>
     </div>
   </article>`;
 }).join("");
 document.querySelectorAll(".download-btn").forEach(b=>b.addEventListener("click",()=>startDownload(allApps.find(a=>String(a.id)===String(b.dataset.id)))));
}
function setProgress(p){
 const total=Number(p.totalBytes||0),done=Number(p.downloadedBytes||0),now=Number(p.timestampMs||0);
 let speed=Number(p.speedBytesPerSecond||0);
 if(!speed&&now&&speedSample.time&&now>speedSample.time&&done>=speedSample.bytes) speed=(done-speedSample.bytes)/((now-speedSample.time)/1000);
 if(now)speedSample={bytes:done,time:now};
 const pct=total>0?Math.min(100,done/total*100):0;
 $("progressBar").style.width=pct+"%";
 $("progressText").textContent=total?pct.toFixed(0)+"%":(p.status==="completed"?"100%":"Downloading");
 $("speedText").textContent=speed>1048576?(speed/1048576).toFixed(1)+" MB/s":(speed>1024?(speed/1024).toFixed(0)+" KB/s":"Starting...");
}
async function startDownload(a){
 if(!a)return;
 const user=auth.currentUser;
 if(!user){showAuth();return;}
 const url=a.apk_url||a.download_url||(a.telegram_message_id?("https://paliaapk-telegram-api.onrender.com/download-apk/"+a.telegram_message_id):"");
 if(!url){alert("APK download is currently unavailable.");return;}
 const plugin=window.Capacitor?.registerPlugin?.("PaliaDownloader");
 if(!plugin||typeof plugin.download!=="function"){alert("Native downloader is unavailable in this APK build.");return;}
 $("downloadName").textContent=a.name+" • APK";
 $("downloadToast").classList.remove("hidden");
 speedSample={bytes:0,time:0};
 if(progressListener){try{await progressListener.remove()}catch(e){}progressListener=null;}
 progressListener=await plugin.addListener("downloadProgress",p=>{
   setProgress(p);
   if(p.status==="completed"){
     $("speedText").textContent="Download complete";
     setTimeout(async()=>{try{await plugin.openDownloadedApk()}catch(e){console.warn(e)}},250);
   }
 });
 const filename=(String(a.name||"PaliaAPK-HUB").replace(/[^a-z0-9._-]+/gi,"_"))+".apk";
 try{
   await plugin.download({url:String(url),filename});
 }catch(e){
   console.error(e);
   $("speedText").textContent="Download failed";
   alert(e?.message||"Download failed");
 }
}
$("search").addEventListener("input",renderApps);
$("refresh").addEventListener("click",loadApps);
$("authBtn").addEventListener("click",showAuth);
$("closeAuth").addEventListener("click",hideAuth);
$("login").addEventListener("click",async()=>{
 const email=$("email").value.trim(),password=$("password").value;
 try{await auth.signInWithEmailAndPassword(email,password);hideAuth();}catch(e){$("authError").textContent=e.message;}
});
$("signup").addEventListener("click",async()=>{
 const email=$("email").value.trim(),password=$("password").value;
 try{await auth.createUserWithEmailAndPassword(email,password);hideAuth();}catch(e){$("authError").textContent=e.message;}
});
$("bottomProfile").addEventListener("click",()=>auth.currentUser?null:showAuth());
$("bottomSearch").addEventListener("click",()=>$("search").focus());
$("bottomCategories").addEventListener("click",()=>document.querySelector(".categories").scrollIntoView({behavior:"smooth"}));
$("heroExplore").addEventListener("click",()=>document.querySelector(".app-grid").scrollIntoView({behavior:"smooth"}));
$("heroUpdates").addEventListener("click",loadApps);
document.querySelectorAll(".category").forEach(b=>b.addEventListener("click",()=>{
 document.querySelectorAll(".category").forEach(x=>x.classList.remove("active"));
 b.classList.add("active");activeCategory=b.dataset.category;loadApps();
}));
auth.onAuthStateChanged(user=>{
 if(user){$("authBtn").classList.add("hidden");$("profileBox").classList.remove("hidden");$("profileBtn").textContent=(user.email||"U").slice(0,2).toUpperCase();}
 else{$("authBtn").classList.remove("hidden");$("profileBox").classList.add("hidden");}
});
loadApps();