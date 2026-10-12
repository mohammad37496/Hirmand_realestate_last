export const ADMIN_CSS = `
.admin-app{min-height:100vh;display:flex;background:#111315;color:#f7f5ef;font-family:var(--font,Vazirmatn,Tahoma,sans-serif)}
.admin-sidebar{width:240px;flex-shrink:0;border-left:1px solid rgba(244,239,230,.08);background:linear-gradient(180deg,#111315 0%,#111315 100%);display:flex;flex-direction:column;position:sticky;top:0;height:100vh;z-index:30}
.admin-sidebar-brand .brand-logo-nav{width:44px;height:44px;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 7px 18px rgba(247,245,239,.18))}
.admin-sidebar-brand{padding:22px 18px 18px;border-bottom:1px solid rgba(244,239,230,.08);display:flex;align-items:center;gap:12px}
.admin-sidebar-brand strong{display:block;font-size:.95rem;font-weight:700}
.admin-sidebar-brand small{color:rgb(247 245 239 / .56);font-size:.72rem}
.admin-sidebar-nav{padding:14px 10px;display:flex;flex-direction:column;gap:4px;flex:1}
.admin-nav-btn{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:12px;border:0;background:transparent;color:rgb(247 245 239 / .68);font:inherit;font-size:.9rem;font-weight:500;cursor:pointer;text-align:right;transition:background .15s,color .15s}
.admin-nav-btn:hover{background:rgba(255,255,255,.04);color:#f7f5ef}
.admin-nav-btn.is-active{background:rgba(247,245,239,.12);color:#f7f5ef}
.admin-nav-btn svg{flex-shrink:0;opacity:.85}
.admin-sidebar-foot{padding:14px 10px 18px;border-top:1px solid rgba(244,239,230,.08);display:flex;flex-direction:column;gap:4px}
.admin-main{flex:1;min-width:0;display:flex;flex-direction:column}
.admin-topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;border-bottom:1px solid rgba(244,239,230,.08);background:rgba(7,9,13,.85);backdrop-filter:blur(12px);position:sticky;top:0;z-index:20}
.admin-topbar h1{font-size:1.15rem;font-weight:700;margin:0}
.admin-topbar p{margin:2px 0 0;color:rgb(247 245 239 / .56);font-size:.82rem}
.admin-topbar-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.admin-content{padding:24px;flex:1;width:100%;max-width:1680px;margin:0 auto;box-sizing:border-box}
.admin-stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:24px}
.admin-stat-card{border:1px solid rgba(244,239,230,.1);background:rgba(16,20,26,.9);border-radius:16px;padding:18px 16px;cursor:pointer;transition:border-color .15s,background .15s}
.admin-stat-card:hover{border-color:rgba(247,245,239,.35)}
.admin-stat-card.is-active{border-color:rgba(247,245,239,.55);background:rgba(247,245,239,.08)}
.admin-stat-card span{display:block;color:rgb(247 245 239 / .56);font-size:.78rem;font-weight:600;margin-bottom:6px}
.admin-stat-card strong{font-size:1.55rem;font-weight:700;letter-spacing:-.02em}
.admin-stat-card[data-tone="green"] strong{color:#f7f5ef}
.admin-stat-card[data-tone="amber"] strong{color:#f7f5ef}
.admin-stat-card[data-tone="muted"] strong{color:rgb(247 245 239 / .52)}
.admin-stat-card[data-tone="gold"] strong{color:#f7f5ef}
.admin-panel{border:1px solid rgba(244,239,230,.1);background:rgba(16,20,26,.75);border-radius:20px;overflow:hidden}
.admin-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(244,239,230,.08);flex-wrap:wrap}
.admin-panel-head h2{margin:0;font-size:1.05rem;font-weight:700}
.admin-panel-head .kicker{display:block;color:#f7f5ef;font-size:.72rem;font-weight:600;letter-spacing:.1em;margin-bottom:4px}
.admin-list-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.admin-search{display:flex;align-items:center;gap:8px;border:1px solid rgba(244,239,230,.12);border-radius:12px;padding:8px 12px;background:rgba(7,9,13,.6);min-width:min(260px,100%)}
.admin-search input{border:0;background:transparent;color:inherit;outline:none;width:100%;font:inherit;font-size:.9rem}
.admin-property-list{display:flex;flex-direction:column}
.admin-property-card{display:grid;grid-template-columns:88px 1fr auto;gap:16px;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(244,239,230,.06);transition:background .15s}
.admin-property-card:last-child{border-bottom:0}
.admin-property-card:hover{background:rgba(255,255,255,.025)}
.admin-property-thumb{width:88px;height:66px;border-radius:12px;overflow:hidden;background:#111315;flex-shrink:0}
.admin-property-thumb img{width:100%;height:100%;object-fit:cover}
.admin-property-meta{min-width:0}
.admin-property-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.admin-property-tags span{font-size:.72rem;font-weight:600;padding:3px 9px;border-radius:999px}
.admin-property-tags span[data-status="published"]{background:rgba(247,245,239,.18);color:#f7f5ef}
.admin-property-tags span[data-status="draft"]{background:rgba(247,245,239,.16);color:#f7f5ef}
.admin-property-tags span[data-status="archived"]{background:rgba(154,163,178,.16);color:rgb(247 245 239 / .52)}
.admin-property-tags span[data-featured]{background:rgba(247,245,239,.2);color:#f7f5ef}
.admin-property-meta h3{margin:0;font-size:.95rem;font-weight:600;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.admin-property-meta p{margin:4px 0 0;color:rgb(247 245 239 / .56);font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.admin-property-actions{display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.admin-icon-btn{width:36px;height:36px;display:grid;place-items:center;border:1px solid rgba(244,239,230,.1);border-radius:10px;background:rgba(255,255,255,.03);color:rgb(247 245 239 / .68);cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.admin-icon-btn:hover{border-color:rgba(247,245,239,.4);color:#f7f5ef;background:rgba(247,245,239,.08)}
.admin-icon-btn.danger:hover{border-color:rgba(247,245,239,.45);color:#f7f5ef;background:rgba(247,245,239,.1)}
.admin-nav-btn:focus-visible,.admin-icon-btn:focus-visible,.btn-gold:focus-visible,.btn-ghost:focus-visible{outline:2px solid rgba(247,245,239,.75);outline-offset:2px}
 .admin-nav-btn:disabled,.admin-icon-btn:disabled{opacity:.5;cursor:not-allowed}
.admin-empty{text-align:center;padding:56px 20px;color:rgb(247 245 239 / .56)}
.admin-empty svg{margin:0 auto 12px;opacity:.5}
.admin-empty strong{display:block;color:#f7f5ef;margin-bottom:6px;font-size:1.05rem}
.admin-form-wrap{display:flex;flex-direction:column;gap:0;padding-bottom:88px}
.admin-form-sections{display:flex;flex-direction:column;gap:16px}
.admin-section{border:1px solid var(--line);background:linear-gradient(180deg,var(--card),var(--card-2));border-radius:var(--r-lg);padding:18px 20px;box-shadow:var(--el-1)}
.admin-section legend{padding:0 6px;font-size:.82rem;color:var(--fg);font-weight:700;letter-spacing:.04em}
.admin-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.admin-form-grid-dense{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}
.admin-span-2{grid-column:1/-1}
.admin-checks{display:flex;flex-wrap:wrap;gap:14px 22px;margin-top:14px}
.admin-checks label{display:flex;align-items:center;gap:8px;font-size:.9rem;cursor:pointer;color:var(--muted);padding:8px 10px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--card-2)}
.admin-checks input{accent-color:var(--brass-700);width:16px;height:16px}
.admin-money-hint{display:block;margin-top:4px;color:#f7f5ef;font-size:.78rem}
.admin-sticky-bar{position:fixed;bottom:0;inset-inline:0;z-index:2000;padding:12px 24px;background:rgba(7,9,13,.92);backdrop-filter:blur(16px);border-top:1px solid rgba(244,239,230,.1);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.admin-sticky-bar-info{color:rgb(247 245 239 / .56);font-size:.85rem}
.admin-sticky-bar-info strong{color:#f7f5ef}
.admin-sticky-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.admin-login{min-height:100vh;display:grid;place-items:center;padding:24px;background:#111315}
.admin-login-card{width:min(100%,420px);border:1px solid rgba(244,239,230,.12);background:rgba(16,20,26,.95);border-radius:24px;padding:32px 28px;box-shadow:0 24px 60px rgba(0,0,0,.4)}
.admin-login-card .kicker{color:#f7f5ef;font-size:.75rem;font-weight:600;letter-spacing:.12em;display:block;margin-bottom:8px}
.admin-login-card h1{margin:0 0 6px;font-size:1.35rem;font-weight:700}
.admin-login-card p{margin:0 0 24px;color:rgb(247 245 239 / .56);font-size:.9rem}
.admin-key-row{display:flex;gap:8px}
.admin-key-row input{flex:1;min-height:48px;padding:10px 14px;border:1px solid rgba(244,239,230,.12);border-radius:12px;background:rgba(255,255,255,.03);outline:none;font:inherit}
.admin-key-row input:focus{border-color:rgba(247,245,239,.45);box-shadow:0 0 0 3px rgba(247,245,239,.12)}
.admin-mobile-nav{display:none;position:fixed;left:10px;right:10px;bottom:10px;z-index:2001;min-height:64px;box-sizing:border-box;align-items:stretch;gap:5px;padding:6px;border:1px solid rgba(244,239,230,.12);border-radius:18px;background:linear-gradient(180deg,rgba(20,24,31,.96),rgba(9,12,17,.96));box-shadow:0 18px 48px rgba(0,0,0,.34),0 5px 16px rgba(0,0,0,.2);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);overflow-x:auto;overflow-y:hidden;justify-content:flex-start;scrollbar-width:none;direction:rtl;overscroll-behavior-x:contain}
.admin-mobile-nav::-webkit-scrollbar{display:none}
.admin-mobile-nav button,.admin-mobile-site{position:relative;flex:0 0 68px;min-width:68px;min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px 5px;border:1px solid transparent;border-radius:13px;background:transparent;color:rgb(247 245 239 / .56);font:inherit;font-size:.65rem;font-weight:600;line-height:1.45;cursor:pointer;white-space:nowrap;text-decoration:none;transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease}
.admin-mobile-nav button svg,.admin-mobile-site svg{flex:0 0 auto;opacity:.82}
.admin-mobile-nav button:hover,.admin-mobile-site:hover{background:rgba(255,255,255,.055);color:#f7f5ef}
.admin-mobile-nav button:active,.admin-mobile-site:active{transform:scale(.97)}
.admin-mobile-nav button.is-active{color:#f7f5ef;background:linear-gradient(180deg,rgba(247,245,239,.13),rgba(247,245,239,.07));border-color:rgba(247,245,239,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.admin-mobile-nav button.is-active::after{content:"";position:absolute;left:50%;bottom:4px;width:4px;height:4px;border-radius:999px;background:#f7f5ef;transform:translateX(-50%);opacity:.9}
.admin-mobile-site{color:rgb(247 245 239 / .72)!important;background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.1)}
.admin-mobile-site span{display:block}
.admin-mobile-nav span{overflow:hidden;text-overflow:ellipsis;max-width:100%}
@keyframes admin-spin{to{transform:rotate(360deg)}}
.admin-spin{animation:admin-spin .8s linear infinite}
.admin-field label,.admin-section .field>span{display:block;color:rgb(247 245 239 / .68);font-size:.8rem;font-weight:600;margin-bottom:6px}
.admin-section .field input,.admin-section .field select,.admin-section .field textarea{width:100%;min-height:46px;padding:10px 12px;border:1px solid rgba(244,239,230,.1);border-radius:12px;background:rgba(255,255,255,.03);outline:none;font:inherit;color:inherit}
.admin-section .field textarea{min-height:110px;resize:vertical}
.admin-section .field input:focus,.admin-section .field select:focus,.admin-section .field textarea:focus{border-color:rgba(247,245,239,.4);box-shadow:0 0 0 3px rgba(247,245,239,.1)}
.btn-gold,.btn-ghost{min-height:44px;padding:9px 16px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:999px;font-size:.88rem;font-weight:600;border:1px solid transparent;cursor:pointer;transition:transform .12s,filter .12s,background .12s,border-color .12s}
.btn-gold{color:#111315;background:#f7f5ef;box-shadow:0 6px 18px rgba(247,245,239,.2)}
.btn-gold:hover{filter:brightness(1.06)}
.btn-gold:disabled{opacity:.55;cursor:not-allowed}
.btn-ghost{color:#f7f5ef;border-color:rgba(244,239,230,.12);background:rgba(255,255,255,.04)}
.btn-ghost:hover{border-color:rgba(247,245,239,.35);background:rgba(247,245,239,.08)}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.admin-consultant{display:flex;flex-direction:column;gap:12px}
.admin-consultant-hint{margin:0;color:var(--muted);font-size:.85rem}
.admin-consultant-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.admin-consultant-card{display:flex;align-items:center;gap:12px;padding:14px 14px;border-radius:var(--r-md);border:1px solid var(--line);background:var(--card-2);color:var(--fg);font:inherit;text-align:right;cursor:pointer;transition:border-color .15s,background .15s,transform .12s,box-shadow .15s;position:relative;box-shadow:var(--el-1)}
.admin-consultant-card:hover{border-color:var(--brass-300);background:var(--brass-100);box-shadow:var(--el-2);transform:translateY(-1px)}
.admin-consultant-card.is-active{border-color:var(--brass-600);background:linear-gradient(180deg,var(--brass-100),var(--card));box-shadow:0 0 0 2px rgb(192 138 42 / 12%),var(--el-2)}
.admin-consultant-icon{width:40px;height:40px;border-radius:var(--r-sm);display:flex;align-items:center;justify-content:center;background:var(--brass-100);color:var(--brass-700);border:1px solid var(--brass-300);flex-shrink:0}
.admin-consultant-meta{display:flex;flex-direction:column;gap:2px;min-width:0}
.admin-consultant-meta strong{font-size:.95rem;font-weight:700;color:var(--fg)}
.admin-consultant-meta small{color:var(--muted);font-size:.78rem}
.admin-consultant-meta span{color:var(--subtle);font-size:.8rem;direction:ltr}
.admin-consultant-check{position:absolute;top:10px;left:10px;width:24px;height:24px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;background:var(--brass-700);color:#fff;box-shadow:0 2px 8px rgb(138 94 20 / 22%)}
.admin-consultant-select select{width:100%;min-height:44px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--card);color:var(--fg);padding:10px 12px;font:inherit}
.admin-media{display:flex;flex-direction:column;gap:10px}
.admin-media-drop{border:1.5px dashed rgba(247,245,239,.35);border-radius:16px;padding:22px 16px;text-align:center;cursor:pointer;background:rgba(15,18,24,.5);display:flex;flex-direction:column;align-items:center;gap:6px;color:rgb(247 245 239 / .52)}
.admin-media-drop strong{color:#f7f5ef}
.admin-media-drop.is-over{border-color:rgba(247,245,239,.7);background:rgba(247,245,239,.06)}
.admin-media-drop.is-busy{pointer-events:none;opacity:.75}
.admin-media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:10px;margin-top:4px}
.admin-media-item{position:relative;aspect-ratio:4/3;border-radius:12px;overflow:hidden;background:#111315;cursor:grab;transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease}.admin-media-item:active{cursor:grabbing}.admin-media-item.is-dragging{opacity:.55;transform:scale(.97);box-shadow:0 0 0 2px rgba(247,245,239,.55)}
.admin-media-item img,.admin-media-item video{width:100%;height:100%;object-fit:cover}
.admin-media-badge{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);border-radius:8px;padding:3px 6px;color:#f7f5ef;display:flex}
.admin-media-remove{position:absolute;bottom:6px;left:6px;width:28px;height:28px;border:0;border-radius:8px;background:rgba(180,40,40,.85);color:#f7f5ef;display:flex;align-items:center;justify-content:center;cursor:pointer}

.admin-music-manager{display:flex;flex-direction:column;gap:16px}
.admin-music-head h2{margin:0;font-size:1.05rem}
.admin-music-head p{margin:6px 0 0;color:var(--subtle);font-size:.82rem;line-height:1.8}
.admin-music-upload{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:18px;align-items:end}
.admin-music-upload .admin-music-file{display:flex;flex-direction:column;gap:6px}
.admin-music-file>span{color:var(--muted);font-size:.8rem;font-weight:600}
.admin-music-file input{width:100%;min-height:46px;padding:9px 10px;border:1px solid rgba(244,239,230,.1);border-radius:12px;background:rgba(255,255,255,.03);color:var(--fg);font:inherit}
.admin-music-file small{color:var(--subtle);font-size:.74rem;line-height:1.6}
.admin-music-upload>.btn-gold{min-height:46px;width:max-content}
.admin-music-list{display:flex;flex-direction:column}
.admin-music-row{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px 16px;border-bottom:1px solid rgba(244,239,230,.06)}
.admin-music-row:last-child{border-bottom:0}
.admin-music-main{min-width:0}
.admin-music-title-row{display:flex;align-items:center;gap:8px;min-width:0}
.admin-music-title-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9rem}
.admin-music-main>span{display:block;margin-top:4px;color:var(--subtle);font-size:.78rem}
.admin-music-active,.admin-music-inactive{display:inline-flex;flex-shrink:0;padding:2px 7px;border-radius:999px;font-size:.68rem;font-weight:700}
.admin-music-active{background:rgba(247,245,239,.16);color:#f7f5ef}
.admin-music-inactive{background:rgba(154,163,178,.14);color:rgb(247 245 239 / .52)}
.admin-music-progress{height:3px;margin-top:8px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.08)}
.admin-music-progress span{display:block;height:100%;border-radius:inherit;background:#f7f5ef;transition:width .12s linear}
@media (max-width:960px){
  .admin-music-upload{grid-template-columns:1fr}
  .admin-music-upload>.btn-gold{width:100%}
  .admin-music-row{grid-template-columns:40px minmax(0,1fr)}
  .admin-music-row>.admin-property-actions{grid-column:2;justify-content:flex-start;padding-top:0}
}


.admin-lead-manager{display:flex;flex-direction:column;gap:16px}
.admin-lead-list{display:flex;flex-direction:column}
.admin-lead-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;padding:16px 18px;border-bottom:1px solid rgba(244,239,230,.07)}
.admin-lead-card:last-child{border-bottom:0}
.admin-lead-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.admin-lead-title strong{font-size:.95rem}
.admin-lead-status{display:inline-flex;padding:3px 8px;border-radius:999px;font-size:.68rem;font-weight:700}
.admin-lead-status.status-new{background:rgba(247,245,239,.18);color:#f7f5ef}
.admin-lead-status.status-contacted{background:rgba(247,245,239,.16);color:rgb(247 245 239 / .72)}
.admin-lead-status.status-closed{background:rgba(247,245,239,.16);color:#f7f5ef}
.admin-lead-status.status-spam{background:rgba(247,245,239,.14);color:#f7f5ef}
.admin-lead-phone{display:inline-flex;align-items:center;gap:6px;margin-top:7px;color:#f7f5ef;text-decoration:none;direction:ltr}
.admin-lead-main>p{margin:6px 0;color:rgb(247 245 239 / .52);font-size:.8rem;line-height:1.8}
.admin-lead-main>small{display:block;margin-top:8px;color:rgb(247 245 239 / .48)}
.admin-lead-note{margin-top:8px;padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.03);color:var(--muted);font-size:.8rem;line-height:1.8}
.admin-lead-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.admin-lead-status-select{min-height:36px;border:1px solid rgba(244,239,230,.1);border-radius:10px;background:#111315;color:#f7f5ef;padding:7px 10px;font:inherit;font-size:.78rem}

@media (max-width:960px){
  .admin-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admin-property-card{grid-template-columns:72px 1fr;gap:12px}
  .admin-property-actions{grid-column:1/-1;justify-content:flex-start;padding-top:4px}
  .admin-form-grid{grid-template-columns:1fr}
  .admin-content{padding:16px 14px 96px}
  .admin-topbar{padding:12px 14px}
  .admin-sticky-bar{padding:10px 14px calc(10px + env(safe-area-inset-bottom))}
}
@media (max-width:520px){
  .admin-stats-grid{grid-template-columns:1fr 1fr;gap:10px}
  .admin-stat-card strong{font-size:1.3rem}
  .admin-consultant-grid{grid-template-columns:1fr}
}

.admin-dashboard{display:flex;flex-direction:column;gap:16px;max-width:1380px;margin:0 auto;direction:rtl}

.admin-dashboard-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.admin-dashboard-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.admin-dashboard-grid .admin-panel{min-width:0}

.admin-dashboard-stat{position:relative;display:grid;grid-template-columns:42px 1fr 16px;gap:10px;align-items:center;text-align:right;border:1px solid rgba(244,239,230,.1);background:rgba(16,20,26,.8);border-radius:16px;padding:15px 14px;color:#f7f5ef;font:inherit;cursor:pointer;transition:transform .15s,border-color .15s,background .15s}
.admin-dashboard-stat:hover{transform:translateY(-1px);border-color:rgba(247,245,239,.4);background:rgba(247,245,239,.05)}
.admin-dashboard-stat-icon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:rgba(247,245,239,.12);color:#f7f5ef}
.admin-dashboard-stat[data-tone="green"] .admin-dashboard-stat-icon{background:rgba(247,245,239,.12);color:#f7f5ef}
.admin-dashboard-stat[data-tone="amber"] .admin-dashboard-stat-icon{background:rgba(247,245,239,.12);color:#f7f5ef}
.admin-dashboard-stat[data-tone="blue"] .admin-dashboard-stat-icon{background:rgba(247,245,239,.12);color:rgb(247 245 239 / .72)}
.admin-dashboard-stat small{display:block;color:rgb(247 245 239 / .56);font-size:.76rem;margin-bottom:4px}
.admin-dashboard-stat strong{display:block;font-size:1.35rem}
.admin-dashboard-stat>svg{color:rgb(247 245 239 / .48)}
.admin-dashboard-grid{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr);gap:16px}
.admin-funnel{display:flex;flex-direction:column;gap:13px;padding:18px 20px 8px}
.admin-funnel-label{display:flex;justify-content:space-between;gap:10px;color:rgb(247 245 239 / .68);font-size:.8rem;margin-bottom:6px}
.admin-funnel-label strong{color:#f7f5ef}
.admin-funnel-track,.admin-breakdown-track{height:8px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}
.admin-funnel-track span,.admin-breakdown-track span{display:block;height:100%;min-width:5px;border-radius:inherit;background:#f7f5ef;transition:width .25s ease}
.admin-funnel-track span[data-tone="green"]{background:#f7f5ef}
.admin-funnel-track span[data-tone="blue"]{background:rgb(247 245 239 / .72)}
.admin-funnel-track span[data-tone="red"]{background:#f7f5ef}
.admin-dashboard-mini-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:8px 20px 18px}
.admin-dashboard-mini-grid>div{border:1px solid rgba(244,239,230,.07);border-radius:12px;padding:10px 11px;background:rgba(255,255,255,.02)}
.admin-dashboard-mini-grid span{display:block;color:rgb(247 245 239 / .48);font-size:.72rem;margin-bottom:4px}
.admin-dashboard-mini-grid strong{font-size:.95rem}
.admin-breakdown{display:flex;flex-direction:column;gap:13px;padding:18px 20px 8px}
.admin-breakdown-row>div:first-child{display:flex;justify-content:space-between;gap:10px;color:rgb(247 245 239 / .68);font-size:.8rem;margin-bottom:6px}
.admin-breakdown-row strong{color:#f7f5ef}
.admin-breakdown-track span{background:rgb(247 245 239 / .60)}.admin-dashboard-summary{color:#f7f5ef;font-size:.78rem;font-weight:600}
.admin-lead-chart{height:220px;display:grid;grid-template-columns:repeat(7,1fr);gap:10px;align-items:end;padding:20px 22px 18px}
.admin-lead-chart-col{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:7px;min-width:0}
.admin-lead-chart-value{height:18px;color:rgb(247 245 239 / .68);font-size:.7rem}
.admin-lead-chart-bar-wrap{height:150px;width:min(28px,65%);display:flex;align-items:flex-end;background:rgba(255,255,255,.025);border-radius:10px;overflow:hidden}
.admin-lead-chart-bar-wrap span{width:100%;min-height:4px;border-radius:9px 9px 4px 4px;background:#f7f5ef;opacity:.9;transition:height .25s ease}
.admin-lead-chart-col small{color:rgb(247 245 239 / .56);font-size:.7rem}
.admin-recent-leads{display:flex;flex-direction:column}
.admin-recent-lead{display:grid;grid-template-columns:34px minmax(0,1fr) 36px;gap:10px;align-items:center;padding:12px 18px;border-bottom:1px solid rgba(244,239,230,.06)}
.admin-recent-lead:last-child{border-bottom:0}
.admin-recent-lead-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(247,245,239,.1);color:#f7f5ef}
.admin-recent-lead-main{min-width:0}
.admin-recent-lead-title{display:flex;align-items:center;gap:8px;min-width:0}
.admin-recent-lead-title strong{font-size:.86rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.admin-recent-lead-main small{display:block;margin-top:4px;color:rgb(247 245 239 / .56);font-size:.73rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.admin-dashboard-footer-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.admin-dashboard .admin-panel{box-shadow:0 10px 35px rgba(0,0,0,.12)}
.admin-dashboard-stat{min-width:0}

.admin-dashboard-footer-card{border:1px solid rgba(244,239,230,.08);border-radius:16px;background:rgba(16,20,26,.6);padding:15px}
.admin-dashboard-footer-card span{display:flex;align-items:center;gap:7px;color:rgb(247 245 239 / .68);font-size:.8rem}
.admin-dashboard-footer-card span svg{color:#f7f5ef}
.admin-dashboard-footer-card strong{display:block;font-size:1.05rem;margin-top:8px}
.admin-dashboard-footer-card small{display:block;color:rgb(247 245 239 / .48);font-size:.7rem;margin-top:3px}

.properties-index-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:18px}
.properties-loading-pill{flex-shrink:0;border:1px solid rgba(247,245,239,.25);color:#f7f5ef;background:rgba(247,245,239,.07);padding:7px 10px;border-radius:999px;font-size:.72rem}
.properties-filter-panel{grid-template-columns:2fr repeat(3,minmax(130px,1fr))}
.properties-filter-search,.properties-sort-field,.properties-range-field{display:flex;flex-direction:column;gap:5px}
.properties-filter-search{grid-column:span 2;flex-direction:row;align-items:center;padding:0 12px}
.properties-filter-search input{border:0!important;background:transparent!important;padding:10px 0!important}
.properties-range-field span,.properties-sort-field span{color:rgb(247 245 239 / .56);font-size:.68rem;font-weight:600}
.properties-range-field input,.properties-sort-field select{min-height:42px}
.properties-sort-field select{width:100%;border:1px solid rgba(244,239,230,.1);border-radius:12px;background:rgba(255,255,255,.03);color:#f7f5ef;padding:9px 10px;font:inherit}
.properties-result-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.properties-reset-btn{display:inline-flex;align-items:center;gap:6px;background:transparent;border:0;color:rgb(247 245 239 / .52);font:inherit;font-size:.78rem;cursor:pointer}
.properties-reset-btn:hover{color:#f7f5ef}
.properties-empty-actions{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
.properties-load-more{display:flex;justify-content:center;margin-top:24px}
@media (max-width:1100px){
  .admin-dashboard-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .properties-filter-panel{grid-template-columns:repeat(2,minmax(0,1fr))}
  .properties-filter-search{grid-column:1/-1}
}
@media (max-width:700px){
  .admin-dashboard-grid{grid-template-columns:1fr}
  .admin-dashboard-stats{grid-template-columns:1fr 1fr}
  .admin-lead-chart{padding-inline:12px;gap:5px}
  .admin-lead-chart-bar-wrap{width:min(24px,70%)}
  .admin-dashboard-actions{justify-content:stretch}
  .admin-dashboard-actions>*{flex:1}
  .properties-filter-panel{grid-template-columns:1fr}
  .properties-filter-search{grid-column:auto}
  .properties-index-heading{align-items:flex-start;flex-direction:column}
}
.admin-pricing-panel{display:flex;flex-direction:column;gap:12px}
.admin-price-help{display:flex;align-items:flex-start;gap:8px;margin:0;padding:10px 12px;border:1px solid rgba(247,245,239,.14);border-radius:12px;background:rgba(247,245,239,.05);color:rgb(247 245 239 / .52);font-size:.76rem;line-height:1.8}
.admin-price-help svg{flex:0 0 auto;margin-top:2px;color:#f7f5ef}
.admin-price-calculator{padding:15px;border:1px solid rgba(247,245,239,.18);border-radius:15px;background:rgba(247,245,239,.04)}
.admin-price-calculator-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.admin-price-calculator-head>svg{color:#f7f5ef}
.admin-price-calculator-head .kicker{display:block;color:#f7f5ef;font-size:.68rem;margin-bottom:4px}
.admin-price-calculator-head strong{font-size:.9rem}
.admin-rate-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:12px}
.admin-rate-row>span{color:rgb(247 245 239 / .56);font-size:.75rem}
.admin-rate-row button{border:1px solid rgba(244,239,230,.1);background:rgba(255,255,255,.02);color:rgb(247 245 239 / .68);border-radius:10px;padding:6px 9px;font:inherit;font-size:.7rem;cursor:pointer}
.admin-rate-row button.is-active{border-color:rgba(247,245,239,.55);background:rgba(247,245,239,.12);color:#f7f5ef}
.admin-rate-row small{color:rgb(247 245 239 / .48);font-size:.68rem}
.admin-price-conversion-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:11px}
.admin-price-conversion-grid>div{padding:10px 11px;border:1px solid rgba(244,239,230,.07);border-radius:11px;background:rgba(255,255,255,.02)}
.admin-price-conversion-grid span{display:block;color:rgb(247 245 239 / .56);font-size:.7rem}
.admin-price-conversion-grid strong{display:block;margin-top:4px;font-size:.84rem}
.admin-price-calc-note{display:flex;align-items:flex-start;gap:6px;margin:10px 0 0;color:rgb(247 245 239 / .48);font-size:.68rem;line-height:1.7}
.admin-price-calc-note svg{flex:0 0 auto;margin-top:2px;color:#f7f5ef}
.admin-media-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;color:rgb(247 245 239 / .56);font-size:.72rem}
.admin-media-toolbar strong{color:#f7f5ef}
.admin-media-item.is-primary{box-shadow:0 0 0 1px rgba(247,245,239,.5),0 6px 18px rgba(0,0,0,.2)}
.admin-media-primary{position:absolute;left:6px;top:6px;padding:3px 7px;border-radius:999px;background:rgba(247,245,239,.9);color:#111315;font-size:.62rem;font-weight:800}
.admin-media-controls{position:absolute;left:6px;bottom:6px;display:flex;align-items:center;gap:4px}
.admin-media-controls .admin-media-remove,.admin-media-move{position:static;width:27px;height:27px;border:0;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.admin-media-move{background:rgba(0,0,0,.65);color:#f7f5ef}
.admin-media-move:disabled{opacity:.35;cursor:not-allowed}
.admin-media-controls .admin-media-remove{background:rgba(180,40,40,.85);color:#f7f5ef}
@media (max-width:720px){.admin-price-conversion-grid{grid-template-columns:1fr}}

.admin-lead-budget-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;background:rgba(247,245,239,.13);color:#f7f5ef;font-size:.66rem;font-weight:700}
.admin-lead-budget{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px;padding:10px;border:1px solid rgba(247,245,239,.14);border-radius:12px;background:rgba(247,245,239,.035)}
.admin-lead-budget>div{min-width:0;padding:8px 9px;border-radius:9px;background:rgba(255,255,255,.025)}
.admin-lead-budget span{display:block;color:rgb(247 245 239 / .48);font-size:.64rem}
.admin-lead-budget strong{display:block;margin-top:3px;color:#f7f5ef;font-size:.76rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.admin-lead-matches{grid-column:1/-1;display:flex!important;gap:6px!important;flex-wrap:wrap}
.admin-lead-matches a{padding:5px 7px;border-radius:8px;background:rgba(255,255,255,.03);color:rgb(247 245 239 / .68);text-decoration:none;font-size:.68rem}
.admin-lead-matches a:hover{color:#f7f5ef;background:rgba(247,245,239,.08)}
.admin-budget-send{color:#f7f5ef!important}
.admin-lead-followup{display:inline-flex;align-items:center;gap:5px;margin-top:9px;padding:5px 10px;border-radius:9px;border:1px solid rgb(0 0 0 / .12);background:rgb(0 0 0 / .03);color:rgb(0 0 0 / .62);font-size:.72rem}
.admin-lead-followup strong{color:#111315}
.admin-lead-followup.is-due{border-color:rgba(178,88,32,.4);background:rgba(205,110,50,.1);color:#9c4a17}
.admin-lead-followup.is-due strong{color:#9c4a17}
.admin-lead-attribution{margin-top:8px;color:rgb(0 0 0 / .5);font-size:.7rem;line-height:1.7}
.admin-lead-attribution strong{color:rgb(0 0 0 / .78);font-weight:600}
@media (max-width:900px){.admin-lead-budget{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.admin-lead-budget{grid-template-columns:1fr 1fr}}

.admin-app{background:#111315;color:#f7f5ef}
.admin-sidebar{background:linear-gradient(180deg,#111315 0%,#111315 100%);border-color:rgba(244,247,246,.08)}
.admin-sidebar-brand{border-color:rgba(244,247,246,.08)}
.admin-sidebar-brand strong{color:#f7f5ef}
.admin-sidebar-brand small,.admin-topbar p{color:rgb(247 245 239 / .56)}
.admin-nav-btn{color:rgb(247 245 239 / .68)}
.admin-nav-btn:hover{background:rgba(247,245,239,.10);color:#f7f5ef}
.admin-nav-btn.is-active{background:rgba(247,245,239,.14);color:rgb(247 245 239 / .78)}
.admin-topbar{background:rgba(7,17,19,.88);border-color:rgba(244,247,246,.08)}
.admin-stat-card,.admin-panel,.admin-section,.admin-login-card{border-color:rgba(244,247,246,.10);background:rgba(14,24,27,.78)}
.admin-stat-card:hover{border-color:rgba(247,245,239,.42)}
.admin-stat-card.is-active{border-color:rgba(247,245,239,.64);background:rgba(247,245,239,.10)}
.admin-panel-head,.admin-property-card{border-color:rgba(244,247,246,.07)}
.admin-search,.admin-section .field input,.admin-section .field select,.admin-section .field textarea{border-color:rgba(244,247,246,.10);background:rgba(255,255,255,.025);color:#f7f5ef}
.admin-search:focus-within,.admin-section .field input:focus,.admin-section .field select:focus,.admin-section .field textarea:focus{border-color:rgba(247,245,239,.52);box-shadow:0 0 0 3px rgba(247,245,239,.12)}
.admin-section legend,.admin-panel-head .kicker,.admin-login-card .kicker{color:#f7f5ef}
.admin-icon-btn:hover{border-color:rgba(247,245,239,.48);color:rgb(247 245 239 / .78);background:rgba(247,245,239,.09)}
.admin-checks input{accent-color:#f7f5ef}
.admin-sticky-bar{background:rgba(7,17,19,.92);border-color:rgba(244,247,246,.08)}
.admin-consultant-card:hover{border-color:rgba(247,245,239,.45);background:rgba(247,245,239,.06)}
.admin-consultant-card.is-active{border-color:rgba(247,245,239,.74);background:rgba(247,245,239,.11)}
.admin-consultant-icon{background:rgba(247,245,239,.13);color:rgb(247 245 239 / .78)}
.admin-consultant-check{background:#f7f5ef;color:#f7f5ef}
.admin-media-drop{border-color:rgba(247,245,239,.35);background:rgba(247,245,239,.035)}
.admin-media-drop.is-over{border-color:rgba(247,245,239,.74);background:rgba(247,245,239,.09)}
.admin-music-progress span{background:#f7f5ef}
.btn-gold{color:#f7f5ef;background:linear-gradient(135deg,#f7f5ef,#111315);box-shadow:0 10px 26px rgba(247,245,239,.22)}
.btn-gold:hover{filter:none;background:linear-gradient(135deg,#f7f5ef,#f7f5ef)}
.admin-smart-tools{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:16px}
.admin-smart-card,.admin-seo-preview{border:1px solid rgba(247,245,239,.22);border-radius:18px;padding:18px;background:linear-gradient(145deg,rgba(247,245,239,.09),rgba(198,165,106,.035) 55%,rgba(255,255,255,.015))}
.admin-smart-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
.admin-smart-head h3{margin:0;font-size:1rem}
.admin-smart-head p{margin:5px 0 0;color:rgb(247 245 239 / .56);font-size:.78rem;line-height:1.8}
.admin-quality{display:flex;align-items:center;gap:10px;margin-top:14px}
.admin-quality-bar{height:8px;flex:1;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
.admin-quality-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#f7f5ef,rgb(247 245 239 / .72),#f7f5ef)}
.admin-quality-score{font-size:.78rem;color:var(--fg);font-weight:700;min-width:42px;text-align:center}
.admin-seo-preview small{display:block;color:rgb(247 245 239 / .56);font-size:.72rem;margin-bottom:6px}
.admin-seo-preview strong{display:block;color:rgb(247 245 239 / .78);font-size:.95rem;line-height:1.7}
.admin-seo-preview p{margin:8px 0 0;color:rgb(247 245 239 / .68);font-size:.78rem;line-height:1.85}
.admin-seo-preview-url{margin-top:8px;color:rgb(247 245 239 / .72);font-size:.7rem;direction:ltr;text-align:left;word-break:break-all}
.admin-filter-row{display:grid;grid-template-columns:1.25fr repeat(4,minmax(130px,1fr));gap:8px;width:100%}
.admin-filter-row select{min-height:40px;padding:8px 10px;border:1px solid rgba(244,247,246,.10);border-radius:10px;background:rgba(255,255,255,.025);color:#f7f5ef;font:inherit}
.admin-filter-row select:focus{outline:none;border-color:rgba(247,245,239,.5)}
.admin-results-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;color:rgb(247 245 239 / .56);font-size:.75rem}
@media (max-width:980px){.admin-smart-tools{grid-template-columns:1fr}.admin-filter-row{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-filter-row select:first-child{grid-column:1/-1}}
@media (max-width:600px){.admin-filter-row{grid-template-columns:1fr}.admin-filter-row select:first-child{grid-column:auto}}

.admin-lead-status.status-follow_up{background:rgba(247,245,239,.14);color:#f7f5ef}
.admin-lead-status.status-visited{background:rgba(247,245,239,.14);color:rgb(247 245 239 / .72)}
.admin-lead-status.status-contract{background:rgba(247,245,239,.18);color:#f7f5ef}
.admin-dashboard-stat[data-tone="violet"] .admin-dashboard-stat-icon{background:rgba(247,245,239,.12);color:rgb(247 245 239 / .72)}
.admin-funnel-track span[data-tone="amber"]{background:#f7f5ef}
.admin-funnel-track span[data-tone="violet"]{background:rgb(247 245 239 / .72)}


/* Premium admin shell — navy / ivory / copper */
.admin-app{background:#f7f5ef;color:#111315}
.admin-sidebar{
  width:250px;
  background:linear-gradient(180deg,#111315 0%,#111315 100%);
  border-left:0;
  box-shadow:8px 0 30px rgba(16,24,39,.10);
}
.admin-sidebar-brand{border-bottom-color:rgba(255,255,255,.10);padding:20px 18px}
.admin-sidebar-brand strong{color:#f7f5ef}
.admin-sidebar-brand small{color:rgb(247 245 239 / .68)}
.admin-sidebar-brand .brand-logo-nav{filter:drop-shadow(0 8px 18px rgba(183,123,72,.18))}
.admin-nav-btn{color:rgb(247 245 239 / .72)}
.admin-nav-btn:hover{background:rgba(255,255,255,.07);color:#f7f5ef}
.admin-nav-btn.is-active{background:linear-gradient(135deg,rgba(183,123,72,.22),rgba(255,255,255,.06));color:#f7f5ef;box-shadow:inset 3px 0 0 #f7f5ef}
.admin-sidebar-foot{border-top-color:rgba(255,255,255,.09)}
.admin-main{background:#f7f5ef}
.admin-topbar{
  background:rgba(255,255,255,.90);
  color:#111315;
  border-bottom-color:rgba(23,32,51,.09);
  box-shadow:0 8px 24px rgba(23,32,51,.04);
}
.admin-topbar p{color:rgb(247 245 239 / .56)}
.admin-content{padding:26px}
.admin-stat-card,.admin-panel,.admin-section,.admin-login-card{
  background:#f7f5ef;
  border-color:rgba(23,32,51,.10);
  box-shadow:0 12px 30px rgba(23,32,51,.055);
  color:#111315;
}
.admin-stat-card:hover{border-color:rgba(183,123,72,.38)}
.admin-stat-card.is-active{border-color:rgba(183,123,72,.58);background:rgba(183,123,72,.055)}
.admin-stat-card span,.admin-property-meta p,.admin-empty{color:rgb(247 245 239 / .56)}
.admin-stat-card strong,.admin-property-meta h3,.admin-panel-head h2,.admin-empty strong{color:#111315}
.admin-stat-card[data-tone="green"] strong{color:#f7f5ef}
.admin-stat-card[data-tone="amber"] strong,.admin-stat-card[data-tone="gold"] strong{color:#f7f5ef}
.admin-stat-card[data-tone="muted"] strong{color:rgb(247 245 239 / .56)}
.admin-panel-head,.admin-property-card{border-color:rgba(23,32,51,.08)}
.admin-search{
  background:#f7f5ef;
  border-color:rgba(23,32,51,.11);
  color:#111315;
}
.admin-search input{color:#111315}
.admin-property-card:hover{background:#f7f5ef}
.admin-property-thumb{background:#f7f5ef}
.admin-property-tags span[data-status="published"]{background:rgba(24,122,88,.10);color:#f7f5ef}
.admin-property-tags span[data-status="draft"]{background:rgba(154,99,47,.11);color:#f7f5ef}
.admin-property-tags span[data-status="archived"]{background:rgba(103,113,132,.10);color:rgb(247 245 239 / .56)}
.admin-property-tags span[data-featured]{background:rgba(183,123,72,.13);color:#f7f5ef}
.admin-icon-btn{background:#f7f5ef;color:rgb(247 245 239 / .56);border-color:rgba(23,32,51,.11)}
.admin-icon-btn:hover{border-color:rgba(183,123,72,.45);color:#f7f5ef;background:rgba(183,123,72,.06)}
.admin-sticky-bar{background:rgba(255,255,255,.94);border-top-color:rgba(23,32,51,.10);box-shadow:0 -8px 24px rgba(23,32,51,.06)}
.admin-sticky-bar-info,.admin-topbar p{color:rgb(247 245 239 / .56)}
.admin-sticky-bar-info strong{color:#111315}
.admin-section legend,.admin-panel-head .kicker,.admin-login-card .kicker{color:#f7f5ef}
.admin-checks label,.admin-field label,.admin-section .field>span{color:rgb(247 245 239 / .56)}
.admin-checks input{accent-color:#f7f5ef}
.admin-section .field input,.admin-section .field select,.admin-section .field textarea,
.admin-key-row input{
  background:#f7f5ef;
  color:#111315;
  border-color:rgba(23,32,51,.11);
}
.admin-section .field input::placeholder,.admin-section .field textarea::placeholder{color:rgb(247 245 239 / .56)}
.admin-section .field input:focus,.admin-section .field select:focus,.admin-section .field textarea:focus,.admin-key-row input:focus{
  border-color:rgba(183,123,72,.55);
  box-shadow:0 0 0 3px rgba(183,123,72,.11);
}
.admin-consultant-card{background:#f7f5ef;color:#111315;border-color:rgba(23,32,51,.10)}
.admin-consultant-card:hover{border-color:rgba(183,123,72,.42);background:#f7f5ef}
.admin-consultant-card.is-active{border-color:rgba(183,123,72,.62);background:rgba(183,123,72,.07)}
.admin-consultant-meta strong{color:#111315}
.admin-consultant-meta small,.admin-consultant-meta span{color:rgb(247 245 239 / .56)}
.admin-consultant-icon{background:rgba(183,123,72,.10);color:#f7f5ef}
.admin-consultant-check{background:#f7f5ef;color:#f7f5ef}
.admin-media-drop{border-color:rgba(183,123,72,.30);background:rgba(183,123,72,.035)}
.admin-media-drop.is-over{border-color:rgba(183,123,72,.62);background:rgba(183,123,72,.08)}
.admin-music-progress span{background:#f7f5ef}
.admin-smart-card,.admin-seo-preview{border-color:rgba(183,123,72,.20);background:linear-gradient(145deg,rgba(183,123,72,.08),rgba(23,32,51,.02))}
.admin-smart-head p,.admin-seo-preview p{color:rgb(247 245 239 / .56)}
.admin-seo-preview strong{color:#f7f5ef}
.admin-seo-preview-url{color:#f7f5ef}
.admin-filter-row select{background:#f7f5ef;color:#111315;border-color:rgba(23,32,51,.11)}
.admin-filter-row select:focus{border-color:rgba(183,123,72,.48)}
.admin-results-meta{color:rgb(247 245 239 / .56)}
.btn-gold{background:linear-gradient(135deg,#f7f5ef,#111315);color:#f7f5ef;box-shadow:0 10px 25px rgba(116,70,34,.18)}
.btn-gold:hover{background:linear-gradient(135deg,#f7f5ef,#111315)}
.btn-ghost{background:#f7f5ef;color:#111315;border-color:rgba(23,32,51,.12)}
.btn-ghost:hover{border-color:rgba(183,123,72,.42);background:rgba(183,123,72,.05)}
.admin-login{background:radial-gradient(circle at 50% 0%,#111315 0%,#111315 44%,#111315 100%)}
.admin-login-card{color:#111315}
.admin-login-card h1{color:#111315}
.admin-login-card p{color:rgb(247 245 239 / .56)}
.admin-mobile-nav{background:rgba(255,255,255,.96);border-top-color:rgba(23,32,51,.10)}
.admin-mobile-nav button{color:rgb(247 245 239 / .56)}
.admin-mobile-nav button.is-active{color:#f7f5ef}
.admin-lead-budget-badge{background:rgba(183,123,72,.10);color:#f7f5ef}
.admin-lead-budget{background:rgba(183,123,72,.035);border-color:rgba(183,123,72,.14)}
.admin-lead-budget>div{background:#f7f5ef}
.admin-lead-budget span{color:rgb(247 245 239 / .56)}
.admin-lead-budget strong{color:#f7f5ef}
.admin-lead-matches a{background:#f7f5ef;color:rgb(247 245 239 / .56)}
.admin-lead-matches a:hover{color:#f7f5ef;background:#f7f5ef}
@media (max-width:980px){
  .admin-content{padding:18px}
  .admin-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admin-property-card{grid-template-columns:72px minmax(0,1fr);gap:12px}
  .admin-property-actions{grid-column:1/-1;justify-content:flex-start}
}
@media (max-width:640px){
  .admin-content{padding:12px 12px 92px}
  .admin-topbar{padding:12px 14px}
  .admin-topbar-actions{width:100%}
  .admin-topbar-actions>*{flex:1}
  .admin-stats-grid{grid-template-columns:1fr 1fr;gap:10px}
  .admin-stat-card{padding:14px 12px}
  .admin-form-grid{grid-template-columns:1fr}
  .admin-span-2{grid-column:auto}
  .admin-property-card{grid-template-columns:62px minmax(0,1fr);padding:12px}
  .admin-property-thumb{width:62px;height:50px}
  .admin-property-actions{gap:6px}
  .admin-section,.admin-panel{border-radius:16px}
  .admin-panel-head{padding:14px}
  .admin-panel-head h2{font-size:1rem}
  .admin-music-upload{grid-template-columns:1fr}
}
@media (max-width:390px){
  .admin-stats-grid{grid-template-columns:1fr}
  .admin-topbar-actions{display:grid;grid-template-columns:1fr 1fr}
}
/* Final monochrome enforcement: this stylesheet is injected after the global theme. */
.admin-app,.admin-main,.admin-content{background:#f7f5ef!important;color:#111315!important}
.admin-sidebar{background:#111315!important;color:#f7f5ef!important}
.admin-sidebar-brand,.admin-sidebar-foot{border-color:rgb(255 255 255 / .14)!important}
.admin-sidebar-brand strong{color:#f7f5ef!important}.admin-sidebar-brand small{color:rgb(255 255 255 / .62)!important}
.admin-sidebar-brand .brand-logo-nav{filter:grayscale(1) brightness(0) invert(1)!important}
.admin-nav-btn{color:rgb(255 255 255 / .72)!important}.admin-nav-btn:hover{background:rgb(255 255 255 / .08)!important;color:#f7f5ef!important}
.admin-nav-btn.is-active{background:#f7f5ef!important;color:#111315!important;box-shadow:inset 3px 0 0 #f7f5ef!important}
.admin-topbar,.admin-stat-card,.admin-panel,.admin-section,.admin-login-card,.admin-smart-card,.admin-seo-preview,.admin-price-help,.admin-price-calculator,.admin-lead-budget{background:#f7f5ef!important;color:#111315!important;border-color:rgb(0 0 0 / .12)!important}
.admin-topbar,.admin-sticky-bar,.admin-mobile-nav{box-shadow:0 8px 24px rgb(0 0 0 / .06)!important}
.admin-topbar p,.admin-stat-card span,.admin-property-meta p,.admin-empty,.admin-results-meta,.admin-smart-head p,.admin-seo-preview p,.admin-seo-preview small,.admin-section .field>span,.admin-field label,.admin-checks label{color:rgb(0 0 0 / .62)!important}
.admin-stat-card strong,.admin-property-meta h3,.admin-panel-head h2,.admin-empty strong,.admin-seo-preview strong,.admin-seo-preview-url,.admin-section legend,.admin-panel-head .kicker,.admin-login-card .kicker{color:#111315!important}
.admin-stat-card:hover,.admin-stat-card.is-active,.admin-property-card:hover,.admin-consultant-card:hover,.admin-consultant-card.is-active{border-color:#111315!important}
.admin-stat-card.is-active,.admin-property-card:hover{background:rgb(0 0 0 / .03)!important}
.admin-search,.admin-search input,.admin-section .field input,.admin-section .field select,.admin-section .field textarea,.admin-key-row input,.admin-filter-row select{background:#f7f5ef!important;color:#111315!important;border-color:rgb(0 0 0 / .14)!important}
.admin-search:focus-within,.admin-section .field input:focus,.admin-section .field select:focus,.admin-section .field textarea:focus,.admin-key-row input:focus,.admin-filter-row select:focus{border-color:#111315!important;box-shadow:0 0 0 3px rgb(0 0 0 / .07)!important}
.admin-icon-btn{background:#f7f5ef!important;color:#111315!important;border-color:rgb(0 0 0 / .14)!important}
.admin-icon-btn:hover,.admin-icon-btn.danger:hover{background:#111315!important;color:#f7f5ef!important;border-color:#111315!important}
.btn-gold{background:#111315!important;color:#f7f5ef!important;border-color:#111315!important;box-shadow:0 10px 24px rgb(0 0 0 / .16)!important}
.btn-gold:hover{background:#111315!important}
.btn-ghost{background:#f7f5ef!important;color:#111315!important;border-color:rgb(0 0 0 / .14)!important}
.btn-ghost:hover{background:rgb(0 0 0 / .045)!important;border-color:#111315!important}
.admin-property-tags span[data-status],.admin-property-tags span[data-featured],.admin-lead-status,.admin-lead-budget-badge{background:rgb(0 0 0 / .06)!important;color:#111315!important;border:1px solid rgb(0 0 0 / .12)!important}
.admin-property-tags span[data-featured]{background:#111315!important;color:#f7f5ef!important}
.admin-consultant-card{background:#f7f5ef!important;color:#111315!important;border-color:rgb(0 0 0 / .12)!important}
.admin-consultant-card:hover,.admin-consultant-card.is-active{background:#111315!important;color:#f7f5ef!important;border-color:#111315!important}
.admin-consultant-meta strong,.admin-consultant-meta span{color:inherit!important}
.admin-consultant-meta small{color:rgb(0 0 0 / .56)!important}.admin-consultant-card:hover .admin-consultant-meta small{color:rgb(255 255 255 / .62)!important}
.admin-consultant-icon,.admin-consultant-check,.admin-media-remove,.admin-media-primary,.admin-media-move{background:#111315!important;color:#f7f5ef!important}
.admin-media-drop{border-color:rgb(0 0 0 / .30)!important;background:rgb(0 0 0 / .02)!important;color:rgb(0 0 0 / .60)!important}
.admin-media-drop.is-over{border-color:#111315!important;background:rgb(0 0 0 / .05)!important}
.admin-music-progress span,.admin-quality-bar span,.admin-funnel-track span,.admin-breakdown-track span{background:#111315!important}
.admin-lead-budget{border-color:rgb(0 0 0 / .12)!important}.admin-lead-budget>div{background:rgb(0 0 0 / .03)!important}.admin-lead-budget span{color:rgb(0 0 0 / .62)!important}.admin-lead-budget strong{color:#111315!important}
.admin-lead-matches a{background:rgb(0 0 0 / .04)!important;color:#111315!important}.admin-lead-matches a:hover{background:#111315!important;color:#f7f5ef!important}
.admin-mobile-nav{background:rgb(255 255 255 / .97)!important;border-top-color:rgb(0 0 0 / .12)!important}.admin-mobile-nav button{color:rgb(0 0 0 / .56)!important}.admin-mobile-nav button.is-active{color:#111315!important}



/* ==========================================================================
   Final readability pass — desktop + admin
   High-contrast, light workspace for the admin content area.
   This block intentionally sits last because several child admin modules
   inject their own small style tags.
   ========================================================================== */
.admin-main,
.admin-content{background:#f6f8fb!important;color:#172033!important}
.admin-topbar{background:rgba(255,255,255,.96)!important;color:#172033!important;border-bottom:1px solid #d8e0e8!important}
.admin-topbar h1,.admin-topbar strong,.admin-panel-head h2,.admin-section legend{color:#101828!important}
.admin-topbar p{color:#475467!important}
.admin-stat-card,.admin-panel,.admin-section,.admin-smart-card,.admin-seo-preview,
.admin-music-manager,.admin-lead-manager,.admin-dashboard,.divar-wrap,
[class*="admin-partner"]{
  background:#ffffff!important;
  color:#172033!important;
  border-color:#d9e1ea!important;
  box-shadow:0 10px 30px rgba(16,24,40,.06)!important;
}
.admin-stat-card span,.admin-property-meta p,.admin-empty,.admin-results-meta,
.admin-smart-head p,.admin-seo-preview p,.admin-seo-preview small,
.admin-section .field>span,.admin-field label,.admin-checks label,
.admin-panel-head p,.admin-panel-head small{
  color:#475467!important;
}
.admin-stat-card strong,.admin-property-meta h3,.admin-empty strong,
.admin-seo-preview strong,.admin-seo-preview-url,.admin-panel-head .kicker{
  color:#101828!important;
}
.admin-panel-head,.admin-property-card,.admin-breakdown-row,.admin-dashboard-card,
.admin-lead-card,.admin-music-track,.admin-music-row{
  border-color:#e1e7ee!important;
}
.admin-search,.admin-search input,
.admin-section .field input,.admin-section .field select,.admin-section .field textarea,
.admin-key-row input,.admin-filter-row select,
.admin-main input,.admin-main select,.admin-main textarea{
  background:#ffffff!important;
  color:#101828!important;
  border:1px solid #cbd5e1!important;
  box-shadow:none!important;
}
.admin-main input::placeholder,.admin-main textarea::placeholder{color:#667085!important}
.admin-section .field input:focus,.admin-section .field select:focus,
.admin-section .field textarea:focus,.admin-key-row input:focus,
.admin-filter-row select:focus,.admin-main input:focus,.admin-main select:focus,
.admin-main textarea:focus,.admin-search:focus-within{
  border-color:#9a6a3a!important;
  box-shadow:0 0 0 3px rgba(154,106,58,.14)!important;
}
.admin-section .field>span,.admin-field label{font-weight:700!important;color:#344054!important}
/* The legacy "every descendant is #172033" rule used to sit here and was
   removed on purpose: a blanket colour on the universal selector outranks
   inheritance, so any explicit accent on a control (the active divar tab, a
   selected chip, a brass counter) was silently repainted and ended up
   invisible on its own dark background. Every container above already carries
   this colour, so descendants inherit it and component colours win again. */
.admin-main .admin-dashboard h1,.admin-main .admin-dashboard h2,.admin-main .admin-dashboard h3,
.admin-main .admin-music-manager h1,.admin-main .admin-music-manager h2,.admin-main .admin-music-manager h3,
.admin-main .admin-lead-manager h1,.admin-main .admin-lead-manager h2,.admin-main .admin-lead-manager h3,
.admin-main .divar-wrap h1,.admin-main .divar-wrap h2,.admin-main .divar-wrap h3,
.admin-main [class*="admin-partner"] h1,.admin-main [class*="admin-partner"] h2,.admin-main [class*="admin-partner"] h3{
  color:#101828!important;
}
.admin-main .admin-dashboard p,.admin-main .admin-dashboard small,
.admin-main .admin-music-manager p,.admin-main .admin-music-manager small,
.admin-main .admin-lead-manager p,.admin-main .admin-lead-manager small,
.admin-main .divar-wrap p,.admin-main .divar-wrap small,
.admin-main [class*="admin-partner"] p,.admin-main [class*="admin-partner"] small{
  color:#475467!important;
}
.admin-main .btn-gold,
.admin-main .admin-mobile-site,
.admin-main .admin-icon-btn:hover,
.admin-main .admin-icon-btn.danger:hover,
.admin-main .admin-media-remove,
.admin-main .admin-media-primary,
.admin-main .admin-media-move,
.admin-main .admin-consultant-card:hover,
.admin-main .admin-consultant-card.is-active,
.admin-main .admin-property-tags span[data-featured]{
  color:#ffffff!important;
}
.admin-main .btn-gold{background:#101828!important;border-color:#101828!important}
.admin-main .btn-ghost{background:#ffffff!important;color:#101828!important;border-color:#cbd5e1!important}
.admin-main .btn-ghost:hover{background:#f2f4f7!important;border-color:#98a2b3!important}
.admin-property-tags span[data-status],
.admin-property-tags span[data-featured],
.admin-lead-status,.admin-lead-budget-badge{
  background:#f2f4f7!important;
  color:#344054!important;
  border:1px solid #d0d5dd!important;
}
.admin-property-tags span[data-status="published"]{background:#ecfdf3!important;color:#027a48!important;border-color:#abefc6!important}
.admin-property-tags span[data-status="draft"]{background:#fffaeb!important;color:#b54708!important;border-color:#fedf89!important}
.admin-property-tags span[data-status="archived"]{background:#f2f4f7!important;color:#475467!important}
.admin-property-tags span[data-featured]{background:#101828!important;color:#ffffff!important;border-color:#101828!important}
.admin-lead-status.status-follow_up,.admin-lead-status.status-visited,
.admin-lead-status.status-contract{background:#eef4ff!important;color:#175cd3!important;border-color:#b2ccff!important}
.admin-music-progress,.admin-quality-bar,.admin-funnel-track,.admin-breakdown-track{
  background:#e7ecf2!important;
}
.admin-music-progress span,.admin-quality-bar span,.admin-funnel-track span,.admin-breakdown-track span{
  background:#9a6a3a!important;
}
.admin-mobile-nav{
  background:rgba(255,255,255,.98)!important;
  border-top:1px solid #d0d5dd!important;
}
.admin-mobile-nav button{color:#475467!important}
.admin-mobile-nav button.is-active{color:#101828!important;font-weight:800!important}
@media (min-width:961px){
  .admin-content{padding:30px 32px!important}
  .admin-stats-grid{gap:16px!important}
  .admin-stat-card{min-height:112px!important}
}

.admin-property-finish-grid{
  margin-top:14px!important;
}
.admin-property-finish-grid .field select{
  min-height:48px!important;
  cursor:pointer!important;
}
.admin-other-amenities{
  margin-top:14px!important;
  border:1px solid #d9e1ea!important;
  border-radius:15px!important;
  background:#f8fafc!important;
  overflow:hidden!important;
}
.admin-other-amenities summary{
  min-height:64px!important;
  padding:12px 14px!important;
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  gap:12px!important;
  cursor:pointer!important;
  list-style:none!important;
  user-select:none!important;
}
.admin-other-amenities summary::-webkit-details-marker{display:none!important}
.admin-other-amenities summary > span:first-child{
  display:flex!important;
  flex-direction:column!important;
  gap:2px!important;
  text-align:right!important;
}
.admin-other-amenities summary strong{
  color:#101828!important;
  font-size:.82rem!important;
}
.admin-other-amenities summary small{
  color:#667085!important;
  font-size:.66rem!important;
}
.admin-other-amenities-summary-meta{
  display:inline-flex!important;
  align-items:center!important;
  gap:6px!important;
  color:#475467!important;
  font-size:.66rem!important;
  font-weight:800!important;
  white-space:nowrap!important;
}
.admin-other-amenities[open] .admin-other-amenities-summary-meta svg{
  transform:rotate(180deg)!important;
}
.admin-other-amenities-grid{
  padding:0 14px 14px!important;
  display:grid!important;
  grid-template-columns:repeat(auto-fill,minmax(180px,1fr))!important;
  gap:7px!important;
  border-top:1px solid #e1e7ee!important;
  padding-top:12px!important;
}
.admin-other-amenities-grid label{
  min-height:42px!important;
  display:flex!important;
  align-items:center!important;
  gap:8px!important;
  padding:7px 9px!important;
  border:1px solid #d9e1ea!important;
  border-radius:11px!important;
  background:#fff!important;
  color:#344054!important;
  cursor:pointer!important;
  transition:border-color .15s ease,background .15s ease,transform .15s ease!important;
}
.admin-other-amenities-grid label:hover{
  border-color:#b7c2ce!important;
  transform:translateY(-1px)!important;
}
.admin-other-amenities-grid label.is-selected{
  border-color:rgba(154,106,58,.45)!important;
  background:#fbf7f2!important;
}
.admin-other-amenities-grid input{
  width:17px!important;
  height:17px!important;
  margin:0!important;
  accent-color:#9a6a3a!important;
  flex:0 0 auto!important;
}
.admin-other-amenities-grid label span{
  font-size:.69rem!important;
  line-height:1.6!important;
  color:#344054!important;
}
@media(max-width:720px){
  .admin-property-finish-grid{
    grid-template-columns:1fr!important;
  }
  .admin-other-amenities summary{
    min-height:60px!important;
    padding:10px 11px!important;
  }
  .admin-other-amenities-grid{
    grid-template-columns:1fr 1fr!important;
    gap:6px!important;
    padding:10px!important;
  }
  .admin-other-amenities-grid label{
    min-height:40px!important;
    padding:6px 7px!important;
  }
  .admin-other-amenities-grid label span{
    font-size:.62rem!important;
  }
}
/* Keep admin form actions above floating media/music players. */
.admin-sticky-bar{
  z-index:2000!important;
  isolation:isolate!important;
}
.admin-sticky-actions,
.admin-sticky-bar-info{
  position:relative!important;
  z-index:2001!important;
}
/* Consultant management */
.admin-consultants-manager{display:grid;gap:18px}
.admin-consultants-summary{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:18px;padding:22px!important}
.admin-consultants-summary h2{margin-top:3px;color:#101828!important;font-size:1.15rem}
.admin-consultants-summary p{margin-top:5px;color:#667085!important;font-size:.76rem;line-height:1.8}
.admin-consultants-count{min-width:88px;display:grid;gap:2px;justify-items:center;padding:11px 14px;border:1px solid #e1e7ee;border-radius:14px;background:#f8fafc}
.admin-consultants-count strong{color:#101828;font-size:1.2rem}.admin-consultants-count span{color:#667085;font-size:.65rem}
.admin-consultants-layout{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(320px,.92fr);gap:18px;align-items:start}
.admin-consultant-form,.admin-consultant-list{padding:20px!important;background:#fff!important;border:1px solid #d9e1ea!important;border-radius:18px!important}
.admin-consultant-form .admin-panel-head,.admin-consultant-list .admin-panel-head{margin-bottom:16px}
.admin-consultant-form .admin-form-grid{gap:12px}
.admin-consultant-socials{margin-top:16px;padding:14px;border:1px solid #e1e7ee;border-radius:15px;background:#f8fafc}
.admin-consultant-socials legend{padding:0 6px;color:#101828;font-size:.75rem;font-weight:800}
.admin-consultant-active-toggle{min-width:0}
.admin-consultant-status-toggle{min-height:48px;display:flex;align-items:center;justify-content:flex-start;gap:9px;padding:0 12px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;color:#475467;font:inherit;font-size:.74rem;cursor:pointer}
.admin-consultant-status-toggle span{width:10px;height:10px;border-radius:50%;background:#98a2b3}
.admin-consultant-status-toggle.is-active{border-color:#abefc6;background:#f0fdf4;color:#027a48}.admin-consultant-status-toggle.is-active span{background:#12b76a}
.admin-consultant-list-count{padding:5px 9px;border-radius:999px;background:#f2f4f7;color:#475467;font-size:.66rem;font-weight:800}
.admin-consultant-records{display:grid;gap:8px}
.admin-consultant-record{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:11px;border:1px solid #e5e9ef;border-radius:13px;background:#fff}
.admin-consultant-record.is-inactive{opacity:.58;background:#f8fafc}
.admin-consultant-record-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:10px;background:#f7efe6;color:#8a5c31}
.admin-consultant-record-main{min-width:0;display:grid;gap:2px}.admin-consultant-record-main strong{color:#101828;font-size:.77rem}.admin-consultant-record-main span{color:#475467;font-size:.67rem}.admin-consultant-record-main small{color:#667085;font-size:.64rem}
.admin-consultant-record-actions{display:flex;gap:5px}
@media(max-width:960px){
  .admin-consultants-summary{grid-template-columns:1fr auto}
  .admin-consultants-summary .btn-gold{grid-column:1/-1}
  .admin-consultants-layout{grid-template-columns:1fr}
}
@media(max-width:720px){
  .admin-consultants-summary{grid-template-columns:1fr;padding:16px!important}
  .admin-consultants-count{justify-self:start}
  .admin-consultant-form,.admin-consultant-list{padding:14px!important}
  .admin-consultant-form .admin-form-grid{grid-template-columns:1fr}
  .admin-consultant-form .admin-span-2{grid-column:1}
}

/* ==========================================================================
   Hirmand Admin 3.0 — canonical light workspace
   ========================================================================== */
.admin-app{min-height:100vh!important;background:var(--paper,#f7f4ee)!important;color:var(--fg,#152430)!important}
.admin-sidebar{width:var(--admin-rail)!important;background:linear-gradient(180deg,var(--navy-950,#081320),var(--navy-900,#0b1a2b))!important;border-left:0!important;box-shadow:8px 0 32px rgb(8 19 32 / 12%)!important}
.admin-sidebar-brand{min-height:82px;padding:18px 17px!important;border-color:rgb(255 255 255 / 10%)!important}
.admin-sidebar-brand .brand-logo-nav{width:45px!important;height:45px!important;filter:drop-shadow(0 8px 18px rgb(192 138 42 / 18%))!important}
.admin-sidebar-brand strong{color:#fff!important}.admin-sidebar-brand small{color:rgb(255 255 255 / 58%)!important}
.admin-sidebar-brand{
  min-height:86px!important;
  padding:16px 14px!important;
  gap:11px!important;
  background:linear-gradient(180deg,rgb(255 255 255 / 3%),rgb(255 255 255 / 1%))!important;
  border-bottom:1px solid rgb(255 255 255 / 12%)!important;
}
.admin-brand-icon{
  width:42px!important;
  height:42px!important;
  flex:0 0 42px!important;
  display:grid!important;
  place-items:center!important;
  border:1px solid rgb(192 138 42 / 42%)!important;
  border-radius:12px!important;
  background:linear-gradient(145deg,rgb(192 138 42 / 23%),rgb(255 255 255 / 7%))!important;
  color:#f8ead0!important;
  box-shadow:0 8px 18px rgb(0 0 0 / 15%),inset 0 1px 0 rgb(255 255 255 / 9%)!important;
}
.admin-brand-copy{
  min-width:0!important;
  display:flex!important;
  flex-direction:column!important;
  gap:2px!important;
}
.admin-brand-copy strong{
  display:block!important;
  color:#fff!important;
  font-size:1rem!important;
  font-weight:850!important;
  line-height:1.45!important;
}
.admin-brand-copy small{
  display:block!important;
  color:rgb(255 255 255 / 58%)!important;
  font-size:.72rem!important;
  line-height:1.5!important;
}
.admin-brand-extra{
  margin-inline-start:auto!important;
  display:flex!important;
  align-items:center!important;
}
.admin-brand-extra:empty{display:none!important}

.admin-sidebar-nav{
  padding:12px 11px 14px!important;
  gap:5px!important;
  background:linear-gradient(180deg,rgb(255 255 255 / 1%),transparent 20%)!important;
}
.admin-nav-intro{
  display:flex!important;
  align-items:center!important;
  gap:9px!important;
  min-height:22px!important;
  padding:2px 5px 4px!important;
  margin-bottom:1px!important;
}
.admin-nav-intro-kicker{
  color:rgb(255 255 255 / 42%)!important;
  font-size:.66rem!important;
  font-weight:800!important;
  letter-spacing:.03em!important;
  white-space:nowrap!important;
}
.admin-nav-intro-line{
  height:1px!important;
  flex:1!important;
  background:linear-gradient(90deg,rgb(255 255 255 / 14%),transparent)!important;
}
.admin-nav-section-label{
  display:flex!important;
  align-items:center!important;
  gap:8px!important;
  min-height:27px!important;
  padding:9px 7px 3px!important;
  margin-top:3px!important;
  color:rgb(255 255 255 / 43%)!important;
  font-size:.67rem!important;
  font-weight:800!important;
  line-height:1.5!important;
}
.admin-nav-section-label:after{
  content:""!important;
  flex:1!important;
  height:1px!important;
  background:linear-gradient(90deg,rgb(255 255 255 / 10%),transparent)!important;
}
.admin-nav-btn{
  min-height:46px!important;
  padding:9px 11px!important;
  gap:10px!important;
  border-radius:12px!important;
  position:relative!important;
  isolation:isolate!important;
}
.admin-nav-btn-icon{
  width:30px!important;
  height:30px!important;
  flex:0 0 30px!important;
  display:grid!important;
  place-items:center!important;
  border:1px solid rgb(255 255 255 / 8%)!important;
  border-radius:9px!important;
  background:rgb(255 255 255 / 4%)!important;
  color:rgb(255 255 255 / 70%)!important;
  transition:background .16s ease,color .16s ease,border-color .16s ease,transform .16s ease!important;
}
.admin-nav-btn-icon svg{
  width:17px!important;
  height:17px!important;
  flex:0 0 17px!important;
}
.admin-nav-btn-label{
  min-width:0!important;
  flex:1!important;
  display:block!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
}
.admin-nav-btn-meta{
  flex:0 0 auto!important;
  padding:3px 7px!important;
  border-radius:999px!important;
  color:#f0d8a5!important;
  background:rgb(192 138 42 / 13%)!important;
  border:1px solid rgb(192 138 42 / 20%)!important;
  font-size:.59rem!important;
  font-weight:800!important;
  line-height:1.4!important;
}
.admin-nav-btn:hover .admin-nav-btn-icon{
  color:#fff!important;
  background:rgb(255 255 255 / 8%)!important;
  border-color:rgb(255 255 255 / 14%)!important;
  transform:translateY(-1px)!important;
}
.admin-nav-btn.is-active .admin-nav-btn-icon{
  color:#ffe9b9!important;
  background:rgb(192 138 42 / 20%)!important;
  border-color:rgb(192 138 42 / 32%)!important;
}
.admin-nav-btn-create{
  min-height:50px!important;
  margin:2px 0 4px!important;
  border-color:rgb(192 138 42 / 32%)!important;
  background:linear-gradient(135deg,rgb(192 138 42 / 21%),rgb(255 255 255 / 5%))!important;
  box-shadow:0 7px 18px rgb(0 0 0 / 12%),inset 0 1px 0 rgb(255 255 255 / 6%)!important;
}
.admin-nav-btn-create .admin-nav-btn-icon{
  color:#ffe9b9!important;
  background:rgb(192 138 42 / 20%)!important;
  border-color:rgb(192 138 42 / 32%)!important;
}
.admin-nav-btn-create:hover{
  background:linear-gradient(135deg,rgb(192 138 42 / 28%),rgb(255 255 255 / 8%))!important;
  border-color:rgb(192 138 42 / 46%)!important;
  transform:translateY(-1px)!important;
}
.admin-nav-btn-context{
  min-height:44px!important;
  border-color:rgb(255 255 255 / 9%)!important;
  background:rgb(255 255 255 / 4%)!important;
}
.admin-nav-btn-context-title{
  min-width:0!important;
  max-width:94px!important;
  color:rgb(255 255 255 / 42%)!important;
  font-size:.62rem!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
}
.admin-nav-btn-context.is-active{
  border-color:rgb(192 138 42 / 28%)!important;
}

.admin-sidebar-nav{
  padding:16px 12px!important;
  gap:6px!important;
  overflow-y:auto!important;
  overflow-x:hidden!important;
  scrollbar-width:thin;
  scrollbar-gutter:stable;
}
.admin-nav-btn{
  min-height:47px!important;
  padding:10px 14px!important;
  border:1px solid transparent!important;
  border-radius:13px!important;
  color:rgb(255 255 255 / 82%)!important;
  font-size:.87rem!important;
  font-weight:700!important;
  line-height:1.65!important;
  letter-spacing:0!important;
  text-align:right!important;
  justify-content:flex-start!important;
  white-space:normal!important;
  overflow-wrap:normal!important;
  text-rendering:optimizeLegibility;
}
.admin-nav-btn:hover{
  background:rgb(255 255 255 / 9%)!important;
  color:#fff!important;
  border-color:rgb(255 255 255 / 12%)!important;
}
.admin-nav-btn.is-active{
  color:#fff!important;
  background:linear-gradient(135deg,rgb(192 138 42 / 25%),rgb(255 255 255 / 8%))!important;
  border-color:rgb(192 138 42 / 34%)!important;
  box-shadow:inset -3px 0 0 var(--brass-500,#c08a2a),0 6px 16px rgb(0 0 0 / 12%)!important;
}
.admin-sidebar-foot{
  padding:12px 12px 16px!important;
  border-color:rgb(255 255 255 / 10%)!important;
}
.admin-sidebar-foot{
  padding:13px 12px 16px!important;
  gap:7px!important;
  background:linear-gradient(180deg,rgb(255 255 255 / 2%),rgb(255 255 255 / 4%))!important;
  border-top:1px solid rgb(255 255 255 / 14%)!important;
}
.admin-sidebar-foot-label{
  padding:0 6px 2px!important;
  color:rgb(255 255 255 / 40%)!important;
  font-size:.62rem!important;
  font-weight:800!important;
  line-height:1.5!important;
}

.admin-sidebar-foot .admin-nav-btn{
  min-height:45px!important;
  padding:10px 13px!important;
  gap:11px!important;
  border:1px solid rgb(255 255 255 / 11%)!important;
  border-radius:12px!important;
  background:rgb(255 255 255 / 5%)!important;
  color:rgb(255 255 255 / 92%)!important;
  font-size:.86rem!important;
  font-weight:750!important;
  line-height:1.55!important;
  text-decoration:none!important;
  text-align:right!important;
  box-shadow:inset 0 1px 0 rgb(255 255 255 / 4%)!important;
}
.admin-sidebar-foot .admin-nav-btn svg{
  flex:0 0 18px!important;
  width:18px!important;
  height:18px!important;
  color:rgb(255 255 255 / 82%)!important;
  opacity:1!important;
}
.admin-sidebar-foot .admin-nav-btn:hover{
  background:rgb(255 255 255 / 10%)!important;
  border-color:rgb(255 255 255 / 18%)!important;
  color:#fff!important;
  box-shadow:0 5px 14px rgb(0 0 0 / 14%),inset 0 1px 0 rgb(255 255 255 / 7%)!important;
}
.admin-sidebar-foot .admin-nav-btn:hover svg{
  color:#fff!important;
}
.admin-sidebar-foot .admin-nav-btn:last-child{
  color:#fff1ef!important;
  border-color:rgb(218 110 96 / 24%)!important;
  background:rgb(170 55 43 / 12%)!important;
}
.admin-sidebar-foot .admin-nav-btn:last-child:hover{
  background:rgb(170 55 43 / 20%)!important;
  border-color:rgb(224 123 110 / 38%)!important;
}
.admin-sidebar-foot .admin-nav-btn:last-child svg{
  color:#ffd9d4!important;
}

.admin-main{min-width:0!important;background:radial-gradient(circle at 90% 0%,rgb(192 138 42 / 5%),transparent 24rem),var(--paper,#f7f4ee)!important;color:var(--fg,#152430)!important}
.admin-topbar{min-height:72px!important;padding:13px 28px!important;background:rgb(255 255 255 / 92%)!important;border-bottom:1px solid #dfe5eb!important;box-shadow:0 8px 24px rgb(16 24 40 / 4%)!important;backdrop-filter:blur(16px)}
.admin-topbar h1{color:#132333!important;font-size:1.18rem!important;font-weight:850!important;letter-spacing:-.02em!important}
.admin-topbar p{color:#66717d!important}.admin-topbar-actions{gap:9px!important}
.admin-content{width:100%!important;max-width:1720px!important;padding:28px 30px 110px!important}
.admin-panel,.admin-section,.admin-stat-card,.admin-login-card,.admin-smart-card,.admin-seo-preview{background:#fff!important;color:#152430!important;border:1px solid #dfe5eb!important;box-shadow:0 10px 28px rgb(16 24 40 / 5%)!important}
.admin-panel,.admin-section{border-radius:18px!important}
.admin-panel-head{min-height:62px;padding:15px 19px!important;border-bottom:1px solid #e7ebef!important}
.admin-panel-head h2{color:#132333!important;font-weight:820!important}.admin-panel-head .kicker{color:var(--brass-700,#8a5e14)!important;font-weight:850!important}
.admin-stats-grid,.admin-dashboard-stats{grid-template-columns:repeat(auto-fit,minmax(175px,1fr))!important;gap:12px!important}
.admin-stat-card{min-height:104px!important;padding:16px!important;text-align:right!important}
.admin-stat-card:hover{transform:translateY(-2px);border-color:rgb(192 138 42 / 38%)!important;box-shadow:0 13px 30px rgb(16 24 40 / 8%)!important}
.admin-stat-card.is-active{background:linear-gradient(145deg,#fffaf2,#fff)!important;border-color:rgb(192 138 42 / 58%)!important}
.admin-stat-card span{color:#66717d!important}.admin-stat-card strong{color:#122333!important;font-size:1.42rem!important}
.admin-dashboard{background:transparent!important;border:0!important;box-shadow:none!important}
.admin-dashboard-stat{min-height:91px!important;border:1px solid #dfe5eb!important;background:#fff!important;color:#132333!important;box-shadow:0 7px 20px rgb(16 24 40 / 5%)!important}
.admin-dashboard-stat:hover{border-color:rgb(192 138 42 / 42%)!important;background:#fffdf9!important;box-shadow:0 12px 26px rgb(16 24 40 / 8%)!important}
.admin-dashboard-stat-icon{background:#f7efe2!important;color:var(--brass-700,#8a5e14)!important;border:1px solid #ead8bd}
.admin-dashboard-stat small{color:#66717d!important}.admin-dashboard-stat strong{color:#122333!important}.admin-dashboard-stat>svg{color:#8a959f!important}
.admin-dashboard-mini-grid>div{background:#f8fafc!important;border-color:#e3e8ee!important}.admin-dashboard-mini-grid span{color:#66717d!important}.admin-dashboard-mini-grid strong{color:#122333!important}
.admin-funnel,.admin-breakdown{padding-left:19px!important;padding-right:19px!important}.admin-funnel-label,.admin-breakdown-row>div:first-child{color:#475467!important}.admin-funnel-label strong,.admin-breakdown-row strong{color:#122333!important}
.admin-funnel-track,.admin-breakdown-track,.admin-lead-chart-bar-wrap,.admin-music-progress,.admin-quality-bar{background:#e8edf2!important}
.admin-funnel-track span,.admin-breakdown-track span,.admin-lead-chart-bar-wrap span,.admin-music-progress span,.admin-quality-bar span{background:linear-gradient(90deg,var(--brass-700,#8a5e14),var(--brass-500,#c08a2a))!important}
.admin-dashboard-summary,.admin-lead-chart-value,.admin-lead-chart-col small{color:#66717d!important}
.admin-recent-lead{border-color:#e7ebef!important}.admin-recent-lead-icon{background:#f7efe2!important;color:var(--brass-700,#8a5e14)!important}.admin-recent-lead-main small{color:#66717d!important}
.admin-property-list{background:#fff!important}
.admin-property-card{grid-template-columns:28px 88px minmax(0,1fr) auto!important;gap:14px!important;min-width:0;padding:14px 18px!important;border-color:#e8ecf0!important}
.admin-property-card:hover{background:#fbfcfd!important}.admin-property-select{display:flex;align-items:center;justify-content:center;min-width:0}.admin-row-checkbox{width:18px!important;height:18px!important;margin:0!important;accent-color:var(--brass-600,#a96f18)!important}
.admin-property-thumb{width:88px!important;height:68px!important;border-radius:12px!important;background:#eef2f5!important;border:1px solid #e0e6eb}
.admin-property-meta{min-width:0!important}.admin-property-meta h3{color:#122333!important;font-weight:800!important}.admin-property-meta p{color:#66717d!important}
.admin-quality-badge{border:1px solid #d5dde5!important;background:#f6f8fa!important;color:#66717d!important;border-radius:999px!important;padding:3px 8px!important;font-size:.68rem!important;font-weight:800!important}
.admin-quality-badge.is-complete{border-color:#b7e1c5!important;background:#f0faf3!important;color:#26724c!important}
.admin-property-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:6px!important;flex-wrap:wrap!important}
.admin-icon-btn{width:36px!important;height:36px!important;border:1px solid #d7dfe6!important;border-radius:10px!important;background:#fff!important;color:#475467!important}
.admin-icon-btn:hover{background:#122333!important;color:#fff!important;border-color:#122333!important}.admin-icon-btn.danger:hover{background:#9f3e34!important;border-color:#9f3e34!important}
.admin-search{min-height:44px!important;background:#fff!important;border:1px solid #cfd8e0!important;border-radius:12px!important}.admin-search:focus-within{border-color:var(--brass-600,#a96f18)!important}.admin-search input{color:#132333!important}
.admin-filter-row{grid-template-columns:repeat(4,minmax(150px,1fr))!important;gap:9px!important}.admin-filter-row select{min-height:43px!important;background:#fff!important;color:#132333!important;border:1px solid #cfd8e0!important;border-radius:11px!important}.admin-results-meta{color:#66717d!important}
.admin-properties-load-more{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:5px!important;padding:18px!important;border-top:1px solid #e7ebef}.admin-properties-load-more small{color:#66717d!important}
.admin-form-wrap{padding-bottom:92px!important}.admin-form-sections{gap:17px!important}.admin-section{padding:20px!important;background:linear-gradient(180deg,#fff,#fbfcfd)!important}.admin-section legend{color:#132333!important}
.admin-section .field>span,.admin-field label{color:#344054!important;font-weight:800!important}.admin-section .field input,.admin-section .field select,.admin-section .field textarea,.admin-main input,.admin-main select,.admin-main textarea{min-height:46px;background:#fff!important;color:#132333!important;border:1px solid #cbd5df!important}.admin-section .field textarea{line-height:1.9}
.admin-checks{gap:9px 10px!important}.admin-checks label{background:#f8fafc!important;color:#344054!important;border-color:#dce3e9!important;border-radius:11px!important}.admin-checks label:hover{border-color:#c3ccd5!important;background:#f4f7f9!important}.admin-checks input{accent-color:var(--brass-600,#a96f18)!important}
.admin-field-help{display:block;margin-top:5px;color:#66717d!important;font-size:.72rem!important;line-height:1.8}
.admin-sticky-bar{inset-inline-start:var(--admin-rail)!important;padding:10px 22px!important;background:rgb(255 255 255 / 95%)!important;border-top:1px solid #d9e1e8!important;box-shadow:0 -10px 26px rgb(16 24 40 / 7%)!important}.admin-sticky-bar-info{color:#66717d!important}.admin-sticky-bar-info strong{color:#122333!important}
.btn-gold{background:linear-gradient(135deg,#8a5e14,#c08a2a)!important;color:#fff!important;border-color:#8a5e14!important;box-shadow:0 9px 20px rgb(138 94 20 / 20%)!important}.btn-gold:hover{filter:saturate(1.08) brightness(1.03)!important}
.btn-ghost{background:#fff!important;color:#253545!important;border-color:#cbd5df!important}.btn-ghost:hover{color:#122333!important;background:#f7f9fb!important;border-color:#aeb9c4!important}
.admin-media-drop{border-color:#d5bf9e!important;background:linear-gradient(145deg,#fffaf2,#fbfcfd)!important;color:#66717d!important}.admin-media-drop strong{color:#344054!important}.admin-media-drop.is-over{border-color:var(--brass-600,#a96f18)!important;background:#fff7e8!important}
.admin-media-item{background:#eef2f5!important}.admin-media-badge{background:rgb(8 19 32 / 75%)!important;color:#fff!important}.admin-media-remove,.admin-media-primary,.admin-media-move{background:#122333!important;color:#fff!important}
.admin-consultant-card{background:#fff!important;color:#122333!important;border-color:#d9e1e8!important}.admin-consultant-card:hover,.admin-consultant-card.is-active{background:#fffaf2!important;color:#122333!important;border-color:rgb(192 138 42 / 45%)!important}.admin-consultant-meta strong{color:#122333!important}.admin-consultant-meta small,.admin-consultant-meta span{color:#66717d!important}
.admin-consultant-icon{background:#f7efe2!important;color:var(--brass-700,#8a5e14)!important}.admin-consultant-check{background:#8a5e14!important;color:#fff!important}
.admin-music-manager,.admin-lead-manager,.divar-wrap{color:#122333!important}.admin-music-head h2,.admin-lead-manager h2,.divar-wrap h2{color:#122333!important}.admin-music-head p,.admin-music-manager p,.admin-lead-manager p,.divar-wrap p{color:#66717d!important}
.admin-music-row,.admin-lead-card{border-color:#e7ebef!important}.admin-music-eq i{background:#c08a2a!important}.admin-lead-status{border:1px solid #d7dfe6!important}.admin-lead-phone{color:#8a5e14!important}
.divar-hero{background:linear-gradient(135deg,#fffaf2,#fff)!important;border-color:#ead8bd!important}.divar-tab{background:#fff!important;color:#344054!important;border-color:#d5dde5!important}.divar-tab:hover{border-color:#bca276!important}.divar-tab.is-active{background:#122333!important;color:#fff!important;border-color:#122333!important}.divar-search-box{background:#fff!important;border-color:#cfd8e0!important;color:#66717d!important}
.admin-partner-card,.admin-partner-stamp-panel,.admin-partner-qr{background:#fbfcfd!important;border-color:#dde4ea!important}.admin-partner-card-head h3,.admin-partner-stamp-head strong,.admin-partner-metrics strong,.admin-partner-contract-main strong,.admin-partner-qr h3,.admin-partner-audit-row strong{color:#122333!important}.admin-partner-card-head p,.admin-partner-stamp-panel small,.admin-partner-metrics span,.admin-partner-qr p,.admin-partner-audit-row span,.admin-partner-credentials p{color:#66717d!important}.admin-partner-code,.admin-partner-contract-code{background:#122333!important;color:#fff!important}.admin-partner-status{background:#f2f4f7!important;color:#344054!important}.admin-partner-stamp.is-filled{background:#c08a2a!important;border-color:#c08a2a!important;color:#fff!important}.admin-partner-metrics>div{background:#f3f6f8!important}.admin-partner-credential-grid button{background:#fff!important;border-color:#d5dde5!important}
.admin-login{background:radial-gradient(circle at 50% 0%,rgb(192 138 42 / 14%),transparent 28rem),linear-gradient(145deg,var(--navy-950,#081320),var(--navy-900,#0b1a2b))!important}.admin-login-card{background:#fff!important;border-color:#dfe5eb!important}.admin-login-card .kicker{color:#8a5e14!important}.admin-login-card h1{color:#122333!important}.admin-login-card p{color:#66717d!important}.admin-key-row input{background:#fff!important;color:#122333!important;border-color:#cbd5df!important}
.admin-mobile-nav{left:9px!important;right:9px!important;bottom:max(9px,env(safe-area-inset-bottom))!important;background:rgb(255 255 255 / 97%)!important;border:1px solid #d4dce4!important;box-shadow:0 16px 42px rgb(16 24 40 / 16%)!important}.admin-mobile-nav button,.admin-mobile-site{color:#66717d!important}.admin-mobile-nav button.is-active{color:#122333!important;background:#fff8ed!important;border-color:#ead8bd!important}.admin-mobile-nav button.is-active::after{background:#c08a2a!important}.admin-mobile-site{background:#f4f7f9!important;color:#344054!important}
.admin-main *{box-sizing:border-box}.admin-main a{overflow-wrap:anywhere}.admin-main button,.admin-main select,.admin-main input,.admin-main textarea{max-width:100%}
@media (max-width:1100px){.admin-content{padding:22px 20px 104px!important}.admin-dashboard-grid{grid-template-columns:1fr!important}.admin-property-card{grid-template-columns:28px 76px minmax(0,1fr)!important}.admin-property-actions{grid-column:2/-1!important;justify-content:flex-start!important}.admin-property-thumb{width:76px!important;height:60px!important}.admin-filter-row{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media (max-width:640px){.admin-sidebar{display:none!important}.admin-content{padding:12px 11px 102px!important}.admin-topbar{padding:11px 13px!important;align-items:flex-start!important}.admin-topbar h1{font-size:1rem!important}.admin-topbar p{font-size:.72rem!important;line-height:1.7!important}.admin-topbar-actions{width:100%!important}.admin-topbar-actions>*{flex:1 1 0!important;min-width:0}.admin-stats-grid,.admin-dashboard-stats{grid-template-columns:1fr 1fr!important;gap:9px!important}.admin-stat-card{min-height:92px!important;padding:13px 11px!important}.admin-stat-card strong{font-size:1.2rem!important}.admin-property-card{grid-template-columns:24px 58px minmax(0,1fr)!important;padding:11px!important;gap:9px!important}.admin-property-thumb{width:58px!important;height:50px!important}.admin-property-meta h3{font-size:.83rem!important}.admin-property-meta p{font-size:.71rem!important}.admin-property-actions{grid-column:1/-1!important;justify-content:flex-start!important}.admin-property-actions .admin-icon-btn{width:34px!important;height:34px!important}.admin-filter-row{grid-template-columns:1fr!important}.admin-list-toolbar{width:100%!important}.admin-search{min-width:0!important;width:100%!important}.admin-panel-head{padding:12px 13px!important}.admin-section{padding:15px!important;border-radius:16px!important}.admin-form-grid{grid-template-columns:1fr!important}.admin-span-2{grid-column:auto!important}.admin-sticky-bar{padding:9px 11px max(9px,env(safe-area-inset-bottom))!important}.admin-sticky-bar-info{display:none}.admin-sticky-actions{width:100%!important;display:grid!important;grid-template-columns:1fr 1.25fr!important}.admin-mobile-nav{min-height:61px!important}.admin-mobile-nav button,.admin-mobile-site{flex-basis:64px!important;min-width:64px!important;font-size:.61rem!important}}
@media (max-width:390px){.admin-stats-grid,.admin-dashboard-stats{grid-template-columns:1fr!important}.admin-mobile-nav{overflow-x:auto!important}}
@media (prefers-reduced-motion:reduce){.admin-main *,.admin-main *::before,.admin-main *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.001ms!important}}

.admin-dashboard-quick-actions{display:flex;flex-direction:column;gap:12px;margin-bottom:16px;padding:16px;border:1px solid #dfe5eb;border-radius:18px;background:linear-gradient(145deg,#fff,#fbfcfd);box-shadow:0 8px 24px rgb(16 24 40 / 4%)}
.admin-dashboard-quick-intro{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.admin-dashboard-quick-intro h2{margin:3px 0 0;color:#122333;font-size:.95rem;font-weight:820}
.admin-dashboard-quick-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px}
.admin-dashboard-quick-card{min-width:0;display:grid;grid-template-columns:36px minmax(0,1fr) 15px;gap:9px;align-items:center;padding:11px;border:1px solid #d9e1e8;border-radius:13px;background:#fff;color:#122333;text-align:right;font:inherit;cursor:pointer;transition:transform .16s ease,border-color .16s ease,background .16s ease,box-shadow .16s ease}
.admin-dashboard-quick-card:hover{transform:translateY(-1px);border-color:#c2ccd5;background:#fffdf9;box-shadow:0 7px 18px rgb(16 24 40 / 6%)}
.admin-dashboard-quick-card.is-primary{border-color:#e5cfad;background:#fffaf2}
.admin-dashboard-quick-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:10px;background:#f7efe2;color:#8a5e14;border:1px solid #ead8bd}
.admin-dashboard-quick-card strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.76rem;font-weight:820}
.admin-dashboard-quick-card small{display:block;margin-top:2px;color:#66717d;font-size:.64rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.admin-dashboard-quick-card>svg{color:#8a959f}
.admin-dashboard-source-list{display:flex;flex-direction:column;padding:7px 19px 14px}
.admin-dashboard-source-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px dashed #e1e7ed}
.admin-dashboard-source-row:last-child{border-bottom:0}
.admin-dashboard-source-row>div{min-width:0}
.admin-dashboard-source-row strong{display:block;color:#122333;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.admin-dashboard-source-row small{display:block;margin-top:2px;color:#66717d;font-size:.65rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.admin-dashboard-source-row>span{flex:0 0 auto;color:#8a5e14;font-size:.7rem;font-weight:850}
.admin-system-status{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #bfe5cc;border-radius:999px;background:#effaf2;color:#18794e;font-size:.64rem;font-weight:850}
.admin-system-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:14px 19px 18px}
.admin-system-grid>div{padding:11px;border:1px solid #e3e8ee;border-radius:12px;background:#f8fafc}
.admin-system-grid span{display:flex;align-items:center;gap:5px;color:#66717d;font-size:.66rem;font-weight:750}
.admin-system-grid strong{display:block;margin-top:6px;color:#122333;font-size:1.05rem}
.admin-system-grid small{display:block;margin-top:2px;color:#8a959f;font-size:.62rem}
@media (max-width:820px){.admin-dashboard-quick-grid{grid-template-columns:1fr 1fr}}
@media (max-width:640px){.admin-dashboard-quick-actions{padding:13px;border-radius:16px}.admin-dashboard-quick-grid{grid-template-columns:1fr}.admin-dashboard-quick-card{grid-template-columns:36px minmax(0,1fr) 14px}.admin-system-grid{grid-template-columns:1fr 1fr;padding-left:13px;padding-right:13px}.admin-dashboard-source-list{padding-left:13px;padding-right:13px}}
@media (max-width:390px){.admin-system-grid{grid-template-columns:1fr}}

/* Lease deadline in CRM */
.admin-lead-deadline{
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:7px 9px;
  margin-top:10px;
  padding:9px 11px;
  border:1px solid #e4e9ee;
  border-radius:12px;
  background:#f8fafc;
  color:#4f5d68;
  font-size:.72rem;
  line-height:1.8;
}
.admin-lead-deadline svg{flex:0 0 auto;color:#8a5e14}
.admin-lead-deadline strong{color:#122333;font-weight:850}
.admin-lead-deadline b{
  margin-inline-start:auto;
  padding:3px 8px;
  border-radius:999px;
  background:#eef2f5;
  color:#51606c;
  font-size:.64rem;
  font-weight:850;
}
.admin-lead-deadline.is-soon{
  border-color:#ecd9b8;
  background:#fffaf2;
}
.admin-lead-deadline.is-soon svg,
.admin-lead-deadline.is-soon b{color:#8a5e14}
.admin-lead-deadline.is-soon b{background:#f8ead3}
.admin-lead-deadline.is-today{
  border-color:#e5c589;
  background:#fff7e8;
}
.admin-lead-deadline.is-today b{
  background:#c08a2a;
  color:#fff;
}
.admin-lead-deadline.is-expired{
  border-color:#e5bcbc;
  background:#fff7f7;
}
.admin-lead-deadline.is-expired svg{color:#a33a3a}
.admin-lead-deadline.is-expired b{
  background:#f7dddd;
  color:#9b3535;
}
@media (max-width:640px){
  .admin-lead-deadline{align-items:flex-start}
  .admin-lead-deadline b{margin-inline-start:0}
}

/* Private property-owner workspace */
.admin-owner-section{border-color:#e5cfad!important;background:linear-gradient(145deg,#fffdf9,#fff)!important}
.admin-owner-section>legend{color:#8a5e14!important}
.admin-private-notice{margin:0 0 14px;padding:10px 12px;border:1px solid #ead8bd;border-radius:11px;background:#fff8eb;color:#725f42;font-size:.69rem;line-height:1.9}
.admin-owner-section input,.admin-owner-section textarea{background:#fff!important}
.admin-owner-section textarea{min-height:104px}

/* ==========================================================================
   Hirmand Admin 3.1 — workflow polish
   ========================================================================== */
/* The quick nav is a sibling of .admin-main (it is position:fixed to the
   viewport), so a ".admin-main" prefix could never match it and the bottom
   bar stayed on screen under the save bar while editing a property. */
.admin-mobile-nav.is-form-active{display:none!important}
.admin-sticky-bar{z-index:2100!important}
.admin-main .admin-sticky-bar .btn-gold:disabled,
.admin-main .admin-sticky-bar .btn-ghost:disabled{opacity:.55!important;cursor:not-allowed!important}
.admin-main .admin-nav-btn:focus-visible,
.admin-main .admin-icon-btn:focus-visible,
.admin-main .admin-mobile-nav button:focus-visible,
.admin-main .admin-mobile-site:focus-visible,
.admin-main .btn-gold:focus-visible,
.admin-main .btn-ghost:focus-visible{
  outline:2px solid rgb(192 138 42 / 40%)!important;
  outline-offset:2px!important;
}
.admin-main .admin-property-card{content-visibility:auto;contain-intrinsic-size:120px}
.admin-main .admin-property-actions .admin-icon-btn{flex:0 0 auto}
.admin-main .admin-empty{min-height:180px;display:grid;gap:8px;align-content:center;justify-items:center;text-align:center}
@media(max-width:640px){
  .admin-main .admin-sticky-bar{inset-inline:0!important}
  .admin-main .admin-form-wrap{padding-bottom:78px!important}
  .admin-main .admin-property-card{content-visibility:visible}
}

/* Semantic admin dashboard accents — resist the broad legacy text-color rule. */
.admin-main .admin-dashboard .admin-dashboard-stat-icon,
.admin-main .admin-dashboard .admin-dashboard-quick-icon{
  color:var(--brass-700,#8a5e14)!important;
}
.admin-main .admin-dashboard .admin-dashboard-stat>svg,
.admin-main .admin-dashboard .admin-dashboard-quick-card>svg{
  color:#7a8792!important;
}
.admin-main .admin-dashboard .admin-funnel-track,
.admin-main .admin-dashboard .admin-breakdown-track,
.admin-main .admin-dashboard .admin-lead-chart-bar-wrap{
  overflow:hidden!important;
}


/* Private owner details in the admin property list */
.admin-property-owner{
  margin-top:8px;
  border:1px solid #eadfcf;
  border-radius:11px;
  background:#fffdf8;
  overflow:hidden;
}
.admin-property-owner summary{
  display:flex;
  align-items:center;
  gap:6px;
  padding:7px 9px;
  list-style:none;
  cursor:pointer;
  color:#7a5414;
  font-size:.7rem;
  font-weight:800;
}
.admin-property-owner summary::-webkit-details-marker{display:none}
.admin-property-owner summary::after{
  content:"⌄";
  margin-inline-start:auto;
  color:#a07a3a;
  font-size:.78rem;
}
.admin-property-owner[open] summary{border-bottom:1px solid #eee2d0;background:#fff9ef}
.admin-property-owner-details{
  display:flex;
  flex-direction:column;
  gap:4px;
  padding:8px 10px 9px;
  color:#56636f;
  font-size:.68rem;
  line-height:1.8;
  overflow-wrap:anywhere;
}
.admin-property-owner-details strong{color:#263746}
@media(max-width:640px){
  .admin-property-owner{margin-top:6px}
  .admin-property-owner summary{font-size:.66rem;padding:6px 8px}
  .admin-property-owner-details{font-size:.64rem;padding:7px 8px 8px}
}

/* =========================================================================
   Hirmand Admin 4.0 - token scope, feedback and layout primitives
   =========================================================================
   Token scope.
   The panel is a LIGHT workspace (paper page, white cards) with a dark navy
   sidebar and topbar - the direction the "Admin 3.0 canonical light workspace"
   pass established. What was still broken are the leftovers from the earlier
   dark-shell era: helper text and accents tuned for #111315 and left at
   near-white / light brass, which is invisible on a white card. Pinning the
   tokens once, scoped to .admin-app, corrects every child at the source
   instead of patching component by component.
   ========================================================================= */
.admin-app,.admin-login{
  --card:#ffffff;
  --card-2:#fbf8f2;
  --surface:#ffffff;
  --surface-2:#fbf8f2;
  --fg:#152430;
  --muted:#4b5862;
  --subtle:#5b6870;
  --line:#e2dacb;
  --brass-100:#f7efdd;
  --brass-300:#d9bd7c;
  --brass-600:#8a5e14;
  --brass-700:#7a5414;
  --navy-900:#0b1a2b;
  /* Width of the desktop rail. The sidebar and the fixed save bar both read
     it, so they can no longer drift apart at a breakpoint. */
  --admin-rail:278px;
  color-scheme:light;
}
.admin-app .admin-money-hint,
.admin-app .admin-price-calc-note,
.admin-app .admin-field-help,
.admin-app .admin-private-notice{color:var(--subtle)}
.admin-app .admin-section input[type=checkbox],
.admin-app .admin-checks input[type=checkbox]{accent-color:var(--brass-600)}
.admin-app ::placeholder{color:#8d99a2}
.admin-app select option{background:#fff;color:var(--fg)}

/* Accents inherited from the dark shell must be text-safe on white cards. */
.admin-main .admin-panel-head .kicker,
.admin-main .admin-dashboard .kicker,
.admin-main .kicker{color:var(--brass-700)}
.admin-main .admin-music-index{color:#5f6b74}
.admin-main .admin-lead-card small,
.admin-main .admin-lead-created-at,
.admin-main .admin-lead-budget span,
.admin-main .admin-results-meta{color:var(--subtle)}

/* --- Private owner callout ------------------------------------------------ */
.admin-property-owner{
  margin-top:8px;
  border:1px solid #eadfcf;
  border-radius:11px;
  background:#fffdf8;
}
.admin-property-owner summary{color:#7a5414}
.admin-property-owner summary::after{color:#a07a3a}
.admin-property-owner[open] summary{border-bottom:1px solid #eee2d0;background:#fff9ef}
.admin-property-owner-details{color:#56636f}
.admin-property-owner-details strong{color:#263746}

/* --- Skeletons ---------------------------------------------------------- */
.admin-skeleton{
  position:relative;
  overflow:hidden;
  border-radius:10px;
  background:rgb(11 26 43 / .08);
}
.admin-skeleton::after{
  content:"";
  position:absolute;
  inset:0;
  transform:translateX(-100%);
  background:linear-gradient(90deg,transparent,rgb(11 26 43 / .09),transparent);
  animation:admin-shimmer 1.3s infinite;
}
@keyframes admin-shimmer{100%{transform:translateX(100%)}}
.admin-skeleton-row{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--line)}
.admin-skeleton-stack{display:flex;flex-direction:column;gap:10px;padding:20px}
.admin-skeleton-line{height:12px;border-radius:999px}

/* --- Modal dialog ------------------------------------------------------- */
.admin-dialog-backdrop{
  position:fixed;
  inset:0;
  z-index:3200;
  display:grid;
  place-items:center;
  padding:20px;
  background:rgb(11 26 43 / .55);
  backdrop-filter:blur(6px);
  -webkit-backdrop-filter:blur(6px);
  animation:admin-fade .14s ease-out;
}
@keyframes admin-fade{from{opacity:0}to{opacity:1}}
.admin-dialog{
  width:min(100%,520px);
  max-height:min(86vh,720px);
  overflow:auto;
  border:1px solid var(--line);
  border-radius:20px;
  background:linear-gradient(180deg,#ffffff,#fbf8f2);
  box-shadow:0 32px 80px rgb(11 26 43 / .3);
  padding:24px;
  animation:admin-dialog-in .16s ease-out;
}
@keyframes admin-dialog-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
.admin-dialog-icon{
  width:44px;height:44px;border-radius:14px;display:grid;place-items:center;
  margin-bottom:14px;background:var(--brass-100);color:var(--brass-700);
  border:1px solid var(--brass-300);
}
.admin-dialog[data-tone=danger] .admin-dialog-icon{background:#fdeceb;color:#a32c22;border-color:#f2c3bf}
.admin-dialog h3{margin:0 0 8px;font-size:1.08rem;font-weight:700;color:var(--fg)}
.admin-dialog p{margin:0;color:var(--muted);font-size:.9rem;line-height:2}
.admin-dialog-list{
  margin:14px 0 0;padding:12px 14px;border-radius:12px;
  background:rgb(11 26 43 / .03);border:1px solid var(--line);
  font-size:.82rem;color:var(--muted);line-height:2;max-height:190px;overflow:auto;
}
.admin-dialog-actions{display:flex;gap:10px;justify-content:flex-start;margin-top:22px;flex-wrap:wrap}
.admin-dialog-actions .btn-gold,.admin-dialog-actions .btn-ghost,.admin-dialog-actions .btn-danger-solid{flex:1 1 140px}
.btn-danger-solid{
  display:inline-flex;align-items:center;justify-content:center;gap:7px;
  min-height:44px;padding:9px 16px;border-radius:999px;border:1px solid transparent;
  font:inherit;font-size:.88rem;font-weight:700;cursor:pointer;
  color:#fff;background:#a32c22;transition:filter .12s;
}
.btn-danger-solid:hover{filter:brightness(1.08)}
.btn-danger-solid:disabled{opacity:.55;cursor:not-allowed}

/* --- Filter chips + toolbar --------------------------------------------- */
.admin-filter-chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.admin-filter-chip{
  display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:5px 12px;
  border-radius:999px;border:1px solid var(--brass-300);background:var(--brass-100);
  color:var(--brass-700);font:inherit;font-size:.78rem;font-weight:600;cursor:pointer;
}
.admin-filter-chip:hover{background:#f2e6cd}
.admin-filter-chip button{
  border:0;background:transparent;color:inherit;cursor:pointer;padding:0;display:grid;place-items:center;opacity:.75;
}
.admin-filter-chip button:hover{opacity:1}
.admin-filter-row select,.admin-filter-row input{
  min-height:42px;padding:8px 12px;border-radius:11px;
  border:1px solid var(--line);background:#fff;
  color:var(--fg);font:inherit;font-size:.85rem;max-width:100%;
}
.admin-results-meta{display:flex;align-items:center;gap:6px;color:var(--subtle);font-size:.8rem}
.admin-bulk-bar{
  display:flex;flex-wrap:wrap;gap:8px;align-items:center;
  padding:12px 20px;border-top:1px solid var(--brass-300);
  background:var(--brass-100);color:var(--fg);
}

/* --- Pagination --------------------------------------------------------- */
.admin-pagination{
  display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  padding:16px 20px;border-top:1px solid var(--line);
}
.admin-pagination-pages{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.admin-page-btn{
  min-width:40px;height:40px;padding:0 12px;border-radius:11px;
  border:1px solid var(--line);background:#fff;
  color:var(--fg);font:inherit;font-size:.84rem;font-weight:600;cursor:pointer;
  display:inline-grid;place-items:center;transition:background .15s,border-color .15s;
}
.admin-page-btn:hover:not(:disabled){border-color:var(--brass-600);background:var(--brass-100)}
.admin-page-btn.is-active{background:var(--navy-900);color:#fff;border-color:var(--navy-900)}
.admin-page-btn:disabled{opacity:.45;cursor:not-allowed}
.admin-pagination-meta{color:var(--subtle);font-size:.8rem}
.admin-page-ellipsis{color:var(--subtle);padding:0 2px}

/* --- Row busy state ------------------------------------------------------ */
.admin-property-card.is-busy{opacity:.6;pointer-events:none}
.admin-icon-btn.is-busy svg{animation:admin-spin .8s linear infinite}

/* --- Topbar + drawer trigger -------------------------------------------- */
/* The drawer is a modal, so its own geometry is not width-conditional: it is
   mounted by React only while open. Keeping the rules outside a media query
   is what stops a 901-960px window (wider than the drawer breakpoint, hidden
   sidebar) from rendering it as an unstyled block inside the shell. */
.admin-drawer-trigger{display:none}
.admin-drawer-overlay{
  position:fixed;inset:0;z-index:3100;display:block;
  background:rgb(11 26 43 / .5);backdrop-filter:blur(4px);
  animation:admin-fade .14s ease-out;
}
.admin-drawer{
  position:fixed;inset-block:0;inset-inline-end:0;z-index:3101;
  width:min(86vw,320px);display:flex;flex-direction:column;
  /* Same navy rail as the desktop sidebar: the drawer IS the sidebar, so it
     inherits its dark-surface tokens and the white nav labels stay legible. */
  background:linear-gradient(180deg,var(--navy-950,#081320),var(--navy-900,#0b1a2b));
  color:#fff;
  border-inline-start:1px solid rgb(255 255 255 / .1);
  box-shadow:-24px 0 60px rgb(11 26 43 / .38);
  animation:admin-drawer-in .2s ease-out;
}
@keyframes admin-drawer-in{from{transform:translateX(-100%)}to{transform:none}}
.admin-drawer .admin-sidebar-brand{padding:18px 16px}
.admin-drawer .admin-sidebar-nav{overflow-y:auto;flex:1}
.admin-drawer .admin-nav-btn{color:rgb(255 255 255 / .72)}
.admin-drawer .admin-nav-btn.is-active{color:#fff}
.admin-section-nav{
  position:sticky;top:0;z-index:15;
  display:flex;gap:8px;flex-wrap:wrap;align-items:center;
  padding:10px 0;margin-bottom:14px;
  background:linear-gradient(180deg,var(--paper,#fbf8f2) 72%,rgb(251 248 242 / 0));
}
.admin-section-nav a{
  display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border-radius:999px;
  border:1px solid var(--line);background:#fff;
  color:var(--muted);text-decoration:none;font-size:.78rem;font-weight:600;
  /* Chips are a scrolling row on a phone: without this they shrink to one
     Persian word per line instead of staying tappable. */
  flex:0 0 auto;white-space:nowrap;
}
.admin-section-nav a:hover{border-color:var(--brass-600);color:var(--fg);background:var(--brass-100)}

@media(max-width:1100px){
  .admin-content{padding:18px}
  .admin-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:900px){
  /* Single source of truth for the rail: the sticky save bar is a child of
     .admin-main, so its offset has to follow the sidebar width instead of
     repeating the same pixel value in two places. */
  .admin-app{--admin-rail:0px}
  .admin-app{flex-direction:column}
  .admin-sidebar{display:none}
  .admin-topbar{padding:12px 16px}
  .admin-topbar h1{font-size:1rem}
  .admin-drawer-trigger{
    display:inline-grid;place-items:center;flex:0 0 auto;
    width:44px;height:44px;border-radius:12px;
    border:1px solid var(--line);background:#fff;color:var(--navy-900);cursor:pointer;
  }
  .admin-mobile-nav{display:flex}
  .admin-sticky-bar{inset-inline:0;padding:10px 16px}
}@media(max-width:640px){
  .admin-content{padding:14px}
  .admin-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .admin-stat-card{padding:14px 12px}
  .admin-stat-card strong{font-size:1.3rem}
  .admin-panel-head{padding:14px}
  /* Row geometry at this width is owned by the 3.0 block above (24px/58px
     track + 58x50 thumb). The old 64px copy here could never win and only
     made the cascade harder to reason about. */
  .admin-pagination{padding:14px}
  .admin-pagination-pages{width:100%;justify-content:center}
  .admin-dialog{padding:20px;border-radius:18px}
  .admin-dialog-actions{flex-direction:column-reverse}
  .admin-dialog-actions .btn-gold,.admin-dialog-actions .btn-ghost,.admin-dialog-actions .btn-danger-solid{width:100%}
  .admin-section-nav{overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none}
  .admin-section-nav::-webkit-scrollbar{display:none}
}
@media(prefers-reduced-motion:reduce){
  .admin-skeleton::after{animation:none}
  .admin-dialog,.admin-dialog-backdrop,.admin-drawer{animation:none}
}

/* --- Media field: progress, retry queue and broken-file handling -------- */
.admin-upload-progress{
  width:min(340px,100%);height:8px;border-radius:999px;
  background:rgb(11 26 43 / .12);overflow:hidden;margin-top:10px;
}
.admin-upload-progress span{display:block;height:100%;background:var(--brass-600);border-radius:999px;transition:width .2s ease}
.admin-media-failures{
  margin-top:14px;border:1px solid #f2c3bf;border-radius:14px;
  background:#fdf2f1;padding:12px 14px;
}
.admin-media-failures-head{display:flex;align-items:center;gap:8px;color:#a32c22;font-size:.86rem;margin-bottom:8px}
.admin-media-failures-head strong{flex:1}
.admin-media-failure{
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:8px 0;border-top:1px solid #f4d9d6;font-size:.8rem;color:var(--muted);
}
.admin-media-failure-name{flex:1;min-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fg);font-weight:600}
.admin-media-failure-error{flex:2;min-width:160px;color:#a32c22}
.admin-media-item img.is-broken{filter:grayscale(1) opacity(.45)}
.admin-media-item:has(img[data-broken])::after{
  content:"فایل پیدا نشد";
  position:absolute;inset-inline-start:6px;top:6px;
  font-size:.62rem;font-weight:700;color:#a32c22;
  background:#fdf2f1;border:1px solid #f2c3bf;
  border-radius:999px;padding:2px 7px;pointer-events:none;
}
.admin-media-pick{position:absolute;inset-inline-end:6px;bottom:6px;z-index:2}
.admin-media-pick input{width:20px;height:20px;accent-color:var(--brass-600);cursor:pointer}

/* --- Leads: inline note editor + library health strip ------------------ */
.admin-lead-note-editor{
  margin-top:10px;padding:12px;border-radius:12px;
  border:1px solid var(--brass-300);background:var(--brass-100);
}
.admin-lead-note-editor textarea{
  width:100%;min-height:92px;padding:10px 12px;border-radius:12px;
  border:1px solid var(--line);background:#fff;
  color:var(--fg);font:inherit;resize:vertical;
}
.admin-lead-note-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.admin-dashboard-health{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:14px;margin-bottom:22px;
}
@media(max-width:640px){
  .admin-dashboard-health{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .admin-lead-note-actions .btn-gold,.admin-lead-note-actions .btn-ghost{flex:1 1 auto}
}

/* --- Mobile touch targets --------------------------------------------- */
/* The bulk-select checkbox and the music drag handle are visually compact by
   design. Rather than inflate the artwork, the checkbox sits inside a <label>
   and the handle keeps its icon while the target grows to 44px. */
.admin-property-select{
  min-width:44px;min-height:44px;cursor:pointer;
}
@media(max-width:640px){
  /* The phone link is the primary action on a lead card, so it gets a real
     tap height instead of the 28px the inline-flex text link gave it. */
  .admin-lead-phone{min-height:40px;padding:0 4px}
}
@media(max-width:640px){
  /* A lead card is a two-column grid whose auto-sized column is sized by its
     buttons. On a phone that column ate the content column down to ~26px and
     wrapped every matched-property title one word per line, so stack instead. */
  .admin-lead-card{grid-template-columns:minmax(0,1fr)}
  .admin-lead-card>.admin-property-actions,
  .admin-lead-card>.admin-lead-actions{grid-column:1/-1;justify-content:flex-start}
  .admin-lead-matches a{min-height:32px;display:inline-flex;align-items:center}
}
/* --- Dedicated floor-plan control ------------------------------------- */
.admin-floor-plan-separator{
  grid-column:1/-1;
  display:flex;
  align-items:center;
  gap:10px;
  margin:16px 0 2px;
  color:var(--muted);
}
.admin-floor-plan-separator span{
  height:1px;
  flex:1;
  background:var(--line);
}
.admin-floor-plan-separator strong{
  color:var(--navy-900);
  font-size:.76rem;
  font-weight:850;
  white-space:nowrap;
}

.admin-lead-priority-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border:1px solid var(--line);border-radius:999px;background:var(--card-2);font-size:.64rem;font-weight:900;color:var(--muted)}
.admin-lead-priority-badge.is-hot{background:#f7e5df;border-color:#e5c3ba;color:#9a3f2e}
.admin-lead-priority-badge.is-warm{background:#fff1d6;border-color:#ead5ab;color:#9a6b1f}
.admin-lead-priority-badge.is-cold{background:var(--card-2);color:var(--subtle)}


.admin-role-chip{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 11px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--navy-900);font-size:.68rem;font-weight:900;white-space:nowrap}
.admin-role-manager{margin-top:18px}
.admin-role-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0;padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--card-2)}
.admin-role-form-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px}
.admin-role-list{display:grid;gap:9px}
.admin-role-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:15px;background:var(--card)}
.admin-role-row.is-disabled{opacity:.66}
.admin-role-avatar{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--card-2);color:var(--brass-700)}
.admin-role-main{min-width:0}
.admin-role-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.admin-role-current,.admin-notification-count{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:var(--navy-900);color:#fff;padding:2px 7px;font-size:.6rem;font-weight:900}
.admin-role-main>small{display:block;margin-top:3px;color:var(--muted)}
.admin-role-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:6px;color:var(--subtle);font-size:.65rem}
.admin-role-meta span{padding:3px 7px;border:1px solid var(--line);border-radius:999px;background:var(--card-2)}
.admin-role-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
.admin-login-switch{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:4px;margin:16px 0;border:1px solid rgba(244,239,230,.12);border-radius:12px;background:rgba(255,255,255,.04)}
.admin-login-switch button{min-height:36px;border:0;border-radius:9px;background:transparent;color:rgba(247,245,239,.68);font:inherit;font-size:.74rem;font-weight:800;cursor:pointer}
.admin-login-switch button.is-active{background:rgba(255,255,255,.1);color:#fff}
.admin-notification-center{margin-top:18px}
.admin-notification-center h2{display:flex;align-items:center;gap:7px}
.admin-notification-count{background:var(--brass-600);color:#111;padding-inline:7px}
.admin-notification-actions{display:flex;gap:7px;flex-wrap:wrap}
.admin-notification-list{display:grid;gap:8px}
.admin-notification-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:10px;padding:11px 12px;border:1px solid var(--line);border-radius:14px;background:var(--card);transition:background .16s,border-color .16s}
.admin-notification-row.is-unread{background:var(--card-2)}
.admin-notification-row.severity-critical{border-inline-start:4px solid #b84b35}
.admin-notification-row.severity-warning{border-inline-start:4px solid #c18a34}
.admin-notification-row.severity-info{border-inline-start:4px solid var(--brass-600)}
.admin-notification-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--card-2);color:var(--brass-700)}
.admin-notification-main{min-width:0}
.admin-notification-title{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.admin-notification-title strong{color:var(--navy-900);font-size:.79rem}
.admin-notification-title small{color:var(--subtle);font-size:.61rem;white-space:nowrap}
.admin-notification-main p{margin:4px 0 0;color:var(--muted);font-size:.7rem;line-height:1.65}
.admin-notification-read{align-self:center;color:var(--subtle);font-size:.63rem;white-space:nowrap}
.admin-backup-summary-line{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;color:var(--muted);font-size:.67rem}
.admin-backup-summary-line span{padding:5px 8px;border:1px solid var(--line);border-radius:999px;background:var(--card-2)}
.admin-backup-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
.admin-backup-history{margin-top:18px}
.admin-backup-history-list{display:grid;gap:8px}
.admin-backup-history-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;padding:11px 12px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.admin-backup-history-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--card-2);color:var(--brass-700)}
.admin-backup-history-main{min-width:0}
.admin-backup-history-main strong{display:block;color:var(--navy-900);font-size:.76rem}
.admin-backup-history-main small{display:block;margin-top:2px;color:var(--subtle);font-size:.62rem}
.admin-backup-history-main p{margin:5px 0 0;color:var(--muted);font-size:.64rem;line-height:1.6}
.admin-backup-retention{margin-top:18px}
.admin-backup-retention-controls{display:flex;align-items:end;gap:10px;flex-wrap:wrap}
.admin-backup-retention-controls .field{min-width:210px;margin:0}
@media (max-width:760px){
  .admin-role-form{grid-template-columns:1fr}
  .admin-role-row{grid-template-columns:auto minmax(0,1fr)}
  .admin-role-actions{grid-column:1/-1;justify-content:flex-start}
  .admin-notification-row{grid-template-columns:auto minmax(0,1fr)}
  .admin-notification-row>.btn-ghost,.admin-notification-read{grid-column:2;justify-self:start}
  .admin-notification-title{display:grid;gap:3px}
  .admin-notification-title small{white-space:normal}
  .admin-role-chip{font-size:.62rem;min-height:31px}
  .admin-backup-actions{justify-content:flex-start}
  .admin-backup-retention-controls{align-items:stretch}
  .admin-backup-retention-controls .field{min-width:100%;width:100%}
  .admin-backup-retention-controls>.btn-ghost{width:100%}
}


.admin-publication-queue,.admin-kpi-history,.admin-data-health{margin-top:18px}
.admin-publication-count{display:inline-flex;align-items:center;padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:var(--card-2);color:var(--navy-900);font-size:.66rem;font-weight:900}
.admin-publication-list{display:grid;gap:9px}
.admin-publication-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:12px;padding:12px;border:1px solid var(--line);border-radius:15px;background:var(--card)}
.admin-publication-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:var(--card-2);color:var(--brass-700)}
.admin-publication-main{min-width:0}
.admin-publication-title{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
.admin-publication-title strong{color:var(--navy-900);font-size:.79rem}
.admin-publication-title small{color:var(--subtle);font-size:.62rem;white-space:nowrap}
.admin-publication-main p{margin:5px 0;color:var(--muted);font-size:.67rem;line-height:1.65}
.admin-publication-tags{display:flex;flex-wrap:wrap;gap:6px}
.admin-publication-tags span{padding:4px 7px;border:1px solid var(--line);border-radius:999px;background:var(--card-2);font-size:.61rem;color:var(--subtle)}
.admin-publication-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}
.admin-kpi-cards{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}
.admin-kpi-card{min-width:0;padding:11px 12px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.admin-kpi-card>span{display:block;color:var(--muted);font-size:.64rem}
.admin-kpi-card>strong{display:block;margin-top:6px;color:var(--navy-900);font-size:1.08rem}
.admin-kpi-card>small{display:flex;align-items:center;gap:4px;margin-top:6px;color:var(--subtle);font-size:.59rem}
.admin-kpi-card>small.is-up{color:#447552}
.admin-kpi-card>small.is-down{color:#a14a3e}
.admin-kpi-trend{display:grid;grid-template-columns:repeat(14,minmax(28px,1fr));gap:5px;align-items:end;margin-top:14px;padding:12px 10px;border:1px solid var(--line);border-radius:14px;background:var(--card-2);overflow-x:auto}
.admin-kpi-day{min-width:34px;text-align:center}
.admin-kpi-day>span,.admin-kpi-day>small{display:block;color:var(--subtle);font-size:.52rem;white-space:nowrap}
.admin-kpi-bars{height:72px;display:flex;align-items:end;justify-content:center;gap:3px;margin:4px auto}
.admin-kpi-bars i{display:block;width:6px;min-height:4px;border-radius:4px 4px 2px 2px;background:var(--brass-600)}
.admin-kpi-bars i+ i{background:var(--navy-500)}
.admin-data-health-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:12px}
.admin-data-health-summary>div{padding:10px 12px;border:1px solid var(--line);border-radius:13px;background:var(--card)}
.admin-data-health-summary span{display:block;color:var(--muted);font-size:.62rem}
.admin-data-health-summary strong{display:block;margin-top:4px;color:var(--navy-900);font-size:1.05rem}
.admin-data-health-summary .is-critical strong{color:#a64337}
.admin-data-health-summary .is-warning strong{color:#99701e}
.admin-data-health-list{display:grid;gap:8px}
.admin-data-health-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:9px;padding:10px 12px;border:1px solid var(--line);border-radius:13px;background:var(--card)}
.admin-data-health-row.severity-critical{border-inline-start:4px solid #b84b35}
.admin-data-health-row.severity-warning{border-inline-start:4px solid #c18a34}
.admin-data-health-row.severity-info{border-inline-start:4px solid var(--brass-600)}
.admin-data-health-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:var(--card-2);color:var(--brass-700)}
.admin-data-health-main{min-width:0}
.admin-data-health-main strong{display:block;color:var(--navy-900);font-size:.73rem}
.admin-data-health-main small{display:block;margin-top:3px;color:var(--muted);font-size:.62rem}
.admin-data-health-main code{display:inline-block;margin-top:4px;color:var(--subtle);font-size:.56rem;direction:ltr}
@media (max-width:900px){
  .admin-kpi-cards{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (max-width:640px){
  .admin-publication-row{grid-template-columns:auto minmax(0,1fr)}
  .admin-publication-actions{grid-column:1/-1;justify-content:flex-start}
  .admin-publication-title{display:grid;gap:3px}
  .admin-publication-title small{white-space:normal}
  .admin-kpi-cards{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admin-kpi-trend{grid-template-columns:repeat(14,34px)}
  .admin-data-health-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admin-data-health-row{grid-template-columns:auto minmax(0,1fr)}
  .admin-data-health-row>.btn-ghost{grid-column:2;justify-self:start}
}


/* Sales & transaction operations */
.admin-deals-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr);gap:16px}
.admin-deal-list{display:grid;gap:8px;padding:0 18px 18px}
.admin-deal-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--card,#fff);cursor:pointer}
.admin-deal-row.is-active{border-color:var(--brass-500,#b88938);background:var(--brass-50,#fbf7ef)}
.admin-deal-row>div{min-width:0}
.admin-deal-row strong{display:block;color:var(--navy-900);font-size:.76rem}
.admin-deal-row span,.admin-deal-row small{display:block;color:var(--muted);font-size:.63rem;line-height:1.7;margin-top:3px}
.admin-deal-row b{display:block;color:var(--navy-900);font-size:.72rem;white-space:nowrap}
.admin-deal-row select{min-height:38px;border:1px solid var(--line);border-radius:10px;background:var(--card,#fff);color:var(--fg);padding:6px 9px;font:inherit;font-size:.68rem}
.admin-doc-list{display:grid;gap:8px;padding:0 18px 18px}
.admin-doc-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:11px;background:var(--card,#fff)}
.admin-doc-row strong{display:block;color:var(--navy-900);font-size:.72rem}
.admin-doc-row small{display:block;color:var(--subtle);font-size:.6rem;margin-top:3px}
.admin-doc-row select{min-height:34px;border:1px solid var(--line);border-radius:9px;background:var(--card,#fff);color:var(--fg);font:inherit;font-size:.64rem;padding:5px 8px}
.admin-doc-badge{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:.6rem;font-weight:800;background:var(--surface-2,#f7f5f0);color:var(--muted)}
.admin-doc-badge.received{background:var(--brass-50,#fbf7ef);color:var(--brass-700)}
.admin-doc-badge.verified{background:rgba(18,35,51,.08);color:var(--navy-900)}
.admin-doc-badge.rejected{background:var(--danger-bg,#fff3f1);color:var(--danger)}
.admin-expiry-center{display:grid;gap:16px;max-width:1380px;margin:0 auto}
.admin-expiry-list{display:grid;gap:8px;padding:0 18px 18px}
.admin-expiry-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card,#fff)}
.admin-expiry-row>div{min-width:0}
.admin-expiry-row strong{display:block;color:var(--navy-900);font-size:.73rem}
.admin-expiry-row small{display:block;color:var(--muted);font-size:.62rem;margin-top:3px}
.admin-expiry-row.danger{border-color:rgb(163 49 39 / 20%);background:var(--danger-bg,#fff3f1)}
.admin-expiry-row.warn{border-color:rgb(184 133 48 / 22%);background:var(--brass-50,#fbf7ef)}
.admin-expiry-row.info{background:var(--surface-2,#f7f5f0)}
.admin-expiry-actions{display:flex;gap:8px;flex-wrap:wrap;padding:0 18px}
@media(max-width:900px){
  .admin-deals-grid{grid-template-columns:1fr}
  .admin-deal-row{grid-template-columns:minmax(0,1fr) auto}
  .admin-deal-row select,.admin-deal-row .text-link{grid-column:2}
  .admin-doc-row{grid-template-columns:minmax(0,1fr) auto}
  .admin-doc-row select,.admin-doc-row .admin-doc-badge{grid-column:2}
  .admin-expiry-row{grid-template-columns:minmax(0,1fr) auto}
  .admin-expiry-row .btn-ghost{grid-column:2}
}
@media(max-width:520px){
  .admin-deal-row{grid-template-columns:1fr}
  .admin-deal-row select,.admin-deal-row .text-link{grid-column:1;width:100%}
  .admin-doc-row{grid-template-columns:1fr}
  .admin-doc-row select,.admin-doc-row .admin-doc-badge{grid-column:1}
  .admin-expiry-row{grid-template-columns:1fr}
  .admin-expiry-row .btn-ghost{grid-column:1;width:100%}
}

.admin-commission{display:grid;gap:16px;max-width:1380px;margin:0 auto}
.admin-commission-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.admin-commission-list{display:grid;gap:8px;padding:0 18px 18px}
.admin-commission-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,.7fr) auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card,#fff)}
.admin-commission-row strong,.admin-commission-row b{color:var(--navy-900);font-size:.72rem}
.admin-commission-row small{display:block;color:var(--muted);font-size:.61rem;line-height:1.7;margin-top:3px}
.admin-commission-row select{min-height:36px;border:1px solid var(--line);border-radius:9px;background:var(--card,#fff);color:var(--fg);font:inherit;font-size:.64rem;padding:5px 8px}
.admin-message-templates{margin-bottom:16px}
.admin-message-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 18px}
.admin-message-preview{width:calc(100% - 36px);margin:12px 18px 0;min-height:150px;resize:vertical;border:1px solid var(--line);border-radius:12px;background:var(--surface-2,#f7f5f0);color:var(--fg);padding:12px;font:inherit;line-height:1.9}
.admin-message-actions{display:flex;gap:8px;flex-wrap:wrap;padding:12px 18px 18px}
.admin-finance-insights{margin-top:16px}
.admin-finance-insights-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:14px}
.admin-finance-chart,.admin-finance-category{border:1px solid var(--line);border-radius:14px;background:var(--card,#fff);padding:14px}
.admin-finance-chart h3,.admin-finance-category h3{display:flex;align-items:center;gap:7px;margin:0 0 12px;color:var(--navy-900);font-size:.78rem}
.admin-finance-month{display:grid;grid-template-columns:60px minmax(0,1fr);gap:5px 8px;margin-bottom:9px}
.admin-finance-month>span{grid-row:span 2;color:var(--subtle);font-size:.6rem;padding-top:3px;direction:ltr}
.admin-finance-month>div{display:grid;grid-template-columns:minmax(60px,1fr) auto;gap:7px;align-items:center}
.admin-finance-month>div i{display:block;height:7px;border-radius:99px;background:var(--brass-600);min-width:2px}
.admin-finance-month>div i.expense{background:var(--navy-700)}
.admin-finance-month b{color:var(--navy-900);font-size:.58rem;white-space:nowrap}
.admin-finance-consultant{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)}
.admin-finance-consultant:last-child{border-bottom:0}
.admin-finance-consultant strong{display:block;color:var(--navy-900);font-size:.68rem}
.admin-finance-consultant small{display:block;color:var(--subtle);font-size:.58rem;margin-top:3px}
.admin-finance-consultant b{color:var(--brass-700);font-size:.66rem;white-space:nowrap}
.admin-finance-category{display:grid;gap:7px}
.admin-finance-category>div{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)}
.admin-finance-category>div:last-child{border-bottom:0}
.admin-finance-category>div>span{color:var(--navy-900);font-size:.65rem}
.admin-finance-category small{display:flex;align-items:center;gap:4px;color:var(--muted);font-size:.58rem}
@media(max-width:900px){.admin-commission-grid,.admin-finance-insights-grid{grid-template-columns:1fr}.admin-commission-row{grid-template-columns:minmax(0,1fr) auto}.admin-commission-row select{grid-column:2}.admin-message-grid{grid-template-columns:1fr}}
@media(max-width:520px){.admin-commission-row{grid-template-columns:1fr}.admin-commission-row select{grid-column:1;width:100%}.admin-message-grid{padding:0 12px}.admin-message-preview{width:calc(100% - 24px);margin-inline:12px}.admin-message-actions{padding-inline:12px}.admin-finance-month{grid-template-columns:48px minmax(0,1fr)}}

/* CRM intelligence: editable templates, customer 360 and consultant performance */
.admin-message-manager-grid{display:grid;grid-template-columns:minmax(180px,.36fr) minmax(0,1fr);gap:14px;padding:0 18px 18px}
.admin-message-template-list{display:grid;gap:7px;align-content:start}
.admin-message-template-item{display:grid;gap:3px;text-align:right;padding:10px 11px;border:1px solid var(--line);border-radius:11px;background:var(--card,#fff);color:var(--fg);cursor:pointer;font:inherit}
.admin-message-template-item span{font-size:.69rem;font-weight:800;color:var(--navy-900)}
.admin-message-template-item small{font-size:.56rem;color:var(--muted)}
.admin-message-template-item.is-active{border-color:var(--brass-500,#b88938);background:var(--brass-50,#fbf7ef)}
.admin-message-editor{display:grid;gap:10px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--card,#fff)}
.admin-message-editor-row{display:grid;grid-template-columns:1fr 1fr 170px;gap:10px}
.admin-message-editor .field>textarea{min-height:138px}
.admin-message-active-field{display:grid;align-content:start}
.admin-message-help{color:var(--muted);font-size:.6rem}
.admin-message-help code{display:inline-block;margin-inline-start:4px;padding:2px 5px;border-radius:6px;background:var(--surface-2,#f7f5f0);color:var(--navy-900);direction:rtl}
.admin-message-editor-actions{display:flex;gap:8px;flex-wrap:wrap}
.admin-message-send-box{padding:0 18px 18px;border-top:1px solid var(--line);margin-top:2px;padding-top:14px}
.admin-customer-360{margin-bottom:16px}
.admin-360-select{min-width:min(340px,100%);width:min(340px,100%)}
.admin-360-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:0 18px 14px}
.admin-360-summary>div{padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2,#f7f5f0)}
.admin-360-summary span,.admin-360-summary small{display:block;color:var(--muted);font-size:.58rem}
.admin-360-summary strong{display:block;margin-top:4px;color:var(--navy-900);font-size:.75rem;line-height:1.6}
.admin-360-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:0 18px 18px}
.admin-360-card{padding:13px;border:1px solid var(--line);border-radius:13px;background:var(--card,#fff);min-width:0}
.admin-360-card h3{display:flex;align-items:center;gap:6px;margin:0 0 9px;color:var(--navy-900);font-size:.75rem}
.admin-360-card>p{margin:0;color:var(--fg);font-size:.67rem;line-height:1.9;white-space:pre-wrap}
.admin-360-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
.admin-360-meta span{padding:4px 7px;border-radius:999px;background:var(--surface-2,#f7f5f0);color:var(--muted);font-size:.55rem}
.admin-360-budget{display:grid;gap:6px}
.admin-360-budget>div,.admin-360-list article{display:flex;justify-content:space-between;gap:10px;align-items:center;border-bottom:1px solid var(--line);padding:7px 0}
.admin-360-budget>div:last-child,.admin-360-list article:last-child{border-bottom:0}
.admin-360-budget span,.admin-360-list small{color:var(--muted);font-size:.59rem}
.admin-360-budget strong,.admin-360-list b{color:var(--navy-900);font-size:.64rem}
.admin-360-timeline{display:grid;gap:7px;max-height:300px;overflow:auto}
.admin-360-timeline article{padding:7px 8px;border-inline-start:3px solid var(--brass-500,#b88938);background:var(--surface-2,#f7f5f0);border-radius:8px}
.admin-360-timeline strong{display:block;color:var(--navy-900);font-size:.62rem}
.admin-360-timeline small{display:block;margin-top:2px;color:var(--subtle);font-size:.53rem}
.admin-360-timeline p{margin:4px 0 0;color:var(--fg);font-size:.59rem;line-height:1.7}
.admin-360-total{display:block;margin-top:8px;color:var(--brass-700);font-size:.6rem;font-weight:800}
.admin-performance-kpis{margin:0 18px 14px}
.admin-performance-table-wrap{overflow:auto;padding:0 18px 18px}
.admin-performance-table{width:100%;border-collapse:separate;border-spacing:0;min-width:850px}
.admin-performance-table th,.admin-performance-table td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:right;font-size:.62rem}
.admin-performance-table th{color:var(--muted);background:var(--surface-2,#f7f5f0);font-size:.58rem}
.admin-performance-table td{color:var(--fg)}
.admin-performance-table td strong{display:block;color:var(--navy-900);font-size:.65rem}
.admin-performance-table td small{display:block;margin-top:2px;color:var(--subtle);font-size:.52rem}
.admin-performance-table td b{color:var(--brass-700)}
@media(max-width:900px){
  .admin-message-manager-grid,.admin-360-grid{grid-template-columns:1fr}
  .admin-message-editor-row{grid-template-columns:1fr}
  .admin-360-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:520px){
  .admin-message-manager-grid,.admin-message-send-box,.admin-performance-table-wrap,.admin-360-summary,.admin-360-grid{padding-inline:12px}
  .admin-360-summary{grid-template-columns:1fr}
}

/* Consultant targets + reusable CRM segments + printable deal pack */
.admin-target-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.admin-target-toolbar input{min-height:38px;border:1px solid var(--line);border-radius:10px;background:var(--card,#fff);color:var(--fg);padding:6px 9px;font:inherit;font-size:.68rem}
.admin-target-form{display:grid;grid-template-columns:1.15fr .7fr .7fr 1fr 1fr auto;gap:9px;align-items:end;padding:0 18px 16px}
.admin-target-table-wrap{overflow:auto;padding:0 18px 18px}
.admin-target-table{width:100%;min-width:820px;border-collapse:collapse}
.admin-target-table th,.admin-target-table td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:right;font-size:.62rem;vertical-align:middle}
.admin-target-table th{background:var(--surface-2,#f7f5f0);color:var(--subtle);font-size:.58rem}
.admin-target-table td{color:var(--muted)}
.admin-target-table td strong{color:var(--navy-900);font-size:.68rem}
.admin-target-table td b{display:block;color:var(--navy-900);font-size:.61rem;white-space:nowrap}
.admin-target-progress{display:block;height:6px;margin-top:4px;border-radius:999px;background:var(--surface-2,#f2f1ed);overflow:hidden;min-width:90px}
.admin-target-progress i{display:block;height:100%;background:var(--brass-600);border-radius:inherit;min-width:0}
.admin-lead-segments{margin-bottom:16px}
.admin-segment-create{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:0 18px 12px}
.admin-segment-create input{min-height:40px;border:1px solid var(--line);border-radius:10px;background:var(--card,#fff);color:var(--fg);padding:8px 11px;font:inherit;font-size:.68rem}
.admin-segment-list{display:grid;gap:7px;padding:0 18px 18px}
.admin-segment-list article{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:11px;background:var(--card,#fff)}
.admin-segment-apply{display:grid;gap:2px;border:0;background:transparent;text-align:right;cursor:pointer;font:inherit;min-width:0}
.admin-segment-apply strong{color:var(--navy-900);font-size:.67rem}
.admin-segment-apply small{color:var(--muted);font-size:.57rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.admin-segment-list article:hover{border-color:var(--brass-300,#d9bd86);background:var(--brass-50,#fbf7ef)}
@media(max-width:1100px){.admin-target-form{grid-template-columns:repeat(3,minmax(0,1fr))}.admin-target-form .btn-gold{grid-column:1/-1;justify-self:start}}
@media(max-width:700px){.admin-target-form{grid-template-columns:1fr 1fr}.admin-target-form .btn-gold{grid-column:1/-1;width:100%}.admin-target-table-wrap{padding-inline:12px}.admin-target-toolbar{width:100%}.admin-target-toolbar input{flex:1}.admin-segment-create{grid-template-columns:1fr;padding-inline:12px}.admin-segment-list{padding-inline:12px}}
@media(max-width:460px){.admin-target-form{grid-template-columns:1fr}.admin-target-form .btn-gold{grid-column:1}.admin-segment-list article{grid-template-columns:minmax(0,1fr) auto}}

/* Pricing history, sales funnel and management reports */
.admin-price-history{margin-top:16px}
.admin-price-history>legend{display:flex;align-items:center;gap:6px}
.admin-price-history-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:0 18px 12px}
.admin-price-history-head p{margin:5px 0 0;color:var(--muted);font-size:.62rem;line-height:1.8}
.admin-price-history-list{display:grid;gap:8px;padding:0 18px 18px}
.admin-price-history-row{display:grid;grid-template-columns:minmax(170px,.35fr) minmax(0,1fr);gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card,#fff)}
.admin-price-history-main strong{display:block;color:var(--navy-900);font-size:.66rem}
.admin-price-history-main small{display:block;margin-top:3px;color:var(--muted);font-size:.56rem}
.admin-price-history-changes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
.admin-price-history-changes>div{padding:7px 8px;border-radius:9px;background:var(--surface-2,#f7f5f0)}
.admin-price-history-changes span{display:block;color:var(--muted);font-size:.54rem}
.admin-price-history-changes b{display:block;margin-top:3px;color:var(--navy-900);font-size:.6rem;line-height:1.7}
.admin-price-history-changes small{display:flex;align-items:center;gap:3px;margin-top:2px;color:var(--brass-700);font-size:.54rem}
.admin-sales-funnel{margin-bottom:16px}
.admin-funnel-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:0 18px 14px}
.admin-funnel-summary>div,.admin-report-kpis>div{padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2,#f7f5f0)}
.admin-funnel-summary span,.admin-report-kpis span{display:block;color:var(--muted);font-size:.57rem}
.admin-funnel-summary strong,.admin-report-kpis strong{display:block;margin-top:4px;color:var(--navy-900);font-size:.8rem}
.admin-funnel-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);gap:14px;padding:0 18px 18px}
.admin-funnel-chart,.admin-funnel-side{padding:12px;border:1px solid var(--line);border-radius:13px;background:var(--card,#fff)}
.admin-funnel-row{display:grid;gap:5px;margin-bottom:9px}
.admin-funnel-row>div{display:flex;justify-content:space-between;gap:10px;color:var(--navy-900);font-size:.61rem}
.admin-funnel-row>i{display:block;height:9px;border-radius:99px;background:var(--brass-600);max-width:100%}
.admin-funnel-side{display:grid;align-content:start;gap:6px}
.admin-funnel-side h3{display:flex;align-items:center;gap:5px;margin:0 0 3px;color:var(--navy-900);font-size:.69rem}
.admin-funnel-side>div{display:flex;justify-content:space-between;gap:9px;padding:6px 0;border-bottom:1px solid var(--line)}
.admin-funnel-side>div span{color:var(--muted);font-size:.57rem}
.admin-funnel-side>div b{color:var(--navy-900);font-size:.6rem}
.admin-funnel-subhead{margin-top:9px!important}
.admin-management-report{margin-bottom:16px}
.admin-report-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.admin-report-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:0 18px 14px}
.admin-report-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0 18px 18px}
.admin-report-grid>section{padding:12px;border:1px solid var(--line);border-radius:13px;background:var(--card,#fff)}
.admin-report-grid h3{display:flex;align-items:center;gap:5px;margin:0 0 6px;color:var(--navy-900);font-size:.7rem}
.admin-report-grid p{margin:0;color:var(--muted);font-size:.61rem;line-height:1.8}
.admin-report-consultants{display:grid;gap:6px}
.admin-report-consultants>div{display:flex;justify-content:space-between;gap:9px;border-bottom:1px solid var(--line);padding:6px 0}
.admin-report-consultants>div:last-child{border-bottom:0}
.admin-report-consultants strong{color:var(--navy-900);font-size:.61rem}
.admin-report-consultants span{color:var(--muted);font-size:.57rem}
@media(max-width:900px){
 .admin-price-history-row{grid-template-columns:1fr}
 .admin-price-history-changes{grid-template-columns:1fr}
 .admin-funnel-layout{grid-template-columns:1fr}
 .admin-report-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(max-width:520px){
 .admin-price-history-head,.admin-price-history-list,.admin-funnel-summary,.admin-funnel-layout,.admin-report-kpis,.admin-report-grid{padding-inline:12px}
 .admin-funnel-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
 .admin-report-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
 .admin-report-grid{grid-template-columns:1fr}
 .admin-report-actions{width:100%}
 .admin-report-actions>*{flex:1 1 auto}
}
`;
