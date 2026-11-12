import React, { useState } from 'react';
import { Invoice } from '../types';
import { Button } from './ui/Button';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { analyzeFinancials } from '../services/geminiService';

interface DashboardProps {
  invoices: Invoice[];
  onCreateNew: () => void;
  onEdit: (invoice: Invoice) => void;
  onMarkAsPaid: (invoice: Invoice) => void;
  onDownload: (invoice: Invoice) => void;
  onPreview: (invoice: Invoice) => void;
  currency: string;
  onManageProducts: () => void;
  onOpenSettings: () => void;
  onOpenClients: () => void;
  onOpenInvoices: () => void;
  onOpenAccount: () => void;
  onLogout: () => void;
  profileName: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  invoices, 
  onCreateNew, 
  onEdit, 
  onMarkAsPaid,
  onDownload,
  onPreview,
  currency, 
  onManageProducts,
  onOpenSettings,
  onOpenClients,
  onOpenInvoices,
  onOpenAccount,
  onLogout,
  profileName
}) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: currency || 'USD',
        maximumFractionDigits: 0
    }).format(amount);
  };

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const totalPaid = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.total, 0);
  const totalInvoices = invoices.length;
  
  const chartData = invoices.reduce((acc: any[], inv) => {
    const month = new Date(inv.date).toLocaleString('default', { month: 'short' });
    const existing = acc.find(d => d.name === month);
    if (existing) {
      existing.total += inv.total;
      if (inv.status === 'paid') {
        existing.paid += inv.total;
      }
    } else {
      acc.push({ 
        name: month, 
        total: inv.total, 
        paid: inv.status === 'paid' ? inv.total : 0 
      });
    }
    return acc;
  }, []);

  const handleGenerateInsight = async () => {
    setLoadingInsight(true);
    const result = await analyzeFinancials(invoices);
    setInsight(result);
    setLoadingInsight(false);
  };

  const getStatusBadge = (status: string) => {
      switch (status) {
          case 'paid':
              return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-600 border border-green-100">Paid</span>;
          case 'sent':
              return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-100">Sent</span>;
          default:
              return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">Draft</span>;
      }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 relative">
      {/* Navbar with Hamburger */}
      <div className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)} 
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-900"
            aria-label="Toggle Menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500">Welcome back, {profileName}</p>
          </div>
        </div>
        <div className="flex gap-3">
            <Button onClick={onCreateNew}>+ Create Invoice</Button>
        </div>
      </div>

      {/* Slide-out Menu */}
      {isMenuOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={() => setIsMenuOpen(false)} />
          <div className="fixed top-0 left-0 bottom-0 w-64 bg-white shadow-2xl z-50 p-6 flex flex-col animate-in slide-in-from-left duration-300">
            <div className="flex items-center gap-3 mb-10">
              <div className="w-10 h-10 rounded bg-slate-900 flex items-center justify-center text-white font-bold text-xl">L</div>
              <span className="font-bold text-slate-800 text-lg">Lumina</span>
            </div>
            
            <nav className="flex-1 space-y-2">
              <button onClick={() => { onOpenAccount(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-3 transition-colors">
                <span>👤</span> Account
              </button>
              <button onClick={() => { onManageProducts(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-3 transition-colors">
                <span>📦</span> Inventory
              </button>
              <button onClick={() => { onOpenClients(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-3 transition-colors">
                <span>👥</span> Clients
              </button>
              <button onClick={() => { onOpenInvoices(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-3 transition-colors">
                <span>📄</span> Invoices
              </button>
              <button onClick={() => { onOpenSettings(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 rounded-lg hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-3 transition-colors">
                <span>⚙️</span> Settings
              </button>
              <button 
                onClick={() => { onLogout(); setIsMenuOpen(false); }} 
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-red-50 text-red-600 font-medium flex items-center gap-3 transition-colors mt-4"
              >
                <span>Logout</span>
              </button>
            </nav>

            <div className="pt-6 border-t border-slate-100">
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest text-center">Version 1.2.0</p>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
           <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Revenue</div>
           <div className="text-xl font-bold text-slate-900 truncate">{formatCurrency(totalRevenue)}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
           <div className="text-[10px] font-bold text-green-500 uppercase tracking-widest mb-1">Total Paid</div>
           <div className="text-xl font-bold text-slate-900 truncate">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
           <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Invoices</div>
           <div className="text-xl font-bold text-slate-900">{totalInvoices}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
           <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">AI Financial Insight</div>
            {insight ? (
                <p className="text-[10px] text-slate-700 mt-2 leading-relaxed italic">"{insight}"</p>
            ) : (
                <button 
                  onClick={handleGenerateInsight} 
                  disabled={loadingInsight || invoices.length === 0}
                  className="mt-2 text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-1"
                >
                    {loadingInsight ? 'Analyzing...' : 'Analyze Business ✨'}
                </button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
             <h3 className="text-lg font-semibold text-slate-800 mb-6">Earnings Trend</h3>
             <div className="h-64">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" stroke="#cbd5e1" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#cbd5e1" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => formatCurrency(val)} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="total" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={32} name="Total Revenue" />
                      <Bar dataKey="paid" fill="#0f172a" radius={[4, 4, 0, 0]} barSize={32} name="Paid Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-300 italic text-sm">
                        Create your first invoice to see data.
                    </div>
                )}
             </div>
         </div>

         <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
             <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                 <h3 className="font-semibold text-slate-800">History</h3>
                 <span className="text-[10px] font-bold text-slate-400 uppercase">Latest 5</span>
             </div>
             <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[400px]">
                 {invoices.length === 0 && <div className="p-8 text-center text-slate-400 text-sm italic">No invoices found.</div>}
                 {invoices.slice().reverse().slice(0, 5).map(inv => (
                     <div key={inv.id} className="p-4 hover:bg-slate-50 transition-colors group relative">
                         <div className="flex justify-between items-center mb-1" onClick={() => onEdit(inv)}>
                             <span className="font-semibold text-slate-900 text-sm truncate max-w-[120px] group-hover:text-indigo-600 transition-colors cursor-pointer">{inv.clientName || 'Unnamed Draft'}</span>
                             <span className="text-sm font-bold text-slate-800">{formatCurrency(inv.total)}</span>
                         </div>
                         <div className="flex justify-between items-center mt-1">
                             <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">#{inv.number}</span>
                                {getStatusBadge(inv.status)}
                             </div>
                             <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {inv.status !== 'paid' && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onMarkAsPaid(inv); }}
                                        className="text-[10px] font-bold text-green-600 hover:text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100"
                                    >
                                        Mark Paid
                                    </button>
                                )}
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onPreview(inv); }}
                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-900 bg-indigo-50 px-2 py-1 rounded border border-indigo-100"
                                >
                                    Preview
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onDownload(inv); }}
                                    className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 px-2 py-1 rounded border border-slate-200"
                                >
                                    {inv.status === 'paid' ? 'Receipt' : 'PDF'}
                                </button>
                             </div>
                         </div>
                     </div>
                 ))}
             </div>
         </div>
      </div>
    </div>
  );
};