import { AlertCircle, CheckCircle2, Circle, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DocumentRecord, Deduction } from '../shared/contracts';

export const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
export function date(value?: string, withYear = false) {
  if (!value) return '—';
  const result = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(result.valueOf()) ? value : result.toLocaleDateString('en-US', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
}
export function dateTime(value?: string) {
  if (!value) return 'Time unavailable';
  return new Date(value).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function docLabel(doc: DocumentRecord) {
  return { bol: 'Original BOL', invoice: 'Invoice', scan: 'Historical scan', 'demo-pickup': 'Demo pickup' }[doc.kind];
}
export function evidence(deduction: Deduction) {
  return deduction.evidenceState === 'missing' ? { label: 'Historical scan missing', tone: 'warning' } : deduction.evidenceState === 'mismatch' ? { label: 'Match needs checking', tone: 'warning' } : { label: 'Files available', tone: 'neutral' };
}
export function daysUntil(deadline: string, sampleDate: string) {
  return Math.round((Date.parse(`${deadline}T12:00:00Z`) - Date.parse(`${sampleDate}T12:00:00Z`)) / 86400000);
}
export function deadlineLabel(deadline: string, sampleDate: string) {
  const days = daysUntil(deadline, sampleDate);
  return days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d remaining`;
}
export function Status({ children, tone = 'neutral', busy = false }: { children: ReactNode; tone?: string; busy?: boolean }) {
  const Icon = busy ? LoaderCircle : tone === 'success' ? CheckCircle2 : tone === 'warning' || tone === 'error' ? AlertCircle : Circle;
  return <span className={`status status--${tone}`}><Icon size={14} aria-hidden="true" className={busy ? 'spin' : ''} />{children}</span>;
}
export function Notice({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : undefined}><AlertCircle size={17} aria-hidden="true" /><div>{children}</div></div>;
}
