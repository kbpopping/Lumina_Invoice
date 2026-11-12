import React, { useState, useEffect } from 'react';
import { BusinessProfile, Invoice, Product, TaxConfig } from '../types';
import { Button } from './ui/Button';
import { InvoicePreview } from './InvoicePreview';

interface OnboardingProps {
  initialProfile: BusinessProfile;
  initialProducts?: Product[];
  onComplete: (profile: BusinessProfile) => void;
  onUpdateProducts: (products: Product[]) => void;
  onCancel?: () => void;
}

const dummyInvoice: Invoice = {
  id: 'preview',
  number: 'INV-001',
  date: new Date().toISOString().split('T')[0],
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  paymentTerms: 'Net 30',
  clientName: 'Sample Client',
  clientEmail: 'client@example.com',
  clientAddress: '123 Client St\nSan Francisco, CA 94105',
  items: [
    { id: '1', description: 'Professional Services', quantity: 1, rate: 1200 },
    { id: '2', description: 'Consulting Fee', quantity: 5, rate: 150 },
  ],
  status: 'draft',
  total: 1950,
  notes: 'Thank you for your business!',
};

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'CAD', symbol: '$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: '$', name: 'Australian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
];

const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Nigeria',
  'India',
  'South Africa',
  'Brazil',
  'Japan',
  'Other',
];

function compressLogoDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 400;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const pngResult = canvas.toDataURL('image/png');
      if (pngResult.length <= 450000) {
        resolve(pngResult);
      } else {
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const Onboarding: React.FC<OnboardingProps> = ({
  initialProfile,
  initialProducts = [],
  onComplete,
  onUpdateProducts,
  onCancel,
}) => {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<BusinessProfile>(initialProfile);
  const [onboardingProducts, setOnboardingProducts] = useState<Product[]>(initialProducts);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    setOnboardingProducts(initialProducts);
  }, [initialProducts]);

  const isSettingsMode = !!initialProfile.name;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressLogoDataUrl(reader.result as string);
        setProfile((prev) => ({ ...prev, logoUrl: compressed }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleShapeSelect = (shape: 'square' | 'circle' | 'triangle') => {
    setProfile((prev) => ({ ...prev, logoShape: shape }));
  };

  const addTax = () => {
    setProfile({
      ...profile,
      taxes: [
        ...profile.taxes,
        {
          id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
          name: '',
          rate: 0,
        },
      ],
    });
  };

  const removeTax = (id: string) => {
    setProfile({ ...profile, taxes: profile.taxes.filter((t) => t.id !== id) });
  };

  const handleTaxChange = (id: string, field: keyof TaxConfig, value: any) => {
    setProfile({
      ...profile,
      taxes: profile.taxes.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
    });
  };

  const addBankAccount = () => {
    setProfile({
      ...profile,
      bankAccounts: [
        ...profile.bankAccounts,
        {
          id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
          bankName: '',
          accountName: '',
          accountNumber: '',
          swiftCode: '',
        },
      ],
    });
  };

  const removeBankAccount = (id: string) => {
    setProfile({ ...profile, bankAccounts: profile.bankAccounts.filter((b) => b.id !== id) });
  };

  const handleBankChange = (id: string, field: keyof any, value: any) => {
    setProfile({
      ...profile,
      bankAccounts: profile.bankAccounts.map((b) =>
        b.id === id ? { ...b, [field]: value } : b
      ),
    });
  };

  const addProd = () => {
    setOnboardingProducts([
      ...onboardingProducts,
      {
        id: Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
        name: '',
        price: 0,
      },
    ]);
  };

  const removeProd = (id: string) => {
    setOnboardingProducts(onboardingProducts.filter((p) => p.id !== id));
  };

  const handleProdChange = (id: string, field: keyof Product, value: any) => {
    setOnboardingProducts(
      onboardingProducts.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleContinue = () => {
    setValidationError('');
    if (step === 1 && !profile.name.trim()) {
      setValidationError('Please enter your business name before continuing.');
      return;
    }
    if (step < 4) {
      setStep(step + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    if (!profile.name.trim()) {
      setStep(1);
      setValidationError('Please enter your business name.');
      return;
    }
    onUpdateProducts(onboardingProducts.filter((p) => p.name && p.name.trim()));
    onComplete({ ...profile, name: profile.name.trim() });
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            {isSettingsMode ? 'Settings' : 'Welcome to Lumina'}
          </h1>
          <p className="text-slate-500">
            Step {step} of 4:{' '}
            {step === 1
              ? 'Brand Identity'
              : step === 2
              ? 'Taxes'
              : step === 3
              ? 'Products'
              : 'Bank Details'}
          </p>
          {isSettingsMode && onCancel && (
            <div className="mt-4">
              <Button variant="ghost" onClick={onCancel}>
                Back to Dashboard
              </Button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col lg:flex-row">
          <div className="p-8 space-y-8 flex-1">
            {validationError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-lg">
                {validationError}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className={`h-32 w-32 flex items-center justify-center bg-slate-100 border-2 border-dashed border-slate-300 relative group overflow-hidden transition-all duration-300 ${
                        profile.logoShape === 'circle' ? 'rounded-full' : 'rounded-lg'
                      }`}
                    >
                      {profile.logoUrl ? (
                        <img
                          src={profile.logoUrl}
                          className="h-full w-full object-contain"
                          style={{
                            clipPath:
                              profile.logoShape === 'triangle'
                                ? 'polygon(50% 0%, 0% 100%, 100% 100%)'
                                : 'none',
                          }}
                          alt="Business Logo"
                        />
                      ) : (
                        <span className="text-xs text-slate-400 text-center px-2">
                          Click to Upload Logo
                        </span>
                      )}
                      <input
                        type="file"
                        onChange={handleLogoUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        accept="image/*"
                      />
                    </div>
                    <div className="flex gap-2">
                      {(['square', 'circle', 'triangle'] as const).map((shape) => (
                        <button
                          key={shape}
                          type="button"
                          onClick={() => handleShapeSelect(shape)}
                          className={`p-2 border rounded transition-all ${
                            profile.logoShape === shape
                              ? 'border-slate-900 bg-slate-100'
                              : 'border-slate-200'
                          }`}
                          title={`Select ${shape} shape`}
                        >
                          <div
                            className={`w-4 h-4 bg-slate-400 ${
                              shape === 'circle' ? 'rounded-full' : ''
                            }`}
                            style={{
                              clipPath:
                                shape === 'triangle'
                                  ? 'polygon(50% 0%, 0% 100%, 100% 100%)'
                                  : 'none',
                            }}
                          ></div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Business Name *
                      </label>
                      <input
                        type="text"
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        placeholder="e.g. Sepham Tech Engineering Ltd"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Invoice Template
                        </label>
                        <select
                          value={profile.templateId}
                          onChange={(e) =>
                            setProfile({
                              ...profile,
                              templateId: e.target.value as 'clean' | 'bold' | 'sidebar',
                            })
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        >
                          <option value="clean">Clean Minimal</option>
                          <option value="bold">Bold Header</option>
                          <option value="sidebar">Modern Sidebar</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Brand Primary Color
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={profile.primaryColor}
                            onChange={(e) =>
                              setProfile({ ...profile, primaryColor: e.target.value })
                            }
                            className="h-10 w-12 border-none cursor-pointer rounded-md"
                          />
                          <input
                            type="text"
                            value={profile.primaryColor}
                            onChange={(e) =>
                              setProfile({ ...profile, primaryColor: e.target.value })
                            }
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm font-mono uppercase focus:ring-2 focus:ring-slate-900"
                            placeholder="#000000"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Business Address
                    </label>
                    <textarea
                      value={profile.address}
                      onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md h-20 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      placeholder="Street Address, Building, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                    <select
                      value={profile.country}
                      onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    >
                      <option value="">Select Country</option>
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      State / Province / Region
                    </label>
                    <input
                      type="text"
                      value={profile.state}
                      onChange={(e) => setProfile({ ...profile, state: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      placeholder="e.g. Abuja"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 focus:outline-none"
                      placeholder="hello@business.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Currency Preference
                    </label>
                    <select
                      value={profile.currency}
                      onChange={(e) => setProfile({ ...profile, currency: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} - {c.symbol} - {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-800">Tax Settings</h3>
                  <Button size="sm" variant="secondary" onClick={addTax}>
                    + Add Tax Type
                  </Button>
                </div>
                <div className="space-y-4">
                  {profile.taxes.length === 0 && (
                    <p className="text-sm text-slate-400">
                      No taxes configured. You can skip this or add taxes like VAT, GST, or Sales Tax.
                    </p>
                  )}
                  {profile.taxes.map((t) => (
                    <div
                      key={t.id}
                      className="flex gap-3 items-end bg-slate-50 p-4 rounded-lg border border-slate-100"
                    >
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400">
                          Tax Name (e.g. VAT)
                        </label>
                        <input
                          type="text"
                          value={t.name}
                          onChange={(e) => handleTaxChange(t.id, 'name', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900"
                        />
                      </div>
                      <div className="w-24">
                        <label className="text-[10px] uppercase font-bold text-slate-400">
                          Rate (%)
                        </label>
                        <input
                          type="number"
                          value={t.rate}
                          onChange={(e) =>
                            handleTaxChange(t.id, 'rate', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTax(t.id)}
                        className="mb-2 p-2 text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-800">Standard Products/Services</h3>
                  <Button size="sm" variant="secondary" onClick={addProd}>
                    + Add Item
                  </Button>
                </div>
                <p className="text-sm text-slate-500">
                  Manage common items you bill for to speed up future invoice creation.
                </p>
                <div className="space-y-4 overflow-y-auto max-h-96 pr-2">
                  {onboardingProducts.length === 0 && (
                    <p className="text-sm text-slate-400">
                      No products added yet. Click "+ Add Item" or manage them anytime in Inventory.
                    </p>
                  )}
                  {onboardingProducts.map((p) => (
                    <div
                      key={p.id}
                      className="flex gap-3 items-end bg-slate-50 p-4 rounded-lg border border-slate-100"
                    >
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400">
                          Item Name
                        </label>
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => handleProdChange(p.id, 'name', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900"
                          placeholder="e.g. Logo Design"
                        />
                      </div>
                      <div className="w-32">
                        <label className="text-[10px] uppercase font-bold text-slate-400">
                          Default Price
                        </label>
                        <input
                          type="number"
                          value={p.price}
                          onChange={(e) =>
                            handleProdChange(p.id, 'price', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900"
                          placeholder="0.00"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProd(p.id)}
                        className="mb-2 p-2 text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-800">Bank Account Details</h3>
                  <Button size="sm" variant="secondary" onClick={addBankAccount}>
                    + Add Bank Account
                  </Button>
                </div>
                <p className="text-sm text-slate-500">
                  Add your bank details so clients know where to pay. You can add multiple accounts.
                </p>
                <div className="space-y-6 overflow-y-auto max-h-96 pr-2">
                  {profile.bankAccounts.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                      <p className="text-slate-400 text-sm">No bank accounts added yet.</p>
                    </div>
                  )}
                  {profile.bankAccounts.map((b) => (
                    <div
                      key={b.id}
                      className="bg-slate-50 p-6 rounded-xl border border-slate-200 relative group"
                    >
                      <button
                        type="button"
                        onClick={() => removeBankAccount(b.id)}
                        className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400">
                            Bank Name
                          </label>
                          <input
                            type="text"
                            value={b.bankName}
                            onChange={(e) => handleBankChange(b.id, 'bankName', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900"
                            placeholder="e.g. Zenith Bank"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400">
                            Account Name
                          </label>
                          <input
                            type="text"
                            value={b.accountName}
                            onChange={(e) => handleBankChange(b.id, 'accountName', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900"
                            placeholder="e.g. Lumina Tech Ltd"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400">
                            Account Number
                          </label>
                          <input
                            type="text"
                            value={b.accountNumber}
                            onChange={(e) =>
                              handleBankChange(b.id, 'accountNumber', e.target.value)
                            }
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900"
                            placeholder="0000000000"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-400">
                            SWIFT / BIC Code (Optional)
                          </label>
                          <input
                            type="text"
                            value={b.swiftCode}
                            onChange={(e) => handleBankChange(b.id, 'swiftCode', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900"
                            placeholder="For international payments"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-8 border-t border-slate-100 flex justify-between">
              {step > 1 ? (
                <Button variant="ghost" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              ) : (
                <div></div>
              )}
              <Button onClick={handleContinue}>
                {step === 4 ? 'Finish Setup' : 'Continue'}
              </Button>
            </div>
          </div>

          <div className="hidden lg:flex w-1/2 bg-slate-200 p-8 items-start justify-center overflow-hidden">
            <div className="transform scale-[0.52] origin-top shadow-2xl rounded-lg overflow-hidden bg-white">
              <div className="w-[794px] pointer-events-none">
                <InvoicePreview profile={profile} invoice={dummyInvoice} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};