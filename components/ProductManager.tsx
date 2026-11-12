import React, { useState } from 'react';
import { Product } from '../types';
import { Button } from './ui/Button';

interface ProductManagerProps {
  products: Product[];
  onUpdate: (products: Product[]) => void;
  currency: string;
}

export const ProductManager: React.FC<ProductManagerProps> = ({ products, onUpdate, currency }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', price: 0 });

  const handleSave = () => {
      if (!form.name) return;
      
      let newProducts;
      if (editingId) {
          newProducts = products.map(p => p.id === editingId ? { ...p, ...form } : p);
      } else {
          newProducts = [...products, { id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36), ...form }];
      }
      
      onUpdate(newProducts);
      reset();
  };

  const reset = () => {
      setIsAdding(false);
      setEditingId(null);
      setForm({ name: '', price: 0 });
  };

  const startEdit = (p: Product) => {
      setEditingId(p.id);
      setForm({ name: p.name, price: p.price });
      setIsAdding(true);
  };

  const handleDelete = (id: string) => {
      if (confirm('Are you sure you want to delete this product?')) {
          onUpdate(products.filter(p => p.id !== id));
      }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex justify-between items-center mb-8">
          <div>
              <h2 className="text-2xl font-bold text-slate-900">Inventory</h2>
              <p className="text-slate-500">Manage your recurring services and products.</p>
          </div>
          <Button onClick={() => setIsAdding(true)} disabled={isAdding}>+ Add Product</Button>
      </div>

      {isAdding && (
          <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-md mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
              <h3 className="font-semibold text-slate-800 mb-4">{editingId ? 'Edit Product' : 'Add New Product'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Product/Service Name</label>
                      <input 
                        type="text" 
                        value={form.name} 
                        onChange={e => setForm({...form, name: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                        placeholder="e.g. Website Design"
                      />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Standard Price ({currency})</label>
                      <input 
                        type="number" 
                        value={form.price} 
                        onChange={e => setForm({...form, price: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                      />
                  </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                  <Button variant="ghost" onClick={reset}>Cancel</Button>
                  <Button onClick={handleSave}>Save Product</Button>
              </div>
          </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
              <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Product Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Standard Price</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Actions</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                  {products.length === 0 ? (
                      <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-slate-400">No products in inventory yet.</td>
                      </tr>
                  ) : (
                      products.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-medium text-slate-900">{p.name}</td>
                              <td className="px-6 py-4 text-right text-slate-600 font-mono">
                                  {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(p.price)}
                              </td>
                              <td className="px-6 py-4 text-right space-x-3">
                                  <button onClick={() => startEdit(p)} className="text-sm text-indigo-600 hover:underline">Edit</button>
                                  <button onClick={() => handleDelete(p.id)} className="text-sm text-red-500 hover:underline">Delete</button>
                              </td>
                          </tr>
                      ))
                  )}
              </tbody>
          </table>
      </div>
    </div>
  );
};