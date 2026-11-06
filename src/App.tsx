import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from './firebase';

interface CodigoItem {
  id: string;
  activo?: boolean;
  canjeado?: boolean;
  multiuso?: boolean;
  tipo?: string;
  lote?: string;
  creado?: string;
  fecha_canje?: string;
  usado_por?: string | null;
  usadoPor?: string | null;
}

const MASTER_PASS = 'Altair16';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('admin_auth') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);

  // Data & loading states
  const [codes, setCodes] = useState<CodigoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Form states
  const [prefix, setPrefix] = useState('BMC');
  const [quantity, setQuantity] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);

  const [universalCode, setUniversalCode] = useState('BMC-VIP');
  const [isRegisteringUniversal, setIsRegisteringUniversal] = useState(false);

  // Filter & Search
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todos' | 'disponibles' | 'canjeados' | 'universales'>('todos');

  // Custom UI Dialog / Toast (to avoid window.alert / window.confirm in iframe)
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const verificarPassword = () => {
    if (passwordInput.trim() === MASTER_PASS) {
      sessionStorage.setItem('admin_auth', 'true');
      setIsAuthenticated(true);
      setAuthError(false);
    } else {
      setAuthError(true);
    }
  };

  const cerrarSesion = () => {
    sessionStorage.removeItem('admin_auth');
    setIsAuthenticated(false);
    setPasswordInput('');
    setCodes([]);
    setSelectedIds(new Set());
  };

  const cargarCodigos = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const q = query(collection(db, 'codigos'), orderBy('creado', 'desc'));
      const snap = await getDocs(q);
      const items: CodigoItem[] = [];
      snap.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...(docSnap.data() as Omit<CodigoItem, 'id'>) });
      });
      setCodes(items);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      console.error(err);
      setFetchError("Error al leer la colección 'codigos'. Revisa las reglas o permisos.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      cargarCodigos();
    }
  }, [isAuthenticated, cargarCodigos]);

  // Metrics
  const metrics = useMemo(() => {
    const total = codes.length;
    const universales = codes.filter((c) => c.multiuso === true || c.tipo === 'universal').length;
    const canjeados = codes.filter(
      (c) => (c.canjeado === true || c.activo === false) && !c.multiuso && c.tipo !== 'universal'
    ).length;
    const disponibles = total - canjeados - universales;
    return { total, disponibles, canjeados, universales };
  }, [codes]);

  // Filtered list
  const filteredCodes = useMemo(() => {
    const q = search.toLowerCase().trim();
    return codes.filter((c) => {
      const id = c.id.toLowerCase();
      const coincideTexto = id.includes(q);
      const esUniversal = c.multiuso === true || c.tipo === 'universal';
      const estaUsado = (c.canjeado === true || c.activo === false) && !esUniversal;

      if (filter === 'disponibles') return coincideTexto && !estaUsado && !esUniversal;
      if (filter === 'canjeados') return coincideTexto && estaUsado;
      if (filter === 'universales') return coincideTexto && esUniversal;
      return coincideTexto;
    });
  }, [codes, search, filter]);

  const areAllFilteredSelected = useMemo(() => {
    if (filteredCodes.length === 0) return false;
    return filteredCodes.every((c) => selectedIds.has(c.id));
  }, [filteredCodes, selectedIds]);

  const toggleSelectAll = (checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      filteredCodes.forEach((c) => next.add(c.id));
    } else {
      filteredCodes.forEach((c) => next.delete(c.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectIndividual = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const deseleccionarTodo = () => {
    setSelectedIds(new Set());
  };

  // Actions
  const generarLoteCodigos = async () => {
    const pfx = prefix.trim().toUpperCase() || 'BMC';
    let qty = Number(quantity) || 10;
    if (qty > 500) qty = 500;
    if (qty < 1) qty = 1;

    setIsGenerating(true);
    try {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const batch = writeBatch(db);
      const ahora = new Date().toISOString();

      for (let i = 0; i < qty; i++) {
        let rand = '';
        for (let j = 0; j < 6; j++) {
          rand += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const codigo = `${pfx}-${rand}`;
        const docRef = doc(db, 'codigos', codigo);

        batch.set(docRef, {
          activo: true,
          canjeado: false,
          multiuso: false,
          tipo: 'individual',
          lote: pfx,
          creado: ahora,
          usado_por: null,
          usadoPor: null,
        });
      }

      await batch.commit();
      showToast(`¡Se generaron ${qty} códigos en un solo lote con éxito!`);
      await cargarCodigos();
    } catch (err) {
      console.error(err);
      showToast('Error al generar lote en Firestore.');
    } finally {
      setIsGenerating(false);
    }
  };

  const crearCodigoUniversal = async () => {
    const codigoRaw = universalCode.trim().toUpperCase();
    if (!codigoRaw) {
      showToast('Por favor escribe el nombre para el código universal.');
      return;
    }

    setIsRegisteringUniversal(true);
    try {
      const docRef = doc(db, 'codigos', codigoRaw);
      await setDoc(docRef, {
        activo: true,
        canjeado: false,
        multiuso: true,
        tipo: 'universal',
        lote: 'UNIVERSAL',
        creado: new Date().toISOString(),
      });

      showToast(`¡Código Universal Permanente "${codigoRaw}" registrado con éxito!`);
      await cargarCodigos();
    } catch (err) {
      console.error(err);
      showToast('Error al guardar el código universal en Firestore.');
    } finally {
      setIsRegisteringUniversal(false);
    }
  };

  const copiarCodigo = (texto: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(() => {
        showToast(`Código ${texto} copiado al portapapeles.`);
      });
    } else {
      showToast(`Código ${texto} copiado.`);
    }
  };

  const quemarCodigo = (id: string) => {
    setConfirmDialog({
      message: `¿Estás seguro de marcar el código ${id} como canjeado? Ya no podrá usarse.`,
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'codigos', id), {
            activo: false,
            canjeado: true,
            fecha_canje: new Date().toLocaleString(),
          });
          showToast(`Código ${id} marcado como canjeado.`);
          await cargarCodigos();
        } catch (err) {
          console.error(err);
          showToast('Error al actualizar el código.');
        }
      },
    });
  };

  const borrarCodigo = (id: string) => {
    setConfirmDialog({
      message: `¿Eliminar permanentemente el código ${id} de la base de datos?`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'codigos', id));
          showToast(`Código ${id} eliminado.`);
          await cargarCodigos();
        } catch (err) {
          console.error(err);
          showToast('Error al borrar el código.');
        }
      },
    });
  };

  const quemarSeleccionados = () => {
    if (selectedIds.size === 0) return;
    setConfirmDialog({
      message: `¿Marcar como CANJEADOS los ${selectedIds.size} códigos seleccionados? Ya no podrán usarse.`,
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          const ahora = new Date().toLocaleString();

          selectedIds.forEach((id) => {
            const docRef = doc(db, 'codigos', id);
            batch.update(docRef, {
              activo: false,
              canjeado: true,
              fecha_canje: ahora,
            });
          });

          await batch.commit();
          showToast(`¡${selectedIds.size} códigos marcados como canjeados con éxito!`);
          setSelectedIds(new Set());
          await cargarCodigos();
        } catch (err) {
          console.error(err);
          showToast('Error al quemar los códigos seleccionados.');
        }
      },
    });
  };

  const borrarSeleccionados = () => {
    if (selectedIds.size === 0) return;
    setConfirmDialog({
      message: `¿Eliminar PERMANENTEMENTE los ${selectedIds.size} códigos seleccionados de Firestore? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          selectedIds.forEach((id) => {
            const docRef = doc(db, 'codigos', id);
            batch.delete(docRef);
          });

          await batch.commit();
          showToast(`¡${selectedIds.size} códigos eliminados de la base de datos!`);
          setSelectedIds(new Set());
          await cargarCodigos();
        } catch (err) {
          console.error(err);
          showToast('Error al borrar los códigos seleccionados.');
        }
      },
    });
  };

  const exportarExcel = () => {
    if (codes.length === 0) {
      showToast('No hay datos para exportar.');
      return;
    }
    const data = codes.map((c) => ({
      Código: c.id,
      Lote: c.lote || (c.tipo === 'universal' ? 'UNIVERSAL' : '-'),
      'Fecha Creación': c.creado ? new Date(c.creado).toLocaleDateString() : '-',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Códigos 101BMC');
    XLSX.writeFile(wb, `Reporte_Codigos_101BMC_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Archivo Excel descargado exitosamente.');
  };

  return (
    <div className="bg-[#050b14] text-slate-100 font-jakarta min-h-screen p-4 md:p-8 pb-24">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[#0b1626] border border-purple-500/80 shadow-2xl px-5 py-3 rounded-xl text-xs font-bold text-white flex items-center gap-3 animate-fade-in">
          <span>🔔</span>
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#0b1626] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="text-xl">⚠️ Confirmación</div>
            <p className="text-sm text-slate-300">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  fn();
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-lg"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pantalla de Autenticación / Acceso Restringido */}
      {!isAuthenticated && (
        <div id="auth-screen" className="fixed inset-0 z-50 flex items-center justify-center bg-[#050b14] p-4">
          <div className="w-full max-w-md bg-[#0b1626] border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-purple-600/20 border border-purple-500/30 text-purple-400 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner">
              🔒
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Admin - 101BMC</h1>
              <p className="text-xs text-slate-400 mt-1">
                Introduce la contraseña maestra para generar accesos.
              </p>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                id="input-password"
                placeholder="Contraseña de acceso"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setAuthError(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') verificarPassword();
                }}
                className="w-full px-4 py-3 bg-[#070f1b] border border-slate-700 focus:border-purple-400 rounded-xl text-sm text-white focus:outline-none text-center tracking-widest"
              />
              {authError && (
                <p id="auth-error" className="text-rose-400 text-xs">
                  ⚠️ Contraseña incorrecta.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={verificarPassword}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase text-xs rounded-xl transition-all shadow-lg cursor-pointer"
            >
              Desbloquear Panel
            </button>
          </div>
        </div>
      )}

      {/* Panel Principal */}
      {isAuthenticated && (
        <div id="main-panel" className="max-w-5xl mx-auto space-y-6">
          {/* Barra Superior */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-xs text-slate-400 font-mono">Conectado a Firestore (libros-1f750)</span>
            </div>
            <button
              type="button"
              onClick={cerrarSesion}
              className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1.5 transition-colors cursor-pointer bg-[#0b1626] px-3 py-1.5 rounded-xl border border-slate-800"
            >
              🔒 Cerrar Sesión
            </button>
          </div>

          {/* Cabecera */}
          <header className="bg-[#0b1626] border-2 border-purple-500/40 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                🎟️ Administrador de Códigos{' '}
                <span className="text-xs px-2.5 py-1 bg-purple-500/20 border border-purple-400/30 text-purple-300 rounded-full font-mono font-bold">
                  101BMC
                </span>
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                Generación masiva, códigos universales permanentes y exportación limpia.
              </p>
            </div>
          </header>

          {/* Métricas Rápidas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#0b1626] border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Total Códigos</p>
                <p id="stat-total" className="text-2xl font-black text-white mt-1">
                  {metrics.total}
                </p>
              </div>
              <div className="text-2xl">📦</div>
            </div>
            <div className="bg-[#0b1626] border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-emerald-400 font-bold">Disponibles</p>
                <p id="stat-disponibles" className="text-2xl font-black text-emerald-400 mt-1">
                  {metrics.disponibles}
                </p>
              </div>
              <div className="text-2xl">🟢</div>
            </div>
            <div className="bg-[#0b1626] border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-purple-400 font-bold">Canjeados</p>
                <p id="stat-usados" className="text-2xl font-black text-purple-300 mt-1">
                  {metrics.canjeados}
                </p>
              </div>
              <div className="text-2xl">🔥</div>
            </div>
            <div className="bg-[#0b1626] border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-amber-400 font-bold">Universales</p>
                <p id="stat-universales" className="text-2xl font-black text-amber-300 mt-1">
                  {metrics.universales}
                </p>
              </div>
              <div className="text-2xl">🌟</div>
            </div>
          </div>

          {/* Sección de Creación: Lotes y Código Universal */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Formulario de Creación Masiva */}
            <div className="lg:col-span-2 bg-[#0b1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-purple-400">
                Generar Lote en Bloque
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Prefijo / Lote</label>
                  <input
                    type="text"
                    id="input-prefix"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                    placeholder="Ej. BMC"
                    className="w-full px-4 py-2.5 bg-[#070f1b] border border-slate-700 focus:border-purple-400 rounded-xl text-sm text-white uppercase focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Cantidad (Máx. 500)</label>
                  <input
                    type="number"
                    id="input-quantity"
                    min={1}
                    max={500}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full px-4 py-2.5 bg-[#070f1b] border border-slate-700 focus:border-purple-400 rounded-xl text-sm text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={generarLoteCodigos}
                  disabled={isGenerating}
                  id="btn-generate"
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-black uppercase text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isGenerating ? 'Escribiendo en Firestore...' : '✨ Generar Lote Atómico (Batch)'}
                </button>
                <button
                  type="button"
                  onClick={exportarExcel}
                  className="px-5 py-3 bg-emerald-700/80 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs uppercase transition-all border border-emerald-500/40 flex items-center gap-2 cursor-pointer"
                >
                  📊 Exportar Excel
                </button>
              </div>
            </div>

            {/* Creación de Código Universal Permanente */}
            <div className="bg-[#0b1626] border-2 border-amber-500/30 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">🌟</span>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">
                    Código Universal
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Crea un código permanente que nunca se quema y permite accesos ilimitados.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Código Personalizado</label>
                <input
                  type="text"
                  id="input-universal"
                  value={universalCode}
                  onChange={(e) => setUniversalCode(e.target.value.toUpperCase())}
                  placeholder="Ej. BMC-VIP"
                  className="w-full px-4 py-2.5 bg-[#070f1b] border border-amber-500/40 focus:border-amber-400 rounded-xl text-sm font-mono font-bold text-amber-300 uppercase focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={crearCodigoUniversal}
                disabled={isRegisteringUniversal}
                id="btn-universal"
                className="w-full py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-black uppercase text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                {isRegisteringUniversal ? 'Registrando...' : '⭐ Registrar Código Permanente'}
              </button>
            </div>
          </div>

          {/* Tabla y Controles de Búsqueda */}
          <div className="bg-[#0b1626] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-purple-400">
                Listado de Códigos
              </h2>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <input
                  type="text"
                  id="input-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar código..."
                  className="px-3 py-1.5 bg-[#070f1b] border border-slate-700 focus:border-purple-400 rounded-xl text-xs text-white focus:outline-none w-full md:w-56"
                />
                <select
                  id="select-filter"
                  value={filter}
                  onChange={(e) =>
                    setFilter(e.target.value as 'todos' | 'disponibles' | 'canjeados' | 'universales')
                  }
                  className="px-3 py-1.5 bg-[#070f1b] border border-slate-700 focus:border-purple-400 rounded-xl text-xs text-white focus:outline-none"
                >
                  <option value="todos">Todos</option>
                  <option value="disponibles">Disponibles</option>
                  <option value="canjeados">Canjeados</option>
                  <option value="universales">Universales</option>
                </select>
                <button
                  type="button"
                  onClick={cargarCodigos}
                  title="Recargar códigos"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-xl text-purple-300 cursor-pointer"
                >
                  🔄
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#070f1b] text-slate-300 border-b border-slate-800">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        id="check-all"
                        checked={areAllFilteredSelected}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 accent-purple-600 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">Código</th>
                    <th className="p-3">Tipo / Estado</th>
                    <th className="p-3">Fecha de Creación</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody id="codes-table-body" className="divide-y border-slate-800">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        Consultando Firestore...
                      </td>
                    </tr>
                  ) : fetchError ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-rose-400">
                        {fetchError}
                      </td>
                    </tr>
                  ) : filteredCodes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        No se encontraron registros.
                      </td>
                    </tr>
                  ) : (
                    filteredCodes.map((c) => {
                      const esUniversal = c.multiuso === true || c.tipo === 'universal';
                      const estaUsado = (c.canjeado === true || c.activo === false) && !esUniversal;
                      const fecha = c.creado ? new Date(c.creado).toLocaleDateString() : '-';
                      const isChecked = selectedIds.has(c.id);

                      return (
                        <tr
                          key={c.id}
                          className={`hover:bg-slate-900/40 transition-colors ${
                            isChecked ? 'bg-purple-950/20' : ''
                          } ${estaUsado ? 'opacity-70 bg-slate-950/30' : ''}`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => toggleSelectIndividual(c.id, e.target.checked)}
                              className="w-4 h-4 rounded border-slate-700 accent-purple-600 cursor-pointer"
                            />
                          </td>
                          <td
                            className={`p-3 font-mono font-bold ${
                              esUniversal ? 'text-amber-300' : 'text-purple-300'
                            } flex items-center gap-2`}
                          >
                            <span>{c.id}</span>
                            <button
                              type="button"
                              onClick={() => copiarCodigo(c.id)}
                              title="Copiar código"
                              className="text-slate-500 hover:text-white transition-colors cursor-pointer"
                            >
                              📋
                            </button>
                          </td>
                          <td className="p-3">
                            {esUniversal ? (
                              <span className="px-2.5 py-0.5 bg-amber-950/70 text-amber-300 border border-amber-500/50 rounded-md font-bold flex items-center gap-1 w-max">
                                🌟 Universal
                              </span>
                            ) : !estaUsado ? (
                              <span className="px-2.5 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 rounded-md font-bold w-max">
                                Disponible
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 bg-purple-950/70 text-purple-300 border border-purple-800/50 rounded-md font-bold w-max">
                                Canjeado
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-400">{fecha}</td>
                          <td className="p-3 text-right space-x-2">
                            {!estaUsado && !esUniversal && (
                              <button
                                type="button"
                                onClick={() => quemarCodigo(c.id)}
                                className="px-2 py-1 bg-amber-600/20 hover:bg-amber-600 text-amber-400 hover:text-white border border-amber-500/30 rounded-lg text-xs transition-all cursor-pointer"
                              >
                                🔥 Quemar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => borrarCodigo(c.id)}
                              className="px-2 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 rounded-lg text-xs transition-all cursor-pointer"
                            >
                              🗑️ Borrar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Barra Flotante de Acciones en Bloque */}
      {selectedIds.size > 0 && isAuthenticated && (
        <div
          id="batch-bar"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#0b1626]/95 border-2 border-purple-500/80 backdrop-blur-md px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-4"
        >
          <span className="text-xs text-purple-300 font-bold">
            <span id="batch-count">{selectedIds.size}</span> seleccionados
          </span>
          <div className="h-4 w-px bg-slate-700"></div>
          <button
            type="button"
            onClick={quemarSeleccionados}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            🔥 Quemar Seleccionados
          </button>
          <button
            type="button"
            onClick={borrarSeleccionados}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            🗑️ Borrar Seleccionados
          </button>
          <button
            type="button"
            onClick={deseleccionarTodo}
            className="text-xs text-slate-400 hover:text-white ml-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
