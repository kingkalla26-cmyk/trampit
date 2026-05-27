import React from 'react';
import { MapPin, ArrowRight, ShieldCheck, ShieldAlert, Bus } from 'lucide-react';

const JunctionCard = ({ name, road, connectedRoads, direction, destination, isSafe, busLines }) => {
  return (
    <div className="group bg-white rounded-2xl shadow-[0_4px_20px_-5px_rgba(0,0,0,0.1)] border border-slate-100 p-6 w-full max-w-sm transition-all duration-300 hover:shadow-[0_8px_30px_-5px_rgba(0,0,0,0.15)] hover:-translate-y-0.5">

      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">
          {name}
        </h3>
        <span className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 shrink-0 ml-3 ${
          isSafe
            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
            : 'bg-red-50 text-red-500 border border-red-100'
        }`}>
          {isSafe ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
          {isSafe ? 'בטוח' : 'מסוכן'}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <MapPin size={14} className="text-blue-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">כביש ראשי</p>
            <p className="text-sm font-medium text-slate-600">{road}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <ArrowRight size={14} className="text-blue-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">חיבורים</p>
            <p className="text-sm font-medium text-slate-600">{connectedRoads.join(', ')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Bus size={14} className="text-blue-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">קווי אוטובוס</p>
            <p className="text-sm font-medium text-slate-600">{busLines}</p>
          </div>
        </div>
      </div>

      {/* Destinations */}
      <div className="mt-5 pt-5 border-t border-slate-50">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">שער כניסה ל</p>
        <div className="flex flex-wrap gap-1.5">
          {destination.map((city, index) => (
            <span
              key={index}
              className="bg-slate-50 text-slate-600 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-100 truncate max-w-[120px]"
            >
              {city}
            </span>
          ))}
        </div>
      </div>

      {/* Action Button */}
      <button className="mt-6 w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-all duration-300 text-sm tracking-wide">
        נווט לצומת
      </button>
    </div>
  );
};

export default JunctionCard;
