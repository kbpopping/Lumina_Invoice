import React, { useState, useEffect } from 'react';
import { Invoice, InvoiceItem, Product, TaxConfig } from '../types';
import { Button } from './ui/Button';
import { expandLineItemDescription } from '../services/geminiService';

interface InvoiceFormProps {
  invoice: Invoice;
  onChange: (inv: Invoice) => void;
  onSave: () => void;
  onSaveDraft: () => void;
  onCancel: () => void;
  onPrint?: () => void;
  onSend?: () => void;
  currency: string;
  isLoadingPDF?: boolean;
  products: Product[];
  taxes: TaxConfig[];
}

const CurrencyInput = ({ 
    value, 
    onChange, 
    currency 
}: { 
    value: number, 
    onChange: (val: number) => void, 
    currency: string 
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const [localValue, setLocalValue] = useState(value.toString());

    useEffect(() => {
        if (!isFocused) {
            setLocalValue(new Intl.NumberFormat('en-US', { 
                style: 'currency', 
                currency: currency, 
                minimumFractionDigits: 2,
                maximumFractionDigits: 2 
            }).format(value));
        }
    }, [value, currency, isFocused]);

    const handleFocus = () => {
        setIsFocused(true);
        setLocalValue(value.toString());
    };

    const handleBlur = () => {
        setIsFocused(false);
        const parsed = parseFloat(localValue.replace(/[^0-9.-]+/g, ''));
        onChange(isNaN(parsed) ? 0 : parsed);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalValue(val);
        const parsed = parseFloat(val.replace(/[^0-9.-]+/g, ''));
        if (!isNaN(parsed)) {
            onChange(parsed);
        } else {
            onChange(0);
        }
    };

    return (
        <input
            type="text"
            value={localValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm text-right font-mono"
        />
    );
};

export const InvoiceForm: React.FC<InvoiceFormProps> = ({ 
  invoice, onChange, onSave, onSaveDraft, onCancel, onPrint, onSend, currency, isLoadingPDF, products, taxes 
}) => {
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [availableTerms, setAvailableTerms] = useState<string[]>(['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60']);

  useEffect(() => {
    const saved = localStorage.getItem('lumina_custom_terms');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAvailableTerms(prev => Array.from(new Set([...prev, ...parsed])));
      } catch (e) {
        console.error("Failed to parse saved terms", e);
      }
    }
  }, []);

  const handleInputChange = (field: keyof Invoice, value: any) => {
    const updatedInvoice = { ...invoice, [field]: value };
    recalculateTotal(updatedInvoice.items, updatedInvoice.appliedTaxId, updatedInvoice);
    
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handlePaymentTermChange = (term: string) => {
    let updates: Partial<Invoice> = { paymentTerms: term };
    if (invoice.date && term) {
        if (term === 'Due on Receipt') {
            updates.dueDate = invoice.date;
        } else {
            const match = term.match(/Net (\d+)/i);
            if (match) {
                const days = parseInt(match[1]);
                const date = new Date(invoice.date);
                date.setDate(date.getDate() + days);
                if (!isNaN(date.getTime())) {
                     updates.dueDate = date.toISOString().split('T')[0];
                }
            }
        }
    }
    onChange({ ...invoice, ...updates });
  };

  const handleItemChange = (id: string, field: keyof InvoiceItem, value: any) => {
    const newItems = invoice.items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    );
    recalculateTotal(newItems, invoice.appliedTaxId);
  };

  const handleProductSelect = (itemId: string, productId: string) => {
      const product = products.find(p => p.id === productId);
      if (!product) return;
      
      const newItems = invoice.items.map(item => 
        item.id === itemId ? { 
            ...item, 
            description: product.name, 
            rate: product.price,
            productId: productId
        } : item
      );
      recalculateTotal(newItems, invoice.appliedTaxId);
  };

  const handleAmountPaidChange = (amtPaid: number) => {
    const outstanding = Math.max(0, invoice.total - amtPaid);
    const newStatus = (amtPaid >= invoice.total && invoice.total > 0) ? 'paid' : (invoice.status === 'paid' ? 'sent' : invoice.status);
    onChange({
      ...invoice,
      amountPaid: amtPaid,
      outstandingBalance: outstanding,
      status: newStatus
    });
  };

  const recalculateTotal = (items: InvoiceItem[], taxId?: string, overrideInvoice?: Invoice) => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    let taxTotal = 0;
    if (taxId) {
        const tax = taxes.find(t => t.id === taxId);
        if (tax) {
            taxTotal = subtotal * (tax.rate / 100);
        }
    }
    const base = overrideInvoice || invoice;
    const total = subtotal + taxTotal;
    const amtPaid = base.amountPaid || 0;
    const outstanding = Math.max(0, total - amtPaid);
    const newStatus = (amtPaid >= total && total > 0) ? 'paid' : (base.status === 'paid' ? 'sent' : base.status);
    onChange({ 
      ...base, 
      items, 
      total, 
      taxTotal, 
      appliedTaxId: taxId,
      outstandingBalance: outstanding,
      status: newStatus
    });
  };

  const addItem = () => {
    const newItem: InvoiceItem = {
      id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
      description: '',
      quantity: 1,
      rate: 0
    };
    recalculateTotal([...invoice.items, newItem], invoice.appliedTaxId);
  };

  const removeItem = (id: string) => {
    recalculateTotal(invoice.items.filter(i => i.id !== id), invoice.appliedTaxId);
  };

  const handleSmartExpand = async (id: string, currentDesc: string) => {
    if (!currentDesc.trim()) return;
    setLoadingItems(prev => ({ ...prev, [id]: true }));
    try {
      const expanded = await expandLineItemDescription(currentDesc);
      handleItemChange(id, 'description', expanded);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingItems(prev => ({ ...prev, [id]: false }));
    }
  };

  const formatLineTotal = (qty: number, rate: number) => {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(qty * rate);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Invoice Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Invoice Number</label>
            <input 
              type="text" 
              value={invoice.number} 
              onChange={e => handleInputChange('number', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Payment Terms</label>
            <select 
                value={invoice.paymentTerms || ''} 
                onChange={e => handlePaymentTermChange(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
            >
                <option value="">Select terms...</option>
                {availableTerms.map(term => <option key={term} value={term}>{term}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Date Issued</label>
            <input type="date" value={invoice.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Due Date</label>
            <input type="date" value={invoice.dueDate} onChange={e => handleInputChange('dueDate', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Client Information</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Client Name</label>
              <input type="text" value={invoice.clientName} onChange={e => handleInputChange('clientName', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Client Phone</label>
              <input type="tel" value={invoice.clientPhone || ''} onChange={e => handleInputChange('clientPhone', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" placeholder="+1 (555) 000-0000" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Client Email</label>
            <input type="email" value={invoice.clientEmail} onChange={e => handleInputChange('clientEmail', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" placeholder="client@example.com" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Client Address</label>
            <textarea value={invoice.clientAddress} onChange={e => handleInputChange('clientAddress', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md h-20 focus:ring-2 focus:ring-indigo-500" placeholder="123 Client St..." />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Items</h3>
        <div className="space-y-4">
          {invoice.items.map((item) => (
            <div key={item.id} className="p-4 border border-slate-100 rounded-lg bg-slate-50">
              <div className="grid grid-cols-12 gap-3 mb-2">
                  <div className="col-span-12 md:col-span-8">
                      <select 
                        value={item.productId || ''} 
                        onChange={(e) => handleProductSelect(item.id, e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white mb-2"
                      >
                          <option value="">-- Choose from Inventory --</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name} ({new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(p.price)})</option>)}
                      </select>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                        <button onClick={() => handleSmartExpand(item.id, item.description)} className="text-[10px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                            {loadingItems[item.id] ? <span className="animate-spin">✨</span> : <span>✨ AI Expand</span>}
                        </button>
                      </div>
                      <textarea value={item.description} onChange={(e) => handleItemChange(item.id, 'description', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" rows={2} />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Qty</label>
                      <input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-right" placeholder="1" />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Rate ({currency})</label>
                      <CurrencyInput value={item.rate} onChange={(val) => handleItemChange(item.id, 'rate', val)} currency={currency} />
                  </div>
              </div>
              <div className="flex justify-between items-center mt-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Item Total: <span className="text-slate-900">{formatLineTotal(item.quantity, item.rate)}</span>
                  </span>
                  <button onClick={() => removeItem(item.id)} className="text-xs text-red-500 hover:underline font-medium">Remove Item</button>
              </div>
            </div>
          ))}
          <Button variant="secondary" onClick={addItem} className="w-full py-2 border-dashed border-2 border-slate-200 bg-transparent text-slate-500">+ Add Line Item</Button>
          
          <div className="pt-4 border-t border-slate-100 flex flex-col items-end space-y-2">
              <div className="flex items-center gap-3 w-full md:w-1/2">
                  <span className="text-sm font-bold text-slate-600 whitespace-nowrap">Apply Tax:</span>
                  <select 
                    value={invoice.appliedTaxId || ''} 
                    onChange={(e) => recalculateTotal(invoice.items, e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm bg-white"
                  >
                      <option value="">No Tax</option>
                      {taxes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>)}
                  </select>
              </div>
              <div className="w-full md:w-1/2 border-t border-slate-50 pt-2 flex justify-between">
                  <span className="font-bold text-slate-800 uppercase text-xs tracking-wider">Total Due</span>
                  <span className="text-xl font-black text-slate-900">{new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(invoice.total)}</span>
              </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-2">💳 Installment & Payment Tracking</h3>
        <p className="text-xs text-slate-500 mb-4 font-medium">
          Tracking payments paid on installment? Enter the amount paid by the client below. The total of all line items is automatically calculated and the amount paid is deducted to find the <strong>Pending Balance</strong>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Amount Paid ({currency})</label>
            <CurrencyInput 
              value={invoice.amountPaid || 0} 
              onChange={handleAmountPaidChange} 
              currency={currency} 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Pending Balance (Auto)</label>
            <div className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-md text-sm font-mono text-right text-amber-600 font-bold leading-tight">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
                invoice.outstandingBalance !== undefined ? invoice.outstandingBalance : Math.max(0, invoice.total - (invoice.amountPaid || 0))
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
            <button
                type="button"
                onClick={() => {
                    onChange({
                        ...invoice,
                        status: 'paid',
                        amountPaid: invoice.total,
                        outstandingBalance: 0
                    });
                }}
                className="px-3 py-1.5 bg-green-50 text-green-700 font-bold text-xs rounded-lg border border-green-200 hover:bg-green-100 transition-colors"
            >
                ✓ Mark as Fully Paid (Pays remaining {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
                    invoice.outstandingBalance !== undefined ? invoice.outstandingBalance : Math.max(0, invoice.total - (invoice.amountPaid || 0))
                )})
            </button>
            {(invoice.amountPaid || 0) > 0 && (
                <button
                    type="button"
                    onClick={() => {
                        onChange({
                            ...invoice,
                            amountPaid: 0,
                            outstandingBalance: invoice.total
                        });
                    }}
                    className="px-3 py-1.5 bg-slate-100 text-slate-600 font-bold text-xs rounded-lg border border-slate-200 hover:bg-slate-200 transition-colors"
                >
                    ✕ Reset Payments
                </button>
            )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Invoice Notes</h3>
        <textarea 
          value={invoice.notes || ''} 
          onChange={e => handleInputChange('notes', e.target.value)} 
          className="w-full px-3 py-2 border border-slate-300 rounded-md h-32 focus:ring-2 focus:ring-indigo-500 text-sm" 
          placeholder="Thank you for your business! Please include the invoice number in your payment."
        />
      </div>

      <div className="pt-6 border-t border-slate-200 flex flex-col md:flex-row justify-between gap-4">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <div className="flex flex-col md:flex-row gap-3">
              <Button variant="ghost" onClick={onSend} className="text-indigo-600 hover:bg-indigo-50" disabled={!invoice.clientEmail}>✉️ Email to Client</Button>
              <Button variant="secondary" onClick={onSaveDraft}>Save Draft</Button>
              <Button onClick={onSave}>Save & Complete</Button>
          </div>
      </div>
    </div>
  );
};