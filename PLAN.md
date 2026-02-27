# Wazeer - Recycling Plant Management System

## Stack
- **Frontend**: React + Vite → `/frontend`
- **Backend**: Express.js + MongoDB (Mongoose) → `/backend`

## Folder Structure
```
wazeer/
├── PLAN.md
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── api/index.js
│       ├── context/AuthContext.jsx
│       └── components/
│           ├── Login.jsx
│           ├── Layout.jsx
│           ├── Buy/BuyTab.jsx
│           ├── Items/ItemsTab.jsx
│           ├── Suppliers/SuppliersTab.jsx
│           └── Expenses/ExpensesTab.jsx
└── backend/
    ├── package.json
    ├── .env
    ├── server.js
    ├── middleware/auth.js
    ├── models/
    │   ├── Material.js
    │   ├── Supplier.js
    │   ├── Transaction.js
    │   ├── Expense.js
    │   └── Tag.js
    └── routes/
        ├── auth.js
        ├── materials.js
        ├── suppliers.js
        ├── transactions.js
        ├── expenses.js
        └── tags.js
```

## Users (Hardcoded)
| Role         | Username   | Password | Permissions                  |
|--------------|------------|----------|------------------------------|
| Super Admin  | superadmin | admin123 | Add, Edit, Delete everything |
| Normal Admin | admin      | admin123 | Add records only, no delete  |

## Data Models

### Material
- name (string, unique)
- pricePerKg (number)
- unit (string, default: "kg")

### Supplier
- name (string)
- phone (string)

### Transaction
- items: [{ material ref, materialName, weight, pricePerKg, totalPrice }]
- supplier (optional ref)
- supplierName (optional)
- grandTotal
- createdBy

### Expense
- description (optional)
- amount (required)
- tags (array of Tag refs)
- createdBy

### Tag
- name (string, unique)
- color (string)

## API Endpoints
```
POST   /api/auth/login

GET    /api/materials
POST   /api/materials
PUT    /api/materials/:id
DELETE /api/materials/:id       (super_admin only)

GET    /api/suppliers
POST   /api/suppliers
PUT    /api/suppliers/:id
DELETE /api/suppliers/:id       (super_admin only)

GET    /api/transactions
POST   /api/transactions

GET    /api/expenses
POST   /api/expenses
DELETE /api/expenses/:id        (super_admin only)

GET    /api/tags
POST   /api/tags
DELETE /api/tags/:id            (super_admin only)
```

## UI Structure
- **Login page** — username/password
- **Main layout** — header + tab navigation
  - **Buy tab** — Materials grid, click to add weight → cart, optional supplier, complete transaction
  - **Items tab** — Table of materials, add/edit/delete form
  - **Suppliers tab** — Table of suppliers, add/delete
  - **Expenses tab** — Table of expenses, add with tags, delete

## To Run
```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```
