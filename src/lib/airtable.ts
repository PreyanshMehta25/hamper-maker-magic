const AIRTABLE_API_URL = "https://api.airtable.com/v0";

// Note: In a real production app, you should NOT expose these in the frontend.
// They are here to demonstrate how to bypass Supabase as requested.
const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID?.trim();
const API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY?.trim();
const SALE_BASE_ID = import.meta.env.VITE_AIRTABLE_SALE_BASE_ID?.trim();
const SALE_TOKEN = import.meta.env.VITE_AIRTABLE_SALE_TOKEN?.trim();

async function airtableFetch(
  baseId: string,
  apiKey: string,
  path: string,
  options: RequestInit = {},
) {
  // Ensure we don't have trailing '?' if there are no query params
  const cleanPath = path.endsWith("?") ? path.slice(0, -1) : path;
  const url = `${AIRTABLE_API_URL}/${baseId}/${cleanPath}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 403) {
      throw new Error(
        `Airtable Permission Error (403): This is usually because your Token doesn't have access to the base '${baseId}' or is missing the 'data.records:read' scope. Original error: ${errorText}`,
      );
    }
    if (response.status === 404) {
      throw new Error(
        `Airtable Not Found (404): This usually means the Base ID '${baseId}' is wrong or the Table Name in your code doesn't match Airtable exactly. Original error: ${errorText}`,
      );
    }
    throw new Error(`Airtable error: ${response.status} ${errorText}`);
  }

  return response.json();
}

