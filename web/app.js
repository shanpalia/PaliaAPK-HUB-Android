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
let pendingDownloadApp=null;
let searchTimer=null;
let speedSample={bytes:0,time:0};

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function size(v){if(!v)return"Unknown Size";const n=Number(v);if(!Number.isNaN(n))return n>1048576?(n/1048576).toFixed(1)+" MB":Math.round(n/1024)+" KB";return String(v);}
function formatBytes(v){const n=Number(v||0);if(!Number.isFinite(n)||n<=0)return"0 MB";if(n>=1073741824)return(n/1073741824).toFixed(2)+" GB";if(n>=1048576)return(n/1048576).toFixed(1)+" MB";return Math.round(n/1024)+" KB";}
function showAuth(){ $("authModal").classList.remove("hidden"); }
function hideAuth(){ $("authModal").classList.add("hidden"); $("authError").textContent=""; }
function authError(e){const m={"auth/invalid-credential":"Email or password is incorrect.","auth/invalid-login-credentials":"Email or password is incorrect.","auth/wrong-password":"Email or password is incorrect.","auth/user-not-found":"No account found with this email.","auth/email-already-in-use":"An account already exists with this email.","auth/invalid-email":"Please enter a valid email address.","auth/weak-password":"Password must be at least 6 characters.","auth/too-many-requests":"Too many attempts. Try again later.","auth/popup-closed-by-user":"Google login was cancelled.","auth/network-request-failed":"Network error. Check your internet connection."};return m[e?.code]||e?.message||"Authentication failed.";}

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
 const list=getMatches($("search").value||"");
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
 $("speedText").textContent=speed>1048576?(speed/1048576).toFixed(1)+" MB/s":(speed>1024?(speed/1024).toFixed(0)+" KB/s":"Starting..."); if($("downloadedText")) $("downloadedText").textContent=formatBytes(done)+(total?" / "+formatBytes(total):"");
}
async function startDownload(a){
 if(!a)return;
 const user=auth.currentUser;
 if(!user){pendingDownloadApp=a;showAuth();return;}
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
function searchScore(a,q){const fields=[["name",100],["package_name",80],["developer",65],["category",50],["description",20]];let score=0;for(const [k,w] of fields){const v=String(a?.[k]||"").toLowerCase();if(v===q)score+=w+100;else if(v.startsWith(q))score+=w+50;else if(v.includes(q))score+=w;}return score;}
function getMatches(q,limit=1000){q=String(q||"").trim().toLowerCase();let list=allApps.filter(a=>activeCategory==="All"||String(a.category||"")===activeCategory);if(!q)return list;return list.map(a=>({a,score:searchScore(a,q)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.a);}
function renderSuggestions(){const q=$("search").value.trim(),box=$("searchSuggestions");if(!box)return;if(!q){box.classList.add("hidden");box.innerHTML="";return;}const m=getMatches(q,7);box.innerHTML=m.length?m.map(a=>`<button type="button" class="suggestion" data-id="${esc(a.id)}"><img src="${esc(a.icon_url||"assets/header-android-12-visible.svg")}" alt=""><span><b>${esc(a.name||"App")}</b><small>${esc(a.category||"App")} • ${esc(a.developer||"ShanPalia")}</small></span></button>`).join(""):`<div class="no-suggestion">No apps found for <b>${esc(q)}</b></div>`;box.classList.remove("hidden");}
$("search").addEventListener("input",()=>{clearTimeout(searchTimer);renderApps();searchTimer=setTimeout(renderSuggestions,120);});
$("search").addEventListener("focus",renderSuggestions);
$("search").addEventListener("keydown",e=>{if(e.key==="Escape"){$("searchSuggestions").classList.add("hidden");$("search").blur();}if(e.key==="Enter"){const x=$("searchSuggestions").querySelector("[data-id]");if(x){const a=allApps.find(v=>String(v.id)===String(x.dataset.id));if(a)location.href=`app.html?id=${encodeURIComponent(a.id)}`;}}});
$("searchSuggestions").addEventListener("click",e=>{const x=e.target.closest("[data-id]");if(x){location.href=`app.html?id=${encodeURIComponent(x.dataset.id)}`;}});
$("refresh").addEventListener("click",loadApps);
$("authBtn").addEventListener("click",showAuth);
$("closeAuth").addEventListener("click",hideAuth);
$("login").addEventListener("click",async()=>{const email=$("authEmail").value.trim(),password=$("authPassword").value;try{const r=await auth.signInWithEmailAndPassword(email,password);hideAuth();if(pendingDownloadApp){const a=pendingDownloadApp;pendingDownloadApp=null;await startDownload(a);}}catch(e){$("authError").textContent=authError(e);}});
$("signup").addEventListener("click",async()=>{
 const email=$("authEmail").value.trim(),password=$("authPassword").value;
 try{const r=await auth.createUserWithEmailAndPassword(email,password);hideAuth();if(pendingDownloadApp){const a=pendingDownloadApp;pendingDownloadApp=null;await startDownload(a);}}catch(e){$("authError").textContent=authError(e);}
});
$("bottomProfile").addEventListener("click",()=>auth.currentUser?null:showAuth());
$("bottomSearch").addEventListener("click",()=>$("search").focus());
$("bottomCategories").addEventListener("click",()=>document.querySelector(".categories").scrollIntoView({behavior:"smooth"}));
$("heroExplore").addEventListener("click",()=>document.querySelector(".app-grid").scrollIntoView({behavior:"smooth"}));
$("heroUpdates").addEventListener("click",loadApps);
document.querySelectorAll(".category").forEach(b=>b.addEventListener("click",()=>{
 document.querySelectorAll(".category").forEach(x=>x.classList.remove("active"));
 b.classList.add("active");activeCategory=b.dataset.category;loadApps(); checkForStoreUpdate();
}));
auth.onAuthStateChanged(user=>{
 if(user){$("authBtn").classList.add("hidden");$("profileBox").classList.remove("hidden");$("profileBtn").textContent=(user.email||"U").slice(0,2).toUpperCase();}
 else{$("authBtn").classList.remove("hidden");$("profileBox").classList.add("hidden");}
});
loadApps();
$("logoutBtn")?.addEventListener("click",()=>auth.signOut());
$("googleLogin")?.addEventListener("click",async()=>{const b=$("googleLogin");b.disabled=true;b.textContent="Opening Google…";try{let r;if(window.PaliaNativeGoogle?.signIn){const n=await window.PaliaNativeGoogle.signIn();r=await auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(n.idToken));}else{const p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({prompt:"select_account"});r=await auth.signInWithPopup(p);}hideAuth();if(pendingDownloadApp){const a=pendingDownloadApp;pendingDownloadApp=null;await startDownload(a);}}catch(e){console.error(e);$("authError").textContent=authError(e);}finally{b.disabled=false;b.textContent="Continue with Google";}});

async function checkForStoreUpdate(){
  try{
    const current=String(window.PaliaAppVersion||"1.0.0");
    const {data,error}=await db.from("app_updates").select("*").eq("app_id","paliaapk-hub-android").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(error||!data)return;
    const latest=String(data.version||current);
    const newer=latest!==current && latest.split(".").map(Number).join(".")>current.split(".").map(Number).join(".");
    if(!newer)return;
    const banner=$("appUpdateBanner"); if(!banner)return;
    $("appUpdateTitle").textContent="PaliaAPK HUB update available — v"+latest;
    $("appUpdateText").textContent=data.release_notes||"A new version is ready to install.";
    banner.classList.remove("hidden");
    $("appUpdateBtn").onclick=async()=>{
      const url=data.apk_url||data.download_url;
      if(!url){$("appUpdateText").textContent="Update APK link is not available yet.";return;}
      if(!auth.currentUser){pendingDownloadApp={name:"PaliaAPK HUB",version:latest,apk_url:url,id:"paliaapk-hub-android-update"};showAuth();return;}
      await startDownload({name:"PaliaAPK HUB Update",version:latest,apk_url:url,id:"paliaapk-hub-android-update"});
    };
  }catch(e){console.warn("Store update check skipped:",e);}
}
