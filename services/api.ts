import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { BusinessProfile, Client, Invoice, Product } from '../types';

const VAULT_KEY = 'lumina_client_vault';

const normalizeEmail = (email: string) => (email || '').trim().toLowerCase();

const sanitizeId = (id: string): string => {
  const cleaned = (id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
};

const getVaultData = (userEmail?: string) => {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return {};
    const vault = JSON.parse(raw);
    return userEmail ? vault[normalizeEmail(userEmail)] || {} : vault;
  } catch {
    return {};
  }
};

const saveVaultData = (userEmail: string, key: string, data: any) => {
  try {
    const norm = normalizeEmail(userEmail);
    if (!norm) return;
    const raw = localStorage.getItem(VAULT_KEY);
    const vault = raw ? JSON.parse(raw) : {};
    vault[norm] = vault[norm] || {};
    vault[norm][key] = data;
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  } catch (e) {
    console.warn('Could not save to client vault', e);
  }
};

function requireAuthUser(): User {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authentication required. Please sign in with Google.');
  }
  return user;
}

function buildProfilePayload(profile: BusinessProfile, userId: string) {
  const payload: Record<string, any> = {
    userId,
    name: (profile.name || 'My Business').trim().slice(0, 200),
    primaryColor: (profile.primaryColor || '#0f172a').slice(0, 32),
    templateId: (['clean', 'bold', 'sidebar'].includes(profile.templateId)
      ? profile.templateId
      : 'clean') as 'clean' | 'bold' | 'sidebar',
    currency: (profile.currency || 'USD').slice(0, 10),
    taxes: Array.isArray(profile.taxes)
      ? profile.taxes.slice(0, 20).map((t) => ({
          id: String(t.id || ''),
          name: String(t.name || '').slice(0, 100),
          rate: Number(t.rate || 0),
        }))
      : [],
    bankAccounts: Array.isArray(profile.bankAccounts)
      ? profile.bankAccounts.slice(0, 20).map((b) => ({
          id: String(b.id || ''),
          bankName: String(b.bankName || '').slice(0, 120),
          accountName: String(b.accountName || '').slice(0, 150),
          accountNumber: String(b.accountNumber || '').slice(0, 60),
          ...(b.swiftCode ? { swiftCode: String(b.swiftCode).slice(0, 40) } : {}),
        }))
      : [],
  };

  if (profile.email) payload.email = String(profile.email).slice(0, 255);
  if (profile.address) payload.address = String(profile.address).slice(0, 1000);
  if (profile.phone) payload.phone = String(profile.phone).slice(0, 60);
  if (profile.website) payload.website = String(profile.website).slice(0, 255);
  if (profile.logoUrl && profile.logoUrl.length <= 600000) {
    payload.logoUrl = String(profile.logoUrl);
  }
  if (profile.country) payload.country = String(profile.country).slice(0, 100);
  if (profile.state) payload.state = String(profile.state).slice(0, 100);
  if (profile.logoShape && ['square', 'circle', 'triangle'].includes(profile.logoShape)) {
    payload.logoShape = profile.logoShape;
  }

  return payload;
}

function buildInvoicePayload(invoice: Invoice, userId: string, invoiceId: string) {
  const safeItems = Array.isArray(invoice.items)
    ? invoice.items.slice(0, 100).map((item) => ({
        id: String(item.id || ''),
        description: String(item.description || '').slice(0, 500),
        quantity: Math.max(0, Number(item.quantity || 0)),
        rate: Math.max(0, Number(item.rate || 0)),
        ...(item.productId ? { productId: String(item.productId).slice(0, 128) } : {}),
      }))
    : [];

  const total = Math.max(0, Number(invoice.total || 0));
  const amountPaid = Math.max(0, Number(invoice.amountPaid || 0));
  const outstandingBalance =
    invoice.outstandingBalance !== undefined
      ? Math.max(0, Number(invoice.outstandingBalance))
      : Math.max(0, total - amountPaid);

  const payload: Record<string, any> = {
    id: invoiceId,
    userId,
    number: (invoice.number || 'INV-001').slice(0, 64),
    date: (invoice.date || new Date().toISOString().split('T')[0]).slice(0, 32),
    status: (['draft', 'sent', 'paid'].includes(invoice.status)
      ? invoice.status
      : 'draft') as 'draft' | 'sent' | 'paid',
    total,
    amountPaid,
    outstandingBalance,
    taxTotal: Math.max(0, Number(invoice.taxTotal || 0)),
    items: safeItems,
  };

  if (invoice.dueDate) payload.dueDate = String(invoice.dueDate).slice(0, 32);
  if (invoice.paymentTerms) payload.paymentTerms = String(invoice.paymentTerms).slice(0, 64);
  if (invoice.clientName) payload.clientName = String(invoice.clientName).slice(0, 200);
  if (invoice.clientEmail) payload.clientEmail = String(invoice.clientEmail).slice(0, 255);
  if (invoice.clientPhone) payload.clientPhone = String(invoice.clientPhone).slice(0, 60);
  if (invoice.clientAddress) payload.clientAddress = String(invoice.clientAddress).slice(0, 1000);
  if (invoice.notes) payload.notes = String(invoice.notes).slice(0, 2000);
  if (invoice.appliedTaxId) payload.appliedTaxId = String(invoice.appliedTaxId).slice(0, 128);

  return payload;
}

