/**
 * middleware/permission.middleware.js
 * ===================================
 * صلاحية واحدة لكل الـ endpoints:
 * requirePermission(page, action?)
 *   → بتتأكد إن دور المستخدم (role) عنده صلاحية الوصول للصفحة،
 *     ولو action اتحددت بتتأكد منها كمان.
 *   → مرشح إزالتين: auth middleware الأول (بيحط req.user.role) وبعدين الـ middleware ده.
 */

const { can } = require("../config/roles.config");

const requirePermission = (page, action) => {
  return (req, res, next) => {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!can(req.user.role, page, action)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
};

module.exports = {
  requirePermission,
};