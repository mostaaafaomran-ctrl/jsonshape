# JSONShape

Paste JSON or an API response, get TypeScript types or Zod schemas. Runs fully in your browser, nothing is uploaded.

**Live:** https://mostaaafaomran-ctrl.github.io/jsonshape/

- Interfaces or type aliases, or Zod schemas with inferred types
- Nested objects become named types, arrays of objects are merged
- Fields missing in some array items become optional (`?` / `.optional()`)
- Mixed values become unions, `null` is kept
- Core is one dependency-free file (`core.js`), usable in Node: `require('./core.js').generate(json, {name:'User', format:'zod'})`

## Example

```json
{"id":1,"email":null,"orders":[{"id":1,"paid":true},{"id":2,"coupon":"X1"}]}
```

```ts
export interface Order { id: number; paid?: boolean; coupon?: string; }
export interface Root { id: number; email: null; orders: Order[]; }
```

## الاستخدام بالعربي

الصق أي JSON وهتطلع لك أنواع TypeScript أو مخططات Zod فورًا، من غير رفع أي حاجة لأي سيرفر.

MIT
