# Employee Management & Auth API Contract

## Authentication APIs

### POST /api/auth/login
Login with optional device fingerprint.

**Request:**
```json
{
  "name": "Admin",
  "password": "root123",
  "device": {
    "fingerprint": "fp_admin_001",
    "name": "Chrome - Windows",
    "userAgent": "Mozilla/5.0"
  }
}
```

**Response (auto-approved employee/device or existing device):**
```json
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "data": {
    "employee": {
      "id": 4,
      "name": "Admin",
      "username": "Admin",
      "image": null
    },
    "role": {
      "id": 1,
      "name": "Owner",
      "display_name": "المالك"
    },
    "permissions": [
      {
        "page_name": "المبيعات",
        "page_key": "sales",
        "icon": "receipt",
        "path": "/sales",
        "actions": ["view", "create", "update"]
      }
    ],
    "notifications": [],
    "shift": null,
    "auth": {
      "access_token": "eyJ...",
      "refresh_token": "eyJ...",
      "token_type": "Bearer",
      "expires_in": 3600,
      "refresh_expires_in": 604800
    }
  }
}
```

**Response (new employee device → pending approval):**
```json
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "data": {
    "pendingDeviceApproval": true,
    "device": {
      "id": 12,
      "status": "PENDING",
      "fingerprint": "fp_devtest_001"
    },
    "employee": { ... },
    "auth": { ... }
  }
}
```

**Response (blocked device → 403):**
```json
{
  "success": false,
  "message": "جهازك محظور",
  "code": "DEVICE_BLOCKED"
}
```

**Status codes:**
- 200: Success
- 400: Missing name/password
- 401: Wrong password
- 403: Device blocked

---

### GET /api/auth/me
Get current user profile.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "employee": {
      "id": 4,
      "name": "Admin",
      "username": "Admin",
      "image": null
    },
    "role": {
      "id": 1,
      "name": "Owner",
      "display_name": "المالك"
    },
    "permissions": [ ... ],
    "notifications": [],
    "shift": null,
    "device": {
      "id": 5,
      "status": "APPROVED"
    }
  }
}
```

---

### POST /api/auth/refresh
Refresh access token.

**Request:**
```json
{
  "refreshToken": "eyJ..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_expires_in": 604800
  }
}
```

**Error code:** `SESSION_EXPIRED` (invalid/expired refresh token)

---

### POST /api/auth/logout
Logout (invalidate current session).

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "تم تسجيل الخروج بنجاح"
}
```

---

### POST /api/auth/logout-all
Logout from all devices.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "تم تسجيل الخروج من جميع الأجهزة بنجاح"
}
```

---

## Employee Management APIs

### GET /api/users
List employees (paginated).

**Headers:** `Authorization: Bearer <token>`

**Query params:** `page`, `pageSize`, `search`, `role`, `status`, `sortBy`, `sortOrder`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 4,
      "name": "Admin",
      "username": "Admin",
      "image": null,
      "position": "owner",
      "workStart": "08:00",
      "workEnd": "16:00",
      "role": {
        "id": 1,
        "name": "Owner",
        "display_name": "المالك"
      },
      "status": "ACTIVE",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 100,
    "total": 4,
    "totalPages": 1
  }
}
```

---

### POST /api/users
Create employee.

**Request:**
```json
{
  "name": "New Employee",
  "username": "newemp",
  "password": "123456",
  "position": "cashier",
  "workStart": "08:00",
  "workEnd": "16:00",
  "role": "CASHIER"
}
```

**Response (201):** Same as single employee object.

---

### GET /api/users/:id
Get employee detail with audit logs, attendance, page access.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "name": "TestEmp",
    "workStart": "08:00",
    "workEnd": "16:00",
    "role": { ... },
    "pageAccess": [
      {
        "pageKey": "inventory",
        "visible": true
      }
    ],
    "attendanceRecords": [],
    "auditLogs": []
  }
}
```

---

### PUT /api/users/:id
Update employee.

**Request:** Same fields as create (all optional).

**Response:** Same as single employee object with `updatedAt`.

---

### PUT /api/users/:id/page-access
Update employee page access.

**Request:**
```json
{
  "pages": [
    { "pageKey": "inventory", "visible": true },
    { "pageKey": "employees", "visible": false }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": 5,
    "pages": [
      { "pageKey": "inventory", "visible": true },
      { "pageKey": "employees", "visible": false }
    ]
  }
}
```

---

### DELETE /api/users/:id
Delete employee.

**Response:**
```json
{
  "success": true,
  "message": "تم حذف الموظف بنجاح"
}
```

---

## Device Management APIs

### GET /api/employees/:id/devices
List employee devices.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 8,
      "fingerprint": "fp_devtest_001",
      "name": "Firefox - Linux",
      "userAgent": "Mozilla/5.0",
      "employeeId": 5,
      "status": "APPROVED",
      "lastLoginAt": "2025-01-01T00:00:00.000Z",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### PUT /api/employees/:id/devices/:deviceId/approve
Approve a pending device.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 8,
    "status": "APPROVED",
    ...
  }
}
```

---

### PUT /api/employees/:id/devices/:deviceId/reject
Reject a pending device.

**Response:** Same structure with `status: "REJECTED"`.

---

### PUT /api/employees/:id/devices/:deviceId/block
Block an approved device.

**Response:** Same structure with `status: "BLOCKED"`.
