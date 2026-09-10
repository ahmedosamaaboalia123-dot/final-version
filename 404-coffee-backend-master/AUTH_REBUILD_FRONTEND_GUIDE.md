# Auth Rebuild — Frontend Integration Guide

## Overview

The authentication system was rebuilt in 6 phases. This guide covers everything the frontend needs to know to work with the new auth system.

---

## 1. Token Payload Shape

### Access Token (JWT)

```json
{
  "sub": 1,
  "employeeId": 1,
  "roleId": "OWNER",
  "sessionId": "f212999e-61d5-48d3-bc70-d0e8c4cb9e7a",
  "deviceId": 3,
  "type": "access",
  "iat": 1788829365,
  "exp": 1788915765
}
```

### Refresh Token (JWT)

```json
{
  "sub": 1,
  "sessionId": "f212999e-61d5-48d3-bc70-d0e8c4cb9e7a",
  "deviceId": 3,
  "type": "refresh",
  "jti": "a32ddfe5-006e-4fef-99d8-67dd207024b4",
  "iat": 1788829365,
  "exp": 1788915765
}
```

### What the Frontend Can Read

- `sub` / `employeeId` — the user's ID
- `roleId` — the user's role string
- `type` — `"access"` or `"refresh"`
- `exp` — token expiry (Unix timestamp)

### What the Frontend Should NOT Parse

- `sessionId` — internal session tracking, not for client use
- `deviceId` — internal device tracking
- `jti` — internal unique token identifier
- Do NOT base authorization decisions on client-side token parsing. Always let the backend verify.

---

## 2. Token Expiry

Both access and refresh tokens expire in **24 hours** (`86400s`).

### Implications

- A logged-in user stays logged in for 24 hours without re-authentication.
- After 24 hours, both tokens expire and the user must log in again.
- **CRITICAL**: Tokens can become invalid BEFORE natural expiry (see Section 5).

---

## 3. Login Response Shape

### Standard Login Response

```json
{
  "success": true,
  "message": "تم تسجيل الدخول بنجاح",
  "data": {
    "employee": {
      "id": 1,
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
    "auth": {
      "access_token": "eyJ...",
      "refresh_token": "eyJ...",
      "token_type": "Bearer",
      "expires_in": 86400,
      "refresh_expires_in": 86400
    }
  }
}
```

### Pending Device Approval Response (non-admin, new device)

```json
{
  "success": true,
  "message": "الجهاز في انتظار موافقة المدير",
  "data": {
    "pendingDeviceApproval": true,
    "device": {
      "id": 5,
      "name": "My Phone",
      "status": "PENDING",
      "createdAt": "2026-09-08T01:00:00.000Z"
    }
  }
}
```

**Note**: There are NO tokens in this response. The user cannot proceed until the device is approved.

### Frontend Flow for Pending Approval

1. User logs in with credentials.
2. If `pendingDeviceApproval === true`:
   - Show a "Waiting for Approval" screen.
   - Display the device name.
   - Poll or periodically retry login (same credentials + same device fingerprint).
   - Once approved, the next login attempt returns the standard response with tokens.
3. If `code === "DEVICE_BLOCKED"` (403):
   - Show a "Device Blocked" message.
   - User must contact an administrator.

---

## 4. Error Codes

### `SESSION_EXPIRED` (HTTP 401)

```json
{
  "success": false,
  "message": "انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى",
  "code": "SESSION_EXPIRED"
}
```

**Causes**:
- Access token or refresh token naturally expired (24h).
- Session was revoked via logout.
- Session was revoked via logout-all.
- Refresh token was reused after rotation (theft detection).

**Frontend action**: Clear tokens, redirect to login screen.

### `DEVICE_BLOCKED` (HTTP 403)

```json
{
  "success": false,
  "message": "هذا الجهاز غير مصرح له بتسجيل الدخول",
  "code": "DEVICE_BLOCKED"
}
```

**Causes**:
- The device was blocked by an admin while the user was logged in.
- The device was blocked before login.

**Frontend action**: Show a "Device Blocked" message. Clear tokens, redirect to login. User must contact admin.

---

## 5. CRITICAL: Tokens Can Become Invalid Before Expiry

Access tokens are now checked against the session database on **every request**. This means a token can be rejected even if it hasn't naturally expired.

### When This Happens

