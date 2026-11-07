import React, { useState } from 'react';
import { usePWAInstall } from './usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    return sessionStorage.getItem('pwa_banner_dismissed') === 'true';
  });

  // If running in standalone mode (already installed), hide completely
  if (isInstalled) {
    return null;
  }

  const dismissBanner = () => {
    setIsDismissed(true);
    sessionStorage.setItem('pwa_banner_dismissed', 'true');
  };

  return (
    <>
      {/* Floating Prompt Banner (visible when installable or iOS and not dismissed) */}
      {!isDismissed && (isInstallable || isIOS) && (
        <aside
          aria-label="Aviso de instalación"
          className="fixed top-3 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-md z-50 bg-[#0b1626]/95 border-2 border-purple-500/80 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl shadow-2xl animate-fade-in flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-xl shrink-0">
              📲
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white tracking-tight truncate">
                Instalar 101 Buenos Malos Consejos
              </p>
              <p className="text-[11px] text-slate-300 truncate">
                Acceso rápido, audiolibro y modo offline.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isInstallable && (
              <button
                type="button"
                onClick={install}
                className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md cursor-pointer transition-all active:scale-95"
              >
                Instalar
              </button>
            )}

            {isIOS && !isInstallable && (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md cursor-pointer transition-all active:scale-95"
              >
                Instalar
              </button>
            )}

            <button
              type="button"
              onClick={dismissBanner}
              className="text-slate-400 hover:text-white p-1 text-sm cursor-pointer"
              title="Cerrar aviso"
            >
              ✕
            </button>
          </div>
        </aside>
      )}

      {/* Guided Modal for iOS Safari Users */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#0b1626] border border-purple-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📱</span>
                <h3 className="text-base font-bold text-white">Instalar en iPhone / iPad</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Para instalar la aplicación web en tu pantalla de inicio en Safari:
            </p>

            <ol className="text-xs text-slate-300 space-y-3 bg-[#070f1b] p-3.5 rounded-xl border border-slate-800">
              <li className="flex items-start gap-2">
                <span className="font-bold text-purple-400 shrink-0">1.</span>
                <span>Toca el botón <strong>Compartir</strong> <span className="inline-block px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px]">⎋</span> en la barra inferior de Safari.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-purple-400 shrink-0">2.</span>
                <span>Desplázate hacia abajo y selecciona <strong>«Añadir a la pantalla de inicio»</strong> <span className="inline-block px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px]">⊞</span>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-purple-400 shrink-0">3.</span>
                <span>Toca <strong>«Añadir»</strong> en la esquina superior derecha para confirmar.</span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold uppercase transition-all shadow-md cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const PWAInstallHeaderButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="text-xs font-bold text-purple-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer bg-purple-950/40 hover:bg-purple-900/60 px-3 py-1.5 rounded-xl border border-purple-500/40 shrink-0"
        title="Instalar como aplicación en este dispositivo"
      >
        <span>📲</span>
        <span>Instalar App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="text-xs font-bold text-purple-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer bg-purple-950/40 hover:bg-purple-900/60 px-3 py-1.5 rounded-xl border border-purple-500/40 shrink-0"
          title="Cómo instalar en iPhone / iPad"
        >
          <span>📲</span>
          <span>Instalar App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm bg-[#0b1626] border border-purple-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">📱</span>
                  <h3 className="text-base font-bold text-white">Instalar en iPhone / iPad</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Para instalar la aplicación web en tu pantalla de inicio en Safari:
              </p>

              <ol className="text-xs text-slate-300 space-y-3 bg-[#070f1b] p-3.5 rounded-xl border border-slate-800">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-purple-400 shrink-0">1.</span>
                  <span>Toca el botón <strong>Compartir</strong> <span className="inline-block px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px]">⎋</span> en la barra de Safari.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-purple-400 shrink-0">2.</span>
                  <span>Desplázate hacia abajo y selecciona <strong>«Añadir a la pantalla de inicio»</strong> <span className="inline-block px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px]">⊞</span>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-purple-400 shrink-0">3.</span>
                  <span>Toca <strong>«Añadir»</strong> en la esquina superior derecha.</span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold uppercase transition-all shadow-md cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
