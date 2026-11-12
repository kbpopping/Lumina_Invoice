import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { BusinessProfile, Invoice, Product, Client } from './types';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import { InvoiceForm } from './components/InvoiceForm';
import { InvoicePreview } from './components/InvoicePreview';
import { Button } from './components/ui/Button';
import { EmailModal } from './components/EmailModal';
import { ProductManager } from './components/ProductManager';
import { Auth } from './components/Auth';
import { api } from './services/api';
import { auth } from './services/firebase';
import { generateInvoicePDF, paginateInvoiceItems } from './services/pdfGenerator';

const defaultProfile: BusinessProfile = {
  name: '',
  email: '',
  address: '',
  phone: '',
  primaryColor: '#0f172a',
  templateId: 'clean',
  currency: 'USD',
  country: '',
  state: '',
  logoShape: 'square',
  taxes: [],
  bankAccounts: [],
};

const defaultInvoice: Invoice = {
  id: '',
  number: 'INV-001',
  date: new Date().toISOString().split('T')[0],
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  paymentTerms: 'Net 30',
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  clientAddress: '',
  items: [{ id: '1', description: '', quantity: 1, rate: 0 }],
  status: 'draft',
  total: 0,
  notes: '',
};

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'onboarding' | 'dashboard' | 'editor' | 'products' | 'clients' | 'invoices'>('dashboard');
  const [profile, setProfile] = useState<BusinessProfile>(defaultProfile);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice>(defaultInvoice);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [editingLockedPaid, setEditingLockedPaid] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientForm, setClientForm] = useState<Partial<Client>>({ name: '', email: '', phone: '', address: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [verificationMsg, setVerificationMsg] = useState('');
  const [showPreviewGlobal, setShowPreviewGlobal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadAuthenticatedWorkspace = async (firebaseUser: User) => {
    setIsLoading(true);
    setActionError(null);
    try {
      await api.ensureUserDocument(firebaseUser);
      await api.migrateLegacyDataIfNeeded(firebaseUser);

      const [prof, invs, prods, cls] = await Promise.all([
        api.getProfile(),
        api.getInvoices(),
        api.getProducts(),
        api.getClients(),
      ]);

      setInvoices(invs || []);
      setProducts(prods || []);
      setClients(cls || []);

      if (prof && prof.name) {
        setProfile(prof);
        setView('dashboard');
      } else {
        setProfile({
          ...defaultProfile,
          email: firebaseUser.email || '',
        });
        setView('onboarding');
      }
    } catch (err: any) {
      console.error('Failed to load workspace data:', err);
      setActionError(err?.message || 'Could not load your account data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        if (!firebaseUser.emailVerified) {
          setNeedsEmailVerification(true);
          setIsLoading(false);
        } else {
          setNeedsEmailVerification(false);
          await loadAuthenticatedWorkspace(firebaseUser);
        }
      } else {
        setUser(null);
        setNeedsEmailVerification(false);
        setProfile(defaultProfile);
        setInvoices([]);
        setProducts([]);
        setClients([]);
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleCheckVerification = async () => {
    setVerificationMsg('');
    try {
      const refreshed = await api.refreshVerificationStatus();
      if (refreshed && refreshed.emailVerified) {
        setNeedsEmailVerification(false);
        setUser(refreshed);
        await loadAuthenticatedWorkspace(refreshed);
      } else {
        setVerificationMsg('Email not verified yet. Please click the verification link in your inbox (or check spam) and try again.');
      }
    } catch (err: any) {
      setVerificationMsg(err?.message || 'Could not check verification status.');
    }
  };

  const handleResendVerification = async () => {
    setVerificationMsg('');
    try {
      await api.resendVerificationEmail();
      setVerificationMsg('Verification email sent! Please check your inbox and spam folder.');
    } catch (err: any) {
      setVerificationMsg(err?.message || 'Could not resend verification email. Please wait a moment.');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setNeedsEmailVerification(false);
    setProfile(defaultProfile);
    setInvoices([]);
    setProducts([]);
    setClients([]);
    setView('dashboard');
  };

  const generateId = () => Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

  const saveProfile = async (newProfile: BusinessProfile) => {
    setProfile(newProfile);
    await api.saveProfile(newProfile);
    setView('dashboard');
  };

  const handleCreateNew = () => {
    const nextNum = invoices.length + 1;
    setCurrentInvoice({
      ...defaultInvoice,
      id: generateId(),
      number: `INV-${nextNum.toString().padStart(3, '0')}`,
      date: new Date().toISOString().split('T')[0],
      items: [{ id: generateId(), description: '', quantity: 1, rate: 0 }],
      total: 0,
    });
    setIsEditingExisting(false);
    setEditingLockedPaid(false);
    setView('editor');
  };

  const handleEditInvoice = (inv: Invoice) => {
    setCurrentInvoice(inv);
    setIsEditingExisting(true);
    setEditingLockedPaid(inv.status === 'paid');
    setView('editor');
  };

  const handleSaveInvoice = async (status: 'draft' | 'sent' | 'paid' = 'draft') => {
    setActionError(null);
    try {
      if (editingLockedPaid) {
        // Paid invoices are locked; create a duplicate if user wants a new version
        const duplicateInvoice: Invoice = {
          ...currentInvoice,
          id: generateId(),
          number: `${currentInvoice.number}-COPY`,
          status,
        };
        await api.saveInvoice(duplicateInvoice);
      } else {
        const finalStatus = currentInvoice.status === 'paid' ? 'paid' : status;
        const invoiceToSave = { ...currentInvoice, status: finalStatus };
        await api.saveInvoice(invoiceToSave);
      }

      const updatedInvoices = await api.getInvoices();
      setInvoices(updatedInvoices);
      setView('dashboard');
    } catch (err: any) {
      console.error('Failed to save invoice:', err);
      setActionError(err?.message || 'Could not save invoice.');
    }
  };

  const handleUpdateProducts = async (newProducts: Product[]) => {
    setProducts(newProducts);
    await api.saveProducts(newProducts);
  };

  const handlePrint = async () => {
    setIsDownloading(true);
    try {
      await generateInvoicePDF(profile, currentInvoice);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  const handleMarkAsPaid = async (inv: Invoice) => {
    await api.updateInvoiceStatus(inv.id, 'paid');
    const updatedInvoices = await api.getInvoices();
    setInvoices(updatedInvoices);
    if (currentInvoice && currentInvoice.id === inv.id) {
      setCurrentInvoice({ ...currentInvoice, status: 'paid', amountPaid: inv.total, outstandingBalance: 0 });
    }
  };

  const handleDownloadFromDashboard = async (inv: Invoice) => {
    setCurrentInvoice(inv);
    setShowPreviewGlobal(true);
  };

  const handleSaveClient = async () => {
    if (!clientForm.name || !clientForm.email) return;
    const newClient: Client = {
      id: generateId(),
      name: clientForm.name,
      email: clientForm.email,
      phone: clientForm.phone,
      address: clientForm.address,
    };
    await api.saveClient(newClient);
    const updatedClients = await api.getClients();
    setClients(updatedClients);
    setClientForm({ name: '', email: '', phone: '', address: '' });
    setShowClientForm(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium tracking-tight">Syncing your cloud workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (needsEmailVerification) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 p-8 text-center space-y-5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 text-white text-2xl font-black">
            ✉
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Verify Your Email</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              We sent a verification link to <strong className="text-slate-800">{user.email}</strong>.
              Please open your inbox and verify your email so your account and invoice data can be securely synced to Firestore.
            </p>
          </div>
          {verificationMsg && (
            <div className="p-3 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium rounded-xl">
              {verificationMsg}
            </div>
          )}
          <div className="space-y-3 pt-2">
            <Button onClick={handleCheckVerification} className="w-full py-3 rounded-xl">
              I&apos;ve Verified My Email — Continue
            </Button>
            <Button variant="secondary" onClick={handleResendVerification} className="w-full py-2.5 rounded-xl">
              Resend Verification Email
            </Button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline pt-1"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'onboarding') {
    return (
      <Onboarding
        initialProfile={profile}
        initialProducts={products}
        onComplete={saveProfile}
        onUpdateProducts={handleUpdateProducts}
        onCancel={profile.name ? () => setView('dashboard') : undefined}
      />
    );
  }

  const previewSlices = paginateInvoiceItems(currentInvoice.items || []);

  if (view === 'dashboard' || view === 'clients' || view === 'invoices') {
    return (
      <div className="min-h-screen bg-slate-50">
        {actionError && (
          <div className="max-w-6xl mx-auto px-6 pt-4">
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex justify-between items-center">
              <span>{actionError}</span>
              <button onClick={() => setActionError(null)} className="text-red-500 font-bold px-2">
                ✕
              </button>
            </div>
          </div>
        )}
        <Dashboard
          invoices={invoices}
          onCreateNew={handleCreateNew}
          onEdit={handleEditInvoice}
          onMarkAsPaid={handleMarkAsPaid}
          onDownload={handleDownloadFromDashboard}
          onPreview={(inv) => {
            setCurrentInvoice(inv);
            setShowPreviewGlobal(true);
          }}
          currency={profile.currency}
          onManageProducts={() => setView('products')}
          onOpenSettings={() => setView('onboarding')}
          onOpenClients={() => setView('clients')}
          onOpenInvoices={() => setView('invoices')}
          onOpenAccount={() => setView('onboarding')}
          onLogout={handleLogout}
          profileName={profile.name || user.email || 'Workspace'}
        />
        {showPreviewGlobal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-slate-900">
                    {currentInvoice.status === 'paid' ? 'Receipt Preview' : 'Invoice Preview'}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      currentInvoice.status === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : currentInvoice.status === 'sent'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {currentInvoice.status}
                  </span>
                </div>
                <div className="flex gap-3 items-center">
                  <Button onClick={handlePrint} isLoading={isDownloading}>
                    {isDownloading ? 'Generating PDF...' : 'Download PDF'}
                  </Button>
                  <button
                    onClick={() => setShowPreviewGlobal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                  >
                    <span className="text-xl">✕</span>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 bg-slate-200/70">
                <div className="flex flex-col items-center gap-6">
                  {previewSlices.map((slice) => (
                    <div
                      key={slice.pageNumber}
                      className="w-full max-w-[794px] bg-white shadow-xl rounded-sm overflow-hidden"
                    >
                      <InvoicePreview
                        profile={profile}
                        invoice={currentInvoice}
                        itemsOverride={slice.items}
                        isFirstPage={slice.isFirstPage}
                        isLastPage={slice.isLastPage}
                        pageNumber={slice.pageNumber}
                        totalPages={slice.totalPages}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {view === 'invoices' && (
          <div className="fixed inset-0 z-50 bg-white p-8 animate-in slide-in-from-bottom duration-300 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Invoice History</h2>
                <button
                  onClick={() => setView('dashboard')}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <span className="text-2xl">✕</span>
                </button>
              </div>
              <div className="grid gap-4">
                {invoices.length === 0 ? (
                  <p className="text-center py-12 text-slate-400 font-medium italic">No invoices found.</p>
                ) : (
                  invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-400 transition-all shadow-sm"
                    >
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-black text-slate-900">#{invoice.number}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
                              invoice.status === 'paid'
                                ? 'bg-green-100 text-green-700'
                                : invoice.status === 'sent'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {invoice.status}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 font-medium">To: {invoice.clientName}</p>
                        <p className="text-xs text-slate-400 font-medium">Date: {invoice.date}</p>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-xl font-black text-slate-900">
                          {profile.currency} {invoice.total.toFixed(2)}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setCurrentInvoice(invoice);
                              setShowPreviewGlobal(true);
                            }}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => handleEditInvoice(invoice)}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                          >
                            {invoice.status === 'paid' ? 'View' : 'Edit'}
                          </button>
                          {invoice.status !== 'paid' && (
                            <button
                              onClick={() => handleMarkAsPaid(invoice)}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                            >
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        {view === 'clients' && (
          <div className="fixed inset-0 z-50 bg-white p-8 animate-in slide-in-from-bottom duration-300 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold">Client List</h2>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setShowClientForm(true)}>
                    + Add Client
                  </Button>
                  <Button onClick={() => setView('dashboard')}>Back to Dashboard</Button>
                </div>
              </div>

              {showClientForm && (
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8 animate-in fade-in slide-in-from-top-4">
                  <h3 className="text-lg font-bold mb-4">Add New Client</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
                      <input
                        type="text"
                        value={clientForm.name}
                        onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900"
                        placeholder="Client Name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                      <input
                        type="email"
                        value={clientForm.email}
                        onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900"
                        placeholder="client@email.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Phone</label>
                      <input
                        type="tel"
                        value={clientForm.phone}
                        onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900"
                        placeholder="+1..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Address</label>
                      <textarea
                        value={clientForm.address}
                        onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 h-10"
                        placeholder="Address..."
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setShowClientForm(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveClient}>Save Client</Button>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-4 font-bold text-slate-600">Name</th>
                      <th className="p-4 font-bold text-slate-600">Email</th>
                      <th className="p-4 font-bold text-slate-600">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      new Set([
                        ...invoices.map((i) => i.clientEmail).filter(Boolean),
                        ...clients.map((c) => c.email).filter(Boolean),
                      ])
                    ).map((email) => {
                      const clientFromHistory = invoices.find((i) => i.clientEmail === email);
                      const clientFromList = clients.find((c) => c.email === email);
                      const client = clientFromList || clientFromHistory;
                      if (!client) return null;
                      const name = 'clientName' in client ? client.clientName : client.name;
                      const phone = 'clientPhone' in client ? client.clientPhone : client.phone;

                      return (
                        <tr key={email} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="p-4 font-medium">{name}</td>
                          <td className="p-4 text-slate-500">{email}</td>
                          <td className="p-4 text-slate-500">{phone || 'N/A'}</td>
                        </tr>
                      );
                    })}
                    {invoices.length === 0 && clients.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-slate-400">
                          No clients in your history yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'products') {
    return (
      <div className="min-h-screen bg-slate-50">
        <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView('dashboard')}>
              &larr; Back
            </Button>
            <span className="font-bold text-slate-800 tracking-tight">Product Inventory</span>
          </div>
        </nav>
        <ProductManager
          products={products}
          onUpdate={handleUpdateProducts}
          currency={profile.currency}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col h-screen overflow-hidden print:h-auto print:overflow-visible print:bg-white">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center z-30 shrink-0 no-print">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setView('dashboard')}>
            &larr; Dashboard
          </Button>
          <span className="text-slate-300">|</span>
          <h2 className="font-semibold text-slate-800">
            {isEditingExisting ? (editingLockedPaid ? 'Paid Receipt (Finalized)' : 'Edit Invoice') : 'New Invoice'}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEmailModal(true)}
            disabled={!currentInvoice.clientName || !currentInvoice.clientEmail}
          >
            <span>✉️ Send to Client</span>
          </Button>
          <Button variant="secondary" onClick={handlePrint} isLoading={isDownloading}>
            {isDownloading ? 'Generating...' : 'Download PDF'}
          </Button>
        </div>
      </header>

      {actionError && (
        <div className="px-6 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm flex justify-between items-center no-print">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-bold px-2">
            ✕
          </button>
        </div>
      )}

      {editingLockedPaid && (
        <div className="px-6 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-medium flex justify-between items-center no-print">
          <span>
            This invoice is marked Paid and finalized. Saving changes will create a new copy.
          </span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden print:block print:h-auto print:overflow-visible">
        <div className="w-full md:w-1/2 overflow-y-auto p-4 md:p-8 border-r border-slate-200 bg-slate-50 no-print">
          <InvoiceForm
            invoice={currentInvoice}
            onChange={setCurrentInvoice}
            onSave={() => handleSaveInvoice('sent')}
            onSaveDraft={() => handleSaveInvoice('draft')}
            onCancel={() => setView('dashboard')}
            onPrint={handlePrint}
            onSend={() => setShowEmailModal(true)}
            currency={profile.currency}
            isLoadingPDF={isDownloading}
            products={products}
            taxes={profile.taxes}
          />
        </div>

        <div className="hidden md:flex w-1/2 bg-slate-500 overflow-y-auto p-6 justify-center items-start print:w-full print:p-0 print:m-0 print:bg-white print:overflow-visible print:h-auto print:block">
          <div className="w-full flex flex-col items-center gap-6 scale-[0.78] lg:scale-[0.85] origin-top print:scale-100">
            {previewSlices.map((slice) => (
              <div
                key={slice.pageNumber}
                id={slice.pageNumber === 1 ? 'invoice-capture-area' : undefined}
                className="bg-white shadow-2xl print:shadow-none w-[794px] print:w-full print:max-w-none"
              >
                <InvoicePreview
                  profile={profile}
                  invoice={currentInvoice}
                  itemsOverride={slice.items}
                  isFirstPage={slice.isFirstPage}
                  isLastPage={slice.isLastPage}
                  pageNumber={slice.pageNumber}
                  totalPages={slice.totalPages}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {showEmailModal && (
        <EmailModal
          invoice={currentInvoice}
          profile={profile}
          onClose={() => setShowEmailModal(false)}
        />
      )}
    </div>
  );
}

export default App;