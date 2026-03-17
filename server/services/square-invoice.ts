import { SquareClient, SquareEnvironment } from "square";
import { storage } from "../storage";
import type { InsertSquareInvoice, Lead } from "@shared/schema";

function getSquareClient(): SquareClient {
  return new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN || "",
    environment: process.env.SQUARE_ENVIRONMENT === "production" 
      ? SquareEnvironment.Production 
      : SquareEnvironment.Sandbox,
  });
}

export class SquareInvoiceService {
  private locationId: string | null = null;

  async getLocationId(): Promise<string> {
    if (this.locationId) return this.locationId;
    
    try {
      const client = getSquareClient();
      const response = await client.locations.list();
      const locations = response.locations;
      if (!locations || locations.length === 0) {
        throw new Error("No Square locations found. Please set up a location in your Square dashboard.");
      }
      this.locationId = locations[0].id || null;
      if (!this.locationId) {
        throw new Error("Location ID is missing");
      }
      return this.locationId;
    } catch (error: any) {
      console.error("Error fetching Square locations:", error);
      const env = process.env.SQUARE_ENVIRONMENT || 'sandbox';
      if (error.message?.includes('401') || error.message?.includes('UNAUTHORIZED') || error.message?.includes('AUTHENTICATION_ERROR')) {
        throw new Error(`Square authentication failed. Your access token may be invalid or expired. Make sure SQUARE_ACCESS_TOKEN matches your ${env} environment. Get a new token from developer.squareup.com.`);
      }
      throw new Error(`Failed to get Square location: ${error.message}`);
    }
  }

  async createOrGetCustomer(email: string, name: string, phone?: string): Promise<string> {
    try {
      const client = getSquareClient();
      
      const searchResponse = await client.customers.search({
        query: {
          filter: {
            emailAddress: {
              exact: email,
            },
          },
        },
      });

      if (searchResponse.customers && searchResponse.customers.length > 0) {
        return searchResponse.customers[0].id!;
      }

      const nameParts = name.split(" ");
      const firstName = nameParts[0] || name;
      const lastName = nameParts.slice(1).join(" ") || "";

      const createResponse = await client.customers.create({
        emailAddress: email,
        givenName: firstName,
        familyName: lastName,
        phoneNumber: phone,
        idempotencyKey: `customer-${email}-${Date.now()}`,
      });

      return createResponse.customer!.id!;
    } catch (error: any) {
      console.error("Error creating/getting Square customer:", error);
      throw new Error(`Failed to create customer: ${error.message}`);
    }
  }

  async createInvoiceForLead(
    lead: Lead,
    amount: number,
    description?: string,
    dueDate?: string
  ): Promise<{ invoiceId: string; invoiceUrl: string; squareInvoiceId: string }> {
    const client = getSquareClient();
    const locationId = await this.getLocationId();
    const customerName = `${lead.firstName} ${lead.lastName}`;
    const customerId = await this.createOrGetCustomer(lead.email, customerName, lead.phone);

    const amountInCents = BigInt(Math.round(amount * 100));

    const orderResponse = await client.orders.create({
      idempotencyKey: `order-${lead.id}-${Date.now()}`,
      order: {
        locationId,
        customerId,
        lineItems: [
          {
            name: description || `Moving Service - ${lead.serviceType}`,
            quantity: "1",
            basePriceMoney: {
              amount: amountInCents,
              currency: "USD",
            },
          },
        ],
      },
    });

    const orderId = orderResponse.order!.id!;

    const invoiceResponse = await client.invoices.create({
      idempotencyKey: `invoice-${lead.id}-${Date.now()}`,
      invoice: {
        orderId,
        locationId,
        primaryRecipient: {
          customerId,
        },
        paymentRequests: [
          {
            requestType: "BALANCE",
            dueDate: dueDate || this.getDefaultDueDate(),
          },
        ],
        deliveryMethod: "EMAIL",
        acceptedPaymentMethods: {
          card: true,
          bankAccount: true,
          squareGiftCard: false,
          buyNowPayLater: false,
          cashAppPay: true,
        },
        title: `Invoice - JC ON THE MOVE`,
        description: description || `Moving service for ${customerName}`,
      },
    });

    const squareInvoice = invoiceResponse.invoice!;

    const publishResponse = await client.invoices.publish({
      invoiceId: squareInvoice.id!,
      version: squareInvoice.version!,
      idempotencyKey: `publish-${squareInvoice.id}-${Date.now()}`,
    });

    const publishedInvoice = publishResponse.invoice!;

    const invoiceData: InsertSquareInvoice = {
      leadId: lead.id,
      squareInvoiceId: publishedInvoice.id!,
      squareOrderId: orderId,
      customerId,
      customerEmail: lead.email,
      customerName,
      amount: amount.toString(),
      currency: "USD",
      description: description || `Moving service - ${lead.serviceType}`,
      status: "sent",
      invoiceUrl: publishedInvoice.publicUrl,
      dueDate: dueDate || this.getDefaultDueDate(),
    };

    const savedInvoice = await storage.createSquareInvoice(invoiceData);

    return {
      invoiceId: savedInvoice.id,
      invoiceUrl: publishedInvoice.publicUrl || "",
      squareInvoiceId: publishedInvoice.id!,
    };
  }

