import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { GoogleGenAI } from '@google/genai';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const getDirname = () => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {}
  return process.cwd();
};
const appDir = getDirname();

const JWT_SECRET = process.env.JWT_SECRET || 'lumina-secret-key-12345';
const DATA_STORE_FILE = path.join(process.cwd(), 'lumina_data_store.json');

const db = new Database('lumina.db');
db.pragma('journal_mode = WAL');

// Initialize Database Schema with case-insensitive email collation
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE COLLATE NOCASE,
    password TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS profile (
    id TEXT PRIMARY KEY,
    userId TEXT,
    name TEXT,
    email TEXT,
    address TEXT,
    phone TEXT,
    website TEXT,
    logoUrl TEXT,
    primaryColor TEXT,
    templateId TEXT,
    country TEXT,
    state TEXT,
    currency TEXT,
    logoShape TEXT,
    taxes TEXT, -- JSON array
    bankAccounts TEXT, -- JSON array
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    userId TEXT,
    number TEXT,
    date TEXT,
    dueDate TEXT,
    paymentTerms TEXT,
    clientName TEXT,
    clientEmail TEXT,
    clientPhone TEXT,
    clientAddress TEXT,
    status TEXT,
    total REAL,
    amountPaid REAL DEFAULT 0,
    outstandingBalance REAL DEFAULT 0,
    notes TEXT,
    appliedTaxId TEXT,
    taxTotal REAL,
    items TEXT, -- JSON array of InvoiceItem
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    userId TEXT,
    name TEXT,
    price REAL,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    userId TEXT,
    name TEXT,
    email TEXT COLLATE NOCASE,
    phone TEXT,
    address TEXT,
    FOREIGN KEY(userId) REFERENCES users(id)
  );
