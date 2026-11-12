import React, { useState, useEffect } from 'react';
import { Invoice, BusinessProfile } from '../types';
import { Button } from './ui/Button';
import { draftInvoiceEmail } from '../services/geminiService';

interface EmailModalProps {
  invoice: Invoice;
  profile: BusinessProfile;
  onClose: () => void;
}

export const EmailModal: React.FC<EmailModalProps> = ({ invoice, profile, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [emailData, setEmailData] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchEmail = async () => {
      const data = await draftInvoiceEmail(invoice, profile);
      setEmailData(data);
      setLoading(false);
    };
    fetchEmail();
  }, [invoice, profile]);

  const handleCopy = () => {
    if (!emailData) return;
    navigator.clipboard.writeText(`Subject: ${emailData.subject}\n\n${emailData.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    if (!emailData) return;
    const mailtoUrl = `mailto:${invoice.clientEmail}?subject=${encodeURIComponent(emailData.subject)}&body=${encodeURIComponent(emailData.body)}`;
    window.location.href = mailtoUrl;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <h3 className="font-bold text-slate-800">AI Email Draft</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-8 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-1/4"></div>
              <div className="h-10 bg-slate-100 rounded w-full"></div>
              <div className="h-4 bg-slate-200 rounded w-1/4"></div>
              <div className="h-32 bg-slate-100 rounded w-full"></div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Recipient</label>
                <div className="text-sm font-medium text-slate-700 bg-slate-50 px-3 py-2 rounded-md border border-slate-200">
                  {invoice.clientName} ({invoice.clientEmail || 'No email provided'})
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Subject</label>
                <input 
                  type="text" 
                  value={emailData?.subject || ''}
                  onChange={(e) => setEmailData(prev => prev ? { ...prev, subject: e.target.value } : null)}
                  className="w-full text-sm font-medium text-slate-700 bg-white px-3 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Message Body</label>
                <textarea 
                  rows={8}
                  value={emailData?.body || ''}
                  onChange={(e) => setEmailData(prev => prev ? { ...prev, body: e.target.value } : null)}
                  className="w-full text-sm text-slate-600 bg-white px-3 py-2 rounded-md border border-slate-300 focus:ring-2 focus:ring-slate-900 focus:outline-none resize-none font-serif"
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-between gap-4 bg-slate-50">
          <Button variant="ghost" onClick={handleCopy}>
            {copied ? '✅ Copied!' : 'Copy Text'}
          </Button>
          <div className="flex gap-3">
             <Button variant="secondary" onClick={onClose}>Close</Button>
             <Button onClick={handleSend} disabled={loading || !invoice.clientEmail}>
                Open in Mail App
             </Button>
          </div>
        </div>
      </div>
    </div>
  );
};