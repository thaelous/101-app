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
import { PWAInstallBanner, PWAInstallHeaderButton } from './PWAInstallBanner';

interface CodigoItem {
  id: string;
  activo?: boolean;
  canjeado?: boolean;
  apartado?: boolean;
  estado?: string;
  multiuso?: boolean;
  tipo?: string;
  lote?: string;
  creado?: string;
  fecha_canje?: string;
  fecha_apartado?: string;
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

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [prefixFilter, setPrefixFilter] = useState('');
  const [filter, setFilter] = useState<'todos' | 'disponibles' | 'apartados' | 'canjeados' | 'universales'>('todos');

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
    const apartados = codes.filter(
      (c) =>
        (c.apartado === true || c.estado === 'apartado') &&
        !(c.canjeado === true || c.activo === false) &&
        !c.multiuso &&
        c.tipo !== 'universal'
    ).length;
    const disponibles = total - canjeados - universales - apartados;
    return { total, disponibles, apartados, canjeados, universales };
  }, [codes]);

  // Filtered list
  const filteredCodes = useMemo(() => {
    const q = search.toLowerCase().trim();
    const pfx = prefixFilter.toUpperCase().trim();

    return codes.filter((c) => {
      const idUpper = c.id.toUpperCase();
      const idLower = c.id.toLowerCase();
      const loteUpper = (c.lote || '').toUpperCase();

      // Check prefix filter
      const coincidePrefijo = !pfx || idUpper.startsWith(pfx) || loteUpper === pfx || idUpper.includes(pfx);

      // Check text search
      const coincideTexto = !q || idLower.includes(q);

      if (!coincidePrefijo || !coincideTexto) return false;

      const esUniversal = c.multiuso === true || c.tipo === 'universal';
      const estaUsado = (c.canjeado === true || c.activo === false) && !esUniversal;
      const esApartado = !estaUsado && !esUniversal && (c.apartado === true || c.estado === 'apartado');
      const esDisponible = !estaUsado && !esUniversal && !esApartado;

      if (filter === 'disponibles') return esDisponible;
      if (filter === 'apartados') return esApartado;
      if (filter === 'canjeados') return estaUsado;
      if (filter === 'universales') return esUniversal;
      return true;
    });
  }, [codes, search, prefixFilter, filter]);

  // Active codes matching current filter (can be burned in combo)
  const activeFilteredCodes = useMemo(() => {
    return filteredCodes.filter((c) => {
      const esUniversal = c.multiuso === true || c.tipo === 'universal';
      const estaUsado = (c.canjeado === true || c.activo === false) && !esUniversal;
      return !estaUsado && !esUniversal;
    });
  }, [filteredCodes]);

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

  // Helper for batch updates chunked (Firestore limit is 500 per batch)
  const batchUpdateInChunks = async (
    ids: string[],
    data: Record<string, unknown>
  ) => {
    const CHUNK_SIZE = 450;
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        const docRef = doc(db, 'codigos', id);
        batch.update(docRef, data);
      }
      await batch.commit();
    }
  };

  // Helper for batch deletes chunked
  const batchDeleteInChunks = async (ids: string[]) => {
    const CHUNK_SIZE = 450;
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.delete(doc(db, 'codigos', id));
      }
      await batch.commit();
    }
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
          apartado: false,
          estado: 'disponible',
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
        apartado: false,
        estado: 'disponible',
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

  // State: Apartar
  const apartarCodigo = async (id: string) => {
    try {
      await updateDoc(doc(db, 'codigos', id), {
        apartado: true,
        estado: 'apartado',
        fecha_apartado: new Date().toLocaleString(),
      });
      showToast(`Código ${id} marcado como APARTADO (en espera de cliente).`);
      await cargarCodigos();
    } catch (err) {
      console.error(err);
      showToast('Error al apartar el código.');
    }
  };

  // State: Liberar (quitar de apartado y volver a disponible)
  const liberarCodigo = async (id: string) => {
    try {
      await updateDoc(doc(db, 'codigos', id), {
        apartado: false,
        estado: 'disponible',
      });
      showToast(`Código ${id} liberado y disponible nuevamente.`);
      await cargarCodigos();
    } catch (err) {
      console.error(err);
      showToast('Error al liberar el código.');
    }
  };

  const quemarCodigo = (id: string) => {
    setConfirmDialog({
      message: `¿Estás seguro de marcar el código ${id} como canjeado/quemado? Ya no podrá usarse.`,
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'codigos', id), {
            activo: false,
            canjeado: true,
            apartado: false,
            estado: 'canjeado',
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

  // Quemar en combo por prefijo / filtro actual
  const quemarFiltradosEnCombo = () => {
    const count = activeFilteredCodes.length;
    if (count === 0) {
      showToast('No hay códigos activos o disponibles en el filtro actual para quemar.');
      return;
    }

    const filtroTexto = prefixFilter.trim()
      ? `con prefijo "${prefixFilter.trim().toUpperCase()}"`
      : 'del filtro actual';

    setConfirmDialog({
      message: `¿Estás seguro de QUEMAR EN COMBO los ${count} códigos activos ${filtroTexto}? Esta acción actualizará su estado a canjeado en Firestore y no podrán volver a usarse.`,
      onConfirm: async () => {
        try {
          const ids = activeFilteredCodes.map((c) => c.id);
          const ahora = new Date().toLocaleString();

          await batchUpdateInChunks(ids, {
            activo: false,
            canjeado: true,
            apartado: false,
            estado: 'canjeado',
            fecha_canje: ahora,
          });

          showToast(`¡Se quemaron ${count} códigos exitosamente en Firestore!`);
          await cargarCodigos();
        } catch (err) {
          console.error(err);
          showToast('Error al quemar los códigos en combo.');
        }
      },
    });
  };

  // Batch actions on selected checkboxes
  const apartarSeleccionados = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setConfirmDialog({
      message: `¿Marcar como APARTADOS los ${ids.length} códigos seleccionados?`,
      onConfirm: async () => {
        try {
          const ahora = new Date().toLocaleString();
          await batchUpdateInChunks(ids, {
            apartado: true,
            estado: 'apartado',
            fecha_apartado: ahora,
          });
          showToast(`¡${ids.length} códigos marcados como apartados con éxito!`);
          setSelectedIds(new Set());
          await cargarCodigos();
        } catch (err) {
          console.error(err);
          showToast('Error al apartar los códigos seleccionados.');
        }
      },
    });
  };

  const quemarSeleccionados = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setConfirmDialog({
      message: `¿Marcar como CANJEADOS / QUEMADOS los ${ids.length} códigos seleccionados? Ya no podrán usarse.`,
      onConfirm: async () => {
        try {
          const ahora = new Date().toLocaleString();
          await batchUpdateInChunks(ids, {
            activo: false,
            canjeado: true,
            apartado: false,
            estado: 'canjeado',
            fecha_canje: ahora,
          });

          showToast(`¡${ids.length} códigos marcados como canjeados con éxito!`);
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
    const ids = Array.from(selectedIds);
    setConfirmDialog({
      message: `¿Eliminar PERMANENTEMENTE los ${ids.length} códigos seleccionados de Firestore? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await batchDeleteInChunks(ids);
          showToast(`¡${ids.length} códigos eliminados de la base de datos!`);
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
      Estado:
        c.multiuso || c.tipo === 'universal'
          ? 'Universal'
          : c.canjeado || c.activo === false
          ? 'Canjeado'
          : c.apartado || c.estado === 'apartado'
          ? 'Apartado'
          : 'Disponible',
      'Fecha Creación': c.creado ? new Date(c.creado).toLocaleDateString() : '-',
      'Fecha Canje': c.fecha_canje || '-',
      'Fecha Apartado': c.fecha_apartado || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Códigos 101BMC');
    XLSX.writeFile(wb, `Reporte_Codigos_101BMC_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Archivo Excel descargado exitosamente.');
  };

  return (
    <div className="bg-[#050b14] text-slate-100 font-jakarta min-h-screen p-3.5 sm:p-6 md:p-8 pb-28 md:pb-24">
      {/* PWA Install Notification Banner */}
      <PWAInstallBanner />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-5 z-50 bg-[#0b1626]/95 border border-purple-500/80 shadow-2xl px-4 py-3 rounded-xl text-xs font-bold text-white flex items-center justify-between gap-3 animate-fade-in backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span>🔔</span>
            <span className="leading-snug">{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white cursor-pointer p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#0b1626] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="text-xl font-bold text-white flex items-center gap-2">
              <span>⚠️</span> Confirmación
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="w-full sm:w-auto px-5 py-3 sm:py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
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
                className="w-full sm:w-auto px-5 py-3 sm:py-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-lg"
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
          <div className="w-full max-w-md bg-[#0b1626] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
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
              className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-black uppercase text-xs rounded-xl transition-all shadow-lg cursor-pointer"
            >
              Desbloquear Panel
            </button>
          </div>
        </div>
      )}

      {/* Panel Principal */}
      {isAuthenticated && (
        <div id="main-panel" className="max-w-5xl mx-auto space-y-5 sm:space-y-6">
          {/* Barra Superior */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
              <span className="text-xs text-slate-400 font-mono truncate">
                Conectado a Firestore (libros-1f750)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <PWAInstallHeaderButton />
              <button
                type="button"
                onClick={cerrarSesion}
                className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1.5 transition-colors cursor-pointer bg-[#0b1626] px-3 py-1.5 rounded-xl border border-slate-800 shrink-0"
              >
                🔒 <span className="hidden xs:inline">Cerrar Sesión</span>
              </button>
            </div>
          </div>

          {/* Cabecera */}
          <header className="bg-[#0b1626] border-2 border-purple-500/40 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2 flex-wrap">
                <span>🎟️ Administrador de Códigos</span>
                <span className="text-xs px-2.5 py-1 bg-purple-500/20 border border-purple-400/30 text-purple-300 rounded-full font-mono font-bold">
                  101BMC
                </span>
              </h1>
              <p className="text-xs text-slate-300 mt-1">
                Generación masiva, códigos universales permanentes, estados en tiempo real y quemado en combo.
              </p>
            </div>
          </header>

          {/* Métricas Rápidas (Grid responsivo adaptado a móvil) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-4">
            <div className="bg-[#0b1626] border border-slate-800 rounded-2xl p-3 sm:p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-400 font-bold">Total</p>
                <p id="stat-total" className="text-xl sm:text-2xl font-black text-white mt-0.5">
                  {metrics.total}
                </p>
              </div>
              <div className="text-xl sm:text-2xl">📦</div>
            </div>
            <div className="bg-[#0b1626] border border-slate-800 rounded-2xl p-3 sm:p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] sm:text-xs uppercase tracking-wider text-emerald-400 font-bold">Disponibles</p>
                <p id="stat-disponibles" className="text-xl sm:text-2xl font-black text-emerald-400 mt-0.5">
                  {metrics.disponibles}
                </p>
              </div>
              <div className="text-xl sm:text-2xl">🟢</div>
            </div>
            <div className="bg-[#0b1626] border border-orange-500/30 rounded-2xl p-3 sm:p-4 flex items-center justify-between bg-orange-950/10">
              <div>
                <p className="text-[11px] sm:text-xs uppercase tracking-wider text-orange-400 font-bold">Apartados</p>
                <p id="stat-apartados" className="text-xl sm:text-2xl font-black text-orange-300 mt-0.5">
                  {metrics.apartados}
                </p>
              </div>
              <div className="text-xl sm:text-2xl">⏳</div>
            </div>
            <div className="bg-[#0b1626] border border-slate-800 rounded-2xl p-3 sm:p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] sm:text-xs uppercase tracking-wider text-purple-400 font-bold">Canjeados</p>
                <p id="stat-usados" className="text-xl sm:text-2xl font-black text-purple-300 mt-0.5">
                  {metrics.canjeados}
                </p>
              </div>
              <div className="text-xl sm:text-2xl">🔥</div>
            </div>
            <div className="col-span-2 sm:col-span-1 bg-[#0b1626] border border-slate-800 rounded-2xl p-3 sm:p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] sm:text-xs uppercase tracking-wider text-amber-400 font-bold">Universales</p>
                <p id="stat-universales" className="text-xl sm:text-2xl font-black text-amber-300 mt-0.5">
                  {metrics.universales}
                </p>
              </div>
              <div className="text-xl sm:text-2xl">🌟</div>
            </div>
          </div>

          {/* Sección de Creación: Lotes y Código Universal */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
            {/* Formulario de Creación Masiva */}
            <div className="lg:col-span-2 bg-[#0b1626] border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-purple-400">
                Generar Lote en Bloque
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Prefijo / Lote</label>
                  <input
                    type="text"
                    id="input-prefix"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                    placeholder="Ej. BMC"
                    className="w-full px-4 py-2.5 sm:py-3 bg-[#070f1b] border border-slate-700 focus:border-purple-400 rounded-xl text-sm text-white uppercase focus:outline-none"
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
                    className="w-full px-4 py-2.5 sm:py-3 bg-[#070f1b] border border-slate-700 focus:border-purple-400 rounded-xl text-sm text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 pt-1">
                <button
                  type="button"
                  onClick={generarLoteCodigos}
                  disabled={isGenerating}
                  id="btn-generate"
                  className="flex-1 min-h-[46px] py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-50 text-white font-black uppercase text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isGenerating ? 'Escribiendo en Firestore...' : '✨ Generar Lote Atómico (Batch)'}
                </button>
                <button
                  type="button"
                  onClick={exportarExcel}
                  className="min-h-[46px] px-5 py-3 bg-emerald-700/80 hover:bg-emerald-600 active:bg-emerald-800 text-white font-bold rounded-xl text-xs uppercase transition-all border border-emerald-500/40 flex items-center justify-center gap-2 cursor-pointer"
                >
                  📊 Exportar Excel
                </button>
              </div>
            </div>

            {/* Creación de Código Universal Permanente */}
            <div className="bg-[#0b1626] border-2 border-amber-500/30 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between space-y-4">
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
                  className="w-full px-4 py-2.5 sm:py-3 bg-[#070f1b] border border-amber-500/40 focus:border-amber-400 rounded-xl text-sm font-mono font-bold text-amber-300 uppercase focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={crearCodigoUniversal}
                disabled={isRegisteringUniversal}
                id="btn-universal"
                className="w-full min-h-[46px] py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 active:from-amber-700 active:to-amber-600 disabled:opacity-50 text-slate-950 font-black uppercase text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                {isRegisteringUniversal ? 'Registrando...' : '⭐ Registrar Código Permanente'}
              </button>
            </div>
          </div>

          {/* Tabla y Controles de Búsqueda y Quemado en Combo */}
          <div className="bg-[#0b1626] border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col gap-3.5">
              {/* Barra superior de la sección de códigos: Título y Botón Quemar en Combo */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                    <span>Listado de Códigos</span>
                  </h2>
                  <span className="text-xs text-slate-400 font-mono bg-[#070f1b] px-2.5 py-1 rounded-lg border border-slate-800">
                    {filteredCodes.length} {filteredCodes.length === 1 ? 'registro' : 'registros'}
                  </span>
                </div>

                {/* Botón de Acción Masiva: Quemar Códigos Filtrados por Prefijo / Filtro */}
                <button
                  type="button"
                  onClick={quemarFiltradosEnCombo}
                  disabled={activeFilteredCodes.length === 0}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 active:from-amber-700 active:to-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-xl text-xs uppercase tracking-wide transition-all shadow-md flex items-center justify-center gap-2.5 cursor-pointer"
                  title="Quema todos los códigos activos que coinciden con los filtros actuales"
                >
                  <span className="text-sm">🔥</span>
                  <span>Quemar códigos filtrados</span>
                  <span className="bg-black/35 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold">
                    {activeFilteredCodes.length}
                  </span>
                </button>
              </div>

              {/* Filtros: Búsqueda, Filtro por Prefijo, Estado y Recarga */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                <div>
                  <input
                    type="text"
                    id="input-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="🔍 Buscar código..."
                    className="w-full px-3.5 py-2.5 bg-[#070f1b] border border-slate-700 focus:border-purple-400 rounded-xl text-xs sm:text-sm text-white focus:outline-none"
                  />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    id="input-prefix-filter"
                    value={prefixFilter}
                    onChange={(e) => setPrefixFilter(e.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    placeholder="🏷️ Filtro por prefijo (ej. BMC)..."
                    className="w-full px-3.5 py-2.5 bg-[#070f1b] border border-amber-500/40 focus:border-amber-400 rounded-xl text-xs sm:text-sm text-amber-300 uppercase font-mono focus:outline-none"
                  />
                  {prefixFilter && (
                    <button
                      type="button"
                      onClick={() => setPrefixFilter('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div>
                  <select
                    id="select-filter"
                    value={filter}
                    onChange={(e) =>
                      setFilter(
                        e.target.value as 'todos' | 'disponibles' | 'apartados' | 'canjeados' | 'universales'
                      )
                    }
                    className="w-full px-3.5 py-2.5 bg-[#070f1b] border border-slate-700 focus:border-purple-400 rounded-xl text-xs sm:text-sm text-white focus:outline-none"
                  >
                    <option value="todos">Todos los estados</option>
                    <option value="disponibles">🟢 Disponibles</option>
                    <option value="apartados">⏳ Apartados</option>
                    <option value="canjeados">🔥 Canjeados</option>
                    <option value="universales">🌟 Universales</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cargarCodigos}
                    title="Recargar códigos desde Firestore"
                    className="w-full min-h-[40px] px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-xs sm:text-sm rounded-xl text-purple-300 font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <span>🔄</span>
                    <span>Recargar</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Barra de selección móvil (Visible sólo en pantallas pequeñas) */}
            <div className="block md:hidden pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between bg-[#070f1b] px-3.5 py-2.5 rounded-xl border border-slate-800">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-300">
                  <input
                    type="checkbox"
                    checked={areAllFilteredSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 accent-purple-600 cursor-pointer"
                  />
                  <span>Seleccionar todos ({filteredCodes.length})</span>
                </label>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={deseleccionarTodo}
                    className="text-[11px] text-purple-400 hover:text-purple-300 font-bold"
                  >
                    Limpiar selección
                  </button>
                )}
              </div>
            </div>

            {/* VISTA MÓVIL: Tarjetas Verticales Individuales (Mobile-First) */}
            <div className="block md:hidden space-y-3 pt-1">
              {isLoading ? (
                <div className="p-8 text-center text-slate-400 bg-[#070f1b] rounded-2xl border border-slate-800">
                  <div className="animate-spin text-2xl mb-2">🔄</div>
                  <p className="text-xs">Consultando Firestore...</p>
                </div>
              ) : fetchError ? (
                <div className="p-6 text-center text-rose-400 bg-[#070f1b] rounded-2xl border border-rose-900/40 text-xs">
                  {fetchError}
                </div>
              ) : filteredCodes.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-[#070f1b] rounded-2xl border border-slate-800 text-xs">
                  No se encontraron registros con los filtros actuales.
                </div>
              ) : (
                filteredCodes.map((c) => {
                  const esUniversal = c.multiuso === true || c.tipo === 'universal';
                  const estaUsado = (c.canjeado === true || c.activo === false) && !esUniversal;
                  const esApartado =
                    !estaUsado && !esUniversal && (c.apartado === true || c.estado === 'apartado');
                  const fecha = c.creado ? new Date(c.creado).toLocaleDateString() : '-';
                  const isChecked = selectedIds.has(c.id);

                  return (
                    <div
                      key={`card-${c.id}`}
                      className={`p-4 rounded-2xl border transition-all ${
                        isChecked
                          ? 'border-purple-500/80 bg-purple-950/25 shadow-lg shadow-purple-950/20'
                          : esApartado
                          ? 'border-orange-500/40 bg-orange-950/15'
                          : estaUsado
                          ? 'border-slate-800/80 bg-[#070f1b]/70 opacity-80'
                          : 'border-slate-800 bg-[#070f1b]'
                      }`}
                    >
                      {/* Cabecera de la tarjeta: Checkbox, Código y Estado */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => toggleSelectIndividual(c.id, e.target.checked)}
                            className="w-5 h-5 rounded border-slate-700 accent-purple-600 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0">
                            <span
                              className={`text-base font-mono font-black tracking-wide block truncate ${
                                esUniversal
                                  ? 'text-amber-300'
                                  : esApartado
                                  ? 'text-orange-300'
                                  : 'text-purple-300'
                              }`}
                            >
                              {c.id}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              Lote: {c.lote || (esUniversal ? 'UNIVERSAL' : '-')}
                            </span>
                          </div>
                        </div>

                        {/* Botón copiar con área táctil cómoda */}
                        <button
                          type="button"
                          onClick={() => copiarCodigo(c.id)}
                          title="Copiar código"
                          className="shrink-0 p-2.5 bg-slate-800/80 active:bg-slate-700 text-slate-300 rounded-xl text-sm transition-all"
                        >
                          📋
                        </button>
                      </div>

                      {/* Información de Estado y Fechas */}
                      <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between flex-wrap gap-2 text-xs">
                        <div>
                          {esUniversal ? (
                            <span className="px-2.5 py-1 bg-amber-950/70 text-amber-300 border border-amber-500/50 rounded-lg font-bold flex items-center gap-1">
                              🌟 Universal
                            </span>
                          ) : estaUsado ? (
                            <span className="px-2.5 py-1 bg-purple-950/70 text-purple-300 border border-purple-800/50 rounded-lg font-bold">
                              🔥 Canjeado
                            </span>
                          ) : esApartado ? (
                            <span className="px-2.5 py-1 bg-orange-950/70 text-orange-400 border border-orange-500/50 rounded-lg font-bold flex items-center gap-1">
                              ⏳ Apartado
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 rounded-lg font-bold">
                              🟢 Disponible
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-400">
                          <span>📅 {fecha}</span>
                          {c.fecha_canje && (
                            <span className="block text-[10px] text-slate-500">
                              Canje: {c.fecha_canje}
                            </span>
                          )}
                          {c.fecha_apartado && !c.fecha_canje && (
                            <span className="block text-[10px] text-orange-400/80">
                              Reserva: {c.fecha_apartado}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botones de Acción Táctil Optimizados para Móvil */}
                      <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center gap-2">
                        {/* Botón Apartar / Liberar */}
                        {!estaUsado && !esUniversal && !esApartado && (
                          <button
                            type="button"
                            onClick={() => apartarCodigo(c.id)}
                            className="flex-1 min-h-[42px] py-2.5 px-3 bg-orange-600/20 active:bg-orange-600 text-orange-400 active:text-white border border-orange-500/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <span>⏳</span>
                            <span>Apartar</span>
                          </button>
                        )}

                        {!estaUsado && !esUniversal && esApartado && (
                          <button
                            type="button"
                            onClick={() => liberarCodigo(c.id)}
                            className="flex-1 min-h-[42px] py-2.5 px-3 bg-slate-800 active:bg-slate-700 text-slate-300 active:text-white border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <span>↩️</span>
                            <span>Liberar</span>
                          </button>
                        )}

                        {/* Botón Quemar */}
                        {!estaUsado && !esUniversal && (
                          <button
                            type="button"
                            onClick={() => quemarCodigo(c.id)}
                            className="flex-1 min-h-[42px] py-2.5 px-3 bg-amber-600/20 active:bg-amber-600 text-amber-400 active:text-white border border-amber-500/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <span>🔥</span>
                            <span>Quemar</span>
                          </button>
                        )}

                        {/* Botón Borrar */}
                        <button
                          type="button"
                          onClick={() => borrarCodigo(c.id)}
                          className={`${
                            estaUsado || esUniversal ? 'w-full' : 'shrink-0 px-4'
                          } min-h-[42px] py-2.5 bg-rose-600/20 active:bg-rose-600 text-rose-400 active:text-white border border-rose-500/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm`}
                        >
                          <span>🗑️</span>
                          <span>Borrar</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* VISTA ESCRITORIO: Tabla Horizontal (md: y superiores) */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800">
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
                        No se encontraron registros con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    filteredCodes.map((c) => {
                      const esUniversal = c.multiuso === true || c.tipo === 'universal';
                      const estaUsado = (c.canjeado === true || c.activo === false) && !esUniversal;
                      const esApartado =
                        !estaUsado && !esUniversal && (c.apartado === true || c.estado === 'apartado');
                      const fecha = c.creado ? new Date(c.creado).toLocaleDateString() : '-';
                      const isChecked = selectedIds.has(c.id);

                      return (
                        <tr
                          key={c.id}
                          className={`hover:bg-slate-900/40 transition-colors ${
                            isChecked ? 'bg-purple-950/20' : ''
                          } ${estaUsado ? 'opacity-70 bg-slate-950/30' : ''} ${
                            esApartado ? 'bg-orange-950/10' : ''
                          }`}
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
                              esUniversal
                                ? 'text-amber-300'
                                : esApartado
                                ? 'text-orange-300'
                                : 'text-purple-300'
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
                            ) : estaUsado ? (
                              <span className="px-2.5 py-0.5 bg-purple-950/70 text-purple-300 border border-purple-800/50 rounded-md font-bold w-max">
                                Canjeado
                              </span>
                            ) : esApartado ? (
                              <span className="px-2.5 py-0.5 bg-orange-950/70 text-orange-400 border border-orange-500/50 rounded-md font-bold flex items-center gap-1 w-max">
                                ⏳ Apartado
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 rounded-md font-bold w-max">
                                Disponible
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-400">{fecha}</td>
                          <td className="p-3 text-right space-x-1.5 sm:space-x-2">
                            {/* Botón Apartar / Liberar */}
                            {!estaUsado && !esUniversal && !esApartado && (
                              <button
                                type="button"
                                onClick={() => apartarCodigo(c.id)}
                                title="Apartar código para un cliente"
                                className="px-2 py-1 bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/30 rounded-lg text-xs transition-all cursor-pointer font-medium"
                              >
                                ⏳ Apartar
                              </button>
                            )}

                            {!estaUsado && !esUniversal && esApartado && (
                              <button
                                type="button"
                                onClick={() => liberarCodigo(c.id)}
                                title="Regresar a estado disponible"
                                className="px-2 py-1 bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/40 rounded-lg text-xs transition-all cursor-pointer font-medium"
                              >
                                ↩️ Liberar
                              </button>
                            )}

                            {/* Botón Quemar */}
                            {!estaUsado && !esUniversal && (
                              <button
                                type="button"
                                onClick={() => quemarCodigo(c.id)}
                                title="Marcar como canjeado"
                                className="px-2 py-1 bg-amber-600/20 hover:bg-amber-600 text-amber-400 hover:text-white border border-amber-500/30 rounded-lg text-xs transition-all cursor-pointer font-medium"
                              >
                                🔥 Quemar
                              </button>
                            )}

                            {/* Botón Borrar */}
                            <button
                              type="button"
                              onClick={() => borrarCodigo(c.id)}
                              title="Eliminar de Firestore"
                              className="px-2 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 rounded-lg text-xs transition-all cursor-pointer font-medium"
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

      {/* Barra Flotante de Acciones en Bloque (Adaptada a pantallas móviles) */}
      {selectedIds.size > 0 && isAuthenticated && (
        <div
          id="batch-bar"
          className="fixed bottom-4 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40 bg-[#0b1626]/95 border-2 border-purple-500/80 backdrop-blur-md p-3 sm:px-6 sm:py-3 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-4 max-w-lg sm:max-w-none mx-auto"
        >
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <span className="text-xs text-purple-300 font-bold">
              <span id="batch-count" className="text-white font-mono bg-purple-900/50 px-2 py-0.5 rounded-lg border border-purple-500/40 mr-1">
                {selectedIds.size}
              </span>{' '}
              seleccionados
            </span>
            <button
              type="button"
              onClick={deseleccionarTodo}
              className="text-xs text-slate-400 hover:text-white p-1 cursor-pointer sm:hidden"
              title="Deseleccionar todos"
            >
              ✕ Cerrar
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700 hidden sm:block"></div>

          <div className="grid grid-cols-3 sm:flex items-center gap-2">
            <button
              type="button"
              onClick={apartarSeleccionados}
              className="min-h-[38px] px-2.5 py-1.5 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>⏳</span>
              <span className="hidden xs:inline">Apartar</span>
            </button>
            <button
              type="button"
              onClick={quemarSeleccionados}
              className="min-h-[38px] px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>🔥</span>
              <span className="hidden xs:inline">Quemar</span>
            </button>
            <button
              type="button"
              onClick={borrarSeleccionados}
              className="min-h-[38px] px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>🗑️</span>
              <span className="hidden xs:inline">Borrar</span>
            </button>
          </div>

          <button
            type="button"
            onClick={deseleccionarTodo}
            className="text-xs text-slate-400 hover:text-white ml-1 cursor-pointer hidden sm:block"
            title="Deseleccionar todos"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