`);

// Safe migrations for existing databases
try {
  db.exec("ALTER TABLE invoices ADD COLUMN amountPaid REAL DEFAULT 0");
} catch (e) {}
try {
  db.exec("ALTER TABLE invoices ADD COLUMN outstandingBalance REAL DEFAULT 0");
} catch (e) {}

// Persistence helper: Backup SQLite data into a persistent JSON store
function saveStoreBackup() {
  try {
    const users = db.prepare('SELECT * FROM users').all();
    const profiles = db.prepare('SELECT * FROM profile').all();
    const invoices = db.prepare('SELECT * FROM invoices').all();
    const products = db.prepare('SELECT * FROM products').all();
    const clients = db.prepare('SELECT * FROM clients').all();

    const snapshot = {
      version: 1,
      updatedAt: new Date().toISOString(),
      users,
      profiles,
      invoices,
      products,
      clients
    };

    fs.writeFileSync(DATA_STORE_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write persistent store backup:', err);
  }
}

// Persistence helper: Restore SQLite data from JSON store if tables are empty
function restoreStoreBackup() {
  try {
    if (!fs.existsSync(DATA_STORE_FILE)) return;
    const raw = fs.readFileSync(DATA_STORE_FILE, 'utf-8');
    if (!raw) return;
    const snapshot = JSON.parse(raw);

    const userCount = (db.prepare('SELECT count(*) as count FROM users').get() as any)?.count || 0;
    if (userCount === 0 && Array.isArray(snapshot.users) && snapshot.users.length > 0) {
      console.log(`[Store] Restoring ${snapshot.users.length} users and associated data from persistent backup...`);
      
      const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, email, password, createdAt) VALUES (?, ?, ?, ?)');
      for (const u of snapshot.users) {
        insertUser.run(u.id, (u.email || '').trim().toLowerCase(), u.password, u.createdAt || new Date().toISOString());
      }

      if (Array.isArray(snapshot.profiles)) {
        const insertProfile = db.prepare(`
          INSERT OR REPLACE INTO profile 
          (id, userId, name, email, address, phone, website, logoUrl, primaryColor, templateId, country, state, currency, logoShape, taxes, bankAccounts) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of snapshot.profiles) {
          insertProfile.run(
            p.id, p.userId, p.name, p.email, p.address, p.phone, p.website,
            p.logoUrl, p.primaryColor, p.templateId, p.country, p.state, p.currency, p.logoShape,
            typeof p.taxes === 'string' ? p.taxes : JSON.stringify(p.taxes || []),
            typeof p.bankAccounts === 'string' ? p.bankAccounts : JSON.stringify(p.bankAccounts || [])
          );
        }
      }

      if (Array.isArray(snapshot.invoices)) {
        const insertInvoice = db.prepare(`
          INSERT OR REPLACE INTO invoices 
          (id, userId, number, date, dueDate, paymentTerms, clientName, clientEmail, clientPhone, clientAddress, status, total, amountPaid, outstandingBalance, notes, appliedTaxId, taxTotal, items) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const inv of snapshot.invoices) {
          insertInvoice.run(
            inv.id, inv.userId, inv.number, inv.date, inv.dueDate, inv.paymentTerms,
            inv.clientName, inv.clientEmail, inv.clientPhone, inv.clientAddress,
            inv.status, Number(inv.total || 0), Number(inv.amountPaid || 0), Number(inv.outstandingBalance || 0),
            inv.notes || '', inv.appliedTaxId || null, Number(inv.taxTotal || 0),
            typeof inv.items === 'string' ? inv.items : JSON.stringify(inv.items || [])
          );
        }
      }

      if (Array.isArray(snapshot.products)) {
        const insertProd = db.prepare('INSERT OR REPLACE INTO products (id, userId, name, price) VALUES (?, ?, ?, ?)');
        for (const pr of snapshot.products) {
          insertProd.run(pr.id, pr.userId, pr.name, Number(pr.price || 0));
        }
      }

      if (Array.isArray(snapshot.clients)) {
        const insertClient = db.prepare('INSERT OR REPLACE INTO clients (id, userId, name, email, phone, address) VALUES (?, ?, ?, ?, ?, ?)');
        for (const cl of snapshot.clients) {
          insertClient.run(cl.id, cl.userId, cl.name, (cl.email || '').trim().toLowerCase(), cl.phone || '', cl.address || '');
        }
      }
    }
  } catch (err) {
    console.error('Failed to restore persistent store backup:', err);
  }
}

// Initial restore on boot
restoreStoreBackup();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = 3000;

// Gemini AI Helper (Lazy Initialization)
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

const normalizeEmail = (e: string): string => {
  return (e || '').trim().toLowerCase();
};

// Middleware to verify JWT
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    
    // Check if the user actually exists in the database; try restore if missing
    let dbUser = db.prepare('SELECT id FROM users WHERE id = ?').get(user.id);
    if (!dbUser) {
      restoreStoreBackup();
      dbUser = db.prepare('SELECT id FROM users WHERE id = ?').get(user.id);
    }

    if (!dbUser) {
      return res.status(401).json({ error: 'User no longer exists' });
    }
    
    req.user = user;
    next();
  });
};

// Auth Routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const rawEmail = req.body.email;
    const rawPassword = req.body.password;
    if (!rawEmail || !rawPassword) return res.status(400).json({ error: 'Email and password required' });

    const email = normalizeEmail(rawEmail);
    const existing = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const id = Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    
    db.prepare('INSERT INTO users (id, email, password) VALUES (?, ?, ?)').run(id, email, hashedPassword);
    saveStoreBackup();
    
    const token = jwt.sign({ id, email }, JWT_SECRET);
    res.json({ token, user: { id, email } });
  } catch (err: any) {
    console.error('Signup error:', err);
    res.status(500).json({ error: err.message || 'Signup failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const rawEmail = req.body.email;
    const rawPassword = req.body.password;
    if (!rawEmail || !rawPassword) return res.status(400).json({ error: 'Email and password required' });

    const email = normalizeEmail(rawEmail);
    let user: any = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    
    // In case server restarted and memory is cold, attempt backup restore
    if (!user) {
      restoreStoreBackup();
      user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    }
    
    if (!user || !(await bcrypt.compare(rawPassword, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

app.post('/api/auth/reset-request', (req, res) => {
  try {
    const rawEmail = req.body.email;
    if (!rawEmail) return res.status(400).json({ error: 'Email is required' });

    const email = normalizeEmail(rawEmail);
    let user = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (!user) {
      restoreStoreBackup();
      user = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email);
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true, message: 'Password reset initiated' });
  } catch (err: any) {
    console.error('Reset request error:', err);
    res.status(500).json({ error: err.message || 'Reset request failed' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const rawEmail = req.body.email;
    const newPassword = req.body.newPassword;
    if (!rawEmail || !newPassword) return res.status(400).json({ error: 'Email and new password required' });

    const email = normalizeEmail(rawEmail);
    let user = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (!user) {
      restoreStoreBackup();
      user = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email);
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE email = ? COLLATE NOCASE').run(hashedPassword, email);
    saveStoreBackup();
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: err.message || 'Password update failed' });
  }
});

app.get('/api/auth/me', authenticateToken, (req: any, res) => {
  res.json({ user: req.user });
});

// Protected API Routes
app.use('/api', (req, res, next) => {
  // Apply authentication to all /api routes except auth
  if (req.path.startsWith('/auth')) return next();
  authenticateToken(req, res, next);
});

// Allowed column lists for SQL safety
const ALLOWED_PROFILE_COLUMNS = [
  'id', 'userId', 'name', 'email', 'address', 'phone',
  'website', 'logoUrl', 'primaryColor', 'templateId',
  'country', 'state', 'currency', 'logoShape', 'taxes', 'bankAccounts'
];

const ALLOWED_INVOICE_COLUMNS = [
  'id', 'userId', 'number', 'date', 'dueDate', 'paymentTerms',
  'clientName', 'clientEmail', 'clientPhone', 'clientAddress',
  'status', 'total', 'amountPaid', 'outstandingBalance',
  'notes', 'appliedTaxId', 'taxTotal', 'items'
];

// Profile
app.get('/api/profile', (req: any, res) => {
  try {
    const profile: any = db.prepare('SELECT * FROM profile WHERE userId = ? LIMIT 1').get(req.user.id);
    if (profile) {
      try {
        profile.taxes = JSON.parse(profile.taxes || '[]');
        profile.bankAccounts = JSON.parse(profile.bankAccounts || '[]');
      } catch (e) {
        profile.taxes = [];
        profile.bankAccounts = [];
      }
    }
    res.json(profile || null);
  } catch (err: any) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch profile' });
  }
});

app.post('/api/profile', (req: any, res) => {
  try {
    const profile = req.body || {};
    const existing: any = db.prepare('SELECT id FROM profile WHERE userId = ? LIMIT 1').get(req.user.id);
    
    const data: Record<string, any> = {
      ...profile,
      userId: req.user.id,
      taxes: JSON.stringify(profile.taxes || []),
      bankAccounts: JSON.stringify(profile.bankAccounts || [])
    };

    // Filter to only allowed columns
    const validData: Record<string, any> = {};
    for (const key of ALLOWED_PROFILE_COLUMNS) {
      if (data[key] !== undefined) {
        validData[key] = data[key];
      }
    }

    if (existing) {
      const keys = Object.keys(validData).filter(k => k !== 'id' && k !== 'userId');
      const sets = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => validData[k]);
      db.prepare(`UPDATE profile SET ${sets} WHERE id = ? AND userId = ?`).run(...values, existing.id, req.user.id);
    } else {
      validData.id = validData.id || (Math.random().toString(36).substring(2, 11) + Date.now().toString(36));
      validData.userId = req.user.id;
      const keys = Object.keys(validData);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => validData[k]);
      db.prepare(`INSERT INTO profile (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
    }
    saveStoreBackup();
    res.json({ success: true });
  } catch (err: any) {
    console.error('Save profile error:', err);
    res.status(500).json({ error: err.message || 'Failed to save profile' });
  }
});

