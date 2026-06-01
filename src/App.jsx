import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./lib/supabase";

const USUARIO = "Comprador";
const PORTAL_URL = "https://erp-portal-fawn.vercel.app";
const BASES = ["Golondrina de Mar", "Atlantic Dama", "Parana Ports"];
const UNIDADES_PEDIDO = ["Kg", "Litros", "Unidad", "Caja", "Bolsa", "Atado", "Cajón", "Ristra", "Lata", "Pote", "Docena", "Bandeja"];
const UNIDADES_ANALISIS = ["Kg", "Litros"];
const PLAZO_PAGO_OPTIONS = ["Contado", "15 días", "30 días", "45 días", "60 días", "90 días"];

const TEMP_COLOR = {
  "Seco":        { bg: "#FEF9C3", color: "#92400E", border: "#FDE68A", dot: "#EAB308" },
  "Refrigerado": { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE", dot: "#3B82F6" },
  "Congelado":   { bg: "#EDE9FE", color: "#4C1D95", border: "#DDD6FE", dot: "#8B5CF6" },
};

const STATUS_PEDIDO = {
  borrador:  { label: "Borrador",             color: "b-gray" },
  enviado:   { label: "Enviado al comprador", color: "b-blue" },
  aprobado:  { label: "Aprobado",             color: "b-green" },
  rechazado: { label: "Rechazado",            color: "b-red" },
};

const TRACKER_STATUS = {
  pendiente:  { label: "Pendiente",  color: "b-amber" },
  en_camino:  { label: "En camino",  color: "b-blue" },
  entregado:  { label: "Entregado",  color: "b-green" },
};

const fmt = (n) => n != null ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n) : "—";
const fmtDate = d => d ? new Date(d).toLocaleDateString("es-AR") : "—";