| Event | Effect |
|-------|--------|
| User clicks "Logout" | Session is revoked. Access token fails immediately. |
| User clicks "Logout from All Devices" | ALL sessions revoked. All tokens fail immediately. |
| Admin blocks a device | Non-admin tokens linked to that device fail immediately. |
| Admin suspends a user account | All tokens for that user fail immediately. |
| Refresh token reuse detected | Session is revoked as security precaution. |

### What the Frontend Must Do

**Do NOT rely on a token-expiry timer alone.**

Every HTTP request interceptor must handle 401/403 responses:

```javascript
// Axios interceptor example
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const code = error.response?.data?.code;
      if (code === 'SESSION_EXPIRED') {
        // Session revoked or expired → force re-login
        clearAuthState();
        router.push('/login');
      }
    }
    if (error.response?.status === 403) {
      const code = error.response?.data?.code;
      if (code === 'DEVICE_BLOCKED') {
        // Device was blocked → show message, force re-login
        clearAuthState();
        showToast('هذا الجهاز غير مصرح له بالوصول');
        router.push('/login');
      }
    }
    return Promise.reject(error);
  }
);
```

---

## 6. FingerprintJS Integration

The `device` object sent during login requires a **device fingerprint** generated by FingerprintJS.

### Setup

```bash
npm install @fingerprintjs/fingerprintjs
```

### Usage

```javascript
import FingerprintJS from '@fingerprintjs/fingerprintjs';

// Initialize once at app startup
const fp = await FingerprintJS.load();
const result = await fp.get();
const deviceId = result.visitorId; // Stable device identifier

// Send during login
const loginPayload = {
  name: username,
  password: password,
  device: {
    fingerprint: deviceId,
    name: `${navigator.platform} - ${navigator.userAgent.slice(0, 50)}`,
  },
};
```

### Important Notes

- `device.fingerprint` is the stable visitor ID from FingerprintJS.
- `device.name` is a human-readable label shown in device management.
- The `device` object is **optional** for OWNER and MANAGER roles (auto-approved).
- The `device` object is **required** for CASHIER and DELEGATE roles (requires approval flow).
- If the same fingerprint logs in again, the existing device record is reused.

---

## 7. Logout Implementation

### Single Logout

```javascript
const logout = async () => {
  await api.post('/api/auth/logout', {
    refreshToken: getRefreshToken(), // from secure storage
  });
  clearAuthState(); // clear tokens from storage
  router.push('/login');
};
```

**Effect**: Only the current session is revoked. Other devices/sessions remain active.

### Logout from All Devices

```javascript
const logoutAll = async () => {
  await api.post('/api/auth/logout-all');
  clearAuthState();
  router.push('/login');
};
```

**Effect**: ALL sessions for this user across all devices are revoked. Every device will be forced to re-login.

### Recommendation

Add a "Log out from all devices" option in the Settings/Profile page. This is especially useful if:
- A user suspects their account was compromised.
- An admin wants to force re-authentication across all sessions.

---

## 8. Refresh Token Handling

### Storage

Store tokens securely:
- `access_token` — in memory or a short-lived cookie.
- `refresh_token` — in `httpOnly` cookie or secure storage (e.g., `react-native-keychain`).

### Refresh Flow

```javascript
// When a 401 is received:
const refreshToken = getRefreshToken(); // from secure storage
const res = await api.post('/api/auth/refresh', { refreshToken });
// New tokens returned → update storage, retry original request
```

### Refresh Token Rotation

Every call to `/auth/refresh` returns **new** access and refresh tokens. The old refresh token becomes invalid immediately.

- Store the new refresh token immediately after receiving it.
- If you call `/auth/refresh` twice with the same token, the second call will fail with `SESSION_EXPIRED` (reuse detection).

---

## 9. Response Codes Summary

| HTTP Status | Code | Meaning | Frontend Action |
|-------------|------|---------|-----------------|
| 400 | (none) | Missing/invalid request body | Show validation error |
| 401 | `SESSION_EXPIRED` | Session revoked or token expired | Redirect to login |
| 401 | (none) | Invalid token / expired JWT | Redirect to login |
| 403 | `DEVICE_BLOCKED` | Device blocked by admin | Show blocked message, redirect to login |
| 403 | (none) | Role-based access denied | Show "no permission" message |
