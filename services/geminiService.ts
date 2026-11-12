import { Invoice, BusinessProfile } from "../types";

const getHeaders = () => {
  const token = localStorage.getItem('lumina_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

export const expandLineItemDescription = async (shortDescription: string): Promise<string> => {
  if (!shortDescription) return '';

  try {
    const res = await fetch('/api/ai/expand', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ description: shortDescription }),
    });

    if (!res.ok) return shortDescription;
    const data = await res.json();
    return data.text || shortDescription;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return shortDescription;
  }
};

export const analyzeFinancials = async (invoices: Invoice[]): Promise<string> => {
  if (!invoices || invoices.length === 0) return "No invoice data available for analysis.";

  try {
    const res = await fetch('/api/ai/insights', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ invoices }),
    });

    if (!res.ok) return "Could not generate financial analysis at this time.";
    const data = await res.json();
    return data.text || "Could not generate financial analysis at this time.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Could not generate financial analysis at this time.";
  }
};

export const draftInvoiceEmail = async (invoice: Invoice, profile: BusinessProfile): Promise<{ subject: string; body: string }> => {
  const defaultFallback = { 
    subject: `Invoice ${invoice.number} from ${profile.name || 'Your Company'}`, 
    body: `Hi ${invoice.clientName || 'there'},\n\nPlease find invoice ${invoice.number} attached for your records.\n\nTotal: ${invoice.total} ${profile.currency}\nDue Date: ${invoice.dueDate}\n\nBest regards,\n${profile.name || ''}` 
  };

  try {
    const res = await fetch('/api/ai/draft-email', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ invoice, profile }),
    });

    if (!res.ok) return defaultFallback;
    const data = await res.json();
    return {
      subject: data.subject || defaultFallback.subject,
      body: data.body || defaultFallback.body
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return defaultFallback;
  }
};