export const api = {
  signInWithGoogle: async (): Promise<User> => {
    const result = await signInWithPopup(auth, googleAuthProvider);
    const user = result.user;
    if (user.email) {
      localStorage.setItem('lumina_last_email', normalizeEmail(user.email));
    }
    if (user.emailVerified) {
      await api.ensureUserDocument(user);
      await api.migrateLegacyDataIfNeeded(user);
    }
    return user;
  },

  signUpWithEmail: async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<User> => {
    const cleanEmail = normalizeEmail(email);
    const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const user = result.user;
    if (displayName && displayName.trim()) {
      await updateProfile(user, { displayName: displayName.trim().slice(0, 150) });
    }
    localStorage.setItem('lumina_last_email', cleanEmail);
    if (!user.emailVerified) {
      await sendEmailVerification(user);
    } else {
      await api.ensureUserDocument(user);
      await api.migrateLegacyDataIfNeeded(user);
    }
    return user;
  },

  signInWithEmail: async (email: string, password: string): Promise<User> => {
    const cleanEmail = normalizeEmail(email);
    const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const user = result.user;
    localStorage.setItem('lumina_last_email', cleanEmail);
    if (user.emailVerified) {
      await api.ensureUserDocument(user);
      await api.migrateLegacyDataIfNeeded(user);
    }
    return user;
  },

  sendPasswordReset: async (email: string): Promise<void> => {
    const cleanEmail = normalizeEmail(email);
    await sendPasswordResetEmail(auth, cleanEmail);
  },

  resendVerificationEmail: async (): Promise<void> => {
    const user = requireAuthUser();
    await sendEmailVerification(user);
  },

  refreshVerificationStatus: async (): Promise<User | null> => {
    const user = auth.currentUser;
    if (!user) return null;
    await user.reload();
    await user.getIdToken(true);
    return auth.currentUser;
  },

  logout: async (): Promise<void> => {
    await signOut(auth);
  },

  ensureUserDocument: async (user: User): Promise<void> => {
    const userPath = `users/${user.uid}`;
    const userRef = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(userRef);
      const email = normalizeEmail(user.email || '');
      const displayName = (user.displayName || '').slice(0, 150);
      const authProvider = user.providerData?.some((p) => p.providerId === 'password')
        ? 'password'
        : 'google';

      if (!snap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          email,
          authProvider,
          ...(displayName ? { displayName } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existing = snap.data();
        if (
          existing.email !== email ||
          existing.authProvider !== authProvider ||
          (displayName && existing.displayName !== displayName)
        ) {
          await updateDoc(userRef, {
            email,
            authProvider,
            ...(displayName ? { displayName } : {}),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, userPath);
    }
  },

  migrateLegacyDataIfNeeded: async (user: User): Promise<void> => {
    const migrationFlag = `lumina_migrated_v2_${user.uid}`;
    if (localStorage.getItem(migrationFlag)) return;

    const email = normalizeEmail(user.email || '');
    if (!email) return;

    try {
      // Check if user already has data in Firestore
      const [existingProfSnap, existingInvSnap, existingProdSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid, 'profile', 'default')),
        getDocs(query(collection(db, 'users', user.uid, 'invoices'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'users', user.uid, 'products'), where('userId', '==', user.uid))),
      ]);

      const hasCloudProfile = existingProfSnap.exists();
      const hasCloudInvoices = !existingInvSnap.empty;
      const hasCloudProducts = !existingProdSnap.empty;

      if (hasCloudProfile && hasCloudInvoices && hasCloudProducts) {
        localStorage.setItem(migrationFlag, '1');
        return;
      }

      // Gather local vault fallback (if any)
      const vault = getVaultData(email);

      // Gather legacy server recovery data (verified by Firebase ID token)
      let legacyServer: {
        profile?: BusinessProfile | null;
        invoices?: Invoice[];
        products?: Product[];
        clients?: Client[];
      } = {};
      try {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/legacy-recovery', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          legacyServer = await res.json();
        }
      } catch (err) {
        console.warn('Legacy server recovery check skipped:', err);
      }

      // Restore profile if missing in Firestore
      const recoveredProfile =
        (legacyServer.profile && legacyServer.profile.name ? legacyServer.profile : null) ||
        (vault.profile && vault.profile.name ? vault.profile : null);

      if (!hasCloudProfile && recoveredProfile) {
        await api.saveProfile(recoveredProfile);
      }

      // Restore products if missing in Firestore
      const serverProducts = Array.isArray(legacyServer.products) ? legacyServer.products : [];
      const vaultProducts = Array.isArray(vault.products) ? vault.products : [];
      const mergedProducts = serverProducts.length > 0 ? serverProducts : vaultProducts;
      if (!hasCloudProducts && mergedProducts.length > 0) {
        await api.saveProducts(mergedProducts);
      }

      // Restore invoices if missing in Firestore
      const serverInvoices = Array.isArray(legacyServer.invoices) ? legacyServer.invoices : [];
      const vaultInvoices = Array.isArray(vault.invoices) ? vault.invoices : [];
      const mergedInvoices = serverInvoices.length > 0 ? serverInvoices : vaultInvoices;
      if (!hasCloudInvoices && mergedInvoices.length > 0) {
        for (const inv of mergedInvoices) {
          await api.saveInvoice(inv);
        }
      }

      // Restore clients
      const serverClients = Array.isArray(legacyServer.clients) ? legacyServer.clients : [];
      const vaultClients = Array.isArray(vault.clients) ? vault.clients : [];
      const mergedClients = serverClients.length > 0 ? serverClients : vaultClients;
      if (mergedClients.length > 0) {
        for (const cl of mergedClients) {
          if (cl && cl.name && cl.email) {
            await api.saveClient(cl);
          }
        }
      }

      localStorage.setItem(migrationFlag, '1');
    } catch (err) {
      console.warn('Legacy migration encountered an issue:', err);
    }
  },

  getProfile: async (): Promise<BusinessProfile | null> => {
    const user = requireAuthUser();
    const path = `users/${user.uid}/profile/default`;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, 'profile', 'default'));
      if (snap.exists()) {
        const data = snap.data() as BusinessProfile;
        if (user.email) saveVaultData(user.email, 'profile', data);
        return data;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  },

  saveProfile: async (profile: BusinessProfile): Promise<void> => {
    const user = requireAuthUser();
    const path = `users/${user.uid}/profile/default`;
    const ref = doc(db, 'users', user.uid, 'profile', 'default');
    const payload = buildProfilePayload(profile, user.uid);

    if (user.email) saveVaultData(user.email, 'profile', profile);

    try {
      const existingSnap = await getDoc(ref);
      if (existingSnap.exists()) {
        const updatePayload: Record<string, any> = { ...payload, updatedAt: serverTimestamp() };
        delete updatePayload.userId;
        await updateDoc(ref, updatePayload);
      } else {
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  getInvoices: async (): Promise<Invoice[]> => {
    const user = requireAuthUser();
    const path = `users/${user.uid}/invoices`;
    try {
      const q = query(
        collection(db, 'users', user.uid, 'invoices'),
        where('userId', '==', user.uid)
      );
      const snap = await getDocs(q);
      const list: Invoice[] = snap.docs.map((d) => d.data() as Invoice);
      list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      if (user.email && list.length > 0) {
        saveVaultData(user.email, 'invoices', list);
      }
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  saveInvoice: async (invoice: Invoice): Promise<void> => {
    const user = requireAuthUser();
    const invoiceId = sanitizeId(invoice.id);
    const path = `users/${user.uid}/invoices/${invoiceId}`;
    const ref = doc(db, 'users', user.uid, 'invoices', invoiceId);
    const payload = buildInvoicePayload(invoice, user.uid, invoiceId);

    try {
      const existingSnap = await getDoc(ref);
      if (existingSnap.exists()) {
        const existingData = existingSnap.data();
        if (existingData.status === 'paid') {
          throw new Error('Paid invoices are finalized and locked.');
        }
        const updatePayload: Record<string, any> = { ...payload, updatedAt: serverTimestamp() };
        delete updatePayload.id;
        delete updatePayload.userId;
        await updateDoc(ref, updatePayload);
      } else {
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('finalized')) {
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  updateInvoiceStatus: async (id: string, status: 'draft' | 'sent' | 'paid'): Promise<void> => {
    const user = requireAuthUser();
    const invoiceId = sanitizeId(id);
    const path = `users/${user.uid}/invoices/${invoiceId}`;
    const ref = doc(db, 'users', user.uid, 'invoices', invoiceId);

    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const existingData = snap.data();
      if (existingData.status === 'paid') {
        throw new Error('Paid invoices are finalized and locked.');
      }

      if (status === 'paid') {
        await updateDoc(ref, {
          status: 'paid',
          amountPaid: Number(existingData.total || 0),
          outstandingBalance: 0,
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          status,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('finalized')) {
        throw error;
      }
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  deleteInvoice: async (id: string): Promise<void> => {
    const user = requireAuthUser();
    const invoiceId = sanitizeId(id);
    const path = `users/${user.uid}/invoices/${invoiceId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'invoices', invoiceId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  getProducts: async (): Promise<Product[]> => {
    const user = requireAuthUser();
    const path = `users/${user.uid}/products`;
    try {
      const q = query(
        collection(db, 'users', user.uid, 'products'),
        where('userId', '==', user.uid)
      );
      const snap = await getDocs(q);
      const list: Product[] = snap.docs.map((d) => ({
        id: d.data().id,
        name: d.data().name,
        price: Number(d.data().price || 0),
      }));
      if (user.email && list.length > 0) {
        saveVaultData(user.email, 'products', list);
      }
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  saveProducts: async (products: Product[]): Promise<void> => {
    const user = requireAuthUser();
    const path = `users/${user.uid}/products`;

    try {
      const existingSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'products'), where('userId', '==', user.uid))
      );
      const existingIds = new Set(existingSnap.docs.map((d) => d.id));
      const nextIds = new Set<string>();

      const batch = writeBatch(db);
      for (const p of products) {
        if (!p || !p.name || !p.name.trim()) continue;
        const prodId = sanitizeId(p.id);
        nextIds.add(prodId);
        const ref = doc(db, 'users', user.uid, 'products', prodId);
        const cleanName = p.name.trim().slice(0, 200);
        const cleanPrice = Math.max(0, Number(p.price || 0));

        if (existingIds.has(prodId)) {
          batch.update(ref, {
            name: cleanName,
            price: cleanPrice,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(ref, {
            id: prodId,
            userId: user.uid,
            name: cleanName,
            price: cleanPrice,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      for (const oldId of existingIds) {
        if (!nextIds.has(oldId)) {
          batch.delete(doc(db, 'users', user.uid, 'products', oldId));
        }
      }

      await batch.commit();
      if (user.email && products.length > 0) {
        saveVaultData(user.email, 'products', products);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  getClients: async (): Promise<Client[]> => {
    const user = requireAuthUser();
    const path = `users/${user.uid}/clients`;
    try {
      const q = query(
        collection(db, 'users', user.uid, 'clients'),
        where('userId', '==', user.uid)
      );
      const snap = await getDocs(q);
      const list: Client[] = snap.docs.map((d) => ({
        id: d.data().id,
        name: d.data().name,
        email: d.data().email,
        phone: d.data().phone,
        address: d.data().address,
      }));
      if (user.email && list.length > 0) {
        saveVaultData(user.email, 'clients', list);
      }
      return list;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  saveClient: async (client: Client): Promise<void> => {
    const user = requireAuthUser();
    const clientId = sanitizeId(client.id);
    const path = `users/${user.uid}/clients/${clientId}`;
    const ref = doc(db, 'users', user.uid, 'clients', clientId);

    const payload: Record<string, any> = {
      id: clientId,
      userId: user.uid,
      name: (client.name || 'Client').trim().slice(0, 200),
      email: normalizeEmail(client.email || '').slice(0, 255),
    };
    if (client.phone) payload.phone = String(client.phone).slice(0, 60);
    if (client.address) payload.address = String(client.address).slice(0, 1000);

    try {
      const existingSnap = await getDoc(ref);
      if (existingSnap.exists()) {
        const updatePayload: Record<string, any> = { ...payload, updatedAt: serverTimestamp() };
        delete updatePayload.id;
        delete updatePayload.userId;
        await updateDoc(ref, updatePayload);
      } else {
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },
};