// Invoices
app.get('/api/invoices', (req: any, res) => {
  try {
    const rows = db.prepare('SELECT * FROM invoices WHERE userId = ? ORDER BY date DESC').all(req.user.id);
    rows.forEach((row: any) => {
      try {
        row.items = JSON.parse(row.items || '[]');
      } catch {
        row.items = [];
      }
    });
    res.json(rows);
  } catch (err: any) {
    console.error('Get invoices error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch invoices' });
  }
});

app.post('/api/invoices', (req: any, res) => {
  try {
    const invoice = req.body || {};
    const invoiceId = invoice.id || (Math.random().toString(36).substring(2, 11) + Date.now().toString(36));
    
    const data: Record<string, any> = {
      ...invoice,
      id: invoiceId,
      userId: req.user.id,
      amountPaid: invoice.amountPaid !== undefined ? Number(invoice.amountPaid) : 0,
      outstandingBalance: invoice.outstandingBalance !== undefined ? Number(invoice.outstandingBalance) : Math.max(0, Number(invoice.total || 0) - Number(invoice.amountPaid || 0)),
      total: Number(invoice.total || 0),
      taxTotal: invoice.taxTotal !== undefined ? Number(invoice.taxTotal) : 0,
      items: JSON.stringify(invoice.items || [])
    };
    
    const existing = db.prepare('SELECT id FROM invoices WHERE id = ? AND userId = ?').get(invoiceId, req.user.id);
    
    // Filter only valid columns
    const validData: Record<string, any> = {};
    for (const key of ALLOWED_INVOICE_COLUMNS) {
      if (data[key] !== undefined) {
        validData[key] = data[key];
      }
    }

    if (existing) {
      const keys = Object.keys(validData).filter(k => k !== 'id' && k !== 'userId');
      const updates = keys.map(k => `${k} = ?`).join(', ');
      const updateValues = keys.map(k => validData[k]);
      db.prepare(`UPDATE invoices SET ${updates} WHERE id = ? AND userId = ?`).run(...updateValues, invoiceId, req.user.id);
    } else {
      const keys = Object.keys(validData);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => validData[k]);
      db.prepare(`INSERT INTO invoices (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
    }
    saveStoreBackup();
    res.json({ success: true, id: invoiceId });
  } catch (err: any) {
    console.error('Save invoice error:', err);
    res.status(500).json({ error: err.message || 'Failed to save invoice' });
  }
});

app.patch('/api/invoices/:id/status', (req: any, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (status === 'paid') {
      db.prepare('UPDATE invoices SET status = ?, amountPaid = total, outstandingBalance = 0 WHERE id = ? AND userId = ?').run(status, id, req.user.id);
    } else {
      db.prepare('UPDATE invoices SET status = ? WHERE id = ? AND userId = ?').run(status, id, req.user.id);
    }
    saveStoreBackup();
    res.json({ success: true });
  } catch (err: any) {
    console.error('Update status error:', err);
    res.status(500).json({ error: err.message || 'Failed to update status' });
  }
});

app.delete('/api/invoices/:id', (req: any, res) => {
  try {
    db.prepare('DELETE FROM invoices WHERE id = ? AND userId = ?').run(req.params.id, req.user.id);
    saveStoreBackup();
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete invoice error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete invoice' });
  }
});

// Products
app.get('/api/products', (req: any, res) => {
  try {
    res.json(db.prepare('SELECT * FROM products WHERE userId = ?').all(req.user.id));
  } catch (err: any) {
    console.error('Get products error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch products' });
  }
});

app.post('/api/products', (req: any, res) => {
  try {
    const products = Array.isArray(req.body) ? req.body : [];
    db.prepare('DELETE FROM products WHERE userId = ?').run(req.user.id);
    const insert = db.prepare('INSERT INTO products (id, userId, name, price) VALUES (?, ?, ?, ?)');
    const transaction = db.transaction((prods) => {
      for (const p of prods) {
        if (p && p.name) {
          const id = p.id || (Math.random().toString(36).substring(2, 11) + Date.now().toString(36));
          insert.run(id, req.user.id, p.name, Number(p.price || 0));
        }
      }
    });
    transaction(products);
    saveStoreBackup();
    res.json({ success: true });
  } catch (err: any) {
    console.error('Save products error:', err);
    res.status(500).json({ error: err.message || 'Failed to save products' });
  }
});

// Clients
app.get('/api/clients', (req: any, res) => {
  try {
    res.json(db.prepare('SELECT * FROM clients WHERE userId = ?').all(req.user.id));
  } catch (err: any) {
    console.error('Get clients error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch clients' });
  }
});

app.post('/api/clients', (req: any, res) => {
  try {
    const client = req.body || {};
    const id = client.id || (Math.random().toString(36).substring(2, 11) + Date.now().toString(36));
    const data = [id, req.user.id, client.name || '', (client.email || '').trim().toLowerCase(), client.phone || '', client.address || ''];
    db.prepare('INSERT OR REPLACE INTO clients (id, userId, name, email, phone, address) VALUES (?, ?, ?, ?, ?, ?)').run(...data);
    saveStoreBackup();
    res.json({ success: true, id });
  } catch (err: any) {
    console.error('Save client error:', err);
    res.status(500).json({ error: err.message || 'Failed to save client' });
  }
});

// Legacy Data Recovery for migrating SQLite/JSON accounts to Firestore
let cachedGoogleCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  if (cachedGoogleCerts && Date.now() < cachedGoogleCerts.expiresAt) {
    return cachedGoogleCerts.certs;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) throw new Error('Failed to fetch Firebase public certificates');
  const certs = (await resp.json()) as Record<string, string>;
  cachedGoogleCerts = { certs, expiresAt: Date.now() + 3600 * 1000 };
  return certs;
}

app.get('/api/legacy-recovery', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decodedHeader = jwt.decode(token, { complete: true }) as any;
    const kid = decodedHeader?.header?.kid;
    if (!kid) return res.status(401).json({ error: 'Invalid token header' });

    const certs = await getFirebasePublicCerts();
    const cert = certs[kid];
    if (!cert) return res.status(401).json({ error: 'Unknown signing key' });

    const verified = jwt.verify(token, cert, {
      algorithms: ['RS256'],
      audience: firebaseConfig.projectId,
      issuer: `https://securetoken.google.com/${firebaseConfig.projectId}`,
    }) as any;

    if (!verified?.email || !verified?.email_verified) {
      return res.status(403).json({ error: 'Verified email required' });
    }

    const email = normalizeEmail(verified.email);
    const dbUser: any = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email);

    let profile: any = null;
    let invoices: any[] = [];
    let products: any[] = [];
    let clients: any[] = [];

    if (dbUser) {
      profile = db.prepare('SELECT * FROM profile WHERE userId = ? LIMIT 1').get(dbUser.id) || null;
      if (profile) {
        try {
          profile.taxes = JSON.parse(profile.taxes || '[]');
          profile.bankAccounts = JSON.parse(profile.bankAccounts || '[]');
        } catch {
          profile.taxes = [];
          profile.bankAccounts = [];
        }
      }
      invoices = db.prepare('SELECT * FROM invoices WHERE userId = ?').all(dbUser.id) || [];
      invoices.forEach((row: any) => {
        try {
          row.items = JSON.parse(row.items || '[]');
        } catch {
          row.items = [];
        }
      });
      products = db.prepare('SELECT id, name, price FROM products WHERE userId = ?').all(dbUser.id) || [];
      clients = db.prepare('SELECT id, name, email, phone, address FROM clients WHERE userId = ?').all(dbUser.id) || [];
    }

    return res.json({ profile, invoices, products, clients });
  } catch (err: any) {
    console.error('Legacy recovery error:', err);
    return res.status(401).json({ error: 'Token verification failed' });
  }
});

