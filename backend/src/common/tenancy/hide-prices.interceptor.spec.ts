import { stripPrices } from './hide-prices.interceptor.js';
import { toPlainText } from '../../modules/mail/mail.service.js';

describe('stripPrices', () => {
  it('removes every money field at any depth, keeps the rest', () => {
    const page = {
      total: 2, // pagination, not money
      data: [
        {
          title: 'Birth certificate',
          calculatedTotal: 50,
          finalPrice: 45,
          paymentAmount: 40,
          paymentCurrency: 'EUR',
          deadline: new Date('2026-12-01'),
          lineItems: [
            {
              pageCount: 2,
              pricePerPage: 25,
              discountedPricePerPage: 20,
              useDiscountedPrice: true,
              lineTotal: 50,
            },
          ],
          template: { name: 'Birth certificate', pricePerPage: 25 },
        },
      ],
    };
    stripPrices(page);
    expect(page.total).toBe(2);
    const job = page.data[0] as Record<string, unknown>;
    expect(Object.keys(job).sort()).toEqual([
      'deadline',
      'lineItems',
      'template',
      'title',
    ]);
    expect(job.deadline).toBeInstanceOf(Date);
    expect(page.data[0].lineItems[0]).toEqual({ pageCount: 2 });
    expect(page.data[0].template).toEqual({ name: 'Birth certificate' });
  });

  it('copes with primitives, nulls and cycles', () => {
    expect(stripPrices(null)).toBeNull();
    expect(stripPrices(3)).toBe(3);
    const a: Record<string, unknown> = { lineTotal: 1 };
    a.self = a;
    stripPrices(a);
    expect(a.lineTotal).toBeUndefined();
  });
});

describe('toPlainText (email text part)', () => {
  it('turns links into "label: url" and drops the duplicate fallback link', () => {
    const text = toPlainText(
      '<h1 style="x">Hi Lina,</h1><p>Join <strong>Acme &amp; Co</strong>.</p>' +
        '<table><tr><td><a href="https://x.test/register?token=1" style="y">Create your account</a></td></tr></table>' +
        '<p data-fallback style="z">Or open this link: <a href="https://x.test/register?token=1">https://x.test/register?token=1</a></p>' +
        '<p>Line one<br>Line two</p>',
    );
    expect(text).toBe(
      'Hi Lina,\n\nJoin Acme & Co.\n\nCreate your account: https://x.test/register?token=1\n\nLine one\nLine two',
    );
  });
});
