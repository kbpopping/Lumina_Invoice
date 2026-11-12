export interface TaxConfig {
  id: string;
  name: string;
  rate: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  swiftCode?: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
}

export interface BusinessProfile {
  name: string;
  email: string;
  address: string;
  phone: string;
  website?: string;
  logoUrl?: string;
  primaryColor: string;
  templateId: 'clean' | 'bold' | 'sidebar';
  country?: string;
  state?: string;
  currency: string;
  logoShape?: 'square' | 'circle' | 'triangle';
  taxes: TaxConfig[];
  bankAccounts: BankAccount[];
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  productId?: string;
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  paymentTerms?: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientAddress: string;
  items: InvoiceItem[];
  status: 'draft' | 'sent' | 'paid';
  total: number;
  amountPaid?: number;
  outstandingBalance?: number;
  notes?: string;
  appliedTaxId?: string;
  taxTotal?: number;
}

export interface ChartDataPoint {
  name: string;
  amount: number;
}