// AI endpoints (Server-side Gemini proxy)
app.post('/api/ai/expand', async (req: any, res) => {
  const { description } = req.body;
  if (!description) return res.json({ text: '' });

  const ai = getAiClient();
  if (!ai) {
    return res.json({ text: description });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a professional invoicing assistant. Expand the following short service description into a professional, clear, and concise invoice line item description (max 1 sentence).\n\nInput: "${description}"\n\nOutput:`,
    });
    res.json({ text: (response.text || '').trim() || description });
  } catch (err: any) {
    console.error('AI expand error:', err);
    res.json({ text: description });
  }
});

app.post('/api/ai/insights', async (req: any, res) => {
  const { invoices } = req.body;
  if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
    return res.json({ text: 'No invoice data available for analysis yet.' });
  }

  const ai = getAiClient();
  if (!ai) {
    const totalRev = invoices.reduce((sum: number, i: any) => sum + (i.total || 0), 0);
    const paidCount = invoices.filter((i: any) => i.status === 'paid').length;
    return res.json({ 
      text: `Total recorded revenue is ${totalRev.toFixed(2)}. ${paidCount} of ${invoices.length} invoices are fully settled. Keep tracking and sending invoices promptly to maintain steady cash flow.` 
    });
  }

  const dataSummary = invoices.map((inv: any) => ({
    date: inv.date,
    amount: inv.total,
    status: inv.status
  }));

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze this invoice data and provide a brief, encouraging financial summary (2-3 sentences). Mention the total revenue and any positive trends.\n\nData: ${JSON.stringify(dataSummary)}`,
    });
    res.json({ text: (response.text || '').trim() });
  } catch (err: any) {
    console.error('AI insights error:', err);
    const totalRev = invoices.reduce((sum: number, i: any) => sum + (i.total || 0), 0);
    res.json({ 
      text: `Total revenue across ${invoices.length} invoices is ${totalRev.toFixed(2)}. Continue maintaining timely follow-ups for outstanding balances.` 
    });
  }
});