  async createStandaloneInvoice(
    email: string,
    name: string,
    phone: string | undefined,
    amount: number,
    description: string,
    dueDate?: string
  ): Promise<{ invoiceId: string; invoiceUrl: string; squareInvoiceId: string }> {
    const client = getSquareClient();
    const locationId = await this.getLocationId();
    const customerId = await this.createOrGetCustomer(email, name, phone);

    const amountInCents = BigInt(Math.round(amount * 100));

    const orderResponse = await client.orders.create({
      idempotencyKey: `order-standalone-${Date.now()}`,
      order: {
        locationId,
        customerId,
        lineItems: [
          {
            name: description,
            quantity: "1",
            basePriceMoney: {
              amount: amountInCents,
              currency: "USD",
            },
          },
        ],
      },
    });

    const orderId = orderResponse.order!.id!;

    const invoiceResponse = await client.invoices.create({
      idempotencyKey: `invoice-standalone-${Date.now()}`,
      invoice: {
        orderId,
        locationId,
        primaryRecipient: {
          customerId,
        },
        paymentRequests: [
          {
            requestType: "BALANCE",
            dueDate: dueDate || this.getDefaultDueDate(),
          },
        ],
        deliveryMethod: "EMAIL",
        acceptedPaymentMethods: {
          card: true,
          bankAccount: true,
          squareGiftCard: false,
          buyNowPayLater: false,
          cashAppPay: true,
        },
        title: `Invoice - JC ON THE MOVE`,
        description,
      },
    });

    const squareInvoice = invoiceResponse.invoice!;

    const publishResponse = await client.invoices.publish({
      invoiceId: squareInvoice.id!,
      version: squareInvoice.version!,
      idempotencyKey: `publish-${squareInvoice.id}-${Date.now()}`,
    });

    const publishedInvoice = publishResponse.invoice!;

    const invoiceData: InsertSquareInvoice = {
      squareInvoiceId: publishedInvoice.id!,
      squareOrderId: orderId,
      customerId,
      customerEmail: email,
      customerName: name,
      amount: amount.toString(),
      currency: "USD",
      description,
      status: "sent",
      invoiceUrl: publishedInvoice.publicUrl,
      dueDate: dueDate || this.getDefaultDueDate(),
    };

    const savedInvoice = await storage.createSquareInvoice(invoiceData);

    return {
      invoiceId: savedInvoice.id,
      invoiceUrl: publishedInvoice.publicUrl || "",
      squareInvoiceId: publishedInvoice.id!,
    };
  }

