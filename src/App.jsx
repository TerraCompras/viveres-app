import { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./lib/supabase";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const USUARIO = "Comprador";
const EMPRESAS = ["Parana Logistica", "Clean Sea", "Terra Mare"];
const BASES_POR_EMPRESA = {
  "Parana Logistica": ["Golondrina de Mar", "Atlantic Dama", "Quequen", "Buenos Aires"],
  "Clean Sea": ["Clean Sea I", "Clean Sea II", "Base Quequen"],
  "Terra Mare": ["Oficina Central", "Base Mar del Plata"],
};
const PLAZO_PAGO_OPTIONS = ["Contado", "15 días", "30 días", "45 días", "60 días", "90 días"];

const TEMP_COLOR = {
  "Seco":        { bg: "#FEF9C3", color: "#92400E", border: "#FDE68A", dot: "#EAB308" },
  "Refrigerado": { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE", dot: "#3B82F6" },
  "Congelado":   { bg: "#EDE9FE", color: "#4C1D95", border: "#DDD6FE", dot: "#8B5CF6" },
  "Congelados":  { bg: "#EDE9FE", color: "#4C1D95", border: "#DDD6FE", dot: "#8B5CF6" },
};

const CATEGORIA_A_GRUPO_DIETA = {
  "Carnicería": "Carniceria",
  "Fiambrería": "Fiambreria",
  "Pescadería": "Pescaderia",
  "Verdulería": "Verduras",
};

const STATUS_PEDIDO = {
  borrador: { label: "Borrador",              color: "b-gray" },
  enviado:  { label: "Enviado al comprador",  color: "b-blue" },
  aprobado: { label: "Aprobado",              color: "b-green" },
  rechazado:{ label: "Rechazado",             color: "b-red" },
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt = (n, cur = "ARS") =>
  n != null ? new Intl.NumberFormat("es-AR", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n) : "—";
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
    if (filtros.empresa) q = q.eq("empresa", filtros.empresa);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async crearPedido(pedido, items) {
    const payload = { ...pedido, fecha_pedido: pedido.fecha_pedido || null, fecha_necesaria: pedido.fecha_necesaria || null };
    const { data: nuevo, error } = await supabase.from("viveres_pedidos").insert([payload]).select().single();
    if (error) throw error;
    if (items?.length) {
      await supabase.from("viveres_pedido_items").insert(items.map(it => ({ ...it, pedido_id: nuevo.id })));
    }
    return nuevo;
  },
  async actualizarPedido(id, cambios) {
    const { data, error } = await supabase.from("viveres_pedidos").update({ ...cambios, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async actualizarItems(pedidoId, items) {
    await supabase.from("viveres_pedido_items").delete().eq("pedido_id", pedidoId);
    if (items?.length) await supabase.from("viveres_pedido_items").insert(items.map(it => ({ ...it, pedido_id: pedidoId })));
  },
  async crearRequisicion(req, items) {
    const { data: nueva, error } = await supabase.from("requisiciones").insert([{ ...req, status: "pendiente_revision" }]).select().single();
    if (error) throw error;
    if (items?.length) {
      await supabase.from("requisicion_items").insert(items.map((it, i) => ({ ...it, requisicion_id: nueva.id, nro_linea: i + 1 })));
    }
    await supabase.from("requisicion_historial").insert([{ requisicion_id: nueva.id, evento: "Requisición de víveres creada", usuario: USUARIO, status_nuevo: "pendiente_revision" }]);
    return nueva;
  },
};

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#213363;--blue:#235C96;--mid:#6381A7;--light:#A5B5CC;
  --bg:#F0F4F8;--surface:#FFF;--surface2:#F5F7FA;--border:#D6E0ED;--border2:#B0C4D8;
  --text:#213363;--muted:#6381A7;--muted2:#8FA3BC;--accent:#235C96;--accent2:#1E7E4A;
  --warn:#B07D0A;--danger:#C0392B;--teal:#1A7A6E;
  --sans:'Montserrat',sans-serif;--mono:'DM Mono',monospace;--r:6px;--r2:10px;
}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.5;min-height:100vh}
.app{display:flex;min-height:100vh}
.sidebar{width:235px;min-width:235px;background:var(--navy);display:flex;flex-direction:column;box-shadow:2px 0 8px rgba(33,51,99,.15)}
.sidebar-header{border-bottom:1px solid rgba(255,255,255,.1)}
.sidebar-logo-wrap{padding:20px 18px 16px;display:flex;align-items:center;gap:12px}
.sidebar-logo{width:36px;height:36px;background:rgba(255,255,255,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px}
.sidebar-logo-main{font-size:13px;font-weight:700;color:#fff;letter-spacing:2px;text-transform:uppercase}
.sidebar-logo-sub{font-size:9px;color:rgba(255,255,255,.5);letter-spacing:.5px}
.nav-section{padding:12px 18px 4px;font-family:var(--mono);font-size:9px;letter-spacing:2px;color:rgba(255,255,255,.35);text-transform:uppercase}
.ni{display:flex;align-items:center;gap:9px;padding:7px 18px;font-size:12px;font-weight:500;cursor:pointer;color:rgba(255,255,255,.6);border-left:3px solid transparent;transition:all .12s;user-select:none}
.ni:hover{color:#fff;background:rgba(255,255,255,.06)}
.ni.active{color:#fff;border-left-color:var(--light);background:rgba(255,255,255,.1);font-weight:600}
.ni-icon{font-size:13px;width:16px;text-align:center;flex-shrink:0}
.ni-badge{margin-left:auto;background:var(--danger);color:#fff;font-family:var(--mono);font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;min-width:18px;text-align:center}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:13px 28px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 3px rgba(33,51,99,.06)}
.topbar-title{font-size:12px;font-weight:600;letter-spacing:1px;color:var(--navy);text-transform:uppercase}
.content{flex:1;overflow-y:auto;padding:24px 28px;background:var(--bg)}
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
.btn-warn{background:transparent;color:var(--warn);border-color:#FDE68A}.btn-warn:hover{background:#FEF3C7}
.btn-sm{padding:4px 10px;font-size:10px}
.btn:disabled{opacity:.4;cursor:not-allowed}
.overlay{position:fixed;inset:0;background:rgba(33,51,99,.5);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:20px;overflow-y:auto;animation:fadeIn .15s}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:12px;width:100%;max-width:860px;margin:auto;animation:slideUp .2s;box-shadow:0 8px 32px rgba(33,51,99,.18)}
.modal-lg{max-width:960px}
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
td{padding:11px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr.click:hover td{background:var(--surface2);cursor:pointer}
.tracker-table th{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;padding:10px 12px;background:var(--surface2);border-bottom:2px solid var(--border);white-space:nowrap}
.tracker-table td{padding:11px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
.tracker-table tr:hover td{background:var(--surface2);cursor:pointer}
.filter-row{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center}
.filter-input{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--sans);font-size:11px;padding:6px 10px;outline:none;min-width:130px}
.filter-input:focus{border-color:var(--blue)}
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
.flex-gap{display:flex;gap:8px;align-items:center}
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
`;

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
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

// ─── PAGE: NUEVO PEDIDO ───────────────────────────────────────────────────────
function PageNuevo({ notify, onSaved, onCancel }) {
  const [step, setStep] = useState(1);
  const [catalogo, setCatalogo] = useState([]);
  const [parametros, setParametros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [cabecera, setCabecera] = useState({
    empresa: "Parana Logistica", base_buque: "", pax: 12, dias: 15,
    fecha_pedido: new Date().toISOString().split("T")[0],
    fecha_necesaria: "", solicitado_por: "", observaciones: "", proyecto: "",
  });

  const [items, setItems] = useState([]);
  const [itemsManuales, setItemsManuales] = useState([]);
  const [filtroCateg, setFiltroCateg] = useState("");
  const [filtroTemp, setFiltroTemp] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const blankManual = () => ({ id: `m_${Date.now()}_${Math.random()}`, descripcion: "", categoria: "Almacén", temperatura: "Seco", unidad: "Unidad", stock_actual: 0, cantidad_pedida: 0, catalogo_id: null, volumen_peso: 1 });

  useEffect(() => {
    Promise.all([api.getCatalogo(), api.getParametros()]).then(([cat, par]) => {
      setCatalogo(cat);
      setItems(cat.map(c => ({ catalogo_id: c.id, descripcion: c.descripcion, categoria: c.categoria, subcategoria: c.subcategoria || "", temperatura: c.temperatura || "", unidad: c.unidad || "Unidad", volumen_peso: c.volumen_peso || 1, stock_actual: 0, cantidad_pedida: 0 })));
      setParametros(par);
      setLoading(false);
    });
  }, []);

  const setCab = (k, v) => setCabecera(c => ({ ...c, [k]: v }));
  const setItem = (id, k, v) => setItems(prev => prev.map(it => it.catalogo_id === id ? { ...it, [k]: parseFloat(v) || 0 } : it));
  const paxDias = (cabecera.pax || 0) * (cabecera.dias || 0);

  const calcDieta = () => {
    const grupos = {};
    items.forEach(it => {
      const total = (it.stock_actual || 0) + (it.cantidad_pedida || 0);
      const kgTotal = total * (it.volumen_peso || 1);
      const kgPaxDia = paxDias > 0 ? kgTotal / paxDias : 0;
      grupos[it.categoria] = (grupos[it.categoria] || 0) + kgPaxDia;
    });
    return grupos;
  };

  const dietaActual = calcDieta();

  const itemsConPedido = [
    ...items.filter(it => it.cantidad_pedida > 0),
    ...itemsManuales.filter(it => it.cantidad_pedida > 0 && it.descripcion.trim()),
  ];

  const itemsFiltrados = items.filter(it => {
    if (filtroCateg && filtroCateg !== "__manual__" && it.categoria !== filtroCateg) return false;
    if (filtroTemp && it.temperatura !== filtroTemp) return false;
    if (busqueda && !it.descripcion.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  const categorias = [...new Set(catalogo.map(c => c.categoria))].sort();
  const temperaturas = [...new Set(catalogo.map(c => c.temperatura).filter(Boolean))];

  const handleGuardar = async (status = "borrador") => {
    if (!cabecera.base_buque || !cabecera.solicitado_por) { alert("Completá Base/Buque y Solicitado por"); return; }
    setSaving(true);
    try {
      const itemsAGuardar = [
        ...items.filter(it => it.cantidad_pedida > 0 || it.stock_actual > 0),
        ...itemsManuales.filter(it => it.descripcion.trim() && (it.cantidad_pedida > 0 || it.stock_actual > 0)),
      ];
      const pedido = await api.crearPedido({ ...cabecera, status }, itemsAGuardar);
      if (status === "enviado") {
        const reqItems = itemsConPedido.map(it => ({ descripcion: it.descripcion, cantidad: it.cantidad_pedida, unidad: it.unidad, stock_disponible: it.stock_actual, proveedor_sugerido: "" }));
        const req = await api.crearRequisicion({
          titulo: `Víveres ${cabecera.base_buque} — ${cabecera.pax} PAX × ${cabecera.dias} días`,
          empresa: cabecera.empresa, base_buque: cabecera.base_buque,
          area: "Catering", tipo_requisicion: "Víveres", urgencia: "Normal",
          solicitado_por: cabecera.solicitado_por,
          fecha_necesaria: cabecera.fecha_necesaria || null,
          observaciones: cabecera.observaciones || null,
        }, reqItems);
        await api.actualizarPedido(pedido.id, { requisicion_id: req.id });
        notify("Pedido enviado al Inbox del comprador", "success");
      } else {
        notify("Borrador guardado", "info");
      }
      onSaved();
    } catch (e) { console.error(e); notify("Error al guardar: " + e.message, "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading"><span className="spin">◌</span> Cargando catálogo...</div>;

  return (
    <div>
      {step === 1 && (
        <div className="card">
          <div className="card-title">Datos del pedido</div>
          <div className="form-grid-3">
            <FG label="Empresa *"><select value={cabecera.empresa} onChange={e => { setCab("empresa", e.target.value); setCab("base_buque", ""); }}>{EMPRESAS.map(e => <option key={e}>{e}</option>)}</select></FG>
            <FG label="Base / Buque *"><select value={cabecera.base_buque} onChange={e => setCab("base_buque", e.target.value)}><option value="">Seleccionar...</option>{(BASES_POR_EMPRESA[cabecera.empresa] || []).map(b => <option key={b}>{b}</option>)}</select></FG>
            <FG label="Solicitado por *"><input value={cabecera.solicitado_por} onChange={e => setCab("solicitado_por", e.target.value)} placeholder="Nombre del cocinero/encargado" /></FG>
          </div>
          <div className="form-grid">
            <FG label="PAX (personas a bordo)"><input type="number" value={cabecera.pax} onChange={e => setCab("pax", parseInt(e.target.value) || 0)} min={1} /></FG>
            <FG label="Días de navegación"><input type="number" value={cabecera.dias} onChange={e => setCab("dias", parseInt(e.target.value) || 0)} min={1} /></FG>
            <FG label="Fecha del pedido"><input type="date" value={cabecera.fecha_pedido} onChange={e => setCab("fecha_pedido", e.target.value)} /></FG>
            <FG label="Fecha necesaria"><input type="date" value={cabecera.fecha_necesaria} onChange={e => setCab("fecha_necesaria", e.target.value)} /></FG>
          </div>
          <FG label="Proyecto" hint="Recomendado para trazabilidad de costos"><input value={cabecera.proyecto} onChange={e => setCab("proyecto", e.target.value)} placeholder="Ej: OP-2026-003 Golondrina" /></FG>
          <div className="mt8">
            <FG label="Observaciones"><textarea value={cabecera.observaciones} onChange={e => setCab("observaciones", e.target.value)} placeholder="Notas adicionales para el comprador..." /></FG>
          </div>
          {cabecera.pax > 0 && cabecera.dias > 0 && (
            <div className="info-box accent mt12" style={{ fontSize: 12 }}>
              Total: <strong>{cabecera.pax} PAX × {cabecera.dias} días = {paxDias} raciones</strong>
            </div>
          )}
          <div className="flex-gap mt16" style={{ justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => { if (!cabecera.base_buque || !cabecera.solicitado_por) { alert("Completá Base/Buque y Solicitado por"); return; } setStep(2); }}>Continuar → Cargar ítems</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div className="card" style={{ margin: 0 }}>
              <div className="card-title">Datos del pedido</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>{cabecera.base_buque}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{cabecera.empresa} · {cabecera.pax} PAX · {cabecera.dias} días · <strong>{paxDias} raciones</strong></div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Por: {cabecera.solicitado_por}</div>
              {cabecera.proyecto && <div style={{ fontSize: 11, color: "var(--blue)", marginTop: 4 }}>📋 {cabecera.proyecto}</div>}
              <button className="btn btn-ghost btn-sm mt8" onClick={() => setStep(1)}>← Editar datos</button>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="card-title">Control de dieta — kg/persona/día</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {parametros.map(p => {
                  const catKey = Object.entries(CATEGORIA_A_GRUPO_DIETA).find(([, v]) => v === p.grupo)?.[0] || p.grupo;
                  const val = dietaActual[catKey] || 0;
                  const status = val === 0 ? "yellow" : val < p.min ? "red" : val > p.max ? "red" : "green";
                  const colors = { green: { bg: "#D1FAE5", color: "#065F46" }, red: { bg: "#FEE2E2", color: "#991B1B" }, yellow: { bg: "#FEF9C3", color: "#92400E" } };
                  return (
                    <div key={p.grupo} style={{ background: colors[status].bg, borderRadius: "var(--r)", padding: "5px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: colors[status].color, fontWeight: 600 }}>{p.grupo}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: colors[status].color }}>{val.toFixed(2)} / {p.max} {p.unidad_medida}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pestañas */}
          <div className="tabs-row">
            <div className={`tab ${filtroCateg === "" ? "active" : ""}`} onClick={() => setFiltroCateg("")}>Todos</div>
            {categorias.map(cat => {
              const cnt = items.filter(it => it.categoria === cat && it.cantidad_pedida > 0).length;
              return (
                <div key={cat} className={`tab ${filtroCateg === cat ? "active" : ""}`} onClick={() => setFiltroCateg(cat)}>
                  {cat}{cnt > 0 && <span style={{ marginLeft: 6, background: "var(--accent2)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 8, fontFamily: "var(--mono)" }}>{cnt}</span>}
                </div>
              );
            })}
            <div className={`tab ${filtroCateg === "__manual__" ? "active" : ""}`} onClick={() => setFiltroCateg("__manual__")} style={{ color: filtroCateg === "__manual__" ? "var(--purple)" : undefined }}>
              ✏️ Ingreso manual
              {itemsManuales.filter(it => it.cantidad_pedida > 0 && it.descripcion.trim()).length > 0 && (
                <span style={{ marginLeft: 6, background: "#6B4FA0", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 8, fontFamily: "var(--mono)" }}>{itemsManuales.filter(it => it.cantidad_pedida > 0 && it.descripcion.trim()).length}</span>
              )}
            </div>
          </div>

          {filtroCateg === "__manual__" ? (
            <div>
              <div className="info-box accent mb12" style={{ fontSize: 11 }}>Agregá ítems que no están en el catálogo estándar.</div>
              <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 80 }}>
                <div className="table-wrap">
                  <table className="items-edit">
                    <thead><tr><th>Temperatura</th><th>Categoría</th><th style={{ width: "30%" }}>Descripción</th><th>Unidad</th><th style={{ width: 100 }}>Stock</th><th style={{ width: 120 }}>Pedido</th><th></th></tr></thead>
                    <tbody>
                      {itemsManuales.map((it, i) => (
                        <tr key={it.id}>
                          <td><select value={it.temperatura} onChange={e => { const arr = [...itemsManuales]; arr[i] = { ...arr[i], temperatura: e.target.value }; setItemsManuales(arr); }}><option>Seco</option><option>Refrigerado</option><option>Congelado</option></select></td>
                          <td><select value={it.categoria} onChange={e => { const arr = [...itemsManuales]; arr[i] = { ...arr[i], categoria: e.target.value }; setItemsManuales(arr); }}>{categorias.map(c => <option key={c}>{c}</option>)}<option>Otro</option></select></td>
                          <td><input value={it.descripcion} onChange={e => { const arr = [...itemsManuales]; arr[i] = { ...arr[i], descripcion: e.target.value }; setItemsManuales(arr); }} placeholder="Descripción..." /></td>
                          <td><input value={it.unidad} onChange={e => { const arr = [...itemsManuales]; arr[i] = { ...arr[i], unidad: e.target.value }; setItemsManuales(arr); }} style={{ width: 70 }} /></td>
                          <td><input type="number" min={0} value={it.stock_actual || ""} onChange={e => { const arr = [...itemsManuales]; arr[i] = { ...arr[i], stock_actual: parseFloat(e.target.value) || 0 }; setItemsManuales(arr); }} /></td>
                          <td><input type="number" min={0} value={it.cantidad_pedida || ""} onChange={e => { const arr = [...itemsManuales]; arr[i] = { ...arr[i], cantidad_pedida: parseFloat(e.target.value) || 0 }; setItemsManuales(arr); }} style={{ background: it.cantidad_pedida > 0 ? "#DCFCE7" : undefined, fontWeight: it.cantidad_pedida > 0 ? 700 : 400 }} /></td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => setItemsManuales(itemsManuales.filter((_, j) => j !== i))}>✕</button></td>
                        </tr>
                      ))}
                      {itemsManuales.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--muted2)" }}>Sin ítems manuales</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setItemsManuales([...itemsManuales, blankManual()])}>+ Agregar ítem manual</button>
            </div>
          ) : (
            <div>
              <div className="filter-row" style={{ marginBottom: 12 }}>
                <input className="filter-input" placeholder="🔍 Buscar ítem..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                <select className="filter-select" value={filtroTemp} onChange={e => setFiltroTemp(e.target.value)}>
                  <option value="">Todas las temperaturas</option>
                  {temperaturas.map(t => <option key={t}>{t}</option>)}
                </select>
                {(filtroTemp || busqueda) && <button className="btn btn-ghost btn-sm" onClick={() => { setFiltroTemp(""); setBusqueda(""); }}>✕ Limpiar</button>}
                <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{itemsFiltrados.length} visibles</span>
              </div>
              <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 80 }}>
                <div className="table-wrap">
                  <table className="tracker-table">
                    <thead><tr><th>Temp.</th><th>Categoría</th><th>Descripción</th><th>Unidad</th><th style={{ width: 100 }}>Stock actual</th><th style={{ width: 120 }}>Cantidad pedida</th><th>Total</th><th>kg/PAX/día</th></tr></thead>
                    <tbody>
                      {itemsFiltrados.map(it => {
                        const tc = TEMP_COLOR[it.temperatura] || { bg: "#F3F4F6", color: "#6B7280", border: "#E5E7EB", dot: "#9CA3AF" };
                        const total = (it.stock_actual || 0) + (it.cantidad_pedida || 0);
                        const kgPaxDia = paxDias > 0 ? (total * (it.volumen_peso || 1)) / paxDias : 0;
                        return (
                          <tr key={it.catalogo_id} style={{ background: it.cantidad_pedida > 0 ? "#F0FDF4" : "inherit" }}>
                            <td><span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: tc.color, background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 4, padding: "2px 6px" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: tc.dot, display: "inline-block" }} />{it.temperatura}</span></td>
                            <td style={{ fontSize: 11, color: "var(--muted)" }}>{it.categoria}</td>
                            <td style={{ fontWeight: it.cantidad_pedida > 0 ? 600 : 400, fontSize: 12 }}>{it.descripcion}</td>
                            <td style={{ fontSize: 11, color: "var(--muted)" }}>{it.unidad}</td>
                            <td><input type="number" min={0} value={it.stock_actual || ""} placeholder="0" onChange={e => setItem(it.catalogo_id, "stock_actual", e.target.value)} style={{ width: 80, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", fontFamily: "var(--mono)", fontSize: 12, padding: "4px 8px", outline: "none", textAlign: "right" }} /></td>
                            <td><input type="number" min={0} value={it.cantidad_pedida || ""} placeholder="0" onChange={e => setItem(it.catalogo_id, "cantidad_pedida", e.target.value)} style={{ width: 90, background: it.cantidad_pedida > 0 ? "#DCFCE7" : "var(--surface)", border: `1px solid ${it.cantidad_pedida > 0 ? "#86EFAC" : "var(--border)"}`, borderRadius: "var(--r)", fontFamily: "var(--mono)", fontSize: 12, padding: "4px 8px", outline: "none", textAlign: "right", fontWeight: it.cantidad_pedida > 0 ? 700 : 400 }} /></td>
                            <td className="text-mono" style={{ fontSize: 11, color: total > 0 ? "var(--navy)" : "var(--muted2)" }}>{total > 0 ? total : "—"}</td>
                            <td className="text-mono" style={{ fontSize: 11, color: kgPaxDia > 0 ? "var(--accent)" : "var(--muted2)" }}>{kgPaxDia > 0 ? kgPaxDia.toFixed(3) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Carrito flotante */}
          <div style={{ position: "fixed", bottom: 0, left: 235, right: 0, background: "var(--navy)", borderTop: "2px solid rgba(255,255,255,.15)", padding: "12px 28px", display: "flex", alignItems: "center", gap: 16, zIndex: 50 }}>
            <div style={{ flex: 1 }}>
              {itemsConPedido.length === 0 ? (
                <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>Sin ítems seleccionados</span>
              ) : (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {[...new Set(itemsConPedido.map(it => it.categoria))].map(cat => (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,.5)" }}>{cat}</span>
                      <span style={{ fontSize: 11, fontFamily: "var(--mono)", fontWeight: 700, color: "#fff", background: "rgba(255,255,255,.15)", borderRadius: 4, padding: "1px 6px" }}>{itemsConPedido.filter(it => it.categoria === cat).length}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "var(--mono)" }}>{itemsConPedido.length} ítem{itemsConPedido.length !== 1 ? "s" : ""}</div>
              <button className="btn btn-ghost" onClick={() => setStep(1)} style={{ color: "rgba(255,255,255,.7)", borderColor: "rgba(255,255,255,.2)" }}>← Volver</button>
              <button className="btn" onClick={() => handleGuardar("borrador")} disabled={saving} style={{ background: "rgba(255,255,255,.15)", color: "#fff", borderColor: "rgba(255,255,255,.2)" }}>Guardar borrador</button>
              <button className="btn btn-success" onClick={() => handleGuardar("enviado")} disabled={saving || itemsConPedido.length === 0}>{saving ? "Enviando..." : "✓ Enviar al comprador"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PAGE: INBOX ──────────────────────────────────────────────────────────────
function PageInbox({ notify, onNeedRefresh }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await api.getPedidos({ status: "enviado" }); setPedidos(data); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAprobado = () => { setSelected(null); notify("Pedido aprobado — requisición creada en Compras", "success"); load(); onNeedRefresh(); };
  const handleRechazado = () => { setSelected(null); notify("Pedido rechazado", "warn"); load(); };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid var(--border)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>📬 Pedidos pendientes de aprobación</div>
        <span className="ni-badge" style={{ position: "static" }}>{pedidos.length}</span>
      </div>
      {loading ? <div className="loading"><span className="spin">◌</span></div> :
        pedidos.length === 0 ? <div className="empty-state"><div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>Sin pedidos pendientes</div> :
        pedidos.map(p => {
          const itemsCant = (p.viveres_pedido_items || []).filter(it => it.cantidad_pedida > 0).length;
          return (
            <div key={p.id} className="req-row unread" onClick={() => setSelected(p)}>
              <div className="flex-between mb8">
                <div className="flex-gap">
                  <span className="text-mono" style={{ fontSize: 11, color: "var(--accent)" }}>{fmtDate(p.fecha_pedido)}</span>
                  <span className="badge b-blue">Víveres</span>
                </div>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>{p.empresa}</span>
              </div>
              <div className="req-title">🚢 {p.base_buque} — {p.pax} PAX × {p.dias} días</div>
              <div className="req-meta">
                <span>{p.solicitado_por}</span><span>·</span>
                <span>{itemsCant} ítems pedidos</span>
                {p.fecha_necesaria && <><span>·</span><span style={{ color: "var(--warn)" }}>Necesario: {fmtDate(p.fecha_necesaria)}</span></>}
                {p.proyecto && <><span>·</span><span style={{ color: "var(--blue)" }}>📋 {p.proyecto}</span></>}
              </div>
            </div>
          );
        })
      }
      {selected && <ModalRevisar pedido={selected} onClose={() => setSelected(null)} onAprobado={handleAprobado} onRechazado={handleRechazado} />}
    </div>
  );
}

// ─── MODAL: REVISAR PEDIDO ────────────────────────────────────────────────────
function ModalRevisar({ pedido, onClose, onAprobado, onRechazado }) {
  const items = pedido.viveres_pedido_items || [];
  const [editItems, setEditItems] = useState(items.map(it => ({ ...it })));
  const [modo, setModo] = useState("detalle");
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [notaCondicional, setNotaCondicional] = useState("");
  const [saving, setSaving] = useState(false);

  const setEI = (id, k, v) => setEditItems(prev => prev.map(it => it.id === id ? { ...it, [k]: parseFloat(v) || 0 } : it));
  const itemsConPedido = editItems.filter(it => it.cantidad_pedida > 0);

  const handleAprobar = async () => {
    setSaving(true);
    try {
      if (modo === "condicional") await api.actualizarItems(pedido.id, editItems);
      const reqItems = itemsConPedido.map(it => ({ descripcion: it.descripcion, cantidad: it.cantidad_pedida, unidad: it.unidad, stock_disponible: it.stock_actual, proveedor_sugerido: "" }));
      const req = await api.crearRequisicion({
        titulo: `Víveres ${pedido.base_buque} — ${pedido.pax} PAX × ${pedido.dias} días`,
        empresa: pedido.empresa, base_buque: pedido.base_buque, area: "Catering",
        tipo_requisicion: "Víveres", urgencia: "Normal", solicitado_por: pedido.solicitado_por,
        fecha_necesaria: pedido.fecha_necesaria || null,
        observaciones: modo === "condicional" && notaCondicional ? `Aprobado con modificaciones: ${notaCondicional}` : pedido.observaciones || null,
      }, reqItems);
      await api.actualizarPedido(pedido.id, { status: "aprobado", requisicion_id: req.id });
      onAprobado();
    } finally { setSaving(false); }
  };

  const handleRechazar = async () => {
    if (!motivoRechazo.trim()) return alert("Ingresá un motivo");
    setSaving(true);
    try {
      await api.actualizarPedido(pedido.id, { status: "rechazado", observaciones: motivoRechazo });
      onRechazado();
    } finally { setSaving(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="mhdr">
          <div>
            <div className="mtitle">🚢 {pedido.base_buque} — Pedido de Víveres</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              {pedido.empresa} · {pedido.pax} PAX · {pedido.dias} días · Por: {pedido.solicitado_por}
              {pedido.fecha_necesaria && <span style={{ color: "var(--warn)", marginLeft: 8 }}>Necesario: {fmtDate(pedido.fecha_necesaria)}</span>}
              {pedido.proyecto && <span style={{ color: "var(--blue)", marginLeft: 8 }}>📋 {pedido.proyecto}</span>}
            </div>
          </div>
          <button className="mclose" onClick={onClose}>✕</button>
        </div>
        <div className="mbody">
          <div className="tabs-row">
            {[{ id: "detalle", label: "Detalle" }, { id: "condicional", label: "Aprobar con cambios" }, { id: "rechazar", label: "Rechazar" }].map(t => (
              <div key={t.id} className={`tab ${modo === t.id ? "active" : ""}`} onClick={() => setModo(t.id)}
                style={{ color: t.id === "rechazar" && modo === t.id ? "var(--danger)" : undefined, borderBottomColor: t.id === "rechazar" && modo === t.id ? "var(--danger)" : undefined }}>
                {t.label}
              </div>
            ))}
          </div>

          {modo === "detalle" && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Categoría</th><th>Temperatura</th><th>Descripción</th><th>Unidad</th><th>Stock</th><th>Pedido</th></tr></thead>
                <tbody>
                  {itemsConPedido.length === 0
                    ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted2)" }}>Sin ítems pedidos</td></tr>
                    : itemsConPedido.map((it, i) => {
                        const tc = TEMP_COLOR[it.temperatura] || { bg: "#F3F4F6", color: "#6B7280", border: "#E5E7EB" };
                        return (
                          <tr key={i}>
                            <td style={{ fontSize: 11, color: "var(--muted)" }}>{it.categoria}</td>
                            <td><span style={{ fontSize: 10, fontWeight: 600, color: tc.color, background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 4, padding: "2px 6px" }}>{it.temperatura}</span></td>
                            <td style={{ fontWeight: 500 }}>{it.descripcion}</td>
                            <td style={{ fontSize: 11, color: "var(--muted)" }}>{it.unidad}</td>
                            <td className="text-mono">{it.stock_actual || 0}</td>
                            <td className="text-mono" style={{ fontWeight: 700, color: "var(--accent2)" }}>{it.cantidad_pedida}</td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>
            </div>
          )}

          {modo === "condicional" && (
            <div>
              <div className="info-box warn mb12" style={{ fontSize: 11 }}>Podés editar las cantidades antes de aprobar.</div>
              <table className="items-edit">
                <thead><tr><th>Descripción</th><th>Unidad</th><th>Stock</th><th>Cantidad aprobada</th></tr></thead>
                <tbody>
                  {editItems.filter(it => it.cantidad_pedida > 0).map(it => (
                    <tr key={it.id}>
                      <td>{it.descripcion}</td>
                      <td>{it.unidad}</td>
                      <td className="text-mono">{it.stock_actual || 0}</td>
                      <td><input type="number" min={0} value={it.cantidad_pedida} onChange={e => setEI(it.id, "cantidad_pedida", e.target.value)} style={{ width: 80 }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt12"><FG label="Nota para el solicitante"><textarea value={notaCondicional} onChange={e => setNotaCondicional(e.target.value)} placeholder="Ej: Se ajustó cantidad de aceite..." /></FG></div>
            </div>
          )}

          {modo === "rechazar" && (
            <div>
              <div className="info-box mb12" style={{ fontSize: 12, borderLeft: "3px solid var(--danger)", background: "#FEF2F2" }}>El pedido quedará registrado como rechazado.</div>
              <FG label="Motivo de rechazo *"><textarea value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} placeholder="Explicá por qué se rechaza el pedido..." style={{ minHeight: 100 }} /></FG>
            </div>
          )}
        </div>
        <div className="mftr">
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          {modo === "rechazar" && <button className="btn btn-danger" onClick={handleRechazar} disabled={saving || !motivoRechazo.trim()}>{saving ? "..." : "✕ Confirmar rechazo"}</button>}
          {(modo === "detalle" || modo === "condicional") && <button className="btn btn-primary" onClick={handleAprobar} disabled={saving || itemsConPedido.length === 0}>{saving ? "Aprobando..." : modo === "condicional" ? "✓ Aprobar con cambios" : "✓ Aprobar → Compras"}</button>}
        </div>
      </div>
    </div>
  );
}

// ─── PAGE: HISTORIAL ──────────────────────────────────────────────────────────
function PageHistorial({ onNuevo }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => { api.getPedidos().then(d => { setPedidos(d); setLoading(false); }); }, []);

  return (
    <div>
      <div className="flex-between mb12">
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{pedidos.length} pedidos registrados</div>
        <button className="btn btn-primary btn-sm" onClick={onNuevo}>+ Nuevo pedido</button>
      </div>
      {loading ? <div className="loading"><span className="spin">◌</span></div> :
        pedidos.length === 0 ? <div className="empty-state"><div style={{ fontSize: 28, marginBottom: 8 }}>🚢</div>Sin pedidos de víveres</div> :
        pedidos.map(p => {
          const s = STATUS_PEDIDO[p.status] || { label: p.status, color: "b-gray" };
          const itemsCant = (p.viveres_pedido_items || []).filter(it => it.cantidad_pedida > 0).length;
          return (
            <div key={p.id} className="req-row" onClick={() => setSelected(p)}>
              <div className="flex-between mb8">
                <div className="flex-gap">
                  <span className="text-mono" style={{ fontSize: 11, color: "var(--accent)" }}>{fmtDate(p.fecha_pedido)}</span>
                  <span className={`badge ${s.color}`}>{s.label}</span>
                </div>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>{p.empresa}</span>
              </div>
              <div className="req-title">{p.base_buque} — {p.pax} PAX × {p.dias} días</div>
              <div className="req-meta">
                <span>{p.solicitado_por}</span><span>·</span><span>{itemsCant} ítems</span>
                {p.proyecto && <><span>·</span><span style={{ color: "var(--blue)" }}>📋 {p.proyecto}</span></>}
                {p.fecha_necesaria && <><span>·</span><span style={{ color: "var(--warn)" }}>Necesario: {fmtDate(p.fecha_necesaria)}</span></>}
              </div>
            </div>
          );
        })
      }
      {selected && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal modal-lg">
            <div className="mhdr">
              <div>
                <div className="mtitle">{selected.base_buque}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{selected.empresa} · {selected.pax} PAX · {selected.dias} días · {selected.solicitado_por}</div>
              </div>
              <button className="mclose" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="mbody">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Categoría</th><th>Descripción</th><th>Unidad</th><th>Stock</th><th>Pedido</th></tr></thead>
                  <tbody>
                    {(selected.viveres_pedido_items || []).filter(it => it.cantidad_pedida > 0 || it.stock_actual > 0).map((it, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 11, color: "var(--muted)" }}>{it.categoria}</td>
                        <td style={{ fontWeight: 500 }}>{it.descripcion}</td>
                        <td style={{ fontSize: 11, color: "var(--muted)" }}>{it.unidad}</td>
                        <td className="text-mono">{it.stock_actual || 0}</td>
                        <td className="text-mono" style={{ fontWeight: 700, color: "var(--accent2)" }}>{it.cantidad_pedida || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mftr"><button className="btn btn-ghost" onClick={() => setSelected(null)}>Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PAGE: CATÁLOGO ───────────────────────────────────────────────────────────
function PageCatalogo({ notify }) {
  const [catalogo, setCatalogo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCateg, setFiltroCateg] = useState("");
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ codigo: "", categoria: "Almacén", subcategoria: "", temperatura: "Seco", descripcion: "", unidad: "Unidad", volumen_peso: "" });

  useEffect(() => { api.getCatalogo().then(d => { setCatalogo(d); setLoading(false); }); }, []);

  const categorias = [...new Set(catalogo.map(c => c.categoria))].sort();
  const filtrado = catalogo.filter(c => {
    if (filtroCateg && c.categoria !== filtroCateg) return false;
    if (busqueda && !c.descripcion.toLowerCase().includes(busqueda.toLowerCase()) && !c.codigo?.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleGuardar = async () => {
    if (!form.descripcion.trim()) return alert("La descripción es obligatoria");
    setSaving(true);
    try {
      const { data, error } = await supabase.from("viveres_catalogo").insert([{ ...form, volumen_peso: form.volumen_peso ? parseFloat(form.volumen_peso) : null, activo: true }]).select().single();
      if (error) throw error;
      setCatalogo(prev => [...prev, data]);
      setModal(false);
      setForm({ codigo: "", categoria: "Almacén", subcategoria: "", temperatura: "Seco", descripcion: "", unidad: "Unidad", volumen_peso: "" });
      notify("Ítem agregado al catálogo", "success");
    } catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="filter-row mb12">
        <input className="filter-input" placeholder="🔍 Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ minWidth: 250 }} />
        <select className="filter-select" value={filtroCateg} onChange={e => setFiltroCateg(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c}>{c}</option>)}
        </select>
        {(busqueda || filtroCateg) && <button className="btn btn-ghost btn-sm" onClick={() => { setBusqueda(""); setFiltroCateg(""); }}>✕ Limpiar</button>}
        <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{filtrado.length} de {catalogo.length}</span>
        <button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>+ Agregar ítem</button>
      </div>
      {loading ? <div className="loading"><span className="spin">◌</span></div> :
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Código</th><th>Categoría</th><th>Subcategoría</th><th>Temp.</th><th>Descripción</th><th>Unidad</th></tr></thead>
              <tbody>
                {filtrado.map(c => {
                  const tc = TEMP_COLOR[c.temperatura] || { bg: "#F3F4F6", color: "#6B7280", border: "#E5E7EB", dot: "#9CA3AF" };
                  return (
                    <tr key={c.id}>
                      <td className="text-mono" style={{ fontSize: 10, color: "var(--muted)" }}>{c.codigo || "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>{c.categoria}</td>
                      <td style={{ fontSize: 11, color: "var(--muted2)" }}>{c.subcategoria || "—"}</td>
                      <td><span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: tc.color, background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 4, padding: "2px 6px" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: tc.dot, display: "inline-block" }} />{c.temperatura}</span></td>
                      <td style={{ fontWeight: 500, fontSize: 12 }}>{c.descripcion}</td>
                      <td style={{ fontSize: 11, color: "var(--muted)" }}>{c.unidad || "—"}</td>
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
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="mhdr"><div className="mtitle">Agregar ítem al catálogo</div><button className="mclose" onClick={() => setModal(false)}>✕</button></div>
            <div className="mbody">
              <div className="form-grid">
                <FG label="Código (opcional)"><input value={form.codigo} onChange={e => setF("codigo", e.target.value)} placeholder="Ej: NAV001" /></FG>
                <FG label="Temperatura *"><select value={form.temperatura} onChange={e => setF("temperatura", e.target.value)}><option>Seco</option><option>Refrigerado</option><option>Congelado</option></select></FG>
                <FG label="Categoría *"><select value={form.categoria} onChange={e => setF("categoria", e.target.value)}>{categorias.map(c => <option key={c}>{c}</option>)}<option>Otro</option></select></FG>
                <FG label="Subcategoría"><input value={form.subcategoria} onChange={e => setF("subcategoria", e.target.value)} /></FG>
              </div>
              <FG label="Descripción *" full><input value={form.descripcion} onChange={e => setF("descripcion", e.target.value)} placeholder="Nombre completo del producto" /></FG>
              <div className="form-grid mt12">
                <FG label="Unidad"><select value={form.unidad} onChange={e => setF("unidad", e.target.value)}>{["Unidad", "Kg", "Litros", "Caja", "Bolsa", "Atados", "Cajon", "Ristra"].map(u => <option key={u}>{u}</option>)}</select></FG>
                <FG label="Volumen/Peso por unidad" hint="En kg o litros para el cálculo de dieta"><input type="number" value={form.volumen_peso} onChange={e => setF("volumen_peso", e.target.value)} placeholder="Ej: 1, 0.5, 2.5" /></FG>
              </div>
            </div>
            <div className="mftr">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleGuardar} disabled={saving}>{saving ? "Guardando..." : "Agregar al catálogo"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROOT APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("inbox");
  const [notif, setNotif] = useState(null);
  const [inboxCount, setInboxCount] = useState(0);

  const notify = useCallback((text, type = "info") => {
    setNotif({ text, type });
    setTimeout(() => setNotif(null), 4000);
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const data = await api.getPedidos({ status: "enviado" });
      setInboxCount(data.length);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const pageTitles = {
    nuevo:    "VÍVERES — NUEVO PEDIDO",
    inbox:    "VÍVERES — INBOX",
    historial:"VÍVERES — HISTORIAL",
    catalogo: "VÍVERES — CATÁLOGO",
  };

  const NI = ({ id, icon, label, badge }) => (
    <div className={`ni ${page === id ? "active" : ""}`} onClick={() => setPage(id)}>
      <span className="ni-icon">{icon}</span>
      <span>{label}</span>
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
              <div className="sidebar-logo">🚢</div>
              <div>
                <div className="sidebar-logo-main">Víveres</div>
                <div className="sidebar-logo-sub">Terra Mare Group</div>
              </div>
            </div>
          </div>
          <div className="nav-section">Gestión</div>
          <NI id="inbox"    icon="📬" label="Inbox"         badge={inboxCount} />
          <NI id="nuevo"    icon="🛒" label="Nuevo Pedido" />
          <NI id="historial"icon="📋" label="Historial" />
          <NI id="catalogo" icon="📦" label="Catálogo" />
          <div style={{ flex: 1 }} />
          <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,.1)" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", fontFamily: "var(--mono)", letterSpacing: 1 }}>MÓDULO VÍVERES v1.0</div>
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
            {page === "historial" && <PageHistorial onNuevo={() => setPage("nuevo")} />}
            {page === "catalogo"  && <PageCatalogo notify={notify} />}
          </div>
        </div>
      </div>
      <Notif msg={notif} onClose={() => setNotif(null)} />
    </>
  );
}
