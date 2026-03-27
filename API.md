# RentFlow REST API (CRUD)

Base URL (local): `http://localhost:4000`

## Auth
| Method | Path | Body | Description |
|--------|------|------|---------------|
| POST | `/api/login` | `{ username, password }` | Demo admin login |

## Rooms
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rooms` | List all rooms |
| GET | `/api/rooms/:id` | Get one room |
| POST | `/api/rooms` | Create `{ number, capacity, occupancy, rent }` |
| PUT | `/api/rooms/:id` | Update (partial fields OK) |
| DELETE | `/api/rooms/:id` | Delete (blocked if tenants assigned) |

## Tenants
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tenants` | List all tenants |
| GET | `/api/tenants/:id` | Get one tenant |
| POST | `/api/tenants` | Create `{ name, phone, roomId, joinDate, rent }` |
| PUT | `/api/tenants/:id` | Update |
| DELETE | `/api/tenants/:id` | Delete (removes tenant payments) |

## Payments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/payments` | List all payments |
| GET | `/api/payments/:id` | Get one payment |
| POST | `/api/payments` | Create `{ tenantId, amount, date, method, status? }` — `status`: `Paid` \| `Pending` \| `Late` (default `Paid`); optional `nextDue` |
| PUT | `/api/payments/:id` | Update same fields |
| DELETE | `/api/payments/:id` | Delete |

## Stats
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats` | Aggregates for dashboard |