app.post('/api/ai/draft-email', async (req: any, res) => {
  const { invoice, profile } = req.body || {};
  const defaultDraft = {
    subject: `Invoice ${invoice?.number || ''} from ${profile?.name || 'Your Company'}`,
    body: `Hi ${invoice?.clientName || 'there'},\n\nPlease find invoice ${invoice?.number || ''} for ${invoice?.total || 0} ${profile?.currency || 'USD'} attached for your records.\n\nDue Date: ${invoice?.dueDate || 'Upon receipt'}\n\nThank you for your business!\n\nBest regards,\n${profile?.name || ''}`
  };

  const ai = getAiClient();
  if (!ai) {
    return res.json(defaultDraft);
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Write a professional, friendly email to a client for sending an invoice.
      
      Business Name: ${profile?.name || ''}
      Client Name: ${invoice?.clientName || ''}
      Invoice Number: ${invoice?.number || ''}
      Amount Due: ${invoice?.total || 0} ${profile?.currency || 'USD'}
      Due Date: ${invoice?.dueDate || ''}
      
      Format the output as a JSON object with "subject" and "body" fields. The body should be plain text with appropriate line breaks.`,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({
      subject: parsed.subject || defaultDraft.subject,
      body: parsed.body || defaultDraft.body
    });
  } catch (err: any) {
    console.error('AI draft email error:', err);
    res.json(defaultDraft);
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
