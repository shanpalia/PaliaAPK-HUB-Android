(function(){
function a(){const C=window.Capacitor;return !!(C&&C.isNativePlatform&&C.isNativePlatform()&&/android/i.test(navigator.userAgent||""))}
let p=null;async function g(){const C=window.Capacitor;if(!a())return null;if(C.Plugins&&C.Plugins.PaliaDownloader)return C.Plugins.PaliaDownloader;if(C.registerPlugin){p=p||C.registerPlugin("PaliaDownloader");return p}return null}
window.paliaNativeAndroid=a;
window.startPaliaApkDownload=async(u,f,s)=>{const x=await g();return x?x.download({url:u,filename:f,expectedTotalBytes:s||0}):null};
window.listenPaliaApkDownloadProgress=async cb=>{const x=await g();return x&&x.addListener?x.addListener("downloadProgress",cb):null};
window.openPaliaApkInstaller=async f=>{const x=await g();return x?x.openInstaller({filename:f}):null};
})();