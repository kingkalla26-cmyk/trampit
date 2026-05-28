import { Navigation } from 'lucide-react';

export default function SplashScreen({ fading = false }) {
  return (
    <div
      style={{ transition: 'opacity 0.55s ease' }}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white ${fading ? 'opacity-0' : 'opacity-100'}`}
    >
      {/* Logo with pulse */}
      <div className="animate-pulse mb-7">
        <div className="w-24 h-24 rounded-3xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-200">
          <Navigation size={48} className="text-white" strokeWidth={1.5} />
        </div>
      </div>

      {/* Brand name */}
      <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-none mb-2" style={{ fontFamily: 'Heebo, sans-serif' }}>
        טרמפ<span className="text-blue-600">יט</span>
      </h1>
      <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full mb-14 tracking-wide">
        v0.2 · BETA
      </span>

      {/* Spinner + text */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 rounded-full border-2 border-slate-200 border-t-blue-500 animate-spin" />
        <p className="text-sm text-slate-400 font-medium" style={{ fontFamily: 'Heebo, sans-serif' }}>
          טוען נתונים...
        </p>
      </div>
    </div>
  );
}