// ─── API ─────────────────────────────────────────────────────────────────────
const api = {
  async getCatalogo() {
    const { data, error } = await supabase.from("viveres_catalogo").select("*").eq("activo", true).order("categoria").order("descripcion");
    if (error) throw error;
    return data || [];
  },
  async getParametros() {
    const { data, error } = await supabase.from("viveres_parametros_dieta").select("*");
    if (error) throw error;
    return data || [];
  },
  async getPedidos(filtros = {}) {
    let q = supabase.from("viveres_pedidos").select("*, viveres_pedido_items(*)").order("created_at", { ascending: false });
    if (filtros.status) q = q.eq("status", filtros.status);
    if (filtros.statuses) q = q.in("status", filtros.statuses);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async crearPedido(pedido, items) {
    const { proyecto, ...resto } = pedido;
    const { data: nuevo, error } = await supabase
      .from("viveres_pedidos")
      .insert([{ ...resto, fecha_pedido: pedido.fecha_pedido || null, fecha_necesaria: pedido.fecha_necesaria || null }])
      .select()
      .single();
    if (error) throw error;
    if (items?.length) {
      const { error: errItems } = await supabase
        .from("viveres_pedido_items")
        .insert(items.map(it => ({ ...it, pedido_id: nuevo.id })));
      if (errItems) throw errItems;
    }
    return nuevo;
  },
  async actualizarPedido(id, cambios) {
    const { proyecto, ...resto } = cambios;
    const { data, error } = await supabase
      .from("viveres_pedidos")
      .update({ ...resto, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async actualizarItems(pedidoId, items) {
    const { error: errDel } = await supabase
      .from("viveres_pedido_items")
      .delete()
      .eq("pedido_id", pedidoId);
    if (errDel) throw errDel;
    if (items?.length) {
      const { error: errIns } = await supabase
        .from("viveres_pedido_items")
        .insert(items.map(it => ({ ...it, pedido_id: pedidoId })));
      if (errIns) throw errIns;
    }
  },
  async eliminarPedido(id) {
    const { error: errItems } = await supabase.from("viveres_pedido_items").delete().eq("pedido_id", id);
    if (errItems) throw errItems;
    const { error } = await supabase.from("viveres_pedidos").delete().eq("id", id);
    if (error) throw error;
  },
  async subirRemito(file, pedidoId) {
    const path = `viveres/remitos/${pedidoId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("cotizaciones").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("cotizaciones").getPublicUrl(path);
    return data.publicUrl;
  },
};

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#213363;--blue:#235C96;--mid:#6381A7;--light:#A5B5CC;
  --bg:#F0F4F8;--surface:#FFF;--surface2:#F5F7FA;--border:#D6E0ED;
  --text:#213363;--muted:#6381A7;--muted2:#8FA3BC;--accent:#235C96;--accent2:#1E7A4A;
  --warn:#B07D0A;--danger:#C0392B;
  --sans:'Montserrat',sans-serif;--mono:'DM Mono',monospace;--r:6px;--r2:10px;
}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.5;min-height:100vh;overflow-x:hidden}
.app{display:flex;min-height:100vh;overflow-x:hidden}
.sidebar{width:235px;min-width:235px;background:var(--navy);display:flex;flex-direction:column;box-shadow:2px 0 8px rgba(33,51,99,.15)}
.sidebar-header{border-bottom:1px solid rgba(255,255,255,.1)}
.sidebar-logo-wrap{padding:20px 18px 16px;display:flex;align-items:center;gap:12px}
.sidebar-logo-img{width:36px;height:36px;object-fit:cover;border-radius:50%;border:2px solid rgba(255,255,255,.2)}
.sidebar-logo-main{font-size:13px;font-weight:700;color:#fff;letter-spacing:2px;text-transform:uppercase}
.sidebar-logo-sub{font-size:9px;color:rgba(255,255,255,.5);letter-spacing:.5px}
.nav-section{padding:12px 18px 4px;font-family:var(--mono);font-size:9px;letter-spacing:2px;color:rgba(255,255,255,.35);text-transform:uppercase}
.ni{display:flex;align-items:center;gap:9px;padding:7px 18px;font-size:12px;font-weight:500;cursor:pointer;color:rgba(255,255,255,.6);border-left:3px solid transparent;transition:all .12s;user-select:none}
.ni:hover{color:#fff;background:rgba(255,255,255,.06)}
.ni.active{color:#fff;border-left-color:var(--light);background:rgba(255,255,255,.1);font-weight:600}
.ni.back{color:rgba(255,255,255,.4);font-size:11px;border-top:1px solid rgba(255,255,255,.08);margin-top:4px}
.ni.back:hover{color:rgba(255,255,255,.8)}
.ni-icon{font-size:13px;width:16px;text-align:center;flex-shrink:0}
.ni-badge{margin-left:auto;background:var(--danger);color:#fff;font-family:var(--mono);font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;min-width:18px;text-align:center}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:13px 28px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 3px rgba(33,51,99,.06)}
.topbar-title{font-size:12px;font-weight:600;letter-spacing:1px;color:var(--navy);text-transform:uppercase}
.content{flex:1;overflow-y:auto;overflow-x:hidden;padding:24px 28px;background:var(--bg)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:20px;margin-bottom:16px;box-shadow:0 1px 4px rgba(33,51,99,.06)}
.card-title{font-size:10px;font-weight:600;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between}
.badge{display:inline-flex;align-items:center;font-family:var(--mono);font-size:9px;font-weight:600;padding:3px 8px;border-radius:4px;white-space:nowrap;letter-spacing:.3px}
.b-amber{background:#FEF3C7;color:#92400E;border:1px solid #FDE68A}
.b-blue{background:#DBEAFE;color:#1E40AF;border:1px solid #BFDBFE}
.b-red{background:#FEE2E2;color:#991B1B;border:1px solid #FECACA}
.b-green{background:#D1FAE5;color:#065F46;border:1px solid #A7F3D0}
.b-gray{background:#F3F4F6;color:#6B7280;border:1px solid #E5E7EB}
.btn{display:inline-flex;align-items:center;gap:6px;font-family:var(--sans);font-size:11px;font-weight:600;letter-spacing:.3px;padding:7px 14px;border-radius:var(--r);border:1px solid transparent;cursor:pointer;transition:all .15s;white-space:nowrap;text-transform:uppercase}
.btn-primary{background:var(--blue);color:#fff}.btn-primary:hover{background:var(--navy)}
.btn-success{background:var(--accent2);color:#fff}.btn-success:hover{background:#145E37}
.btn-danger{background:transparent;color:var(--danger);border-color:var(--danger)}.btn-danger:hover{background:#FEE2E2}
.btn-ghost{background:transparent;color:var(--muted);border-color:var(--border)}.btn-ghost:hover{color:var(--text);background:var(--surface2)}
.btn-sm{padding:4px 10px;font-size:10px}
.btn:disabled{opacity:.4;cursor:not-allowed}
.overlay{position:fixed;inset:0;background:rgba(33,51,99,.5);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:20px;overflow-y:auto;animation:fadeIn .15s}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:12px;width:100%;max-width:860px;margin:auto;animation:slideUp .2s;box-shadow:0 8px 32px rgba(33,51,99,.18)}
.modal-lg{max-width:1000px}
.mhdr{display:flex;justify-content:space-between;align-items:flex-start;padding:18px 22px;border-bottom:1px solid var(--border);background:var(--surface2);border-radius:12px 12px 0 0}
.mtitle{font-size:13px;font-weight:700;letter-spacing:.5px;color:var(--navy)}
.mbody{padding:22px}
.mftr{padding:14px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:var(--surface2);border-radius:0 0 12px 12px}
.mclose{background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer}
.mclose:hover{color:var(--navy)}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
.fg{display:flex;flex-direction:column;gap:5px}
.fg label{font-size:10px;color:var(--navy);letter-spacing:.5px;text-transform:uppercase;font-weight:600}
.fg input,.fg select,.fg textarea{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--sans);font-size:13px;padding:8px 10px;outline:none;transition:border-color .15s}
.fg input:focus,.fg select:focus,.fg textarea:focus{border-color:var(--blue)}
.fg textarea{resize:vertical;min-height:65px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.form-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:14px}
.form-section{font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--blue);text-transform:uppercase;margin:18px 0 12px;padding-bottom:6px;border-bottom:2px solid var(--light)}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:12px}
th{font-size:10px;font-weight:600;letter-spacing:.5px;color:var(--muted);text-transform:uppercase;padding:9px 12px;text-align:left;border-bottom:2px solid var(--border);white-space:nowrap;background:var(--surface2)}
td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr.click:hover td{background:var(--surface2);cursor:pointer}
.tracker-table th{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;padding:9px 12px;background:var(--surface2);border-bottom:2px solid var(--border);white-space:nowrap}
.tracker-table td{padding:8px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
.tracker-table tr:hover td{background:var(--surface2);cursor:pointer}
.filter-row{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center}
.filter-input{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--sans);font-size:11px;padding:6px 10px;outline:none;min-width:130px}
.filter-select{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--sans);font-size:11px;padding:6px 10px;outline:none;cursor:pointer;min-width:130px}
.tabs-row{display:flex;border-bottom:2px solid var(--border);margin-bottom:18px;overflow-x:auto}
.tab{font-size:11px;font-weight:600;padding:9px 16px;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;transition:all .12s;text-transform:uppercase;letter-spacing:.5px;margin-bottom:-2px;white-space:nowrap}
.tab.active{color:var(--blue);border-bottom-color:var(--blue)}
.req-row{background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:16px 18px;margin-bottom:10px;cursor:pointer;transition:all .15s;box-shadow:0 1px 3px rgba(33,51,99,.05)}
.req-row:hover{border-color:var(--blue);box-shadow:0 2px 8px rgba(35,92,150,.12)}
.req-row.unread{border-left:4px solid var(--blue)}
.req-title{font-weight:600;font-size:14px;margin-bottom:6px;color:var(--navy)}
.req-meta{display:flex;gap:14px;font-size:11px;color:var(--muted);flex-wrap:wrap;align-items:center}
.info-box{background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;font-size:13px}
.info-box.accent{border-left:3px solid var(--blue)}
.info-box.warn{border-left:3px solid var(--warn);background:#FFFBEB}
.flex-gap{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.flex-between{display:flex;justify-content:space-between;align-items:center}
.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}
.mb8{margin-bottom:8px}.mb12{margin-bottom:12px}
.text-mono{font-family:var(--mono)}.text-muted{color:var(--muted)}
.empty-state{text-align:center;padding:48px 20px;color:var(--muted);font-size:13px}
.loading{display:flex;align-items:center;justify-content:center;padding:48px;color:var(--muted);gap:10px;font-size:13px}
.spin{animation:spin 1s linear infinite}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.notif{position:fixed;bottom:20px;right:20px;background:var(--surface);border:1px solid var(--border);border-left-width:3px;border-radius:var(--r2);padding:12px 16px;font-size:13px;animation:slideUp .2s;z-index:300;max-width:340px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 16px rgba(33,51,99,.15)}
.n-green{border-left-color:var(--accent2)}.n-red{border-left-color:var(--danger)}.n-amber{border-left-color:var(--warn)}.n-blue{border-left-color:var(--blue)}
.items-edit th{font-size:9px;background:var(--surface2)}
.items-edit td{padding:5px 8px}
.items-edit input,.items-edit select{background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono);font-size:11px;padding:4px 7px;width:100%;outline:none}
.dieta-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.dieta-chip{border-radius:var(--r);padding:5px 8px;display:flex;justify-content:space-between;align-items:center}
.manual-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;gap:16px;background:var(--surface2);border:2px dashed var(--border);border-radius:var(--r2);text-align:center}
.manual-row{background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:14px 16px;margin-bottom:10px}
.manual-row:hover{border-color:var(--blue)}
.fecha-chain{display:flex;gap:12px;align-items:stretch;flex-wrap:wrap;margin:12px 0}
.fecha-step{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:110px;padding:12px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r2);flex:1;text-align:center}
.fecha-step.done{background:#D1FAE5;border-color:#A7F3D0}
.fecha-step-label{font-family:var(--mono);font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted2);font-weight:700}
.fecha-step-val{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--navy)}
.fecha-step.done .fecha-step-label{color:#065F46}
.fecha-step.done .fecha-step-val{color:#065F46}
.fecha-arrow{display:flex;align-items:center;color:var(--muted2);font-size:18px;flex-shrink:0}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:14px 18px;box-shadow:0 1px 4px rgba(33,51,99,.06)}
.stat-label{font-size:10px;color:var(--muted);font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px}
.stat-value{font-family:var(--mono);font-size:28px;font-weight:700}
.req-row-actions{display:flex;flex-direction:row;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);justify-content:flex-end}
.mb16{margin-bottom:16px}
.form-footer-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end}
.form-step2-bar{left:235px !important}
.manual-grid-3{display:grid;grid-template-columns:1fr 1fr 2fr;gap:10px;margin-bottom:10px}
.manual-grid-5{display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:10px;align-items:end}

/* ── RESPONSIVE MOBILE ── */
@media (max-width: 768px) {

  /* Layout: sidebar se oculta, nav pasa abajo */
  .app { flex-direction: column; }
  .sidebar { display: none; }
  .main { width: 100%; padding-bottom: 72px; }

  /* Topbar mobile */
  .topbar { padding: 10px 16px; }
  .topbar-title { font-size: 11px; }

  /* Content mobile */
  .content { padding: 14px 14px; }

  /* Cards */
  .card { padding: 14px; margin-bottom: 12px; }

  /* Formularios: 1 columna en mobile */
  .form-grid { grid-template-columns: 1fr; gap: 10px; }
  .form-grid-3 { grid-template-columns: 1fr; gap: 10px; }

  /* Tablas: scroll horizontal */
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { font-size: 11px; min-width: 500px; }
  th, td { padding: 7px 8px; }

  /* Filtros: columna en mobile */
  .filter-row { flex-direction: column; align-items: stretch; }
  .filter-input, .filter-select { min-width: unset; width: 100%; }
  .filter-row .btn { width: 100%; justify-content: center; }

  /* Botones */
  .btn { font-size: 11px; padding: 8px 12px; }

  /* Modal footer: columna full-width con orden correcto */
  .mftr { flex-direction: column; align-items: stretch; gap: 6px; }
  .mftr .btn { width: 100%; justify-content: center; flex: unset; }
  .mftr .btn-success { order: -3; }
  .mftr .btn-primary { order: -2; }
  .mftr .btn-danger  { order: -1; }

  /* Modal full screen en mobile */
  .overlay { padding: 0; align-items: flex-end; }
  .modal { border-radius: 16px 16px 0 0; max-width: 100%; max-height: 92vh; overflow-y: auto; }
  .modal-lg { max-width: 100%; }

  /* Req rows */
  .req-meta { gap: 8px; }
  .req-title { font-size: 13px; }

  /* Action cards: acciones en columna full-width */
  .req-row-actions { flex-direction: column; width: 100%; }
  .req-row-actions .btn { width: 100%; justify-content: center; }

  /* Form footer actions */
  .form-footer-actions { flex-direction: column; align-items: stretch; }
  .form-footer-actions .btn { width: 100%; justify-content: center; }

  /* Dieta grid */
  .dieta-grid { grid-template-columns: 1fr; }

  /* Fecha chain */
  .fecha-chain { gap: 6px; }
  .fecha-step { min-width: 80px; padding: 8px 10px; }

  /* Tabs scroll */
  .tabs-row { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .tab { font-size: 10px; padding: 8px 12px; }

  /* Stats: 2 columnas en mobile */
  .stats { grid-template-columns: 1fr 1fr; gap: 8px; }
  .stat { padding: 12px; }
  .stat-value { font-size: 22px; }

  /* Notif: encima del bottom nav */
  .notif { bottom: 80px; right: 10px; left: 10px; max-width: unset; }

  /* Items-edit table */
  .items-edit table { min-width: 380px; }

  /* Step 2 bottom bar: full width on mobile */
  .form-step2-bar { left: 0 !important; padding: 10px 14px; flex-direction: column; align-items: stretch; gap: 8px; }
  .form-step2-bar > div:last-child { flex-wrap: wrap; justify-content: stretch; }
  .form-step2-bar > div:last-child .btn { flex: 1; justify-content: center; min-width: 120px; }

  /* Manual item grids: collapse to 1 col */
  .manual-grid-3 { grid-template-columns: 1fr; }
  .manual-grid-5 { grid-template-columns: 1fr 1fr; }
}

/* ── BOTTOM NAV (solo mobile) ── */
@media (max-width: 768px) {
  .mobile-nav {
    display: flex !important;
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--navy); border-top: 1px solid rgba(255,255,255,0.1);
    z-index: 50; height: 64px;
    justify-content: space-around; align-items: center;
    padding: 0 8px; box-shadow: 0 -2px 12px rgba(33,51,99,0.2);
  }
  .mobile-nav-item {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    cursor: pointer; padding: 6px 10px; border-radius: 8px;
    color: rgba(255,255,255,0.5); transition: all .15s; flex: 1;
    position: relative;
  }
  .mobile-nav-item.active { color: #fff; background: rgba(255,255,255,0.1); }
  .mobile-nav-item:hover { color: #fff; }
  .mobile-nav-icon { font-size: 18px; line-height: 1; }
  .mobile-nav-label { font-size: 9px; font-weight: 600; letter-spacing: 0.3px; text-transform: uppercase; font-family: var(--mono); }
  .mobile-nav-badge {
    position: absolute; top: 4px; right: 8px;
    background: var(--danger); color: #fff;
    font-family: var(--mono); font-size: 9px; font-weight: 700;
    padding: 1px 5px; border-radius: 8px; min-width: 16px; text-align: center;
  }
}
@media (min-width: 769px) {
  .mobile-nav { display: none !important; }
}
`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function Notif({ msg, onClose }) {
  if (!msg) return null;
  const cls = { success: "n-green", error: "n-red", warn: "n-amber", info: "n-blue" }[msg.type] || "n-blue";
  return <div className={`notif ${cls}`}><span>{msg.text}</span><button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>✕</button></div>;
}

function FG({ label, hint, children, full }) {
  return <div className="fg" style={full ? { gridColumn: "1/-1" } : {}}>
    {label && <label>{label}</label>}
    {children}
    {hint && <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{hint}</div>}
  </div>;
}

function TempBadge({ temp }) {
  const tc = TEMP_COLOR[temp] || { bg: "#F3F4F6", color: "#6B7280", border: "#E5E7EB", dot: "#9CA3AF" };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: tc.color, background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 4, padding: "2px 6px" }}>
    <span style={{ width: 5, height: 5, borderRadius: "50%", background: tc.dot, display: "inline-block" }} />{temp}
  </span>;
}

function calcDieta(items, paxDias) {
  const grupos = {};
  items.forEach(it => {
    const total = (it.stock_actual || 0) + (it.cantidad_pedida || 0);
    const porPaxDia = paxDias > 0 ? (total * (it.volumen_peso || 1)) / paxDias : 0;
    grupos[it.categoria] = (grupos[it.categoria] || 0) + porPaxDia;
  });
  return grupos;
}

function exportarParaProveedor(pedido, items) {
  const rows = items.filter(it => it.cantidad_pedida > 0).map(it => ({
    "Categoría": it.categoria || "", "Temperatura": it.temperatura || "",
    "Descripción": it.descripcion || "", "Unidad de pedido": it.unidad || "",
    "Cantidad pedida": it.cantidad_pedida || 0, "Observaciones": "",
  }));
  const grupos = {};
  items.filter(it => it.cantidad_pedida > 0).forEach(it => {
    const total = (it.cantidad_pedida || 0) * (it.volumen_peso || 1);
    if (!grupos[it.categoria]) grupos[it.categoria] = { total: 0, unidad: it.unidad_analisis || "Kg" };
    grupos[it.categoria].total += total;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pedido Víveres");
  const resumen = Object.entries(grupos).map(([cat, d]) => ({ "Categoría": cat, [`Total (${d.unidad})`]: Math.round(d.total * 100) / 100 }));
  if (resumen.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");
  XLSX.writeFile(wb, `viveres_${(pedido.base_buque || "pedido").replace(/ /g, "_")}_${(pedido.fecha_pedido || "").slice(0, 10)}.xlsx`);
}

// ─── FORM PEDIDO ─────────────────────────────────────────────────────────────
function FormPedido({ pedidoInicial, catalogoInicial, parametros, onSave, onCancel, notify }) {
  const [step, setStep] = useState(1);
  const [catalogo] = useState(catalogoInicial || []);
  const [saving, setSaving] = useState(false);
  const [cabecera, setCabecera] = useState({
    empresa: "Parana Logistica", base_buque: pedidoInicial?.base_buque || "",
    pax: pedidoInicial?.pax || 12, dias: pedidoInicial?.dias || 15,
    fecha_pedido: pedidoInicial?.fecha_pedido || new Date().toISOString().split("T")[0],
    fecha_necesaria: pedidoInicial?.fecha_necesaria || "",
    solicitado_por: pedidoInicial?.solicitado_por || "",
    observaciones: pedidoInicial?.observaciones || "",
  });
  const [items, setItems] = useState(() => {
    const ex = pedidoInicial?.viveres_pedido_items || [];
    return catalogo.map(c => {
      const found = ex.find(e => e.catalogo_id === c.id);
      return { catalogo_id: c.id, descripcion: c.descripcion, categoria: c.categoria, subcategoria: c.subcategoria || "", temperatura: c.temperatura || "", unidad: c.unidad || "Unidad", unidad_analisis: c.unidad_analisis || "Kg", volumen_peso: c.volumen_peso || 1, stock_actual: found?.stock_actual || 0, cantidad_pedida: found?.cantidad_pedida || 0 };
    });
  });
  const [itemsManuales, setItemsManuales] = useState(() => {
    if (!pedidoInicial?.viveres_pedido_items) return [];
    return pedidoInicial.viveres_pedido_items.filter(it => !it.catalogo_id).map(it => ({ ...it, id: it.id || `m_${Date.now()}_${Math.random()}` }));
  });
  const [filtroCateg, setFiltroCateg] = useState("");
  const [filtroTemp, setFiltroTemp] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const blankManual = () => ({ id: `m_${Date.now()}_${Math.random()}`, catalogo_id: null, descripcion: "", categoria: "Almacén", temperatura: "Seco", unidad: "Unidad", unidad_analisis: "Kg", volumen_peso: 1, stock_actual: 0, cantidad_pedida: 0 });
  const setCab = (k, v) => setCabecera(c => ({ ...c, [k]: v }));
  const setItem = (id, k, v) => setItems(prev => prev.map(it => it.catalogo_id === id ? { ...it, [k]: parseFloat(v) || 0 } : it));
  const setManual = (i, k, v) => { const arr = [...itemsManuales]; arr[i] = { ...arr[i], [k]: v }; setItemsManuales(arr); };
  const setManualNum = (i, k, v) => { const arr = [...itemsManuales]; arr[i] = { ...arr[i], [k]: parseFloat(v) || 0 }; setItemsManuales(arr); };

  const paxDias = (cabecera.pax || 0) * (cabecera.dias || 0);
  const todosItems = [...items, ...itemsManuales];
  const dietaActual = calcDieta(todosItems, paxDias);
  const itemsConPedido = todosItems.filter(it => it.cantidad_pedida > 0 && (it.descripcion || "").trim());
  const categorias = [...new Set(catalogo.map(c => c.categoria))].sort();
  const temperaturas = [...new Set(catalogo.map(c => c.temperatura).filter(Boolean))];
  const itemsFiltrados = items.filter(it => {
    if (filtroCateg && it.categoria !== filtroCateg) return false;
    if (filtroTemp && it.temperatura !== filtroTemp) return false;
    if (busqueda && !it.descripcion.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  const handleGuardar = async (status = "borrador") => {
    if (!cabecera.base_buque || !cabecera.solicitado_por) { alert("Completá Base/Buque y Solicitado por"); return; }
    setSaving(true);
    try {
      const itemsAGuardar = [...items.filter(it => it.cantidad_pedida > 0 || it.stock_actual > 0), ...itemsManuales.filter(it => it.descripcion.trim() && (it.cantidad_pedida > 0 || it.stock_actual > 0))].map(({ id: _id, ...rest }) => rest);
      await onSave({ ...cabecera, status }, itemsAGuardar, status);
    } catch (e) { notify("Error: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  if (step === 1) return (
    <div className="card">
      <div className="card-title">Datos del pedido</div>
      <div className="form-grid-3">
        <FG label="Base / Buque *"><select value={cabecera.base_buque} onChange={e => setCab("base_buque", e.target.value)}><option value="">Seleccionar...</option>{BASES.map(b => <option key={b}>{b}</option>)}</select></FG>
        <FG label="Solicitado por *"><input value={cabecera.solicitado_por} onChange={e => setCab("solicitado_por", e.target.value)} placeholder="Nombre del cocinero/encargado" /></FG>
        <FG label="Proyecto"><input value={cabecera.proyecto || ""} onChange={e => setCab("proyecto", e.target.value)} placeholder="Ej: OP-2026-003" /></FG>
      </div>
      <div className="form-grid">
        <FG label="PAX"><input type="number" value={cabecera.pax} onChange={e => setCab("pax", parseInt(e.target.value) || 0)} min={1} /></FG>
        <FG label="Días"><input type="number" value={cabecera.dias} onChange={e => setCab("dias", parseInt(e.target.value) || 0)} min={1} /></FG>
        <FG label="Fecha del pedido"><input type="date" value={cabecera.fecha_pedido} onChange={e => setCab("fecha_pedido", e.target.value)} /></FG>
        <FG label="Fecha necesaria"><input type="date" value={cabecera.fecha_necesaria} onChange={e => setCab("fecha_necesaria", e.target.value)} /></FG>
      </div>
      <FG label="Observaciones"><textarea value={cabecera.observaciones} onChange={e => setCab("observaciones", e.target.value)} placeholder="Notas adicionales..." /></FG>
      {cabecera.pax > 0 && cabecera.dias > 0 && <div className="info-box accent mt12" style={{ fontSize: 12 }}>Total: <strong>{cabecera.pax} PAX × {cabecera.dias} días = {paxDias} raciones</strong></div>}
      <div className="form-footer-actions mt16" style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => { if (!cabecera.base_buque || !cabecera.solicitado_por) { alert("Completá Base/Buque y Solicitado por"); return; } setStep(2); }}>Continuar → Cargar ítems</button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-title">Datos del pedido</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>{cabecera.base_buque}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Parana Logística · {cabecera.pax} PAX · {cabecera.dias} días · <strong>{paxDias} raciones</strong></div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Por: {cabecera.solicitado_por}</div>
          <button className="btn btn-ghost btn-sm mt8" onClick={() => setStep(1)}>← Editar datos</button>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-title">Control de dieta — análisis / persona / día</div>
          <div className="dieta-grid">
            {parametros.map(p => {
              const val = dietaActual[p.grupo] || 0;
              const status = val === 0 ? "yellow" : val < p.min ? "red" : val > p.max ? "red" : "green";
              const colors = { green: { bg: "#D1FAE5", color: "#065F46" }, red: { bg: "#FEE2E2", color: "#991B1B" }, yellow: { bg: "#FEF9C3", color: "#92400E" } };
              return <div key={p.grupo} className="dieta-chip" style={{ background: colors[status].bg }}><span style={{ fontSize: 10, color: colors[status].color, fontWeight: 600 }}>{p.grupo}</span><span style={{ fontFamily: "var(--mono)", fontSize: 11, color: colors[status].color }}>{val.toFixed(2)} / {p.max} {p.unidad_medida}</span></div>;
            })}
          </div>
        </div>
      </div>

      <div className="tabs-row">
        <div className={`tab ${filtroCateg === "" ? "active" : ""}`} onClick={() => setFiltroCateg("")}>Todos</div>
        {categorias.map(cat => {
          const cnt = items.filter(it => it.categoria === cat && it.cantidad_pedida > 0).length;
          return <div key={cat} className={`tab ${filtroCateg === cat ? "active" : ""}`} onClick={() => setFiltroCateg(cat)}>{cat}{cnt > 0 && <span style={{ marginLeft: 6, background: "var(--accent2)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 8, fontFamily: "var(--mono)" }}>{cnt}</span>}</div>;
        })}
        <div className={`tab ${filtroCateg === "__manual__" ? "active" : ""}`} onClick={() => setFiltroCateg("__manual__")}>
          ✏️ Ingreso manual
          {itemsManuales.filter(it => it.cantidad_pedida > 0 && it.descripcion.trim()).length > 0 && <span style={{ marginLeft: 6, background: "var(--blue)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 8, fontFamily: "var(--mono)" }}>{itemsManuales.filter(it => it.cantidad_pedida > 0 && it.descripcion.trim()).length}</span>}
        </div>
      </div>

      {filtroCateg === "__manual__" ? (
        <div style={{ marginBottom: 90 }}>
          <div className="info-box accent mb12" style={{ fontSize: 11 }}>Agregá productos que no están en el catálogo.</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => setItemsManuales([...itemsManuales, blankManual()])}>
              + Agregar ítem manual
            </button>
          </div>
          {itemsManuales.length === 0 ? (
            <div className="manual-empty">
              <div style={{ fontSize: 36 }}>✏️</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--navy)" }}>Sin ítems manuales</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Hacé click en "+ Agregar ítem manual" para agregar productos que no están en el catálogo</div>
              <button className="btn btn-primary" onClick={() => setItemsManuales([...itemsManuales, blankManual()])}>+ Agregar primer ítem</button>
            </div>
          ) : (
            <div>
              {itemsManuales.map((it, i) => {
                const totalAnalisis = (it.cantidad_pedida || 0) * (it.volumen_peso || 1);
                return (
                  <div key={it.id} className="manual-row">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>ÍTEM {i + 1}</div>
                      <button onClick={() => setItemsManuales(itemsManuales.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
                    </div>
                    <div className="manual-grid-3">
                      <FG label="Temperatura"><select value={it.temperatura} onChange={e => setManual(i, "temperatura", e.target.value)}><option>Seco</option><option>Refrigerado</option><option>Congelado</option></select></FG>
                      <FG label="Categoría"><select value={it.categoria} onChange={e => setManual(i, "categoria", e.target.value)}>{categorias.map(c => <option key={c}>{c}</option>)}<option>Otro</option></select></FG>
                      <FG label="Descripción *"><input value={it.descripcion} onChange={e => setManual(i, "descripcion", e.target.value)} placeholder="Nombre del producto..." /></FG>
                    </div>
                    <div className="manual-grid-5">
                      <FG label="Unidad pedido"><select value={it.unidad} onChange={e => setManual(i, "unidad", e.target.value)}>{UNIDADES_PEDIDO.map(u => <option key={u}>{u}</option>)}</select></FG>
                      <FG label="Unidad análisis"><select value={it.unidad_analisis || "Kg"} onChange={e => setManual(i, "unidad_analisis", e.target.value)}>{UNIDADES_ANALISIS.map(u => <option key={u}>{u}</option>)}</select></FG>
                      <FG label="Vol/Peso x unidad"><input type="number" step="0.001" min="0" value={it.volumen_peso || ""} onChange={e => setManual(i, "volumen_peso", parseFloat(e.target.value) || 1)} placeholder="1" /></FG>
                      <FG label="Stock actual"><input type="number" min={0} value={it.stock_actual || ""} onChange={e => setManualNum(i, "stock_actual", e.target.value)} placeholder="0" /></FG>
                      <FG label="Cantidad pedida"><input type="number" min={0} value={it.cantidad_pedida || ""} onChange={e => setManualNum(i, "cantidad_pedida", e.target.value)} placeholder="0" style={{ background: it.cantidad_pedida > 0 ? "#DCFCE7" : undefined, fontWeight: it.cantidad_pedida > 0 ? 700 : 400, borderColor: it.cantidad_pedida > 0 ? "#86EFAC" : undefined }} /></FG>
                    </div>
                    {totalAnalisis > 0 && <div style={{ marginTop: 8, fontSize: 11, color: "var(--accent)", fontFamily: "var(--mono)" }}>→ Total análisis: {(totalAnalisis).toFixed(3)} {it.unidad_analisis || "Kg"}</div>}
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <button onClick={() => setItemsManuales([...itemsManuales, blankManual()])} style={{ background: "transparent", color: "var(--blue)", border: "2px dashed var(--blue)", borderRadius: "var(--r)", padding: "10px 24px", fontFamily: "var(--sans)", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>+ Agregar otro ítem manual</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="filter-row" style={{ marginBottom: 12 }}>
            <input className="filter-input" placeholder="🔍 Buscar ítem..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <select className="filter-select" value={filtroTemp} onChange={e => setFiltroTemp(e.target.value)}>
              <option value="">Todas las temperaturas</option>
              {temperaturas.map(t => <option key={t}>{t}</option>)}
            </select>
            {(filtroTemp || busqueda) && <button className="btn btn-ghost btn-sm" onClick={() => { setFiltroTemp(""); setBusqueda(""); }}>✕</button>}
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{itemsFiltrados.length} visibles</span>
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 90 }}>
            <div className="table-wrap">
              <table className="tracker-table">
                <thead><tr><th>Temp.</th><th>Categoría</th><th>Descripción</th><th>Unidad pedido</th><th>× Kg/L</th><th style={{ width: 80 }}>Stock</th><th style={{ width: 100 }}>Pedido</th><th>Total</th><th>Análisis/PAX/día</th></tr></thead>
                <tbody>
                  {itemsFiltrados.map(it => {
                    const total = (it.stock_actual || 0) + (it.cantidad_pedida || 0);
                    const totalAnalisis = total * (it.volumen_peso || 1);
                    const porPaxDia = paxDias > 0 ? totalAnalisis / paxDias : 0;
                    return (
                      <tr key={it.catalogo_id} style={{ background: it.cantidad_pedida > 0 ? "#F0FDF4" : "inherit" }}>
                        <td><TempBadge temp={it.temperatura} /></td>
                        <td style={{ fontSize: 11, color: "var(--muted)" }}>{it.categoria}</td>
                        <td style={{ fontWeight: it.cantidad_pedida > 0 ? 600 : 400, fontSize: 12 }}>{it.descripcion}</td>
                        <td style={{ fontSize: 11, color: "var(--muted)" }}>{it.unidad}</td>
                        <td style={{ fontSize: 10, color: "var(--muted2)", fontFamily: "var(--mono)" }}>{it.volumen_peso !== 1 ? `×${it.volumen_peso}` : "—"} {it.unidad_analisis || "Kg"}</td>
                        <td><input type="number" min={0} value={it.stock_actual || ""} placeholder="0" onChange={e => setItem(it.catalogo_id, "stock_actual", e.target.value)} style={{ width: 70, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", fontFamily: "var(--mono)", fontSize: 12, padding: "4px 8px", outline: "none", textAlign: "right" }} /></td>
                        <td><input type="number" min={0} value={it.cantidad_pedida || ""} placeholder="0" onChange={e => setItem(it.catalogo_id, "cantidad_pedida", e.target.value)} style={{ width: 80, background: it.cantidad_pedida > 0 ? "#DCFCE7" : "var(--surface)", border: `1px solid ${it.cantidad_pedida > 0 ? "#86EFAC" : "var(--border)"}`, borderRadius: "var(--r)", fontFamily: "var(--mono)", fontSize: 12, padding: "4px 8px", outline: "none", textAlign: "right", fontWeight: it.cantidad_pedida > 0 ? 700 : 400 }} /></td>
                        <td className="text-mono" style={{ fontSize: 11, color: total > 0 ? "var(--navy)" : "var(--muted2)" }}>{total > 0 ? total : "—"}</td>
                        <td className="text-mono" style={{ fontSize: 11, color: porPaxDia > 0 ? "var(--accent)" : "var(--muted2)" }}>{porPaxDia > 0 ? porPaxDia.toFixed(3) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="form-step2-bar" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--navy)", borderTop: "2px solid rgba(255,255,255,.15)", padding: "12px 28px", display: "flex", alignItems: "center", gap: 16, zIndex: 50 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {itemsConPedido.length === 0 ? <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>Sin ítems seleccionados</span> :
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[...new Set(itemsConPedido.map(it => it.categoria))].map(cat => (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.5)" }}>{cat}</span>
                  <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, color: "#fff", background: "rgba(255,255,255,.15)", borderRadius: 4, padding: "1px 6px" }}>{itemsConPedido.filter(it => it.categoria === cat).length}</span>
                </div>
              ))}
            </div>
          }
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "var(--mono)" }}>{itemsConPedido.length} ítem{itemsConPedido.length !== 1 ? "s" : ""}</div>
          <button className="btn btn-ghost" onClick={() => setStep(1)} style={{ color: "rgba(255,255,255,.7)", borderColor: "rgba(255,255,255,.2)" }}>← Volver</button>
          <button className="btn" onClick={() => handleGuardar("borrador")} disabled={saving} style={{ background: "rgba(255,255,255,.15)", color: "#fff", borderColor: "rgba(255,255,255,.2)" }}>Guardar borrador</button>
          <button className="btn btn-success" onClick={() => handleGuardar("enviado")} disabled={saving || itemsConPedido.length === 0}>{saving ? "Enviando..." : "✓ Enviar al comprador"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE: NUEVO PEDIDO ───────────────────────────────────────────────────────
function PageNuevo({ notify, onSaved, onCancel }) {
  const [catalogo, setCatalogo] = useState([]);
  const [parametros, setParametros] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { Promise.all([api.getCatalogo(), api.getParametros()]).then(([cat, par]) => { setCatalogo(cat); setParametros(par); setLoading(false); }); }, []);
  if (loading) return <div className="loading"><span className="spin">◌</span> Cargando catálogo...</div>;
  return <FormPedido catalogoInicial={catalogo} parametros={parametros} onSave={async (cab, items) => { await api.crearPedido(cab, items); onSaved(); }} onCancel={onCancel} notify={notify} />;
}

// ─── MODAL: REVISAR PEDIDO ────────────────────────────────────────────────────
function ModalRevisar({ pedido, onClose, onActualizado, notify }) {
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState("detalle");
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [saving, setSaving] = useState(false);
  const [itemsEdit, setItemsEdit] = useState([]);

  useEffect(() => {
    const raw = (pedido.viveres_pedido_items || [])
      .filter(it => it.cantidad_pedida > 0)
      .map(it => ({ ...it, _cantidadOriginal: it.cantidad_pedida, _eliminado: false }));
    setItemsEdit(raw);
    setLoading(false);
  }, [pedido]);

  const itemsVisibles = itemsEdit.filter(it => !it._eliminado);
  const huboCambios = itemsEdit.some(
    it => it._eliminado || it.cantidad_pedida !== it._cantidadOriginal
  );

  const setCantidad = (id, val) => {
    setItemsEdit(prev =>
      prev.map(it => it.id === id ? { ...it, cantidad_pedida: parseFloat(val) || 0 } : it)
    );
  };

  const eliminarItem = (id) => {
    setItemsEdit(prev =>
      prev.map(it => it.id === id ? { ...it, _eliminado: true } : it)
    );
  };

  const restaurarItem = (id) => {
    setItemsEdit(prev =>
      prev.map(it => it.id === id ? { ...it, _eliminado: false, cantidad_pedida: it._cantidadOriginal } : it)
    );
  };

  const handleAprobar = async () => {
    if (itemsVisibles.length === 0) {
      alert("No quedan ítems en el pedido. Rechazalo en cambio.");
      return;
    }
    setSaving(true);
    try {
      const itemsAGuardar = itemsVisibles.map(
        ({ _cantidadOriginal, _eliminado, ...rest }) => rest
      );
      await api.actualizarItems(pedido.id, itemsAGuardar);
      await api.actualizarPedido(pedido.id, {
        status: "aprobado",
        fecha_aprobacion: new Date().toISOString(),
        tracker_status: "pendiente",
      });
      notify("Pedido aprobado", "success");
      onActualizado();
    } catch (e) {
      notify("Error: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRechazar = async () => {
    if (!motivoRechazo.trim()) return alert("Ingresá un motivo");
    setSaving(true);
    try {
      await api.actualizarPedido(pedido.id, {
        status: "rechazado",
        observaciones: motivoRechazo,
      });
      notify("Pedido rechazado", "warn");
      onActualizado();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="overlay">
      <div className="modal">
        <div className="mbody"><div className="loading"><span className="spin">◌</span></div></div>
      </div>
    </div>
  );

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        {/* HEADER */}
        <div className="mhdr">
          <div>
            <div className="mtitle">🚢 {pedido.base_buque} — Pedido de Víveres</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              Parana Logística · {pedido.pax} PAX · {pedido.dias} días · {pedido.solicitado_por}
              {pedido.fecha_necesaria && (
                <span style={{ color: "var(--warn)", marginLeft: 8 }}>Nec: {fmtDate(pedido.fecha_necesaria)}</span>
              )}
            </div>
          </div>
          <button className="mclose" onClick={onClose}>✕</button>
        </div>

        {/* BODY */}
        <div className="mbody">
          <div className="tabs-row">
            <div className={`tab ${modo === "detalle" ? "active" : ""}`} onClick={() => setModo("detalle")}>Detalle</div>
            <div
              className={`tab ${modo === "rechazar" ? "active" : ""}`}
              onClick={() => setModo("rechazar")}
              style={{ color: modo === "rechazar" ? "var(--danger)" : undefined, borderBottomColor: modo === "rechazar" ? "var(--danger)" : undefined }}
            >
              Rechazar
            </div>
          </div>

          {/* TAB DETALLE */}
          {modo === "detalle" && (
            <div>
              {huboCambios && (
                <div className="info-box warn mb12" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>⚠️</span>
                  <span>Hay <strong>modificaciones sin aprobar</strong>. Usá "✓ Aprobar" para confirmarlas.</span>
                </div>
              )}

              <div className="table-wrap">
                <table className="items-edit">
                  <thead>
                    <tr>
                      <th>Categoría</th>
                      <th>Temp.</th>
                      <th>Descripción</th>
                      <th>Unidad</th>
                      <th style={{ width: 90, textAlign: "right" }}>Cant. original</th>
                      <th style={{ width: 120, textAlign: "right" }}>Cant. aprobada</th>
                      <th style={{ width: 32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsEdit.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--muted2)" }}>Sin ítems pedidos</td>
                      </tr>
                    ) : (
                      itemsEdit.map(it => {
                        const modificado = !it._eliminado && it.cantidad_pedida !== it._cantidadOriginal;
                        return (
                          <tr
                            key={it.id}
                            style={{
                              opacity: it._eliminado ? 0.45 : 1,
                              background: it._eliminado ? "#FEF2F2" : modificado ? "#FFFBEB" : "inherit",
                              transition: "all .15s",
                            }}
                          >
                            <td style={{ fontSize: 11, color: "var(--muted)" }}>{it.categoria}</td>
                            <td><TempBadge temp={it.temperatura} /></td>
                            <td style={{
                              fontWeight: 500, fontSize: 12,
                              textDecoration: it._eliminado ? "line-through" : "none",
                              color: it._eliminado ? "var(--muted2)" : "var(--text)",
                            }}>
                              {it.descripcion}
                            </td>
                            <td style={{ fontSize: 11, color: "var(--muted)" }}>{it.unidad}</td>
                            {/* Cantidad original */}
                            <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
                              {it._cantidadOriginal}
                            </td>
                            {/* Cantidad editable */}
                            <td>
                              {it._eliminado ? (
                                <button
                                  onClick={() => restaurarItem(it.id)}
                                  style={{ background: "none", border: "1px solid var(--border)", borderRadius: "var(--r)", fontSize: 10, color: "var(--muted)", cursor: "pointer", padding: "3px 8px", fontFamily: "var(--sans)" }}
                                >
                                  ↩ Restaurar
                                </button>
                              ) : (
                                <div style={{ position: "relative" }}>
                                  <input
                                    type="number"
                                    min={0}
                                    value={it.cantidad_pedida}
                                    onChange={e => setCantidad(it.id, e.target.value)}
                                    style={{
                                      width: "100%",
                                      background: modificado ? "#FEF9C3" : "var(--surface)",
                                      border: `1px solid ${modificado ? "#FDE68A" : "var(--border)"}`,
                                      borderRadius: "var(--r)",
                                      fontFamily: "var(--mono)",
                                      fontSize: 12,
                                      fontWeight: modificado ? 700 : 400,
                                      padding: "5px 8px",
                                      outline: "none",
                                      textAlign: "right",
                                      color: modificado ? "#92400E" : "var(--text)",
                                    }}
                                  />
                                  {modificado && (
                                    <span
                                      title="Cantidad modificada"
                                      style={{ position: "absolute", right: -8, top: -6, width: 8, height: 8, borderRadius: "50%", background: "var(--warn)", display: "block" }}
                                    />
                                  )}
                                </div>
                              )}
                            </td>
                            {/* Botón eliminar */}
                            <td>
                              {!it._eliminado && (
                                <button
                                  onClick={() => eliminarItem(it.id)}
                                  title="Eliminar ítem"
                                  style={{ background: "none", border: "none", color: "var(--muted2)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "2px 4px", borderRadius: 4, transition: "color .12s" }}
                                  onMouseEnter={e => e.currentTarget.style.color = "var(--danger)"}
                                  onMouseLeave={e => e.currentTarget.style.color = "var(--muted2)"}
                                >
                                  ✕
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Resumen */}
              {itemsEdit.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", display: "flex", gap: 16 }}>
                  <span>{itemsVisibles.length} ítem{itemsVisibles.length !== 1 ? "s" : ""} activos</span>
                  {itemsEdit.filter(it => it._eliminado).length > 0 && (
                    <span style={{ color: "var(--danger)" }}>
                      {itemsEdit.filter(it => it._eliminado).length} eliminado{itemsEdit.filter(it => it._eliminado).length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {itemsEdit.filter(it => !it._eliminado && it.cantidad_pedida !== it._cantidadOriginal).length > 0 && (
                    <span style={{ color: "var(--warn)" }}>
                      {itemsEdit.filter(it => !it._eliminado && it.cantidad_pedida !== it._cantidadOriginal).length} modificado{itemsEdit.filter(it => !it._eliminado && it.cantidad_pedida !== it._cantidadOriginal).length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              )}

              <div className="mt12 flex-gap">
                <button className="btn btn-ghost btn-sm" onClick={() => exportarParaProveedor(pedido, itemsVisibles)}>
                  ↓ Exportar para proveedor
                </button>
              </div>
            </div>
          )}

          {/* TAB RECHAZAR */}
          {modo === "rechazar" && (
            <div>
              <div className="info-box mb12" style={{ fontSize: 12, borderLeft: "3px solid var(--danger)", background: "#FEF2F2" }}>
                El pedido quedará registrado como rechazado.
              </div>
              <FG label="Motivo *">
                <textarea value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} placeholder="Explicá por qué se rechaza..." style={{ minHeight: 100 }} />
              </FG>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="mftr">
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          {modo === "rechazar" && (
            <button className="btn btn-danger" onClick={handleRechazar} disabled={saving || !motivoRechazo.trim()}>
              {saving ? "..." : "✕ Confirmar rechazo"}
            </button>
          )}
          {modo === "detalle" && (
            <button
              className="btn btn-success"
              onClick={handleAprobar}
              disabled={saving || itemsVisibles.length === 0}
            >
              {saving ? "Aprobando..." : huboCambios ? "✓ Aprobar con cambios" : "✓ Aprobar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: TRACKER EDITAR ────────────────────────────────────────────────────
function ModalTrackerEditar({ pedido, onClose, onSave, notify }) {
  const remitoInputId = `remito-input-${pedido.id}`;
  const [form, setForm] = useState({
    tracker_status: pedido.tracker_status || "pendiente",
    nro_remito: pedido.nro_remito || "",
    fecha_entrega: pedido.fecha_entrega ? pedido.fecha_entrega.slice(0, 10) : "",
    tracker_notas: pedido.tracker_notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleUploadRemito = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await api.subirRemito(file, pedido.id);
      const updated = await api.actualizarPedido(pedido.id, { remito_url: url, nro_remito: form.nro_remito || file.name });
      notify("Remito adjuntado", "success");
      onSave(updated);
    } catch (e) { notify("Error al subir remito: " + e.message, "error"); }
    finally { setUploading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cambios = {
        tracker_status: form.tracker_status,
        nro_remito: form.nro_remito || null,
        tracker_notas: form.tracker_notas || null,
        fecha_entrega: form.fecha_entrega ? new Date(form.fecha_entrega).toISOString() : null,
      };
      const updated = await api.actualizarPedido(pedido.id, cambios);
      notify("Tracker actualizado", "success");
      onSave(updated);
    } finally { setSaving(false); }
  };

  const items = (pedido.viveres_pedido_items || []).filter(it => it.cantidad_pedida > 0);

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="mhdr">
          <div>
            <div className="mtitle">📊 Tracker — {pedido.base_buque}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Parana Logística · {pedido.pax} PAX · {pedido.dias} días · {pedido.solicitado_por}</div>
          </div>
          <button className="mclose" onClick={onClose}>✕</button>
        </div>
        <div className="mbody">
          <div className="fecha-chain">
            <div className={`fecha-step ${pedido.created_at ? "done" : ""}`}>
              <div style={{ fontSize: 20 }}>📋</div>
              <div className="fecha-step-label">Solicitud</div>
              <div className="fecha-step-val">{pedido.created_at ? fmtDate(pedido.created_at) : "—"}</div>
            </div>
            <div className="fecha-arrow">→</div>
            <div className={`fecha-step ${pedido.fecha_aprobacion ? "done" : ""}`}>
              <div style={{ fontSize: 20 }}>✅</div>
              <div className="fecha-step-label">Aprobación</div>
              <div className="fecha-step-val">{pedido.fecha_aprobacion ? fmtDate(pedido.fecha_aprobacion) : "—"}</div>
            </div>
            <div className="fecha-arrow">→</div>
            <div className={`fecha-step ${pedido.fecha_entrega ? "done" : ""}`}>
              <div style={{ fontSize: 20 }}>📦</div>
              <div className="fecha-step-label">Entrega</div>
              <div className="fecha-step-val">{pedido.fecha_entrega ? fmtDate(pedido.fecha_entrega) : "—"}</div>
            </div>
          </div>

          <div className="form-section">Estado</div>
          <div className="form-grid">
            <FG label="Estado del pedido">
              <select value={form.tracker_status} onChange={e => set("tracker_status", e.target.value)}>
                <option value="pendiente">Pendiente</option>
                <option value="en_camino">En camino</option>
                <option value="entregado">Entregado</option>
              </select>
            </FG>
            <FG label="Fecha de entrega"><input type="date" value={form.fecha_entrega} onChange={e => set("fecha_entrega", e.target.value)} /></FG>
          </div>

          <div className="form-section">Remito</div>
          <div className="form-grid">
            <FG label="N° Remito"><input value={form.nro_remito} onChange={e => set("nro_remito", e.target.value)} placeholder="Ej: 0001-00001234" /></FG>
            <FG label="Remito firmado (PDF / imagen)">
              {pedido.remito_url
                ? <a href={pedido.remito_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--blue)", display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>📎 Ver remito adjunto</a>
                : <>
                    <input type="file" id={remitoInputId} accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => handleUploadRemito(e.target.files[0])} />
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => document.getElementById(remitoInputId).click()} disabled={uploading}>
                      {uploading ? "⏳ Subiendo..." : "📎 Adjuntar remito"}
                    </button>
                  </>
              }
            </FG>
          </div>

          <FG label="Notas" full><textarea value={form.tracker_notas} onChange={e => set("tracker_notas", e.target.value)} placeholder="Observaciones sobre la entrega..." style={{ minHeight: 60 }} /></FG>

          {items.length > 0 && <>
            <div className="form-section">Ítems del pedido ({items.length})</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Categoría</th><th>Descripción</th><th>Cant.</th><th>Unidad</th></tr></thead>
                <tbody>
                  {items.map((it, i) => <tr key={i}><td style={{ fontSize: 11, color: "var(--muted)" }}>{it.categoria}</td><td style={{ fontWeight: 500, fontSize: 12 }}>{it.descripcion}</td><td className="text-mono" style={{ fontWeight: 700, color: "var(--accent2)" }}>{it.cantidad_pedida}</td><td style={{ fontSize: 11, color: "var(--muted)" }}>{it.unidad}</td></tr>)}
                </tbody>
              </table>
            </div>
          </>}
        </div>
        <div className="mftr">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE: TRACKER ────────────────────────────────────────────────────────────
function PageTracker({ notify }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroBase, setFiltroBase] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setPedidos(await api.getPedidos({ statuses: ["aprobado", "enviado"] })); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtrados = pedidos.filter(p => {
    if (filtroStatus && (p.tracker_status || "pendiente") !== filtroStatus) return false;
    if (filtroBase && p.base_buque !== filtroBase) return false;
    return true;
  });

  const bases = [...new Set(pedidos.map(p => p.base_buque).filter(Boolean))].sort();
  const stats = {
    total: pedidos.length,
    pendiente: pedidos.filter(p => !p.tracker_status || p.tracker_status === "pendiente").length,
    en_camino: pedidos.filter(p => p.tracker_status === "en_camino").length,
    entregado: pedidos.filter(p => p.tracker_status === "entregado").length,
  };

  return (
    <div>
      <div className="stats">
        {[
          { label: "Total aprobados", val: stats.total, color: "var(--blue)" },
          { label: "Pendientes", val: stats.pendiente, color: "var(--warn)" },
          { label: "En camino", val: stats.en_camino, color: "var(--blue)" },
          { label: "Entregados", val: stats.entregado, color: "var(--accent2)" },
        ].map(s => (
          <div key={s.label} className="stat">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="filter-row">
        <select className="filter-select" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_camino">En camino</option>
          <option value="entregado">Entregado</option>
        </select>
        <select className="filter-select" value={filtroBase} onChange={e => setFiltroBase(e.target.value)}>
          <option value="">Todos los barcos</option>
          {bases.map(b => <option key={b}>{b}</option>)}
        </select>
        {(filtroStatus || filtroBase) && <button className="btn btn-ghost btn-sm" onClick={() => { setFiltroStatus(""); setFiltroBase(""); }}>✕ Limpiar</button>}
        <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{filtrados.length} de {pedidos.length}</span>
      </div>

      {loading ? <div className="loading"><span className="spin">◌</span></div> :
        filtrados.length === 0 ? <div className="empty-state"><div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>Sin pedidos aprobados</div> :
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Base/Barco</th>
                  <th>PAX × Días</th>
                  <th>Solicitante</th>
                  <th>Estado</th>
                  <th>📋 Solicitud</th>
                  <th>✅ Aprobación</th>
                  <th>📦 Entrega</th>
                  <th>Remito</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const st = p.tracker_status || "pendiente";
                  const stInfo = TRACKER_STATUS[st] || { label: st, color: "b-gray" };
                  return (
                    <tr key={p.id} className="click" onClick={() => setSelected(p)}>
                      <td style={{ fontWeight: 600, fontSize: 12 }}>{p.base_buque}</td>
                      <td className="text-mono" style={{ fontSize: 11, color: "var(--muted)" }}>{p.pax} × {p.dias}</td>
                      <td style={{ fontSize: 12 }}>{p.solicitado_por}</td>
                      <td><span className={`badge ${stInfo.color}`}>{stInfo.label}</span></td>
                      <td className="text-mono" style={{ fontSize: 11, color: "var(--muted)" }}>{p.created_at ? fmtDate(p.created_at) : "—"}</td>
                      <td className="text-mono" style={{ fontSize: 11, color: p.fecha_aprobacion ? "var(--accent2)" : "var(--muted2)" }}>{p.fecha_aprobacion ? fmtDate(p.fecha_aprobacion) : "—"}</td>
                      <td className="text-mono" style={{ fontSize: 11, color: p.fecha_entrega ? "var(--accent2)" : "var(--muted2)" }}>{p.fecha_entrega ? fmtDate(p.fecha_entrega) : "—"}</td>
                      <td>{p.remito_url
                        ? <a href={p.remito_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: "var(--blue)" }}>📎 {p.nro_remito || "Ver"}</a>
                        : <span style={{ fontSize: 11, color: "var(--muted2)" }}>{p.nro_remito || "—"}</span>
                      }</td>
                      <td style={{ fontSize: 11, color: "var(--muted)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.tracker_notas || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      }
      {selected && <ModalTrackerEditar pedido={selected} onClose={() => setSelected(null)} onSave={(updated) => { setSelected(null); setPedidos(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p)); }} notify={notify} />}
    </div>
  );
}

// ─── PAGE: INBOX ──────────────────────────────────────────────────────────────
function PageInbox({ notify, onNeedRefresh }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [eliminando, setEliminando] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPedidos(await api.getPedidos({ status: "enviado" })); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEliminar = async (e, p) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar el pedido de ${p.base_buque}? Esta acción no se puede deshacer.`)) return;
    setEliminando(p.id);
    try {
      await api.eliminarPedido(p.id);
      notify("Pedido eliminado", "warn");
      load();
      onNeedRefresh();
    } catch (err) {
      notify("Error al eliminar: " + err.message, "error");
    } finally {
      setEliminando(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid var(--border)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>📬 Pedidos pendientes de aprobación</div>
        <span className="ni-badge" style={{ position: "static" }}>{pedidos.length}</span>
      </div>
      {loading ? <div className="loading"><span className="spin">◌</span></div> :
        pedidos.length === 0
          ? <div className="empty-state"><div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>Sin pedidos pendientes</div>
          : pedidos.map(p => {
              const cnt = (p.viveres_pedido_items || []).filter(it => it.cantidad_pedida > 0).length;
              return (
                <div key={p.id} className="req-row unread" onClick={() => setSelected(p)}>
                  <div className="flex-gap mb8">
                    <span className="text-mono" style={{ fontSize: 11, color: "var(--accent)" }}>{fmtDate(p.fecha_pedido)}</span>
                    <span className="badge b-blue">Víveres</span>
                    <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: "auto" }}>Parana Logística</span>
                  </div>
                  <div className="req-title">🚢 {p.base_buque} — {p.pax} PAX × {p.dias} días</div>
                  <div className="req-meta">
                    <span>{p.solicitado_por}</span><span>·</span><span>{cnt} ítems</span>
                    {p.fecha_necesaria && <><span>·</span><span style={{ color: "var(--warn)" }}>Necesario: {fmtDate(p.fecha_necesaria)}</span></>}
                  </div>
                  <div className="req-row-actions" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => handleEliminar(e, p)}
                      disabled={eliminando === p.id}
                      className="btn btn-danger btn-sm"
                    >
                      {eliminando === p.id ? "..." : "✕ Eliminar"}
                    </button>
                  </div>
                </div>
              );
            })
      }
      {selected && (
        <ModalRevisar
          pedido={selected}
          onClose={() => setSelected(null)}
          onActualizado={() => { setSelected(null); notify("Pedido actualizado", "success"); load(); onNeedRefresh(); }}
          notify={notify}
        />
      )}
    </div>
  );
}

// ─── PAGE: HISTORIAL ──────────────────────────────────────────────────────────
function PageHistorial({ onNuevo, notify }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  useEffect(() => { api.getPedidos().then(d => { setPedidos(d); setLoading(false); }); }, []);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12, justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{pedidos.length} pedidos registrados</div>
        <button className="btn btn-primary btn-sm" onClick={onNuevo}>+ Nuevo pedido</button>
      </div>
      {loading ? <div className="loading"><span className="spin">◌</span></div> :
        pedidos.length === 0 ? <div className="empty-state"><div style={{ fontSize: 28, marginBottom: 8 }}>🚢</div>Sin pedidos</div> :
        pedidos.map(p => {
          const s = STATUS_PEDIDO[p.status] || { label: p.status, color: "b-gray" };
          const cnt = (p.viveres_pedido_items || []).filter(it => it.cantidad_pedida > 0).length;
          return <div key={p.id} className="req-row" onClick={() => setSelected(p)}>
            <div className="flex-between mb8"><div className="flex-gap"><span className="text-mono" style={{ fontSize: 11, color: "var(--accent)" }}>{fmtDate(p.fecha_pedido)}</span><span className={`badge ${s.color}`}>{s.label}</span></div><span style={{ fontSize: 10, color: "var(--muted)" }}>Parana Logística</span></div>
            <div className="req-title">{p.base_buque} — {p.pax} PAX × {p.dias} días</div>
            <div className="req-meta"><span>{p.solicitado_por}</span><span>·</span><span>{cnt} ítems</span>{p.fecha_necesaria && <><span>·</span><span style={{ color: "var(--warn)" }}>Nec: {fmtDate(p.fecha_necesaria)}</span></>}</div>
          </div>;
        })
      }
      {selected && <ModalRevisar pedido={selected} onClose={() => setSelected(null)} onActualizado={() => { setSelected(null); api.getPedidos().then(d => setPedidos(d)); }} notify={notify} />}
    </div>
  );
}

// ─── PAGE: CATÁLOGO ───────────────────────────────────────────────────────────
const CATEGORIAS_CATALOGO = ["Almacén","Bebidas","Carnicería","Electro","Fiambrería","Frutas","Huevos","Lácteos","Limpieza","Pan","Pastas","Pescadería","Quesos","Snack y Postres","Verduras","Otro"];

function PageCatalogo({ notify }) {
  const [catalogo, setCatalogo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCateg, setFiltroCateg] = useState("");
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [editados, setEditados] = useState({}); // id -> campos modificados
  const [form, setForm] = useState({ codigo: "", categoria: "Almacén", subcategoria: "", temperatura: "Seco", descripcion: "", unidad: "Unidad", unidad_analisis: "Kg", volumen_peso: "1" });

  useEffect(() => { api.getCatalogo().then(d => { setCatalogo(d); setLoading(false); }); }, []);

  const categorias = [...new Set(catalogo.map(c => c.categoria))].sort();
  const filtrado = catalogo.filter(c => {
    if (filtroCateg && c.categoria !== filtroCateg) return false;
    if (busqueda && !c.descripcion.toLowerCase().includes(busqueda.toLowerCase()) && !c.codigo?.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  // Edición inline
  const setcampo = (id, campo, valor) => {
    setEditados(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [campo]: valor } }));
    setCatalogo(prev => prev.map(c => c.id === id ? { ...c, [campo]: valor } : c));
  };

  const getVal = (c, campo) => editados[c.id]?.[campo] !== undefined ? editados[c.id][campo] : c[campo];
  const tienecambios = (id) => !!editados[id] && Object.keys(editados[id]).length > 0;

  const handleGuardarFila = async (c) => {
    if (!tieneambios(c.id)) return;
    setSavingId(c.id);
    try {
      const cambios = editados[c.id];
      if (cambios.volumen_peso !== undefined) cambios.volumen_peso = parseFloat(cambios.volumen_peso) || 1;
      const { error } = await supabase.from("viveres_catalogo").update(cambios).eq("id", c.id);
      if (error) throw error;
      setEditados(prev => { const n = { ...prev }; delete n[c.id]; return n; });
      notify("Guardado", "success");
    } catch (e) {
      notify("Error: " + e.message, "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleEliminarFila = async (c) => {
    if (!window.confirm(`¿Eliminar "${c.descripcion}" del catálogo?`)) return;
    setEliminandoId(c.id);
    try {
      const { error } = await supabase.from("viveres_catalogo").delete().eq("id", c.id);
      if (error) throw error;
      setCatalogo(prev => prev.filter(x => x.id !== c.id));
      notify("Ítem eliminado", "warn");
    } catch (e) {
      notify("Error: " + e.message, "error");
    } finally {
      setEliminandoId(null);
    }
  };

  // Nuevo ítem
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleAgregar = async () => {
    if (!form.descripcion.trim()) return alert("La descripción es obligatoria");
    setSaving(true);
    try {
      const { data, error } = await supabase.from("viveres_catalogo").insert([{ ...form, volumen_peso: parseFloat(form.volumen_peso) || 1, activo: true }]).select().single();
      if (error) throw error;
      setCatalogo(prev => [...prev, data]);
      setModal(false);
      setForm({ codigo: "", categoria: "Almacén", subcategoria: "", temperatura: "Seco", descripcion: "", unidad: "Unidad", unidad_analisis: "Kg", volumen_peso: "1" });
      notify("Ítem agregado", "success");
    } catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  };

  const inStyle = {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4,
    color: "var(--text)", fontFamily: "var(--mono)", fontSize: 11, padding: "3px 6px",
    outline: "none", width: "100%",
  };
  const inStyleMod = { ...inStyle, background: "#FEF9C3", border: "1px solid #FDE68A", fontWeight: 600 };

  // helper para saber si un campo fue modificado
  const mod = (c, campo) => editados[c.id]?.[campo] !== undefined;
  // helper para guardar (typo fix)
  const tieneambios = (id) => !!editados[id] && Object.keys(editados[id]).length > 0;

  return (
    <div>
      <div className="filter-row mb12">
        <input className="filter-input" placeholder="🔍 Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ minWidth: 250 }} />
        <select className="filter-select" value={filtroCateg} onChange={e => setFiltroCateg(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c}>{c}</option>)}
        </select>
        {(busqueda || filtroCateg) && <button className="btn btn-ghost btn-sm" onClick={() => { setBusqueda(""); setFiltroCateg(""); }}>✕</button>}
        <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{filtrado.length} de {catalogo.length}</span>
        <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>+ Agregar ítem</button>
      </div>

      {Object.keys(editados).length > 0 && (
        <div className="info-box warn mb12" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚠️</span>
          <span><strong>{Object.keys(editados).length} ítem{Object.keys(editados).length !== 1 ? "s" : ""} con cambios sin guardar.</strong> Usá el botón 💾 de cada fila para guardar.</span>
        </div>
      )}

      {loading ? <div className="loading"><span className="spin">◌</span></div> :
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="items-edit">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Categoría</th>
                  <th>Temp.</th>
                  <th>Descripción</th>
                  <th>Unidad pedido</th>
                  <th>Unidad análisis</th>
                  <th>Vol/Peso</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrado.map(c => {
                  const hayC = tieneambios(c.id);
                  const guardando = savingId === c.id;
                  const eliminando = eliminandoId === c.id;
                  return (
                    <tr key={c.id} style={{ background: hayC ? "#FFFBEB" : "inherit" }}>
                      <td>
                        <input
                          value={getVal(c, "codigo") || ""}
                          onChange={e => setcampo(c.id, "codigo", e.target.value)}
                          style={mod(c, "codigo") ? inStyleMod : inStyle}
                          placeholder="—"
                        />
                      </td>
                      <td>
                        <select
                          value={getVal(c, "categoria") || ""}
                          onChange={e => setcampo(c.id, "categoria", e.target.value)}
                          style={mod(c, "categoria") ? { ...inStyleMod, fontFamily: "var(--sans)" } : { ...inStyle, fontFamily: "var(--sans)" }}
                        >
                          {CATEGORIAS_CATALOGO.map(cat => <option key={cat}>{cat}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          value={getVal(c, "temperatura") || "Seco"}
                          onChange={e => setcampo(c.id, "temperatura", e.target.value)}
                          style={mod(c, "temperatura") ? { ...inStyleMod, fontFamily: "var(--sans)" } : { ...inStyle, fontFamily: "var(--sans)" }}
                        >
                          <option>Seco</option>
                          <option>Refrigerado</option>
                          <option>Congelado</option>
                        </select>
                      </td>
                      <td style={{ minWidth: 180 }}>
                        <input
                          value={getVal(c, "descripcion") || ""}
                          onChange={e => setcampo(c.id, "descripcion", e.target.value)}
                          style={mod(c, "descripcion") ? { ...inStyleMod, fontWeight: 700 } : { ...inStyle, fontWeight: 500 }}
                        />
                      </td>
                      <td>
                        <select
                          value={getVal(c, "unidad") || "Unidad"}
                          onChange={e => setcampo(c.id, "unidad", e.target.value)}
                          style={mod(c, "unidad") ? { ...inStyleMod, fontFamily: "var(--sans)" } : { ...inStyle, fontFamily: "var(--sans)" }}
                        >
                          {UNIDADES_PEDIDO.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          value={getVal(c, "unidad_analisis") || "Kg"}
                          onChange={e => setcampo(c.id, "unidad_analisis", e.target.value)}
                          style={mod(c, "unidad_analisis") ? { ...inStyleMod, fontFamily: "var(--sans)" } : { ...inStyle, fontFamily: "var(--sans)" }}
                        >
                          {UNIDADES_ANALISIS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td style={{ width: 80 }}>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={getVal(c, "volumen_peso") ?? 1}
                          onChange={e => setcampo(c.id, "volumen_peso", e.target.value)}
                          style={mod(c, "volumen_peso") ? inStyleMod : inStyle}
                        />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          {hayC && (
                            <button
                              onClick={() => handleGuardarFila(c)}
                              disabled={guardando}
                              title="Guardar cambios"
                              style={{ background: "var(--accent2)", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 13, padding: "3px 7px", opacity: guardando ? 0.5 : 1 }}
                            >
                              {guardando ? "..." : "💾"}
                            </button>
                          )}
                          <button
                            onClick={() => handleEliminarFila(c)}
                            disabled={eliminando}
                            title="Eliminar ítem"
                            style={{ background: "none", border: "none", color: "var(--muted2)", cursor: "pointer", fontSize: 14, padding: "3px 5px", borderRadius: 4, opacity: eliminando ? 0.5 : 1, transition: "color .12s" }}
                            onMouseEnter={e => e.currentTarget.style.color = "var(--danger)"}
                            onMouseLeave={e => e.currentTarget.style.color = "var(--muted2)"}
                          >
                            {eliminando ? "..." : "✕"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      }

      {modal && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="mhdr"><div className="mtitle">Agregar ítem al catálogo</div><button className="mclose" onClick={() => setModal(false)}>✕</button></div>
            <div className="mbody">
              <div className="form-grid">
                <FG label="Código"><input value={form.codigo} onChange={e => setF("codigo", e.target.value)} placeholder="Ej: NAV001" /></FG>
                <FG label="Temperatura *"><select value={form.temperatura} onChange={e => setF("temperatura", e.target.value)}><option>Seco</option><option>Refrigerado</option><option>Congelado</option></select></FG>
                <FG label="Categoría *"><select value={form.categoria} onChange={e => setF("categoria", e.target.value)}>{CATEGORIAS_CATALOGO.map(c => <option key={c}>{c}</option>)}</select></FG>
                <FG label="Subcategoría"><input value={form.subcategoria} onChange={e => setF("subcategoria", e.target.value)} /></FG>
              </div>
              <FG label="Descripción *" full><input value={form.descripcion} onChange={e => setF("descripcion", e.target.value)} placeholder="Nombre completo del producto" /></FG>
              <div className="form-grid-3 mt12">
                <FG label="Unidad de pedido" hint="Cómo se pide al proveedor"><select value={form.unidad} onChange={e => setF("unidad", e.target.value)}>{UNIDADES_PEDIDO.map(u => <option key={u}>{u}</option>)}</select></FG>
                <FG label="Unidad de análisis" hint="Para el cálculo de dieta"><select value={form.unidad_analisis} onChange={e => setF("unidad_analisis", e.target.value)}>{UNIDADES_ANALISIS.map(u => <option key={u}>{u}</option>)}</select></FG>
                <FG label="Vol/Peso por unidad" hint="Ej: 1 lata = 0.170 Kg"><input type="number" step="0.001" min="0" value={form.volumen_peso} onChange={e => setF("volumen_peso", e.target.value)} placeholder="1" /></FG>
              </div>
              {form.volumen_peso && parseFloat(form.volumen_peso) !== 1 && (
                <div className="info-box accent mt8" style={{ fontSize: 11 }}>Ejemplo: 3 {form.unidad} → {(3 * parseFloat(form.volumen_peso)).toFixed(3)} {form.unidad_analisis}</div>
              )}
            </div>
            <div className="mftr">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAgregar} disabled={saving}>{saving ? "Guardando..." : "Agregar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
function LoginPage() {
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleLogin = async () => {
    setLoading(true); setError("");
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (e) setError("Credenciales incorrectas. Verificá tu email y contraseña.");
    } catch {
      setError("Error de conexión. Verificá tu red e intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") handleLogin(); };

  const loginCSS = `
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
    .login-page{min-height:100vh;display:flex;background:#0B1629;position:relative;overflow:hidden}
    .login-bg-overlay{position:absolute;inset:0;z-index:1;background:linear-gradient(135deg,rgba(11,22,41,0.92) 0%,rgba(11,22,41,0.75) 60%,rgba(11,22,41,0.92) 100%)}
    .login-bg-lines{position:absolute;inset:0;z-index:0;background-image:linear-gradient(rgba(26,122,110,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(26,122,110,0.06) 1px,transparent 1px);background-size:60px 60px}
    .login-split{position:relative;z-index:2;display:flex;width:100%}
    .login-left{flex:1;display:flex;flex-direction:column;justify-content:center;padding:80px 60px;border-right:1px solid rgba(26,122,110,0.2)}
    .login-left-integra-wrap{margin-bottom:8px}
    .login-left-integra-img{height:340px;width:auto;object-fit:contain;opacity:0.95}
    .login-left-divider{width:100%;height:1px;background:rgba(255,255,255,0.1);margin:8px 0 20px}
    .login-left-company{display:flex;align-items:center;gap:14px;margin-bottom:4px}
    .login-left-company-logo{width:48px;height:48px;border-radius:50%;object-fit:contain;border:1.5px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05)}
    .login-left-company-name{font-size:20px;font-weight:800;color:#fff;letter-spacing:0.5px}
    .login-left-line{width:48px;height:3px;background:#1A7A6E;margin:20px 0}
    .login-left-sub{font-size:13px;color:rgba(255,255,255,0.45);line-height:1.7;max-width:320px;font-style:italic}
    .login-right{width:440px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:60px 48px}
    .login-card{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(184,148,42,0.2);border-radius:16px;padding:40px 36px;backdrop-filter:blur(20px)}
    .login-card-eyebrow{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;color:#B8942A;text-transform:uppercase;margin-bottom:10px}
    .login-card-title{font-size:16px;font-weight:700;color:#fff;margin-bottom:4px}
    .login-card-sub{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:1px;margin-bottom:28px;text-transform:uppercase}
    .login-fg{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
    .login-fg label{font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;text-transform:uppercase;font-weight:600}
    .login-fg input{border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:11px 14px;font-size:13px;font-family:'Montserrat',sans-serif;color:#fff;background:rgba(255,255,255,0.06);outline:none;transition:border-color .15s}
    .login-fg input::placeholder{color:rgba(255,255,255,0.2)}
    .login-fg input:focus{border-color:#B8942A;background:rgba(255,255,255,0.09)}
    .login-btn{width:100%;padding:12px;margin-top:8px;background:#B8942A;color:#0B1629;border:none;border-radius:8px;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:background .15s;letter-spacing:.5px}
    .login-btn:hover{background:#D4AA3A}
    .login-btn:disabled{opacity:.5;cursor:not-allowed}
    .login-error{background:rgba(239,68,68,0.12);color:#FCA5A5;border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:10px 14px;font-size:12px;margin-bottom:14px}
    .login-footer{text-align:center;font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,0.2);margin-top:20px;letter-spacing:1px}
    .login-back{text-align:center;margin-top:12px;font-size:11px;color:rgba(255,255,255,0.3);cursor:pointer;font-family:'DM Mono',monospace}
    .login-back:hover{color:#B8942A}
    @media(max-width:768px){
      .login-split{flex-direction:column}
      .login-left{padding:48px 32px 32px;border-right:none;border-bottom:1px solid rgba(26,122,110,0.2);align-items:center;text-align:center}
      .login-left-integra-img{height:200px;max-width:90vw}
      .login-left-line{margin:16px auto}
      .login-left-sub{max-width:100%}
      .login-right{width:100%;padding:32px 24px 48px}
      .login-card{padding:28px 24px}
    }
  `;

  return (
    <>
      <style>{loginCSS}</style>
      <div className="login-page">
        <div className="login-bg-lines" />
        <div className="login-bg-overlay" />
        <div className="login-split">
          <div className="login-left">
            <div className="login-left-integra-wrap">
              <img src="/integralogo.png" alt="INTEGRA" className="login-left-integra-img" />
            </div>
            <div className="login-left-divider" />
            <div className="login-left-company">
              <img src="/PL.png" alt="Parana Logística" className="login-left-company-logo" />
              <div className="login-left-company-name">Parana Logística | Víveres</div>
            </div>
            <div className="login-left-line" />
            <div className="login-left-sub">We Find the Way, or We Make One.</div>
          </div>
          <div className="login-right">
            <div className="login-card">
              <div className="login-card-eyebrow">Parana Logística | Víveres</div>
              <div className="login-card-title">Acceso al portal</div>
              <div className="login-card-sub">Solo personal autorizado</div>
              {error && <div className="login-error">{error}</div>}
              <div className="login-fg">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKey} placeholder="usuario@paranalogistica.com.ar" autoFocus />
              </div>
              <div className="login-fg">
                <label>Contraseña</label>
                <input type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={handleKey} placeholder="••••••••" />
              </div>
              <button className="login-btn" onClick={handleLogin} disabled={loading || !email || !pass}>
                {loading ? "Ingresando..." : "Ingresar →"}
              </button>
              <div className="login-footer">Parana Logística · Acceso restringido</div>
              <div className="login-back" onClick={() => window.location.href = PORTAL_URL}>← Volver a Grupo PL</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
function ViveresApp() {
  const [page, setPage] = useState("inbox");
  const [notif, setNotif] = useState(null);
  const [inboxCount, setInboxCount] = useState(0);
  const notify = useCallback((text, type = "info") => { setNotif({ text, type }); setTimeout(() => setNotif(null), 4000); }, []);
  const loadCounts = useCallback(async () => { try { const d = await api.getPedidos({ status: "enviado" }); setInboxCount(d.length); } catch (e) { console.error(e); } }, []);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const pageTitles = { nuevo: "VÍVERES — NUEVO PEDIDO", inbox: "VÍVERES — INBOX", historial: "VÍVERES — HISTORIAL", catalogo: "VÍVERES — CATÁLOGO", tracker: "VÍVERES — TRACKER" };

  const NI = ({ id, icon, label, badge }) => (
    <div className={`ni ${page === id ? "active" : ""}`} onClick={() => setPage(id)}>
      <span className="ni-icon">{icon}</span><span>{label}</span>
      {badge > 0 && <span className="ni-badge">{badge}</span>}
    </div>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <nav className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo-wrap">
              <img src="/PL.png" alt="Parana Logística" className="sidebar-logo-img" />
              <div><div className="sidebar-logo-main">Víveres</div><div className="sidebar-logo-sub">Parana Logística</div></div>
            </div>
          </div>
          <div className="nav-section">Gestión</div>
          <NI id="inbox"     icon="📬" label="Inbox"         badge={inboxCount} />
          <NI id="nuevo"     icon="🛒" label="Nuevo Pedido" />
          <NI id="historial" icon="📋" label="Historial" />
          <NI id="tracker"   icon="📊" label="Tracker" />
          <NI id="catalogo"  icon="📦" label="Catálogo" />
          <div style={{ flex: 1 }} />
          <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(255,255,255,.1)" }}>
            <div className="ni back" onClick={() => window.location.href = PORTAL_URL}><span className="ni-icon">←</span><span>Volver al portal</span></div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontFamily: "var(--mono)", letterSpacing: 1, marginTop: 8 }}>MÓDULO VÍVERES v2.2</div>
          </div>
        </nav>
        <div className="main">
          <div className="topbar">
            <div className="topbar-title">{pageTitles[page] || page}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--blue)", fontWeight: 700 }}>C</div>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{USUARIO}</span>
            </div>
          </div>
          <div className="content">
            {page === "inbox"     && <PageInbox notify={notify} onNeedRefresh={loadCounts} />}
            {page === "nuevo"     && <PageNuevo notify={notify} onSaved={() => { setPage("historial"); loadCounts(); }} onCancel={() => setPage("historial")} />}
            {page === "historial" && <PageHistorial onNuevo={() => setPage("nuevo")} notify={notify} />}
            {page === "tracker"   && <PageTracker notify={notify} />}
            {page === "catalogo"  && <PageCatalogo notify={notify} />}
          </div>
        </div>
      </div>
      <Notif msg={notif} onClose={() => setNotif(null)} />
      {/* Bottom nav — solo visible en mobile */}
      <nav className="mobile-nav">
        <div className={`mobile-nav-item ${page === "inbox" ? "active" : ""}`} onClick={() => setPage("inbox")}>
          <span className="mobile-nav-icon">📬</span>
          <span className="mobile-nav-label">Inbox</span>
          {inboxCount > 0 && <span className="mobile-nav-badge">{inboxCount}</span>}
        </div>
        <div className={`mobile-nav-item ${page === "nuevo" ? "active" : ""}`} onClick={() => setPage("nuevo")}>
          <span className="mobile-nav-icon">🛒</span>
          <span className="mobile-nav-label">Nuevo</span>
        </div>
        <div className={`mobile-nav-item ${page === "historial" ? "active" : ""}`} onClick={() => setPage("historial")}>
          <span className="mobile-nav-icon">📋</span>
          <span className="mobile-nav-label">Historial</span>
        </div>
        <div className={`mobile-nav-item ${page === "tracker" ? "active" : ""}`} onClick={() => setPage("tracker")}>
          <span className="mobile-nav-icon">📊</span>
          <span className="mobile-nav-label">Tracker</span>
        </div>
        <div className={`mobile-nav-item ${page === "catalogo" ? "active" : ""}`} onClick={() => setPage("catalogo")}>
          <span className="mobile-nav-icon">📦</span>
          <span className="mobile-nav-label">Catálogo</span>
        </div>
      </nav>
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#213363" }}>
      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:3, textTransform:"uppercase" }}>Cargando...</div>
    </div>
  );

  if (!session) return <LoginPage />;

  return <ViveresApp />;
}
