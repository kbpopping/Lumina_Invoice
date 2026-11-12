import React from 'react';
import { BusinessProfile, Invoice, InvoiceItem } from '../types';

interface InvoicePreviewProps {
  profile: BusinessProfile;
  invoice: Invoice;
  itemsOverride?: InvoiceItem[];
  isFirstPage?: boolean;
  isLastPage?: boolean;
  pageNumber?: number;
  totalPages?: number;
  isPdfExport?: boolean;
}

export const InvoicePreview: React.FC<InvoicePreviewProps> = ({
  profile,
  invoice,
  itemsOverride,
  isFirstPage = true,
  isLastPage = true,
  pageNumber = 1,
  totalPages = 1,
  isPdfExport = false,
}) => {
  const renderedItems = itemsOverride ?? invoice.items;
  const isMultiPage = totalPages > 1;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: profile.currency || 'USD',
    }).format(amount);
  };

  const getTaxLine = () => {
    if (!invoice.appliedTaxId) return null;
    const tax = profile.taxes.find((t) => t.id === invoice.appliedTaxId);
    if (!tax) return null;
    return { name: tax.name, rate: tax.rate, amount: invoice.taxTotal || 0 };
  };

  const BankDetails = () => {
    const isPaid = invoice.status === 'paid';
    if (isPaid || !profile.bankAccounts || profile.bankAccounts.length === 0) return null;

    return (
      <div className="avoid-break bank-details-block pt-2">
        <p className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
          Payment Information
        </p>
        <p className="text-[10.5px] text-slate-500 mb-2">
          Please make payment to the account displayed below:
        </p>
        <div className="grid grid-cols-2 gap-2">
          {profile.bankAccounts.map((account) => (
            <div
              key={account.id}
              className="bg-slate-50/90 px-3 py-2 rounded-md border border-slate-200/80"
            >
              <p className="text-[8.5px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                {account.bankName}
              </p>
              <p className="text-[11px] font-semibold text-slate-800 leading-tight">
                {account.accountName}
              </p>
              <p className="text-[11px] tabular-nums font-semibold text-slate-900 mt-0.5">
                {account.accountNumber}
              </p>
              {account.swiftCode && (
                <p className="text-[9px] text-slate-500 mt-0.5">SWIFT: {account.swiftCode}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const Logo = ({ className = 'h-12' }: { className?: string }) => {
    if (!profile.logoUrl) return null;
    const shapeStyle = profile.logoShape === 'circle' ? 'rounded-full' : 'rounded';
    const clipStyle =
      profile.logoShape === 'triangle'
        ? { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }
        : {};
    return (
      <img
        src={profile.logoUrl}
        className={`${className} max-h-14 max-w-[150px] object-contain ${shapeStyle}`}
        style={clipStyle}
        alt="Logo"
      />
    );
  };

  const SummaryTotals = () => {
    const taxLine = getTaxLine();
    // Always compute subtotal across ALL invoice items regardless of pagination slice
    const subtotal = invoice.items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
    const isPaid = invoice.status === 'paid';

    const totalAmount = invoice.total;
    const amtPaid = isPaid ? totalAmount : invoice.amountPaid || 0;
    const balance = isPaid
      ? 0
      : invoice.outstandingBalance !== undefined
      ? invoice.outstandingBalance
      : Math.max(0, totalAmount - amtPaid);

    return (
      <div className="avoid-break summary-totals-block w-full space-y-1.5">
        <div className="flex justify-between text-slate-500 text-[11px] font-normal tabular-nums">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {taxLine && (
          <div className="flex justify-between text-slate-500 text-[11px] font-normal tabular-nums">
            <span>
              {taxLine.name} ({taxLine.rate}%)
            </span>
            <span>{formatCurrency(taxLine.amount)}</span>
          </div>
        )}
        <div className="flex justify-between font-medium text-[11px] text-slate-800 pt-1.5 border-t border-slate-100 tabular-nums">
          <span>Total Bill</span>
          <span>{formatCurrency(totalAmount)}</span>
        </div>
        {amtPaid > 0 && (
          <div className="flex justify-between text-emerald-600 text-[11px] font-medium tabular-nums">
            <span>Amount Paid</span>
            <span>{formatCurrency(amtPaid)}</span>
          </div>
        )}
        {balance > 0 && (
          <div className="flex justify-between text-amber-600 text-[11px] font-medium tabular-nums">
            <span>Pending Balance</span>
            <span>{formatCurrency(balance)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-sm text-slate-900 pt-2 border-t border-slate-200 tabular-nums">
          <span>{isPaid ? 'Total Paid' : 'Total Due'}</span>
          <span>{formatCurrency(isPaid ? totalAmount : balance)}</span>
        </div>
      </div>
    );
  };

  const FooterWatermark = () => (
    <div className="avoid-break footer-watermark-block mt-auto pt-4 border-t border-slate-100 flex items-center justify-between text-[9.5px] text-slate-400 font-normal tracking-wide">
      <span>Invoice generated by Lumina Invoice</span>
      {isMultiPage && (
        <span>
          {isLastPage
            ? `Page ${pageNumber} of ${totalPages}`
            : `Continued on Page ${pageNumber + 1} • Page ${pageNumber} of ${totalPages}`}
        </span>
      )}
    </div>
  );

  const BillTo = () => (
    <div className="avoid-break bill-to-block mb-4">
      <h4 className="text-[9.5px] uppercase font-semibold text-slate-400 tracking-wider mb-1">
        Bill To
      </h4>
      <p className="text-[13px] font-semibold text-slate-800">
        {invoice.clientName || 'Valued Client'}
      </p>
      {invoice.clientEmail && (
        <p className="text-[11px] text-slate-500 font-normal leading-snug">
          {invoice.clientEmail}
        </p>
      )}
      {invoice.clientPhone && (
        <p className="text-[11px] text-slate-500 font-normal leading-snug">
          {invoice.clientPhone}
        </p>
      )}
      {invoice.clientAddress && (
        <p className="text-[11px] text-slate-500 font-normal whitespace-pre-line leading-snug mt-0.5">
          {invoice.clientAddress}
        </p>
      )}
    </div>
  );

  const ContinuationHeader = () => (
    <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate-200">
      <div>
        <p className="text-xs font-semibold uppercase tracking-tight text-slate-800">
          {profile.name}
        </p>
        <p className="text-[10px] text-slate-400">
          {invoice.clientName ? `Bill To: ${invoice.clientName}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs font-semibold text-slate-800">
          {invoice.status === 'paid' ? 'Receipt' : 'Invoice'} #{invoice.number}
        </p>
        <p className="text-[10px] text-slate-400">
          Page {pageNumber} of {totalPages}
        </p>
      </div>
    </div>
  );

  const CleanTemplate = () => (
    <div
      className={`bg-white px-11 py-9 text-slate-800 relative w-full box-border flex flex-col ${
        isPdfExport ? 'min-h-[1122px]' : ''
      }`}
    >
      {!isPdfExport && invoice.status === 'paid' ? (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-emerald-500/20 text-emerald-500/20 text-6xl font-bold uppercase tracking-widest -rotate-12 pointer-events-none select-none px-6 py-2 rounded-lg z-10 print:hidden">
          Paid
        </div>
      ) : !isPdfExport && invoice.amountPaid && invoice.amountPaid > 0 ? (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-amber-500/20 text-amber-500/20 text-4xl font-bold uppercase tracking-widest -rotate-12 pointer-events-none select-none px-5 py-2 rounded-lg z-10 print:hidden">
          Partial Paid
        </div>
      ) : null}

      <div className="flex-1">
        {isFirstPage ? (
          <>
            <div className="avoid-break invoice-header-block flex flex-row justify-between items-start gap-6 mb-5 pb-4 border-b border-slate-100">
              <div className="max-w-[58%]">
                <Logo className="h-12 mb-2" />
                <h1 className="text-[15px] font-semibold uppercase tracking-tight text-slate-900">
                  {profile.name}
                </h1>
                <div className="text-[11px] text-slate-500 font-normal mt-1 whitespace-pre-line leading-relaxed">
                  {profile.address}
                </div>
                {profile.email && (
                  <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                    {profile.email}
                  </div>
                )}
                {profile.phone && (
                  <div className="text-[11px] text-slate-500 font-normal">{profile.phone}</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
                  {invoice.status === 'paid' ? 'RECEIPT' : 'INVOICE'}
                </h2>
                <div className="mt-1.5 space-y-0.5">
                  <div className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wider">
                    {invoice.status === 'paid' ? 'Receipt #' : 'Invoice #'}
                  </div>
                  <div className="text-[13px] font-semibold text-slate-900">{invoice.number}</div>
                  <div className="text-[11px] text-slate-500 font-normal mt-1">
                    Date: {invoice.date}
                  </div>
                  {invoice.dueDate && (
                    <div className="text-[11px] text-slate-500 font-normal">
                      Due: {invoice.dueDate}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <BillTo />
          </>
        ) : (
          <ContinuationHeader />
        )}

        <table className="w-full mb-5 border-collapse table-fixed">
          <thead className="table-header-group">
            <tr className="border-b border-slate-200 text-left text-[9.5px] uppercase text-slate-400 font-semibold tracking-wider avoid-break">
              <th className="py-2 pr-3 w-[48%]">Description</th>
              <th className="py-2 px-2 text-right w-[10%]">Qty</th>
              <th className="py-2 px-2 text-right w-[20%]">Rate</th>
              <th className="py-2 pl-2 text-right w-[22%]">Amount</th>
            </tr>
          </thead>
          <tbody className="table-row-group text-[11px]">
            {renderedItems.map((item) => (
              <tr
                key={item.id}
                className="border-b border-slate-100 avoid-break item-row"
                style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
              >
                <td className="py-2 pr-3 font-normal text-slate-700 break-words leading-snug">
                  {item.description}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-600 whitespace-nowrap">
                  {item.quantity}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-600 whitespace-nowrap">
                  {formatCurrency(item.rate)}
                </td>
                <td className="py-2 pl-2 text-right font-medium tabular-nums text-slate-900 whitespace-nowrap">
                  {formatCurrency(item.quantity * item.rate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {isLastPage && (
          <div className="avoid-break summary-and-details-section mt-3 pt-3 border-t border-slate-100">
            <div className="flex flex-row justify-between items-start gap-8">
              <div className="flex-1 min-w-0 space-y-2.5">
                <BankDetails />
                {invoice.notes && (
                  <div className="avoid-break notes-block text-[11px] text-slate-600 bg-slate-50/90 px-3 py-2 rounded-md border border-slate-200/80">
                    <p className="font-semibold text-[9px] uppercase text-slate-400 mb-0.5">
                      Notes
                    </p>
                    <p className="whitespace-pre-line italic leading-snug">{invoice.notes}</p>
                  </div>
                )}
              </div>
              <div className="w-[230px] shrink-0 avoid-break summary-totals-block">
                <SummaryTotals />
              </div>
            </div>
          </div>
        )}
      </div>

      <FooterWatermark />
    </div>
  );

  const BoldTemplate = () => (
    <div
      className={`bg-white text-slate-800 relative w-full box-border flex flex-col ${
        isPdfExport ? 'min-h-[1122px]' : ''
      }`}
    >
      {!isPdfExport && invoice.status === 'paid' ? (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-emerald-500/20 text-emerald-500/20 text-6xl font-bold uppercase tracking-widest -rotate-12 pointer-events-none select-none px-6 py-2 rounded-lg z-10 print:hidden">
          Paid
        </div>
      ) : !isPdfExport && invoice.amountPaid && invoice.amountPaid > 0 ? (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-amber-500/20 text-amber-500/20 text-4xl font-bold uppercase tracking-widest -rotate-12 pointer-events-none select-none px-5 py-2 rounded-lg z-10 print:hidden">
          Partial Paid
        </div>
      ) : null}

      <div className="h-2 w-full shrink-0" style={{ backgroundColor: profile.primaryColor }} />
      <div className="px-11 py-8 flex-1 flex flex-col">
        <div className="flex-1">
          {isFirstPage ? (
            <>
              <div className="avoid-break invoice-header-block flex flex-row justify-between items-start gap-6 mb-5 pb-4 border-b border-slate-100">
                <div className="max-w-[58%]">
                  <Logo className="h-12 mb-2" />
                  <h1 className="text-[15px] font-semibold uppercase text-slate-900 tracking-tight">
                    {profile.name}
                  </h1>
                  <p className="text-[11px] text-slate-500 font-normal mt-1 whitespace-pre-line leading-relaxed">
                    {profile.address}
                  </p>
                  {profile.email && (
                    <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                      {profile.email}
                    </div>
                  )}
                  {profile.phone && (
                    <div className="text-[11px] text-slate-500 font-normal">{profile.phone}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
                    {invoice.status === 'paid' ? 'RECEIPT' : 'INVOICE'}
                  </h2>
                  <div className="mt-1.5 space-y-0.5">
                    <div className="text-[13px] font-semibold text-slate-900">
                      #{invoice.number}
                    </div>
                    <div className="text-[11px] text-slate-500 font-normal mt-1">
                      Date: {invoice.date}
                    </div>
                    {invoice.dueDate && (
                      <div className="text-[11px] text-slate-500 font-normal">
                        Due: {invoice.dueDate}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <BillTo />
            </>
          ) : (
            <ContinuationHeader />
          )}

          <table className="w-full mb-5 border-collapse table-fixed">
            <thead className="table-header-group bg-slate-900 text-white text-[9.5px] uppercase tracking-wider font-semibold">
              <tr className="avoid-break">
                <th className="py-2 px-3 text-left w-[48%]">Description</th>
                <th className="py-2 px-2 text-right w-[10%]">Qty</th>
                <th className="py-2 px-2 text-right w-[20%]">Rate</th>
                <th className="py-2 px-3 text-right w-[22%]">Amount</th>
              </tr>
            </thead>
            <tbody className="table-row-group text-[11px]">
              {renderedItems.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 avoid-break item-row"
                  style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                >
                  <td className="py-2 px-3 font-normal text-slate-700 break-words leading-snug">
                    {item.description}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-600 whitespace-nowrap">
                    {item.quantity}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-600 whitespace-nowrap">
                    {formatCurrency(item.rate)}
                  </td>
                  <td className="py-2 px-3 text-right font-medium tabular-nums text-slate-900 whitespace-nowrap">
                    {formatCurrency(item.quantity * item.rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {isLastPage && (
            <div className="avoid-break summary-and-details-section mt-3 pt-3 border-t border-slate-100">
              <div className="flex flex-row justify-between items-start gap-8">
                <div className="flex-1 min-w-0 space-y-2.5">
                  <BankDetails />
                  {invoice.notes && (
                    <div className="avoid-break notes-block text-[11px] text-slate-600 bg-slate-50/90 px-3 py-2 rounded-md border border-slate-200/80">
                      <p className="font-semibold text-[9px] uppercase text-slate-400 mb-0.5">
                        Notes
                      </p>
                      <p className="whitespace-pre-line italic leading-snug">{invoice.notes}</p>
                    </div>
                  )}
                </div>
                <div className="w-[235px] shrink-0 bg-slate-50/90 px-4 py-3 rounded-md border border-slate-200/80 avoid-break summary-totals-block">
                  <SummaryTotals />
                </div>
              </div>
            </div>
          )}
        </div>

        <FooterWatermark />
      </div>
    </div>
  );

  const SidebarTemplate = () => (
    <div
      className={`bg-white flex flex-row relative w-full box-border ${
        isPdfExport ? 'min-h-[1122px]' : ''
      }`}
    >
      {!isPdfExport && invoice.status === 'paid' ? (
        <div className="absolute top-1/3 left-2/3 -translate-x-1/2 -translate-y-1/2 border-4 border-emerald-500/20 text-emerald-500/20 text-6xl font-bold uppercase tracking-widest -rotate-12 pointer-events-none select-none px-6 py-2 rounded-lg z-20 print:hidden">
          Paid
        </div>
      ) : !isPdfExport && invoice.amountPaid && invoice.amountPaid > 0 ? (
        <div className="absolute top-1/3 left-2/3 -translate-x-1/2 -translate-y-1/2 border-4 border-amber-500/20 text-amber-500/20 text-4xl font-bold uppercase tracking-widest -rotate-12 pointer-events-none select-none px-5 py-2 rounded-lg z-20 print:hidden">
          Partial Paid
        </div>
      ) : null}

      <div
        className="avoid-break w-[31%] shrink-0 px-6 py-8 text-white flex flex-col justify-between"
        style={{ backgroundColor: profile.primaryColor }}
      >
        <div className="space-y-4">
          <Logo className="h-11 bg-white/15 p-1.5 rounded mb-2" />
          <div>
            <h4 className="text-[9px] uppercase font-semibold opacity-75 tracking-wider">From</h4>
            <p className="text-[13px] font-semibold mt-0.5">{profile.name}</p>
            <p className="text-[10.5px] whitespace-pre-line opacity-90 leading-relaxed mt-0.5">
              {profile.address}
            </p>
            {profile.email && <p className="text-[10.5px] opacity-90 mt-1 break-all">{profile.email}</p>}
            {profile.phone && <p className="text-[10.5px] opacity-90">{profile.phone}</p>}
          </div>
          <div className="pt-3 border-t border-white/20">
            <h4 className="text-[9px] uppercase font-semibold opacity-75 tracking-wider">
              Bill To
            </h4>
            <p className="text-[13px] font-semibold mt-0.5">
              {invoice.clientName || 'Valued Client'}
            </p>
            {invoice.clientEmail && (
              <p className="text-[10.5px] opacity-90 break-all">{invoice.clientEmail}</p>
            )}
            {invoice.clientPhone && (
              <p className="text-[10.5px] opacity-90">{invoice.clientPhone}</p>
            )}
            {invoice.clientAddress && (
              <p className="text-[10.5px] whitespace-pre-line opacity-90 mt-0.5 leading-relaxed">
                {invoice.clientAddress}
              </p>
            )}
          </div>
        </div>
        <div className="pt-6 opacity-60 text-center">
          <p className="text-[8.5px] uppercase tracking-wider font-medium">Lumina Invoice</p>
        </div>
      </div>

      <div className="w-[69%] px-8 py-8 flex flex-col justify-between">
        <div className="flex-1">
          <div className="avoid-break invoice-header-block pb-3 mb-4 border-b border-slate-200 flex justify-between items-end">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {invoice.status === 'paid' ? 'Receipt' : 'Invoice'} #{invoice.number}
              </h2>
              <div className="flex gap-4 text-[10.5px] text-slate-500 mt-1 font-normal">
                <span>Date: {invoice.date}</span>
                <span>Due: {invoice.dueDate || 'Upon receipt'}</span>
              </div>
            </div>
            {isMultiPage && (
              <span className="text-[10px] text-slate-400">
                Page {pageNumber} of {totalPages}
              </span>
            )}
          </div>

          <table className="w-full text-[11px] mb-4 border-collapse table-fixed">
            <thead className="table-header-group">
              <tr className="text-left border-b border-slate-200 text-slate-400 font-semibold uppercase text-[9.5px] tracking-wider avoid-break">
                <th className="pb-2 pr-2 w-[56%]">Description</th>
                <th className="pb-2 px-2 text-right w-[12%]">Qty</th>
                <th className="pb-2 pl-2 text-right w-[32%]">Amount</th>
              </tr>
            </thead>
            <tbody className="table-row-group">
              {renderedItems.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-slate-100 avoid-break item-row"
                  style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                >
                  <td className="py-2 pr-2 font-normal text-slate-700 break-words leading-snug">
                    {i.description}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-slate-600 whitespace-nowrap">
                    {i.quantity}
                  </td>
                  <td className="py-2 pl-2 text-right font-medium tabular-nums text-slate-900 whitespace-nowrap">
                    {formatCurrency(i.quantity * i.rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {isLastPage && (
            <div className="avoid-break summary-and-details-section mt-3 pt-3 border-t border-slate-100 space-y-3">
              <div className="flex justify-end">
                <div className="w-[230px]">
                  <SummaryTotals />
                </div>
              </div>
              <BankDetails />
              {invoice.notes && (
                <div className="avoid-break notes-block text-[11px] text-slate-600 bg-slate-50 px-3 py-2 rounded-md border border-slate-200/80">
                  <p className="font-semibold text-[9px] uppercase text-slate-400 mb-0.5">Notes</p>
                  <p className="whitespace-pre-line italic leading-snug">{invoice.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <FooterWatermark />
      </div>
    </div>
  );

  switch (profile.templateId) {
    case 'bold':
      return <BoldTemplate />;
    case 'sidebar':
      return <SidebarTemplate />;
    default:
      return <CleanTemplate />;
  }
};
