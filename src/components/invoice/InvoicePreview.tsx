import { forwardRef, useCallback } from 'react';
import { InvoiceData, InvoiceLineItem } from '@/types/invoice';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import loopifyLogo from '@/assets/loopify-logo.jpg';

interface InvoicePreviewProps {
  data: InvoiceData;
  onUpdate: (data: InvoiceData) => void;
  readOnly?: boolean;
}

const formatCurrency = (amount: number) =>
  amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function recalcTotals(items: InvoiceLineItem[]) {
  let taxableAmount = 0;
  let taxAmount = 0;
  items.forEach(item => {
    const itemTotal = (item.pre_tax_price || 0) * (item.qty_sold || 1);
    taxableAmount += itemTotal;
    taxAmount += (itemTotal * (item.gst || 0)) / 100;
  });
  return {
    taxableAmount: Math.round(taxableAmount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    grandTotal: Math.round((taxableAmount + taxAmount) * 100) / 100,
  };
}

const ROText = ({ value, className = '' }: { value: string | number | undefined; className?: string }) => (
  <span className={`text-sm text-gray-800 ${className}`}>{value ?? ''}</span>
);

const ROBlock = ({ value, className = '' }: { value: string | undefined; className?: string }) => (
  <p className={`text-sm text-gray-800 whitespace-pre-line leading-relaxed ${className}`}>{value ?? ''}</p>
);

export const InvoicePreview = forwardRef<HTMLDivElement, InvoicePreviewProps>(
  ({ data, onUpdate, readOnly = false }, ref) => {
    const { invoice, items, seller, bankDetails, terms } = data;

    const defaultSeller = {
      name: seller?.name || "Loopify World Private Ltd",
      address: seller?.address || "103-B, Anand Commercial Compound, Gandhi Nagar, LBS Marg, Vikhroli West, Mumbai - 400083",
      gst: seller?.gst || "27AAECL4397C1ZF",
      phone: seller?.phone || "+91 XXXXXXXXXX",
      email: seller?.email || "contact@loopify.world"
    };

    const defaultBankDetails = {
      bankName: bankDetails?.bankName || "ICICI Bank Ltd",
      accountNumber: bankDetails?.accountNumber || "002005040537",
      ifsc: bankDetails?.ifsc || "ICIC0000020",
      branch: bankDetails?.branch || "Powai, Mumbai"
    };

    const defaultTerms = [
      "Prices are inclusive of all taxes, branding and shipping as mentioned above.",
      "Client to share the address, mobile numbers and email ids for dispatch.",
      "Loopify team will dispatch hampers within 10-11 days from receipt of advance for order confirmation and approval on mock-ups. While we take all efforts to neutralise it, Loopify won't be responsible in case of unforeseen delays in delivery because of on ground issues, if any.",
      "The total invoice value, inclusive of GST, must be paid as per the agreed terms. Withholding or delaying the GST component is not permitted. Loopify will hold dispatch until the full amount is received."
    ];

    const defaultPaymentTerms = [
      "50% advance payment at the time of order confirmation.",
      "50% balance payment before dispatch"
    ];

    const editableTerms = terms ?? defaultTerms;
    const editablePaymentTerms = data.paymentTerms ?? defaultPaymentTerms;

    const updateInvoice = useCallback((field: string, value: string) => {
      onUpdate({ ...data, invoice: { ...data.invoice, [field]: value } });
    }, [data, onUpdate]);

    const updateItem = useCallback((index: number, field: keyof InvoiceLineItem, value: string | number) => {
      const newItems = [...items];
      newItems[index] = { ...newItems[index], [field]: value };
      onUpdate({ ...data, items: newItems, totals: recalcTotals(newItems) });
    }, [data, items, onUpdate]);

    const removeItem = useCallback((index: number) => {
      const newItems = items.filter((_, i) => i !== index);
      onUpdate({ ...data, items: newItems, totals: recalcTotals(newItems) });
    }, [data, items, onUpdate]);

    const addItem = useCallback(() => {
      const newItem: InvoiceLineItem = {
        id: `new-${Date.now()}`,
        gift_hamper_name: 'New Item',
        mrp: 0,
        pre_tax_price: 0,
        qty_sold: 1,
        gst: 18,
        gh_config: '',
      };
      const newItems = [...items, newItem];
      onUpdate({ ...data, items: newItems, totals: recalcTotals(newItems) });
    }, [data, items, onUpdate]);

    const updateTerms = useCallback((index: number, value: string) => {
      const newTerms = [...editableTerms];
      newTerms[index] = value;
      onUpdate({ ...data, terms: newTerms });
    }, [data, editableTerms, onUpdate]);

    const addTerm = useCallback(() => {
      onUpdate({ ...data, terms: [...editableTerms, ''] });
    }, [data, editableTerms, onUpdate]);

    const removeTerm = useCallback((index: number) => {
      onUpdate({ ...data, terms: editableTerms.filter((_, i) => i !== index) });
    }, [data, editableTerms, onUpdate]);

    const updatePaymentTerms = useCallback((index: number, value: string) => {
      const newPT = [...editablePaymentTerms];
      newPT[index] = value;
      onUpdate({ ...data, paymentTerms: newPT });
    }, [data, editablePaymentTerms, onUpdate]);

    const addPaymentTerm = useCallback(() => {
      onUpdate({ ...data, paymentTerms: [...editablePaymentTerms, ''] });
    }, [data, editablePaymentTerms, onUpdate]);

    const removePaymentTerm = useCallback((index: number) => {
      onUpdate({ ...data, paymentTerms: editablePaymentTerms.filter((_, i) => i !== index) });
    }, [data, editablePaymentTerms, onUpdate]);

    const updateBank = useCallback((field: string, value: string) => {
      onUpdate({ ...data, bankDetails: { ...defaultBankDetails, ...data.bankDetails, [field]: value } });
    }, [data, defaultBankDetails, onUpdate]);

    const updateSeller = useCallback((field: string, value: string) => {
      onUpdate({ ...data, seller: { ...defaultSeller, ...data.seller, [field]: value } });
    }, [data, defaultSeller, onUpdate]);

    const parseConfigItems = (config: string | string[] | undefined): string[] => {
      if (!config) return [];
      const configStr = typeof config === 'string' ? config : config.join('\n');
      if (!configStr.trim()) return [];
      const matches = configStr.match(/\(\d+\)\s*[^|()]+/g);
      if (matches && matches.length > 0) return matches.map(m => m.trim());
      return configStr.split(/\n/).map(l => l.trim()).filter(Boolean);
    };

    return (
      <Card ref={ref} className="p-8 bg-white text-black print:shadow-none" id="invoice-preview">
        {!readOnly && (
          <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 print:hidden">
            ✏️ All fields are editable. Click any text to modify. Changes recalculate totals automatically.
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold whitespace-nowrap">Invoice Number:</span>
              {readOnly ? (
                <ROText value={invoice.invoiceNumber} className="font-medium" />
              ) : (
                <Input
                  value={invoice.invoiceNumber}
                  onChange={(e) => updateInvoice('invoiceNumber', e.target.value)}
                  className="h-7 text-sm w-[180px] bg-transparent border-dashed"
                />
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold whitespace-nowrap">Invoice Date:</span>
              {readOnly ? (
                <ROText value={invoice.invoiceDate} className="font-medium" />
              ) : (
                <Input
                  value={invoice.invoiceDate}
                  onChange={(e) => updateInvoice('invoiceDate', e.target.value)}
                  className="h-7 text-sm w-[180px] bg-transparent border-dashed"
                />
              )}
            </div>
          </div>
          <img src={loopifyLogo} alt="Loopify Logo" className="h-16 object-contain" />
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-wide text-gray-800">PROFORMA INVOICE</h1>
        </div>

        <Separator className="my-4" />

        {/* Seller & Buyer */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          {/* Seller */}
          <div>
            <h3 className="font-semibold text-sm uppercase text-gray-600 mb-2">Seller:</h3>
            <div className="space-y-1 text-sm">
              {readOnly ? (
                <>
                  <p className="font-bold text-gray-900">{defaultSeller.name}</p>
                  <p className="text-gray-700 whitespace-pre-line leading-relaxed">{defaultSeller.address}</p>
                  <p className="text-gray-700">GST #: {defaultSeller.gst}</p>
                </>
              ) : (
                <>
                  <Input
                    value={defaultSeller.name}
                    onChange={(e) => updateSeller('name', e.target.value)}
                    className="h-7 text-sm font-bold bg-transparent border-dashed"
                  />
                  <Textarea
                    value={defaultSeller.address}
                    onChange={(e) => updateSeller('address', e.target.value)}
                    className="text-sm text-gray-700 bg-transparent border-dashed min-h-[60px] resize-none"
                  />
                  <div className="flex items-center gap-1 text-gray-700">
                    <span>GST #:</span>
                    <Input
                      value={defaultSeller.gst}
                      onChange={(e) => updateSeller('gst', e.target.value)}
                      className="h-7 text-sm bg-transparent border-dashed"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Billing */}
          <div>
            <h3 className="font-semibold text-sm uppercase text-gray-600 mb-1">Billing Address:</h3>
            {readOnly ? (
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed mb-3">{invoice.billingAddress || ''}</p>
            ) : (
              <Textarea
                value={invoice.billingAddress || ''}
                onChange={(e) => updateInvoice('billingAddress', e.target.value)}
                className="text-sm text-gray-700 bg-transparent border-dashed min-h-[60px] resize-none mb-3"
              />
            )}
            <div className="space-y-1 text-sm">
              {invoice.gst && (
                <div className="flex items-center gap-1 text-gray-700">
                  <span className="whitespace-nowrap font-medium">GST IN:</span>
                  {readOnly ? (
                    <ROText value={invoice.gst} />
                  ) : (
                    <Input
                      value={invoice.gst}
                      onChange={(e) => updateInvoice('gst', e.target.value)}
                      className="h-7 text-sm bg-transparent border-dashed"
                    />
                  )}
                </div>
              )}
              <div className="flex items-center gap-1 text-gray-700">
                <span className="whitespace-nowrap font-medium">Contact:</span>
                {readOnly ? (
                  <ROText value={invoice.contactPerson} />
                ) : (
                  <Input
                    value={invoice.contactPerson || ''}
                    onChange={(e) => updateInvoice('contactPerson', e.target.value)}
                    className="h-7 text-sm bg-transparent border-dashed"
                  />
                )}
              </div>
              <div className="flex items-center gap-1 text-gray-700">
                <span className="whitespace-nowrap font-medium">Mobile:</span>
                {readOnly ? (
                  <ROText value={invoice.mobile} />
                ) : (
                  <Input
                    value={invoice.mobile || ''}
                    onChange={(e) => updateInvoice('mobile', e.target.value)}
                    className="h-7 text-sm bg-transparent border-dashed"
                  />
                )}
              </div>
              <div className="flex items-center gap-1 text-gray-700">
                <span className="whitespace-nowrap font-medium">Email:</span>
                {readOnly ? (
                  <ROText value={invoice.email} />
                ) : (
                  <Input
                    value={invoice.email || ''}
                    onChange={(e) => updateInvoice('email', e.target.value)}
                    className="h-7 text-sm bg-transparent border-dashed"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="mb-6 border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-100">
                <TableHead className="w-10 text-center font-semibold text-black">No</TableHead>
                <TableHead className="font-semibold text-black">Product</TableHead>
                <TableHead className="text-center font-semibold text-black w-[100px]">Pre GST (₹)</TableHead>
                <TableHead className="text-center font-semibold text-black w-[70px]">GST %</TableHead>
                <TableHead className="text-center font-semibold text-black w-[70px]">Qty</TableHead>
                <TableHead className="text-center font-semibold text-black w-[110px]">Amount (₹)</TableHead>
                {!readOnly && <TableHead className="w-10 print:hidden" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                const mrp = (item.pre_tax_price || 0) * (1 + (item.gst || 0) / 100);
                const amount = mrp * (item.qty_sold || 1);
                const configItems = parseConfigItems(item.gh_config);

                return (
                  <TableRow key={item.id || index} className="border-b">
                    <TableCell className="text-center align-top text-sm">{index + 1}</TableCell>
                    <TableCell className="align-top">
                      {readOnly ? (
                        <>
                          <p className="text-sm font-bold text-gray-900 mb-1">{item.gift_hamper_name}</p>
                          {configItems.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {configItems.map((ci, ci_idx) => (
                                <li key={ci_idx} className="text-xs text-gray-600 flex gap-1">
                                  <span>•</span>
                                  <span>{ci}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      ) : (
                        <>
                          <Input
                            value={item.gift_hamper_name}
                            onChange={(e) => updateItem(index, 'gift_hamper_name', e.target.value)}
                            className="h-7 text-sm font-bold bg-transparent border-dashed mb-1"
                          />
                          <Textarea
                            value={typeof item.gh_config === 'string' ? item.gh_config : Array.isArray(item.gh_config) ? (item.gh_config as unknown as string[]).join(' ') : ''}
                            onChange={(e) => updateItem(index, 'gh_config', e.target.value)}
                            className="text-xs text-gray-600 bg-transparent border-dashed min-h-[40px] resize-none mt-1"
                            placeholder="Item config e.g. (1) Item Name (2) Another Item..."
                          />
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-center align-top">
                      {readOnly ? (
                        <span className="text-sm">{formatCurrency(item.pre_tax_price || 0)}</span>
                      ) : (
                        <Input
                          type="number"
                          value={item.pre_tax_price}
                          onChange={(e) => updateItem(index, 'pre_tax_price', parseFloat(e.target.value) || 0)}
                          className="h-7 text-sm text-center bg-transparent border-dashed w-[90px]"
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-center align-top">
                      {readOnly ? (
                        <span className="text-sm">{item.gst}%</span>
                      ) : (
                        <Input
                          type="number"
                          value={item.gst}
                          onChange={(e) => updateItem(index, 'gst', parseFloat(e.target.value) || 0)}
                          className="h-7 text-sm text-center bg-transparent border-dashed w-[60px]"
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-center align-top">
                      {readOnly ? (
                        <span className="text-sm">{item.qty_sold}</span>
                      ) : (
                        <Input
                          type="number"
                          value={item.qty_sold}
                          onChange={(e) => updateItem(index, 'qty_sold', parseInt(e.target.value) || 1)}
                          className="h-7 text-sm text-center bg-transparent border-dashed w-[60px]"
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-center font-medium align-top text-sm">
                      {formatCurrency(amount)}
                    </TableCell>
                    {!readOnly && (
                      <TableCell className="align-top print:hidden">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!readOnly && (
            <div className="p-2 print:hidden">
              <Button variant="ghost" size="sm" onClick={addItem} className="text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Line Item
              </Button>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-72 space-y-2 bg-gray-50 p-4 rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Taxable amount:</span>
              <span className="font-medium">{formatCurrency(data.totals.taxableAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tax:</span>
              <span className="font-medium">{formatCurrency(data.totals.taxAmount)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>TOTAL:</span>
              <span>₹ {formatCurrency(data.totals.grandTotal)}</span>
            </div>
          </div>
        </div>

        <Separator className="my-6" />

        {/* Terms */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-bold text-sm uppercase text-gray-800">TERMS:</h3>
            {!readOnly && (
              <Button type="button" variant="outline" size="sm" onClick={addTerm} className="h-8 gap-1">
                <Plus className="h-4 w-4" /> Add term
              </Button>
            )}
          </div>
          {readOnly ? (
            <ol className="list-decimal list-inside space-y-2">
              {editableTerms.map((term, index) => (
                <li key={index} className="text-sm text-gray-700 leading-relaxed">{term}</li>
              ))}
            </ol>
          ) : (
            <div className="space-y-2">
              {editableTerms.map((term, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <Textarea
                    value={term}
                    onChange={(e) => updateTerms(index, e.target.value)}
                    className="text-sm text-gray-700 bg-transparent border-dashed min-h-[36px] resize-none leading-relaxed"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeTerm(index)}
                    className="h-9 w-9 shrink-0"
                    aria-label={`Remove term ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment Terms */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-bold text-sm uppercase text-gray-800">PAYMENT TERMS:</h3>
            {!readOnly && (
              <Button type="button" variant="outline" size="sm" onClick={addPaymentTerm} className="h-8 gap-1">
                <Plus className="h-4 w-4" /> Add term
              </Button>
            )}
          </div>
          {readOnly ? (
            <ol className="list-decimal list-inside space-y-1">
              {editablePaymentTerms.map((term, index) => (
                <li key={index} className="text-sm text-gray-700 leading-relaxed">{term}</li>
              ))}
            </ol>
          ) : (
            <div className="space-y-2">
              {editablePaymentTerms.map((term, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <Textarea
                    value={term}
                    onChange={(e) => updatePaymentTerms(index, e.target.value)}
                    className="text-sm text-gray-700 bg-transparent border-dashed min-h-[32px] resize-none"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removePaymentTerm(index)}
                    className="h-9 w-9 shrink-0"
                    aria-label={`Remove payment term ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bank Details */}
        <div className="mb-6 bg-gray-50 p-4 rounded-lg">
          <h3 className="font-bold text-sm uppercase text-gray-800 mb-3">BANK DETAILS:</h3>
          <div className="text-sm space-y-1 text-gray-700">
            <div className="flex items-center gap-1">
              <span className="font-medium whitespace-nowrap">Account Name:</span>
              <span>LOOPIFY WORLD PVT LTD</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium whitespace-nowrap">Bank Name:</span>
              {readOnly ? (
                <ROText value={defaultBankDetails.bankName} />
              ) : (
                <Input
                  value={defaultBankDetails.bankName}
                  onChange={(e) => updateBank('bankName', e.target.value)}
                  className="h-7 text-sm bg-transparent border-dashed"
                />
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium whitespace-nowrap">Account No:</span>
              {readOnly ? (
                <ROText value={defaultBankDetails.accountNumber} />
              ) : (
                <Input
                  value={defaultBankDetails.accountNumber}
                  onChange={(e) => updateBank('accountNumber', e.target.value)}
                  className="h-7 text-sm bg-transparent border-dashed"
                />
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium whitespace-nowrap">IFSC Code:</span>
              {readOnly ? (
                <ROText value={defaultBankDetails.ifsc} />
              ) : (
                <Input
                  value={defaultBankDetails.ifsc}
                  onChange={(e) => updateBank('ifsc', e.target.value)}
                  className="h-7 text-sm bg-transparent border-dashed"
                />
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium whitespace-nowrap">Branch:</span>
              {readOnly ? (
                <ROText value={defaultBankDetails.branch} />
              ) : (
                <Input
                  value={defaultBankDetails.branch}
                  onChange={(e) => updateBank('branch', e.target.value)}
                  className="h-7 text-sm bg-transparent border-dashed"
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 pt-4 border-t">
          <a href="https://www.loopify.world" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 hover:text-gray-700 underline">
            www.loopify.world
          </a>
        </div>
      </Card>
    );
  }
);

InvoicePreview.displayName = 'InvoicePreview';