export const AirtableService = {
  async fetchProducts() {
    // Products come from the SALE base
    const baseId = SALE_BASE_ID || BASE_ID;
    const token = SALE_TOKEN || API_KEY;

    if (!baseId || !token) {
      console.error("Airtable configuration missing for products:", {
        baseId: !!baseId,
        token: !!token,
      });
      throw new Error("Missing Airtable Sale configuration for Products.");
    }

    const tableName = encodeURIComponent("Product");
    let allRecords: any[] = [];
    let offset: string | undefined;

    do {
      const params = new URLSearchParams();
      if (offset) params.set("offset", offset);

      const data = await airtableFetch(
        baseId,
        token,
        `${tableName}?${params.toString()}`,
      );
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    return allRecords.map((record: any) => {
      const f = record.fields;
      const img =
        f.image && Array.isArray(f.image) && f.image.length > 0
          ? f.image[0].url
          : null;
      return {
        p_id: f.p_id || "",
        fancy_name: f.fancy_name || "",
        category: f.category || "",
        product_type: f.product_type || "",
        product_tier: f.product_tier || "",
        pre_tax_db: Number(f.pre_tax_db) || 0,
        unsold_after_receivables: Number(f.unsold_after_receivables) || 0,
        image: img,
      };
    });
  },

  async fetchRecentInvoices() {
    // Invoices come from the SALE base
    const baseId = SALE_BASE_ID || BASE_ID;
    const token = SALE_TOKEN || API_KEY;

    if (!baseId || !token) {
      console.error("Airtable configuration missing for invoices:", {
        baseId: !!baseId,
        token: !!token,
      });
      throw new Error("Missing Airtable Sale configuration for Invoices.");
    }

    const tableName = encodeURIComponent("Sale");
    const path = `${tableName}?maxRecords=20&sort%5B0%5D%5Bfield%5D=invoice_date&sort%5B0%5D%5Bdirection%5D=desc`;
    const data = await airtableFetch(baseId, token, path);

    return (data.records || [])
      .map((record: any) => ({
        srNo: String(record.fields["autonum"] ?? record.fields.autonum ?? ""),
        invoiceNumber: String(
          record.fields.sales_invoice_number ||
            record.fields["Invoice Number"] ||
            "",
        ),
        invoiceDate:
          record.fields.invoice_date || record.fields["Invoice Date"] || "",
      }))
      .filter((inv: any) => inv.srNo !== "");
  },

  async fetchInvoiceData(invoiceNumber: string) {
    // Invoice data comes from the SALE base
    const baseId = SALE_BASE_ID || BASE_ID;
    const token = SALE_TOKEN || API_KEY;

    if (!baseId || !token) {
      console.error("Airtable configuration missing for invoice data:", {
        baseId: !!baseId,
        token: !!token,
      });
      throw new Error("Missing Airtable Sale configuration for Invoice Data.");
    }

    const saleTableName = encodeURIComponent("Sale");
    const saleFormula = encodeURIComponent(`{autonum}="${invoiceNumber}"`);
    const salePath = `${saleTableName}?filterByFormula=${saleFormula}&maxRecords=1`;
    const saleData = await airtableFetch(baseId, token, salePath);

    if (!saleData.records || saleData.records.length === 0) {
      throw new Error("Invoice not found");
    }

    const saleRecord = saleData.records[0];
    const saleFields = saleRecord.fields;
    const saleRecordId = saleRecord.id;
    const soId = saleFields.so_id || saleFields["so_id"] || "";

    const liTableName = encodeURIComponent("Sale_LI");
    const liFormula = encodeURIComponent(`FIND("${soId}", ARRAYJOIN({so}))`);
    const liPath = `${liTableName}?filterByFormula=${liFormula}`;
    const liData = await airtableFetch(baseId, token, liPath);

    const lineItems = (liData.records || []).map((record: any) => {
      const fancyConfigRaw =
        record.fields.fancy_config || record.fields["fancy_config"] || "";
      const ghConfigRaw =
        record.fields.gh_config || record.fields["gh_config"] || "";
      const configRaw = fancyConfigRaw || ghConfigRaw;
      const ghConfig = Array.isArray(configRaw)
        ? configRaw.join("\n")
        : configRaw || "";

      const ghIdRaw =
        record.fields.gh_id ||
        record.fields["gh_id"] ||
        record.fields["Gift Hamper"] ||
        "";
      const ghId = Array.isArray(ghIdRaw) ? ghIdRaw[0] : ghIdRaw;

      return {
        id: record.id,
        gh_id: ghId || "",
        gift_hamper_name:
          record.fields.gift_hamper_name ||
          record.fields["Gift Hamper Name"] ||
          "",
        mrp: record.fields.mrp || record.fields["MRP (Selling Price)"] || 0,
        pre_tax_price:
          record.fields.pre_tax_price || record.fields["Pre GST Price"] || 0,
        qty_sold: record.fields.qty_sold || record.fields["Qty"] || 1,
        gst: record.fields.gst || record.fields["GST"] || 0,
        gh_config: ghConfig,
      };
    });

    // Always pull the latest hamper config from the Gift Hamper master base.
    // This runs for every line item that has a gh_id, not just ones missing
    // a config, so the proforma invoice always reflects current hamper contents.
    if (BASE_ID && API_KEY) {
      const itemsWithGhId = lineItems.filter((item: any) => item.gh_id);
      const uniqueGhIds = [
        ...new Set(itemsWithGhId.map((item: any) => item.gh_id)),
      ];

      const ghConfigByGhId: Record<string, string> = {};

      for (const ghId of uniqueGhIds) {
        try {
          const ghTableName = encodeURIComponent("Gift Hamper");
          const ghFormula = encodeURIComponent(`{gh_id}="${ghId}"`);
          const ghPath = `${ghTableName}?filterByFormula=${ghFormula}&maxRecords=1&fields%5B%5D=fancy_config&fields%5B%5D=gh_id&fields%5B%5D=Gift%20Hamper%20Name`;
          const ghData = await airtableFetch(BASE_ID, API_KEY, ghPath);
          if (ghData.records && ghData.records.length > 0) {
            const fancyConfigRaw = ghData.records[0].fields.fancy_config || "";
            const fancyConfig = Array.isArray(fancyConfigRaw)
              ? fancyConfigRaw.join("\n")
              : fancyConfigRaw;
            ghConfigByGhId[ghId as string] = fancyConfig;
          }
        } catch (e) {
          console.warn("Failed to fetch fancy_config for gh_id:", ghId, e);
        }
      }

      lineItems.forEach((item: any) => {
        if (item.gh_id && ghConfigByGhId[item.gh_id]) {
          item.gh_config = ghConfigByGhId[item.gh_id];
        }
      });

      // Fallback: for any item still missing a config (no gh_id, or lookup
      // failed), try matching by hamper name instead.
      const itemsStillMissing = lineItems.filter(
        (item: any) => !item.gh_config && item.gift_hamper_name,
      );
      if (itemsStillMissing.length > 0) {
        const uniqueNames = [
          ...new Set(
            itemsStillMissing.map((item: any) => item.gift_hamper_name),
          ),
        ];
        for (const hamperName of uniqueNames) {
          try {
            const ghTableName = encodeURIComponent("Gift Hamper");
            const ghFormula = encodeURIComponent(
              `{Gift Hamper Name}="${hamperName}"`,
            );
            const ghPath = `${ghTableName}?filterByFormula=${ghFormula}&maxRecords=1&fields%5B%5D=fancy_config&fields%5B%5D=Gift%20Hamper%20Name`;
            const ghData = await airtableFetch(BASE_ID, API_KEY, ghPath);
            if (ghData.records && ghData.records.length > 0) {
              const fancyConfigRaw = ghData.records[0].fields.fancy_config || "";
              const fancyConfig = Array.isArray(fancyConfigRaw)
                ? fancyConfigRaw.join("\n")
                : fancyConfigRaw;
              lineItems.forEach((item: any) => {
                if (item.gift_hamper_name === hamperName && !item.gh_config) {
                  item.gh_config = fancyConfig;
                }
              });
            }
          } catch (e) {
            console.warn("Failed to fetch fancy_config for:", hamperName, e);
          }
        }
      }
    }

    let taxableAmount = 0;
    let taxAmount = 0;
    lineItems.forEach((item: any) => {
      const itemTotal = (item.pre_tax_price || 0) * (item.qty_sold || 1);
      taxableAmount += itemTotal;
      taxAmount += (itemTotal * (item.gst || 0)) / 100;
    });

    let billingAddress = "";
    for (const record of liData.records || []) {
      const addr =
        record.fields["Billing Address"] ||
        record.fields["billing_address"] ||
        "";
      if (addr) {
        billingAddress = Array.isArray(addr) ? addr.join("\n") : addr;
        break;
      }
    }

    const spocRaw =
      saleFields["SPOC Details"] ||
      saleFields["spoc_details"] ||
      saleFields["spoc_list (from Client)"] ||
      saleFields["spoc_master_list (from Client)"] ||
      "";
    const spocDetails = Array.isArray(spocRaw)
      ? spocRaw.join("\n")
      : spocRaw || "";
    let contactPerson = "";
    let mobile = "";
    let email = "";

    if (spocDetails) {
      const hasLabels =
        /contact\s*person:/i.test(spocDetails) ||
        /mobile:/i.test(spocDetails) ||
        /email:/i.test(spocDetails);
      if (hasLabels) {
        const contactMatch = spocDetails.match(
          /Contact\s*person:\s*(.+?)(?=\s*(?:Mobile:|Email:|$))/is,
        );
        if (contactMatch) contactPerson = contactMatch[1].trim();
        const mobileMatch = spocDetails.match(/Mobile:\s*([+\d][\d\s-]*)/i);
        if (mobileMatch) mobile = mobileMatch[1].trim();
        const emailMatch = spocDetails.match(/Email:\s*([^\s]+@[^\s]+)/i);
        if (emailMatch) email = emailMatch[1].trim();
      } else {
        const lines = spocDetails
          .split(/\n/)
          .map((l: string) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          if (!email && line.includes("@")) email = line;
          else if (!mobile && line.match(/^[+]?\d[\d\s-]{6,}/)) mobile = line;
          else if (!contactPerson) contactPerson = line;
        }
      }
    }

    return {
      invoice: {
        invoiceNumber:
          saleFields.sales_invoice_number ||
          saleFields["Invoice Number"] ||
          invoiceNumber,
        srNo: saleFields["autonum"] || saleFields.autonum || invoiceNumber,
        invoiceDate:
          saleFields.invoice_date || saleFields["Invoice Date"] || "",
        billingAddress: billingAddress,
        gst: saleFields["GST"] || saleFields.gst || "",
        contactPerson: contactPerson,
        mobile: mobile,
        email: email,
        recordId: saleRecordId,
      },
      items: lineItems,
      totals: {
        taxableAmount: Math.round(taxableAmount * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        grandTotal: Math.round((taxableAmount + taxAmount) * 100) / 100,
      },
      seller: {
        name: "Loopify World Private Ltd",
        address: "103-B, Anand Commercial Compound, Gandhi Nagar, LBS Marg, Vikhroli West, Mumbai - 400083",
        gst: "27AAECL4397C1ZF",
        phone: "",
        email: "",
      },
      bankDetails: {
        bankName: "ICICI Bank Ltd",
        accountNumber: "002005040537",
        ifsc: "ICIC0000020",
        branch: "Powai, Mumbai",
      },
      terms: [
        "Prices are inclusive of all taxes, branding and shipping as mentioned above.",
        "Client to share the address, mobile numbers and email ids for dispatch.",
        "Loopify team will dispatch hampers within 10-11 days from receipt of advance for order confirmation and approval on mock-ups. While we take all efforts to neutralise it, Loopify won't be responsible in case of unforeseen delays in delivery because of on ground issues, if any.",
        "The total invoice value, inclusive of GST, must be paid as per the agreed terms. Withholding or delaying the GST component is not permitted. Loopify will hold dispatch until the full amount is received.",
      ],
      paymentTerms: [
        "50% advance payment at the time of order confirmation.",
        "50% balance payment before dispatch",
      ],
    };
  },

  async fetchHamperDetails(ghId: string) {
    // Gift Hamper details come from the MAIN base
    if (!BASE_ID || !API_KEY) {
      console.error("Airtable configuration missing for hamper details:", {
        BASE_ID: !!BASE_ID,
        API_KEY: !!API_KEY,
      });
      throw new Error(
        "Missing Airtable configuration for Hamper Details. Please ensure VITE_AIRTABLE_BASE_ID and VITE_AIRTABLE_API_KEY are set.",
      );
    }

    const tableName = encodeURIComponent("Gift Hamper");
    const formula = encodeURIComponent(`{gh_id}="${ghId}"`);
    const path = `${tableName}?filterByFormula=${formula}&maxRecords=1`;
    const data = await airtableFetch(BASE_ID, API_KEY, path);

    if (!data.records || data.records.length === 0) {
      throw new Error("Gift Hamper not found");
    }

    const record = data.records[0].fields;
    const image =
      record.Image && record.Image.length > 0 ? record.Image[0].url : null;

    return {
      gh_id: ghId,
      name: record["Gift Hamper Name"] || "",
      image,
      gh_bom: record.gh_bom || "",
      fancy_config: record.fancy_config || "",
      pre_tax_sale_price_without_shipping:
        record.pre_tax_sale_price_without_shipping || 0,
    };
  },
};