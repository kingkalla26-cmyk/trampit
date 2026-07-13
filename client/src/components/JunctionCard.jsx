import React from 'react';
import { MapPin, ArrowRight, ShieldCheck, ShieldAlert, Bus } from 'lucide-react';

const JunctionCard = ({ name, road, connectedRoads, direction, destination, isSafe, busLines }) => {
  return (
    <div className="group bg-[var(--card)] rounded-2xl shadow-[0_4px_20px_-5px_rgba(28,25,23,0.1)] border border-[var(--border)] p-6 w-full max-w-sm transition-all duration-300 hover:shadow-[0_8px_30px_-5px_rgba(28,25,23,0.15)] hover:-translate-y-0.5">

      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <h3 className="font-[var(--font-heading)] text-2xl font-extrabold text-[var(--foreground)] tracking-tight leading-tight">
          {name}
        </h3>
        <span className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 shrink-0 ml-3 ${
          isSafe
            ? 'bg-[rgba(var(--accent-rgb),0.08)] text-[var(--accent)] border border-[rgba(var(--accent-rgb),0.25)]'
            : 'bg-[rgba(var(--destructive-rgb),0.06)] text-[var(--destructive)] border border-[rgba(var(--destructive-rgb),0.22)]'
        }`}>
          {isSafe ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
          {isSafe ? 'בטוח' : 'מסוכן'}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[rgba(var(--primary-rgb),0.08)] flex items-center justify-center shrink-0">
            <MapPin size={14} className="text-[var(--primary)]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest mb-0.5">כביש ראשי</p>
            <p className="text-sm font-medium text-[var(--foreground)]">{road}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[rgba(var(--primary-rgb),0.08)] flex items-center justify-center shrink-0">
            <ArrowRight size={14} className="text-[var(--primary)]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest mb-0.5">חיבורים</p>
            <p className="text-sm font-medium text-[var(--foreground)]">{connectedRoads.join(', ')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[rgba(var(--accent-rgb),0.08)] flex items-center justify-center shrink-0">
            <Bus size={14} className="text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest mb-0.5">קווי אוטובוס</p>
            <p className="text-sm font-medium text-[var(--foreground)]">{busLines}</p>
          </div>
        </div>
      </div>

      {/* Destinations */}
      <div className="mt-5 pt-5 border-t border-[var(--border)]">
        <p className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest mb-3">שער כניסה ל</p>
        <div className="flex flex-wrap gap-1.5">
          {destination.map((city, index) => (
            <span
              key={index}
              className="bg-[var(--muted)] text-[var(--foreground)] px-2.5 py-1 rounded-full text-xs font-medium border border-[var(--border)] truncate max-w-[120px]"
            >
              {city}
            </span>
          ))}
        </div>
      </div>

      {/* Action Button */}
      <button className="mt-6 w-full bg-[var(--foreground)] hover:opacity-90 text-[var(--background)] font-[var(--font-heading)] font-bold py-3 rounded-xl transition-all duration-300 text-sm tracking-wide">
        נווט לצומת
      </button>
    </div>
  );
};

export default JunctionCard;
