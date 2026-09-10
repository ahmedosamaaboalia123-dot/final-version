/**
 * modules/users/user.controller.js
 * ================================
 * Users Controller (RBAC)
 * - Users CRUD مع الدور (role) بدل الصلاحيات التفصيلية
 * - حمايات مالكية: مينفعش تحذف/تعلق آخر Owner، ومينفعش تعدل دورك لنفسك
 */

const bcrypt = require("bcryptjs");

const prisma = require("../../lib/prisma");
const { logAudit } = require("../../utils/audit");
const { parsePagination } = require("../../utils/pagination");
const {
  isValidRole,
  getExpandedPermissions,
} = require("../../config/roles.config");

const USER_SELECT = {
  id: true,
  name: true,
  position: true,
  role: true,
  status: true,
  workStartTime: true,
  workEndTime: true,
  createdAt: true,
  updatedAt: true,
};

const mapUser = (u) => ({
  id: u.id,
  name: u.name,
  position: u.position,
  workStart: u.workStartTime || null,
  workEnd: u.workEndTime || null,
  status: u.status,
  role: typeof u.role === "object" ? u.role : { name: u.role },
});

const getOwnerCount = () =>
  prisma.user.count({ where: { role: "OWNER" } });

const isOwner = (req) => req.user?.role === "OWNER";

const requireOwnerOr = (req, res, next) => {
  if (!isOwner(req)) {
    const error = new Error("Only the Owner can perform this action");
    error.statusCode = 403;
    throw error;
  }
};

// =========================================================
// GET ALL USERS
// =========================================================
const getUsers = async (req, res, next) => {
  try {
    const { page, pageSize, skip, take } = parsePagination(req.query);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: USER_SELECT,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.user.count(),
    ]);

    res.status(200).json({
      success: true,
      data: users.map(mapUser),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// CREATE USER
// =========================================================
const createUser = async (req, res, next) => {
  try {
    const { name, password, position, role = "CASHIER", workStart, workEnd } = req.body;

    if (!name || !password || !position) {
      const error = new Error("Name, password and position are required");
      error.statusCode = 400;
      throw error;
    }

    if (password.length < 6) {
      const error = new Error("Password must be at least 6 characters");
      error.statusCode = 400;
      throw error;
    }

    if (!isValidRole(role)) {
      const error = new Error(`Invalid role. Valid roles: OWNER, MANAGER, CASHIER, DELEGATE`);
      error.statusCode = 400;
      throw error;
    }

    if (role === "OWNER" && !isOwner(req)) {
      const error = new Error("Only the Owner can create an OWNER account");
      error.statusCode = 403;
      throw error;
    }

    const existingUser = await prisma.user.findFirst({ where: { name } });

    if (existingUser) {
      const error = new Error("User already exists");
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        passwordHash,
        position,
        role,
        ...(workStart !== undefined && { workStartTime: workStart }),
        ...(workEnd !== undefined && { workEndTime: workEnd }),
      },
      select: USER_SELECT,
    });

    await logAudit(req, "users", "create_user", `Created user ${user.name} (${role})`);

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        ...mapUser(user),
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// UPDATE USER
// =========================================================
const updateUser = async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const { name, password, position, role, workStart, workEnd } = req.body;

    if (!Number.isInteger(userId) || userId <= 0) {
      const error = new Error("Invalid user ID");
      error.statusCode = 400;
      throw error;
    }

    const existingUser = await prisma.user.findUnique({ where: { id: userId } });

    if (!existingUser) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    const updateData = {};

    if (name !== undefined) {
      if (!name.trim()) {
        const error = new Error("Name cannot be empty");
        error.statusCode = 400;
        throw error;
      }

      const duplicate = await prisma.user.findFirst({
        where: { name, NOT: { id: userId } },
      });

      if (duplicate) {
        const error = new Error("User already exists");
        error.statusCode = 409;
        throw error;
      }

      updateData.name = name;
    }

    if (position !== undefined) {
      updateData.position = position;
    }

    if (password !== undefined && password !== "") {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    if (role !== undefined) {
      if (!isValidRole(role)) {
        const error = new Error(`Invalid role. Valid roles: OWNER, MANAGER, CASHIER, DELEGATE`);
        error.statusCode = 400;
        throw error;
      }

      if (req.user.userId === userId) {
        const error = new Error("You cannot change your own role");
        error.statusCode = 400;
        throw error;
      }

      if (existingUser.role === "OWNER" || role === "OWNER") {
        requireOwnerOr(req, res, next);

        if (existingUser.role === "OWNER" && (await getOwnerCount()) <= 1) {
          const error = new Error("Cannot demote the last Owner");
          error.statusCode = 400;
          throw error;
        }
      }

      updateData.role = role;
    }

    if (workStart !== undefined) updateData.workStartTime = workStart || null;
    if (workEnd !== undefined) updateData.workEndTime = workEnd || null;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_SELECT,
    });

    await logAudit(req, "users", "edit_user", `Updated user #${req.params.id}`);

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: {
        ...mapUser(user),
        updatedAt: user.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// UPDATE USER STATUS
// =========================================================
const updateUserStatus = async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(userId) || userId <= 0) {
      const error = new Error("Invalid user ID");
      error.statusCode = 400;
      throw error;
    }

    if (!["ACTIVE", "SUSPENDED"].includes(status)) {
      const error = new Error("Status must be ACTIVE or SUSPENDED");
      error.statusCode = 400;
      throw error;
    }

    if (req.user.userId === userId) {
      const error = new Error("You cannot change your own status");
      error.statusCode = 400;
      throw error;
    }

    const existingUser = await prisma.user.findUnique({ where: { id: userId } });

    if (!existingUser) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    if (existingUser.role === "OWNER" && !isOwner(req)) {
      const error = new Error("Only the Owner can change an OWNER account status");
      error.statusCode = 403;
      throw error;
    }

    if (existingUser.role === "OWNER" && status === "SUSPENDED" && (await getOwnerCount()) <= 1) {
      const error = new Error("Cannot suspend the last Owner");
      error.statusCode = 400;
      throw error;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status },
      select: USER_SELECT,
    });

    await logAudit(req, "users", "change_user_status", `Changed user #${req.params.id} status to ${status}`);

    res.status(200).json({
      success: true,
      message: `User status updated to ${status}`,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET USER EFFECTIVE PERMISSIONS
// =========================================================
const getUserPermissions = async (req, res, next) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      const error = new Error("Invalid user ID");
      error.statusCode = 400;
      throw error;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });

    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      data: {
        user: mapUser(user),
        permissions: getExpandedPermissions(user.role),
      },
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// DELETE USER
// =========================================================
const deleteUser = async (req, res, next) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      const error = new Error("Invalid user ID");
      error.statusCode = 400;
      throw error;
    }

    if (req.user.userId === userId) {
      const error = new Error("You cannot delete your own account");
      error.statusCode = 400;
      throw error;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });

    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    if (user.role === "OWNER") {
      if (!isOwner(req)) {
        const error = new Error("Only the Owner can delete an OWNER account");
        error.statusCode = 403;
        throw error;
      }

      if ((await getOwnerCount()) <= 1) {
        const error = new Error("Cannot delete the last Owner");
        error.statusCode = 400;
        throw error;
      }
    }

    await prisma.user.delete({ where: { id: userId } });

    await logAudit(req, "users", "delete_user", `Deleted user #${req.params.id}`);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET USER BY ID
