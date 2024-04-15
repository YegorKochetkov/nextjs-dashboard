import { sql } from '@vercel/postgres';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  User,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';

export async function fetchRevenue() {
  // Add noStore() here to prevent the response from being cached.
  // This is equivalent to in fetch(..., {cache: 'no-store'}).

  try {
    // Artificially delay a response for demo purposes.
    // Don't do this in production :)

    // console.log('Fetching revenue data...');
    // await new Promise((resolve) => setTimeout(resolve, 3000));

    const data = await sql<Revenue>`SELECT * FROM revenue_nextjs_dashboard`;

    // console.log('Data fetch completed after 3 seconds.');

    return data.rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {
  try {
    const data = await sql<LatestInvoiceRaw>`
      SELECT 
        invoices_nextjs_dashboard.amount, 
        customers_nextjs_dashboard.name, 
        customers_nextjs_dashboard.image_url, 
        customers_nextjs_dashboard.email, 
        invoices_nextjs_dashboard.id
      FROM invoices_nextjs_dashboard
      JOIN customers_nextjs_dashboard 
      ON invoices_nextjs_dashboard.customer_id = customers_nextjs_dashboard.id
      ORDER BY invoices_nextjs_dashboard.date DESC
      LIMIT 5`;

    const latestInvoices = data.rows.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  try {
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.
    const invoiceCountPromise = sql`SELECT COUNT(*) FROM invoices_nextjs_dashboard`;
    const customerCountPromise = sql`SELECT COUNT(*) FROM customers_nextjs_dashboard`;
    const invoiceStatusPromise = sql`SELECT
         SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
         SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
         FROM invoices_nextjs_dashboard`;

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(data[0].rows[0].count ?? '0');
    const numberOfCustomers = Number(data[1].rows[0].count ?? '0');
    const totalPaidInvoices = formatCurrency(data[2].rows[0].paid ?? '0');
    const totalPendingInvoices = formatCurrency(data[2].rows[0].pending ?? '0');

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const invoices = await sql<InvoicesTable>`
      SELECT
        invoices_nextjs_dashboard.id,
        invoices_nextjs_dashboard.amount,
        invoices_nextjs_dashboard.date,
        invoices_nextjs_dashboard.status,
        customers_nextjs_dashboard.name,
        customers_nextjs_dashboard.email,
        customers_nextjs_dashboard.image_url
      FROM invoices_nextjs_dashboard
      JOIN customers_nextjs_dashboard 
      ON invoices_nextjs_dashboard.customer_id = customers_nextjs_dashboard.id
      WHERE
        customers_nextjs_dashboard.name ILIKE ${`%${query}%`} OR
        customers_nextjs_dashboard.email ILIKE ${`%${query}%`} OR
        invoices_nextjs_dashboard.amount::text ILIKE ${`%${query}%`} OR
        invoices_nextjs_dashboard.date::text ILIKE ${`%${query}%`} OR
        invoices_nextjs_dashboard.status ILIKE ${`%${query}%`}
      ORDER BY invoices_nextjs_dashboard.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `;

    return invoices.rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const count = await sql`SELECT COUNT(*)
    FROM invoices_nextjs_dashboard
    JOIN customers_nextjs_dashboard 
    ON invoices_nextjs_dashboard.customer_id = customers_nextjs_dashboard.id
    WHERE
      customers_nextjs_dashboard.name ILIKE ${`%${query}%`} OR
      customers_nextjs_dashboard.email ILIKE ${`%${query}%`} OR
      invoices_nextjs_dashboard.amount::text ILIKE ${`%${query}%`} OR
      invoices_nextjs_dashboard.date::text ILIKE ${`%${query}%`} OR
      invoices_nextjs_dashboard.status ILIKE ${`%${query}%`}
  `;

    const totalPages = Math.ceil(Number(count.rows[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const data = await sql<InvoiceForm>`
      SELECT
        invoices_nextjs_dashboard.id,
        invoices_nextjs_dashboard.customer_id,
        invoices_nextjs_dashboard.amount,
        invoices_nextjs_dashboard.status
      FROM invoices_nextjs_dashboard
      WHERE invoices_nextjs_dashboard.id = ${id};
    `;

    const invoice = data.rows.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100,
    }));

    return invoice[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    const data = await sql<CustomerField>`
      SELECT
        id,
        name
      FROM customers_nextjs_dashboard
      ORDER BY name ASC
    `;

    const customers = data.rows;
    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const data = await sql<CustomersTableType>`
		SELECT
		  customers_nextjs_dashboard.id,
		  customers_nextjs_dashboard.name,
		  customers_nextjs_dashboard.email,
		  customers_nextjs_dashboard.image_url,
		  COUNT(invoices_nextjs_dashboard.id) AS total_invoices,
		  SUM(
        CASE WHEN invoices_nextjs_dashboard.status = 'pending' 
        THEN invoices_nextjs_dashboard.amount ELSE 0 END
      ) AS total_pending,
		  SUM(
        CASE WHEN invoices_nextjs_dashboard.status = 'paid' 
        THEN invoices_nextjs_dashboard.amount ELSE 0 END
      ) AS total_paid
		FROM customers_nextjs_dashboard
		LEFT JOIN invoices_nextjs_dashboard 
    ON customers_nextjs_dashboard.id = invoices_nextjs_dashboard.customer_id
		WHERE
		  customers_nextjs_dashboard.name ILIKE ${`%${query}%`} OR
        customers_nextjs_dashboard.email ILIKE ${`%${query}%`}
		GROUP BY 
      customers_nextjs_dashboard.id, 
      customers_nextjs_dashboard.name, 
      customers_nextjs_dashboard.email, 
      _nextjs_dashboard
      customers_nextjs_dashboard.image_url
		ORDER BY customers_nextjs_dashboard.name ASC
	  `;

    const customers = data.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}

export async function getUser(email: string) {
  try {
    const user = await sql`
      SELECT * FROM users_nextjs_dashboard 
      WHERE email=${email}
    `;
    return user.rows[0] as User;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user.');
  }
}