  async createItemizedInvoiceForLead(
    lead: Lead,
    lineItems: Array<{ name: string; qty: number; unitPrice: number; total: number }>,
    dueDate?: string
  ): Promise<{ invoiceId: string; invoiceUrl: string; squareInvoiceId: string }> {
    const client = getSquareClient();
    const locationId = await this.getLocationId();
    const customerName = `${lead.firstName} ${lead.lastName}`;
    const customerId = await this.createOrGetCustomer(lead.email, customerName, lead.phone || undefined);

    const squareLineItems = lineItems.map(li => ({
      name: li.name,
      quantity: String(li.qty),
      basePriceMoney: {
        amount: BigInt(Math.round(li.unitPrice * 100)),
        currency: "USD" as const,
      },
    }));

    const totalAmount = lineItems.reduce((s, li) => s + li.total, 0);

    const orderResponse = await client.orders.create({
      idempotencyKey: `order-itemized-${lead.id}-${Date.now()}`,
      order: {
        locationId,
        customerId,
        lineItems: squareLineItems,
      },
    });

    const orderId = orderResponse.order!.id!;

    const invoiceResponse = await client.invoices.create({
      idempotencyKey: `invoice-itemized-${lead.id}-${Date.now()}`,
      invoice: {
        orderId,
        locationId,
        primaryRecipient: { customerId },
        paymentRequests: [{ requestType: "BALANCE", dueDate: dueDate || this.getDefaultDueDate() }],
        deliveryMethod: "EMAIL",
        acceptedPaymentMethods: { card: true, bankAccount: true, squareGiftCard: false, buyNowPayLater: false, cashAppPay: true },
        title: `Invoice - JC ON THE MOVE`,
        description: `Moving service for ${customerName}`,
      },
    });

    const squareInvoice = invoiceResponse.invoice!;
    const publishResponse = await client.invoices.publish({
      invoiceId: squareInvoice.id!,
      version: squareInvoice.version!,
      idempotencyKey: `publish-itemized-${squareInvoice.id}-${Date.now()}`,
    });
    const publishedInvoice = publishResponse.invoice!;

    const invoiceData: InsertSquareInvoice = {
      leadId: lead.id,
      squareInvoiceId: publishedInvoice.id!,
      squareOrderId: orderId,
      customerId,
      customerEmail: lead.email,
      customerName,
      amount: totalAmount.toFixed(2),
      currency: "USD",
      description: `Itemized order — ${lineItems.length} line item(s)`,
      status: "sent",
      invoiceUrl: publishedInvoice.publicUrl,
      dueDate: dueDate || this.getDefaultDueDate(),
    };

    const savedInvoice = await storage.createSquareInvoice(invoiceData);
    return {
      invoiceId: savedInvoice.id,
      invoiceUrl: publishedInvoice.publicUrl || "",
      squareInvoiceId: publishedInvoice.id!,
    };
  }

  async getInvoiceStatus(squareInvoiceId: string): Promise<string> {
    try {
      const client = getSquareClient();
      const response = await client.invoices.get({ invoiceId: squareInvoiceId });
      return response.invoice?.status || "UNKNOWN";
    } catch (error: any) {
      console.error("Error getting invoice status:", error);
      throw new Error(`Failed to get invoice status: ${error.message}`);
    }
  }

  async cancelInvoice(squareInvoiceId: string): Promise<void> {
    try {
      const client = getSquareClient();
      const getResponse = await client.invoices.get({ invoiceId: squareInvoiceId });
      const version = getResponse.invoice?.version;
      
      if (!version) {
        throw new Error("Could not get invoice version");
      }

      await client.invoices.cancel({
        invoiceId: squareInvoiceId,
        version,
      });

      await storage.updateSquareInvoiceStatus(squareInvoiceId, "canceled");
    } catch (error: any) {
      console.error("Error canceling invoice:", error);
      throw new Error(`Failed to cancel invoice: ${error.message}`);
    }
  }

  async syncInvoiceStatus(squareInvoiceId: string): Promise<string> {
    try {
      const client = getSquareClient();
      const response = await client.invoices.get({ invoiceId: squareInvoiceId });
      const invoice = response.invoice;
      
      if (!invoice) {
        throw new Error("Invoice not found");
      }

      const status = this.mapSquareStatus(invoice.status || "DRAFT");
      await storage.updateSquareInvoiceStatus(squareInvoiceId, status);
      
      return status;
    } catch (error: any) {
      console.error("Error syncing invoice status:", error);
      throw new Error(`Failed to sync invoice status: ${error.message}`);
    }
  }

  private mapSquareStatus(squareStatus: string): string {
    const statusMap: Record<string, string> = {
      DRAFT: "draft",
      UNPAID: "sent",
      SCHEDULED: "sent",
      PARTIALLY_PAID: "sent",
      PAID: "paid",
      PARTIALLY_REFUNDED: "paid",
      REFUNDED: "paid",
      CANCELED: "canceled",
      FAILED: "failed",
      PAYMENT_PENDING: "sent",
    };
    return statusMap[squareStatus] || "sent";
  }

  private getDefaultDueDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().split("T")[0];
  }

  isConfigured(): boolean {
    return !!process.env.SQUARE_ACCESS_TOKEN;
  }
}

export const squareInvoiceService = new SquareInvoiceService();