// =========================================================
const getUserById = async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) { const error = new Error("Invalid user ID"); error.statusCode = 400; throw error; }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    if (!user) { const error = new Error("User not found"); error.statusCode = 404; throw error; }

    const [attendanceRecords, pageAccessRecord, auditLogs] = await Promise.all([
      prisma.attendance.findMany({
        where: { userId },
        select: {
          id: true,
          checkInAt: true,
          checkOutAt: true,
          lateMinutes: true,
          status: true,
        },
        orderBy: { checkInAt: "desc" },
      }),
      prisma.userPageAccess.findUnique({ where: { userId } }),
      prisma.auditLog.findMany({
        where: { userId },
        select: {
          id: true,
          page: true,
          action: true,
          description: true,
          ipAddress: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    const mappedAttendance = attendanceRecords.map((r) => ({
      id: r.id,
      checkInAt: r.checkInAt ? r.checkInAt.toISOString() : null,
      checkOutAt: r.checkOutAt ? r.checkOutAt.toISOString() : null,
      lateMinutes: r.lateMinutes,
      status: r.status,
    }));

    const mappedAuditLogs = auditLogs.map((l) => ({
      id: l.id,
      page: l.page,
      action: l.action,
      description: l.description,
      ipAddress: l.ipAddress,
      createdAt: l.createdAt.toISOString(),
    }));

    res.status(200).json({
      success: true,
      data: {
        ...mapUser(user),
        pageAccess: pageAccessRecord ? pageAccessRecord.pages : [],
        attendanceRecords: mappedAttendance,
        auditLogs: mappedAuditLogs,
      },
    });
  } catch (error) { next(error); }
};

// =========================================================
// UPDATE USER PAGE ACCESS
// =========================================================
const updateUserPageAccess = async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) { const error = new Error("Invalid user ID"); error.statusCode = 400; throw error; }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) { const error = new Error("User not found"); error.statusCode = 404; throw error; }
    const { pages } = req.body;
    if (!Array.isArray(pages)) { const error = new Error("pages must be an array"); error.statusCode = 400; throw error; }

    await prisma.userPageAccess.upsert({
      where: { userId },
      update: { pages },
      create: { userId, pages },
    });

    await logAudit(req, "users", "edit_user", `Updated page access for user #${userId}`);
    res.status(200).json({ success: true, data: { userId, pages } });
  } catch (error) { next(error); }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  getUserPermissions,
  deleteUser,
  getUserById,
  updateUserPageAccess,
};
